import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { customyMiddleware, handleCustomyAuth } from "./nextjs";

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
        expect(cookie).toContain("fixture-session"); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax"); expect(cookie).not.toMatch(/Domain=/i);
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
