import type { ProductClientOptions } from "@customyai/core";

export const ACCESS_DEFAULT_BASE_URL = "https://access-api.customy.ai";
export const ACCESS_AUDIENCE = "customy-access";

/**
 * Scopes de Access para una app: `capabilities:read` (plan y capabilities de
 * sus usuarios) y `users:contact:read` (el contacto de un usuario al enviarle;
 * se pide explícito, ningún comodín lo concede).
 */
export const ACCESS_SCOPES = ["capabilities:read", "users:contact:read"] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];

export type AccessOptions = ProductClientOptions & Readonly<{
    /** Entorno por defecto de las llamadas que lo necesitan. */
    environmentId?: string;
}>;
