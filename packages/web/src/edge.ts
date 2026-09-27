/**
 * Verificación local del JWT de sesión de Access (sin llamar a Access en cada
 * petición), apta para runtimes edge: solo Web Crypto y `fetch`. El JWKS se
 * cachea y rota con el de `@customyai/server`.
 */
import { createRemoteJwks, type RemoteJwksOptions } from "@customyai/server";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { accessBaseUrl } from "./origin";

export interface CustomyEdgeConfig {
    /** Clave publicable del entorno. */
    publishableKey: string;
    /** URL de la API de Access (https). */
    authUrl: string;
    /** Issuer de los JWT de sesión (por defecto `customy`). */
    issuer?: string;
    /** Opciones del JWKS remoto (fetch, caché, cooldown). */
    jwks?: RemoteJwksOptions;
    /** Resolución de claves inyectable (tests o JWKS compartido). */
    keys?: JWTVerifyGetKey;
    /** Tolerancia de reloj en segundos (por defecto 30). */
    clockToleranceSeconds?: number;
}

export interface VerifyResult {
    isValid: boolean;
    user: Record<string, unknown> | null;
    error?: unknown;
}

const MAX_TOKEN_LENGTH = 16_384;

function decodeSegment(segment: string): Record<string, unknown> | null {
    try {
        const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
        const binary = atob(b64);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

export function createEdgeClient(config: CustomyEdgeConfig) {
    const base = accessBaseUrl(config.authUrl);
    let keys = config.keys ?? null;
    const resolveKeys = (): JWTVerifyGetKey => (keys ??= createRemoteJwks(`${base}/api/auth/jwks`, config.jwks));

    return {
        /** Verifica un JWT de sesión con el JWKS de Access (sin base de datos). */
        verifySession: async (token: string): Promise<VerifyResult> => {
            if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH || token.split(".").length !== 3) {
                return { isValid: false, user: null, error: new Error("malformed token") };
            }
            try {
                const { payload } = await jwtVerify(token, resolveKeys(), {
                    issuer: config.issuer ?? "customy",
                    clockTolerance: config.clockToleranceSeconds ?? 30,
                });
                return { isValid: true, user: payload as Record<string, unknown> };
            } catch (error) {
                return { isValid: false, user: null, error };
            }
        },

        /** Claims de un JWT SIN verificar: solo para mostrar, nunca para autorizar. */
        decodeToken: (token: string): Record<string, unknown> | null => {
            const payload = typeof token === "string" ? token.split(".")[1] : undefined;
            return payload ? decodeSegment(payload) : null;
        },
    };
}

export type EdgeClient = ReturnType<typeof createEdgeClient>;
export type { CustomyEdgeConfig as EdgeConfig };
