import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { customyAuthProxyHandlers, customyMiddleware, handleCustomyAuth } from "./nextjs";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
});

describe("auth callback public request contract", () => {
    // A compile-time assertion as well as a runtime fixture: no casts, private
    // Next symbols, request cookies, or SDK-owned NextURL instance are needed.
    const request = (ticket = "fixture-ticket"): Parameters<ReturnType<typeof handleCustomyAuth>["GET"]>[0] => ({
        headers: new Headers({ "x-forwarded-host": "app.fixture.invalid", "x-forwarded-proto": "https" }),
        nextUrl: new URL(`http://localhost:3000/api/customy/callback${ticket ? `?ticket=${ticket}` : ""}`),
    });
    it.each(["GET", "POST"] as const)("accepts the public request shape for %s and keeps host-only protected cookies", async (method) => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ sessionToken: "fixture-session", expiresIn: 60 }));
        vi.stubGlobal("fetch", fetch);
        const result = await handleCustomyAuth({ accessUrl: "https://access.fixture.invalid", redirectTo: "/welcome" })[method](request());
        expect(fetch).toHaveBeenCalledExactlyOnceWith("https://access.fixture.invalid/api/v1/impersonation/exchange?ticket=fixture-ticket", expect.objectContaining({ method: "GET" }));
        expect(result.status).toBe(307); expect(result.headers.get("location")).toBe("https://app.fixture.invalid/welcome");
        const cookie = result.headers.get("set-cookie");
        expect(cookie).toContain("fixture-session"); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toMatch(/SameSite=lax/i); expect(cookie).not.toMatch(/Domain=/i);
    });
    it("does not exchange or create cookies without a ticket", async () => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const result = await handleCustomyAuth().GET(request(""));
        expect(result.status).toBe(404); expect(result.headers.get("set-cookie")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    });
    it("does not turn a rejected exchange into a session", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Fixture rejected", { status: 401 })));
        const result = await handleCustomyAuth({ accessUrl: "https://access.fixture.invalid" }).GET(request());
        expect(result.status).toBe(401); expect(result.headers.get("set-cookie")).toBeNull();
    });
});

describe("customyMiddleware", () => {
    it("forwards tenant scope when validating an existing session", async () => {
        process.env.NEXT_PUBLIC_ORG_SLUG = "customy-core";
        process.env.NEXT_PUBLIC_ACCESS_ENV_ID = "env_prod";

        const fetchCalls: Array<[input: RequestInfo | URL, init?: RequestInit]> = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            fetchCalls.push([input, init]);
            return new Response(JSON.stringify({
                user: { id: "user_1" },
                session: { id: "session_1" },
            }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const middleware = customyMiddleware({
            accessUrl: "https://access-api.customy.ai",
            loginUrl: "/login",
            publishableKey: "pk_live_test",
            publicOrigin: "https://agent.customy.ai",
        });

        const request = new NextRequest("https://agent.customy.ai/", {
            headers: {
                cookie: "__Secure-customy-prd.session_token=session-token",
                host: "agent.customy.ai",
            },
        });

        await middleware(request);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchCalls[0]!;
        const headers = new Headers(init?.headers);
        expect(headers.get("x-publishable-key")).toBe("pk_live_test");
        expect(headers.get("x-organization-id")).toBe("customy-core");
        expect(headers.get("x-env-id")).toBe("env_prod");
        expect(headers.get("x-environment-id")).toBe("env_prod");
    });
});

describe("adaptador sobre @customyai/web", () => {
    it("reenvía /api/auth/* a Access y devuelve NextResponse con las cookies de host", async () => {
        const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers({ "content-type": "application/json" });
            headers.append("set-cookie", "__Secure-customy-prd.session_token=abc; Domain=.customy.ai; Path=/; HttpOnly; Secure; SameSite=None");
            return new Response(JSON.stringify({ ok: true, url: String(input), origin: new Headers(init?.headers).get("x-customy-public-origin") }), { status: 200, headers });
        });
        vi.stubGlobal("fetch", fetch);
        const { POST } = customyAuthProxyHandlers({ accessUrl: "https://access-api.fixture.invalid", publishableKey: "pk_fixture" });
        const request = new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
            method: "POST",
            body: JSON.stringify({ email: "a@fixture.invalid", password: "x" }),
            headers: { "content-type": "application/json", "x-forwarded-host": "app.customy.ai" },
        });
        const response = await POST(request, { params: Promise.resolve({ path: ["sign-in", "email"] }) });
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(200);
        const body = await response.json() as { url: string; origin: string };
        expect(body.url).toBe("https://access-api.fixture.invalid/api/auth/sign-in/email");
        // Sin x-forwarded-proto, un host *.customy.ai es https (0.x).
        expect(body.origin).toBe("https://app.customy.ai");
        const cookie = response.headers.get("set-cookie") ?? "";
        expect(cookie).toContain("session_token=abc");
        expect(cookie).not.toMatch(/Domain=/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(new Headers(fetch.mock.calls[0]![1]!.headers).get("x-publishable-key")).toBe("pk_fixture");
    });

    it("Access caído responde el 502 de 0.x", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
        const { GET } = customyAuthProxyHandlers({ accessUrl: "https://access-api.fixture.invalid" });
        const response = await GET(new NextRequest("https://app.fixture.invalid/api/auth/get-session"), { params: Promise.resolve({ path: ["get-session"] }) });
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "BAD_GATEWAY", message: "Customy Access is temporarily unavailable", statusCode: 502 });
    });

    it("una URL interna http de Access sigue saliendo por http, sin cambiar de host", async () => {
        const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(null));
        vi.stubGlobal("fetch", fetch);
        const { GET } = customyAuthProxyHandlers({ accessUrl: "http://customy-access:4001" });
        const response = await GET(new NextRequest("https://app.fixture.invalid/api/auth/get-session"), { params: Promise.resolve({ path: ["get-session"] }) });
        expect(response.status).toBe(200);
        expect(String(fetch.mock.calls[0]![0])).toBe("http://customy-access:4001/api/auth/get-session");
    });

    it("el middleware deja pasar una sesión válida y manda al login sin cookie", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({ user: { id: "user_1" }, session: { id: "s_1" } })));
        const middleware = customyMiddleware({ accessUrl: "https://access-api.fixture.invalid", publicOrigin: "https://app.fixture.invalid" });
        const ok = await middleware(new NextRequest("https://app.fixture.invalid/dashboard", { headers: { cookie: "__Secure-customy-prd.session_token=t" } }));
        expect(ok.headers.get("x-middleware-next")).toBe("1");
        const denied = await middleware(new NextRequest("https://app.fixture.invalid/dashboard?tab=1"));
        expect(denied.status).toBe(307);
        expect(denied.headers.get("location")).toBe("https://app.fixture.invalid/login?callbackUrl=%2Fdashboard%3Ftab%3D1");
    });
});
