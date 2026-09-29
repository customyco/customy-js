# @customyai/storage

Customy Storage para el servidor de una app conectada: subir archivos que ya tienes en memoria, leer sus metadatos, obtener URLs firmadas de descarga y mandarlos a la papelera. Sobre [`@customyai/core`](../core): reintentos con `Retry-After`, idempotencia, errores tipados y la identidad de la app en Customy Access.

```bash
npm install @customyai/storage @customyai/core
```

```ts
import { createMachineTokens, discoverPlatform } from "@customyai/core";
import { createStorage, CustomyStorageError } from "@customyai/storage";

const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
const machineTokens = createMachineTokens({ issuer: platform.issuer, clientId: process.env.CUSTOMY_STORAGE_CLIENT_ID!, clientSecret: process.env.CUSTOMY_STORAGE_CLIENT_SECRET!, platform });
const storage = createStorage({ platform, machineTokens, scopes: ["storage:files:read", "storage:files:write", "storage:files:delete"] });

const file = await storage.files.upload(
  { data: bytes, fileName: "recibo.jpg", mimeType: "image/jpeg", metadata: { expenseId: "exp_1" }, folder: "recibos/2026" },
  { idempotencyKey: `receipt-${expenseId}` },
);

try {
  const { url } = await storage.files.downloadUrl(file.id, { inline: true, expiresIn: 300 });
} catch (error) {
  if (error instanceof CustomyStorageError && error.code === "FILE_SCAN_PENDING") {
    // Recién subido: el antivirus aún no terminó (423, `retryable: true`). Reintenta en unos segundos.
  }
}

const { data, mimeType, name } = await storage.files.download(file.id);
await storage.files.trash(file.id);
```

- **Credencial**: `machineTokens` (+ `platform`) pide tokens con audiencia `customy-storage` y los scopes que indiques (`STORAGE_SCOPES`); también acepta `accessToken` (un token de Access ya emitido o un proveedor). Solo servidor.
- **Scopes**: `storage:files:read` (ver y descargar), `storage:files:write` (subir) y `storage:files:delete` (papelera). Sin el scope de una operación, 403 `STORAGE_SCOPE_REQUIRED`.
- **Aislamiento**: cada app ve solo los archivos que ella subió; los de otra app o del Workspace no existen para ella (404 `STORAGE_ITEM_NOT_FOUND`). Lo que sube queda privado a la app, dentro de su propia carpeta (`folder` crea subcarpetas).
- **Subida**: `files.upload` acepta hasta 25 MiB (`STORAGE_MAX_UPLOAD_BYTES`). Calcula el SHA-256, pide las partes firmadas, las sube directo al almacén (reintenta cada parte ante red, `408`, `429` y `5xx`) y completa. Si Storage ya tiene esos bytes no sube nada. La misma `idempotencyKey` (por defecto una nueva por llamada) devuelve el mismo archivo al repetir. Si ya hay un archivo con ese nombre en la carpeta, Storage le añade un sufijo: guarda el `id`, no el nombre.
- **Antivirus**: un archivo recién subido está `scanStatus: "pending"`; hasta que queda `clean`, `downloadUrl` y `download` fallan con 423 `FILE_SCAN_PENDING` (`retryable: true`). `FILE_SCAN_FAILED` y `FILE_QUARANTINED` no se arreglan reintentando.
- **Errores**: `CustomyStorageError` (un `CustomySdkError` con `service: "storage"` y `retryable`); `code` es el de la API o uno del SDK (`SDK_*`, `FILE_TOO_LARGE`, `UPLOAD_PART_FAILED`, `DOWNLOAD_FAILED`).
- **`checksumSha256`**: lo devuelve `upload`; `get` no lo conoce y da `null`.

## Credencial de la app

Una clave M2M de Customy Access con audiencia `customy-storage` y los scopes que necesita la app; si es la de una app conectada, emitida como llave de integración (`machineIdentityType: "integration"`, `machineIdentityId: <id de la aplicación conectada>`) para que sus archivos queden separados de los de otras apps del mismo entorno aunque la llave rote.

```http
POST {access}/api/admin/env/{environmentId}/api-keys
{ "name": "mi-app-storage", "scopes": ["storage:files:read", "storage:files:write", "storage:files:delete"],
  "allowedAudiences": ["customy-storage"], "machineIdentityType": "integration",
  "machineIdentityId": "<applicationId>", "ownerService": "mi-app", "expiresInDays": 90 }
```

La respuesta trae `id` (el `clientId`) y `rawKey` (el `clientSecret`, una sola vez).
