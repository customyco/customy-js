import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
    createProvisioning,
    CustomyAuthError,
    CustomyCapabilityDisabledError,
    CustomyConflictError,
    CustomyEnvironmentMismatchError,
    CustomyProvisioningError,
    CustomyRateLimitError,
    CustomyScopeError,
    CustomyValidationError,
    type ProvisioningOptions,
    type RequestEvent,
    type ResponseEvent,
} from "./index";

const BASE = "https://access.fixture.invalid";
const SECRET = "csk_live_super_secret_value_123";
const BEARER = "eyJhbGciOiJSUzI1NiJ9.payload-part.signature-part";
const PASSWORD = "Gen3rated-P@ssw0rd-once";
const LINK = "https://app.fixture.invalid/magic?t=very-secret-link-token";
const REASON = "e2e checkout verification";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
type Reply = Response | Error | ((call: Call) => Response);

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req_test1", ...headers } });
const errorReply = (status: number, code: string, details?: Record<string, unknown>, headers: Record<string, string> = {}, message = `${code} message`) =>
    json(status, { error: { code, message, ...(details ? { details } : {}), requestId: "req_test1" } }, headers);
const tokenReply = (expiresIn = 900, token = BEARER) => json(200, { access_token: token, token_type: "Bearer", expires_in: expiresIn, scope: "provisioning.users.read" });

/** Fake fetch: token requests are answered from `tokens`, everything else from `replies` in order. */
function harness(replies: Reply[], tokens: Reply[] = [tokenReply()]) {
    const calls: Call[] = [];
    const tokenCalls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, name) => { headers[name] = value; });
        const call: Call = { url: String(input), method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : undefined };
        const isToken = call.url.endsWith("/oauth/token");
        (isToken ? tokenCalls : calls).push(call);
        const queue = isToken ? tokens : replies;
        const next = queue.length > 1 || !isToken ? queue.shift() : queue[0];
        if (!next) throw new Error("no scripted reply");
        if (next instanceof Error) throw next;
        return typeof next === "function" ? next(call) : next.clone();
    }) as typeof globalThis.fetch;
    return { fetch, calls, tokenCalls };
}

type Extra = Partial<Omit<ProvisioningOptions, "clientId" | "clientSecret" | "accessToken" | "scopes">> & { scopes?: string[]; accessToken?: string; clientId?: string | undefined; clientSecret?: string | undefined };

function client(replies: Reply[], extra: Extra = {}, tokens?: Reply[]) {
    const h = harness(replies, tokens);
    const sleeps: number[] = [];
    const api = createProvisioning({
        environment: "staging", baseUrl: BASE, clientId: "client_1", clientSecret: SECRET, fetch: h.fetch,
        sleep: async (ms) => { sleeps.push(ms); }, random: () => 0.5, ...extra,
    } as ProvisioningOptions);
    return { api, sleeps, ...h };
}

const USER = { externalKey: "u1", id: "usr_1", kind: "test", email: "a@qa.example.com", name: null, emailVerified: true, version: 1, attributes: {}, expiresAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };

describe("auth", () => {
    it("fetches a token with client credentials in the body, audience and scopes", async () => {
        const { api, tokenCalls, calls } = client([json(200, USER)], { scopes: ["provisioning.users.read"] });
        await api.users.get("u1");
        expect(tokenCalls).toHaveLength(1);
        const form = new URLSearchParams(tokenCalls[0]!.body);
        expect(Object.fromEntries(form)).toEqual({
            grant_type: "client_credentials", audience: "customy-provisioning", scope: "provisioning.users.read", client_id: "client_1", client_secret: SECRET,
        });
        expect(tokenCalls[0]!.headers.authorization).toBeUndefined();
        expect(tokenCalls[0]!.headers["customy-environment"]).toBe("staging");
        expect(calls[0]!.headers.authorization).toBe(`Bearer ${BEARER}`);
    });

    it("caches the token in memory and refreshes it about 60 s before expiry", async () => {
        let now = 1_000_000;
        const realNow = Date.now;
        Date.now = () => now;
        try {
            const { api, tokenCalls } = client([json(200, USER), json(200, USER), json(200, USER)], {}, [tokenReply(900, "tok-one-aaaaaaaa"), tokenReply(900, "tok-two-bbbbbbbb")]);
            await api.users.get("u1");
            now += 600_000;
            await api.users.get("u1");
            expect(tokenCalls).toHaveLength(1);
            now += 250_000; // 850 s into a 900 s token: inside the 60 s skew
            await api.users.get("u1");
            expect(tokenCalls).toHaveLength(2);
        } finally { Date.now = realNow; }
    });

    it("a 401 invalidates the token and repeats once with a new one", async () => {
        const { api, tokenCalls, calls } = client([errorReply(401, "TOKEN_INVALID"), json(200, USER)], {}, [tokenReply(900, "tok-one-aaaaaaaa"), tokenReply(900, "tok-two-bbbbbbbb")]);
        await api.users.get("u1");
        expect(tokenCalls).toHaveLength(2);
        expect(calls[1]!.headers.authorization).toBe("Bearer tok-two-bbbbbbbb");
    });

    it("rejected credentials surface as CustomyAuthError without the secret", async () => {
        const { api } = client([], {}, [json(401, { error: "invalid_client" })]);
        const error = await api.whoami().catch((e) => e);
        expect(error).toBeInstanceOf(CustomyAuthError);
        expect(JSON.stringify(error)).not.toContain(SECRET);
    });

    it("accepts a pre-obtained bearer: no token request, never echoed", async () => {
        const { api, tokenCalls, calls } = client([json(200, USER)], { clientId: undefined, clientSecret: undefined, accessToken: "pre-obtained-bearer-123" });
        await api.users.get("u1");
        expect(tokenCalls).toHaveLength(0);
        expect(calls[0]!.headers.authorization).toBe("Bearer pre-obtained-bearer-123");
        expect(calls[0]!.headers["customy-environment"]).toBe("staging");
    });

    it("requires an explicit environment and credentials", () => {
        expect(() => createProvisioning({ baseUrl: BASE, clientId: "a", clientSecret: "b" } as unknown as ProvisioningOptions)).toThrow(CustomyValidationError);
        expect(() => createProvisioning({ environment: "staging", baseUrl: BASE, clientId: "", clientSecret: "" })).toThrow(CustomyProvisioningError);
    });
});

describe("headers and idempotency", () => {
    it("sends Customy-Environment on every request, reads and writes", async () => {
        const { api, calls, tokenCalls } = client([json(200, USER), json(200, { expired: 0 })], { environment: "production" });
        await api.users.get("u1");
        await api.testUsers.expire();
        expect(calls.map((c) => c.headers["customy-environment"])).toEqual(["production", "production"]);
        expect(tokenCalls[0]!.headers["customy-environment"]).toBe("production");
    });

    it("generates an Idempotency-Key for writes only, and keeps it across retries", async () => {
        const { api, calls } = client([errorReply(503, "SERVICE_UNAVAILABLE"), new TypeError("fetch failed"), json(201, { ...USER, changed: true, created: true, audit: { id: "a1" } })]);
        await api.users.upsert("u1", { email: "a@qa.example.com", reason: REASON });
        const keys = calls.map((c) => c.headers["idempotency-key"]);
        expect(keys).toHaveLength(3);
        expect(new Set(keys).size).toBe(1);
        expect(keys[0]).toMatch(/^[A-Za-z0-9_:.-]{8,128}$/);
        const read = client([json(200, USER)]);
        await read.api.users.get("u1");
        expect(read.calls[0]!.headers["idempotency-key"]).toBeUndefined();
    });

    it("uses a caller key, rejects an invalid one, and sends If-Match quoted", async () => {
        const { api, calls } = client([json(200, { ...USER, changed: true, created: false, audit: { id: "a1" } })]);
        await api.users.upsert("u1", { email: "a@qa.example.com", reason: REASON }, { idempotencyKey: "my-key-0001", ifMatch: 3 });
        expect(calls[0]!.headers["idempotency-key"]).toBe("my-key-0001");
        expect(calls[0]!.headers["if-match"]).toBe('"3"');
        await expect(api.users.upsert("u1", { email: "a@b.c", reason: REASON }, { idempotencyKey: "short" })).rejects.toBeInstanceOf(CustomyValidationError);
    });

    it("builds the documented requests", async () => {
        const { api, calls } = client([
            json(200, { externalKey: "u1", deleted: true, version: 2, audit: { id: "a" } }),
            json(200, { deleted: 2, batch: "run-1", audit: { id: "a" } }),
            json(201, { externalKey: "u1", link: LINK, expiresAt: "2026-10-01T00:10:00Z", audit: { id: "a" } }),
            json(200, { deleted: 5, batch: null, audit: null }),
        ]);
        await api.users.delete("u1", { reason: REASON, ticket: "T-1", ifMatch: 2 });
        await api.testUsers.cleanup({ batch: "run-1" }, { reason: REASON });
        await api.users.signinLink("u1", { reason: REASON });
        await api.testUsers.cleanup({ mine: true }, { reason: REASON, ticket: "T-2" });
        expect(calls[0]).toMatchObject({ method: "DELETE", url: `${BASE}/v1/provisioning/users/u1`, headers: { "if-match": '"2"' } });
        expect(JSON.parse(calls[0]!.body!)).toEqual({ reason: REASON, ticket: "T-1" });
        expect(calls[1]!.method).toBe("DELETE");
        expect(new URL(calls[1]!.url).searchParams.get("batch")).toBe("run-1");
        expect(new URL(calls[1]!.url).searchParams.get("reason")).toBe(REASON);
        expect(calls[2]!.url).toBe(`${BASE}/v1/provisioning/users/u1:signin-link`);
        expect(new URL(calls[3]!.url).searchParams.get("mine")).toBe("true");
        expect(new URL(calls[3]!.url).searchParams.get("ticket")).toBe("T-2");
    });

    it("validates locally before any network call", async () => {
        const { api, calls, tokenCalls } = client([]);
        await expect(api.users.get("bad key/../x")).rejects.toBeInstanceOf(CustomyValidationError);
        await expect(api.users.upsert("u1", { email: "a@b.c", reason: "short" })).rejects.toBeInstanceOf(CustomyValidationError);
        await expect(api.testUsers.batch({ count: 0, emailBase: "a@b.c", reason: REASON })).rejects.toBeInstanceOf(CustomyValidationError);
        await expect(api.testUsers.batch({ count: 1, emailBase: "a@b.c", emailDomain: "b.c", reason: REASON })).rejects.toBeInstanceOf(CustomyValidationError);
        await expect(api.testUsers.cleanup({} as never, { reason: REASON })).rejects.toBeInstanceOf(CustomyValidationError);
        expect(calls.length + tokenCalls.length).toBe(0);
    });

    it("returns the generated password once on create", async () => {
        const { api } = client([json(201, { ...USER, changed: true, created: true, credentials: { password: PASSWORD }, audit: { id: "a1" } })]);
        const result = await api.users.upsert("u1", { email: "a@qa.example.com", password: "generate", reason: REASON });
        expect(result.credentials?.password).toBe(PASSWORD);
    });
});

describe("retries", () => {
    it("retries 429 honouring Retry-After, then 5xx with exponential full jitter", async () => {
        const { api, sleeps, calls } = client([
            errorReply(429, "RATE_LIMITED", undefined, { "retry-after": "7" }),
            errorReply(502, "INTERNAL_ERROR"),
            json(200, USER),
        ], { retry: { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 10_000 } });
        await api.users.get("u1");
        expect(calls).toHaveLength(3);
        // 429: Retry-After wins. 5xx, second attempt: floor(0.5 * min(max, 100 * 2^1)).
        expect(sleeps).toEqual([7000, 100]);
    });

    it("stops at maxAttempts (default 3) and throws the typed error", async () => {
        const { api, calls } = client([errorReply(500, "INTERNAL_ERROR"), errorReply(500, "INTERNAL_ERROR"), errorReply(500, "INTERNAL_ERROR"), errorReply(500, "INTERNAL_ERROR")]);
        const error = await api.users.get("u1").catch((e) => e);
        expect(calls).toHaveLength(3);
        expect(error).toBeInstanceOf(CustomyProvisioningError);
        expect(error.status).toBe(500);
        expect(error.requestId).toBe("req_test1");
    });

    it("does not retry when Retry-After exceeds the cap, and retry:false disables retries", async () => {
        const slow = client([errorReply(429, "RATE_LIMITED", undefined, { "retry-after": "600" })]);
        const error = await slow.api.users.get("u1").catch((e) => e);
        expect(error).toBeInstanceOf(CustomyRateLimitError);
        expect(error.retryAfter).toBe(600);
        expect(slow.calls).toHaveLength(1);
        const off = client([errorReply(503, "SERVICE_UNAVAILABLE")], { retry: false });
        await off.api.users.get("u1").catch(() => undefined);
        expect(off.calls).toHaveLength(1);
    });

    it("retries IDEMPOTENCY_IN_PROGRESS with the same key", async () => {
        const { api, calls } = client([errorReply(409, "IDEMPOTENCY_IN_PROGRESS"), json(200, { ...USER, changed: false, created: false, audit: { id: "a" } })]);
        await api.users.upsert("u1", { email: "a@qa.example.com", reason: REASON });
        expect(calls).toHaveLength(2);
        expect(calls[0]!.headers["idempotency-key"]).toBe(calls[1]!.headers["idempotency-key"]);
    });

    it.each([
        [400, "VALIDATION"], [403, "SCOPE_REQUIRED"], [403, "ENVIRONMENT_MISMATCH"], [404, "NOT_FOUND"], [409, "EMAIL_EXISTS"],
        [409, "VERSION_CONFLICT"], [409, "IDEMPOTENCY_KEY_REUSED"], [412, "PRECONDITION_FAILED"], [422, "QUOTA_EXCEEDED"], [423, "CAPABILITY_DISABLED"], [501, "APPROVAL_NOT_IMPLEMENTED"],
    ])("never retries %i %s", async (status, code) => {
        const { api, calls } = client([errorReply(status, code), json(200, USER)]);
        await api.users.upsert("u1", { email: "a@qa.example.com", reason: REASON }).catch(() => undefined);
        expect(calls).toHaveLength(1);
    });

    it("retries network failures and aborts promptly on a signal", async () => {
        const net = client([new TypeError("fetch failed"), json(200, USER)]);
        await net.api.users.get("u1");
        expect(net.calls).toHaveLength(2);
        const controller = new AbortController();
        controller.abort();
        const aborted = client([json(200, USER)]);
        const error = await aborted.api.users.get("u1", { signal: controller.signal }).catch((e) => e);
        expect(error.code).toBe("SDK_ABORTED");
        expect(aborted.calls).toHaveLength(0);
    });
});

describe("typed errors", () => {
    it.each([
        ["SCOPE_REQUIRED", 403, CustomyScopeError], ["ENVIRONMENT_MISMATCH", 403, CustomyEnvironmentMismatchError], ["TOKEN_INVALID", 401, CustomyAuthError],
        ["AUDIENCE_MISMATCH", 403, CustomyAuthError], ["VERSION_CONFLICT", 409, CustomyConflictError], ["PRECONDITION_FAILED", 412, CustomyConflictError],
        ["CAPABILITY_DISABLED", 423, CustomyCapabilityDisabledError], ["VALIDATION", 400, CustomyValidationError], ["REASON_REQUIRED", 422, CustomyValidationError],
        ["QUOTA_EXCEEDED", 422, CustomyValidationError], ["NOT_FOUND", 404, CustomyProvisioningError],
    ] as const)("maps %s", async (code, status, ctor) => {
        const { api } = client([errorReply(status, code, { scope: "provisioning.users.write", currentVersion: 4 }), errorReply(status, code)], { retry: false });
        const error = await api.users.get("u1").catch((e) => e);
        expect(error).toBeInstanceOf(ctor);
        expect(error).toBeInstanceOf(CustomyProvisioningError);
        expect(error.code).toBe(code);
        expect(error.status).toBe(status);
        expect(error.requestId).toBe("req_test1");
    });

    it("exposes scope, currentVersion, retryAfter and details", async () => {
        const scope = await client([errorReply(403, "SCOPE_REQUIRED", { scope: "provisioning.test.write" })]).api.testUsers.expire().catch((e) => e);
        expect(scope.scope).toBe("provisioning.test.write");
        const conflict = await client([errorReply(412, "PRECONDITION_FAILED", { currentVersion: 9 })]).api.users.delete("u1", { reason: REASON, ifMatch: 1 }).catch((e) => e);
        expect(conflict.currentVersion).toBe(9);
        const rate = await client([errorReply(429, "RATE_LIMITED", undefined, { "retry-after": "12" })], { retry: false }).api.users.get("u1").catch((e) => e);
        expect(rate.retryAfter).toBe(12);
        const validation = await client([errorReply(400, "VALIDATION", { issues: [{ path: "email", message: "required" }] })]).api.users.get("u1").catch((e) => e);
        expect(validation.details).toEqual({ issues: [{ path: "email", message: "required" }] });
    });
});

describe("redaction", () => {
    it("never leaks the secret, bearer, password or link through errors, JSON, inspect or hooks", async () => {
        const requests: RequestEvent[] = [];
        const responses: ResponseEvent[] = [];
        // A hostile server that echoes secrets back inside the error text and details.
        const echo = errorReply(422, "VALIDATION", { link: LINK, password: PASSWORD, note: `bad ${BEARER} and ${SECRET}` }, {}, `echo ${BEARER} ${SECRET} Bearer ${BEARER}`);
        const { api } = client([echo, json(201, { ...USER, changed: true, created: true, credentials: { password: PASSWORD }, audit: { id: "a" } }),
            json(201, { externalKey: "u1", link: LINK, expiresAt: "x", audit: { id: "a" } })], { retry: false, onRequest: (e) => requests.push(e), onResponse: (e) => responses.push(e) });
        const error = await api.users.upsert("u1", { email: "a@qa.example.com", password: "generate", reason: REASON }).catch((e) => e);
        await api.users.upsert("u1", { email: "a@qa.example.com", password: "generate", reason: REASON });
        await api.users.signinLink("u1", { reason: REASON });
        const leaked = [SECRET, BEARER, PASSWORD, LINK];
        const surfaces = [error.message, JSON.stringify(error), inspect(error, { depth: 6 }), String(error), JSON.stringify(requests), JSON.stringify(responses)];
        for (const text of surfaces) for (const secret of leaked) expect(text).not.toContain(secret);
        expect(requests[0]!.headers.authorization).toBe("Bearer [REDACTED]");
        expect(JSON.stringify(responses)).toContain("[REDACTED]");
        expect(error).toBeInstanceOf(CustomyValidationError);
    });

    it("hook payloads carry request ids and rate-limit data but no credentials in responses", async () => {
        const responses: ResponseEvent[] = [];
        const { api } = client([json(200, { externalKey: "u1", link: LINK }, { "ratelimit-limit": "60", "ratelimit-remaining": "59", "ratelimit-reset": "30", "idempotency-replayed": "true" })], { onResponse: (e) => responses.push(e) });
        await api.users.signinLink("u1", { reason: REASON });
        expect(responses[0]).toMatchObject({ requestId: "req_test1", status: 200, replayed: true, rateLimit: { limit: 60, remaining: 59, resetSeconds: 30 } });
        expect(JSON.stringify(responses)).not.toContain(LINK);
    });
});

describe("pagination and export", () => {
    it("listAll follows cursors across pages", async () => {
        const pages = [
            json(200, { data: [{ ...USER, externalKey: "a" }, { ...USER, externalKey: "b" }], page: { nextCursor: "c1", limit: 2 } }),
            json(200, { data: [{ ...USER, externalKey: "c" }], page: { nextCursor: null, limit: 2 } }),
        ];
        const { api, calls } = client(pages);
        const keys: string[] = [];
        for await (const user of api.users.listAll({ kind: "test", limit: 2, q: "e2e-" })) keys.push(user.externalKey);
        expect(keys).toEqual(["a", "b", "c"]);
        expect(new URL(calls[0]!.url).searchParams.get("cursor")).toBeNull();
        expect(new URL(calls[1]!.url).searchParams.get("cursor")).toBe("c1");
        expect(new URL(calls[1]!.url).searchParams.get("q")).toBe("e2e-");
    });

    it("audit export reads text; list serialises dates", async () => {
        const csv = new Response("id,seq\na1,1\n", { status: 200, headers: { "content-type": "text/csv", "x-request-id": "req_x" } });
        const { api, calls } = client([csv, json(200, { data: [], page: { nextCursor: null, limit: 50 } })]);
        expect(await api.audit.export({ format: "csv", subject: "u1" })).toBe("id,seq\na1,1\n");
        expect(calls[0]!.headers.accept).toBe("text/csv");
        await api.audit.list({ from: new Date("2026-10-01T00:00:00Z") });
        expect(new URL(calls[1]!.url).searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
    });
});
