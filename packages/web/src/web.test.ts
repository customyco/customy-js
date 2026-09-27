import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
    authPathFromUrl,
    createEdgeClient,
    customyAuthProxyHandlers,
    customyClearOAuthStateHandlers,
    customyMiddleware,
    customySignOutHandlers,
    customySocialRedirectHandlers,
    getServerSession,
    handleCustomyAuth,
    parseAccessCookieName,
    resolveSessionCookie,
    scopeSetCookieToHost,
    serializeCookie,
    splitSetCookieHeader,
    verifyActionSession,
} from "./index";

const ACCESS = "https://access.fixture.invalid";
const APP = "https://app.fixture.invalid";

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        calls.push({ url, init });
        return respond(url, init);
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

function sessionResponse(extraHeaders: [string, string][] = []): Response {
    const headers = new Headers({ "content-type": "application/json" });
    for (const [key, value] of extraHeaders) headers.append(key, value);
    return new Response(JSON.stringify({ user: { id: "user_1", email: "ana@example.com" }, session: { id: "ses_1", userId: "user_1" } }), { status: 200, headers });
}

function setCookies(response: Response): string[] {
    return response.headers.getSetCookie();
}

describe("cookies", () => {
    it("parses Access cookie names and serializes host-only secure cookies", () => {
        expect(parseAccessCookieName("__Secure-customy-prd-abcd1234.session_token")).toMatchObject({ secure: true, envTag: "prd", environmentIdPrefix: "abcd1234", kind: "session_token", current: true });
        const cookie = serializeCookie("__Secure-customy-prd.session_token", "tok.en", { maxAge: 60 });
        expect(cookie).toBe("__Secure-customy-prd.session_token=tok.en; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax");
        expect(cookie).not.toMatch(/Domain=/i);
        expect(() => serializeCookie("bad name", "x")).toThrow(TypeError);
        expect(() => serializeCookie("ok", "a;b")).toThrow(TypeError);
    });

    it("splits combined Set-Cookie headers without breaking Expires dates", () => {
        const combined = "a=1; Path=/; Expires=Thu, 01 Jan 2030 00:00:00 GMT, b=2; Path=/, c=3";
        expect(splitSetCookieHeader(combined)).toEqual(["a=1; Path=/; Expires=Thu, 01 Jan 2030 00:00:00 GMT", "b=2; Path=/", "c=3"]);
    });

    it("scopes Access cookies to the app host: no Domain, no SameSite=None, Secure on https", () => {
        expect(scopeSetCookieToHost("s=1; Domain=.customy.ai; Path=/; SameSite=None; HttpOnly", true)).toBe("s=1; Path=/; SameSite=Lax; HttpOnly; Secure");
        expect(scopeSetCookieToHost("s=1; Path=/", false)).toBe("s=1; Path=/");
    });

    it("prefers the app-scoped current session cookie", () => {
        const header = "customy-stg.session_token=base; legacy-stg-abcd1234.session_token=old; customy-stg-abcd1234.session_token=scoped";
        expect(resolveSessionCookie(header)).toEqual({ cookieName: "customy-stg-abcd1234.session_token", cookieValue: "scoped" });
        expect(resolveSessionCookie("other=1")).toBeNull();
    });
});

describe("auth proxy", () => {
    const options = { accessUrl: ACCESS, publicOrigin: APP, publishableKey: "pk_test_fixture", environmentId: "env_fixture", organizationSlug: "org-fixture" };

    it("forwards to Access with scope and public origin headers and scopes renewed cookies", async () => {
        const { fetch, calls } = fakeFetch(() => sessionResponse([
            ["set-cookie", "__Secure-customy-prd.session_token=renewed; Domain=.fixture.invalid; Path=/; HttpOnly; Secure; SameSite=None"],
            ["set-cookie", "__Secure-customy-prd.session_data=cache; Path=/; HttpOnly; Secure; SameSite=Lax"],
        ]));
        const { GET } = customyAuthProxyHandlers({ ...options, fetch });
        const response = await GET(new Request(`${APP}/api/auth/get-session?x=1`, { headers: { cookie: "__Secure-customy-prd.session_token=abc", host: "app.fixture.invalid" } }));
        expect(response.status).toBe(200);
        expect(calls[0]!.url).toBe(`${ACCESS}/api/auth/get-session?x=1`);
        const sent = new Headers(calls[0]!.init.headers);
        expect(sent.get("x-publishable-key")).toBe("pk_test_fixture");
        expect(sent.get("x-env-id")).toBe("env_fixture");
        expect(sent.get("x-organization-id")).toBe("org-fixture");
        expect(sent.get("x-customy-public-origin")).toBe(APP);
        expect(sent.get("cookie")).toBe("__Secure-customy-prd.session_token=abc");
        expect(sent.has("host")).toBe(false);
        const cookies = setCookies(response);
        expect(cookies).toHaveLength(2);
        expect(cookies[0]).not.toMatch(/Domain=/i);
        expect(cookies[0]).toContain("SameSite=Lax");
        expect(response.headers.get("cache-control")).toContain("no-store");
    });

    it("takes the path from the route context when the framework provides it", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
        const { POST } = customyAuthProxyHandlers({ ...options, fetch });
        await POST(new Request(`${APP}/anything`, { method: "POST", body: "{}", headers: { origin: APP } }), { params: Promise.resolve({ path: ["sign-in", "email"] }) });
        expect(calls[0]!.url).toBe(`${ACCESS}/api/auth/sign-in/email`);
        expect(calls[0]!.init.body).toBe("{}");
    });

    it("rejects cross-site state-changing requests (CSRF) before calling Access", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}"));
        const { POST } = customyAuthProxyHandlers({ ...options, fetch });
        const foreign = await POST(new Request(`${APP}/api/auth/sign-in/email`, { method: "POST", body: "{}", headers: { origin: "https://evil.fixture.invalid" } }));
        expect(foreign.status).toBe(403);
        expect(await foreign.json()).toEqual({ error: { code: "AUTH_ORIGIN_MISMATCH", message: "auth origin mismatch" } });
        const crossSite = await POST(new Request(`${APP}/api/auth/sign-out`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
        expect(crossSite.status).toBe(403);
        expect(calls).toHaveLength(0);
        const sameOrigin = await POST(new Request(`${APP}/api/auth/sign-in/email`, { method: "POST", body: "{}", headers: { origin: APP, "sec-fetch-site": "same-origin" } }));
        expect(sameOrigin.status).toBe(200);
    });

    it("rejects traversal and non-allowlisted paths", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}"));
        const { GET } = customyAuthProxyHandlers({ ...options, fetch, allowedAuthPaths: ["get-session"] });
        expect((await GET(new Request(`${APP}/api/auth/admin/users`))).status).toBe(404);
        expect((await GET(new Request(`${APP}/x`), { params: { path: [".."] } })).status).toBe(404);
        expect(calls).toHaveLength(0);
    });

    it("answers 502 with the neutral envelope when Access is unreachable", async () => {
        const fetch = vi.fn(async () => { throw new TypeError("network"); }) as unknown as typeof globalThis.fetch;
        const response = await customyAuthProxyHandlers({ ...options, fetch }).GET(new Request(`${APP}/api/auth/get-session`));
        expect(response.status).toBe(502);
        expect((await response.json()).error.code).toBe("BAD_GATEWAY");
    });

    it("pins identity with enforceTenantScope", async () => {
        const { fetch, calls } = fakeFetch(() => new Response(JSON.stringify({ user: { id: "u" }, session: { userId: "u", environmentId: "other", sourceEnvironmentId: "other", expiresAt: "2999-01-01T00:00:00Z" } }), { status: 200 }));
        const { GET, POST } = customyAuthProxyHandlers({ ...options, fetch, enforceTenantScope: true });
        expect((await GET(new Request(`${APP}/api/auth/get-session?envId=env_other`))).status).toBe(403);
        const oversized = await POST(new Request(`${APP}/api/auth/sign-in/email`, { method: "POST", headers: { origin: APP }, body: "x".repeat(20_000) }));
        expect(oversized.status).toBe(413);
        const wrongBody = await POST(new Request(`${APP}/api/auth/sign-in/email`, { method: "POST", headers: { origin: APP }, body: JSON.stringify({ environmentId: "env_other" }) }));
        expect(wrongBody.status).toBe(403);
        const projected = await GET(new Request(`${APP}/api/auth/get-session`));
        expect(await projected.json()).toBeNull();
        expect(calls).toHaveLength(1);
    });

    it("rejects a non-https Access URL at construction", () => {
        expect(() => customyAuthProxyHandlers({ accessUrl: "http://access.fixture.invalid" })).toThrow(/https/);
        expect(() => customyAuthProxyHandlers({ accessUrl: "http://127.0.0.1:4001" })).not.toThrow();
    });

    it("derives the Access path from the URL after basePath", () => {
        expect(authPathFromUrl(`${APP}/api/auth/sign-in/email`)).toEqual(["sign-in", "email"]);
        expect(authPathFromUrl(`${APP}/auth/get-session`, "/auth")).toEqual(["get-session"]);
        expect(authPathFromUrl(`${APP}/other`)).toEqual([]);
    });
});

describe("social sign-in", () => {
    it("starts the provider flow with a same-origin callback and redirects", async () => {
        const { fetch, calls } = fakeFetch(() => new Response(JSON.stringify({ url: "https://provider.fixture.invalid/authorize?state=s" }), {
            status: 200,
            headers: { "set-cookie": "__Secure-customy-prd.state=s; Domain=.fixture.invalid; Path=/; HttpOnly; Secure; SameSite=None" },
        }));
        const { GET } = customySocialRedirectHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch });
        const response = await GET(new Request(`${APP}/api/auth/social-redirect/google?callbackURL=https://evil.fixture.invalid/steal`));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("https://provider.fixture.invalid/authorize?state=s");
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ provider: "google", callbackURL: `${APP}/` });
        expect(setCookies(response)[0]).toBe("__Secure-customy-prd.state=s; Path=/; HttpOnly; Secure; SameSite=Lax");
    });

    it("sends the user back to login with the error when Access refuses", async () => {
        const { fetch } = fakeFetch(() => new Response(JSON.stringify({ error: "provider_disabled" }), { status: 400 }));
        const response = await customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch }).GET(new Request(`${APP}/api/auth/sign-in/social?provider=github`));
        expect(response.headers.get("location")).toBe(`${APP}/login?error=provider_disabled`);
    });
});

describe("sign-out and OAuth state", () => {
    it("signs out in Access and expires every auth cookie of the host", async () => {
        const { fetch, calls } = fakeFetch(() => new Response(null, { status: 200 }));
        const { POST } = customySignOutHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch });
        const response = await POST(new Request(`${APP}/api/auth/sign-out`, { method: "POST", headers: { origin: APP, cookie: "__Secure-customy-prd.session_token=a; customy-prd.state=b; theme=dark" } }));
        expect(response.status).toBe(204);
        expect(calls[0]!.url).toBe(`${ACCESS}/api/auth/sign-out`);
        const cookies = setCookies(response);
        expect(cookies.some((cookie) => cookie.startsWith("__Secure-customy-prd.session_token=;") && cookie.includes("Max-Age=0"))).toBe(true);
        expect(cookies.some((cookie) => cookie.startsWith("customy-prd.state=;"))).toBe(true);
        expect(cookies.some((cookie) => cookie.startsWith("theme="))).toBe(false);
    });

    it("clears OAuth state cookies", async () => {
        const response = await customyClearOAuthStateHandlers({ publicOrigin: APP }).POST(new Request(`${APP}/api/auth/clear-state`, { method: "POST", headers: { origin: APP, cookie: "legacy-stg.state=x" } }));
        const cookies = setCookies(response);
        expect(cookies.some((cookie) => cookie.startsWith("legacy-stg.state=;"))).toBe(true);
        expect(cookies.some((cookie) => cookie.startsWith("__Secure-customy-prd.state=;"))).toBe(true);
    });
});

describe("impersonation callback", () => {
    it("exchanges the ticket and sets host-only HttpOnly session cookies", async () => {
        const { fetch, calls } = fakeFetch(() => Response.json({ sessionToken: "fixture-session", expiresIn: 60 }));
        const response = await handleCustomyAuth({ accessUrl: ACCESS, publicOrigin: APP, redirectTo: "/welcome", fetch }).GET(new Request(`${APP}/api/customy/callback?ticket=a%26b`));
        expect(calls[0]!.url).toBe(`${ACCESS}/api/v1/impersonation/exchange?ticket=a%26b`);
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(`${APP}/welcome`);
        const cookies = setCookies(response);
        expect(cookies.length).toBeGreaterThan(0);
        for (const cookie of cookies) {
            expect(cookie).toContain("fixture-session");
            expect(cookie).toContain("HttpOnly");
            expect(cookie).toContain("Secure");
            expect(cookie).toContain("Max-Age=60");
            expect(cookie).not.toMatch(/Domain=/i);
        }
    });

    it("never turns a rejected exchange or a missing ticket into a session", async () => {
        const rejected = fakeFetch(() => new Response("no", { status: 401 }));
        const response = await handleCustomyAuth({ accessUrl: ACCESS, fetch: rejected.fetch }).GET(new Request(`${APP}/api/customy/callback?ticket=t`));
        expect(response.status).toBe(401);
        expect(setCookies(response)).toHaveLength(0);
        const missing = fakeFetch(() => new Response("{}"));
        expect((await handleCustomyAuth({ accessUrl: ACCESS, fetch: missing.fetch }).GET(new Request(`${APP}/api/customy/callback`))).status).toBe(404);
        expect(missing.calls).toHaveLength(0);
    });
});

describe("server session", () => {
    const cookie = "__Secure-customy-prd.session_token=abc";

    it("validates the session cookie in Access and returns renewal cookies", async () => {
        const { fetch, calls } = fakeFetch(() => sessionResponse([["set-cookie", "__Secure-customy-prd.session_token=renewed; Path=/; HttpOnly; Secure; SameSite=Lax"]]));
        const session = await getServerSession(new Request(`${APP}/dashboard`, { headers: { cookie } }), { accessUrl: ACCESS, environmentId: "env_fixture", fetch });
        expect(session?.user.id).toBe("user_1");
        expect(session?.isImpersonated).toBe(false);
        expect(session?.setCookies).toEqual(["__Secure-customy-prd.session_token=renewed; Path=/; HttpOnly; Secure; SameSite=Lax"]);
        const sent = new Headers(calls[0]!.init.headers);
        expect(sent.get("cookie")).toBe(cookie);
        expect(sent.get("x-environment-id")).toBe("env_fixture");
    });

    it("accepts a raw Cookie header and returns null without a cookie or with a rejected session", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("null", { status: 401 }));
        expect(await getServerSession(cookie, { accessUrl: ACCESS, fetch })).toBeNull();
        expect(await getServerSession("", { accessUrl: ACCESS, fetch })).toBeNull();
        expect(calls).toHaveLength(1);
        await expect(verifyActionSession(cookie, { accessUrl: ACCESS, fetch })).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    });

    it("requires a session issued in this app when asked", async () => {
        const { fetch } = fakeFetch(() => sessionResponse());
        expect(await getServerSession(cookie, { accessUrl: ACCESS, requireExactEnvironment: true, environmentId: "env_fixture", fetch })).toBeNull();
    });
});

describe("middleware", () => {
    const base = { accessUrl: ACCESS, publicOrigin: APP, publishableKey: "pk_test_fixture", environmentId: "env_fixture", organizationSlug: "org-fixture" };

    it("redirects to login with callbackUrl when there is no session cookie", async () => {
        const { fetch } = fakeFetch(() => sessionResponse());
        const result = await customyMiddleware({ ...base, fetch })(new Request(`${APP}/dashboard?tab=1`));
        expect(result.action).toBe("respond");
        if (result.action !== "respond") return;
        expect(result.response.headers.get("location")).toBe(`${APP}/login?callbackUrl=%2Fdashboard%3Ftab%3D1`);
    });

    it("lets a valid session through with scope headers and propagates renewal", async () => {
        const { fetch, calls } = fakeFetch(() => sessionResponse([["set-cookie", "__Secure-customy-prd.session_token=renewed; Path=/; HttpOnly; Secure; SameSite=Lax"]]));
        const result = await customyMiddleware({ ...base, fetch })(new Request(`${APP}/`, { headers: { cookie: "__Secure-customy-prd.session_token=abc" } }));
        expect(result.action).toBe("next");
        if (result.action !== "next") return;
        expect(result.responseHeaders?.getSetCookie()).toEqual(["__Secure-customy-prd.session_token=renewed; Path=/; HttpOnly; Secure; SameSite=Lax"]);
        const sent = new Headers(calls[0]!.init.headers);
        expect(sent.get("x-publishable-key")).toBe("pk_test_fixture");
        expect(sent.get("x-organization-id")).toBe("org-fixture");
        expect(sent.get("x-env-id")).toBe("env_fixture");
    });

    it("expires the cookies of a rejected session but keeps them when Access is down", async () => {
        const rejected = fakeFetch(() => new Response("null", { status: 401 }));
        const denied = await customyMiddleware({ ...base, fetch: rejected.fetch })(new Request(`${APP}/`, { headers: { cookie: "__Secure-customy-prd.session_token=abc" } }));
        expect(denied.action === "respond" && setCookies(denied.response).some((value) => value.startsWith("__Secure-customy-prd.session_token=;"))).toBe(true);
        const down = fakeFetch(() => new Response("", { status: 503 }));
        const unavailable = await customyMiddleware({ ...base, fetch: down.fetch })(new Request(`${APP}/`, { headers: { cookie: "__Secure-customy-prd.session_token=abc" } }));
        expect(unavailable.action).toBe("respond");
        if (unavailable.action === "respond") expect(setCookies(unavailable.response)).toHaveLength(0);
    });

    it("injects forwarded and scope headers on API routes and skips public routes", async () => {
        const { fetch, calls } = fakeFetch(() => sessionResponse());
        const middleware = customyMiddleware({ ...base, fetch });
        const api = await middleware(new Request(`${APP}/api/things`));
        expect(api.action === "next" && api.requestHeaders?.get("x-publishable-key")).toBe("pk_test_fixture");
        expect((await middleware(new Request(`${APP}/login`))).action).toBe("next");
        expect(calls).toHaveLength(0);
    });
});

describe("edge session verification", () => {
    it("verifies a session JWT against Access keys and rejects forged ones", async () => {
        const good = await generateKeyPair("RS256");
        const evil = await generateKeyPair("RS256");
        const jwk: JWK = { ...(await exportJWK(good.publicKey)), kid: "k1", alg: "RS256" };
        const sign = (key: CryptoKey, issuer = "customy") => new SignJWT({ sub: "user_1", email: "ana@example.com" })
            .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setIssuedAt().setExpirationTime("5m").sign(key);
        const client = createEdgeClient({ publishableKey: "pk_test_fixture", authUrl: ACCESS, keys: createLocalJWKSet({ keys: [jwk] }) });
        const valid = await client.verifySession(await sign(good.privateKey as CryptoKey));
        expect(valid.isValid).toBe(true);
        expect(valid.user?.sub).toBe("user_1");
        expect((await client.verifySession(await sign(evil.privateKey as CryptoKey))).isValid).toBe(false);
        expect((await client.verifySession(await sign(good.privateKey as CryptoKey, "someone-else"))).isValid).toBe(false);
        expect((await client.verifySession("not-a-jwt")).isValid).toBe(false);
        expect(client.decodeToken(await sign(good.privateKey as CryptoKey))?.email).toBe("ana@example.com");
    });

    it("loads keys from the Access JWKS", async () => {
        const pair = await generateKeyPair("RS256");
        const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
        const { fetch, calls } = fakeFetch(() => Response.json({ keys: [jwk] }));
        const client = createEdgeClient({ publishableKey: "pk_test_fixture", authUrl: ACCESS, jwks: { fetch } });
        const token = await new SignJWT({ sub: "user_1" }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("customy").setExpirationTime("5m").sign(pair.privateKey);
        expect((await client.verifySession(token)).isValid).toBe(true);
        expect(calls[0]!.url).toBe(`${ACCESS}/api/auth/jwks`);
    });
});
