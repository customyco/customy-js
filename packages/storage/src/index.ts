/**
 * @customyai/storage — Customy Storage para el servidor de una app conectada:
 * subir bytes, leer metadatos, URLs firmadas de descarga y papelera, sobre
 * `@customyai/core`.
 *
 * ```ts
 * import { createMachineTokens, discoverPlatform } from "@customyai/core";
 * import { createStorage } from "@customyai/storage";
 *
 * const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
 * const machineTokens = createMachineTokens({ issuer: platform.issuer, clientId, clientSecret, platform });
 * const storage = createStorage({ platform, machineTokens, scopes: ["storage:files:read", "storage:files:write"] });
 * const file = await storage.files.upload({ data, fileName: "recibo.jpg", mimeType: "image/jpeg" });
 * ```
 *
 * Solo servidor: la credencial es secreta. Cada app ve solo los archivos que
 * ella subió. Los errores son `CustomyStorageError` (un `CustomySdkError` con
 * `service: "storage"` y `retryable`).
 */
export {
  createStorage,
  sha256Hex,
  STORAGE_AUDIENCE,
  STORAGE_DEFAULT_BASE_URL,
  STORAGE_MAX_UPLOAD_BYTES,
  STORAGE_SCOPES,
  type CustomyStorage,
  type StorageOptions,
  type StorageScope,
} from "./client";
export { CustomyStorageError, toStorageError, type CustomyStorageErrorOptions } from "./errors";
export type * from "./types";
