"use client";

/**
 * @customy/customy-access
 *
 * React hooks and components for Customy Access.
 * Inspired by Clerk's useUser/useAuth and Auth0's useAuth0 patterns.
 *
 * @example
 * ```tsx
 * import { CustomyProvider, useAuth, useUser } from "@customyai/customy-access/react";
 *
 * function App() {
 *   return (
 *     <CustomyProvider baseUrl="https://access.customy.ai">
 *       <YourApp />
 *     </CustomyProvider>
 *   );
 * }
 *
 * function NavBar() {
 *   const { isSignedIn, signOut } = useAuth();
 *   const { user } = useUser();
 *   const sdk = useSDK();
 *   if (!isSignedIn) return <SignInButton />;
 *   return <button onClick={signOut}>Sign out {user?.name}</button>;
 * }
 * ```
 */

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type ReactNode,
} from "react";
import {
    type AccessCommercialUsageSnapshot,
    type AccessEntitlements,
    type AccessSubscriptionStatus,
    CustomyAccess,
    getCapabilityFromMatrix,
    getModuleFromMatrix,
    isCapabilityDecisionAllowed,
    isCapabilityStateAllowed,
    summarizeCapabilityUsage,
    type CapabilityBootstrapSnapshot,
    type CapabilityMatrix,
    type CapabilityMatrixItem,
    type CapabilityMatrixModule,
    type CapabilityUsagePressureSummary,
    type CapabilityUsageStatus,
    type CustomyAccessConfig,
} from "./index";
export * from "./ui/auth-forms";
export * from "./ui/auth-components";

// ─── Types ──────────────────────────────────────────────────────

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
}

export interface SocialSignInOptions {
    callbackURL?: string;
    environmentId?: string;
    organizationSlug?: string;
    publishableKey?: string;
}

export interface ScopedAuthOptions {
    callbackURL?: string;
    environmentId?: string;
    organizationSlug?: string;
    publishableKey?: string;
}

export interface SocialSignInUrlOptions extends SocialSignInOptions {
    authBase?: string;
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
    const candidate = (globalThis as typeof globalThis & {
        process?: { env?: CustomyAccessClientEnv };
    }).process?.env;
    return candidate || {};
}

export function resolveCustomyAccessClientConfig(env: CustomyAccessClientEnv = runtimeEnv()): CustomyAccessClientConfig {
    return {
        baseUrl: (firstNonEmpty(
            env.NEXT_PUBLIC_ACCESS_SDK_BASE_URL,
            env.NEXT_PUBLIC_ACCESS_API_URL,
            env.NEXT_PUBLIC_ACCESS_UI_URL,
            env.CUSTOMY_ACCESS_API_URL,
            env.ACCESS_API_URL,
        ) || "http://localhost:4001").replace(/\/$/, ""),
        environmentId: firstNonEmpty(
            env.NEXT_PUBLIC_ACCESS_ENV_ID,
            env.NEXT_PUBLIC_ACCESS_ENVIRONMENT_ID,
            env.ACCESS_ENV_ID,
            env.ACCESS_ENVIRONMENT_ID,
        ),
        organizationSlug: firstNonEmpty(
            env.NEXT_PUBLIC_ACCESS_ORG_SLUG,
            env.NEXT_PUBLIC_ORG_SLUG,
        ),
        publishableKey: firstNonEmpty(
            env.NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY,
            env.NEXT_PUBLIC_ACCESS_PUBLISHABLE_KEY,
        ),
    };
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

export interface RealtimeTicketResponse {
    ticket: string;
    expires_in: number;
}

/**
 * Exchange the current session cookie for a one-time realtime WS ticket.
 *
 * Same convention as every browser auth call in this SDK: relative path on
 * the current origin (`/api/auth/*` is the prefix every UI proxies to
 * customy-access), cookies included. The ticket authenticates exactly one
 * WebSocket handshake against customy-realtime and expires in 60 seconds,
 * so callers fetch it right before connecting — never cache it.
 */
export async function fetchRealtimeTicket(): Promise<RealtimeTicketResponse> {
    const res = await fetch("/api/auth/realtime-ticket", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`realtime ticket request failed: ${res.status}`);
    }
    const data = await res.json() as RealtimeTicketResponse;
    if (!data?.ticket) {
        throw new Error("realtime ticket response missing ticket");
    }
    return data;
}

export interface CustomyContextValue {
    /** Whether session state has been resolved (true once the first check completes) */
    isLoaded: boolean;
    /** Whether the user is currently signed in */
    isSignedIn: boolean;
    /** The signed-in user object (null when not authenticated) */
    user: CustomyUser | null;
    /** The current session object */
    session: CustomySession | null;
    /** The current organization (if organizationId was provided) */
    organization: CustomyOrganization | null;
    /** The impersonating admin info (null when not impersonated) */
    actor: CustomyActor | null;
    /** Whether this session is an impersonated session */
    isImpersonated: boolean;
    /** Dynamic tenancy headers injected into useCustomyFetch */
    tenantHeaders: Record<string, string>;
    /** Update tenancy headers for API requests (e.g. x-org-id, x-env-id) */
    setTenantHeaders: (headers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    /** Sign out and clear session */
    signOut: () => Promise<void>;
    /** Re-fetch session from the backend */
    refetch: () => Promise<void>;
    /** Trigger a social OAuth sign-in (Google, GitHub, etc) */
    signInWithSocial: (provider: string, callbackURLOrOptions?: string | SocialSignInOptions) => void;
    /** Sign in with email/password */
    signInWithEmail: (email: string, password: string, callbackURLOrOptions?: string | ScopedAuthOptions) => Promise<SignInResult>;
    /** Sign up with name/email/password */
    signUp: (name: string, email: string, password: string, callbackURLOrOptions?: string | ScopedAuthOptions) => Promise<SignInResult>;
    /** Send a magic link to the provided email */
    signInWithMagicLink: (email: string, callbackURL?: string) => Promise<SignInResult>;
    /** Enable MFA via TOTP and return the secret URI */
    enableMFA: (password: string) => Promise<{ error?: string; secretURI?: string; QRCode?: string; backupCodes?: string[] }>;
    /** Verify an MFA TOTP code */
    verifyMFA: (code: string) => Promise<SignInResult>;
    /** Register a WebAuthn passkey */
    registerPasskey: (name?: string) => Promise<{ error?: string; success?: boolean }>;
    /** Authenticate using a WebAuthn passkey */
    signInWithPasskey: () => Promise<SignInResult>;
    /** Set the active organization (for multi-tenant) */
    setActiveOrganization: (organizationId: string) => Promise<void>;
    /** The base URL of the Customy Access backend */
    baseUrl: string;
    /** The underlying SDK instance for direct admin API access */
    sdk: CustomyAccess;
}

export interface CapabilityGateProps {
    capability: string;
    accessMode?: "read" | "write";
    environmentId?: string;
    userId?: string;
    fallback?: ReactNode;
    loadingFallback?: ReactNode;
    children: ReactNode | ((decision: CapabilityMatrixItem) => ReactNode);
}

export interface ModuleGateProps {
    moduleKey: string;
    accessMode?: "read" | "write";
    environmentId?: string;
    userId?: string;
    fallback?: ReactNode;
    loadingFallback?: ReactNode;
    children: ReactNode | ((module: CapabilityMatrixModule) => ReactNode);
}

// ─── Context ────────────────────────────────────────────────────

const CustomyContext = createContext<CustomyContextValue | null>(null);

function useCustomyContext(): CustomyContextValue {
    const ctx = useContext(CustomyContext);
    if (!ctx) throw new Error("Customy hooks must be used within <CustomyProvider>");
    return ctx;
}

// ─── Hooks ──────────────────────────────────────────────────────

/**
 * Returns a dynamically bound fetch function that automatically injects
 * all tenancy headers (x-org-id, x-project-id, x-env-id) registered in the CustomyProvider.
 */
export function useCustomyFetch() {
    const { tenantHeaders } = useCustomyContext();
    return useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        Object.entries(tenantHeaders).forEach(([key, value]) => {
            if (value) headers.set(key, value);
        });
        return fetch(input, { ...init, headers });
    }, [tenantHeaders]);
}

export interface CustomyProviderProps {
    children: ReactNode;
    /** Base URL of the Customy Access API (e.g. http://localhost:4001 or https://access.customy.ai) */
    baseUrl: string;
    /** Admin secret for server-side usage (optional, NOT for browser) */
    adminSecret?: string;
    /** Publishable key — primary environment identifier (preferred, like Clerk/Stripe) */
    publishableKey?: string;
    /** Environment ID for non-prod/staging/local auth routing when a publishable key is not enough */
    environmentId?: string;
    /** Organization ID to auto-set on the session (optional) */
    organizationId?: string;
    /** @deprecated Use publishableKey instead */
    organizationSlug?: string;
    /** Session polling interval in ms (0 = disabled, default: 0) */
    sessionPollingMs?: number;
    /** If true, the SDK will automatically patch window.fetch to inject tenancy headers */
    enableFetchInterceptor?: boolean;
    /** Set to false to disable the built-in ImpersonationBanner (useful when you render your own). Default: true */
    showImpersonationBanner?: boolean;
}

/**
 * Resolve the base URL for browser-side auth API calls.
 *
 * In browser context, auth must go through the current origin so that
 * session cookies are always same-origin.  The UI must have Next.js
 * rewrites (or a reverse proxy) that forward /api/auth/* to the backend.
 *
 * In SSR / non-browser context, fall back to the provided baseUrl.
 */
function browserAuthBase(baseUrl: string): string {
    if (typeof window !== "undefined") return ""; // relative = current origin
    return baseUrl;
}

export function CustomyProvider({
    children,
    baseUrl,
    adminSecret,
    publishableKey,
    environmentId,
    organizationId,
    organizationSlug,
    sessionPollingMs = 0,
    enableFetchInterceptor = false,
    showImpersonationBanner = true,
}: CustomyProviderProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [user, setUser] = useState<CustomyUser | null>(null);
    const [session, setSession] = useState<CustomySession | null>(null);
    const [organization, setOrganization] = useState<CustomyOrganization | null>(null);
    const [actor, setActor] = useState<CustomyActor | null>(null);
    const [tenantHeaders, setTenantHeaders] = useState<Record<string, string>>({});
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const sdk = useMemo(() => new CustomyAccess({
        baseUrl,
        adminSecret,
        environmentId,
        organizationId,
        publishableKey,
    }), [adminSecret, baseUrl, environmentId, organizationId, publishableKey]);

    // ─── Auth Headers ─────────────────────────────────────────
    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (publishableKey) h["x-publishable-key"] = publishableKey;
        if (environmentId) {
            h["x-env-id"] = environmentId;
            h["x-environment-id"] = environmentId;
        }
        if (organizationSlug) h["x-organization-id"] = organizationSlug;
        return h;
    }, [environmentId, publishableKey, organizationSlug]);

    // ─── Fetch Session ─────────────────────────────────────────
    const authBase = browserAuthBase(baseUrl);

    const fetchSession = useCallback(async () => {
        try {
            const res = await fetch(`${authBase}/api/auth/get-session`, {
                credentials: "include",
                cache: "no-store",
                headers: authHeaders,
            });
            // Sólo un veredicto definitivo vacía la sesión. Un 5xx o un 502 del
            // proxy es Access reiniciándose en mitad de un despliegue: el
            // usuario sigue teniendo su cookie y la sesión sigue viva en la
            // base. Ponerla a `null` aquí se leía como «la versión nueva me
            // desconectó» sin que nadie hubiera cerrado nada.
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) { setUser(null); setSession(null); setActor(null); }
                return;
            }
            const parsed = await res.json();
            const data = (parsed && typeof parsed === "object")
                ? parsed as { user?: CustomyUser; session?: CustomySession; act?: CustomyActor }
                : null;
            setUser(data?.user ?? null);
            setSession(data?.session ?? null);

            // Access /get-session returns a sanitized payload without extended session columns
            // like `actorId`. To bypass this without blocking standard UI hydration latency (P99), we unconditionally
            // fire a floating asynchronous Next.js request strictly for the impersonated metadata in the background.
            // Using `${authBase}/api/auth/impersonation/status` guarantees the request rides the local Next.js proxy tunnel,
            // completely bypassing browser CORS checking and Mixed Content blocks.
            if (data?.session) {
                fetch(`${authBase}/api/auth/impersonation/status`, {
                    credentials: "include",
                    cache: "no-store",
                    headers: authHeaders,
                })
                .then(r => r.ok ? r.json() : null)
                .then((actData: any) => {
                    setActor(actData?.actor || actData?.admin || null);
                })
                .catch(() => setActor(null));
            } else {
                setActor(null); 
            }

            if (organizationId && data?.session) {
                const orgRes = await fetch(`${authBase}/api/auth/organization?id=${organizationId}`, {
                    credentials: "include",
                    cache: "no-store",
                    headers: authHeaders,
                });
                if (orgRes.ok) {
                    const orgData = await orgRes.json() as { organization?: CustomyOrganization };
                    if (orgData.organization) {
                        setOrganization(orgData.organization);
                        // Also seed tenant headers with organization id if not present
                        setTenantHeaders((prev: Record<string, string>) => (
                            prev["x-org-id"] ? prev : { ...prev, "x-org-id": orgData.organization!.id }
                        ));
                    }
                }
            }
        } catch {
            // Error de red: transitorio. Se conserva lo que ya se sabía.
        } finally {
            setIsLoaded(true);
        }
    }, [authBase, organizationId, authHeaders]);

    // Initial fetch
    useEffect(() => { fetchSession(); }, [fetchSession]);

    // Session polling — only while signed in (skip on /login to avoid hammering get-session)
    useEffect(() => {
        if (sessionPollingMs > 0 && user) {
            pollingRef.current = setInterval(fetchSession, sessionPollingMs);
        }
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [sessionPollingMs, fetchSession, user]);

    // ─── Sign Out ─────────────────────────────────────────────
    const signOut = useCallback(async () => {
        await fetch(`${authBase}/api/auth/sign-out`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders,
        });
        setUser(null); setSession(null); setOrganization(null); setActor(null);
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
            window.location.assign("/login");
        }
    }, [authBase, authHeaders]);

    // ─── Sign In: Social (OAuth) ──────────────────────────────
    const signInWithSocial = useCallback((provider: string, callbackURLOrOptions?: string | SocialSignInOptions) => {
        const options = typeof callbackURLOrOptions === "string"
            ? { callbackURL: callbackURLOrOptions }
            : (callbackURLOrOptions || {});
        const effectivePublishableKey = options.publishableKey || publishableKey;
        const effectiveEnvironmentId = options.environmentId || environmentId;
        const effectiveOrganizationSlug = options.organizationSlug || organizationSlug;
        window.location.href = createSocialSignInUrl(provider, {
            authBase,
            callbackURL: options.callbackURL,
            environmentId: effectiveEnvironmentId,
            organizationSlug: effectiveOrganizationSlug,
            publishableKey: effectivePublishableKey,
        });
    }, [authBase, environmentId, organizationSlug, publishableKey]);

    // ─── Sign In: Email / Password ────────────────────────────
    const signInWithEmail = useCallback(async (
        email: string,
        password: string,
        callbackURLOrOptions?: string | ScopedAuthOptions,
    ): Promise<SignInResult> => {
        const options = typeof callbackURLOrOptions === "string"
            ? { callbackURL: callbackURLOrOptions }
            : (callbackURLOrOptions || {});
        const scopedHeaders = {
            ...authHeaders,
            ...(options.publishableKey ? { "x-publishable-key": options.publishableKey } : {}),
            ...(options.environmentId ? {
                "x-env-id": options.environmentId,
                "x-environment-id": options.environmentId,
            } : {}),
            ...(options.organizationSlug ? { "x-organization-id": options.organizationSlug } : {}),
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        try {
            const res = await fetch(`${authBase}/api/auth/sign-in/email`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", ...scopedHeaders },
                body: JSON.stringify({ email, password, ...(options.callbackURL ? { callbackURL: options.callbackURL } : {}) }),
            });
            const data = await res.json().catch(() => ({} as Record<string, unknown>));
            if (!res.ok) {
                return { error: String(data?.message || data?.error || `HTTP ${res.status}`) };
            }
            if (data.twoFactorRedirect) {
                return { twoFactorRedirect: true };
            }
            // Do not await — fetchSession can block the login button for 30s+ in Next dev
            void fetchSession();
            return { url: data.url as string | undefined, redirect: data.redirect as boolean | undefined };
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                return { error: "Sign-in timed out. Try again or use Google." };
            }
            return { error: err instanceof Error ? err.message : "Sign-in failed" };
        } finally {
            clearTimeout(timeoutId);
        }
    }, [authBase, authHeaders, fetchSession]);

    // ─── Sign Up ──────────────────────────────────────────────
    const signUp = useCallback(async (
        name: string,
        email: string,
        password: string,
        callbackURLOrOptions?: string | ScopedAuthOptions,
    ): Promise<SignInResult> => {
        const options = typeof callbackURLOrOptions === "string"
            ? { callbackURL: callbackURLOrOptions }
            : (callbackURLOrOptions || {});
        const scopedHeaders = {
            ...authHeaders,
            ...(options.publishableKey ? { "x-publishable-key": options.publishableKey } : {}),
            ...(options.environmentId ? {
                "x-env-id": options.environmentId,
                "x-environment-id": options.environmentId,
            } : {}),
            ...(options.organizationSlug ? { "x-organization-id": options.organizationSlug } : {}),
        };
        try {
            const res = await fetch(`${authBase}/api/auth/sign-up/email`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...scopedHeaders },
                body: JSON.stringify({ name, email, password, ...(options.callbackURL ? { callbackURL: options.callbackURL } : {}) }),
            });
            const data = await res.json();
            if (!res.ok) {
                return { error: data?.message || data?.error || `HTTP ${res.status}` };
            }
            void fetchSession();
            return { url: data.url, redirect: data.redirect };
        } catch (err) {
            return { error: err instanceof Error ? err.message : "Sign-up failed" };
        }
    }, [authBase, authHeaders, fetchSession]);

    // ─── Magic Links ──────────────────────────────────────────
    const signInWithMagicLink = useCallback(async (email: string, callbackURL?: string): Promise<SignInResult> => {
        try {
            const res = await fetch(`${authBase}/api/auth/magic-link/send`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ email, ...(callbackURL ? { callbackURL } : {}) }),
            });
            const data = await res.json();
            if (!res.ok) return { error: data?.error || data?.message || "Failed to send magic link" };
            return { success: true } as any;
        } catch (err: any) {
            return { error: err.message || "Failed to send magic link" };
        }
    }, [authBase, authHeaders]);

    // ─── MFA ──────────────────────────────────────────────────
    const enableMFA = useCallback(async (password: string) => {
        try {
            const res = await fetch(`${authBase}/api/auth/two-factor/totp/generate`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();
            if (!res.ok) return { error: data?.error || data?.message || "Failed to generate TOTP" };
            return data as { secretURI?: string; QRCode?: string; backupCodes?: string[] };
        } catch (err: any) {
            return { error: err.message || "Failed to enable MFA" };
        }
    }, [authBase, authHeaders]);

    const verifyMFA = useCallback(async (code: string): Promise<SignInResult> => {
        try {
            const res = await fetch(`${authBase}/api/auth/two-factor/verify`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (!res.ok) return { error: data?.error || data?.message || "Invalid 2FA code" };
            await fetchSession();
            return { url: data.url, redirect: data.redirect };
        } catch (err: any) {
            return { error: err.message || "Verification failed" };
        }
    }, [authBase, authHeaders, fetchSession]);

    // ─── Passkeys ─────────────────────────────────────────────
    const registerPasskey = useCallback(async (name?: string) => {
        try {
            // First we need to generate options; the passkey flow usually uses client handlers
            // For raw endpoint wrapping (assuming customy passkey flow):
            const res = await fetch(`${authBase}/api/auth/passkey/generate-options`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify(name ? { name } : {}),
            });
            const data = await res.json();
            if (!res.ok) return { error: data?.error || data?.message || "Failed to register passkey" };
            
            // Typical webauthn integration would invoke navigator.credentials.create() here.
            // But since Access may run its own flow or the setup page handles it, 
            // returning the raw data or success if simple. For now, just proxy the backend call.
            return data;
        } catch (err: any) {
            return { error: err.message || "Failed to register passkey" };
        }
    }, [authBase, authHeaders]);

    const signInWithPasskey = useCallback(async (): Promise<SignInResult> => {
        try {
            const res = await fetch(`${authBase}/api/auth/passkey/authenticate`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders },
            });
            const data = await res.json();
            if (!res.ok) return { error: data?.error || data?.message || "Passkey auth failed" };
            await fetchSession();
            return { url: data.url, redirect: data.redirect };
        } catch (err: any) {
            return { error: err.message || "Passkey auth failed" };
        }
    }, [authBase, authHeaders, fetchSession]);

    // ─── Set Active Organization ──────────────────────────────
    const setActiveOrganization = useCallback(async (orgId: string) => {
        try {
            await fetch(`${authBase}/api/auth/organization/set-active`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ organizationId: orgId }),
            });
        } catch {
            // silent
        }
    }, [authBase, authHeaders]);

    // ─── Global Fetch Interceptor (Optional) ──────────────────
    useEffect(() => {
        if (!enableFetchInterceptor || typeof window === "undefined") return;
        const originalFetch = window.fetch;
        
        window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
            // Only intercept API calls (e.g. /api/)
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            if (url.includes("/api/")) {
                const mergedHeaders = new Headers(init?.headers);
                // Dynamically inject all tenant headers (always up to date from state)
                (Object.entries(tenantHeaders) as Array<[string, string]>).forEach(([key, value]) => {
                    if (value && !mergedHeaders.has(key)) mergedHeaders.set(key, value);
                });
                return originalFetch(input, { ...init, headers: mergedHeaders });
            }
            return originalFetch(input, init);
        };

        return () => { window.fetch = originalFetch; };
    }, [enableFetchInterceptor, tenantHeaders]);

    // ─── Context Value ────────────────────────────────────────
    const value: CustomyContextValue = {
        isLoaded, isSignedIn: !!user, user, session, organization, actor,
        isImpersonated: !!actor, tenantHeaders, setTenantHeaders, signOut, refetch: fetchSession,
        signInWithSocial, signInWithEmail, signUp, signInWithMagicLink, enableMFA, verifyMFA, registerPasskey, signInWithPasskey, setActiveOrganization,
        baseUrl, sdk,
    };

    return (
        <CustomyContext.Provider value={value}>
            {children}
            {showImpersonationBanner && <ImpersonationBanner />}
        </CustomyContext.Provider>
    );
}

// ─── Hooks ──────────────────────────────────────────────────────

/** useAuth — auth state + sign-in/out methods */
export function useAuth() {
    const ctx = useCustomyContext();
    return {
        isLoaded: ctx.isLoaded,
        isSignedIn: ctx.isSignedIn,
        signOut: ctx.signOut,
        signInWithSocial: ctx.signInWithSocial,
        signInWithEmail: ctx.signInWithEmail,
        signUp: ctx.signUp,
        signInWithMagicLink: ctx.signInWithMagicLink,
        enableMFA: ctx.enableMFA,
        verifyMFA: ctx.verifyMFA,
        registerPasskey: ctx.registerPasskey,
        signInWithPasskey: ctx.signInWithPasskey,
        setActiveOrganization: ctx.setActiveOrganization,
        session: ctx.session,
        actor: ctx.actor,
        isImpersonated: ctx.isImpersonated,
        tenantHeaders: ctx.tenantHeaders,
        setTenantHeaders: ctx.setTenantHeaders,
    };
}

/**
 * useSession — session hook compatible with the Access session contract.
 * Returns `{ data, isPending }` matching the interface used by the access-UI.
 */
export function useSession() {
    const ctx = useCustomyContext();
    return {
        data: ctx.isSignedIn ? { user: ctx.user, session: ctx.session } : null,
        isPending: !ctx.isLoaded,
        // Also export flat fields for convenience
        isLoaded: ctx.isLoaded,
        session: ctx.session,
    };
}

/** useUser — current user profile */
export function useUser() {
    const ctx = useCustomyContext();
    return { isLoaded: ctx.isLoaded, isSignedIn: ctx.isSignedIn, user: ctx.user, refetch: ctx.refetch };
}

/** useOrganization — current org context */
export function useOrganization() {
    const ctx = useCustomyContext();
    return { isLoaded: ctx.isLoaded, organization: ctx.organization, membership: ctx.organization ? { role: ctx.organization.role } : null };
}

/** useSDK — get the CustomyAccess instance for direct API calls */
export function useSDK(): CustomyAccess {
    return useCustomyContext().sdk;
}

function resolveActiveEnvironmentId(headers: Record<string, string>): string | null {
    return headers["x-env-id"]
        || headers["x-environment-id"]
        || headers["x-active-environment-id"]
        || null;
}

interface CapabilityHookOptions {
    environmentId?: string;
    userId?: string;
    enabled?: boolean;
}

interface AsyncCapabilityState<T> {
    data: T | null;
    error: Error | null;
    isLoading: boolean;
    refetch: () => Promise<void>;
}

export interface CapabilityBootstrapHookOptions extends CapabilityHookOptions {
    capabilities?: string[];
    includeUsage?: boolean;
}

function useCapabilityResource<T>(
    loader: (() => Promise<T>) | null,
    deps: React.DependencyList,
): AsyncCapabilityState<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const refetch = useCallback(async () => {
        if (!loader) {
            setData(null);
            setError(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const result = await loader();
            setData(result);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsLoading(false);
        }
    }, [loader]);

    useEffect(() => {
        void refetch();
    }, [refetch, ...deps]);

    return { data, error, isLoading, refetch };
}

export function useCapabilityMatrix(options: CapabilityHookOptions = {}): AsyncCapabilityState<CapabilityMatrix> & {
    environmentId: string | null;
} {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.getMatrix(environmentId, { userId: options.userId })),
        [sdk, environmentId, options.enabled, options.userId],
    );
    const state = useCapabilityResource<CapabilityMatrix>(loader, [loader]);
    return { ...state, environmentId };
}

export function useCapabilityDecision(
    capability: string,
    options: CapabilityHookOptions = {},
): AsyncCapabilityState<CapabilityMatrixItem> & { environmentId: string | null } {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.check(environmentId, capability, { userId: options.userId })),
        [sdk, environmentId, capability, options.enabled, options.userId],
    );
    const state = useCapabilityResource<CapabilityMatrixItem>(loader, [loader]);
    return { ...state, environmentId };
}

export function useVisibleModules(options: CapabilityHookOptions = {}): AsyncCapabilityState<CapabilityMatrixModule[]> & {
    environmentId: string | null;
} {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.listVisibleModules(environmentId, { userId: options.userId })),
        [sdk, environmentId, options.enabled, options.userId],
    );
    const state = useCapabilityResource<CapabilityMatrixModule[]>(loader, [loader]);
    return { ...state, environmentId };
}

export function useUsageStatus(
    options: CapabilityHookOptions & { capability?: string } = {},
): AsyncCapabilityState<CapabilityUsageStatus[]> & { environmentId: string | null } {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.getUsageStatus(environmentId, {
                userId: options.userId,
                capability: options.capability,
            })),
        [sdk, environmentId, options.enabled, options.userId, options.capability],
    );
    const state = useCapabilityResource<CapabilityUsageStatus[]>(loader, [loader]);
    return { ...state, environmentId };
}

export function useCapabilityBootstrap(
    options: CapabilityBootstrapHookOptions = {},
): AsyncCapabilityState<CapabilityBootstrapSnapshot> & { environmentId: string | null } {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const capabilityKey = options.capabilities?.join(",") ?? "";
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.bootstrap(environmentId, {
                userId: options.userId,
                capabilities: options.capabilities,
                includeUsage: options.includeUsage,
            })),
        [
            sdk,
            environmentId,
            options.enabled,
            options.userId,
            capabilityKey,
            options.includeUsage,
        ],
    );
    const state = useCapabilityResource<CapabilityBootstrapSnapshot>(loader, [loader]);
    return { ...state, environmentId };
}

export function useCapabilityEntitlements(options: CapabilityHookOptions = {}): AsyncCapabilityState<AccessEntitlements> & {
    environmentId: string | null;
} {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.getEntitlements(environmentId, { userId: options.userId })),
        [sdk, environmentId, options.enabled, options.userId],
    );
    const state = useCapabilityResource<AccessEntitlements>(loader, [loader]);
    return { ...state, environmentId };
}

export function useCapabilitySubscriptionStatus(options: Omit<CapabilityHookOptions, "userId"> = {}): AsyncCapabilityState<AccessSubscriptionStatus> & {
    environmentId: string | null;
} {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.getSubscriptionStatus(environmentId)),
        [sdk, environmentId, options.enabled],
    );
    const state = useCapabilityResource<AccessSubscriptionStatus>(loader, [loader]);
    return { ...state, environmentId };
}

export function useCapabilityCommercialUsage(
    options: CapabilityHookOptions & { capability?: string } = {},
): AsyncCapabilityState<AccessCommercialUsageSnapshot> & { environmentId: string | null } {
    const { sdk, tenantHeaders } = useCustomyContext();
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);
    const loader = useMemo(
        () => (options.enabled === false || !environmentId
            ? null
            : () => sdk.capabilities.getCommercialUsage(environmentId, {
                userId: options.userId,
                capability: options.capability,
            })),
        [sdk, environmentId, options.enabled, options.userId, options.capability],
    );
    const state = useCapabilityResource<AccessCommercialUsageSnapshot>(loader, [loader]);
    return { ...state, environmentId };
}

export function useCanUseCapability(
    capability: string,
    options: CapabilityHookOptions & { accessMode?: "read" | "write" } = {},
) {
    const decision = useCapabilityDecision(capability, options);
    return {
        ...decision,
        allowed: isCapabilityDecisionAllowed(decision.data, options.accessMode),
    };
}

export function useCanAccessModule(
    moduleKey: string,
    options: CapabilityHookOptions & { accessMode?: "read" | "write" } = {},
) {
    const modules = useVisibleModules(options);
    const module = modules.data?.find((item) => item.key === moduleKey) ?? null;
    return {
        ...modules,
        module,
        allowed: module ? isCapabilityStateAllowed(module.state, options.accessMode) : false,
    };
}

export function useCapabilityLookup(options: CapabilityBootstrapHookOptions = {}) {
    const bootstrap = useCapabilityBootstrap(options);
    const usageSummary = useMemo<CapabilityUsagePressureSummary>(
        () => summarizeCapabilityUsage(bootstrap.data?.usage ?? []),
        [bootstrap.data],
    );
    const getCapability = useCallback(
        (capability: string) => bootstrap.data?.getCapability(capability) ?? null,
        [bootstrap.data],
    );
    const getModule = useCallback(
        (moduleKey: string) => bootstrap.data?.getModule(moduleKey) ?? null,
        [bootstrap.data],
    );
    const canUseCapability = useCallback(
        (capability: string, accessMode: "read" | "write" = "write") => (
            bootstrap.data?.canUseCapability(capability, accessMode) ?? false
        ),
        [bootstrap.data],
    );
    const canAccessModule = useCallback(
        (moduleKey: string, accessMode: "read" | "write" = "write") => (
            bootstrap.data?.canAccessModule(moduleKey, accessMode) ?? false
        ),
        [bootstrap.data],
    );

    return {
        ...bootstrap,
        getCapability,
        getModule,
        canUseCapability,
        canAccessModule,
        usageSummary,
    };
}

export function useActiveCapabilitySummary(
    options: CapabilityBootstrapHookOptions = {},
) {
    const { tenantHeaders } = useCustomyContext();
    const bootstrap = useCapabilityBootstrap(options);
    const environmentId = options.environmentId ?? resolveActiveEnvironmentId(tenantHeaders);

    return {
        ...bootstrap,
        environmentId,
        matrix: bootstrap.data?.matrix ?? null,
        modules: bootstrap.data?.modules ?? [],
        usage: bootstrap.data?.usage ?? [],
        usageSummary: summarizeCapabilityUsage(bootstrap.data?.usage ?? []),
        decisions: bootstrap.data?.decisions ?? {},
    };
}

/** useImpersonation — detect and control impersonation */
export function useImpersonation() {
    const ctx = useCustomyContext();
    const stopImpersonation = useCallback(async () => {
        try {
            const base = browserAuthBase(ctx.baseUrl);
            await fetch(`${base}/api/auth/impersonation/stop`, { 
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: "{}",
                credentials: "include" 
            });
            ctx.refetch();
        } catch { /* silent */ }
    }, [ctx]);
    return { isImpersonated: ctx.isImpersonated, actor: ctx.actor, stopImpersonation };
}

export function CapabilityGate({
    capability,
    accessMode = "write",
    environmentId,
    userId,
    fallback = null,
    loadingFallback = null,
    children,
}: CapabilityGateProps) {
    const decision = useCapabilityDecision(capability, { environmentId, userId });
    if (decision.isLoading) return <>{loadingFallback}</>;
    if (!decision.data || !isCapabilityDecisionAllowed(decision.data, accessMode)) {
        return <>{fallback}</>;
    }
    return (
        <>
            {typeof children === "function"
                ? children(decision.data)
                : children}
        </>
    );
}

export function ModuleGate({
    moduleKey,
    accessMode = "write",
    environmentId,
    userId,
    fallback = null,
    loadingFallback = null,
    children,
}: ModuleGateProps) {
    const matrix = useCapabilityMatrix({ environmentId, userId });
    const module = matrix.data ? getModuleFromMatrix(matrix.data, moduleKey) ?? null : null;

    if (matrix.isLoading) return <>{loadingFallback}</>;
    if (!module || !isCapabilityStateAllowed(module.state, accessMode)) {
        return <>{fallback}</>;
    }
    return (
        <>
            {typeof children === "function"
                ? children(module)
                : children}
        </>
    );
}

// ─── Components ─────────────────────────────────────────────────

export function SignInButton({ redirectUrl, children, className, style }: { redirectUrl?: string; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
    const ctx = useCustomyContext();
    const href = `${ctx.baseUrl}/sign-in${redirectUrl ? `?redirect_to=${encodeURIComponent(redirectUrl)}` : ""}`;
    return <a href={href} className={className} style={style}>{children ?? "Sign in"}</a>;
}

export function SignOutButton({ children, className, style }: { children?: ReactNode; className?: string; style?: React.CSSProperties }) {
    const { signOut } = useAuth();
    return <button onClick={signOut} className={className} style={style}>{children ?? "Sign out"}</button>;
}



export function ProtectedRoute({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }): ReactNode {
    const { isLoaded, isSignedIn } = useAuth();
    if (!isLoaded) return null;
    if (!isSignedIn) return fallback;
    return children;
}

export function OrganizationSwitcher({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { organization } = useOrganization();
    const { isSignedIn, setActiveOrganization, baseUrl } = useCustomyContext();
    const [isOpen, setIsOpen] = useState(false);
    const [orgs, setOrgs] = useState<CustomyOrganization[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Close dropdown if clicked outside
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = () => setIsOpen(false);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, [isOpen]);

    const handleOpen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOpen) {
            setIsOpen(true);
            if (orgs.length === 0) {
                setLoading(true);
                try {
                    const res = await fetch(`${baseUrl}/api/auth/organization/list`, { credentials: "include" });
                    if (res.ok) {
                        const data = await res.json();
                        // Access returns either an array of { organization, role } entries or the bare array, depending on the version
                        if (Array.isArray(data)) setOrgs(data.map(i => i.organization || i));
                        // Sometimes it's wrapped in a data object
                        else if (data && typeof data === 'object' && Array.isArray((data as any).data)) {
                            setOrgs((data as any).data.map((i: any) => i.organization || i));
                        }
                    }
                } catch { /* ignore */ }
                setLoading(false);
            }
        } else {
            setIsOpen(false);
        }
    };

    if (!isSignedIn) return null;

    return (
        <div style={{ position: "relative", display: "inline-block", ...style }}>
            <div 
                className={className} 
                onClick={handleOpen}
                style={{ 
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", 
                    border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer", 
                    background: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    transition: "all 0.2s ease"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#f9fafb"}
                onMouseOut={(e) => e.currentTarget.style.background = "#ffffff"}
            >
                {organization?.logo ? (
                    <img src={organization.logo} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover" }} />
                ) : (
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: "bold" }}>
                        {organization?.name?.[0]?.toUpperCase() ?? "O"}
                    </div>
                )}
                <span style={{ fontSize: 14, fontWeight: 500, color: "#111827", userSelect: "none" }}>
                    {organization?.name ?? "Personal Workspace"}
                </span>
                <span style={{ fontSize: 12, color: "#6b7280", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </span>
            </div>
            
            {/* Premium Dropdown Menu */}
            {isOpen && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, marginTop: 8, minWidth: 240,
                    background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12,
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
                    zIndex: 100, padding: 8, transformOrigin: "top left",
                    animation: "customy-fade-in 0.15s ease-out forwards"
                }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", padding: "8px 12px 4px" }}>
                        Organizations
                    </div>
                    
                    {loading && <div style={{ padding: "12px", fontSize: 13, color: "#6b7280", textAlign: "center" }}>Loading...</div>}
                    
                    {orgs.map(org => {
                        const isActive = org.id === organization?.id;
                        return (
                            <button
                                key={org.id}
                                onClick={() => { setActiveOrganization(org.id); setIsOpen(false); }}
                                style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                                    background: isActive ? "#f3f4f6" : "transparent", border: "none", cursor: "pointer", 
                                    borderRadius: 6, margin: "2px 0", transition: "background 0.1s"
                                }}
                                onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = "#f9fafb"; }}
                                onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                            >
                                {org.logo ? (
                                    <img src={org.logo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />
                                ) : (
                                    <div style={{ width: 24, height: 24, borderRadius: 4, background: isActive ? "linear-gradient(135deg, #3b82f6, #8b5cf6)" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", color: isActive ? "white" : "#6b7280", fontSize: 12, fontWeight: "bold" }}>
                                        {org.name[0]?.toUpperCase()}
                                    </div>
                                )}
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                                    <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{org.name}</span>
                                </div>
                                {isActive && <svg style={{ marginLeft: "auto", color: "#3b82f6" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                            </button>
                        );
                    })}

                    <div style={{ borderTop: "1px solid #e5e7eb", margin: "8px 0" }} />
                    
                    <button 
                        style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 12px", background: "transparent", border: "none",
                            cursor: "pointer", borderRadius: 6, color: "#374151", fontSize: 13,
                            fontWeight: 500, transition: "background 0.1s", textAlign: "left"
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#f3f4f6"}
                        onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                        onClick={() => { window.location.href = "/settings/organization"; }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Manage Organizations
                    </button>
                </div>
            )}
        </div>
    );
}

export function ImpersonationBanner({ position = "top", showStopButton = true, className, style, onStop, children }: {
    position?: "top" | "bottom"; className?: string; style?: React.CSSProperties; showStopButton?: boolean; onStop?: () => void;
    children?: (props: { actor: CustomyActor; targetUser: CustomyUser; stop: () => void }) => ReactNode;
}) {
    const { isImpersonated, actor } = useAuth();
    const { user } = useUser();
    const { stopImpersonation } = useImpersonation();
    if (!isImpersonated || !actor) return null;
    const handleStop = async () => { await stopImpersonation(); onStop?.(); };
    if (children && user) return <>{children({ actor, targetUser: user, stop: handleStop })}</>;
    const actorLabel = actor.name || actor.email;
    const targetLabel = user?.name ?? user?.email ?? "Usuario";
    return (
        <div
            role="status"
            aria-live="polite"
            className={className}
            style={{ position: "fixed", [position]: 0, left: 0, right: 0, zIndex: 9999, background: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)", borderBottom: position === "top" ? "2px solid #F59E0B" : undefined, borderTop: position === "bottom" ? "2px solid #F59E0B" : undefined, padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexWrap: "wrap", fontSize: "13px", fontFamily: "system-ui, -apple-system, sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", ...style }}
        >
            <span style={{ fontSize: "16px" }} aria-hidden="true">👁️</span>
            <span style={{ fontWeight: 700, color: "#92400E" }}>Impersonación activa</span>
            <span aria-hidden="true" style={{ color: "#B45309", opacity: 0.6 }}>•</span>
            <span style={{ color: "#78350F" }}>
                <strong>Tú (admin):</strong> {actorLabel}
            </span>
            <span aria-hidden="true" style={{ color: "#B45309", opacity: 0.6 }}>•</span>
            <span style={{ color: "#78350F" }}>
                <strong>Viendo como:</strong> {targetLabel}
            </span>
            {showStopButton && <button onClick={handleStop} style={{ background: "#DC2626", color: "white", border: "none", borderRadius: "6px", padding: "6px 16px", cursor: "pointer", fontWeight: 600, fontSize: "13px", marginLeft: "8px" }}>✕ Detener impersonación</button>}
        </div>
    );
}

export function withAuth<P extends object>(Component: React.ComponentType<P & { user: CustomyUser | null; isSignedIn: boolean }>) {
    return function WithAuthWrapper(props: P) {
        const { user, isSignedIn } = useUser();
        return <Component {...props} user={user} isSignedIn={isSignedIn} />;
    };
}

// ─── Account Linking Hooks ──────────────────────────────────────

export interface LinkedProviderInfo {
    providerId: string;
    accountId: string;
    createdAt: string;
}

/**
 * useLinkedProviders — fetch linked auth providers for the current user.
 * Requires the user to be signed in and an orgId to be provided.
 */
export function useLinkedProviders(orgId?: string) {
    const ctx = useCustomyContext();
    const [providers, setProviders] = useState<LinkedProviderInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const userId = ctx.user?.id;

    const fetchProviders = useCallback(async () => {
        if (!userId || !orgId) { setIsLoading(false); return; }
        setIsLoading(true);
        setError(null);
        try {
            const data = await ctx.sdk.accountLinking.getProviders(orgId, userId);
            setProviders(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch providers");
        } finally {
            setIsLoading(false);
        }
    }, [ctx.sdk, userId, orgId]);

    useEffect(() => { fetchProviders(); }, [fetchProviders]);

    return { providers, isLoading, error, refetch: fetchProviders };
}

/**
 * useAccountLinking — full account linking management for the current user.
 * Provides link/unlink methods and the provider list.
 */
export function useAccountLinking(orgId?: string) {
    const ctx = useCustomyContext();
    const { providers, isLoading, error, refetch } = useLinkedProviders(orgId);

    const linkProvider = useCallback(async (providerId: string, redirectUrl?: string) => {
        if (!orgId) throw new Error("orgId required");
        const result = await ctx.sdk.accountLinking.initiateLink(orgId, { providerId, redirectUrl });
        if (result.redirectUrl) {
            window.location.href = result.redirectUrl;
        }
        return result;
    }, [ctx.sdk, orgId]);

    const unlinkProvider = useCallback(async (providerId: string) => {
        if (!orgId) throw new Error("orgId required");
        const result = await ctx.sdk.accountLinking.userUnlink(orgId, providerId);
        if (result.unlinked) await refetch();
        return result;
    }, [ctx.sdk, orgId, refetch]);

    return { providers, isLoading, error, linkProvider, unlinkProvider, refetch };
}

// ─── Account Linking Components ─────────────────────────────────

const PROVIDER_LABELS: Record<string, { name: string; color: string; icon: string }> = {
    google: { name: "Google", color: "#4285F4", icon: "G" },
    github: { name: "GitHub", color: "#24292e", icon: "⚙" },
    apple: { name: "Apple", color: "#000000", icon: "" },
    microsoft: { name: "Microsoft", color: "#00a4ef", icon: "M" },
    linkedin: { name: "LinkedIn", color: "#0A66C2", icon: "in" },
    facebook: { name: "Facebook", color: "#1877f2", icon: "f" },
    twitter: { name: "Twitter", color: "#1da1f2", icon: "𝕏" },
    discord: { name: "Discord", color: "#5865F2", icon: "D" },
    credential: { name: "Email/Password", color: "#6b7280", icon: "✉" },
};

function getProviderInfo(providerId: string) {
    return PROVIDER_LABELS[providerId] || { name: providerId, color: "#6b7280", icon: "?" };
}

/**
 * LinkProviderButton — button to initiate linking a new auth provider.
 */
export function LinkProviderButton({ provider, orgId, redirectUrl, className, style, children }: {
    provider: string; orgId: string; redirectUrl?: string;
    className?: string; style?: React.CSSProperties; children?: ReactNode;
}) {
    const { linkProvider } = useAccountLinking(orgId);
    const [loading, setLoading] = useState(false);
    const info = getProviderInfo(provider);

    const handleClick = async () => {
        setLoading(true);
        try { await linkProvider(provider, redirectUrl); }
        catch { setLoading(false); }
    };

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className={className}
            style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                background: "white", cursor: loading ? "wait" : "pointer",
                fontSize: 14, fontWeight: 500, transition: "all 0.15s",
                opacity: loading ? 0.6 : 1,
                ...style,
            }}
        >
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: info.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                {info.icon}
            </span>
            {children ?? `Link ${info.name}`}
        </button>
    );
}

/**
 * LinkedAccountsManager — displays linked providers with unlink buttons.
 * Drop-in component for user settings / profile pages.
 */
export function LinkedAccountsManager({ orgId, className, style }: {
    orgId: string; className?: string; style?: React.CSSProperties;
}) {
    const { providers, isLoading, error, unlinkProvider } = useAccountLinking(orgId);
    const [unlinking, setUnlinking] = useState<string | null>(null);

    if (isLoading) {
        return <div className={className} style={{ padding: 16, color: "#9ca3af", ...style }}>Loading linked accounts…</div>;
    }

    if (error) {
        return <div className={className} style={{ padding: 16, color: "#ef4444", ...style }}>Error: {error}</div>;
    }

    const handleUnlink = async (providerId: string) => {
        setUnlinking(providerId);
        try {
            const result = await unlinkProvider(providerId);
            if (!result.unlinked) alert(result.message);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Unlink failed");
        } finally {
            setUnlinking(null);
        }
    };

    return (
        <div className={className} style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                Linked Accounts ({providers.length})
            </div>
            {providers.map(p => {
                const info = getProviderInfo(p.providerId);
                return (
                    <div key={p.providerId} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 28, height: 28, borderRadius: "50%", background: info.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                                {info.icon}
                            </span>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>{info.name}</div>
                                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                                    Linked {new Date(p.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleUnlink(p.providerId)}
                            disabled={unlinking === p.providerId || providers.length <= 1}
                            title={providers.length <= 1 ? "Cannot unlink last provider" : `Unlink ${info.name}`}
                            style={{
                                padding: "4px 12px", borderRadius: 6, border: "1px solid #fecaca",
                                background: "white", color: "#dc2626", fontSize: 12, fontWeight: 500,
                                cursor: providers.length <= 1 ? "not-allowed" : "pointer",
                                opacity: providers.length <= 1 ? 0.4 : 1,
                            }}
                        >
                            {unlinking === p.providerId ? "…" : "Unlink"}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// Re-export SDK for convenience
export { CustomyAccess } from "./index";
export type { CustomyAccessConfig } from "./index";
export type { LinkedProvider, LinkResult, LinkBlockedResult, AccountLinkingConfig, LinkHistoryEntry } from "./index";
export type {
    CapabilityMatrix,
    CapabilityMatrixItem,
    CapabilityMatrixModule,
    CapabilityUsagePressureSummary,
    CapabilityUsageStatus,
} from "./index";
