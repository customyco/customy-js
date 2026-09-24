import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_BASE, ACCESS_PASSKEY_COOKIE, accessCookieBasePrefix } from "./cookies";
import { cookies } from "next/headers";
import { fixedAuthScopeConfigured, matchesFixedAuthScope, sessionMatchesFixedScope } from "./auth-scope";

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

// ─── Environment / Cookie Helpers ───

function getCookieNames(accessUrl: string = "https://access.customy.ai") {
    const isProd = process.env.NODE_ENV === "production";
    const secure = isProd || accessUrl.startsWith("https");
    
    // Check all environments defensively to prevent infinite redirect loops 
    // caused by UI/API APP_ENV desync.
    const prefixes = [accessCookieBasePrefix("production"), accessCookieBasePrefix("staging"), accessCookieBasePrefix("local"), ACCESS_COOKIE_BASE];
    
    const cookieNames: string[] = [];
    for (const prefix of prefixes) {
        // Unconditionally explicitly add both the Secure and Non-Secure variants
        // because the Next.js Edge worker environment might locally evaluate to "non-secure"
        // while the remote backend issued a __Secure- token. Never assume.
        cookieNames.push(`__Secure-${prefix}.session_token`);
        cookieNames.push(`${prefix}.session_token`);
    }

    // Still return the primary one based on environment for setting cookies (callback)
    const envName = process.env.APP_ENV || (isProd ? "production" : "local");
    const activePrefix = ["staging", "production", "local"].includes(envName) ? accessCookieBasePrefix(envName) : ACCESS_COOKIE_BASE;

    const primaryCookieName = secure ? `__Secure-${activePrefix}.session_token` : `${activePrefix}.session_token`;
    const fallbackCookieName = secure ? "__Secure-session_token" : "session_token";

    return { primaryCookieName, fallbackCookieName, secure, activePrefix, allPossibleNames: cookieNames };
}

function isScopedSessionCookie(name: string) {
    return /(?:__Secure-)?customy-(?:stg|prd|dev)-[^.]+\.session_token$/.test(name);
}

function isFallbackSessionCookie(name: string) {
    return name.endsWith(".session_token");
}

function collectCandidateCookieNames(names: string[]) {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const name of names) {
        if (!seen.has(name)) {
            seen.add(name);
            ordered.push(name);
        }
    }

    return ordered;
}

function resolveSessionCookieNameFromRequest(request: NextRequest, accessUrl: string) {
    const { allPossibleNames } = getCookieNames(accessUrl);
    const requestCookieNames = request.cookies.getAll().map((cookie) => cookie.name);
    const scopedNames = requestCookieNames.filter(isScopedSessionCookie);
    const fallbackNames = requestCookieNames.filter(
        (name) => isFallbackSessionCookie(name) && !scopedNames.includes(name),
    );
    const candidateNames = collectCandidateCookieNames([
        ...scopedNames,
        ...allPossibleNames,
        ...fallbackNames,
    ]);

    for (const cookieName of candidateNames) {
        const val = request.cookies.get(cookieName);
        if (val) {
            return { cookieName, cookieValue: val.value };
        }
    }

    return null;
}

function resolveSessionCookieNameFromStore(
    cookieStore: Awaited<ReturnType<typeof cookies>>,
    accessUrl: string,
) {
    const { allPossibleNames } = getCookieNames(accessUrl);
    const storeCookieNames = cookieStore.getAll().map((cookie) => cookie.name);
    const scopedNames = storeCookieNames.filter(isScopedSessionCookie);
    const fallbackNames = storeCookieNames.filter(
        (name) => isFallbackSessionCookie(name) && !scopedNames.includes(name),
    );
    const candidateNames = collectCandidateCookieNames([
        ...scopedNames,
        ...allPossibleNames,
        ...fallbackNames,
    ]);

    for (const cookieName of candidateNames) {
        const val = cookieStore.get(cookieName)?.value;
        if (val) {
            return { cookieName, cookieValue: val };
        }
    }

    return null;
}

function expireCandidateSessionCookies(response: NextResponse, accessUrl: string) {
    const { allPossibleNames } = getCookieNames(accessUrl);
    for (const cookieName of allPossibleNames) {
        response.cookies.set({
            name: cookieName,
            value: "",
            httpOnly: true,
            secure: cookieName.startsWith("__Secure-") || accessUrl.startsWith("https"),
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });
    }
    response.cookies.set({
        name: "__Secure-session_token",
        value: "",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
    response.cookies.set({
        name: "session_token",
        value: "",
        httpOnly: true,
        secure: accessUrl.startsWith("https"),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
}

function firstForwardedValue(value: string | null) {
    return value?.split(",")[0]?.trim() || "";
}

function hostnameFromHost(host: string) {
    const cleaned = firstForwardedValue(host);
    if (!cleaned) return "";
    if (cleaned.startsWith("[")) return cleaned.slice(1, cleaned.indexOf("]"));
    return cleaned.split(":")[0]?.toLowerCase() || "";
}

function isInternalHost(host: string) {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"].includes(hostnameFromHost(host));
}

function configuredPublicOrigin(options?: CustomyAuthProxyOptions) {
    const configured = options?.publicOrigin
        || process.env.NEXT_PUBLIC_WORKSPACE_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || process.env.APP_URL
        || process.env.NEXT_PUBLIC_WEB_URL
        || "";
    if (!configured) return "";
    try {
        return new URL(configured).origin;
    } catch {
        return "";
    }
}

function getPublicHost(request: AuthCallbackRequest, options?: CustomyAuthProxyOptions) {
    const configured = configuredPublicOrigin(options);
    const configuredHost = configured ? new URL(configured).host : "";
    const candidates = [
        firstForwardedValue(request.headers.get("x-customy-forwarded-host")),
        firstForwardedValue(request.headers.get("x-forwarded-host")),
        firstForwardedValue(request.headers.get("host")),
        request.nextUrl.host,
    ];
    return candidates.find((host) => host && !isInternalHost(host)) || configuredHost || candidates.find(Boolean) || "";
}

function getPublicProto(request: AuthCallbackRequest, options?: CustomyAuthProxyOptions) {
    const configured = configuredPublicOrigin(options);
    const publicHost = getPublicHost(request, options);
    if (configured) {
        const configuredUrl = new URL(configured);
        if (isInternalHost(publicHost) || publicHost === configuredUrl.host) return configuredUrl.protocol.replace(":", "");
    }
    const forwardedProto = firstForwardedValue(request.headers.get("x-customy-forwarded-proto"))
        || firstForwardedValue(request.headers.get("x-forwarded-proto"))
        || "";
    if (forwardedProto === "http" || forwardedProto === "https") return forwardedProto;
    const host = publicHost;
    if (host.endsWith(".customy.ai") || host.endsWith(".chriscarvajal.com")) return "https";
    return request.nextUrl.protocol.replace(":", "") || "https";
}

function getPublicOrigin(request: AuthCallbackRequest, options?: CustomyAuthProxyOptions) {
    return `${getPublicProto(request, options)}://${getPublicHost(request, options)}`;
}

function inferAccessBaseFromHost(host: string) {
    const normalizedHost = hostnameFromHost(host);
    if (!normalizedHost) return "";
    if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1") return "http://127.0.0.1:4001";
    if (normalizedHost === "access.chriscarvajal.com" || normalizedHost === "agent.chriscarvajal.com") {
        return process.env.CUSTOMY_ACCESS_INTERNAL_URL
            || process.env.CUSTOMY_ACCESS_API_URL
            || process.env.CUSTOMY_ACCESS_URL
            || process.env.ACCESS_API_URL
            || "http://127.0.0.1:4000";
    }
    if (normalizedHost.includes("staging") && normalizedHost.endsWith(".customy.ai")) return "https://access-api.staging.customy.ai";
    if (normalizedHost.endsWith(".customy.ai") || normalizedHost.endsWith(".chriscarvajal.com")) return "https://access-api.customy.ai";
    return "";
}

function resolveAccessProxyBaseUrl(request: NextRequest, options?: CustomyAuthProxyOptions) {
    return (
        options?.accessUrl
        || process.env.CUSTOMY_ACCESS_INTERNAL_URL
        || process.env.CUSTOMY_ACCESS_API_URL
        || process.env.CUSTOMY_ACCESS_URL
        || process.env.ACCESS_API_URL
        || inferAccessBaseFromHost(getPublicHost(request, options))
        || process.env.NEXT_PUBLIC_ACCESS_API_URL
        || process.env.NEXT_PUBLIC_API_BASE_URL
        || "http://127.0.0.1:4001"
    ).replace(/\/$/, "");
}

async function fetchAuthProxyUpstream(
    request: NextRequest,
    path: string[],
    init: RequestInit,
    options?: CustomyAuthProxyOptions,
) {
    const baseUrl = resolveAccessProxyBaseUrl(request, options);
    const suffix = `/api/auth/${path.join("/")}${request.nextUrl.search || ""}`;
    try {
        return await fetch(`${baseUrl}${suffix}`, init);
    } catch {
        return null;
    }
}

function splitSetCookieHeader(value: string): string[] {
    const cookies: string[] = [];
    let start = 0;
    let inExpires = false;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        const lowerSlice = value.slice(index, index + 8).toLowerCase();

        if (lowerSlice === "expires=") {
            inExpires = true;
            index += 7;
            continue;
        }

        if (inExpires && char === ";") {
            inExpires = false;
            continue;
        }

        if (!inExpires && char === ",") {
            const rest = value.slice(index + 1);
            if (/^\s*[^;,=\s]+=[^;]*/.test(rest)) {
                cookies.push(value.slice(start, index).trim());
                start = index + 1;
            }
        }
    }

    const last = value.slice(start).trim();
    if (last) cookies.push(last);
    return cookies.filter(Boolean);
}

function getSetCookieHeaders(headers: Headers): string[] {
    const nodeHeaders = headers as Headers & {
        getSetCookie?: () => string[];
        raw?: () => Record<string, string[] | undefined>;
    };

    if (typeof nodeHeaders.getSetCookie === "function") {
        const values = nodeHeaders.getSetCookie();
        if (values.length > 0) return values.flatMap(splitSetCookieHeader);
    }

    const rawValues = typeof nodeHeaders.raw === "function" ? nodeHeaders.raw()["set-cookie"] : undefined;
    if (rawValues?.length) return rawValues.flatMap(splitSetCookieHeader);

    const combined = headers.get("set-cookie");
    return combined ? splitSetCookieHeader(combined) : [];
}

function scopeSetCookieToHost(cookie: string) {
    return cookie
        .split(";")
        .filter((part) => !/^\s*domain=/i.test(part))
        .join(";")
        .replace(/;\s*SameSite=None/gi, "; SameSite=Lax");
}

function appendScopedSetCookieHeaders(target: Headers, source: Headers, _publicHost?: string) {
    for (const cookie of getSetCookieHeaders(source)) {
        target.append("set-cookie", scopeSetCookieToHost(cookie));
    }
}

function applyNoStore(headers: Headers) {
    headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    headers.set("pragma", "no-cache");
    headers.set("expires", "0");
}

function proxyErrorResponse(status: number) {
    const response = NextResponse.json(
        {
            error: status === 502 ? "BAD_GATEWAY" : "AUTH_PROXY_ERROR",
            message: status === 502 ? "Customy Access is temporarily unavailable" : "Authentication request failed",
            statusCode: status,
        },
        { status },
    );
    applyNoStore(response.headers);
    return response;
}

function searchParam(request: NextRequest, names: string[], fallback = "") {
    for (const name of names) {
        const value = request.nextUrl.searchParams.get(name);
        if (value) return value;
    }
    return fallback;
}

function proxyPublishableKey(request: NextRequest, options?: CustomyAuthProxyOptions) {
    return searchParam(
        request,
        ["publishableKey", "publishable_key", "pk"],
        options?.publishableKey
        || process.env.NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY
        || process.env.NEXT_PUBLIC_ACCESS_PUBLISHABLE_KEY
        || "",
    );
}

function proxyEnvironmentId(request: NextRequest, options?: CustomyAuthProxyOptions) {
    return searchParam(
        request,
        ["envId", "env_id", "environmentId", "environment_id"],
        options?.environmentId
        || process.env.NEXT_PUBLIC_ACCESS_ENV_ID
        || process.env.NEXT_PUBLIC_ACCESS_ENVIRONMENT_ID
        || process.env.ACCESS_ENV_ID
        || process.env.ACCESS_ENVIRONMENT_ID
        || "",
    );
}

function proxyOrganizationSlug(request: NextRequest, options?: CustomyAuthProxyOptions) {
    return searchParam(
        request,
        ["orgSlug", "org_slug", "orgId", "org_id", "organizationId", "organization_id"],
        options?.organizationSlug
        || process.env.NEXT_PUBLIC_ACCESS_ORG_SLUG
        || process.env.NEXT_PUBLIC_ORG_SLUG
        || "",
    );
}

function applyProxyAccessHeaders(headers: Headers, request: NextRequest, options?: CustomyAuthProxyOptions) {
    const publishableKey = proxyPublishableKey(request, options);
    const environmentId = proxyEnvironmentId(request, options);
    const organizationSlug = proxyOrganizationSlug(request, options);

    if (publishableKey) headers.set("x-publishable-key", publishableKey);
    if (environmentId) {
        headers.set("x-env-id", environmentId);
        headers.set("x-environment-id", environmentId);
    }
    if (organizationSlug) headers.set("x-organization-id", organizationSlug);
}

function toAbsoluteCallbackURL(value: string, origin: string) {
    try {
        return new URL(value || "/", origin).toString();
    } catch {
        return `${origin}/`;
    }
}

function toSafeRedirectURL(value: string, origin: string) {
    try {
        return new URL(value).toString();
    } catch {
        return new URL(value, origin).toString();
    }
}

function authForwardHeaders(request: NextRequest, options?: CustomyAuthProxyOptions) {
    const headers = new Headers();
    request.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (options?.enforceTenantScope && !["cookie", "content-type", "accept", "origin", "referer", "user-agent"].includes(lowerKey)) return;
        if (!["host", "connection", "content-length", "transfer-encoding"].includes(lowerKey)) {
            headers.set(key, value);
        }
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
    if (!headers.has("referer")) headers.set("referer", `${publicOrigin}${options?.loginPath || "/login"}`);

    applyProxyAccessHeaders(headers, request, options);

    return headers;
}

async function proxyAuthRequest(request: NextRequest, path: string[], options?: CustomyAuthProxyOptions) {
    if (options?.allowedAuthPaths && !options.allowedAuthPaths.includes(path.join("/"))) {
        return NextResponse.json({ error: "AUTH_PATH_NOT_ALLOWED" }, { status: 404 });
    }
    if (options?.enforceTenantScope) {
        if (!fixedAuthScopeConfigured(options)) return NextResponse.json({ error: "AUTH_SCOPE_NOT_CONFIGURED" }, { status: 503 });
        if (!matchesFixedAuthScope(options, request.nextUrl.searchParams.entries()) || !matchesFixedAuthScope(options, request.headers.entries())) {
            return NextResponse.json({ error: "AUTH_SCOPE_MISMATCH" }, { status: 403 });
        }
        if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== options.publicOrigin) {
            return NextResponse.json({ error: "AUTH_ORIGIN_MISMATCH" }, { status: 403 });
        }
    }
    const init: RequestInit = {
        method: request.method,
        headers: authForwardHeaders(request, options),
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
    };
    if (!["GET", "HEAD"].includes(request.method)) {
        let body: string;
        if (options?.enforceTenantScope) {
            const reader = request.body?.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            if (reader) {
                try {
                    while (true) {
                        const part = await reader.read();
                        if (part.done) break;
                        size += part.value.byteLength;
                        if (size > 16384) {
                            await reader.cancel();
                            return NextResponse.json({ error: "AUTH_BODY_TOO_LARGE" }, { status: 413 });
                        }
                        chunks.push(part.value);
                    }
                } finally { reader.releaseLock(); }
            }
            const bytes = new Uint8Array(size); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            body = new TextDecoder().decode(bytes);
        } else body = await request.text();
        if (options?.enforceTenantScope && body) {
            try {
                const parsed = JSON.parse(body);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !matchesFixedAuthScope(options, Object.entries(parsed))) {
                    return NextResponse.json({ error: "AUTH_SCOPE_MISMATCH" }, { status: 403 });
                }
            } catch { return NextResponse.json({ error: "AUTH_BODY_INVALID" }, { status: 400 }); }
        }
        if (body) init.body = body;
    }

    const upstream = await fetchAuthProxyUpstream(request, path, init, options);
    if (!upstream) {
        return proxyErrorResponse(502);
    }

    if (options?.enforceTenantScope && path.join("/") === "get-session" && upstream.ok) {
        const data = await upstream.clone().json().catch(() => undefined);
        if (data !== null && !sessionMatchesFixedScope(data, options.environmentId!)) {
            const rejected = NextResponse.json(null, { status: 200 });
            applyNoStore(rejected.headers);
            return rejected;
        }
    }

    const headers = new Headers();
    upstream.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding", "content-length", "set-cookie"].includes(key.toLowerCase())) {
            headers.set(key, value);
        }
    });
    appendScopedSetCookieHeaders(headers, upstream.headers, getPublicHost(request, options));
    applyNoStore(headers);

    return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

async function startSocialAuth(request: NextRequest, provider: string, options?: CustomyAuthProxyOptions) {
    const publicOrigin = getPublicOrigin(request, options);
    const callbackURL = toAbsoluteCallbackURL(
        request.nextUrl.searchParams.get("callbackURL") || options?.defaultCallbackPath || "/",
        publicOrigin,
    );
    let upstream: Response;
    try {
        const headers = authForwardHeaders(request, options);
        headers.set("content-type", "application/json");
        headers.set("accept", "application/json");
        upstream = await fetch(`${resolveAccessProxyBaseUrl(request, options)}/api/auth/sign-in/social`, {
            method: "POST",
            headers,
            body: JSON.stringify({ provider, callbackURL }),
            redirect: "manual",
        });
    } catch {
        const response = NextResponse.redirect(new URL(`${options?.loginPath || "/login"}?error=access_unavailable`, publicOrigin), 302);
        applyNoStore(response.headers);
        return response;
    }

    const headerRedirectUrl = upstream.headers.get("location") || "";
    const payload = headerRedirectUrl ? {} : await upstream.json().catch(() => ({} as { url?: string; error?: string; message?: string }));
    const redirectUrl = (payload as { url?: string }).url || headerRedirectUrl;
    if ((!upstream.ok && !(upstream.status >= 300 && upstream.status < 400)) || !redirectUrl) {
        const error = (payload as { error?: string; message?: string }).error
            || (payload as { message?: string }).message
            || "oauth_start_failed";
        const response = NextResponse.redirect(new URL(`${options?.loginPath || "/login"}?error=${encodeURIComponent(error)}`, publicOrigin), 302);
        applyNoStore(response.headers);
        return response;
    }

    const response = NextResponse.redirect(toSafeRedirectURL(redirectUrl, publicOrigin), 302);
    appendScopedSetCookieHeaders(response.headers, upstream.headers, getPublicHost(request, options));
    applyNoStore(response.headers);
    return response;
}

function collectAuthCookieNames(cookieHeader: string | null): string[] {
    if (!cookieHeader) return [];
    const discovered = new Set<string>();
    for (const part of cookieHeader.split(";")) {
        const name = part.trim().split("=")[0];
        if (
            name
            && (name.endsWith(".session_token")
                || name.endsWith(".state")
                || name.endsWith(".callback_url")
                || name.endsWith(`.${ACCESS_PASSKEY_COOKIE}`)
                || name === "session_token"
                || name === "__Secure-session_token"
                || name === "customy.session_token")
        ) {
            discovered.add(name);
        }
    }
    return Array.from(discovered);
}

function expireCookie(name: string, secure: boolean) {
    const securePart = secure ? "; Secure" : "";
    return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${securePart}`;
}

export function customyAuthProxyHandlers(options?: CustomyAuthProxyOptions) {
    const handler = async (
        request: NextRequest,
        context: { params: Promise<{ path: string[] }> },
    ) => {
        const { path } = await context.params;
        if (options?.enforceTenantScope) return proxyAuthRequest(request, path, options);
        if (request.method === "GET" && path.join("/") === "sign-in/social") {
            const provider = request.nextUrl.searchParams.get("provider");
            if (!provider) return NextResponse.json({ error: "provider_required" }, { status: 400 });
            return startSocialAuth(request, provider, options);
        }
        return proxyAuthRequest(request, path, options);
    };

    return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}

export function customySocialRedirectHandlers(options?: CustomyAuthProxyOptions) {
    const GET = async (
        request: NextRequest,
        context: { params: Promise<{ provider: string }> },
    ) => {
        const { provider } = await context.params;
        return startSocialAuth(request, provider, options);
    };

    return { GET };
}

export function customySignOutHandlers(options?: CustomyAuthProxyOptions) {
    const POST = async (request: NextRequest) => {
        let upstream: Response;
        try {
            upstream = await fetch(`${resolveAccessProxyBaseUrl(request, options)}/api/auth/sign-out`, {
                method: "POST",
                headers: authForwardHeaders(request, options),
                redirect: "manual",
            });
        } catch {
            return proxyErrorResponse(502);
        }
        const response = new NextResponse(null, { status: upstream.ok ? 204 : upstream.status });
        appendScopedSetCookieHeaders(response.headers, upstream.headers, getPublicHost(request, options));
        const secure = getPublicProto(request, options) === "https";
        for (const name of collectAuthCookieNames(request.headers.get("cookie"))) {
            response.headers.append("set-cookie", expireCookie(name, secure));
        }
        applyNoStore(response.headers);
        return response;
    };

    return { POST };
}

function stateCookiePrefixes(request: NextRequest, options?: CustomyAuthProxyOptions) {
    const host = hostnameFromHost(getPublicHost(request, options));
    const appEnv = (process.env.APP_ENV || "").toLowerCase();
    const prefixes = new Set<string>();
    const stagingLike = appEnv === "staging"
        || appEnv === "local"
        || host.includes("staging")
        || host === "localhost"
        || host === "127.0.0.1"
        || host.endsWith(".chriscarvajal.com");

    if (stagingLike) {
        prefixes.add("customy-stg");
        prefixes.add("__Secure-customy-stg");
        prefixes.add("customy-dev");
        prefixes.add("__Secure-customy-dev");
    } else {
        prefixes.add("customy-prd");
        prefixes.add("__Secure-customy-prd");
    }

    return Array.from(prefixes);
}

function presentStateCookieNames(request: NextRequest) {
    return (request.headers.get("cookie") || "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const eqIndex = part.indexOf("=");
            return eqIndex > 0 ? part.slice(0, eqIndex) : part;
        })
        .filter((name) => name.endsWith(".state"));
}

export function customyClearOAuthStateHandlers() {
    const POST = async (request: NextRequest) => {
        const response = new NextResponse(null, { status: 204 });
        const cookieNames = new Set<string>(presentStateCookieNames(request));
        for (const prefix of stateCookiePrefixes(request)) {
            cookieNames.add(`${prefix}.state`);
        }

        for (const name of Array.from(cookieNames)) {
            response.headers.append(
                "set-cookie",
                `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
            );
        }
        applyNoStore(response.headers);
        return response;
    };

    return { POST };
}

function createLoginRedirect(request: NextRequest, loginUrl?: string, options?: CustomyMiddlewareOptions) {
    const loginTarget = loginUrl || "/login";
    const login = loginTarget.startsWith("http://") || loginTarget.startsWith("https://")
        ? new URL(loginTarget)
        : new URL(loginTarget, getPublicOrigin(request, options));
    const callbackTarget = `${request.nextUrl.pathname}${request.nextUrl.search || ""}` || "/";
    login.searchParams.set("callbackUrl", callbackTarget);
    return NextResponse.redirect(login);
}

// ─── 1. API Route Handler (Auth Callbacks) ───

export function handleCustomyAuth(options?: CustomyAuthOptions) {
    const handler = async (request: AuthCallbackRequest) => {
        const url = request.nextUrl;
        const searchParams = url.searchParams;
        const ticket = searchParams.get("ticket");

        if (ticket) {
            try {
                const accessUrl = options?.accessUrl || process.env.NEXT_PUBLIC_ACCESS_API_URL || "https://access.customy.ai";
                const exchangeUrl = `${accessUrl.replace(/\/$/, "")}/api/v1/impersonation/exchange?ticket=${ticket}`;
                
                const res = await fetch(exchangeUrl, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error("[CustomyAuth] Ticket exchange failed:", res.status, errorText);
                    return new NextResponse(`Ticket exchange failed: ${res.statusText}`, { status: res.status });
                }

                const data = await res.json() as { sessionToken?: string, expiresIn?: number };
                if (!data.sessionToken) return new NextResponse("Invalid ticket exchange response", { status: 500 });

                const { allPossibleNames } = getCookieNames(accessUrl);
                const redirectPath = options?.redirectTo || "/";
                const publicProto = getPublicProto(request);
                const response = NextResponse.redirect(new URL(redirectPath, getPublicOrigin(request)));

                // Isolate impersonation tickets to the receiving app origin so cross-app admin sessions are not reused accidentally.
                const ghostSessionDomain = undefined; 

                allPossibleNames.forEach(cookieName => {
                    response.cookies.set({
                        name: cookieName,
                        value: data.sessionToken!,
                        httpOnly: true,
                        secure: cookieName.startsWith("__Secure-") ? true : (publicProto === "https"),
                        sameSite: "lax",
                        path: "/",
                        domain: ghostSessionDomain, // Forces Edge Sandboxing
                        maxAge: data.expiresIn || 3600,
                    });
                });

                return response;
            } catch (err) {
                console.error("[CustomyAuth] Error during ticket exchange:", err);
                return new NextResponse("Internal Server Error", { status: 500 });
            }
        }

        return new NextResponse("Not Found or Missing required auth parameters", { status: 404 });
    };

    return { GET: handler, POST: handler };
}

// ─── 2. Middleware (Drop-In Next.js Protection) ───

/**
 * World-class middleware handler for automatic Customy authentication,
 * Tenancy header injection, and Next.js routing.
 */
export function customyMiddleware(options?: CustomyMiddlewareOptions) {
    return async function middleware(request: NextRequest) {
        const { pathname } = request.nextUrl;

        // Check ignored routes (e.g. static assets)
        const ignored = options?.ignoredRoutes || ["/_next", "/favicon.ico"];
        if (ignored.some(r => pathname.startsWith(r) || new RegExp(r).test(pathname))) {
            return NextResponse.next();
        }

        // Check public routes
        const publicRoutes = options?.publicRoutes || ["/login", "/api/customy/callback"];
        if (publicRoutes.some(r => pathname === r || pathname.startsWith(r) || new RegExp(r).test(pathname))) {
            return NextResponse.next();
        }

        // Backend API Header Injection
        if (pathname.startsWith("/api/")) {
            const requestHeaders = new Headers(request.headers);
            requestHeaders.set("x-forwarded-host", getPublicHost(request, options));
            requestHeaders.set("x-forwarded-proto", getPublicProto(request, options));
            applyProxyAccessHeaders(requestHeaders, request, options);
            
            return NextResponse.next({ request: { headers: requestHeaders } });
        }

        // Compute Cookie Names and Validation
        const accessUrl = resolveAccessProxyBaseUrl(request, options);
        const sessionCookie = resolveSessionCookieNameFromRequest(request, accessUrl);

        if (!sessionCookie) {
            return createLoginRedirect(request, options?.loginUrl, options);
        }

        if (options?.validateSession !== false) {
            try {
                const headers = new Headers({
                    cookie: `${sessionCookie.cookieName}=${sessionCookie.cookieValue}`,
                    "x-forwarded-host": getPublicHost(request, options),
                    "x-forwarded-proto": getPublicProto(request, options),
                    "x-customy-forwarded-host": getPublicHost(request, options),
                    "x-customy-forwarded-proto": getPublicProto(request, options),
                    "x-customy-public-origin": getPublicOrigin(request, options),
                });
                applyProxyAccessHeaders(headers, request, options);

                const res = await fetch(`${accessUrl.replace(/\/$/, "")}/api/auth/get-session`, {
                    method: "GET",
                    headers,
                    cache: "no-store",
                });
                const text = res.ok ? await res.text() : "null";
                let payload: { user?: unknown; session?: unknown } | null = null;
                try {
                    payload = text && text !== "null" ? JSON.parse(text) : null;
                } catch {
                    payload = null;
                }

                if (!res.ok || !payload?.user || !payload?.session) {
                    const response = createLoginRedirect(request, options?.loginUrl, options);
                    expireCandidateSessionCookies(response, accessUrl);
                    return response;
                }
            } catch {
                return createLoginRedirect(request, options?.loginUrl, options);
            }
        }

        return NextResponse.next();
    };
}

// ─── 3. Server-Side Session Fetcher (Next.js SSR) ───

/**
 * Robust SSR helper to securely read session inside React Server Components
 * @example
 * const { user, session } = await getServerSession();
 */
export async function getServerSession(options?: CustomyAuthOptions) {
    try {
        if (options?.requireExactEnvironment && (!options.environmentId || !options.publishableKey || !options.organizationSlug)) return null;
        const cookieStore = await cookies();
        const accessUrl = options?.accessUrl || process.env.NEXT_PUBLIC_ACCESS_API_URL || "https://access.customy.ai";
        const sessionCookie = resolveSessionCookieNameFromStore(cookieStore, accessUrl);
        const token = sessionCookie?.cookieValue || null;
        const activeCookieName = sessionCookie?.cookieName || "";
        
        if (!token) return null;

        // Validate directly securely via the Auth Central Service
        // Propagate the token as the session cookie so Access verifies its signature
        const res = await fetch(`${accessUrl.replace(/\/$/, "")}/api/auth/get-session`, {
            method: "GET",
            headers: {
                "Cookie": `${activeCookieName}=${token}`,
                "Content-Type": "application/json",
                ...(options?.environmentId ? { "x-environment-id": options.environmentId, "x-env-id": options.environmentId } : {}),
                ...(options?.publishableKey ? { "x-publishable-key": options.publishableKey } : {}),
                ...(options?.organizationSlug ? { "x-organization-id": options.organizationSlug } : {}),
            },
           signal: AbortSignal.timeout(8000),
           redirect: "error",
           cache: "no-store", // SSR requires live data
        });

        if (!res.ok) return null;

        const data = await res.json() as { user: any, session: any, act: any };
        if (!data?.user || !data?.session) return null;
        if (options?.requireExactEnvironment && !sessionMatchesFixedScope(data, options.environmentId!)) return null;
        return {
            user: data.user,
            session: data.session,
            actor: data.act || null,
            isImpersonated: !!data.act
        };
    } catch (error) {
        console.error("[Customy SSR] Error fetching server session:", error);
        return null;
    }
}

// ─── 4. Server Action Protection (Mutations) ───

/**
 * Drop-in protector for Next.js Server Actions.
 * Instantly throws an Error if the user session is missing or invalid, 
 * blocking unauthorized mutations gracefully.
 * 
 * @example
 * export async function saveProfile(data: FormData) {
 *     const { user } = await verifyActionSession();
 *     await db.update(user.id, data);
 * }
 */
export async function verifyActionSession(options?: CustomyAuthOptions) {
    const session = await getServerSession(options);
    if (!session || !session.user) {
        throw new Error("Unauthorized: Invalid Customy Access Session");
    }
    return session;
}
