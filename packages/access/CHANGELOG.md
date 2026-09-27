# @customyai/access

## 0.1.1

### Patch Changes

- Scopes de Access para apps: `ACCESS_SCOPES` añade `users:read`, `catalog:read` y `flags:read` (antes solo `capabilities:read` y `users:contact:read`). `catalog.*` ya no necesita `admin:*`: con `catalog:read` una credencial de máquina (llave, token opaco o JWT de `machineTokens`) lee el catálogo comercial de su propio entorno —nunca el maestro global— y nada más. `customy apps validate` acepta esos tres scopes para `customy-access` en `customy.app.json`; `admin:*` y las escrituras siguen rechazados.

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/access` sobre `@customyai/core`: `me`, `capabilities.check`/`checkMany` (valores del plan de la app o entitlements del entorno), catálogo comercial, usuarios (`list`, `iterate`, `get`) y el contacto acotado de un usuario (`users.contact`, scope `users:contact:read`). `@customyai/access/flags`: flags con evaluación local, instantánea firmada, CDN, realtime, impresiones y conversiones. `@customyai/access/generated`: cualquier operación pública de Access por su `operationId`, con los parámetros de ruta tipados.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
