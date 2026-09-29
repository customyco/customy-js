import { afterEach, describe, expect, it, vi } from "vitest";
import { createCustomyClient, createSocialSignInUrl, CustomySdkError, fetchRealtimeTicket, resolveCustomyAccessClientConfig, summarizeCapabilityUsage } from "./index";

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (url: string, init: RequestInit, index: number) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return respond(String(input), init, calls.length - 1);
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const scope = { publishableKey: "pk_test_fixture", environmentId: "env_fixture", organizationSlug: "org-fixture" };

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("browser session", () => {
    it("uses same-origin relative paths with credentials and scope headers in the browser", async () => {
        vi.stubGlobal("document", {});
        const { fetch, calls } = fakeFetch(() => json({ user: { id: "user_1", email: "ana@example.com" }, session: { id: "ses_1", userId: "user_1", expiresAt: "2999-01-01" } }));
        const client = createCustomyClient({ ...scope, baseUrl: "https://ignored.fixture.invalid", fetch });
        const state = await client.getSession();
        expect(state).toMatchObject({ status: "signedIn", user: { id: "user_1" } });
        expect(calls[0]!.url).toBe("/api/auth/get-session");
        expect(calls[0]!.init.credentials).toBe("include");
        expect(calls[0]!.init.cache).toBe("no-store");
        const headers = new Headers(calls[0]!.init.headers);
        expect(headers.get("x-publishable-key")).toBe("pk_test_fixture");
        expect(headers.get("x-env-id")).toBe("env_fixture");
        expect(headers.get("x-environment-id")).toBe("env_fixture");
        expect(headers.get("x-organization-id")).toBe("org-fixture");
        expect(headers.has("authorization")).toBe(false);
    });

    it("only a definitive verdict signs out: 401 is signedOut, 5xx and network errors are unknown", async () => {
        const responses = [json(null, 401), json({}, 502), json(null)];
        const { fetch } = fakeFetch((_url, _init, index) => responses[index]!);
        const client = createCustomyClient({ baseUrl: "https://app.fixture.invalid", fetch });
        expect((await client.getSession()).status).toBe("signedOut");
        expect((await client.getSession()).status).toBe("unknown");
        expect((await client.getSession()).status).toBe("signedOut");
        const offline = createCustomyClient({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof globalThis.fetch });
        expect((await offline.getSession()).status).toBe("unknown");
    });

    it("never accepts server credentials", () => {
        expect(() => createCustomyClient({ adminSecret: "x" } as never)).toThrow(CustomySdkError);
        expect(() => createCustomyClient({ apiKey: "x", clientSecret: "y" } as never)).toThrow(/apiKey, clientSecret/);
    });
});

describe("sign-in flows", () => {
    it("signs in with email and forwards per-call scope and callback", async () => {
        const { fetch, calls } = fakeFetch(() => json({ url: "/home", redirect: true }));
        const client = createCustomyClient({ baseUrl: "https://app.fixture.invalid", ...scope, fetch });
        const result = await client.signInWithEmail("ana@example.com", "pw", { callbackURL: "/home", environmentId: "env_other" });
        expect(result).toEqual({ url: "/home", redirect: true });
        expect(calls[0]!.url).toBe("https://app.fixture.invalid/api/auth/sign-in/email");
        expect(calls[0]!.init.method).toBe("POST");
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: "ana@example.com", password: "pw", callbackURL: "/home" });
        const headers = new Headers(calls[0]!.init.headers);
        expect(headers.get("x-env-id")).toBe("env_other");
        expect(headers.get("content-type")).toBe("application/json");
    });

    it("surfaces two-factor redirects and neutral error envelopes", async () => {
        const responses = [json({ twoFactorRedirect: true }), json({ error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } }, 401), json({ message: "legacy" }, 400)];
        const { fetch } = fakeFetch((_url, _init, index) => responses[index]!);
        const client = createCustomyClient({ fetch });
        expect(await client.signInWithEmail("a@example.com", "pw")).toEqual({ twoFactorRedirect: true });
        expect(await client.signInWithEmail("a@example.com", "bad")).toEqual({ error: "Invalid email or password", status: 401, code: "INVALID_EMAIL_OR_PASSWORD", retryable: false });
        expect(await client.signUp("Ana", "a@example.com", "pw")).toEqual({ error: "legacy", status: 400, code: "HTTP_400", retryable: false });
    });

    it("flags verificationRequired when sign-up opens no session or sign-in hits EMAIL_NOT_VERIFIED", async () => {
        const responses = [
            json({ token: null, user: { id: "u1" } }),
            json({ token: "t", user: { id: "u2" } }),
            json({ error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" } }, 403),
            json({ error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } }, 401),
        ];
        const { fetch } = fakeFetch((_url, _init, index) => responses[index]!);
        const client = createCustomyClient({ fetch });
        expect(await client.signUp("Ana", "a@example.com", "pw")).toEqual({ url: undefined, redirect: undefined, verificationRequired: true });
        expect(await client.signUp("Ben", "b@example.com", "pw")).toEqual({ url: undefined, redirect: undefined });
        expect(await client.signInWithEmail("a@example.com", "pw")).toEqual({ error: "Email not verified", status: 403, code: "EMAIL_NOT_VERIFIED", retryable: false, verificationRequired: true });
        expect(await client.signInWithEmail("a@example.com", "bad")).toEqual({ error: "Invalid email or password", status: 401, code: "INVALID_EMAIL_OR_PASSWORD", retryable: false });
    });

    it("resends the verification email through the same-origin auth path with scope and callback", async () => {
        const responses = [json({ status: true }), json({ error: { code: "TOO_MANY_REQUESTS", message: "Slow down" } }, 429)];
        const { fetch, calls } = fakeFetch((_url, _init, index) => responses[index]!);
        const client = createCustomyClient({ baseUrl: "https://app.fixture.invalid", ...scope, fetch });
        expect(await client.sendVerificationEmail("a@example.com", { callbackURL: "/premium", environmentId: "env_other" })).toEqual({ success: true });
        expect(calls[0]!.url).toBe("https://app.fixture.invalid/api/auth/send-verification-email");
        expect(calls[0]!.init.method).toBe("POST");
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: "a@example.com", callbackURL: "/premium" });
        expect(new Headers(calls[0]!.init.headers).get("x-env-id")).toBe("env_other");
        const failed = await client.sendVerificationEmail("a@example.com");
        expect(failed).toMatchObject({ status: 429, code: "TOO_MANY_REQUESTS", retryable: true });
    });

    it("reports a timed-out sign-in instead of hanging", async () => {
        const fetch = vi.fn((_input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
        })) as unknown as typeof globalThis.fetch;
        const client = createCustomyClient({ fetch, signInTimeoutMs: 10 });
        expect(await client.signInWithEmail("a@example.com", "pw")).toEqual({ error: "Request timed out. Try again.", status: 408, code: "SDK_TIMEOUT", retryable: true });
    });

    it("signs out, stops impersonation and switches organization through same-origin POSTs", async () => {
        const { fetch, calls } = fakeFetch(() => json({}));
        const client = createCustomyClient({ fetch });
        expect(await client.signOut()).toBe(true);
        expect(await client.stopImpersonation()).toBe(true);
        expect(await client.setActiveOrganization("org_2")).toBe(true);
        expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
            "POST /api/auth/sign-out",
            "POST /api/auth/impersonation/stop",
            "POST /api/auth/organization/set-active",
        ]);
        expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ organizationId: "org_2" });
    });

    it("builds the social redirect URL with the client scope", () => {
        const client = createCustomyClient({ ...scope });
        expect(client.socialSignInUrl("google", { callbackURL: "/after" })).toBe("/api/auth/social-redirect/google?callbackURL=%2Fafter&publishableKey=pk_test_fixture&envId=env_fixture&orgSlug=org-fixture");
        expect(createSocialSignInUrl("git hub")).toBe("/api/auth/social-redirect/git%20hub");
    });

    it("exchanges the session for a single-use realtime ticket", async () => {
        const ok = fakeFetch(() => json({ ticket: "t1", expires_in: 60 }));
        expect(await fetchRealtimeTicket({ fetch: ok.fetch })).toEqual({ ticket: "t1", expires_in: 60 });
        expect(ok.calls[0]!.init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
        const denied = fakeFetch(() => json({}, 401));
        await expect(fetchRealtimeTicket({ fetch: denied.fetch })).rejects.toMatchObject({ code: "REALTIME_TICKET_FAILED", status: 401 });
    });
});

describe("capabilities", () => {
    const matrix = {
        environmentId: "env_fixture",
        organizationId: "org_fixture",
        subject: { userId: "user_1", permissions: [], roles: [] },
        modules: [{ key: "crm", label: "CRM", state: "read_only", visible: true, capabilities: [] }],
        capabilities: [{ capability: "crm.contacts", module: "crm", label: "Contacts", state: "enabled", reason: "", requiredPermissions: [], allowed: true, visible: true }],
    };

    it("retries transient failures of reads and honours Retry-After", async () => {
        const responses = [json({}, 503, { "retry-after": "0" }), json(matrix)];
        const { fetch, calls } = fakeFetch((_url, _init, index) => responses[index]!);
        const client = createCustomyClient({ fetch, organizationId: "org_fixture" });
        expect((await client.capabilities.getMatrix("env_fixture", { userId: "user_1" })).capabilities).toHaveLength(1);
        expect(calls).toHaveLength(2);
        expect(calls[0]!.url).toBe("/api/admin/env/env_fixture/capability-matrix?userId=user_1");
        expect(new Headers(calls[0]!.init.headers).get("x-org-id")).toBe("org_fixture");
    });

    it("throws CustomySdkError with the envelope code on a definitive failure", async () => {
        const { fetch, calls } = fakeFetch(() => json({ error: { code: "FORBIDDEN", message: "No access", requestId: "req_1" } }, 403));
        const client = createCustomyClient({ fetch });
        await expect(client.capabilities.check("env_fixture", "crm.contacts")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403, requestId: "req_1" });
        expect(calls).toHaveLength(1);
    });

    it("bootstraps decisions and module access from one snapshot", async () => {
        const { fetch } = fakeFetch((url) => {
            if (url.includes("capability-matrix")) return json(matrix);
            if (url.includes("visible-modules")) return json({ modules: matrix.modules });
            if (url.includes("usage-status")) return json({ usage: [{ capability: "crm.contacts", current: 10, limit: 10, remaining: 0, status: "exceeded", source: "billing" }] });
            if (url.includes("capability-check/crm.export")) return json({ capability: "crm.export", module: "crm", label: "Export", state: "requires_upgrade", reason: "", requiredPermissions: [], allowed: false, visible: true });
            return json({}, 404);
        });
        const snapshot = await createCustomyClient({ fetch }).capabilities.bootstrap("env_fixture", { capabilities: ["crm.export"] });
        expect(snapshot.canUseCapability("crm.contacts")).toBe(true);
        expect(snapshot.canUseCapability("crm.export")).toBe(false);
        expect(snapshot.canAccessModule("crm", "read")).toBe(true);
        expect(snapshot.canAccessModule("crm", "write")).toBe(false);
        expect(summarizeCapabilityUsage(snapshot.usage).recommendedAction).toBe("upgrade_now");
    });
});

describe("configuration", () => {
    it("resolves public configuration from public environment variables with a production default", () => {
        expect(resolveCustomyAccessClientConfig({ NEXT_PUBLIC_ACCESS_ENV_ID: " env_1 ", NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY: "pk_1" })).toEqual({
            baseUrl: "https://access-api.customy.ai",
            environmentId: "env_1",
            organizationSlug: undefined,
            publishableKey: "pk_1",
        });
    });
});
