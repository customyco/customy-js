/**
 * @customyai/customy-access/cookies — nombres de las cookies de sesión de
 * Customy Access.
 *
 * @deprecated Usa `@customyai/web`, que exporta estas mismas funciones y
 * constantes. Este módulo solo las reexporta.
 */
export {
    ACCESS_COOKIE_BASE,
    ACCESS_COOKIE_KINDS,
    ACCESS_PASSKEY_COOKIE,
    accessCookieBasePrefix,
    accessCookieEnvTag,
    accessCookieNames,
    accessCookiePrefix,
    isAccessSessionCookieName,
    isScopedAccessSessionCookieName,
    parseAccessCookieName,
    preferCurrentAccessCookies,
    type AccessCookieEnvTag,
    type AccessCookieKind,
    type ParsedAccessCookieName,
} from "@customyai/web";
