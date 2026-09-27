import { describe, expect, it, vi } from "vitest";
import {
    applySessionCookies,
    callbackPathAllowed,
    crossSiteRequestRejected,
    customyAuthProxyHandlers,
    customyErrorEnvelope,
    customyMiddleware,
    customySignOutHandlers,
    customySocialRedirectHandlers,
    getServerSession,
    resolveCallbackUrl,
} from "./index";

const ACCESS = "https://access.fixture.invalid";
const APP = "https://app.fixture.invalid";

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return respond(String(input), init);
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

const renewal = "__Secure-customy-prd.session_token=renewed; Path=/; HttpOnly; Secure; SameSite=Lax";

function sessionResponse(): Response {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", renewal);
    return new Response(JSON.stringify({ user: { id: "user_1" }, session: { id: "ses_1", userId: "user_1" } }), { status: 200, headers });
}

const post = (headers: Record<string, string>) => new Request(`${APP}/api/auth/sign-in/email`, { method: "POST", body: "{}", headers });

describe("CSRF: una mutación tiene que acreditar su origen", () => {
    const options = { publicOrigin: APP };

    it("rechaza sin Origin salvo Sec-Fetch-Site same-origin/none o Referer propio", () => {
        expect(crossSiteRequestRejected(post({}), options)).toBe(true);
        expect(crossSiteRequestRejected(post({ "sec-fetch-site": "same-site" }), options)).toBe(true);
        expect(crossSiteRequestRejected(post({ referer: "https://evil.fixture.invalid/page" }), options)).toBe(true);
        expect(crossSiteRequestRejected(post({ referer: "not a url" }), options)).toBe(true);
        expect(crossSiteRequestRejected(post({ "sec-fetch-site": "same-origin" }), options)).toBe(false);
        expect(crossSiteRequestRejected(post({ "sec-fetch-site": "none" }), options)).toBe(false);
        expect(crossSiteRequestRejected(post({ referer: `${APP}/login?x=1` }), options)).toBe(false);
    });

    it("con Origin manda Origin: exacto, y `null` no vale", () => {
        expect(crossSiteRequestRejected(post({ origin: APP }), options)).toBe(false);
        expect(crossSiteRequestRejected(post({ origin: "null", "sec-fetch-site": "same-origin" }), options)).toBe(true);
        expect(crossSiteRequestRejected(post({ origin: "https://evil.fixture.invalid", referer: `${APP}/` }), options)).toBe(true);
        expect(crossSiteRequestRejected(post({ origin: APP, "sec-fetch-site": "cross-site" }), options)).toBe(true);
    });

    it("las lecturas no se miran", () => {
        expect(crossSiteRequestRejected(new Request(`${APP}/api/auth/get-session`), options)).toBe(false);
    });

    it("el proxy y el sign-out rechazan la mutación sin Origin antes de llamar a Access", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}"));
        const proxy = customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch });
        expect((await proxy.POST(post({}))).status).toBe(403);
        const signOut = customySignOutHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch });
        expect((await signOut.POST(new Request(`${APP}/api/auth/sign-out`, { method: "POST", headers: { cookie: "a=1" } }))).status).toBe(403);
        expect(calls).toHaveLength(0);
        expect((await proxy.POST(post({ "sec-fetch-site": "same-origin" }))).status).toBe(200);
        expect((await proxy.POST(post({ referer: `${APP}/login` }))).status).toBe(200);
    });

    it("`csrfProtection: false` sigue apagándolo", async () => {
        const { fetch } = fakeFetch(() => new Response("{}"));
        expect((await customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch, csrfProtection: false }).POST(post({}))).status).toBe(200);
    });
});

describe("renovación de sesión", () => {
    const cookie = "__Secure-customy-prd.session_token=abc";

    it("applySessionCookies añade las Set-Cookie de getServerSession a la respuesta", async () => {
        const { fetch } = fakeFetch(() => sessionResponse());
        const session = await getServerSession(cookie, { accessUrl: ACCESS, fetch });
        const response = applySessionCookies(Response.json({ ok: true }), session);
        expect(response.headers.getSetCookie()).toEqual([renewal]);
        expect(await response.json()).toEqual({ ok: true });
    });

    it("copia la respuesta si sus cabeceras son inmutables y deja todo igual sin sesión", async () => {
        const immutable = Response.redirect(`${APP}/home`, 302);
        const applied = applySessionCookies(immutable, { setCookies: [renewal] });
        expect(applied).not.toBe(immutable);
        expect(applied.status).toBe(302);
        expect(applied.headers.get("location")).toBe(`${APP}/home`);
        expect(applied.headers.getSetCookie()).toEqual([renewal]);
        const untouched = Response.json({});
        expect(applySessionCookies(untouched, null)).toBe(untouched);
        const headers = new Headers();
        expect(applySessionCookies(headers, { setCookies: [renewal, ""] }).getSetCookie()).toEqual([renewal]);
    });

    it("acepta el resultado del middleware (responseHeaders)", async () => {
        const { fetch } = fakeFetch(() => sessionResponse());
        const result = await customyMiddleware({ accessUrl: ACCESS, publicOrigin: APP, fetch })(new Request(`${APP}/`, { headers: { cookie } }));
        expect(result.action).toBe("next");
        const response = applySessionCookies(new Response(null), result.action === "next" ? result : null);
        expect(response.headers.getSetCookie()).toEqual([renewal]);
    });

    it("getServerSession acepta cabeceras tipo `headers()` y almacenes de cookies", async () => {
        const { fetch, calls } = fakeFetch(() => sessionResponse());
        const readonlyHeaders = { get: (name: string) => (name === "cookie" ? cookie : null) };
        expect((await getServerSession(readonlyHeaders, { accessUrl: ACCESS, fetch }))?.user.id).toBe("user_1");
        const store = { getAll: () => [{ name: "__Secure-customy-prd.session_token", value: "abc" }, { name: "theme", value: "dark" }] };
        expect((await getServerSession(store, { accessUrl: ACCESS, fetch }))?.user.id).toBe("user_1");
        expect(new Headers(calls[1]!.init.headers).get("cookie")).toBe(cookie);
        expect(await getServerSession({ get: () => undefined }, { accessUrl: ACCESS, fetch })).toBeNull();
        expect(calls).toHaveLength(2);
    });
});

describe("destino del login social", () => {
    it("por defecto, cualquier ruta del origen público; fuera del origen manda defaultCallbackPath", () => {
        const options = { defaultCallbackPath: "/dashboard" };
        expect(resolveCallbackUrl("/settings?tab=1", APP, options)).toBe(`${APP}/settings?tab=1`);
        expect(resolveCallbackUrl(`${APP}/x`, APP, options)).toBe(`${APP}/x`);
        for (const hostile of ["https://evil.fixture.invalid/", "//evil.fixture.invalid/", "/\\evil.fixture.invalid", "javascript:alert(1)", "http://app.fixture.invalid/"]) {
            expect(resolveCallbackUrl(hostile, APP, options)).toBe(`${APP}/dashboard`);
        }
        expect(resolveCallbackUrl(null, APP, options)).toBe(`${APP}/dashboard`);
        expect(resolveCallbackUrl(null, APP)).toBe(`${APP}/`);
    });

    it("allowedCallbackPaths admite la ruta y sus subrutas, nada más", () => {
        expect(callbackPathAllowed("/app", ["/app"])).toBe(true);
        expect(callbackPathAllowed("/app/x", ["/app/"])).toBe(true);
        expect(callbackPathAllowed("/application", ["/app"])).toBe(false);
        const options = { defaultCallbackPath: "/app", allowedCallbackPaths: ["/app", "/onboarding"] };
        expect(resolveCallbackUrl("/onboarding/step-2", APP, options)).toBe(`${APP}/onboarding/step-2`);
        expect(resolveCallbackUrl("/admin", APP, options)).toBe(`${APP}/app`);
        expect(resolveCallbackUrl("/app/../admin", APP, options)).toBe(`${APP}/app`);
    });

    it("isCallbackAllowed decide también (y un validador que lanza niega)", () => {
        const options = { defaultCallbackPath: "/", isCallbackAllowed: (url: URL) => !url.searchParams.has("impersonate") };
        expect(resolveCallbackUrl("/x?impersonate=1", APP, options)).toBe(`${APP}/`);
        expect(resolveCallbackUrl("/x", APP, options)).toBe(`${APP}/x`);
        expect(resolveCallbackUrl("/x", APP, { isCallbackAllowed: () => { throw new Error("boom"); } })).toBe(`${APP}/`);
    });

    it("el handler social respeta la lista de la app", async () => {
        const { fetch, calls } = fakeFetch(() => Response.json({ url: "https://provider.fixture.invalid/authorize" }));
        const { GET } = customySocialRedirectHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch, defaultCallbackPath: "/app", allowedCallbackPaths: ["/app"] });
        await GET(new Request(`${APP}/api/auth/social-redirect/google?callbackURL=/admin`));
        await GET(new Request(`${APP}/api/auth/social-redirect/google?callbackURL=/app/reports`));
        expect(calls.map((call) => JSON.parse(String(call.init.body)).callbackURL)).toEqual([`${APP}/app`, `${APP}/app/reports`]);
    });
});

describe("sobre de error del proxy", () => {
    const options = { accessUrl: ACCESS, publicOrigin: APP };
    const signIn = () => post({ origin: APP });

    it("normaliza el error de Access a { error: { code, message } } conservando los campos planos", async () => {
        const { fetch } = fakeFetch(() => Response.json({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, { status: 401 }));
        const response = await customyAuthProxyHandlers({ ...options, fetch }).POST(signIn());
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
            code: "INVALID_EMAIL_OR_PASSWORD",
            message: "Invalid email or password",
        });
    });

    it("un `error` de texto libre pasa a mensaje con código HTTP_<estado>", () => {
        expect(customyErrorEnvelope({ error: "Something went wrong" }, 500)).toEqual({ error: { code: "HTTP_500", message: "Something went wrong" }, code: "HTTP_500", message: "Something went wrong" });
        expect(customyErrorEnvelope({ error: { code: "RATE_LIMITED", message: "slow down", requestId: "req_1" } }, 429).error).toEqual({ code: "RATE_LIMITED", message: "slow down", requestId: "req_1" });
        expect(customyErrorEnvelope(null, 503).error.code).toBe("HTTP_503");
    });

    it("deja pasar lo que no es un error JSON y se puede apagar", async () => {
        const text = fakeFetch(() => new Response("oops", { status: 500, headers: { "content-type": "text/plain" } }));
        expect(await (await customyAuthProxyHandlers({ ...options, fetch: text.fetch }).POST(signIn())).text()).toBe("oops");
        const raw = fakeFetch(() => Response.json({ code: "X" }, { status: 400 }));
        expect(await (await customyAuthProxyHandlers({ ...options, fetch: raw.fetch, normalizeErrors: false }).POST(signIn())).json()).toEqual({ code: "X" });
        const ok = fakeFetch(() => Response.json({ redirect: false }));
        expect(await (await customyAuthProxyHandlers({ ...options, fetch: ok.fetch }).POST(signIn())).json()).toEqual({ redirect: false });
    });
});

describe("cabecera de organización", () => {
    it("envía el slug en x-organization-slug y en x-organization-id", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}"));
        await customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, organizationSlug: "org-fixture", fetch }).GET(new Request(`${APP}/api/auth/get-session`));
        const sent = new Headers(calls[0]!.init.headers);
        expect(sent.get("x-organization-slug")).toBe("org-fixture");
        expect(sent.get("x-organization-id")).toBe("org-fixture");
    });

    it("lee cualquiera de las dos que traiga la petición y reenvía ambas", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}"));
        const proxy = customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch });
        await proxy.GET(new Request(`${APP}/api/auth/get-session`, { headers: { "x-organization-slug": "from-slug" } }));
        await proxy.GET(new Request(`${APP}/api/auth/get-session`, { headers: { "x-organization-id": "from-legacy" } }));
        expect(calls.map((call) => [new Headers(call.init.headers).get("x-organization-slug"), new Headers(call.init.headers).get("x-organization-id")]))
            .toEqual([["from-slug", "from-slug"], ["from-legacy", "from-legacy"]]);
    });

    it("con el ámbito fijo, un slug ajeno en la cabecera nueva se rechaza", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("{}"));
        const proxy = customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch, enforceTenantScope: true, publishableKey: "pk_test_fixture", environmentId: "env_fixture", organizationSlug: "org-fixture" });
        expect((await proxy.GET(new Request(`${APP}/api/auth/get-session`, { headers: { "x-organization-slug": "other" } }))).status).toBe(403);
        expect(calls).toHaveLength(0);
    });
});

describe("enlace mágico", () => {
    it("la ruta vieja magic-link/send llega a sign-in/magic-link (y la lista blanca mira la nueva)", async () => {
        const { fetch, calls } = fakeFetch(() => Response.json({ status: true }));
        const proxy = customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch, allowedAuthPaths: ["sign-in/magic-link"] });
        const request = (path: string) => new Request(`${APP}/api/auth/${path}`, { method: "POST", body: "{}", headers: { origin: APP } });
        expect((await proxy.POST(request("magic-link/send"))).status).toBe(200);
        expect((await proxy.POST(request("sign-in/magic-link"))).status).toBe(200);
        expect(calls.map((call) => call.url)).toEqual([`${ACCESS}/api/auth/sign-in/magic-link`, `${ACCESS}/api/auth/sign-in/magic-link`]);
    });
});

describe("origen detrás de proxies", () => {
    const behindProxy = (extra: Record<string, string> = {}) => new Request("http://10.0.0.8:3000/api/auth/sign-in/email", {
        method: "POST",
        body: "{}",
        headers: { host: "10.0.0.8:3000", "x-forwarded-host": "edge-hop.proxy.internal", "x-forwarded-proto": "http", origin: APP, ...extra },
    });

    it("con publicOrigin manda él: el host reenviado por el último proxy no rechaza el login", async () => {
        expect(crossSiteRequestRejected(behindProxy(), { publicOrigin: APP })).toBe(false);
        const { fetch, calls } = fakeFetch(() => Response.json({}));
        expect((await customyAuthProxyHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch }).POST(behindProxy())).status).toBe(200);
        const sent = new Headers(calls[0]!.init.headers);
        expect(sent.get("x-forwarded-host")).toBe("app.fixture.invalid");
        expect(sent.get("x-forwarded-proto")).toBe("https");
        expect(sent.get("x-customy-public-origin")).toBe(APP);
    });

    it("trustProxyHeaders vuelve a dar prioridad a las cabeceras reenviadas", () => {
        expect(crossSiteRequestRejected(behindProxy(), { publicOrigin: APP, trustProxyHeaders: true })).toBe(true);
        expect(crossSiteRequestRejected(behindProxy({ origin: "http://edge-hop.proxy.internal" }), { publicOrigin: APP, trustProxyHeaders: true })).toBe(false);
    });

    it("el callback social se canoniza con publicOrigin", async () => {
        const { fetch, calls } = fakeFetch(() => Response.json({ url: "https://provider.fixture.invalid/authorize" }));
        const request = new Request("http://10.0.0.8:3000/api/auth/social-redirect/google?callbackURL=/app", { headers: { "x-forwarded-host": "edge-hop.proxy.internal" } });
        await customySocialRedirectHandlers({ accessUrl: ACCESS, publicOrigin: APP, fetch }).GET(request);
        expect(JSON.parse(String(calls[0]!.init.body)).callbackURL).toBe(`${APP}/app`);
    });
});
