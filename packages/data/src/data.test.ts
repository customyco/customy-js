import { createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createData, CustomyDataError } from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function scripted(replies: Array<Response | Error | ((call: Call) => Response)>) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call = { url: String(input), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: typeof init?.body === "string" ? init.body : undefined };
        calls.push(call);
        const next = replies.shift();
        if (!next) throw new Error("sin respuesta preparada");
        if (next instanceof Error) throw next;
        return typeof next === "function" ? next(call) : next;
    }) as typeof globalThis.fetch;
    return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const accepted = (id = "evt_1") => json(202, { accepted: true, deduplicated: false, eventId: id });
const BASE = "https://data.fixture.invalid";
const ISSUER = "https://access.fixture.invalid";
const WRITE_KEY = "wk_fixture_0001";
const fast = { baseDelayMs: 1, maxDelayMs: 1 };
let counter = 0;
const ids = () => `msg_${++counter}`;

type Events = { "lesson.completed": { lessonId: string; minutes: number } };

describe("@customyai/data", () => {
    it("track tipado con write key: sin cabeceras ni campos de tenant", async () => {
        const { fetch, calls } = scripted([accepted()]);
        const data = createData<Events>({ baseUrl: BASE, writeKey: WRITE_KEY, fetch, idFactory: ids, now: () => new Date("2026-09-27T12:00:00Z") });
        await data.track("lesson.completed", { lessonId: "l1", minutes: 12 }, { userId: "u1" });
        expectTypeOf(data.track).parameter(0).toEqualTypeOf<"lesson.completed">();
        expectTypeOf(data.track<"lesson.completed">).parameter(1).toEqualTypeOf<{ lessonId: string; minutes: number }>();
        const sent = JSON.parse(calls[0]!.body!);
        expect(calls[0]!.url).toBe(`${BASE}/v1/collect/event`);
        expect(calls[0]!.headers["x-write-key"]).toBe(WRITE_KEY);
        expect(calls[0]!.headers.authorization).toBeUndefined();
        expect(Object.keys(calls[0]!.headers).filter((name) => name.startsWith("x-customy"))).toEqual([]);
        expect(sent).toMatchObject({ type: "track", event: "lesson.completed", userId: "u1", properties: { lessonId: "l1", minutes: 12 }, timestamp: "2026-09-27T12:00:00.000Z", context: { library: { name: "@customyai/data" } } });
        expect(sent.organizationId).toBeUndefined();
        expect(() => data.enqueue({ type: "track", event: "x", userId: "u", organizationId: "org_x" } as never)).toThrow(expect.objectContaining({ code: "SDK_TENANT_FIELDS_FORBIDDEN" }));
    });

    it("con machineTokens pide audiencia customy-data y solo data:collect", async () => {
        const { fetch, calls } = scripted([json(200, { access_token: "tok", expires_in: 300 }), accepted()]);
        const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch });
        const data = createData({ baseUrl: BASE, machineTokens, fetch, idFactory: ids });
        await data.identify({ plan: "pro" }, { userId: "u1" });
        const form = new URLSearchParams(calls[0]!.body);
        expect(form.get("audience")).toBe("customy-data");
        expect(form.get("scope")).toBe("data:collect");
        expect(calls[1]!.headers.authorization).toBe("Bearer tok");
        expect(calls[1]!.headers["x-write-key"]).toBeUndefined();
        expect(() => createData({ baseUrl: BASE, machineTokens, writeKey: WRITE_KEY })).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_AMBIGUOUS" }));
    });

    it("reintenta un evento ante 503 con la misma clave (su messageId)", async () => {
        const { fetch, calls } = scripted([json(503, { error: "No healthy Data cell is available for this source" }, { "retry-after": "0" }), accepted()]);
        const data = createData({ baseUrl: BASE, writeKey: WRITE_KEY, fetch, retry: fast });
        await data.page({ path: "/" }, { anonymousId: "a1", messageId: "msg_fixed" });
        expect(calls).toHaveLength(2);
        expect(calls[0]!.headers["idempotency-key"]).toBe("msg_fixed");
        expect(calls[1]!.headers["idempotency-key"]).toBe("msg_fixed");
    });

    it("errores tipados: código de la API, cuarentena y acuse inválido", async () => {
        const { fetch } = scripted([
            json(400, { error: "Invalid event", code: "DATA_EXTERNAL_EVENT_INVALID" }),
            json(422, { accepted: false, deduplicated: false, quarantined: true, quarantineId: "q_1" }),
            json(200, { ok: true }),
        ]);
        const data = createData({ baseUrl: BASE, writeKey: WRITE_KEY, fetch, idFactory: ids });
        const invalid = await data.track("x", {}, { userId: "u" }).catch((e: unknown) => e);
        expect(invalid).toBeInstanceOf(CustomyDataError);
        expect(invalid).toBeInstanceOf(CustomySdkError);
        expect(invalid).toMatchObject({ code: "DATA_EXTERNAL_EVENT_INVALID", status: 400, service: "data" });
        await expect(data.track("x", {}, { userId: "u" })).rejects.toMatchObject({ code: "DATA_EVENT_QUARANTINED", status: 422 });
        await expect(data.track("x", {}, { userId: "u" })).rejects.toMatchObject({ code: "SDK_ACKNOWLEDGEMENT_INVALID" });
        await expect(data.track("", {}, { userId: "u" })).rejects.toMatchObject({ code: "SDK_EVENT_INVALID" });
    });

    it("flush por lotes; lo no confirmado vuelve a la cola en orden", async () => {
        const batchOk = (call: Call) => {
            const batch = JSON.parse(call.body!).batch as Array<{ messageId: string }>;
            return json(200, { accepted: batch.length, deduplicated: 0, quarantined: 0, results: batch.map((event) => ({ accepted: true, deduplicated: false, eventId: event.messageId })) });
        };
        const { fetch, calls } = scripted([batchOk, json(400, { error: "Invalid batch", code: "DATA_EXTERNAL_EVENT_INVALID" }), batchOk]);
        const failed: string[][] = [];
        const data = createData({ baseUrl: BASE, writeKey: WRITE_KEY, fetch, idFactory: ids, maxBatchSize: 2, redactFields: ["email"], onError: (_error, events) => failed.push(events.map((event) => event.messageId)) });
        for (let index = 0; index < 3; index += 1) data.enqueue({ type: "track", event: "e", userId: "u", properties: { email: "ana@example.com", index } });
        await expect(data.flush()).rejects.toMatchObject({ code: "DATA_EXTERNAL_EVENT_INVALID" });
        expect(data.queued).toBe(1);
        expect(failed).toHaveLength(1);
        expect(JSON.parse(calls[0]!.body!).batch[0].properties.email).toBe("[REDACTED]");
        await expect(data.flush()).resolves.toMatchObject({ accepted: 1 });
        expect(data.queued).toBe(0);
        expect(JSON.parse(calls[2]!.body!).batch[0].messageId).toBe(failed[0]![0]);
    });
});

describe("fuente y alcance de colección", () => {
    const scope = { sourceId: "src_fixture", organizationId: "org_fixture", projectId: "prj_fixture", environmentId: "env_fixture", applicationId: "app_fixture" };

    it("context.library lleva @customyai/data y la versión del paquete", async () => {
        const { version } = await import("../package.json");
        const { fetch, calls } = scripted([accepted()]);
        const data = createData({ baseUrl: BASE, writeKey: WRITE_KEY, fetch, idFactory: ids });
        await data.send({ type: "track", event: "x", userId: "u1" });
        expect(JSON.parse(calls[0]!.body!).context.library).toEqual({ name: "@customyai/data", version });
    });

    it("con write key, collectionScope viaja en x-customy-collection-* y verifySource lee la fuente", async () => {
        const descriptor = { contractVersion: 1, source: scope, governance: { version: 1 } };
        const { fetch, calls } = scripted([json(200, descriptor), accepted()]);
        const data = createData({ baseUrl: BASE, writeKey: WRITE_KEY, collectionScope: scope, fetch, idFactory: ids });
        await expect(data.verifySource()).resolves.toEqual(descriptor);
        await data.send({ type: "track", event: "x", userId: "u1" });
        expect(calls[0]!.url).toBe(`${BASE}/v1/collect/source`);
        for (const call of calls) {
            expect(call.headers["x-customy-collection-source"]).toBe("src_fixture");
            expect(call.headers["x-customy-collection-application"]).toBe("app_fixture");
            expect(call.headers["x-write-key"]).toBe(WRITE_KEY);
        }
    });

    it("un desajuste de la fuente llega como CustomyDataError con el código de Data", async () => {
        const { fetch } = scripted([json(403, { error: "Collection source does not match the application binding", code: "DATA_COLLECTION_SCOPE_MISMATCH" })]);
        const data = createData({ baseUrl: BASE, writeKey: WRITE_KEY, collectionScope: scope, fetch });
        await expect(data.verifySource()).rejects.toMatchObject({ code: "DATA_COLLECTION_SCOPE_MISMATCH", status: 403, service: "data" });
    });

    it("con token, las cabeceras de alcance y tenant se ignoran con aviso (no falla)", async () => {
        const warnings: string[] = [];
        const { fetch, calls } = scripted([accepted()]);
        const data = createData({
            baseUrl: BASE, accessToken: "tok", fetch, idFactory: ids, collectionScope: scope, onWarning: (message) => warnings.push(message),
            headers: { "x-org-id": "org_x", "x-customy-collection-source": "src_x", "x-trace": "keep" },
        });
        await data.send({ type: "track", event: "x", userId: "u1" });
        const headers = calls[0]!.headers;
        expect(Object.keys(headers).filter((name) => name.startsWith("x-customy-collection") || name === "x-org-id")).toEqual([]);
        expect(headers["x-trace"]).toBe("keep");
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("x-org-id");
        expect(warnings[0]).toContain("collectionScope");
    });

    it("un collectionScope mal formado es un error al construir", () => {
        expect(() => createData({ baseUrl: BASE, writeKey: WRITE_KEY, collectionScope: { ...scope, sourceId: "bad id" } })).toThrow(expect.objectContaining({ code: "SDK_COLLECTION_SCOPE_INVALID" }));
    });
});
