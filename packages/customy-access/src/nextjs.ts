/**
 * @customyai/customy-access/nextjs — handlers de sesión de Customy para Next.js.
 *
 * @deprecated Usa `@customyai/web`: son sus handlers sobre `Request`/`Response`
 * estándar, que sirven en Next.js y en cualquier otro framework. Este módulo es
 * su adaptador: resuelve la configuración como en 0.x (URL de Access, origen
 * público y ámbito desde las variables de entorno), llama al handler de
 * `@customyai/web` y devuelve su resultado como `NextResponse`.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    customyAuthProxyHandlers as webAuthProxyHandlers,
    customyClearOAuthStateHandlers as webClearOAuthStateHandlers,
    customyMiddleware as webMiddleware,
    customySignOutHandlers as webSignOutHandlers,
    customySocialRedirectHandlers as webSocialRedirectHandlers,
    getServerSession as webGetServerSession,
    handleCustomyAuth as webHandleCustomyAuth,
    type CustomyAuthProxyOptions as WebAuthProxyOptions,
} from "@customyai/web";
import { warnDeprecated } from "./deprecation";

export interface CustomyAuthOptions {
    accessUrl?: string; // Defaults to process.env.NEXT_PUBLIC_ACCESS_API_URL
    redirectTo?: string; // Defaults to "/"
    environmentId?: string;
    publishableKey?: string;
    organizationSlug?: string;
    /** Require a session issued in this app, not a Workspace projection. */
    requireExactEnvironment?: boolean;
}

// Only public fields used by the callback. NextRequest and NextURL contain
// private symbols that differ across supported Next versions; requiring the
// SDK's concrete classes rejects otherwise compatible consumer requests.
type AuthCallbackRequest = {
    readonly headers: Pick<Headers, "get">;
    readonly nextUrl: Pick<URL, "host" | "protocol" | "searchParams">;
};

export interface CustomyMiddlewareOptions {
    /** Routes that don't require authentication (e.g. "/login", "/api/customy/callback") */
    publicRoutes?: string[];
    /** Routes completely ignored by the middleware (e.g. static files) */
    ignoredRoutes?: string[];
    /** Login page path to redirect unauthenticated users */
    loginUrl?: string;
    /** Customy API backend URL */
    accessUrl?: string;
    /** Canonical public origin for auth redirects and forwarded headers. */
    publicOrigin?: string;
    /** Enforces the main Publishable Key */
    publishableKey?: string;
    /** Environment scope forwarded to Customy Access for session validation and API requests. */
    environmentId?: string;
    /** Organization scope forwarded to Customy Access for session validation and API requests. */
    organizationSlug?: string;
    /** Validate protected page sessions against Customy Access instead of only checking cookie presence. Defaults to true. */
    validateSession?: boolean;
}

export interface CustomyAuthProxyOptions {
    accessUrl?: string;
    defaultCallbackPath?: string;
    loginPath?: string;
    publicOrigin?: string;
    publishableKey?: string;
    environmentId?: string;
    organizationSlug?: string;
    /** External apps can pin identity to the server's configuration. */
    enforceTenantScope?: boolean;
    /** Relative Access auth paths explicitly exposed by this application. */
    allowedAuthPaths?: readonly string[];
}

const MODULE = "@customyai/customy-access/nextjs";
const ADVICE = "use the Request/Response handlers of @customyai/web.";

// ─── Configuración de 0.x ───
// `@customyai/web` no adivina nada: recibe la URL de Access, el origen público
// y el ámbito. Aquí se calculan como siempre para que una app que dependía de
// las variables de entorno siga igual.

type HeaderSource = { readonly headers: Pick<Headers, "get"> };

function env(name: string): string {
    return (typeof process !== "undefined" && process.env?.[name]) || "";
}

function firstForwardedValue(value: string | null): string {
    return value?.split(",")[0]?.trim() || "";
}

function hostnameFromHost(host: string): string {
    const cleaned = firstForwardedValue(host);
    if (!cleaned) return "";
    if (cleaned.startsWith("[")) return cleaned.slice(1, cleaned.indexOf("]"));
    return cleaned.split(":")[0]?.toLowerCase() || "";
}

function isInternalHost(host: string): boolean {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"].includes(hostnameFromHost(host));
}

function configuredPublicOrigin(publicOrigin?: string): string {
    const configured = publicOrigin || env("NEXT_PUBLIC_WORKSPACE_URL") || env("NEXT_PUBLIC_APP_URL") || env("APP_URL") || env("NEXT_PUBLIC_WEB_URL");
    if (!configured) return "";
    try {
        return new URL(configured).origin;
    } catch {
        return "";
    }
}

function legacyPublicHost(request: HeaderSource, url: Pick<URL, "host">, publicOrigin?: string): string {
    const configured = configuredPublicOrigin(publicOrigin);
    const configuredHost = configured ? new URL(configured).host : "";
    const candidates = [
        firstForwardedValue(request.headers.get("x-customy-forwarded-host")),
        firstForwardedValue(request.headers.get("x-forwarded-host")),
        firstForwardedValue(request.headers.get("host")),
        url.host,
    ];
    return candidates.find((host) => host && !isInternalHost(host)) || configuredHost || candidates.find(Boolean) || "";
}

function legacyPublicProto(request: HeaderSource, url: Pick<URL, "host" | "protocol">, publicOrigin?: string): string {
    const configured = configuredPublicOrigin(publicOrigin);
    const publicHost = legacyPublicHost(request, url, publicOrigin);
    if (configured) {
        const configuredUrl = new URL(configured);
        if (isInternalHost(publicHost) || publicHost === configuredUrl.host) return configuredUrl.protocol.replace(":", "");
    }
    const forwarded = firstForwardedValue(request.headers.get("x-customy-forwarded-proto")) || firstForwardedValue(request.headers.get("x-forwarded-proto"));
    if (forwarded === "http" || forwarded === "https") return forwarded;
    if (publicHost.endsWith(".customy.ai") || publicHost.endsWith(".chriscarvajal.com")) return "https";
    return url.protocol.replace(":", "") || "https";
}

/** Origen público de 0.x: cabeceras reenviadas, origen configurado o variables de entorno. */
function legacyPublicOrigin(request: HeaderSource, url: Pick<URL, "host" | "protocol">, publicOrigin?: string): string {
    return `${legacyPublicProto(request, url, publicOrigin)}://${legacyPublicHost(request, url, publicOrigin)}`;
}

function inferAccessBaseFromHost(host: string): string {
    const normalizedHost = hostnameFromHost(host);
    if (!normalizedHost) return "";
    if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1") return "http://127.0.0.1:4001";
    if (normalizedHost === "access.chriscarvajal.com" || normalizedHost === "agent.chriscarvajal.com") {
        return env("CUSTOMY_ACCESS_INTERNAL_URL") || env("CUSTOMY_ACCESS_API_URL") || env("CUSTOMY_ACCESS_URL") || env("ACCESS_API_URL") || "http://127.0.0.1:4000";
    }
    if (normalizedHost.includes("staging") && normalizedHost.endsWith(".customy.ai")) return "https://access-api.staging.customy.ai";
    if (normalizedHost.endsWith(".customy.ai") || normalizedHost.endsWith(".chriscarvajal.com")) return "https://access-api.customy.ai";
    return "";
}

/** URL de Access de los handlers de 0.x (opción, variables de servidor, host público, públicas, local). */
function legacyAccessUrl(request: HeaderSource, url: Pick<URL, "host">, options?: { accessUrl?: string; publicOrigin?: string }): string {
    return (
        options?.accessUrl
        || env("CUSTOMY_ACCESS_INTERNAL_URL")
        || env("CUSTOMY_ACCESS_API_URL")
        || env("CUSTOMY_ACCESS_URL")
        || env("ACCESS_API_URL")
        || inferAccessBaseFromHost(legacyPublicHost(request, url, options?.publicOrigin))
        || env("NEXT_PUBLIC_ACCESS_API_URL")
        || env("NEXT_PUBLIC_API_BASE_URL")
        || "http://127.0.0.1:4001"
    ).replace(/\/$/, "");
}

function legacyScope(options?: { publishableKey?: string; environmentId?: string; organizationSlug?: string }) {
    return {
        publishableKey: options?.publishableKey || env("NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY") || env("NEXT_PUBLIC_ACCESS_PUBLISHABLE_KEY") || undefined,
        environmentId: options?.environmentId || env("NEXT_PUBLIC_ACCESS_ENV_ID") || env("NEXT_PUBLIC_ACCESS_ENVIRONMENT_ID") || env("ACCESS_ENV_ID") || env("ACCESS_ENVIRONMENT_ID") || undefined,
        organizationSlug: options?.organizationSlug || env("NEXT_PUBLIC_ACCESS_ORG_SLUG") || env("NEXT_PUBLIC_ORG_SLUG") || undefined,
    };
}

/** El `fetch` global en el momento de la llamada (los tests y los polyfills lo sustituyen). */
const lateFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/**
 * `@customyai/web` solo acepta Access por https (o loopback). 0.x aceptaba
 * además una URL interna http entre servicios (`http://customy-access:4001`),
 * que puede seguir configurada en el entorno de una app: se le entrega a `web`
 * como https y el `fetch` la devuelve a http, así que la petición sale igual
 * que en 0.x y nunca hacia otro host.
 */
function webAccess(accessUrl: string): { accessUrl: string; fetch: typeof fetch } {
    let url: URL;
    try {
        url = new URL(accessUrl);
    } catch {
        return { accessUrl, fetch: lateFetch };
    }
    if (url.protocol !== "http:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return { accessUrl, fetch: lateFetch };
    const internal = url.origin;
    const presented = `https://${url.host}`;
    return {
        accessUrl: `${presented}${url.pathname}`.replace(/\/$/, ""),
        fetch: (input, init) => {
            const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
            return lateFetch(target.startsWith(`${presented}/`) || target === presented ? `${internal}${target.slice(presented.length)}` : input, init);
        },
    };
}

function webProxyOptions(request: NextRequest, options?: CustomyAuthProxyOptions): WebAuthProxyOptions {
    return {
        ...webAccess(legacyAccessUrl(request, request.nextUrl, options)),
        defaultCallbackPath: options?.defaultCallbackPath,
        loginPath: options?.loginPath,
        // Con el ámbito fijo, el `Origin` se compara con el configurado tal cual (0.x).
        publicOrigin: options?.enforceTenantScope ? options.publicOrigin : legacyPublicOrigin(request, request.nextUrl, options?.publicOrigin),
        ...(options?.enforceTenantScope
            ? { publishableKey: options.publishableKey, environmentId: options.environmentId, organizationSlug: options.organizationSlug }
            : legacyScope(options)),
        enforceTenantScope: options?.enforceTenantScope,
        allowedAuthPaths: options?.allowedAuthPaths,
        // 0.x no comprobaba `Origin`/`Sec-Fetch-Site` fuera del ámbito fijo.
        csrfProtection: false,
    };
}

/** Una `Response` estándar como `NextResponse`, con todas sus cabeceras (varias `Set-Cookie` incluidas). */
function toNextResponse(response: Response): NextResponse {
    return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function proxyErrorResponse(status: number): NextResponse {
    const response = NextResponse.json(
        {
            error: status === 502 ? "BAD_GATEWAY" : "AUTH_PROXY_ERROR",
            message: status === 502 ? "Customy Access is temporarily unavailable" : "Authentication request failed",
            statusCode: status,
        },
        { status },
    );
    response.headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("pragma", "no-cache");
    response.headers.set("expires", "0");
    return response;
}

/**
 * Ejecuta un handler de `@customyai/web`. Una URL de Access que `web` no
 * acepta (http fuera de loopback) no llega a Access: se registra y se responde
 * 502, como cuando Access no contesta.
 */
async function run(operation: () => Promise<Response>): Promise<NextResponse> {
    let response: Response;
    try {
        response = await operation();
    } catch (error) {
        console.error("[CustomyAuth] auth handler failed:", error);
        return proxyErrorResponse(502);
    }
    // 0.x respondía así cuando Access no contestaba; `web` usa `{ error: { code, message } }`.
    if (response.status === 502 && response.headers.get("content-type")?.includes("application/json")) {
        const body = await response.clone().json().catch(() => null) as { error?: { code?: unknown } } | null;
        if (body?.error?.code === "BAD_GATEWAY") return proxyErrorResponse(502);
    }
    return toNextResponse(response);
}

export function customyAuthProxyHandlers(options?: CustomyAuthProxyOptions) {
    warnDeprecated(MODULE, ADVICE);
    const handler = async (
        request: NextRequest,
        context: { params: Promise<{ path: string[] }> },
    ) => {
        const { path } = await context.params;
        return run(() => webAuthProxyHandlers(webProxyOptions(request, options))[request.method as "GET"](request, { params: { path } }));
    };

    return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}

export function customySocialRedirectHandlers(options?: CustomyAuthProxyOptions) {
    warnDeprecated(MODULE, ADVICE);
    const GET = async (
        request: NextRequest,
        context: { params: Promise<{ provider: string }> },
    ) => {
        const { provider } = await context.params;
        return run(() => webSocialRedirectHandlers(webProxyOptions(request, options)).GET(request, { params: { provider } }));
    };

    return { GET };
}

export function customySignOutHandlers(options?: CustomyAuthProxyOptions) {
    warnDeprecated(MODULE, ADVICE);
    const POST = async (request: NextRequest) => run(() => webSignOutHandlers(webProxyOptions(request, options)).POST(request));
    return { POST };
}

export function customyClearOAuthStateHandlers() {
    warnDeprecated(MODULE, ADVICE);
    const POST = async (request: NextRequest) => run(() => webClearOAuthStateHandlers({ csrfProtection: false }).POST(request));
    return { POST };
}

// ─── 1. API Route Handler (Auth Callbacks) ───

export function handleCustomyAuth(options?: CustomyAuthOptions) {
    warnDeprecated(MODULE, ADVICE);
    const handler = async (request: AuthCallbackRequest) => {
        const { nextUrl } = request;
        const search = nextUrl.searchParams.toString();
        // `web` lee una `Request`: basta con su URL (solo cuenta `?ticket=`) y sus cabeceras.
        const standard = {
            method: "GET",
            url: `${nextUrl.protocol}//${nextUrl.host}/${search ? `?${search}` : ""}`,
            headers: request.headers as Headers,
        } as unknown as Request;
        const accessUrl = options?.accessUrl || env("NEXT_PUBLIC_ACCESS_API_URL") || "https://access.customy.ai";
        try {
            const response = await webHandleCustomyAuth({
                ...webAccess(accessUrl),
                redirectTo: options?.redirectTo,
                publicOrigin: legacyPublicOrigin(request, nextUrl),
            }).GET(standard);
            // 0.x respondía 500 si Access no daba sesión o no contestaba; `web`, 502.
            if (response.status === 502) {
                const text = await response.text();
                console.error("[CustomyAuth] Ticket exchange failed:", response.status, text);
                return new NextResponse(text === "Invalid ticket exchange response" ? text : "Internal Server Error", { status: 500 });
            }
            if (response.status >= 400) console.error("[CustomyAuth] Ticket exchange failed:", response.status);
            return toNextResponse(response);
        } catch (err) {
            console.error("[CustomyAuth] Error during ticket exchange:", err);
            return new NextResponse("Internal Server Error", { status: 500 });
        }
    };

    return { GET: handler, POST: handler };
}

// ─── 2. Middleware (Drop-In Next.js Protection) ───

/**
 * Middleware de Next.js: protege las páginas con la sesión de Access e inyecta
 * las cabeceras de ámbito en `/api/*`.
 */
export function customyMiddleware(options?: CustomyMiddlewareOptions) {
    warnDeprecated(MODULE, ADVICE);
    return async function middleware(request: NextRequest) {
        const result = await (async () => {
            try {
                return await webMiddleware({
                    ...webAccess(legacyAccessUrl(request, request.nextUrl, options)),
                    publicOrigin: legacyPublicOrigin(request, request.nextUrl, options?.publicOrigin),
                    ...legacyScope(options),
                    publicRoutes: options?.publicRoutes,
                    ignoredRoutes: options?.ignoredRoutes ?? ["/_next", "/favicon.ico"],
                    loginUrl: options?.loginUrl,
                    validateSession: options?.validateSession,
                })(request);
            } catch (error) {
                console.error("[CustomyAuth] middleware failed:", error);
                return null;
            }
        })();
        if (!result) return NextResponse.redirect(new URL(options?.loginUrl || "/login", legacyPublicOrigin(request, request.nextUrl, options?.publicOrigin)));
        if (result.action === "respond") return toNextResponse(result.response);
        const response = result.requestHeaders ? NextResponse.next({ request: { headers: result.requestHeaders } }) : NextResponse.next();
        result.responseHeaders?.forEach((value, key) => {
            if (key.toLowerCase() !== "set-cookie") response.headers.set(key, value);
        });
        for (const cookie of result.responseHeaders?.getSetCookie?.() ?? []) response.headers.append("set-cookie", cookie);
        return response;
    };
}

// ─── 3. Server-Side Session Fetcher (Next.js SSR) ───

type RenewalCookie = {
    name: string;
    value: string;
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
};

/** Una `Set-Cookie` como la opción de `cookies().set()` de Next.js; `null` si no se entiende. */
function parseRenewalCookie(header: string): RenewalCookie | null {
    const [pair, ...attributes] = header.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    if (!pair || separator <= 0) return null;
    const cookie: RenewalCookie = { name: pair.slice(0, separator).trim(), value: pair.slice(separator + 1).trim() };
    if (!cookie.name) return null;
    for (const attribute of attributes) {
        const [rawKey, ...rest] = attribute.split("=");
        const key = rawKey?.trim().toLowerCase();
        const value = rest.join("=").trim();
        if (key === "path") cookie.path = value || "/";
        else if (key === "max-age" && /^-?\d+$/.test(value)) cookie.maxAge = Number(value);
        else if (key === "expires") {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) cookie.expires = date;
        } else if (key === "httponly") cookie.httpOnly = true;
        else if (key === "secure") cookie.secure = true;
        else if (key === "samesite") {
            const sameSite = value.toLowerCase();
            if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") cookie.sameSite = sameSite;
        }
        // `Domain` nunca: `@customyai/web` ya las dejó como cookies de host.
    }
    return cookie;
}

/**
 * Aplica la renovación que devolvió Access, como hacía 0.x sin que la app
 * hiciera nada. Solo se puede donde Next.js deja escribir cookies (Route
 * Handlers y Server Actions); en un Server Component `set` lanza y la
 * renovación queda para el middleware, que la devuelve en su respuesta.
 */
function applyRenewalCookies(store: { set?: (...args: any[]) => unknown }, setCookies: readonly string[]): void {
    if (setCookies.length === 0 || typeof store.set !== "function") return;
    for (const header of setCookies) {
        const cookie = parseRenewalCookie(header);
        if (!cookie) continue;
        try {
            store.set(cookie);
        } catch {
            return;
        }
    }
}

/**
 * Sesión del usuario en un Server Component, validada en Access, o `null`.
 * @example
 * const { user, session } = await getServerSession();
 */
export async function getServerSession(options?: CustomyAuthOptions): Promise<{
    user: any;
    session: any;
    actor: any;
    isImpersonated: boolean;
} | null> {
    warnDeprecated(MODULE, ADVICE);
    try {
        const cookieStore = await cookies();
        const cookieHeader = cookieStore.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        const session = await webGetServerSession(cookieHeader, {
            ...webAccess(options?.accessUrl || env("NEXT_PUBLIC_ACCESS_API_URL") || "https://access.customy.ai"),
            environmentId: options?.environmentId,
            publishableKey: options?.publishableKey,
            organizationSlug: options?.organizationSlug,
            requireExactEnvironment: options?.requireExactEnvironment,
        });
        if (!session) return null;
        applyRenewalCookies(cookieStore, session.setCookies);
        return { user: session.user, session: session.session, actor: session.actor, isImpersonated: session.isImpersonated };
    } catch (error) {
        console.error("[Customy SSR] Error fetching server session:", error);
        return null;
    }
}

// ─── 4. Server Action Protection (Mutations) ───

/**
 * Protección de Server Actions: lanza si no hay sesión válida.
 *
 * @example
 * export async function saveProfile(data: FormData) {
 *     const { user } = await verifyActionSession();
 *     await db.update(user.id, data);
 * }
 */
export async function verifyActionSession(options?: CustomyAuthOptions): Promise<{
    user: any;
    session: any;
    actor: any;
    isImpersonated: boolean;
}> {
    const session = await getServerSession(options);
    if (!session || !session.user) {
        throw new Error("Unauthorized: Invalid Customy Access Session");
    }
    return session;
}
