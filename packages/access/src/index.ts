/**
 * @customyai/access — Customy Access para el servidor de una app, sobre
 * `@customyai/core`: capabilities de sus usuarios, catálogo comercial, usuarios
 * y el contacto acotado de uno.
 *
 * ```ts
 * import { createMachineTokens, discoverPlatform } from "@customyai/core";
 * import { createAccess } from "@customyai/access";
 *
 * const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
 * const machineTokens = createMachineTokens({ issuer: platform.issuer, clientId, clientSecret, platform });
 * const access = createAccess({ platform, machineTokens });
 * const { allowed } = await access.capabilities.check("reports.export", { userId });
 * ```
 *
 * Subrutas: `@customyai/access/flags` (flags con evaluación local) y
 * `@customyai/access/generated` (cualquier operación pública por su `operationId`).
 */
export { capabilityFromSnapshot, createAccess, type CustomyAccess } from "./facade";
export { CustomyAccessError, toAccessError } from "./errors";
export { ACCESS_AUDIENCE, ACCESS_DEFAULT_BASE_URL, ACCESS_SCOPES, type AccessOptions, type AccessScope } from "./options";
export type * from "./types";
