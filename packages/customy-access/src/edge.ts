/**
 * @customyai/customy-access/edge
 *
 * @deprecated Usa `createEdgeClient` de `@customyai/web`: este módulo es su
 * adaptador (misma verificación con Web Crypto, JWKS cacheado y rotado) y
 * conserva `authUrl` opcional de 0.x.
 *
 * @example
 * ```ts
 * import { createEdgeClient } from "@customyai/customy-access/edge";
 *
 * const customy = createEdgeClient({
 *   publishableKey: "pk_live_...",
 *   authUrl: "https://access.customy.ai",
 * });
 *
 * // In middleware:
 * const { isValid, user } = await customy.verifySession(token);
 * ```
 */
import { createEdgeClient as webEdgeClient, type VerifyResult } from "@customyai/web";
import { warnDeprecated } from "./deprecation";

export type { VerifyResult } from "@customyai/web";

export interface CustomyEdgeConfig {
    /** Publishable key for your Customy Access project */
    publishableKey: string;
    /** Base URL of the Customy Access backend (default: http://localhost:4001) */
    authUrl?: string;
}

export const createEdgeClient = (config: CustomyEdgeConfig): {
    verifySession: (token: string) => Promise<VerifyResult>;
    decodeToken: (token: string) => Record<string, unknown> | null;
} => {
    warnDeprecated("@customyai/customy-access/edge", "use createEdgeClient from @customyai/web.");
    return webEdgeClient({ publishableKey: config.publishableKey, authUrl: config.authUrl || "http://localhost:4001" });
};

// Re-export config type
export type { CustomyEdgeConfig as EdgeConfig };
