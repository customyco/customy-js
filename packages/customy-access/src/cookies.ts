/**
 * @customyai/customy-access/cookies
 *
 * Fuente única de los nombres de cookie de Customy Access. El servidor de
 * Access los emite y los adaptadores (proxy same-origin, middleware, BFF) los
 * leen con estas mismas funciones, así que un cambio de nombre ocurre aquí y
 * en ningún otro sitio.
 *
 * Formato: `[__Secure-]customy-<stg|prd|dev>[-<env8>].<kind>`, donde `<env8>`
 * son los 8 primeros caracteres del id de entorno cuando la sesión pertenece a
 * una aplicación con entorno propio.
 */

export const ACCESS_COOKIE_BASE = "customy";

export type AccessCookieEnvTag = "stg" | "prd" | "dev";

export type AccessCookieKind = "session_token" | "state" | "session_data" | "dont_remember";

export const ACCESS_COOKIE_KINDS: readonly AccessCookieKind[] = ["session_token", "state", "session_data", "dont_remember"];

/** Nombre de la cookie del desafío WebAuthn (se antepone el prefijo). */
export const ACCESS_PASSKEY_COOKIE = "customy-passkey";

/** `staging` → `stg`, `production` → `prd`; cualquier otro valor → `dev`. */
export function accessCookieEnvTag(appEnv: string | undefined): AccessCookieEnvTag {
    if (appEnv === "staging") return "stg";
    if (appEnv === "production") return "prd";
    return "dev";
}

/** Prefijo base del entorno de ejecución: `customy-stg`, `customy-prd` o `customy-dev`. */
export function accessCookieBasePrefix(appEnv: string | undefined): string {
    return `${ACCESS_COOKIE_BASE}-${accessCookieEnvTag(appEnv)}`;
}

/** Prefijo de la sesión, acotado a la aplicación cuando hay id de entorno. */
export function accessCookiePrefix(appEnv: string | undefined, environmentId?: string | null): string {
    const base = accessCookieBasePrefix(appEnv);
    return environmentId ? `${base}-${environmentId.substring(0, 8)}` : base;
}

/** Nombres de cookie (seguro y no seguro) de un prefijo y un tipo. */
export function accessCookieNames(prefix: string, kind: AccessCookieKind = "session_token"): [secure: string, plain: string] {
    return [`__Secure-${prefix}.${kind}`, `${prefix}.${kind}`];
}

export type ParsedAccessCookieName = Readonly<{
    secure: boolean;
    envTag: AccessCookieEnvTag;
    /** Primeros 8 caracteres del id de entorno, o null para la cookie base. */
    environmentIdPrefix: string | null;
    kind: AccessCookieKind;
    prefix: string;
}>;

const ACCESS_COOKIE_NAME = /^(__Secure-)?(customy-(stg|prd|dev)(?:-([^.]+))?)\.(session_token|state|session_data|dont_remember)$/;

/** Descompone un nombre de cookie de Access; null si no lo es. */
export function parseAccessCookieName(name: string): ParsedAccessCookieName | null {
    const match = ACCESS_COOKIE_NAME.exec(name);
    if (!match) return null;
    return {
        secure: match[1] === "__Secure-",
        prefix: match[2]!,
        envTag: match[3] as AccessCookieEnvTag,
        environmentIdPrefix: match[4] ?? null,
        kind: match[5] as AccessCookieKind,
    };
}

/** true para cualquier cookie de sesión de Access (base o de aplicación, segura o no). */
export function isAccessSessionCookieName(name: string): boolean {
    return parseAccessCookieName(name)?.kind === "session_token";
}
