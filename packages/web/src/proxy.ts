/**
 * Handlers de sesión same-origin sobre `Request`/`Response` estándar: la app
 * expone `/api/auth/*` en su propio origen y lo reenvía a Access, así que las
 * cookies de sesión son siempre de host (sin `Domain`), `HttpOnly` y nunca
 * viajan a otro origen. Sirven en cualquier runtime con `fetch` (node y edge)
 * y en cualquier framework cuyas rutas reciban una `Request` y devuelvan una
 * `Response`.
 */
import { ACCESS_PASSKEY_COOKIE, expireCookie, getSetCookieHeaders, parseCookieHeader, scopeSetCookieToHost, serializeCookie } from "./cookies";
import { fixedAuthScopeConfigured, matchesFixedAuthScope, sessionMatchesFixedScope } from "./auth-scope";
import {
    accessBaseUrl,
    applyNoStore,
    applyScopeHeaders,
    getPublicHost,
    getPublicOrigin,
    getPublicProto,
    jsonResponse,
    redirectResponse,
    type CustomyOriginOptions,
    type CustomyScopeOptions,
    type RequestLike,
} from "./origin";

export interface CustomyAuthProxyOptions extends CustomyScopeOptions, CustomyOriginOptions {
    /** URL de la API de Access (https). Obligatoria: el SDK no adivina hosts. */
    accessUrl: string;
    /** Ruta de la app donde se montan los handlers (por defecto `/api/auth`). */
    basePath?: string;
    defaultCallbackPath?: string;
    loginPath?: string;
    /** Apps externas: fija la identidad a la configuración del servidor. */
    enforceTenantScope?: boolean;
    /** Rutas relativas de Access que esta app expone (lista blanca). */
    allowedAuthPaths?: readonly string[];
    /**
     * Protección CSRF de las peticiones que cambian estado (por defecto true):
     * `Origin` debe ser el origen público y `Sec-Fetch-Site` no puede ser
     * `cross-site`.
     */
    csrfProtection?: boolean;
    /** Límite de espera a Access, en ms (por defecto 15 s). */
    timeoutMs?: number;
    fetch?: typeof fetch;
}

/** Contexto de ruta que pasan los frameworks con segmentos dinámicos (opcional). */
export type RouteContext<P> = { params?: P | Promise<P> } | undefined;

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const MAX_SCOPED_BODY_BYTES = 16_384;

function fetchOf(options: { fetch?: typeof fetch }): typeof fetch {
    return options.fetch ?? globalThis.fetch.bind(globalThis);
}

/** Segmentos tras `basePath` (`/api/auth/sign-in/email` → `sign-in/email`). */
export function authPathFromUrl(url: string, basePath = "/api/auth"): string[] {
    const pathname = new URL(url).pathname;
    const base = basePath.replace(/\/+$/, "");
    if (pathname !== base && !pathname.startsWith(`${base}/`)) return [];
    return pathname.slice(base.length).split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

async function paramsOf<P>(context: RouteContext<P>): Promise<P | undefined> {
    return context?.params ? await context.params : undefined;
}

function validPath(path: readonly string[]): boolean {
    return path.length > 0 && path.every((segment) => segment !== "" && segment !== "." && segment !== ".." && !/[/\\?#%]/.test(segment));
}

/**
 * Comprobación CSRF para métodos que cambian estado. Un navegador siempre
 * envía `Origin` en un POST cross-origin y `Sec-Fetch-Site` cuando lo conoce.
 */
export function crossSiteRequestRejected(request: RequestLike, options?: CustomyOriginOptions): boolean {
    if (SAFE_METHODS.includes(request.method.toUpperCase())) return false;
    if (request.headers.get("sec-fetch-site") === "cross-site") return true;
    const origin = request.headers.get("origin");
    return origin !== null && origin !== getPublicOrigin(request, options);
}

function forwardHeaders(request: RequestLike, options: CustomyAuthProxyOptions): Headers {
    const headers = new Headers();
    request.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (options.enforceTenantScope && !["cookie", "content-type", "accept", "origin", "referer", "user-agent"].includes(lower)) return;
        if (!["host", "connection", "content-length", "transfer-encoding"].includes(lower)) headers.set(key, value);
    });
    const publicOrigin = getPublicOrigin(request, options);
    const publicHost = getPublicHost(request, options);
    const publicProto = getPublicProto(request, options);
    headers.set("x-forwarded-host", publicHost);
    headers.set("x-forwarded-proto", publicProto);
    headers.set("x-customy-forwarded-host", publicHost);
    headers.set("x-customy-forwarded-proto", publicProto);
    headers.set("x-customy-public-origin", publicOrigin);
    if (!headers.has("origin") && !["GET", "HEAD"].includes(request.method)) headers.set("origin", publicOrigin);
    if (!headers.has("referer")) headers.set("referer", `${publicOrigin}${options.loginPath || "/login"}`);
    applyScopeHeaders(headers, new URL(request.url), options);
    return headers;
}

function copySetCookies(target: Headers, source: Headers, secure: boolean): void {
    for (const cookie of getSetCookieHeaders(source)) target.append("set-cookie", scopeSetCookieToHost(cookie, secure));
}

function upstreamUnavailable(): Response {
    return jsonResponse({ error: { code: "BAD_GATEWAY", message: "Customy Access is temporarily unavailable" } }, 502);
}

function errorResponse(code: string, status: number): Response {
    return jsonResponse({ error: { code, message: code.toLowerCase().replace(/_/g, " ") } }, status);
}

async function readLimitedBody(request: Request, limit: number): Promise<string | null> {
    const reader = request.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                return null;
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

async function proxyAuthRequest(request: Request, path: string[], options: CustomyAuthProxyOptions): Promise<Response> {
    if (!validPath(path)) return errorResponse("AUTH_PATH_NOT_FOUND", 404);
    const joined = path.join("/");
    if (options.allowedAuthPaths && !options.allowedAuthPaths.includes(joined)) return errorResponse("AUTH_PATH_NOT_ALLOWED", 404);
    if (options.csrfProtection !== false && crossSiteRequestRejected(request, options)) return errorResponse("AUTH_ORIGIN_MISMATCH", 403);
    const url = new URL(request.url);
    if (options.enforceTenantScope) {
        if (!fixedAuthScopeConfigured(options)) return errorResponse("AUTH_SCOPE_NOT_CONFIGURED", 503);
        if (!matchesFixedAuthScope(options, url.searchParams.entries()) || !matchesFixedAuthScope(options, request.headers.entries())) {
            return errorResponse("AUTH_SCOPE_MISMATCH", 403);
        }
        if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== options.publicOrigin) {
            return errorResponse("AUTH_ORIGIN_MISMATCH", 403);
        }
    }
    const init: RequestInit = {
        method: request.method,
        headers: forwardHeaders(request, options),
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    };
    if (!["GET", "HEAD"].includes(request.method)) {
        const body = options.enforceTenantScope ? await readLimitedBody(request, MAX_SCOPED_BODY_BYTES) : await request.text();
        if (body === null) return errorResponse("AUTH_BODY_TOO_LARGE", 413);
        if (options.enforceTenantScope && body) {
            try {
                const parsed: unknown = JSON.parse(body);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !matchesFixedAuthScope(options, Object.entries(parsed))) {
                    return errorResponse("AUTH_SCOPE_MISMATCH", 403);
                }
            } catch {
                return errorResponse("AUTH_BODY_INVALID", 400);
            }
        }
        if (body) init.body = body;
    }

    let upstream: Response;
    try {
        upstream = await fetchOf(options)(`${accessBaseUrl(options.accessUrl)}/api/auth/${path.map(encodeURIComponent).join("/")}${url.search}`, init);
    } catch {
        return upstreamUnavailable();
    }

    if (options.enforceTenantScope && joined === "get-session" && upstream.ok) {
        const data: unknown = await upstream.clone().json().catch(() => undefined);
        if (data !== null && !sessionMatchesFixedScope(data, options.environmentId!)) return jsonResponse(null, 200);
    }

    const headers = new Headers();
    upstream.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding", "content-length", "set-cookie"].includes(key.toLowerCase())) headers.set(key, value);
    });
    copySetCookies(headers, upstream.headers, getPublicProto(request, options) === "https");
    applyNoStore(headers);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function startSocialAuth(request: Request, provider: string, options: CustomyAuthProxyOptions): Promise<Response> {
    const publicOrigin = getPublicOrigin(request, options);
    const url = new URL(request.url);
    const loginPath = options.loginPath || "/login";
    const callbackURL = safeCallbackUrl(url.searchParams.get("callbackURL") || options.defaultCallbackPath || "/", publicOrigin);
    let upstream: Response;
    try {
        const headers = forwardHeaders(request, options);
        headers.set("content-type", "application/json");
        headers.set("accept", "application/json");
        upstream = await fetchOf(options)(`${accessBaseUrl(options.accessUrl)}/api/auth/sign-in/social`, {
            method: "POST",
            headers,
            body: JSON.stringify({ provider, callbackURL }),
            redirect: "manual",
            signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
    } catch {
        return redirectResponse(new URL(`${loginPath}?error=access_unavailable`, publicOrigin).toString());
    }
    const headerLocation = upstream.headers.get("location") || "";
    const payload = (headerLocation ? {} : await upstream.json().catch(() => ({}))) as { url?: unknown; error?: unknown; message?: unknown };
    const location = (typeof payload.url === "string" && payload.url) || headerLocation;
    if ((!upstream.ok && !(upstream.status >= 300 && upstream.status < 400)) || !location) {
        const error = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "oauth_start_failed";
        return redirectResponse(new URL(`${loginPath}?error=${encodeURIComponent(error)}`, publicOrigin).toString());
    }
    let target: string;
    try {
        target = new URL(location, publicOrigin).toString();
    } catch {
        return redirectResponse(new URL(`${loginPath}?error=oauth_start_failed`, publicOrigin).toString());
    }
    const response = redirectResponse(target);
    copySetCookies(response.headers, upstream.headers, getPublicProto(request, options) === "https");
    return response;
}

/** `callbackURL` absoluta en el origen público; otro origen vuelve a `/`. */
export function safeCallbackUrl(value: string, publicOrigin: string): string {
    try {
        const resolved = new URL(value || "/", publicOrigin);
        return resolved.origin === publicOrigin ? resolved.toString() : `${publicOrigin}/`;
    } catch {
        return `${publicOrigin}/`;
    }
}

type Handler<P> = (request: Request, context?: RouteContext<P>) => Promise<Response>;

/**
 * Proxy de `/api/auth/*` hacia Access. Los segmentos salen de
 * `context.params.path` si el framework los da, o de la URL tras `basePath`.
 * `GET sign-in/social?provider=…` arranca el login social con redirección.
 */
export function customyAuthProxyHandlers(options: CustomyAuthProxyOptions) {
    accessBaseUrl(options.accessUrl);
    const handler: Handler<{ path?: string[] }> = async (request, context) => {
        const path = (await paramsOf(context))?.path ?? authPathFromUrl(request.url, options.basePath);
        if (options.enforceTenantScope) return proxyAuthRequest(request, path, options);
        if (request.method === "GET" && path.join("/") === "sign-in/social") {
            const provider = new URL(request.url).searchParams.get("provider");
            if (!provider) return errorResponse("PROVIDER_REQUIRED", 400);
            return startSocialAuth(request, provider, options);
        }
        return proxyAuthRequest(request, path, options);
    };
    return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}

/** `GET …/social-redirect/<provider>`: arranca el login social y redirige al proveedor. */
export function customySocialRedirectHandlers(options: CustomyAuthProxyOptions) {
    accessBaseUrl(options.accessUrl);
    const GET: Handler<{ provider?: string }> = async (request, context) => {
        const provider = (await paramsOf(context))?.provider ?? new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
        if (!provider) return errorResponse("PROVIDER_REQUIRED", 400);
        return startSocialAuth(request, decodeURIComponent(provider), options);
    };
    return { GET };
}

function authCookieNames(cookieHeader: string | null): string[] {
    const names: string[] = [];
    for (const name of parseCookieHeader(cookieHeader).keys()) {
        if (name.endsWith(".session_token") || name.endsWith(".state") || name.endsWith(".session_data") || name.endsWith(".dont_remember")
            || name.endsWith(".callback_url") || name.endsWith(`.${ACCESS_PASSKEY_COOKIE}`) || name === ACCESS_PASSKEY_COOKIE
            || name === "session_token" || name === "__Secure-session_token") {
            names.push(name);
        }
    }
    return names;
}

/** `POST` sign-out: cierra la sesión en Access y borra las cookies de auth del host. */
export function customySignOutHandlers(options: CustomyAuthProxyOptions) {
    accessBaseUrl(options.accessUrl);
    const POST = async (request: Request): Promise<Response> => {
        if (options.csrfProtection !== false && crossSiteRequestRejected(request, options)) return errorResponse("AUTH_ORIGIN_MISMATCH", 403);
        let upstream: Response;
        try {
            upstream = await fetchOf(options)(`${accessBaseUrl(options.accessUrl)}/api/auth/sign-out`, {
                method: "POST",
                headers: forwardHeaders(request, options),
                redirect: "manual",
                signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
            });
        } catch {
            return upstreamUnavailable();
        }
        const secure = getPublicProto(request, options) === "https";
        const headers = new Headers();
        copySetCookies(headers, upstream.headers, secure);
        for (const name of authCookieNames(request.headers.get("cookie"))) headers.append("set-cookie", expireCookie(name, secure || name.startsWith("__Secure-")));
        applyNoStore(headers);
        return new Response(null, { status: upstream.ok ? 204 : upstream.status, headers });
    };
    return { POST };
}

/** `POST`: borra las cookies `*.state` de un login OAuth abandonado. */
export function customyClearOAuthStateHandlers(options: CustomyOriginOptions & { csrfProtection?: boolean } = {}) {
    const POST = async (request: Request): Promise<Response> => {
        if (options.csrfProtection !== false && crossSiteRequestRejected(request, options)) return errorResponse("AUTH_ORIGIN_MISMATCH", 403);
        const names = new Set<string>([...parseCookieHeader(request.headers.get("cookie")).keys()].filter((name) => name.endsWith(".state")));
        for (const tag of ["stg", "dev", "prd"]) {
            names.add(`customy-${tag}.state`);
            names.add(`__Secure-customy-${tag}.state`);
        }
        const headers = new Headers();
        for (const name of names) headers.append("set-cookie", expireCookie(name, true));
        applyNoStore(headers);
        return new Response(null, { status: 204, headers });
    };
    return { POST };
}

export interface CustomyAuthCallbackOptions extends CustomyOriginOptions {
    accessUrl: string;
    /** Ruta tras canjear el ticket (por defecto `/`). */
    redirectTo?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}

/** Todos los nombres de cookie de sesión que Access puede leer, seguros y no. */
export function candidateSessionCookieNames(): string[] {
    const names: string[] = [];
    for (const prefix of ["customy-prd", "customy-stg", "customy-dev", "customy"]) names.push(`__Secure-${prefix}.session_token`, `${prefix}.session_token`);
    return names;
}

/**
 * Callback de impersonación: canjea `?ticket=` en Access y deja la sesión en
 * cookies de host `HttpOnly` de esta app (nunca en otro subdominio).
 */
export function handleCustomyAuth(options: CustomyAuthCallbackOptions) {
    accessBaseUrl(options.accessUrl);
    const handler = async (request: Request): Promise<Response> => {
        const ticket = new URL(request.url).searchParams.get("ticket");
        if (!ticket) return new Response("Not Found or Missing required auth parameters", { status: 404 });
        let res: Response;
        try {
            res = await fetchOf(options)(`${accessBaseUrl(options.accessUrl)}/api/v1/impersonation/exchange?ticket=${encodeURIComponent(ticket)}`, {
                method: "GET",
                headers: { accept: "application/json" },
                redirect: "error",
                signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
            });
        } catch {
            return upstreamUnavailable();
        }
        if (!res.ok) return new Response(`Ticket exchange failed: ${res.statusText}`, { status: res.status });
        const data = await res.json().catch(() => null) as { sessionToken?: unknown; expiresIn?: unknown } | null;
        if (!data || typeof data.sessionToken !== "string" || !data.sessionToken) return new Response("Invalid ticket exchange response", { status: 502 });
        const publicOrigin = getPublicOrigin(request, options);
        const secure = getPublicProto(request, options) === "https";
        const maxAge = typeof data.expiresIn === "number" && data.expiresIn > 0 ? data.expiresIn : 3600;
        const response = redirectResponse(new URL(options.redirectTo || "/", publicOrigin).toString(), 307);
        const value = /^[!#-+\--:<-[\]-~]*$/.test(data.sessionToken) ? data.sessionToken : encodeURIComponent(data.sessionToken);
        for (const name of candidateSessionCookieNames()) {
            if (name.startsWith("__Secure-") && !secure) continue;
            response.headers.append("set-cookie", serializeCookie(name, value, { secure, maxAge }));
        }
        return response;
    };
    return { GET: handler, POST: handler };
}
