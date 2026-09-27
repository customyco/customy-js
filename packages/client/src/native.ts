/**
 * @customyai/client/native — Customy Access for native apps (React Native, Expo, any JS
 * runtime with fetch). The app gives only its publishable key and the Access URL; everything
 * else is discovered: organization, environment, sign-in providers and the app's registered
 * native client (`GET /api/public/auth-config?publishableKey=…`).
 *
 * Standards: OAuth 2.1 for native apps (RFC 8252) — authorization code with PKCE S256, the
 * system browser for social providers (private session), rotating refresh tokens kept in the
 * device's secure storage, revocation on sign-out (RFC 7009). The Access session never stays
 * on the device: only the refresh token does, sealed by Access and bound to that session.
 *
 * Nothing platform-specific lives here: storage, browser and crypto are adapters the app
 * passes in (see the README for Expo: expo-secure-store, expo-web-browser, expo-crypto).
 */

export type NativeStorage = {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
};

export type NativeBrowserResult = { type: "success"; url: string } | { type: "cancel" | "dismiss" | "locked" };
export type NativeBrowser = {
    /** Opens `url` in the system's auth browser and resolves when it navigates to `redirectUri`. */
    openAuthSession(url: string, redirectUri: string): Promise<NativeBrowserResult>;
};

export type NativeCrypto = {
    randomBytes(length: number): Uint8Array;
    sha256(data: Uint8Array): Promise<Uint8Array>;
};

export type CustomyNativeAuthOptions = {
    /** The environment's publishable key (pk_…). Public. */
    publishableKey: string;
    /** Access API URL, e.g. https://access-api.customy.ai. */
    accessUrl: string;
    /** Where Access sends the app back (registered on the app's native client): `myapp://auth`. */
    redirectUri: string;
    /**
     * Web origin that proxies `/api/auth/*` for this app (its web domain). Social providers
     * return there, so the callbacks already registered with them are reused. Default: accessUrl.
     */
    authOrigin?: string;
    storage: NativeStorage;
    browser: NativeBrowser;
    crypto: NativeCrypto;
    /** OAuth scopes; offline_access is always added (refresh tokens). */
    scopes?: string[];
    fetch?: typeof fetch;
    /** Storage key prefix (one per environment/app). Default: `customy.<publishableKey>`. */
    storageKey?: string;
};

export type NativeAuthConfig = {
    organization: { id: string; name: string; slug: string };
    environment: { id: string; name: string; type: string };
    providers: Array<{ id: string; providerId: string; name: string; type: string }>;
    clientId: string;
};

export type NativeUser = { id: string; email: string | null; name: string | null; picture: string | null; emailVerified: boolean };

export type NativeAuthStatus = "loading" | "signedOut" | "signedIn";

export type CustomyNativeErrorCode =
    | "INVALID_CREDENTIALS"
    | "EMAIL_NOT_VERIFIED"
    | "USER_ALREADY_EXISTS"
    | "WEAK_PASSWORD"
    | "CANCELLED"
    | "SESSION_EXPIRED"
    | "NETWORK"
    | "NATIVE_CLIENT_NOT_REGISTERED"
    | "PROVIDER_NOT_ENABLED"
    | "CONFIGURATION"
    | "UNKNOWN";

export class CustomyNativeAuthError extends Error {
    constructor(readonly code: CustomyNativeErrorCode, message?: string) {
        super(message ?? code);
        this.name = "CustomyNativeAuthError";
    }
}

type Tokens = { accessToken: string; idToken: string | null; expiresAt: number; refreshToken: string };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64url(bytes: Uint8Array): string {
    let out = "";
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
        out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
    }
    const rest = bytes.length - i;
    if (rest === 1) {
        const n = bytes[i]! << 16;
        out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    } else if (rest === 2) {
        const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
        out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
    }
    return out;
}

function utf8(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/** RFC 7636: 64-char verifier and its S256 challenge. */
export async function createPkce(crypto: NativeCrypto) {
    const verifier = base64url(crypto.randomBytes(48));
    return { verifier, challenge: base64url(await crypto.sha256(utf8(verifier))) };
}

/** The Expo Go development redirect matches a client that registered `exp://*`. */
export function redirectMatches(registered: string[], redirectUri: string) {
    if (registered.includes(redirectUri)) return true;
    return registered.includes("exp://*") && /^exp:\/\/[A-Za-z0-9.-]{1,253}(:\d{1,5})?\/--\/[A-Za-z0-9/_-]{0,64}$/.test(redirectUri);
}

function decodeJwt(token: string | null): Record<string, unknown> | null {
    if (!token) return null;
    const part = token.split(".")[1];
    if (!part) return null;
    try {
        const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
        const buffer = (globalThis as { Buffer?: { from(data: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
        const binary = typeof atob === "function" ? atob(b64) : buffer ? buffer.from(b64, "base64").toString("binary") : "";
        const json = decodeURIComponent(Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
        return JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function createCustomyNativeAuth(options: CustomyNativeAuthOptions) {
    const accessUrl = options.accessUrl.replace(/\/$/, "");
    const authOrigin = (options.authOrigin ?? accessUrl).replace(/\/$/, "");
    const http = options.fetch ?? fetch;
    const key = options.storageKey ?? `customy.${options.publishableKey}`;
    const scopes = [...new Set([...(options.scopes ?? ["openid", "profile", "email"]), "offline_access"])];
    if (!/^pk_[A-Za-z0-9_]+$/.test(options.publishableKey)) throw new CustomyNativeAuthError("CONFIGURATION", "publishableKey must be a Customy Access publishable key (pk_…)");

    let config: Promise<NativeAuthConfig> | null = null;
    let tokens: Tokens | null = null;
    let refreshing: Promise<Tokens> | null = null;
    let status: NativeAuthStatus = "loading";
    const listeners = new Set<(s: NativeAuthStatus) => void>();

    function setStatus(next: NativeAuthStatus) {
        if (status === next) return;
        status = next;
        for (const l of listeners) l(next);
    }

    async function call(url: string, init: RequestInit) {
        try {
            return await http(url, init);
        } catch {
            throw new CustomyNativeAuthError("NETWORK");
        }
    }

    /** Organization, environment, providers and this app's native client — from the publishable key. */
    function discover(): Promise<NativeAuthConfig> {
        config ??= (async () => {
            const r = await call(`${accessUrl}/api/public/auth-config?${new URLSearchParams({ publishableKey: options.publishableKey })}`, { headers: { accept: "application/json" } });
            if (!r.ok) throw new CustomyNativeAuthError(r.status === 404 ? "CONFIGURATION" : "NETWORK", `auth-config ${r.status}`);
            const data = (await r.json()) as {
                organization: NativeAuthConfig["organization"];
                environment: NativeAuthConfig["environment"] | null;
                providers?: NativeAuthConfig["providers"];
                native?: { clients?: Array<{ clientId: string; redirectUris: string[] }> };
            };
            const client = data.native?.clients?.find((c) => redirectMatches(c.redirectUris, options.redirectUri));
            if (!data.environment) throw new CustomyNativeAuthError("CONFIGURATION", "publishable key without environment");
            if (!client) throw new CustomyNativeAuthError("NATIVE_CLIENT_NOT_REGISTERED", `No native client of this environment accepts ${options.redirectUri}`);
            return { organization: data.organization, environment: data.environment, providers: data.providers ?? [], clientId: client.clientId };
        })().catch((error) => {
            config = null;
            throw error;
        });
        return config;
    }

    async function authHeaders() {
        const c = await discover();
        return {
            "content-type": "application/json",
            accept: "application/json",
            "x-publishable-key": options.publishableKey,
            "x-environment-id": c.environment.id,
            "x-organization-id": c.organization.id,
            origin: authOrigin,
        };
    }

    async function save(t: Tokens) {
        tokens = t;
        await options.storage.set(`${key}.refresh`, t.refreshToken);
        setStatus("signedIn");
    }

    function readTokens(data: { access_token?: string; id_token?: string; refresh_token?: string; expires_in?: number }, previousRefresh?: string): Tokens {
        if (!data.access_token) throw new CustomyNativeAuthError("UNKNOWN", "token response without access_token");
        const refreshToken = data.refresh_token ?? previousRefresh;
        if (!refreshToken) throw new CustomyNativeAuthError("CONFIGURATION", "Access did not issue a refresh token (offline_access)");
        return { accessToken: data.access_token, idToken: data.id_token ?? tokens?.idToken ?? null, refreshToken, expiresAt: Date.now() + Math.min(data.expires_in ?? 900, 86_400) * 1000 };
    }

    async function exchangeCode(code: string, verifier: string) {
        const c = await discover();
        const r = await call(`${accessUrl}/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
            body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: options.redirectUri, client_id: c.clientId, code_verifier: verifier }).toString(),
        });
        if (!r.ok) throw new CustomyNativeAuthError("UNKNOWN", `token ${r.status}`);
        await save(readTokens(await r.json()));
    }

    /** Session just created in-app → PKCE code (JSON) → tokens. The session itself is not kept. */
    async function completeWithSession(sessionToken: string) {
        const c = await discover();
        const pkce = await createPkce(options.crypto);
        const state = base64url(options.crypto.randomBytes(16));
        const r = await call(`${accessUrl}/api/auth/native/authorize`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${sessionToken}` },
            body: JSON.stringify({ client_id: c.clientId, redirect_uri: options.redirectUri, code_challenge: pkce.challenge, state, scope: scopes.join(" ") }),
        });
        const data = (await r.json().catch(() => null)) as { code?: string; state?: string } | null;
        if (!r.ok || !data?.code || data.state !== state) throw new CustomyNativeAuthError(r.status === 401 ? "SESSION_EXPIRED" : "UNKNOWN", `native authorize ${r.status}`);
        await exchangeCode(data.code, pkce.verifier);
    }

    function sessionTokenOf(r: Response, body: { token?: unknown } | null) {
        return r.headers.get("set-auth-token") ?? (typeof body?.token === "string" && body.token ? body.token : null);
    }

    async function refresh(): Promise<Tokens> {
        refreshing ??= (async () => {
            const refreshToken = tokens?.refreshToken ?? (await options.storage.get(`${key}.refresh`));
            if (!refreshToken) throw new CustomyNativeAuthError("SESSION_EXPIRED");
            const c = await discover();
            const r = await call(`${accessUrl}/oauth/token`, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
                body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: c.clientId }).toString(),
            });
            if (r.status === 400 || r.status === 401) {
                tokens = null;
                await options.storage.delete(`${key}.refresh`);
                setStatus("signedOut");
                throw new CustomyNativeAuthError("SESSION_EXPIRED");
            }
            if (!r.ok) throw new CustomyNativeAuthError("NETWORK", `refresh ${r.status}`);
            const next = readTokens(await r.json(), refreshToken);
            await save(next);
            return next;
        })().finally(() => {
            refreshing = null;
        });
        return refreshing;
    }

    return {
        get status() {
            return status;
        },
        /** Status changes (loading → signedIn/signedOut). Returns the unsubscribe function. */
        subscribe(listener: (s: NativeAuthStatus) => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        discover,

        /** At app start: signed in if the device holds a refresh token (works offline too). */
        async restore() {
            const stored = await options.storage.get(`${key}.refresh`);
            if (!stored) return setStatus("signedOut");
            try {
                await refresh();
            } catch (error) {
                // Offline at launch: stay signed in; the next request renews.
                if (error instanceof CustomyNativeAuthError && error.code === "NETWORK") setStatus("signedIn");
                else setStatus("signedOut");
            }
        },

        async signInWithPassword(email: string, password: string) {
            const r = await call(`${accessUrl}/api/auth/sign-in/email`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ email: email.trim(), password }) });
            const body = (await r.json().catch(() => null)) as { token?: string; code?: string } | null;
            if (r.status === 401 || body?.code === "INVALID_EMAIL_OR_PASSWORD") throw new CustomyNativeAuthError("INVALID_CREDENTIALS");
            if (body?.code === "EMAIL_NOT_VERIFIED" || r.status === 403) throw new CustomyNativeAuthError("EMAIL_NOT_VERIFIED");
            const session = sessionTokenOf(r, body);
            if (!r.ok || !session) throw new CustomyNativeAuthError(r.status === 429 ? "NETWORK" : "UNKNOWN", `sign-in ${r.status}`);
            await completeWithSession(session);
        },

        /** Creates the account. `verifyEmail`: the environment asks to confirm the email first. */
        async signUpWithPassword(input: { name: string; email: string; password: string }): Promise<"signedIn" | "verifyEmail"> {
            const r = await call(`${accessUrl}/api/auth/sign-up/email`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ name: input.name.trim(), email: input.email.trim(), password: input.password }) });
            const body = (await r.json().catch(() => null)) as { token?: string; code?: string } | null;
            if (body?.code === "USER_ALREADY_EXISTS" || r.status === 422) throw new CustomyNativeAuthError("USER_ALREADY_EXISTS");
            if (body?.code === "PASSWORD_TOO_SHORT" || body?.code === "PASSWORD_TOO_WEAK") throw new CustomyNativeAuthError("WEAK_PASSWORD");
            if (!r.ok) throw new CustomyNativeAuthError("UNKNOWN", `sign-up ${r.status}`);
            const session = sessionTokenOf(r, body);
            if (!session) return "verifyEmail";
            await completeWithSession(session);
            return "signedIn";
        },

        /** Google, Apple… in the system browser (private session), hosted by Access. */
        async signInWithProvider(providerId: string) {
            const c = await discover();
            if (!c.providers.some((p) => p.providerId === providerId)) throw new CustomyNativeAuthError("PROVIDER_NOT_ENABLED", providerId);
            const pkce = await createPkce(options.crypto);
            const state = base64url(options.crypto.randomBytes(16));
            // No `scope` here: app web proxies treat that query name as their tenant scope. Access
            // grants the native default (openid profile email offline_access) for this flow.
            const url = `${authOrigin}/api/auth/native/start?${new URLSearchParams({ client_id: c.clientId, redirect_uri: options.redirectUri, code_challenge: pkce.challenge, code_challenge_method: "S256", state, provider: providerId })}`;
            const result = await options.browser.openAuthSession(url, options.redirectUri);
            if (result.type !== "success") throw new CustomyNativeAuthError("CANCELLED");
            const back = new URL(result.url);
            if (back.searchParams.get("state") !== state) throw new CustomyNativeAuthError("UNKNOWN", "state mismatch");
            const code = back.searchParams.get("code");
            if (!code) throw new CustomyNativeAuthError(back.searchParams.get("error") === "access_denied" ? "CANCELLED" : "UNKNOWN");
            await exchangeCode(code, pkce.verifier);
        },

        /** A valid access token for your API (audience = the native client); renewed silently. */
        async getAccessToken(force = false): Promise<string> {
            if (!force && tokens && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
            return (await refresh()).accessToken;
        },

        /** Who is signed in (from the ID token Access issued). */
        user(): NativeUser | null {
            const claims = decodeJwt(tokens?.idToken ?? null);
            if (!claims || typeof claims.sub !== "string") return null;
            return {
                id: claims.sub,
                email: typeof claims.email === "string" ? claims.email : null,
                name: typeof claims.name === "string" ? claims.name : null,
                picture: typeof claims.picture === "string" ? claims.picture : null,
                emailVerified: claims.email_verified === true,
            };
        },

        /** Revokes the refresh token (ends that Access session) and forgets it on the device. */
        async signOut() {
            const refreshToken = tokens?.refreshToken ?? (await options.storage.get(`${key}.refresh`));
            tokens = null;
            await options.storage.delete(`${key}.refresh`);
            setStatus("signedOut");
            if (refreshToken) {
                const c = await discover().catch(() => null);
                if (c) await call(`${accessUrl}/oauth/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refreshToken, client_id: c.clientId }).toString() }).catch(() => undefined);
            }
        },
    };
}

export type CustomyNativeAuth = ReturnType<typeof createCustomyNativeAuth>;
