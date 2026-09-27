/**
 * Sesión en el servidor de la app: leer la cookie de sesión de una petición,
 * validarla en Access y proteger rutas. Access es siempre quien valida; la
 * cookie sola no concede nada.
 */
import { CustomySdkError } from "@customyai/core";
import { getSetCookieHeaders, isScopedAccessSessionCookieName, parseCookieHeader, preferCurrentAccessCookies, scopeSetCookieToHost, expireCookie } from "./cookies";
import { sessionMatchesFixedScope } from "./auth-scope";
import { candidateSessionCookieNames } from "./proxy";
import {
    accessBaseUrl,
    applyScopeHeaders,
    getPublicHost,
    getPublicOrigin,
    getPublicProto,
    redirectResponse,
    type CustomyOriginOptions,
    type CustomyScopeOptions,
    type RequestLike,
} from "./origin";

export interface CustomyAuthOptions extends CustomyScopeOptions, CustomyOriginOptions {
    /** URL de la API de Access (https). */
    accessUrl: string;
    /** Exige una sesión emitida en esta app, no una proyección del Workspace. */
    requireExactEnvironment?: boolean;
    fetch?: typeof fetch;
    /** Límite de espera a Access, en ms (por defecto 8 s). */
    timeoutMs?: number;
}

export interface CustomyServerSession {
    user: Record<string, unknown> & { id: string };
    session: Record<string, unknown>;
    actor: Record<string, unknown> | null;
    isImpersonated: boolean;
    /** `Set-Cookie` de renovación que devolvió Access, ya adaptadas al host. */
    setCookies: string[];
}

/** Origen de la cookie: una `Request`, sus `Headers` o la cabecera `Cookie` en texto. */
export type CookieSource = RequestLike | Headers | string | null | undefined;

function cookieHeaderOf(source: CookieSource): string | null {
    if (source === null || source === undefined) return null;
    if (typeof source === "string") return source;
    if (source instanceof Headers) return source.get("cookie");
    return source.headers.get("cookie");
}

/**
 * Cookie de sesión de Access presente en la cabecera: primero la de una
 * aplicación con entorno propio (base actual antes que heredadas), luego las
 * de base por entorno y por último cualquier `*.session_token`.
 */
export function resolveSessionCookie(cookieHeader: string | null): { cookieName: string; cookieValue: string } | null {
    const cookies = parseCookieHeader(cookieHeader);
    const names = [...cookies.keys()];
    const scoped = preferCurrentAccessCookies(names.filter((name) => isScopedAccessSessionCookieName(name)));
    const fallback = names.filter((name) => name.endsWith(".session_token") && !scoped.includes(name));
    const seen = new Set<string>();
    for (const name of [...scoped, ...candidateSessionCookieNames(), ...fallback]) {
        if (seen.has(name)) continue;
        seen.add(name);
        const value = cookies.get(name);
        if (value) return { cookieName: name, cookieValue: value };
    }
    return null;
}

type SessionLookup =
    | { kind: "valid"; data: { user: Record<string, unknown> & { id: string }; session: Record<string, unknown>; act?: unknown }; setCookies: string[] }
    | { kind: "invalid" }
    | { kind: "unavailable" };

async function lookupSession(
    cookie: { cookieName: string; cookieValue: string },
    options: CustomyAuthOptions,
    request: RequestLike | null,
): Promise<SessionLookup> {
    const headers = new Headers({ cookie: `${cookie.cookieName}=${cookie.cookieValue}`, accept: "application/json" });
    if (request) {
        headers.set("x-forwarded-host", getPublicHost(request, options));
        headers.set("x-forwarded-proto", getPublicProto(request, options));
        headers.set("x-customy-forwarded-host", getPublicHost(request, options));
        headers.set("x-customy-forwarded-proto", getPublicProto(request, options));
        headers.set("x-customy-public-origin", getPublicOrigin(request, options));
    }
    applyScopeHeaders(headers, request ? new URL(request.url) : new URL("https://invalid.invalid/"), options);
    let res: Response;
    try {
        res = await (options.fetch ?? globalThis.fetch.bind(globalThis))(`${accessBaseUrl(options.accessUrl)}/api/auth/get-session`, {
            method: "GET",
            headers,
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
        });
    } catch (error) {
        if (error instanceof CustomySdkError) throw error;
        return { kind: "unavailable" };
    }
    // Solo 401/403 o una respuesta 2xx sin sesión son un veredicto; un 5xx es Access reiniciándose.
    if (res.status >= 500 || res.status === 429) return { kind: "unavailable" };
    if (!res.ok) return { kind: "invalid" };
    const data = await res.json().catch(() => null) as { user?: { id?: unknown }; session?: unknown; act?: unknown } | null;
    if (!data?.user || typeof data.user.id !== "string" || !data.session || typeof data.session !== "object") return { kind: "invalid" };
    const secure = request ? getPublicProto(request, options) === "https" : true;
    return {
        kind: "valid",
        data: data as { user: Record<string, unknown> & { id: string }; session: Record<string, unknown>; act?: unknown },
        setCookies: getSetCookieHeaders(res.headers).map((value) => scopeSetCookieToHost(value, secure)),
    };
}

/**
 * Sesión del usuario de una petición, validada en Access, o `null`. Nunca
 * lanza por una sesión ausente o inválida; sí por una configuración inválida.
 */
export async function getServerSession(source: CookieSource, options: CustomyAuthOptions): Promise<CustomyServerSession | null> {
    accessBaseUrl(options.accessUrl);
    if (options.requireExactEnvironment && (!options.environmentId || !options.publishableKey || !options.organizationSlug)) return null;
    const cookie = resolveSessionCookie(cookieHeaderOf(source));
    if (!cookie) return null;
    const request = source && typeof source === "object" && !(source instanceof Headers) ? source : null;
    const result = await lookupSession(cookie, options, request);
    if (result.kind !== "valid") return null;
    if (options.requireExactEnvironment && !sessionMatchesFixedScope(result.data, options.environmentId!)) return null;
    const actor = result.data.act && typeof result.data.act === "object" ? result.data.act as Record<string, unknown> : null;
    return { user: result.data.user, session: result.data.session, actor, isImpersonated: actor !== null, setCookies: result.setCookies };
}

/** Como `getServerSession`, pero lanza `CustomySdkError` (`UNAUTHORIZED`, 401) si no hay sesión. */
export async function verifyActionSession(source: CookieSource, options: CustomyAuthOptions): Promise<CustomyServerSession> {
    const session = await getServerSession(source, options);
    if (!session) throw new CustomySdkError({ code: "UNAUTHORIZED", status: 401, service: "access", message: "Unauthorized: Invalid Customy Access Session" });
    return session;
}

export interface CustomyMiddlewareOptions extends CustomyScopeOptions, CustomyOriginOptions {
    accessUrl: string;
    /** Rutas sin sesión (prefijo o expresión regular). Por defecto `/login` y `/api/customy/callback`. */
    publicRoutes?: string[];
    /** Rutas que el middleware ignora por completo (estáticos). Por defecto `/favicon.ico`. */
    ignoredRoutes?: string[];
    /** Página de login a la que se redirige sin sesión. */
    loginUrl?: string;
    /** Valida la sesión en Access en vez de mirar solo si hay cookie (por defecto true). */
    validateSession?: boolean;
    fetch?: typeof fetch;
    timeoutMs?: number;
}

/**
 * Resultado del middleware, sin atarse a un framework:
 * - `next`: seguir; `requestHeaders` (si viene) sustituye a las cabeceras de la
 *   petición que sigue, y `responseHeaders` lleva `Set-Cookie` para la respuesta
 *   (renovación de la sesión o limpieza).
 * - `respond`: devolver `response` (redirección al login).
 */
export type CustomyMiddlewareResult =
    | { action: "next"; requestHeaders?: Headers; responseHeaders?: Headers }
    | { action: "respond"; response: Response };

function matchesRoute(pathname: string, routes: readonly string[]): boolean {
    return routes.some((route) => {
        if (pathname === route || pathname.startsWith(route)) return true;
        try { return new RegExp(route).test(pathname); } catch { return false; }
    });
}

function loginRedirect(request: RequestLike, options: CustomyMiddlewareOptions): Response {
    const target = options.loginUrl || "/login";
    const login = /^https?:\/\//.test(target) ? new URL(target) : new URL(target, getPublicOrigin(request, options));
    const url = new URL(request.url);
    login.searchParams.set("callbackUrl", `${url.pathname}${url.search}` || "/");
    return redirectResponse(login.toString(), 307);
}

/** Protección de rutas: sin sesión válida, redirige al login con `callbackUrl`. */
export function customyMiddleware(options: CustomyMiddlewareOptions) {
    accessBaseUrl(options.accessUrl);
    return async function middleware(request: RequestLike): Promise<CustomyMiddlewareResult> {
        const url = new URL(request.url);
        const pathname = url.pathname;
        if (matchesRoute(pathname, options.ignoredRoutes ?? ["/favicon.ico"])) return { action: "next" };
        if (matchesRoute(pathname, options.publicRoutes ?? ["/login", "/api/customy/callback"])) return { action: "next" };

        if (pathname.startsWith("/api/")) {
            const requestHeaders = new Headers(request.headers);
            requestHeaders.set("x-forwarded-host", getPublicHost(request, options));
            requestHeaders.set("x-forwarded-proto", getPublicProto(request, options));
            applyScopeHeaders(requestHeaders, url, options);
            return { action: "next", requestHeaders };
        }

        const cookie = resolveSessionCookie(request.headers.get("cookie"));
        if (!cookie) return { action: "respond", response: loginRedirect(request, options) };
        if (options.validateSession === false) return { action: "next" };

        const result = await lookupSession(cookie, options, request);
        if (result.kind === "valid") {
            if (result.setCookies.length === 0) return { action: "next" };
            const responseHeaders = new Headers();
            for (const value of result.setCookies) responseHeaders.append("set-cookie", value);
            return { action: "next", responseHeaders };
        }
        const response = loginRedirect(request, options);
        if (result.kind === "invalid") {
            const secure = getPublicProto(request, options) === "https";
            for (const name of candidateSessionCookieNames()) response.headers.append("set-cookie", expireCookie(name, secure || name.startsWith("__Secure-")));
            if (!candidateSessionCookieNames().includes(cookie.cookieName)) response.headers.append("set-cookie", expireCookie(cookie.cookieName, secure || cookie.cookieName.startsWith("__Secure-")));
        }
        return { action: "respond", response };
    };
}
