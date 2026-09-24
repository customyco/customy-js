import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fixedAuthScopeConfigured, matchesFixedAuthScope, sessionMatchesFixedScope } from "./auth-scope";
import { customyAuthProxyHandlers } from "./nextjs";

const scope = { environmentId: "env_external", organizationSlug: "org_external", publishableKey: "pk_fixture", publicOrigin: "https://app.fixture.invalid" };
const options = { ...scope, accessUrl: "https://access.fixture.invalid", enforceTenantScope: true, allowedAuthPaths: ["get-session", "sign-in/email"] };
const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const session = () => ({ user: { id: "user_1" }, session: { userId: "user_1", environmentId: scope.environmentId, sourceEnvironmentId: scope.environmentId, expiresAt: new Date(Date.now() + 60000).toISOString() } });
afterEach(() => vi.unstubAllGlobals());

describe("external application auth scope", () => {
    it("requires explicit canonical configuration", () => {
        expect(fixedAuthScopeConfigured(scope)).toBe(true);
        for (const key of Object.keys(scope)) expect(fixedAuthScopeConfigured({ ...scope, [key]: undefined })).toBe(false);
        // Origin with embedded credentials must be rejected (synthetic fixture).
        expect(fixedAuthScopeConfigured({ ...scope, publicOrigin: "https://user:pass@app.fixture.invalid" })).toBe(false); // trufflehog:ignore
    });
    it("checks all repeated aliases and callback destinations", () => {
        expect(matchesFixedAuthScope(scope, [["envId", scope.environmentId], ["envId", "env_other"]])).toBe(false);
        expect(matchesFixedAuthScope(scope, [["callbackURL", "//evil.invalid"]])).toBe(false);
        expect(matchesFixedAuthScope(scope, [["callbackURL", "/account"]])).toBe(true);
    });
    it("rejects Workspace projections, unknown sources, expired sessions and impersonation", () => {
        expect(sessionMatchesFixedScope(session(), scope.environmentId)).toBe(true);
        for (const source of [null, undefined, "env_workspace"]) {
            const value = session(); value.session.sourceEnvironmentId = source as string;
            expect(sessionMatchesFixedScope(value, scope.environmentId)).toBe(false);
        }
        expect(sessionMatchesFixedScope({ ...session(), act: { sub: "admin" } }, scope.environmentId)).toBe(false);
        expect(sessionMatchesFixedScope({ ...session(), session: { ...session().session, expiresAt: "2000-01-01" } }, scope.environmentId)).toBe(false);
        expect(sessionMatchesFixedScope({ ...session(), session: { ...session().session, userId: "other" } }, scope.environmentId)).toBe(false);
    });
    it.each(["envId=evil", "env_id=evil", "pk=evil", "organizationId=evil", "envId=env_external&envId=evil"])("rejects query override %s before contacting Access", async (query) => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const result = await customyAuthProxyHandlers(options).GET(new NextRequest(`${scope.publicOrigin}/api/auth/get-session?${query}`), context("get-session"));
        expect(result.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
    });
    it.each(["x-active-environment-id", "x-environment-id", "x-env-id", "x-org-id", "x-organization-id", "x-publishable-key"])("rejects header override %s", async (header) => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const result = await customyAuthProxyHandlers(options).GET(new NextRequest(`${scope.publicOrigin}/api/auth/get-session`, { headers: { [header]: "evil" } }), context("get-session"));
        expect(result.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
    });
    it("rejects unsafe origin, body tenant and unexposed paths", async () => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const handler = customyAuthProxyHandlers(options);
        for (const [origin, body] of [["https://evil.invalid", {}], [scope.publicOrigin, { environmentId: "other" }], [scope.publicOrigin, { callbackURL: "https://evil.invalid" }]] as const) {
            const result = await handler.POST(new NextRequest(`${scope.publicOrigin}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), context("sign-in/email"));
            expect(result.status).toBe(403);
        }
        const blocked = await handler.GET(new NextRequest(`${scope.publicOrigin}/api/auth/sign-in/social?provider=google`), context("sign-in/social"));
        expect(blocked.status).toBe(404); expect(fetch).not.toHaveBeenCalled();
    });
    it("forwards only safe headers with the fixed scope", async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json(session())); vi.stubGlobal("fetch", fetch);
        const result = await customyAuthProxyHandlers(options).GET(new NextRequest(`${scope.publicOrigin}/api/auth/get-session`, { headers: { "x-admin-secret": "client-injection", authorization: "Bearer client", cookie: "session=fixture" } }), context("get-session"));
        expect(result.status).toBe(200);
        const headers = new Headers(fetch.mock.calls[0][1].headers);
        expect(headers.get("x-admin-secret")).toBeNull(); expect(headers.get("authorization")).toBeNull();
        expect(headers.get("x-environment-id")).toBe(scope.environmentId);
    });
    it("does not expose a projected administrative session", async () => {
        const value = session(); value.session.sourceEnvironmentId = "env_workspace";
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(value)));
        const result = await customyAuthProxyHandlers(options).GET(new NextRequest(`${scope.publicOrigin}/api/auth/get-session`), context("get-session"));
        expect(await result.json()).toBeNull(); expect(result.headers.get("cache-control")).toContain("no-store");
    });
});
