import { beforeEach, describe, expect, it } from "vitest";
import { base64url, createCustomyNativeAuth, CustomyNativeAuthError, redirectMatches, type NativeBrowser, type NativeStorage } from "./native";

const nodeCrypto = {
    randomBytes: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (d: Uint8Array) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", d as Uint8Array<ArrayBuffer>)),
};

function memoryStorage(): NativeStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v), delete: async (k) => void data.delete(k) };
}

const idToken = (claims: Record<string, unknown>) => `h.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.s`;

/** A fake Access that checks PKCE like the real one. */
function fakeAccess() {
    const codes = new Map<string, { challenge: string; redirect: string }>();
    const refresh = new Set<string>();
    const calls: string[] = [];
    let n = 0;
    const issue = () => {
        const rt = `crt1.rt${++n}`;
        refresh.add(rt);
        return { access_token: `at${n}`, id_token: idToken({ sub: "user_1", email: "ana@example.com", name: "Ana", email_verified: true }), refresh_token: rt, expires_in: 3600 };
    };
    const fetcher = (async (input: string, init: RequestInit = {}) => {
        const url = new URL(input);
        calls.push(`${init.method ?? "GET"} ${url.pathname}`);
        const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
        if (url.pathname === "/api/public/auth-config") {
            return json({ organization: { id: "org_1", name: "Acme", slug: "acme" }, environment: { id: "env_1", name: "prod", type: "production" }, providers: [{ id: "p1", providerId: "google", name: "Google", type: "social" }], native: { clients: [{ clientId: "mcpcli_app", redirectUris: ["myapp://auth", "exp://*"] }] } });
        }
        if (url.pathname === "/api/auth/sign-in/email") {
            const body = JSON.parse(String(init.body));
            if (body.password !== "correct-horse") return json({ code: "INVALID_EMAIL_OR_PASSWORD" }, 401);
            expect((init.headers as Record<string, string>)["x-environment-id"]).toBe("env_1");
            return json({ token: "sessTOKEN123456789012" }, 200, { "set-auth-token": "sessTOKEN123456789012" });
        }
        if (url.pathname === "/api/auth/native/authorize") {
            expect((init.headers as Record<string, string>).authorization).toBe("Bearer sessTOKEN123456789012");
            const body = JSON.parse(String(init.body));
            expect(body.scope).toContain("offline_access");
            const code = `code${codes.size + 1}x${Date.now()}`;
            codes.set(code, { challenge: body.code_challenge, redirect: body.redirect_uri });
            return json({ code, state: body.state });
        }
        if (url.pathname === "/oauth/token") {
            const p = new URLSearchParams(String(init.body));
            if (p.get("grant_type") === "authorization_code") {
                const rec = codes.get(p.get("code")!);
                codes.delete(p.get("code")!);
                const ok = rec && rec.redirect === p.get("redirect_uri") && base64url(await nodeCrypto.sha256(new TextEncoder().encode(p.get("code_verifier")!))) === rec.challenge;
                return ok ? json(issue()) : json({ error: "invalid_grant" }, 400);
            }
            if (p.get("grant_type") === "refresh_token") {
                const rt = p.get("refresh_token")!;
                if (!refresh.delete(rt)) return json({ error: "invalid_grant" }, 400);
                return json(issue());
            }
        }
        if (url.pathname === "/oauth/revoke") {
            refresh.delete(new URLSearchParams(String(init.body)).get("token")!);
            return json({});
        }
        return json({ error: "not_found" }, 404);
    }) as typeof fetch;
    return { fetcher, codes, refresh, calls };
}

function browserReturning(fn: (url: string) => string | null): NativeBrowser & { opened: string[] } {
    const opened: string[] = [];
    return { opened, openAuthSession: async (url) => { opened.push(url); const back = fn(url); return back ? { type: "success", url: back } : { type: "cancel" }; } };
}

describe("@customyai/client/native", () => {
    let access: ReturnType<typeof fakeAccess>;
    let storage: ReturnType<typeof memoryStorage>;
    beforeEach(() => {
        access = fakeAccess();
        storage = memoryStorage();
    });
    const make = (browser: NativeBrowser = browserReturning(() => null), redirectUri = "myapp://auth") =>
        createCustomyNativeAuth({ publishableKey: "pk_production_abc", accessUrl: "https://access.test", authOrigin: "https://app.test", redirectUri, storage, browser, crypto: nodeCrypto, fetch: access.fetcher });

    it("base64url and the redirect rule match the server's", () => {
        for (let len = 0; len < 20; len++) {
            const b = globalThis.crypto.getRandomValues(new Uint8Array(len));
            expect(base64url(b)).toBe(btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
        }
        expect(redirectMatches(["exp://*"], "exp://10.0.0.7:8081/--/auth")).toBe(true);
        expect(redirectMatches(["myapp://auth"], "exp://10.0.0.7:8081/--/auth")).toBe(false);
    });

    it("discovers organization, environment, providers and the app's native client from the publishable key", async () => {
        const auth = make(undefined, "exp://10.0.0.7:8081/--/auth");
        const c = await auth.discover();
        expect(c).toMatchObject({ clientId: "mcpcli_app", environment: { id: "env_1" }, organization: { id: "org_1" } });
        expect(c.providers.map((p) => p.providerId)).toEqual(["google"]);
        await expect(make(undefined, "otherapp://auth").discover()).rejects.toMatchObject({ code: "NATIVE_CLIENT_NOT_REGISTERED" });
    });

    it("password: session → PKCE code → tokens; only the refresh token stays on the device", async () => {
        const auth = make();
        await auth.signInWithPassword("ana@example.com", "correct-horse");
        expect(auth.status).toBe("signedIn");
        expect(await auth.getAccessToken()).toBe("at1");
        expect(auth.user()).toMatchObject({ id: "user_1", email: "ana@example.com", name: "Ana" });
        expect([...storage.data.values()]).toEqual(["crt1.rt1"]);
        expect([...storage.data.values()].join()).not.toContain("sessTOKEN");
        await expect(make().signInWithPassword("ana@example.com", "wrong")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    });

    it("Google: the system browser opens Access's native start on the app's web origin; the code comes back to the app", async () => {
        const browser = browserReturning((url) => {
            const u = new URL(url);
            expect(u.origin + u.pathname).toBe("https://app.test/api/auth/native/start");
            expect(u.searchParams.get("provider")).toBe("google");
            expect(u.searchParams.get("code_challenge_method")).toBe("S256");
            expect(u.searchParams.has("scope")).toBe(false);
            const code = "codeG";
            access.codes.set(code, { challenge: u.searchParams.get("code_challenge")!, redirect: "myapp://auth" });
            return `myapp://auth?code=${code}&state=${u.searchParams.get("state")}`;
        });
        const auth = make(browser);
        await auth.signInWithProvider("google");
        expect(auth.status).toBe("signedIn");
        await expect(auth.signInWithProvider("apple")).rejects.toMatchObject({ code: "PROVIDER_NOT_ENABLED" });
    });

    it("Google: a forged state or a cancelled browser never signs in", async () => {
        const forged = make(browserReturning(() => "myapp://auth?code=x&state=forged"));
        await expect(forged.signInWithProvider("google")).rejects.toBeInstanceOf(CustomyNativeAuthError);
        expect(forged.status).not.toBe("signedIn");
        await expect(make(browserReturning(() => null)).signInWithProvider("google")).rejects.toMatchObject({ code: "CANCELLED" });
    });

    it("access tokens renew silently with rotating refresh tokens; restore works after the app restarts", async () => {
        const auth = make();
        await auth.signInWithPassword("ana@example.com", "correct-horse");
        expect(await auth.getAccessToken(true)).toBe("at2");
        expect(storage.data.get("customy.pk_production_abc.refresh")).toBe("crt1.rt2");
        expect(access.refresh.has("crt1.rt1")).toBe(false);
        // A fresh start of the app reads the stored refresh token.
        const again = make();
        await again.restore();
        expect(again.status).toBe("signedIn");
        expect(await again.getAccessToken()).toBe("at3");
    });

    it("a revoked or expired session signs the person out cleanly", async () => {
        const auth = make();
        await auth.signInWithPassword("ana@example.com", "correct-horse");
        access.refresh.clear();
        await expect(auth.getAccessToken(true)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
        expect(auth.status).toBe("signedOut");
        expect(storage.data.size).toBe(0);
    });

    it("sign-out revokes the refresh token at Access and forgets it", async () => {
        const auth = make();
        await auth.signInWithPassword("ana@example.com", "correct-horse");
        await auth.signOut();
        expect(auth.status).toBe("signedOut");
        expect(storage.data.size).toBe(0);
        expect(access.refresh.size).toBe(0);
        expect(access.calls).toContain("POST /oauth/revoke");
    });
});
