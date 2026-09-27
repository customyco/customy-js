# @customyai/cli

## 0.1.1

### Patch Changes

- Scopes de Access para apps: `ACCESS_SCOPES` añade `users:read`, `catalog:read` y `flags:read` (antes solo `capabilities:read` y `users:contact:read`). `catalog.*` ya no necesita `admin:*`: con `catalog:read` una credencial de máquina (llave, token opaco o JWT de `machineTokens`) lee el catálogo comercial de su propio entorno —nunca el maestro global— y nada más. `customy apps validate` acepta esos tres scopes para `customy-access` en `customy.app.json`; `admin:*` y las escrituras siguen rechazados.

## 0.1.0

### Minor Changes

- Primera versión pública de `@customyai/cli` (antes `@customy/cli`, privada): `customy apps validate | codegen | sync` sobre el manifiesto `app/v1`, ejecutable como `customy` y usable como biblioteca (`validateManifest`, `generateAppTypes`, `syncApp`, `runCli`). Sin dependencias internas: el manifiesto viaja dentro del paquete y solo depende de `zod`.
