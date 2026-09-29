import { describe, expect, it, vi } from "vitest";
import { isAccessUnavailable } from "./tokens";
import { fetchUserInfo } from "./userinfo";

const ISSUER = "https://access.fixture.invalid";
const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("fetchUserInfo", () => {
    it("reads the profile with the user's own token and reports email_verified", async () => {
        const f = vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response(JSON.stringify({ sub: "usr_1", email: "a@example.com", email_verified: true, name: "Ana", org_id: "o" }), { status: 200 })) as unknown as typeof fetch;
        const info = await fetchUserInfo("tok", { issuer: ISSUER, fetch: f });
        expect(info).toEqual({ subject: "usr_1", email: "a@example.com", emailVerified: true, name: "Ana" });
        const [url, init] = (f as unknown as { mock: { calls: [URL, RequestInit][] } }).mock.calls[0]!;
        expect(String(url)).toBe(`${ISSUER}/oauth/userinfo`);
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    });

    it("never assumes verified: an absent or non-boolean claim is null; false stays false", async () => {
        expect((await fetchUserInfo("t", { issuer: ISSUER, fetch: respond({ sub: "u" }) }))?.emailVerified).toBeNull();
        expect((await fetchUserInfo("t", { issuer: ISSUER, fetch: respond({ sub: "u", email_verified: "true" }) }))?.emailVerified).toBeNull();
        expect((await fetchUserInfo("t", { issuer: ISSUER, fetch: respond({ sub: "u", email_verified: false }) }))?.emailVerified).toBe(false);
    });

    it("returns null for an unknown token or another subject", async () => {
        expect(await fetchUserInfo("bad", { issuer: ISSUER, fetch: respond({ error: "invalid_token" }, 401) })).toBeNull();
        expect(await fetchUserInfo("t", { issuer: ISSUER, expectedSubject: "usr_me", fetch: respond({ sub: "usr_other", email_verified: true }) })).toBeNull();
        expect(await fetchUserInfo("", { issuer: ISSUER, fetch: respond({ sub: "u" }) })).toBeNull();
    });

    it("fails as ACCESS_UNAVAILABLE (never as 'not verified') when Access cannot answer", async () => {
        const cases: typeof fetch[] = [respond({}, 500), respond({}, 429), respond({ nosub: true }), respond("not json" as never), (async () => { throw new Error("down"); }) as unknown as typeof fetch];
        for (const f of cases) await expect(fetchUserInfo("t", { issuer: ISSUER, fetch: f })).rejects.toSatisfy(isAccessUnavailable);
    });

    it("refuses an endpoint outside the issuer origin or without https", async () => {
        await expect(fetchUserInfo("t", { issuer: ISSUER, endpoint: "https://evil.invalid/oauth/userinfo", fetch: respond({ sub: "u" }) })).rejects.toThrow(/issuer origin/);
        await expect(fetchUserInfo("t", { issuer: ISSUER, endpoint: "http://access.fixture.invalid/oauth/userinfo", fetch: respond({ sub: "u" }) })).rejects.toThrow(/issuer origin/);
    });
});
