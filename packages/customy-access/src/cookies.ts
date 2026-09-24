/**
 * @customyai/customy-access/cookies
 *
 * Fuente única de los nombres de cookie de Customy Access. El servidor de
 * Access los emite y los adaptadores (proxy same-origin, middleware, BFF) los
 * leen con estas mismas funciones, así que un cambio de nombre ocurre aquí y
 * en ningún otro sitio.
 *
 * Formato: `[__Secure-]<base>-<stg|prd|dev>[-<env8>].<kind>`, donde `<env8>`
 * son los 8 primeros caracteres del id de entorno cuando la sesión pertenece a
 * una aplicación con entorno propio.
 *
 * Se ESCRIBE siempre con la base `customy`. Se LEE cualquier base con ese
 * formato, dando prioridad a `customy`: los despliegues son por servicio y no
 * atómicos, así que durante una migración una app puede recibir cookies que
 * emitió una versión anterior de Access. Leer una cookie no concede nada: la
 * sesión la valida siempre Access.
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
    /** Base del nombre; `customy` para las cookies que emite esta versión. */
    base: string;
    /** true cuando la base es la actual (`customy`). */
    current: boolean;
    envTag: AccessCookieEnvTag;
    /** Primeros 8 caracteres del id de entorno, o null para la cookie base. */
    environmentIdPrefix: string | null;
    kind: AccessCookieKind;
    prefix: string;
}>;

const ACCESS_COOKIE_NAME = /^(__Secure-)?(([a-z][a-z0-9]*(?:-[a-z0-9]+)*?)-(stg|prd|dev)(?:-([^.]+))?)\.(session_token|state|session_data|dont_remember)$/;

/** Descompone un nombre de cookie con formato de Access; null si no lo tiene. */
export function parseAccessCookieName(name: string): ParsedAccessCookieName | null {
    const match = ACCESS_COOKIE_NAME.exec(name);
    if (!match) return null;
    return {
        secure: match[1] === "__Secure-",
        prefix: match[2]!,
        base: match[3]!,
        current: match[3] === ACCESS_COOKIE_BASE,
        envTag: match[4] as AccessCookieEnvTag,
        environmentIdPrefix: match[5] ?? null,
        kind: match[6] as AccessCookieKind,
    };
}

/** true para cualquier cookie de sesión con formato de Access (base o de aplicación, segura o no). */
export function isAccessSessionCookieName(name: string): boolean {
    return parseAccessCookieName(name)?.kind === "session_token";
}

/**
 * true para la cookie de sesión de una aplicación con entorno propio; con
 * `environmentIdPrefix`, solo la de ese entorno (se comparan 8 caracteres).
 */
export function isScopedAccessSessionCookieName(name: string, environmentIdPrefix?: string | null): boolean {
    const parsed = parseAccessCookieName(name);
    if (!parsed || parsed.kind !== "session_token" || parsed.environmentIdPrefix === null) return false;
    return !environmentIdPrefix || parsed.environmentIdPrefix === environmentIdPrefix.substring(0, 8);
}

/** Ordena nombres de cookie de sesión poniendo primero los de la base actual. */
export function preferCurrentAccessCookies(names: readonly string[]): string[] {
    const current = names.filter((name) => parseAccessCookieName(name)?.current === true);
    return [...current, ...names.filter((name) => !current.includes(name))];
}
