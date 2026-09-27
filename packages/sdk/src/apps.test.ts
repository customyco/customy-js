import { CustomySdkError } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { createConnectedApp, createCustomy, deterministicUuid, EVENTS_URLS, type ConnectedAppOptions } from "./index";

const INGEST_KEY = "k".repeat(40);
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AT = new Date("2026-09-28T12:00:00.000Z");

type Call = { url: string; headers: Headers; body: Record<string, any> };

function events(respond?: (call: Call, attempt: number) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const call: Call = { url: String(input), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
        calls.push(call);
        if (respond) return respond(call, calls.length);
        return Response.json({ accepted: true, deduplicated: false, eventId: call.body.eventId, idempotencyKey: call.body.idempotencyKey, channel: "customy:events:applications" }, { status: 202 });
    }) as typeof fetch;
    return { calls, fetchImpl };
}

const config = (fetchImpl: typeof fetch, extra: Partial<ConnectedAppOptions> = {}): ConnectedAppOptions => ({
    applicationKey: "bonu", ingestKey: INGEST_KEY, organizationId: "org_1", projectId: "prj_1", environment: "staging", accessEnvironmentId: "env_1",
    fetch: fetchImpl, now: () => AT, retry: { baseDelayMs: 1, maxDelayMs: 2 }, ...extra,
});

describe("customy.apps (Connected Application → Events)", () => {
    it("userRegistered envía el sobre exacto con la llave de ingesta a la URL del entorno", async () => {
        const { calls, fetchImpl } = events();
        const app = createConnectedApp(config(fetchImpl));
        const receipt = await app.userRegistered({ userId: USER, identity: { email: "ana@example.com", emailVerified: true, displayName: "Ana" } });
        const call = calls[0]!;
        expect(call.url).toBe(`${EVENTS_URLS.staging}/v1/events/ingest`);
        expect(call.headers.get("x-internal-key")).toBe(INGEST_KEY);
        expect(call.headers.get("authorization")).toBeNull();
        expect(call.headers.get("idempotency-key")).toBe(`bonu:user:registered:${USER}`);
        expect(Object.keys(call.body).sort()).toEqual(["environment", "eventId", "idempotencyKey", "occurredAt", "organizationId", "partitionKey", "payload", "projectId", "source", "tenantId", "type", "version"]);
        expect(call.body).toEqual({
            type: "application.user.registered",
            version: "v1",
            source: "bonu",
            tenantId: "org_1:prj_1:staging",
            organizationId: "org_1",
            projectId: "prj_1",
            environment: "staging",
            partitionKey: USER,
            eventId: expect.stringMatching(UUID),
            idempotencyKey: `bonu:user:registered:${USER}`,
            occurredAt: AT.toISOString(),
            payload: { schemaVersion: 1, applicationKey: "bonu", applicationUserId: USER, accessEnvironmentId: "env_1", identity: { email: "ana@example.com", emailVerified: true, displayName: "Ana" } },
        });
        expect(receipt).toMatchObject({ accepted: true, idempotencyKey: `bonu:user:registered:${USER}` });
    });

    it("las claves de idempotencia y el eventId son deterministas por operación", async () => {
        const { calls, fetchImpl } = events();
        const app = createConnectedApp(config(fetchImpl, { environment: "production" }));
        await app.userRegistered({ userId: USER });
        await app.userRegistered({ userId: USER, occurredAt: "2026-09-29T00:00:00Z" });
        await app.activity({ userId: USER, kind: "expense_logged", resourceId: "exp_1" });
        await app.activity({ userId: USER, kind: "signed_in" });
        await app.identityUpdated({ userId: USER, identity: { phone: "+573001234567" } });
        await app.deleted({ userId: USER, erasure: true });
        await app.activity({ userId: USER, kind: "fund_created", idempotencyKey: "fund:fnd_9" });
        expect(calls[0]!.url).toBe(`${EVENTS_URLS.production}/v1/events/ingest`);
        expect(calls.map((call) => call.body.idempotencyKey)).toEqual([
            `bonu:user:registered:${USER}`,
            `bonu:user:registered:${USER}`,
            `bonu:expense_logged:exp_1:${USER}`,
            `bonu:activity:signed_in:${USER}:${AT.toISOString()}`,
            `bonu:user:identity_updated:${USER}:${AT.toISOString()}`,
            `bonu:user:deleted:${USER}`,
            "bonu:fund:fnd_9",
        ]);
        // Mismo alta → mismo eventId (Events deduplica aunque el reintento venga de otro proceso).
        expect(calls[0]!.body.eventId).toBe(calls[1]!.body.eventId);
        expect(calls[0]!.body.eventId).toBe(await deterministicUuid(`application.user.registered\nbonu:user:registered:${USER}`));
        expect(new Set(calls.map((call) => call.body.eventId)).size).toBe(6);
        expect(calls[2]!.body.payload).toEqual({ schemaVersion: 1, applicationKey: "bonu", applicationUserId: USER, accessEnvironmentId: "env_1", kind: "expense_logged" });
        expect(calls[5]!.body).toMatchObject({ type: "application.user.deleted", payload: { erasure: true } });
        expect(calls[4]!.body).toMatchObject({ type: "application.user.identity_updated", payload: { identity: { phone: "+573001234567" } } });
        expect(calls.every((call) => call.body.tenantId === "org_1:prj_1:production" && call.body.environment === "production")).toBe(true);
    });

    it("reintenta 5xx y fallos de red con la misma clave; no reintenta 4xx", async () => {
        const flaky = events((call, attempt) => {
            if (attempt === 1) return Response.json({ code: "INTERNAL_ERROR" }, { status: 500 });
            if (attempt === 2) throw new TypeError("fetch failed");
            return Response.json({ accepted: true, deduplicated: false, eventId: call.body.eventId, idempotencyKey: call.body.idempotencyKey });
        });
        const receipt = await createConnectedApp(config(flaky.fetchImpl)).activity({ userId: USER, kind: "debt_settled", resourceId: "dbt_1" });
        expect(receipt.accepted).toBe(true);
        expect(flaky.calls).toHaveLength(3);
        expect(new Set(flaky.calls.map((call) => call.body.eventId)).size).toBe(1);
        expect(new Set(flaky.calls.map((call) => call.headers.get("idempotency-key"))).size).toBe(1);

        const rejected = events(() => Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 }));
        await expect(createConnectedApp(config(rejected.fetchImpl)).userRegistered({ userId: USER })).rejects.toMatchObject({ status: 400, service: "events" });
        expect(rejected.calls).toHaveLength(1);

        const unauthorized = events(() => Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 }));
        await expect(createConnectedApp(config(unauthorized.fetchImpl)).userRegistered({ userId: USER })).rejects.toMatchObject({ status: 401 });
        expect(unauthorized.calls).toHaveLength(1);
    });

    it("un acuse con otra clave es SDK_ACKNOWLEDGEMENT_INVALID", async () => {
        const { fetchImpl } = events(() => Response.json({ accepted: true, deduplicated: false, eventId: "x", idempotencyKey: "other" }));
        await expect(createConnectedApp(config(fetchImpl)).userRegistered({ userId: USER })).rejects.toMatchObject({ code: "SDK_ACKNOWLEDGEMENT_INVALID" });
    });

    it("valida configuración y entradas contra el contrato antes de enviar", async () => {
        const { calls, fetchImpl } = events();
        expect(() => createConnectedApp(config(fetchImpl, { applicationKey: "Bonu" }))).toThrow(expect.objectContaining({ code: "SDK_INPUT_INVALID" }));
        expect(() => createConnectedApp(config(fetchImpl, { ingestKey: "short" }))).toThrow(expect.objectContaining({ code: "SDK_INPUT_INVALID" }));
        // @ts-expect-error: entorno fuera del contrato
        expect(() => createConnectedApp(config(fetchImpl, { environment: "development" }))).toThrow(expect.objectContaining({ code: "SDK_INPUT_INVALID" }));
        const app = createConnectedApp(config(fetchImpl));
        await expect(app.userRegistered({ userId: "ana@example.com" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(app.activity({ userId: USER, kind: "Expense Logged" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(app.identityUpdated({ userId: USER, identity: { email: "not-an-email" } })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID", service: "events" });
        // @ts-expect-error: campo fuera del bloque de identidad (estricto)
        await expect(app.userRegistered({ userId: USER, identity: { marketingOptIn: true } })).rejects.toBeInstanceOf(CustomySdkError);
        // @ts-expect-error: erasure es obligatorio
        await expect(app.deleted({ userId: USER })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(app.activity({ userId: USER, kind: "x", occurredAt: "not a date" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        expect(calls).toHaveLength(0);
    });

    it("batch envía en orden con concurrencia limitada y devuelve un resultado por evento", async () => {
        const { calls, fetchImpl } = events((call) =>
            call.body.type === "application.user.deleted"
                ? Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 })
                : Response.json({ accepted: true, deduplicated: false, eventId: call.body.eventId, idempotencyKey: call.body.idempotencyKey }));
        const app = createConnectedApp(config(fetchImpl));
        const results = await app.batch([
            { type: "registered", input: { userId: USER } },
            { type: "activity", input: { userId: USER, kind: "group_created", resourceId: "grp_1" } },
            { type: "activity", input: { userId: USER, kind: "BAD" } },
            { type: "deleted", input: { userId: USER, erasure: false } },
        ], { concurrency: 2 });
        expect(results.map((result) => result.ok)).toEqual([true, true, false, false]);
        expect(results[2]).toMatchObject({ ok: false, error: { code: "SDK_INPUT_INVALID" } });
        expect(results[3]).toMatchObject({ ok: false, error: { status: 400 } });
        expect(calls).toHaveLength(3);
    });

    it("envelopes construye sin enviar y send envía un sobre ya construido (outbox propio)", async () => {
        const { calls, fetchImpl } = events();
        const app = createConnectedApp(config(fetchImpl));
        const envelope = await app.envelopes.activity({ userId: USER, kind: "reminder_created", resourceId: "rem_1" });
        expect(calls).toHaveLength(0);
        await app.send(envelope);
        expect(calls[0]!.body).toEqual(envelope);
    });

    it("customy.apps usa la configuración de createCustomy y falla si no se configuró", async () => {
        const { calls, fetchImpl } = events();
        const platformConfig = { issuer: "https://access.fixture.invalid", jwksUri: "https://access.fixture.invalid/jwks", tokenEndpoint: "https://access.fixture.invalid/oauth/token", grantTypesSupported: ["client_credentials"], products: {} };
        const base = { issuer: "https://access.fixture.invalid", clientId: "app_1", clientSecret: "s3cret", platform: platformConfig, fetch: fetchImpl, retry: false as const };
        const customy = await createCustomy({ ...base, apps: { applicationKey: "bonu", ingestKey: INGEST_KEY, organizationId: "org_1", projectId: "prj_1", environment: "staging", accessEnvironmentId: "env_1", eventsUrl: "https://events.fixture.invalid", now: () => AT } });
        await customy.apps.userRegistered({ userId: USER });
        expect(calls[0]!.url).toBe("https://events.fixture.invalid/v1/events/ingest");
        expect(customy.apps).toBe(customy.apps);
        const bare = await createCustomy(base);
        expect(() => bare.apps).toThrow(expect.objectContaining({ code: "SDK_APPS_NOT_CONFIGURED" }));
    });
});
