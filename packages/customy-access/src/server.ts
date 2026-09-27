/**
 * @customyai/customy-access/server
 *
 * @deprecated Usa `@customyai/server` (verificación de tokens de Access en tu
 * servidor) y `@customyai/core` (`createMachineTokenProvider`,
 * `discoverPlatform`). Este módulo es su adaptador: la verificación, el
 * proveedor de tokens y el discovery son los de esos paquetes; aquí se
 * conservan las firmas de 0.x y sus mensajes de error (`CUSTOMY_*`).
 *
 * Un token de máquina es un JWT RS256 firmado por el issuer de Access, emitido
 * con `client_credentials` para UNA audiencia de producto. Se verifica con el
 * JWKS del issuer, sin llamar a Access por request.
 */
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import { createMachineTokenProvider as coreMachineTokenProvider, discoverPlatform as coreDiscoverPlatform } from "@customyai/core";
import {
    bearerToken as serverBearerToken,
    createMachineTokenVerifier as serverMachineTokenVerifier,
    machinePrincipalFromClaims as serverMachinePrincipalFromClaims,
    verifyMachineRequest as serverVerifyMachineRequest,
} from "@customyai/server";
import { warnDeprecated } from "./deprecation";
import { legacyPlatformError } from "./legacy-errors";

const MODULE = "@customyai/customy-access/server";

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

function legacy<T>(operation: () => T): T {
    try {
        return operation();
    } catch (error) {
        throw legacyPlatformError(error);
    }
}

/** Valida los claims de un token de máquina ya verificado criptográficamente. */
export function machinePrincipalFromClaims(payload: JWTPayload & Record<string, unknown>, audience: string): MachinePrincipal | null {
    return serverMachinePrincipalFromClaims(payload, audience);
}

/**
 * Crea un verificador para la audiencia de un producto. Devuelve el principal
 * o `null`; nunca lanza por un token inválido.
 */
export function createMachineTokenVerifier(options: MachineTokenVerifierOptions): (token: string) => Promise<MachinePrincipal | null> {
    warnDeprecated(MODULE, "use createMachineTokenVerifier from @customyai/server.");
    return legacy(() => serverMachineTokenVerifier(options));
}

/** Lee `Authorization: Bearer <token>` de una Request estándar. */
export function bearerToken(request: Request): string | null {
    return serverBearerToken(request);
}

/** Verifica el Bearer de una Request y exige los scopes indicados. */
export async function verifyMachineRequest(
    request: Request,
    verify: (token: string) => Promise<MachinePrincipal | null>,
    requiredScopes: readonly string[] = [],
): Promise<MachinePrincipal | null> {
    return serverVerifyMachineRequest(request, verify, requiredScopes);
}

/**
 * Configuración de la plataforma para un entorno (`/.well-known/customy-configuration`):
 * el issuer, su token endpoint y, por producto, su URL y su audiencia.
 */
export type CustomyPlatformConfiguration = Readonly<{
    issuer: string;
    tokenEndpoint: string;
    products: Readonly<Record<string, Readonly<{ baseUrl: string; audience: string }>>>;
}>;

/** Lee el discovery del issuer (https). */
export async function discoverPlatform(issuer: string, fetchImpl: typeof fetch = fetch): Promise<CustomyPlatformConfiguration> {
    warnDeprecated(MODULE, "use discoverPlatform from @customyai/core.");
    try {
        const { issuer: base, tokenEndpoint, products } = await coreDiscoverPlatform(issuer, fetchImpl);
        return { issuer: base, tokenEndpoint, products };
    } catch (error) {
        throw legacyPlatformError(error);
    }
}

export type MachineTokenProviderOptions = Readonly<{
    issuer: string;
    clientId: string;
    clientSecret: string;
    /** Audiencia del producto, p. ej. `customy-send`. */
    audience: string;
    scopes?: readonly string[];
    /** Por defecto `${issuer}/oauth/token`. */
    tokenEndpoint?: string;
    fetch?: typeof fetch;
    /** Segundos antes de caducar en que se renueva (60 por defecto). */
    refreshSkewSeconds?: number;
    now?: () => number;
}>;

/** Devuelve un token de máquina vigente para una audiencia. */
export type MachineTokenProvider = () => Promise<string>;

/**
 * Proveedor de tokens de máquina para llamar a un producto con la identidad
 * de la app: cachea el token hasta poco antes de su caducidad y agrupa las
 * peticiones concurrentes. Solo para servidor: usa el secreto.
 */
export function createMachineTokenProvider(options: MachineTokenProviderOptions): MachineTokenProvider {
    warnDeprecated(MODULE, "use createMachineTokenProvider from @customyai/core (or createCustomy from @customyai/sdk).");
    const provider = legacy(() => coreMachineTokenProvider(options));
    return async function machineToken(): Promise<string> {
        try {
            return await provider();
        } catch (error) {
            throw legacyPlatformError(error);
        }
    };
}
