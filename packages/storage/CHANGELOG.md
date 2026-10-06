# @customyai/storage

## 0.1.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.3.0

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/storage` sobre `@customyai/core`, para el servidor de una app conectada: `files.upload` (bytes en memoria ≤ 25 MiB; calcula el SHA-256, sube las partes firmadas con reintento por parte y completa; clave de idempotencia para repetir sin duplicar; `folder` para subcarpetas dentro de la carpeta de la app), `files.get`, `files.downloadUrl` (423 `FILE_SCAN_PENDING` reintentable mientras pasa el antivirus), `files.download` y `files.trash`, con `CustomyStorageError` (`retryable`) y la identidad de la app en Customy Access (`storage:files:read`, `storage:files:write`, `storage:files:delete`; audiencia `customy-storage`).

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0
