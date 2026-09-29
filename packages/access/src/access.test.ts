import { createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createFlagsClient, type CustomyFlagsSnapshot } from "./flags";
import { ACCESS_OPERATIONS, createAccessApi, expandPath } from "./generated";
import { ACCESS_SCOPES, capabilityFromSnapshot, createAccess, CustomyAccessError, type AccessMeSnapshot } from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function scripted(replies: Array<Response | Error>) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: typeof init?.body === "string" ? init.body : undefined });
        const next = replies.shift();
        if (!next) throw new Error("sin respuesta preparada");
        if (next instanceof Error) throw next;
        return next;
    }) as typeof globalThis.fetch;
    return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const BASE = "https://access.fixture.invalid";
const ENV = "env_fixture_0001";

function meSnapshot(extra: Partial<AccessMeSnapshot> = {}): AccessMeSnapshot {
    return {
        environmentId: ENV,
        user: { id: "usr_1" },
        subscription: { environmentId: ENV, organizationId: "org_fixture", primaryPlanCode: "pro", subscriptionStatus: "active", hasActiveSubscription: true, planCodes: ["pro"], addOnCodes: [] },
        entitlements: { environmentId: ENV, organizationId: "org_fixture", planCodes: ["pro"], addOnCodes: [], entitlements: [
            { capability: "reports.view", label: "Reports", module: "reports", decisionState: "read_only", commerciallyIncluded: true, commerciallyIncludedVia: "plan", requiredPlans: [], reason: "plan" },
        ] },
        modules: [],
        usage: {},
        application: { applicationKey: "fixture-app", plan: { code: "pro", source: "subscription" }, capabilities: { "habits.unlimited": true, "ai.coach": 200, "ai.voice": 0, "theme": null } },
        ...extra,
    };
}

describe("@customyai/access: fachada", () => {
    it("capabilities.check lee /api/v1/me con el token de máquina (capabilities:read, audiencia customy-access)", async () => {
        const { fetch, calls } = scripted([json(200, { access_token: "tok", expires_in: 300 }), json(200, meSnapshot())]);
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess<"ai.coach" | "ai.voice">({ baseUrl: BASE, machineTokens, fetch });
        const result = await access.capabilities.check("ai.coach", { userId: "usr_1" });
        expect(result).toEqual({ capability: "ai.coach", allowed: true, value: 200, source: "application", plan: "pro" });
        const form = new URLSearchParams(calls[0]!.body);
        expect(form.get("audience")).toBe("customy-access");
        expect(form.get("scope")).toBe("capabilities:read");
        const url = new URL(calls[1]!.url);
        expect(url.pathname).toBe("/api/v1/me");
        expect(url.searchParams.get("userId")).toBe("usr_1");
        expect(url.searchParams.has("envId")).toBe(false);
        expect(Object.keys(calls[1]!.headers).some((name) => name.startsWith("x-env") || name.startsWith("x-org"))).toBe(false);
        expectTypeOf(access.capabilities.check).parameter(0).toEqualTypeOf<"ai.coach" | "ai.voice">();
    });

    it("decide por el valor del manifiesto y, si no está, por los entitlements", () => {
        const snapshot = meSnapshot();
        expect(capabilityFromSnapshot(snapshot, "habits.unlimited").allowed).toBe(true);
        expect(capabilityFromSnapshot(snapshot, "ai.voice").allowed).toBe(false);
        expect(capabilityFromSnapshot(snapshot, "theme").allowed).toBe(false);
        expect(capabilityFromSnapshot(snapshot, "reports.view").allowed).toBe(false);
        expect(capabilityFromSnapshot(snapshot, "reports.view", "read")).toMatchObject({ allowed: true, source: "entitlements", value: "read_only" });
        expect(capabilityFromSnapshot(snapshot, "missing")).toMatchObject({ allowed: false, source: "none" });
    });

    it("users.contact exige entorno y traduce SCOPE_REQUIRED a CustomyAccessError", async () => {
        const { fetch, calls } = scripted([json(403, { error: "SCOPE_REQUIRED", message: "This credential needs the users:contact:read scope." }, { "x-request-id": "req_7" })]);
        const access = createAccess({ baseUrl: BASE, accessToken: "tok", fetch });
        await expect(access.users.contact("usr_1")).rejects.toMatchObject({ code: "SDK_ENVIRONMENT_REQUIRED" });
        expect(calls).toHaveLength(0);
        const error = await access.users.contact("usr_1", { environmentId: ENV }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CustomyAccessError);
        expect(error).toBeInstanceOf(CustomySdkError);
        expect(error).toMatchObject({ code: "SCOPE_REQUIRED", status: 403, service: "access", requestId: "req_7" });
        expect(calls[0]!.url).toBe(`${BASE}/api/v1/users/usr_1/contact?envId=${ENV}`);
    });

    it("con machineTokens y users:contact:read pide ese scope exacto", async () => {
        const { fetch, calls } = scripted([
            json(200, { access_token: "tok", expires_in: 300 }),
            json(200, { userId: "usr_1", email: "ana@example.com", emailVerified: true, name: "Ana", locale: "es" }),
        ]);
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess({ baseUrl: BASE, machineTokens, scopes: ["users:contact:read"], environmentId: ENV, fetch });
        await expect(access.users.contact("usr_1")).resolves.toMatchObject({ email: "ana@example.com" });
        expect(new URLSearchParams(calls[0]!.body).get("scope")).toBe("users:contact:read");
    });

    it("el catálogo se lee con machineTokens y catalog:read (sin admin:*), y ACCESS_SCOPES lista los scopes por función", async () => {
        const { fetch, calls } = scripted([
            json(200, { access_token: "tok", expires_in: 300 }),
            json(200, { items: [{ lookupKey: "reports.view" }] }),
        ]);
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess({ baseUrl: BASE, machineTokens, scopes: ["catalog:read"], environmentId: ENV, fetch });
        await expect(access.catalog.features()).resolves.toEqual([{ lookupKey: "reports.view" }]);
        expect(new URLSearchParams(calls[0]!.body).get("scope")).toBe("catalog:read");
        expect(new URLSearchParams(calls[0]!.body).get("audience")).toBe("customy-access");
        expect(calls[1]!.url).toBe(`${BASE}/api/admin/env/${ENV}/catalog/features`);
        expect(calls[1]!.headers.authorization ?? calls[1]!.headers.Authorization).toBe("Bearer tok");
        expect([...ACCESS_SCOPES]).toEqual([
            "capabilities:read", "users:contact:read", "users:read", "catalog:read", "flags:read",
            "app-relationships:read", "app-relationships:write", "app-plans:write",
        ]);
        expect(ACCESS_SCOPES).not.toContain("relationships:write");
        expect(ACCESS_SCOPES).not.toContain("admin:*");
    });

    it("relaciones, permisos y plan de la app: cada método con su scope, su verbo y su cuerpo", async () => {
        const token = (scope: string) => json(200, { access_token: `tok:${scope}`, expires_in: 300 });
        const tuple = { subjectType: "user", subjectId: "usr_1", relation: "owner", objectType: "fixture-app/fund", objectId: "fund_1" };
        const { fetch, calls } = scripted([
            token("app-relationships:write"), json(200, { written: 1, deleted: 0, consistencyToken: "3" }),
            token("app-relationships:read"), json(200, { tuples: [tuple], truncated: false }),
            json(200, { results: [{ allowed: true, via: "owner" }] }),
            token("app-plans:write"), json(200, { userId: "usr_1", planCode: "premium", previousPlanCode: null }),
        ]);
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess({ baseUrl: BASE, machineTokens, environmentId: ENV, fetch });

        await expect(access.relationships.write({ writes: [tuple] })).resolves.toEqual({ written: 1, deleted: 0, consistencyToken: "3" });
        await expect(access.relationships.list({ objectType: "fixture-app/fund", objectId: "fund_1" })).resolves.toEqual({ tuples: [tuple], truncated: false });
        await expect(access.permissions.checkMany([{ subject: { type: "user", id: "usr_1" }, permission: "loans.approve", object: { type: "fixture-app/fund", id: "fund_1" } }]))
            .resolves.toEqual([{ allowed: true, via: "owner" }]);
        await expect(access.plans.set("usr_1", "premium")).resolves.toEqual({ userId: "usr_1", planCode: "premium", previousPlanCode: null });

        const tokens = calls.filter((call) => call.url.endsWith("/oauth/token")).map((call) => new URLSearchParams(call.body).get("scope"));
        expect(tokens).toEqual(["app-relationships:write", "app-relationships:read", "app-plans:write"]);
        const api = calls.filter((call) => !call.url.endsWith("/oauth/token"));
        expect(api.map((call) => [call.method, call.url])).toEqual([
            ["POST", `${BASE}/api/v1/env/${ENV}/app-relationships`],
            ["GET", `${BASE}/api/v1/env/${ENV}/app-relationships?objectType=fixture-app%2Ffund&objectId=fund_1`],
            ["POST", `${BASE}/api/v1/env/${ENV}/app-permissions/check`],
            ["PUT", `${BASE}/api/v1/env/${ENV}/app-members/usr_1/plan`],
        ]);
        expect(JSON.parse(api[0]!.body!)).toEqual({ writes: [tuple], deletes: [] });
        expect(JSON.parse(api[3]!.body!)).toEqual({ planCode: "premium" });
        expect(api[1]!.headers.authorization ?? api[1]!.headers.Authorization).toBe("Bearer tok:app-relationships:read");
    });

    it("sin entorno, las rutas de la app lo piden; un scope que falta se nombra", async () => {
        const { fetch } = scripted([json(403, { code: "APPLICATION_SCOPE_REQUIRED" })]);
        const access = createAccess({ baseUrl: BASE, accessToken: "jwt.fixture.token", fetch });
        await expect(access.plans.set("usr_1", null)).rejects.toMatchObject({ code: "SDK_ENVIRONMENT_REQUIRED" });
        const error = await access.relationships.list({ objectType: "fixture-app/fund" }, { environmentId: ENV }).catch((caught: unknown) => caught);
        expect(error).toMatchObject({ code: "APPLICATION_SCOPE_REQUIRED", status: 403, requiredScope: "app-relationships:read" });
    });

    it("un texto legible en `error` no se hace pasar por código; lecturas se reintentan ante 503", async () => {
        const { fetch, calls } = scripted([
            json(503, { error: "SESSION_RESOLUTION_UNAVAILABLE" }, { "retry-after": "0" }),
            json(404, { error: "Capability not found" }),
        ]);
        const access = createAccess({ baseUrl: BASE, accessToken: "cak_live_fixture", environmentId: ENV, fetch, retry: { baseDelayMs: 1, maxDelayMs: 1 } });
        await expect(access.catalog.features()).rejects.toMatchObject({ code: "HTTP_404", status: 404 });
        expect(calls).toHaveLength(2);
        expect(calls[0]!.url).toBe(`${BASE}/api/admin/env/${ENV}/catalog/features`);
        expect(calls[0]!.headers.authorization).toBe("Bearer cak_live_fixture");
    });
});

describe("@customyai/access/generated", () => {
    it("cubre el contrato público de Access", () => {
        expect(Object.keys(ACCESS_OPERATIONS).length).toBeGreaterThan(800);
        expect(Object.values(ACCESS_OPERATIONS).every((operation) => operation.path.startsWith("/"))).toBe(true);
    });

    it("rellena la ruta, exige sus parámetros y solo repite un POST con clave de idempotencia", async () => {
        const { fetch, calls } = scripted([
            json(503, { error: "TEMPORARILY_UNAVAILABLE" }, { "retry-after": "0" }),
            json(200, { ok: true }),
            json(503, { error: "TEMPORARILY_UNAVAILABLE" }, { "retry-after": "0" }),
        ]);
        const api = createAccessApi({ baseUrl: BASE, accessToken: "tok", fetch, retry: { baseDelayMs: 1, maxDelayMs: 1 } });
        expect(api.operation("adoptOrgCustomerKey")).toMatchObject({ method: "POST", path: "/api/admin/env/{envId}/orgs/{orgId}/customer-key" });
        await api.call("adoptOrgCustomerKey", { path: { envId: ENV, orgId: "org/1" }, body: {}, idempotencyKey: "k-1" });
        expect(calls[0]!.url).toBe(`${BASE}/api/admin/env/${ENV}/orgs/org%2F1/customer-key`);
        expect(calls.slice(0, 2).map((call) => call.headers["idempotency-key"])).toEqual(["k-1", "k-1"]);
        await expect(api.call("adoptOrgCustomerKey", { path: { envId: ENV, orgId: "o" }, body: {} })).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
        expect(calls).toHaveLength(3);
        expect(() => expandPath("/api/admin/env/{envId}/users", {})).toThrow("envId");
    });

    it("tipa los parámetros de ruta de cada operación", () => {
        const api = createAccessApi({ baseUrl: BASE, accessToken: "tok", fetch: (async () => json(200, {})) as typeof fetch });
        type Id = "adoptOrgCustomerKey";
        expectTypeOf<Parameters<typeof api.call<unknown, Id>>[1]>().toMatchTypeOf<{ path: { envId: string | number; orgId: string | number } }>();
    });
});

describe("@customyai/access/flags", () => {
    const snapshot = (version: number): CustomyFlagsSnapshot => ({
        schemaVersion: "2026-06-fme", organizationId: "org_fixture", projectId: "prj_fixture", environmentId: ENV, version, generatedAt: "2026-09-27T00:00:00Z",
        flags: [{ key: "checkout.v2", type: "boolean", status: "active", treatments: [{ key: "on", value: true }, { key: "off", value: false }], defaultTreatment: "on" }],
        segments: [],
    });

    it("clave publicable en cabecera, ETag/304 y errores tipados", async () => {
        const { fetch, calls } = scripted([
            json(401, { code: "FLAGS_CREDENTIAL_REQUIRED" }),
            json(200, snapshot(3), { etag: "\"v3\"" }),
            new Response(null, { status: 304 }),
        ]);
        const flags = createFlagsClient({ baseUrl: BASE, publishableKey: "pk_fixture_0001", fetch });
        await expect(flags.refresh()).rejects.toMatchObject({ code: "FLAGS_CREDENTIAL_REQUIRED", status: 401, service: "access" });
        await flags.refresh();
        expect(flags.getBooleanValue("checkout.v2", false, { key: "usr_1" })).toBe(true);
        await expect(flags.refresh()).resolves.toMatchObject({ version: 3 });
        expect(calls[1]!.headers["x-publishable-key"]).toBe("pk_fixture_0001");
        expect(calls[2]!.headers["if-none-match"]).toBe("\"v3\"");
        expect(() => createFlagsClient({ baseUrl: BASE })).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_REQUIRED" }));
    });

    it("una impresión por flag, clave y tratamiento; lo que falla al enviar vuelve a la cola", async () => {
        const { fetch, calls } = scripted([json(503, { code: "FLAGS_IMPRESSIONS_UNAVAILABLE" }), json(202, { code: "FLAGS_IMPRESSIONS_RECORDED" })]);
        const flags = createFlagsClient({ baseUrl: BASE, accessToken: "tok", fetch, snapshot: snapshot(1), retry: false });
        for (let index = 0; index < 3; index += 1) flags.getTreatment("checkout.v2", { key: "usr_1" });
        await expect(flags.flush()).rejects.toMatchObject({ code: "FLAGS_IMPRESSIONS_UNAVAILABLE", status: 503 });
        await expect(flags.flush()).resolves.toBe(1);
        const body = JSON.parse(calls[1]!.body!);
        expect(body.impressions).toHaveLength(1);
        expect(calls[1]!.headers.authorization).toBe("Bearer tok");
    });

    describe("entrega de impresiones y conversiones (D2)", () => {
        const track = (flags: ReturnType<typeof createFlagsClient>) => flags.getTreatment("checkout.v2", { key: "usr_1" });

        it("un 503 con Retry-After conserva el lote y reporta el retryAfterMs; el reintento manual lo reenvía entero", async () => {
            const { fetch, calls } = scripted([json(503, { code: "FLAGS_IMPRESSIONS_NOT_RECORDED", retryable: true }, { "retry-after": "60" }), json(202, { code: "FLAGS_IMPRESSIONS_RECORDED" })]);
            const flags = createFlagsClient({ baseUrl: BASE, accessToken: "tok", fetch, snapshot: snapshot(1), retry: false });
            track(flags);
            await expect(flags.flush()).rejects.toMatchObject({ code: "FLAGS_IMPRESSIONS_NOT_RECORDED", status: 503, retryAfterMs: 60_000 });
            await expect(flags.flush()).resolves.toBe(1);
            expect(JSON.parse(calls[1]!.body!).impressions).toEqual(JSON.parse(calls[0]!.body!).impressions);
        });

        it("un 202 *_NOT_RECORDED de un servidor antiguo no es éxito: el lote vuelve a la cola", async () => {
            const { fetch } = scripted([json(202, { accepted: 0, code: "FLAGS_IMPRESSIONS_NOT_RECORDED" }), json(202, { code: "FLAGS_IMPRESSIONS_RECORDED" })]);
            const flags = createFlagsClient({ baseUrl: BASE, accessToken: "tok", fetch, snapshot: snapshot(1), retry: false });
            track(flags);
            await expect(flags.flush()).rejects.toMatchObject({ code: "FLAGS_IMPRESSIONS_NOT_RECORDED", status: 202 });
            await expect(flags.flush()).resolves.toBe(1);
        });

        it("un fallo de conversiones tampoco las descarta", async () => {
            const { fetch, calls } = scripted([json(503, { code: "FLAGS_CONVERSIONS_NOT_RECORDED" }), json(202, { code: "FLAGS_CONVERSIONS_RECORDED" })]);
            const flags = createFlagsClient({ baseUrl: BASE, accessToken: "tok", fetch, snapshot: snapshot(1), retry: false });
            flags.trackConversion("checkout.v2", { key: "usr_1" }, { id: "c1", metric: "purchase", value: 5 });
            await expect(flags.flush()).rejects.toMatchObject({ status: 503 });
            await expect(flags.flush()).resolves.toBe(1);
            expect(JSON.parse(calls[1]!.body!).conversions[0]).toMatchObject({ id: "c1", value: 5 });
        });

        it("el envío automático espera con backoff tras un fallo (y respeta Retry-After); no martillea al servidor", async () => {
            vi.useFakeTimers();
            try {
                const { fetch, calls } = scripted([json(503, { code: "FLAGS_IMPRESSIONS_NOT_RECORDED" }, { "retry-after": "60" }), json(202, { code: "FLAGS_IMPRESSIONS_RECORDED" })]);
                const flags = createFlagsClient({ baseUrl: BASE, accessToken: "tok", fetch, snapshot: snapshot(1), retry: false, flushIntervalMs: 1_000 });
                track(flags);
                flags.startAutoFlush();
                await vi.advanceTimersByTimeAsync(1_000);
                expect(calls).toHaveLength(1);
                await vi.advanceTimersByTimeAsync(30_000); // dentro de los 60 s pedidos: ningún intento
                expect(calls).toHaveLength(1);
                await vi.advanceTimersByTimeAsync(40_000);
                expect(calls).toHaveLength(2);
                flags.stopAutoFlush();
            } finally { vi.useRealTimers(); }
        });

        it("un 400 es un rechazo definitivo: el lote no se reencola", async () => {
            const { fetch, calls } = scripted([json(400, { code: "FLAGS_IMPRESSIONS_INVALID" })]);
            const flags = createFlagsClient({ baseUrl: BASE, accessToken: "tok", fetch, snapshot: snapshot(1), retry: false });
            track(flags);
            await expect(flags.flush()).rejects.toMatchObject({ status: 400 });
            await expect(flags.flush()).resolves.toBe(0);
            expect(calls).toHaveLength(1);
        });
    });
});
