/**
 * @customyai/web — handlers de sesión same-origin de Customy sobre
 * `Request`/`Response` estándar: proxy de `/api/auth/*`, login social,
 * sign-out, callback de impersonación, sesión en el servidor, protección de
 * rutas, nombres de cookie y verificación local del JWT de sesión. Funciona en
 * node y edge; nunca entra en un bundle de navegador.
 */
export {
    ACCESS_COOKIE_BASE,
    ACCESS_COOKIE_KINDS,
    ACCESS_PASSKEY_COOKIE,
    accessCookieBasePrefix,
    accessCookieEnvTag,
    accessCookieNames,
    accessCookiePrefix,
    expireCookie,
    getSetCookieHeaders,
    isAccessSessionCookieName,
    isScopedAccessSessionCookieName,
    parseAccessCookieName,
    parseCookieHeader,
    preferCurrentAccessCookies,
    scopeSetCookieToHost,
    serializeCookie,
    splitSetCookieHeader,
    type AccessCookieEnvTag,
    type AccessCookieKind,
    type CookieOptions,
    type ParsedAccessCookieName,
} from "./cookies";
export { fixedAuthScopeConfigured, matchesFixedAuthScope, sessionMatchesFixedScope, type FixedAuthScope } from "./auth-scope";
export {
    getPublicHost,
    getPublicOrigin,
    getPublicProto,
    LEGACY_ORGANIZATION_HEADER,
    ORGANIZATION_SLUG_HEADER,
    organizationSlugFromHeaders,
    type CustomyOriginOptions,
    type CustomyScopeOptions,
    type RequestLike,
} from "./origin";
export {
    authPathFromUrl,
    callbackPathAllowed,
    candidateSessionCookieNames,
    crossSiteRequestRejected,
    customyErrorEnvelope,
    customyAuthProxyHandlers,
    customyClearOAuthStateHandlers,
    customySignOutHandlers,
    customySocialRedirectHandlers,
    handleCustomyAuth,
    resolveCallbackUrl,
    safeCallbackUrl,
    type CustomyAuthCallbackOptions,
    type CustomyAuthProxyOptions,
    type RouteContext,
} from "./proxy";
export {
    applySessionCookies,
    customyMiddleware,
    getServerSession,
    resolveSessionCookie,
    verifyActionSession,
    type CookieSource,
    type CookieStoreLike,
    type HeadersLike,
    type SessionCookieSource,
    type CustomyAuthOptions,
    type CustomyMiddlewareOptions,
    type CustomyMiddlewareResult,
    type CustomyServerSession,
} from "./session";
export { createEdgeClient, type CustomyEdgeConfig, type EdgeClient, type EdgeConfig, type VerifyResult } from "./edge";
