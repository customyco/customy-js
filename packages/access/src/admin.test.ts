import { describe, expect, it } from "vitest";
import { CustomySdkError } from "@customyai/core";
import { accessScopeHeaders, createAccessAdmin } from "./admin";

type Call = { url: URL; method: string; headers: Record<string, string>; body?: string; init: RequestInit };

function server(respond: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call: Call = {
            url: new URL(String(input)), method: init?.method ?? "GET", init: init ?? {},
            headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
            body: typeof init?.body === "string" ? init.body : undefined,
        };
        calls.push(call);
        return respond(call);
    }) as typeof globalThis.fetch;
    return { calls, fetch };
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req_1" } });
const base = "https://access.fixture.invalid";

describe("accessScopeHeaders", () => {
    it("maps a scope to the x-* headers Access reads, skipping blanks", () => {
        expect(accessScopeHeaders({ publishableKey: "pk_1", environmentId: "env_1", organizationId: "org_1", organizationSlug: "acme", projectId: "prj_1", userId: "user_1", forwardedHost: "app.example.test" })).toEqual({
            "x-publishable-key": "pk_1", "x-env-id": "env_1", "x-environment-id": "env_1", "x-org-id": "org_1", "x-organization-id": "org_1",
            "x-org-slug": "acme", "x-project-id": "prj_1", "x-user-id": "user_1", "x-customy-user-id": "user_1", "x-forwarded-host": "app.example.test",
        });
        expect(accessScopeHeaders({ environmentId: " ", userId: undefined })).toEqual({});
        expect(accessScopeHeaders(undefined)).toEqual({});
    });
});

describe("createAccessAdmin", () => {
    it("resolves the URL from the platform discovery and forwards cookie + scope, no-store and no retries", async () => {
        const { calls, fetch } = server(() => ok({ user: { id: "user_1" }, roles: ["admin"], capabilities: { "crm.read": "enabled" }, activeRole: "admin" }));
        const platform = { issuer: base, jwksUri: `${base}/oauth/jwks.json`, tokenEndpoint: `${base}/oauth/token`, grantTypesSupported: [], products: { access: { baseUrl: "https://access-api.fixture.invalid", audience: "customy-access" } } };
        const admin = createAccessAdmin({ platform, cookie: "customy.session_token=abc", scope: { environmentId: "env_1", publishableKey: "pk_1" }, fetch });
        const session = await admin.session();
        expect(session).toMatchObject({ user: { id: "user_1" }, roles: ["admin"], activeRole: "admin" });
        expect(admin.baseUrl).toBe("https://access-api.fixture.invalid");
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url.href).toBe("https://access-api.fixture.invalid/api/auth/get-session");
        expect(calls[0]!.headers).toMatchObject({ cookie: "customy.session_token=abc", "x-env-id": "env_1", "x-publishable-key": "pk_1", accept: "application/json" });
        expect(calls[0]!.init.cache).toBe("no-store");
        expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    });

    it("a null session body is null, not an error", async () => {
        const { fetch } = server(() => new Response("null", { status: 200 }));
        expect(await createAccessAdmin({ baseUrl: base, fetch }).session()).toBeNull();
    });

    it("per-call headers beat the client's, which beat the scope's; a call cookie beats the client cookie", async () => {
        const { calls, fetch } = server(() => ok({}));
        const admin = createAccessAdmin({ baseUrl: base, fetch, cookie: "a=1", scope: { environmentId: "env_scope" }, headers: { "x-env-id": "env_client" } });
        await admin.me({ headers: { "X-Env-Id": "env_call" }, cookie: "b=2" });
        expect(calls[0]!.headers["x-env-id"]).toBe("env_call");
        expect(calls[0]!.headers["x-environment-id"]).toBe("env_scope");
        expect(calls[0]!.headers.cookie).toBe("b=2");
        expect(calls[0]!.url.pathname).toBe("/api/v1/me");
    });

    it("sends a bearer from a string or a provider, and a token failure is SDK_ACCESS_TOKEN_UNAVAILABLE", async () => {
        const { calls, fetch } = server(() => ok({}));
        await createAccessAdmin({ baseUrl: base, fetch, accessToken: "tok" }).me();
        await createAccessAdmin({ baseUrl: base, fetch, accessToken: async () => "from-provider" }).me();
        expect(calls.map((call) => call.headers.authorization)).toEqual(["Bearer tok", "Bearer from-provider"]);
        await expect(createAccessAdmin({ baseUrl: base, fetch, accessToken: () => { throw new Error("boom"); } }).me()).rejects.toMatchObject({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE" });
    });

    it("typed helpers hit the Access routes with the right query and body", async () => {
        const { calls, fetch } = server((call) => ok(call.url.pathname === "/api/v1/directory/members" ? { items: [{ id: "u1" }] } : { governance_token: "g", expires_in: 900 }));
        const admin = createAccessAdmin({ baseUrl: base, fetch });
        await admin.provisioning.status({ workspaceEnvironmentId: "env_1" });
        const members = await admin.directory.members({ environmentId: "env_1", search: "ana", limit: "20" });
        expect(members.items).toHaveLength(1);
        await admin.workspace.layout("ops");
        await admin.workspace.theme(); await admin.workspace.featureFlags(); await admin.workspace.experiments();
        await admin.deviceSession("dev_tok");
        const token = await admin.governance.token({ sessionToken: "s", organizationId: "org_1", environmentId: "env_1" });
        expect(token.governance_token).toBe("g");
        expect(calls.map((call) => `${call.method} ${call.url.pathname}${call.url.search}`)).toEqual([
            "GET /api/workspace/provisioning/status?workspaceEnvironmentId=env_1",
            "GET /api/v1/directory/members?environmentId=env_1&search=ana&limit=20",
            "GET /api/access/v1/ui/layout?role=ops",
            "GET /api/access/v1/ui/theme",
            "GET /api/access/v1/workspace/feature-flags",
            "GET /api/access/v1/workspace/experiments",
            "POST /api/auth/device/session",
            "POST /v1/governance/token",
        ]);
        expect(JSON.parse(calls[6]!.body!)).toEqual({ token: "dev_tok" });
        expect(JSON.parse(calls[7]!.body!)).toEqual({ session_token: "s", organization_id: "org_1", environment_id: "env_1" });
        expect(calls[7]!.headers["content-type"]).toBe("application/json");
    });

    it("json() throws a CustomySdkError with the envelope code on non-2xx; request() returns the status instead", async () => {
        const { fetch } = server(() => ok({ error: { code: "ENVIRONMENT_FORBIDDEN", message: "no", requestId: "r9" } }, 403));
        const admin = createAccessAdmin({ baseUrl: base, fetch });
        const error = await admin.me().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CustomySdkError);
        expect(error).toMatchObject({ code: "ENVIRONMENT_FORBIDDEN", status: 403, service: "access", requestId: "req_1" });
        const response = await admin.request("GET", "/api/v1/me");
        expect(response).toMatchObject({ ok: false, status: 403, requestId: "req_1" });
    });

    it("fetch() returns the raw Response and honours redirect and idempotency; network and timeout are typed", async () => {
        const { calls, fetch } = server(() => ok({ done: true }));
        const admin = createAccessAdmin({ baseUrl: base, fetch, redirect: "error" });
        const response = await admin.fetch("POST", "/api/auth/finance-authorization", { body: { a: 1 }, idempotencyKey: "key-1", headers: { origin: "https://app.example.test" } });
        expect(await response.json()).toEqual({ done: true });
        expect(calls[0]!.init.redirect).toBe("error");
        expect(calls[0]!.headers).toMatchObject({ "idempotency-key": "key-1", origin: "https://app.example.test", "content-type": "application/json" });

        const down = createAccessAdmin({ baseUrl: base, fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof globalThis.fetch });
        await expect(down.me()).rejects.toMatchObject({ code: "SDK_NETWORK_ERROR" });
        const slow = createAccessAdmin({ baseUrl: base, timeoutMs: 5, fetch: ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)))) as typeof globalThis.fetch });
        await expect(slow.me()).rejects.toMatchObject({ code: "SDK_TIMEOUT", status: 408 });
        const controller = new AbortController();
        controller.abort();
        await expect(createAccessAdmin({ baseUrl: base, fetch: ((_u: unknown, init?: RequestInit) => Promise.reject(init!.signal!.reason)) as typeof globalThis.fetch }).me({ signal: controller.signal })).rejects.toMatchObject({ code: "SDK_ABORTED" });
    });

    it("rejects an insecure or missing base URL and caps the response size", async () => {
        expect(() => createAccessAdmin({ baseUrl: "http://access.fixture.invalid" })).toThrow(CustomySdkError);
        expect(() => createAccessAdmin({ baseUrl: "http://localhost:4001", allowLoopbackHttp: true })).not.toThrow();
        expect(() => createAccessAdmin({ baseUrl: "http://customy-access:4001", allowPrivateHttp: true })).not.toThrow();
        const { fetch } = server(() => new Response("x".repeat(100), { status: 200 }));
        await expect(createAccessAdmin({ baseUrl: base, fetch, maxResponseBytes: 10 }).request("GET", "/x")).rejects.toMatchObject({ code: "SDK_RESPONSE_TOO_LARGE" });
        await expect(createAccessAdmin({ baseUrl: base, fetch }).request("GET", "/../x")).rejects.toMatchObject({ code: "SDK_PATH_INVALID" });
    });
});
