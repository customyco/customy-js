# @customyai/cli

## 0.1.0

### Minor Changes

- Primera versión pública de `@customyai/cli` (antes `@customy/cli`, privada): `customy apps validate | codegen | sync` sobre el manifiesto `app/v1`, ejecutable como `customy` y usable como biblioteca (`validateManifest`, `generateAppTypes`, `syncApp`, `runCli`). Sin dependencias internas: el manifiesto viaja dentro del paquete y solo depende de `zod`.
