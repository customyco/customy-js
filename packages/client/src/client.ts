/**
 * Cliente de navegador de Customy: sesión, login, MFA, passkeys, organización
 * activa, capabilities y vinculación de cuentas, siempre contra `/api/auth/*`
 * y `/api/*` del MISMO origen (la app los reenvía a Access con
 * `@customyai/web`). Las cookies de sesión son `HttpOnly` y de host: este
 * cliente nunca las lee ni guarda tokens, y no acepta secretos de servidor.
 */
import { backoffDelay, CustomySdkError, isRetryableStatus, parseRetryAfter, readErrorEnvelope, sleep } from "@customyai/core";
import {
    getCapabilityFromMatrix,
    getModuleFromMatrix,
    isCapabilityDecisionAllowed,
    isCapabilityStateAllowed,
    type AccessCommercialUsageSnapshot,
    type AccessEntitlements,
    type AccessMeSnapshot,
    type AccessSubscriptionStatus,
    type CapabilityBootstrapOptions,
    type CapabilityBootstrapSnapshot,
    type CapabilityMatrix,
    type CapabilityMatrixItem,
    type CapabilityMatrixModule,
    type CapabilityUsageStatus,
    type LinkedProvider,
} from "./capabilities";

export interface CustomyUser {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
}

export interface CustomyOrganization {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    role: string;
}

export interface CustomySession {
    id: string;
    userId: string;
    expiresAt: string;
}

export interface CustomyActor {
    sub: string;
    email: string;
    name: string;
}

export interface SignInResult {
    error?: string;
    url?: string;
    redirect?: boolean;
    twoFactorRedirect?: boolean;
    success?: boolean;
}

export interface ScopedAuthOptions {
    callbackURL?: string;
    environmentId?: string;
    organizationSlug?: string;
    publishableKey?: string;
}

export type SocialSignInOptions = ScopedAuthOptions;

export interface SocialSignInUrlOptions extends SocialSignInOptions {
    authBase?: string;
}

export interface RealtimeTicketResponse {
    ticket: string;
    expires_in: number;
}

/**
 * Estado de sesión según Access. `unknown` es un fallo transitorio (red, 5xx,
 * 429): quien lo recibe conserva lo que ya sabía en vez de cerrar la sesión.
 */
export type SessionState =
    | { status: "signedIn"; user: CustomyUser; session: CustomySession }
    | { status: "signedOut" }
    | { status: "unknown"; error?: unknown };

export interface CustomyClientOptions {
    /**
     * Origen de las rutas de auth. En el navegador se ignora y se usa el mismo
     * origen (rutas relativas); fuera del navegador (SSR, tests) es la URL de
     * la app. Por defecto `""`.
     */
    baseUrl?: string;
    /** Clave publicable del entorno (`pk_…`). Pública. */
    publishableKey?: string;
    environmentId?: string;
    organizationSlug?: string;
    /** Organización para `x-org-id` en las llamadas de capabilities. */
    organizationId?: string;
    fetch?: typeof fetch;
    /** Límite de un login (por defecto 30 s) y de las demás llamadas (15 s). */
    signInTimeoutMs?: number;
    timeoutMs?: number;
    /** Reintentos de lecturas ante red, 408, 425, 429 y 5xx (por defecto 2). */
    retries?: number;
}

const FORBIDDEN_OPTIONS = ["apiKey", "adminSecret", "bearerToken", "sessionToken", "clientSecret", "secretKey", "internalKey"];

/** Quita las barras finales en tiempo lineal (sin la regex `/\/+$/`, cuadrática con muchas `/`). */
function trimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
    return value.slice(0, end);
}

function isBrowser(): boolean {
    return typeof (globalThis as { document?: unknown }).document !== "undefined";
}

/** Rutas relativas en el navegador (mismo origen); la base configurada fuera de él. */
export function browserAuthBase(baseUrl: string | undefined): string {
    return isBrowser() ? "" : trimTrailingSlashes(baseUrl ?? "");
}

export function createSocialSignInUrl(provider: string, options: SocialSignInUrlOptions = {}): string {
    const params = new URLSearchParams();
    if (options.callbackURL) params.set("callbackURL", options.callbackURL);
    if (options.publishableKey) params.set("publishableKey", options.publishableKey);
    if (options.environmentId) params.set("envId", options.environmentId);
    if (options.organizationSlug) params.set("orgSlug", options.organizationSlug);
    const query = params.toString();
    const authBase = (options.authBase || "").replace(/\/$/, "");
    return `${authBase}/api/auth/social-redirect/${encodeURIComponent(provider)}${query ? `?${query}` : ""}`;
}

/**
 * Canjea la cookie de sesión por un ticket de un solo uso para el WebSocket de
 * realtime (60 s). Pedirlo justo antes de conectar; nunca cachearlo.
 */
export async function fetchRealtimeTicket(options: { baseUrl?: string; fetch?: typeof fetch } = {}): Promise<RealtimeTicketResponse> {
    const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await fetchImpl(`${browserAuthBase(options.baseUrl)}/api/auth/realtime-ticket`, { method: "POST", credentials: "include", cache: "no-store" });
    if (!res.ok) throw new CustomySdkError({ code: "REALTIME_TICKET_FAILED", status: res.status, service: "access", message: `realtime ticket request failed: ${res.status}` });
    const data = await res.json().catch(() => null) as RealtimeTicketResponse | null;
    if (!data?.ticket) throw new CustomySdkError({ code: "REALTIME_TICKET_INVALID", status: res.status, service: "access", message: "realtime ticket response missing ticket" });
    return data;
}

export interface CustomyAccessClientConfig {
    baseUrl: string;
    environmentId?: string;
    organizationSlug?: string;
    publishableKey?: string;
}

export type CustomyAccessClientEnv = Record<string, string | undefined>;

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) return trimmed;
    }
    return undefined;
}

function runtimeEnv(): CustomyAccessClientEnv {
    return (globalThis as { process?: { env?: CustomyAccessClientEnv } }).process?.env ?? {};
}

/** Configuración pública del cliente desde variables de entorno públicas de la app. */
export function resolveCustomyAccessClientConfig(env: CustomyAccessClientEnv = runtimeEnv()): CustomyAccessClientConfig {
    return {
        baseUrl: (firstNonEmpty(
            env.NEXT_PUBLIC_ACCESS_SDK_BASE_URL,
            env.NEXT_PUBLIC_ACCESS_API_URL,
            env.NEXT_PUBLIC_ACCESS_UI_URL,
            env.CUSTOMY_ACCESS_API_URL,
            env.ACCESS_API_URL,
        ) || "https://access-api.customy.ai").replace(/\/$/, ""),
        environmentId: firstNonEmpty(env.NEXT_PUBLIC_ACCESS_ENV_ID, env.NEXT_PUBLIC_ACCESS_ENVIRONMENT_ID, env.ACCESS_ENV_ID, env.ACCESS_ENVIRONMENT_ID),
        organizationSlug: firstNonEmpty(env.NEXT_PUBLIC_ACCESS_ORG_SLUG, env.NEXT_PUBLIC_ORG_SLUG),
        publishableKey: firstNonEmpty(env.NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY, env.NEXT_PUBLIC_ACCESS_PUBLISHABLE_KEY),
    };
}

function scopeHeaders(options: ScopedAuthOptions): Record<string, string> {
    const headers: Record<string, string> = {};
    if (options.publishableKey) headers["x-publishable-key"] = options.publishableKey;
    if (options.environmentId) {
        headers["x-env-id"] = options.environmentId;
        headers["x-environment-id"] = options.environmentId;
    }
    if (options.organizationSlug) headers["x-organization-id"] = options.organizationSlug;
    return headers;
}

function errorMessage(data: unknown, fallback: string): string {
    const envelope = readErrorEnvelope(data);
    return envelope.message ?? envelope.code ?? fallback;
}

function userQuery(params: Record<string, string | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    const text = query.toString();
    return text ? `?${text}` : "";
}

export function createCustomyClient(options: CustomyClientOptions = {}) {
    const forbidden = FORBIDDEN_OPTIONS.filter((key) => (options as Record<string, unknown>)[key] !== undefined);
    if (forbidden.length > 0) {
        throw new CustomySdkError({
            code: "SDK_SECRET_IN_BROWSER_CLIENT",
            service: "access",
            message: `The Customy browser client never takes server credentials (${forbidden.join(", ")}). Use a publishable key and same-origin cookies.`,
        });
    }
    const fetchImpl = (input: string, init: RequestInit) => (options.fetch ?? globalThis.fetch.bind(globalThis))(input, init);
    const base = () => browserAuthBase(options.baseUrl);
    const defaults: ScopedAuthOptions = { publishableKey: options.publishableKey, environmentId: options.environmentId, organizationSlug: options.organizationSlug };
    const authHeaders = scopeHeaders(defaults);
    const timeout = options.timeoutMs ?? 15_000;

    function send(path: string, init: RequestInit & { timeoutMs?: number; scope?: ScopedAuthOptions } = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        for (const [key, value] of Object.entries({ ...authHeaders, ...scopeHeaders(init.scope ?? {}) })) headers.set(key, value);
        if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
        const { timeoutMs, scope: _scope, ...rest } = init;
        return fetchImpl(`${base()}${path}`, { ...rest, headers, credentials: "include", cache: "no-store", signal: init.signal ?? AbortSignal.timeout(timeoutMs ?? timeout) });
    }

    async function authAction(path: string, body: unknown, fallback: string, scope?: ScopedAuthOptions, timeoutMs?: number): Promise<{ ok: boolean; data: Record<string, unknown>; error?: string }> {
        try {
            const res = await send(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), scope, timeoutMs });
            const data = await res.json().catch(() => ({})) as Record<string, unknown>;
            if (!res.ok) return { ok: false, data, error: errorMessage(data, `HTTP ${res.status}`) };
            return { ok: true, data: data ?? {} };
        } catch (error) {
            if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return { ok: false, data: {}, error: "Request timed out. Try again." };
            return { ok: false, data: {}, error: error instanceof Error ? error.message : fallback };
        }
    }

    /** Lectura JSON con reintentos seguros; los fallos llegan como `CustomySdkError`. */
    async function getJson<T>(path: string): Promise<T> {
        const retries = options.retries ?? 2;
        for (let attempt = 0; ; attempt += 1) {
            let res: Response;
            try {
                res = await send(path, { method: "GET", headers: { accept: "application/json", ...(options.organizationId ? { "x-org-id": options.organizationId } : {}) } });
            } catch (error) {
                if (attempt < retries) { await sleep(backoffDelay(attempt)); continue; }
                throw new CustomySdkError({ code: "SDK_NETWORK_ERROR", service: "access", message: "Customy Access request failed", cause: error });
            }
            const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
            if (res.ok) return data as T;
            const retryAfterMs = parseRetryAfter(res.headers.get("retry-after")) ?? undefined;
            if (attempt < retries && isRetryableStatus(res.status) && (retryAfterMs ?? 0) <= 60_000) {
                await sleep(retryAfterMs ?? backoffDelay(attempt));
                continue;
            }
            const envelope = readErrorEnvelope(data);
            throw new CustomySdkError({
                code: envelope.code ?? `HTTP_${res.status}`,
                status: res.status,
                service: "access",
                message: envelope.message ?? `HTTP ${res.status}`,
                requestId: envelope.requestId ?? res.headers.get("x-request-id") ?? undefined,
                retryAfterMs,
                body: data,
            });
        }
    }

    async function sendJson<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
        const res = await send(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: options.organizationId ? { "x-org-id": options.organizationId } : undefined });
        const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
        if (res.ok) return data as T;
        const envelope = readErrorEnvelope(data);
        throw new CustomySdkError({ code: envelope.code ?? `HTTP_${res.status}`, status: res.status, service: "access", message: envelope.message ?? `HTTP ${res.status}`, requestId: envelope.requestId, body: data });
    }

    const env = (envId: string) => `/api/admin/env/${encodeURIComponent(envId)}`;

    const capabilities = {
        getMatrix: (envId: string, params?: { userId?: string }) => getJson<CapabilityMatrix>(`${env(envId)}/capability-matrix${userQuery({ userId: params?.userId })}`),
        check: (envId: string, capability: string, params?: { userId?: string }) =>
            getJson<CapabilityMatrixItem>(`${env(envId)}/capability-check/${encodeURIComponent(capability)}${userQuery({ userId: params?.userId })}`),
        listVisibleModules: async (envId: string, params?: { userId?: string }) =>
            (await getJson<{ modules: CapabilityMatrixModule[] }>(`${env(envId)}/visible-modules${userQuery({ userId: params?.userId })}`)).modules,
        getUsageStatus: async (envId: string, params?: { userId?: string; capability?: string }) =>
            (await getJson<{ usage: CapabilityUsageStatus[] }>(`${env(envId)}/usage-status${userQuery({ userId: params?.userId, capability: params?.capability })}`)).usage,
        getEntitlements: (envId: string, params?: { userId?: string }) => getJson<AccessEntitlements>(`${env(envId)}/entitlements${userQuery({ userId: params?.userId })}`),
        getSubscriptionStatus: (envId: string) => getJson<AccessSubscriptionStatus>(`${env(envId)}/subscription-status`),
        getCommercialUsage: (envId: string, params?: { userId?: string; capability?: string }) =>
            getJson<AccessCommercialUsageSnapshot>(`${env(envId)}/commercial-usage${userQuery({ userId: params?.userId, capability: params?.capability })}`),
        /** Suscripción, entitlements, módulos y uso del usuario de la sesión. */
        getMe: (envId: string, params?: { userId?: string }) => getJson<AccessMeSnapshot>(`/api/v1/me${userQuery({ envId, userId: params?.userId })}`),
        async bootstrap(envId: string, bootstrapOptions: CapabilityBootstrapOptions = {}): Promise<CapabilityBootstrapSnapshot> {
            const [matrix, modules, usage] = await Promise.all([
                capabilities.getMatrix(envId, { userId: bootstrapOptions.userId }),
                capabilities.listVisibleModules(envId, { userId: bootstrapOptions.userId }),
                bootstrapOptions.includeUsage === false ? Promise.resolve([] as CapabilityUsageStatus[]) : capabilities.getUsageStatus(envId, { userId: bootstrapOptions.userId }),
            ]);
            const seeded = new Map<string, CapabilityMatrixItem>(matrix.capabilities.map((item) => [item.capability, item]));
            const missing = (bootstrapOptions.capabilities ?? []).filter((capability) => !seeded.has(capability));
            for (const decision of await Promise.all(missing.map((capability) => capabilities.check(envId, capability, { userId: bootstrapOptions.userId })))) {
                seeded.set(decision.capability, decision);
            }
            const decisions = Object.fromEntries(seeded.entries());
            const findModule = (moduleKey: string) => modules.find((item) => item.key === moduleKey) ?? getModuleFromMatrix(matrix, moduleKey);
            return {
                matrix,
                modules,
                usage,
                decisions,
                canUseCapability: (capability, accessMode = "write") => isCapabilityDecisionAllowed(decisions[capability] ?? getCapabilityFromMatrix(matrix, capability), accessMode),
                canAccessModule: (moduleKey, accessMode = "write") => {
                    const module = findModule(moduleKey);
                    return module ? isCapabilityStateAllowed(module.state, accessMode) : false;
                },
                getCapability: (capability) => decisions[capability] ?? getCapabilityFromMatrix(matrix, capability),
                getModule: findModule,
            };
        },
    };

    const accountLinking = {
        getProviders: (envId: string, userId: string) =>
            getJson<LinkedProvider[]>(`/api/v1/env/${encodeURIComponent(envId)}/account-linking/${encodeURIComponent(userId)}/providers`),
        initiateLink: (envId: string, params: { providerId: string; redirectUrl?: string }) =>
            sendJson<{ redirectUrl: string; state: string; expiresIn: number }>("POST", `/api/v1/env/${encodeURIComponent(envId)}/account-linking/link-provider`, params),
        userUnlink: (envId: string, providerId: string) =>
            sendJson<{ unlinked: boolean; message: string }>("DELETE", `/api/v1/env/${encodeURIComponent(envId)}/account-linking/my-providers/${encodeURIComponent(providerId)}`),
    };

    return {
        /** Cabeceras de ámbito que el cliente añade a cada llamada. */
        authHeaders: Object.freeze({ ...authHeaders }) as Readonly<Record<string, string>>,
        get baseUrl() { return base(); },

        async getSession(): Promise<SessionState> {
            let res: Response;
            try {
                res = await send("/api/auth/get-session", { method: "GET" });
            } catch (error) {
                return { status: "unknown", error };
            }
            // Solo un veredicto definitivo cierra la sesión: un 5xx o un 502 del
            // proxy es Access reiniciándose, y la cookie sigue siendo válida.
            if (res.status === 401 || res.status === 403) return { status: "signedOut" };
            if (!res.ok) return { status: "unknown", error: new CustomySdkError({ code: `HTTP_${res.status}`, status: res.status, service: "access" }) };
            const data = await res.json().catch(() => undefined) as { user?: CustomyUser; session?: CustomySession } | null | undefined;
            if (data === undefined) return { status: "unknown" };
            return data?.user && data.session ? { status: "signedIn", user: data.user, session: data.session } : { status: "signedOut" };
        },

        async getImpersonationStatus(): Promise<CustomyActor | null> {
            try {
                const res = await send("/api/auth/impersonation/status", { method: "GET" });
                if (!res.ok) return null;
                const data = await res.json().catch(() => null) as { actor?: CustomyActor; admin?: CustomyActor } | null;
                return data?.actor ?? data?.admin ?? null;
            } catch {
                return null;
            }
        },

        async getOrganization(organizationId: string): Promise<CustomyOrganization | null> {
            try {
                const res = await send(`/api/auth/organization?id=${encodeURIComponent(organizationId)}`, { method: "GET" });
                if (!res.ok) return null;
                return ((await res.json().catch(() => null)) as { organization?: CustomyOrganization } | null)?.organization ?? null;
            } catch {
                return null;
            }
        },

        async listOrganizations(): Promise<CustomyOrganization[]> {
            const res = await send("/api/auth/organization/list", { method: "GET" });
            if (!res.ok) return [];
            const data: unknown = await res.json().catch(() => null);
            const rows = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data) ? (data as { data: unknown[] }).data : [];
            return rows.map((row) => ((row as { organization?: CustomyOrganization }).organization ?? row) as CustomyOrganization);
        },

        async signInWithEmail(email: string, password: string, callbackURLOrOptions?: string | ScopedAuthOptions): Promise<SignInResult> {
            const scope = typeof callbackURLOrOptions === "string" ? { callbackURL: callbackURLOrOptions } : (callbackURLOrOptions ?? {});
            const result = await authAction("/api/auth/sign-in/email", { email, password, ...(scope.callbackURL ? { callbackURL: scope.callbackURL } : {}) }, "Sign-in failed", scope, options.signInTimeoutMs ?? 30_000);
            if (!result.ok) return { error: result.error };
            if (result.data.twoFactorRedirect) return { twoFactorRedirect: true };
            return { url: result.data.url as string | undefined, redirect: result.data.redirect as boolean | undefined };
        },

        async signUp(name: string, email: string, password: string, callbackURLOrOptions?: string | ScopedAuthOptions): Promise<SignInResult> {
            const scope = typeof callbackURLOrOptions === "string" ? { callbackURL: callbackURLOrOptions } : (callbackURLOrOptions ?? {});
            const result = await authAction("/api/auth/sign-up/email", { name, email, password, ...(scope.callbackURL ? { callbackURL: scope.callbackURL } : {}) }, "Sign-up failed", scope, options.signInTimeoutMs ?? 30_000);
            return result.ok ? { url: result.data.url as string | undefined, redirect: result.data.redirect as boolean | undefined } : { error: result.error };
        },

        async signInWithMagicLink(email: string, callbackURL?: string): Promise<SignInResult> {
            const result = await authAction("/api/auth/magic-link/send", { email, ...(callbackURL ? { callbackURL } : {}) }, "Failed to send magic link");
            return result.ok ? { success: true } : { error: result.error };
        },

        async enableMFA(password: string): Promise<{ error?: string; secretURI?: string; QRCode?: string; backupCodes?: string[] }> {
            const result = await authAction("/api/auth/two-factor/totp/generate", { password }, "Failed to enable MFA");
            return result.ok ? result.data as { secretURI?: string; QRCode?: string; backupCodes?: string[] } : { error: result.error };
        },

        async verifyMFA(code: string): Promise<SignInResult> {
            const result = await authAction("/api/auth/two-factor/verify", { code }, "Verification failed");
            return result.ok ? { url: result.data.url as string | undefined, redirect: result.data.redirect as boolean | undefined } : { error: result.error };
        },

        async registerPasskey(name?: string): Promise<{ error?: string; success?: boolean } & Record<string, unknown>> {
            const result = await authAction("/api/auth/passkey/generate-options", name ? { name } : {}, "Failed to register passkey");
            return result.ok ? result.data : { error: result.error };
        },

        async signInWithPasskey(): Promise<SignInResult> {
            const result = await authAction("/api/auth/passkey/authenticate", undefined, "Passkey auth failed");
            return result.ok ? { url: result.data.url as string | undefined, redirect: result.data.redirect as boolean | undefined } : { error: result.error };
        },

        async setActiveOrganization(organizationId: string): Promise<boolean> {
            return (await authAction("/api/auth/organization/set-active", { organizationId }, "Failed to set organization")).ok;
        },

        /** Cierra la sesión. Devuelve false si Access no confirmó (la cookie puede seguir viva). */
        async signOut(): Promise<boolean> {
            try {
                const res = await send("/api/auth/sign-out", { method: "POST" });
                return res.ok;
            } catch {
                return false;
            }
        },

        async stopImpersonation(): Promise<boolean> {
            return (await authAction("/api/auth/impersonation/stop", {}, "Failed to stop impersonation")).ok;
        },

        /** URL same-origin que arranca el login social (navegar a ella). */
        socialSignInUrl(provider: string, scope: SocialSignInOptions = {}): string {
            return createSocialSignInUrl(provider, {
                authBase: base(),
                callbackURL: scope.callbackURL,
                publishableKey: scope.publishableKey || defaults.publishableKey,
                environmentId: scope.environmentId || defaults.environmentId,
                organizationSlug: scope.organizationSlug || defaults.organizationSlug,
            });
        },

        realtimeTicket: () => fetchRealtimeTicket({ baseUrl: options.baseUrl, fetch: options.fetch }),

        capabilities,
        accountLinking,
    };
}

export type CustomyClient = ReturnType<typeof createCustomyClient>;
