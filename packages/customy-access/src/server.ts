/**
 * @customyai/customy-access/server
 *
 * Verificación de tokens de máquina de Customy Access para cualquier servidor
 * (Request/Response estándar). La usan igual las apps y los productos, así que
 * una corrección de seguridad llega a todos a la vez.
 *
 * Un token de máquina es un JWT RS256 firmado por el issuer de Access, emitido
 * con `client_credentials` para UNA audiencia de producto. Se verifica con el
 * JWKS del issuer, sin llamar a Access por request. Un producto puede cambiarlo
 * (token exchange, RFC 8693) por otro para un segundo producto; ese token
 * delegado conserva el tenant de la app y nombra al producto en `act`.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

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
     * Presente solo en tokens delegados (RFC 8693): el producto que actúa en
     * nombre de la app. `clientId` y el tenant siguen siendo los de la app.
     */
    actor?: Readonly<{ clientId: string; service: string }>;
}>;

export type MachineTokenVerifierOptions = Readonly<{
    /** Issuer exacto de Access (https, sin barra final). */
    issuer: string;
    /** Audiencia de este producto, por ejemplo `customy-data`. */
    audience: string;
    /** Por defecto `${issuer}/oauth/jwks.json`. */
    jwksUri?: string;
    /** Resolución de claves inyectable (tests o JWKS local). */
    keys?: JWTVerifyGetKey;
    /** Tolerancia de reloj en segundos (por defecto 30). */
    clockToleranceSeconds?: number;
}>;

/** Vida máxima que emite Access para un token de máquina. */
const MAX_MACHINE_TOKEN_LIFETIME_SECONDS = 900;

function normalizeIssuer(issuer: string): string {
    const url = new URL(issuer);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new Error("CUSTOMY_ACCESS_ISSUER_INVALID");
    }
    return issuer.replace(/\/$/, "");
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

/** Valida los claims de un token de máquina ya verificado criptográficamente. */
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";

export function machinePrincipalFromClaims(payload: JWTPayload & Record<string, unknown>, audience: string): MachinePrincipal | null {
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
    const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [];
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
 * Crea un verificador para la audiencia de un producto. Devuelve el principal
 * o `null`; nunca lanza por un token inválido.
 */
export function createMachineTokenVerifier(options: MachineTokenVerifierOptions) {
    const issuer = normalizeIssuer(options.issuer);
    if (!nonEmptyString(options.audience)) throw new Error("CUSTOMY_MACHINE_TOKEN_AUDIENCE_REQUIRED");
    const keys = options.keys ?? createRemoteJWKSet(new URL(options.jwksUri ?? `${issuer}/oauth/jwks.json`));
    const clockTolerance = options.clockToleranceSeconds ?? 30;

    return async function verifyMachineToken(token: string): Promise<MachinePrincipal | null> {
        if (typeof token !== "string" || token.length < 20 || token.length > 16_384) return null;
        try {
            const { payload } = await jwtVerify(token, keys, {
                issuer,
                audience: options.audience,
                algorithms: ["RS256"],
                clockTolerance,
            });
            return machinePrincipalFromClaims(payload as JWTPayload & Record<string, unknown>, options.audience);
        } catch {
            return null;
        }
    };
}

/** Lee `Authorization: Bearer <token>` de una Request estándar. */
export function bearerToken(request: Request): string | null {
    const header = request.headers.get("authorization");
    const match = header ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header) : null;
    return match?.[1] ?? null;
}

/** Verifica el Bearer de una Request y exige los scopes indicados. */
export async function verifyMachineRequest(
    request: Request,
    verify: (token: string) => Promise<MachinePrincipal | null>,
    requiredScopes: readonly string[] = [],
): Promise<MachinePrincipal | null> {
    const token = bearerToken(request);
    if (!token) return null;
    const principal = await verify(token);
    if (!principal) return null;
    return requiredScopes.every((scope) => principal.scopes.includes(scope)) ? principal : null;
}
