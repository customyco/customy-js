/**
 * Verificación local de los tokens de Customy Access (JWT RS256 del issuer,
 * JWKS en caché). Los verificadores devuelven el principal o `null`; nunca
 * lanzan por un token inválido. Solo lanzan por una configuración inválida.
 */
import { CustomySdkError, normalizeIssuer } from "@customyai/core";
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { createRemoteJwks, type RemoteJwksOptions } from "./jwks";

type Claims = JWTPayload & Record<string, unknown>;

export type MachinePrincipal = Readonly<{
    /** Id del API key (cliente) que obtuvo el token. */
    clientId: string;
    organizationId: string;
    projectId: string;
    /** Aplicación de Access dueña del entorno (la identidad de la app). */
    applicationId: string;
    environmentId: string;
    audience: string;
    scopes: readonly string[];
    tokenId: string;
    expiresAt: number;
    /**
     * Solo en tokens delegados (RFC 8693): el producto que actúa en nombre de
     * la app. `clientId` y el tenant siguen siendo los de la app.
     */
    actor?: Readonly<{ clientId: string; service: string }>;
}>;

export type UserPrincipal = Readonly<{
    issuer: string;
    subject: string;
    organizationId: string;
    environmentId: string;
    audience: string;
    scopes: readonly string[];
    expiresAt: number;
}>;

export type KeySource = Readonly<{
    /** Por defecto `${issuer}/oauth/jwks.json`. */
    jwksUri?: string;
    /** Resolución de claves inyectable (tests, JWKS local o uno compartido). */
    keys?: JWTVerifyGetKey;
    /** Opciones del JWKS remoto (fetch, caché, cooldown). */
    jwks?: RemoteJwksOptions;
    /** Tolerancia de reloj en segundos (por defecto 30). */
    clockToleranceSeconds?: number;
    /** Reloj inyectable (ms). */
    now?: () => number;
}>;

export type MachineTokenVerifierOptions = KeySource & Readonly<{
    /** Issuer exacto de Access (https, sin barra final). */
    issuer: string;
    /** Audiencia de este producto, p. ej. `customy-data`. */
    audience: string;
}>;

export type AccessTokenVerifierOptions = KeySource & Readonly<{
    issuer: string;
    /** Audiencia esperada: el `client_id` de la aplicación que recibe el token. */
    audience: string;
    /** Si se indican, el token debe ser de esa organización y ese entorno. */
    organizationId?: string;
    environmentId?: string;
    /** Scopes que debe llevar el token (p. ej. `openid`). */
    requiredScopes?: readonly string[];
    /** Vida máxima aceptada (por defecto 2 h). */
    maxLifetimeSeconds?: number;
    /**
     * Introspección en vivo (revocación inmediata) tras la verificación local.
     * Solo para operaciones sensibles: añade una llamada al issuer por petición.
     */
    introspection?: Readonly<{ endpoint?: string; fetch?: typeof fetch; timeoutMs?: number }>;
}>;

export type TokenVerifier<P> = (token: string) => Promise<P | null>;

/** Vida máxima que emite Access para un token de máquina. */
export const MAX_MACHINE_TOKEN_LIFETIME_SECONDS = 900;
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const MAX_TOKEN_LENGTH = 16_384;

function nonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function scopesOf(payload: Claims): string[] {
    return typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [];
}

function resolveKeys(issuer: string, options: KeySource): JWTVerifyGetKey {
    return options.keys ?? createRemoteJwks(options.jwksUri ?? `${issuer}/oauth/jwks.json`, { now: options.now, ...options.jwks });
}

function plausibleJwt(token: unknown): token is string {
    return typeof token === "string" && token.length >= 20 && token.length <= MAX_TOKEN_LENGTH && token.split(".").length === 3;
}

async function verifyJwt(token: string, keys: JWTVerifyGetKey, issuer: string, audience: string, options: KeySource): Promise<Claims | null> {
    try {
        const { payload } = await jwtVerify(token, keys, {
            issuer,
            audience,
            algorithms: ["RS256"],
            clockTolerance: options.clockToleranceSeconds ?? 30,
            ...(options.now ? { currentDate: new Date(options.now()) } : {}),
        });
        return payload as Claims;
    } catch {
        return null;
    }
}

/** Valida los claims de un token de máquina ya verificado criptográficamente. */
export function machinePrincipalFromClaims(payload: Claims, audience: string): MachinePrincipal | null {
    if (payload.typ !== "access_token" || payload.token_use !== "machine") return null;
    let actor: MachinePrincipal["actor"];
    if (payload.gty === TOKEN_EXCHANGE_GRANT) {
        const act = payload.act as Record<string, unknown> | undefined;
        if (!act || typeof act !== "object" || !nonEmptyString(act.client_id) || act.sub !== `machine:${act.client_id}`
            || !nonEmptyString(act.service) || "act" in act) return null;
        actor = { clientId: act.client_id, service: act.service };
    } else if (payload.gty !== "client_credentials" || payload.act !== undefined) {
        return null;
    }
    if (payload.aud !== audience) return null;
    if (!nonEmptyString(payload.sub) || !payload.sub.startsWith("machine:")) return null;
    if (!nonEmptyString(payload.client_id) || payload.sub !== `machine:${payload.client_id}`) return null;
    if (!nonEmptyString(payload.org_id) || !nonEmptyString(payload.project_id) || !nonEmptyString(payload.application_id)
        || !nonEmptyString(payload.environment_id) || !nonEmptyString(payload.jti)) return null;
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp - payload.iat > MAX_MACHINE_TOKEN_LIFETIME_SECONDS) return null;
    const scopes = scopesOf(payload);
    if (scopes.length === 0) return null;
    return {
        clientId: payload.client_id,
        organizationId: payload.org_id,
        projectId: payload.project_id,
        applicationId: payload.application_id,
        environmentId: payload.environment_id,
        audience,
        scopes,
        tokenId: payload.jti,
        expiresAt: payload.exp,
        ...(actor ? { actor } : {}),
    };
}

/**
 * Verificador de tokens de máquina (`client_credentials` o token exchange)
 * para la audiencia de un producto.
 */
export function createMachineTokenVerifier(options: MachineTokenVerifierOptions): TokenVerifier<MachinePrincipal> {
    const issuer = normalizeIssuer(options.issuer);
    if (!nonEmptyString(options.audience)) throw new CustomySdkError({ code: "SDK_MACHINE_TOKEN_AUDIENCE_REQUIRED", message: "audience is required" });
    const keys = resolveKeys(issuer, options);
    return async function verifyMachineToken(token) {
        if (!plausibleJwt(token)) return null;
        const payload = await verifyJwt(token, keys, issuer, options.audience, options);
        return payload ? machinePrincipalFromClaims(payload, options.audience) : null;
    };
}

/**
 * Verificador de tokens de acceso de usuario emitidos por Access para una
 * aplicación (OIDC). Comprueba firma, issuer, audiencia, vida, tenant y
 * scopes; con `introspection`, además, que el token siga activo.
 */
export function createAccessTokenVerifier(options: AccessTokenVerifierOptions): TokenVerifier<UserPrincipal> {
    const issuer = normalizeIssuer(options.issuer);
    if (!nonEmptyString(options.audience)) throw new CustomySdkError({ code: "SDK_ACCESS_TOKEN_AUDIENCE_REQUIRED", message: "audience is required" });
    const keys = resolveKeys(issuer, options);
    const maxLifetime = options.maxLifetimeSeconds ?? 7_200;
    const required = options.requiredScopes ?? [];
    const introspectionEndpoint = options.introspection ? options.introspection.endpoint ?? `${issuer}/oauth/introspect` : null;
    if (introspectionEndpoint) {
        const endpoint = new URL(introspectionEndpoint);
        if (endpoint.protocol !== "https:" || endpoint.origin !== new URL(issuer).origin) {
            throw new CustomySdkError({ code: "SDK_INTROSPECTION_ENDPOINT_INVALID", message: "introspection endpoint must be on the issuer origin" });
        }
    }

    async function stillActive(token: string, principal: UserPrincipal): Promise<boolean> {
        const fetchImpl = options.introspection?.fetch ?? globalThis.fetch.bind(globalThis);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.introspection?.timeoutMs ?? 3_000);
        try {
            const response = await fetchImpl(introspectionEndpoint!, {
                method: "POST",
                headers: { "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({ token }),
                redirect: "error",
                signal: controller.signal,
            });
            if (!response.ok) return false;
            const body = await response.json() as Record<string, unknown>;
            return body.active === true && body.sub === principal.subject && body.exp === principal.expiresAt
                && body.org_id === principal.organizationId && body.environment_id === principal.environmentId;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    return async function verifyAccessToken(token) {
        if (!plausibleJwt(token)) return null;
        const payload = await verifyJwt(token, keys, issuer, options.audience, options);
        if (!payload) return null;
        if (payload.typ !== "access_token" || payload.token_use === "machine") return null;
        if (payload.aud !== options.audience) return null;
        if (!nonEmptyString(payload.sub) || payload.sub.startsWith("machine:") || payload.sub.trim() !== payload.sub) return null;
        if (!nonEmptyString(payload.org_id) || !nonEmptyString(payload.environment_id)) return null;
        if (options.organizationId !== undefined && payload.org_id !== options.organizationId) return null;
        if (options.environmentId !== undefined && payload.environment_id !== options.environmentId) return null;
        if (typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp - payload.iat > maxLifetime) return null;
        const scopes = scopesOf(payload);
        if (!required.every((scope) => scopes.includes(scope))) return null;
        const principal: UserPrincipal = {
            issuer,
            subject: payload.sub,
            organizationId: payload.org_id,
            environmentId: payload.environment_id,
            audience: options.audience,
            scopes,
            expiresAt: payload.exp,
        };
        if (introspectionEndpoint && !(await stillActive(token, principal))) return null;
        return principal;
    };
}
