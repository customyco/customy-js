/**
 * @customyai/customy-access/edge
 *
 * Edge-runtime compatible utilities for Customy Access.
 * Designed for Vercel Edge, Cloudflare Workers, Deno Deploy, etc.
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

import { jwtVerify, createRemoteJWKSet } from "jose";

// ─── Types ──────────────────────────────────────────────────────

export interface CustomyEdgeConfig {
    /** Publishable key for your Customy Access project */
    publishableKey: string;
    /** Base URL of the Customy Access backend (default: http://localhost:4001) */
    authUrl?: string;
}

export interface VerifyResult {
    isValid: boolean;
    user: Record<string, unknown> | null;
    error?: unknown;
}

// ─── Edge Client ────────────────────────────────────────────────

export const createEdgeClient = (config: CustomyEdgeConfig) => {
    const jwksUrl = new URL("/api/auth/jwks", config.authUrl || "http://localhost:4001");
    const JWKS = createRemoteJWKSet(jwksUrl);

    return {
        /**
         * Verify a session JWT using asymmetric cryptography (no DB call).
         * Safe for edge runtimes — only uses Web Crypto API.
         */
        verifySession: async (token: string): Promise<VerifyResult> => {
            try {
                const { payload } = await jwtVerify(token, JWKS, { issuer: "customy" });
                return { isValid: true, user: payload as Record<string, unknown> };
            } catch (err) {
                return { isValid: false, user: null, error: err };
            }
        },

        /**
         * Extract user claims from a JWT without verification.
         * Useful for client-side display — NOT for authorization decisions.
         */
        decodeToken: (token: string): Record<string, unknown> | null => {
            try {
                const [, payloadB64] = token.split(".");
                const payload = JSON.parse(atob(payloadB64));
                return payload;
            } catch {
                return null;
            }
        },
    };
};

// Re-export config type
export type { CustomyEdgeConfig as EdgeConfig };
