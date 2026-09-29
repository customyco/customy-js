import type { ProductClientOptions } from "@customyai/core";

export const ACCESS_DEFAULT_BASE_URL = "https://access-api.customy.ai";
export const ACCESS_AUDIENCE = "customy-access";

/**
 * Scopes de Access que una app puede declarar en su manifiesto y pedir con
 * `machineTokens`, uno por función (el mínimo):
 *  - `capabilities:read` (por defecto): `me` y `capabilities.*`;
 *  - `users:contact:read`: `users.contact` (se pide explícito, ningún comodín lo concede);
 *  - `users:read`: `users.list` / `iterate` / `get`;
 *  - `catalog:read`: `catalog.*`, el catálogo del propio entorno (nunca el maestro global);
 *  - `flags:read`: la vista completa de flags en servidor;
 *  - `app-relationships:read`: `relationships.list` y `permissions.checkMany`;
 *  - `app-relationships:write`: `relationships.write`;
 *  - `app-plans:write`: `plans.set`.
 * Los tres últimos solo valen con el JWT de máquina (`machineTokens`) y solo
 * dentro del prefijo `<clave de la app>/` de sus tipos.
 */
export const ACCESS_SCOPES = [
    "capabilities:read", "users:contact:read", "users:read", "catalog:read", "flags:read",
    "app-relationships:read", "app-relationships:write", "app-plans:write",
] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];

export type AccessOptions = ProductClientOptions & Readonly<{
    /** Entorno por defecto de las llamadas que lo necesitan. */
    environmentId?: string;
}>;
