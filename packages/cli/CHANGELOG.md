# @customyai/cli

## 0.4.0

### Minor Changes

- `customy flags | segments | experiments`: control de Customy Experiments desde la terminal (listar, leer, crear y actualizar desde JSON, archivar, restaurar, borrar, kill switch, miembros de segmentos, arrancar, pausar y concluir experimentos). Origen en `--base-url` o `CUSTOMY_EXPERIMENTS_URL`, credencial en `CUSTOMY_EXPERIMENTS_TOKEN`, `--reason` obligatorio en escrituras y `--dry-run`. Exporta `runExperimentsCli` y `EXPERIMENTS_EXIT_CODES`.

## 0.3.0

### Minor Changes

- Informe de API al día: el esquema de acciones de agente incluye `request_operator_approval`.

## 0.2.0

### Minor Changes

- Customy Provisioning para usuarios de PRUEBA: `@customyai/provisioning` (cliente sobre `@customyai/core` con token de máquina en memoria, `Customy-Environment` en cada petición, `Idempotency-Key` estable en reintentos, errores tipados y redacción de secretos), `createProvisioning`, el namespace `provisioning` y `@customyai/sdk/testing` (`withEphemeralUsers`) en `@customyai/sdk`, y los comandos `customy users | audit | policy | whoami | login` en `@customyai/cli`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/provisioning@0.1.0

## 0.1.1

### Patch Changes

- Scopes de Access para apps: `ACCESS_SCOPES` añade `users:read`, `catalog:read` y `flags:read` (antes solo `capabilities:read` y `users:contact:read`). `catalog.*` ya no necesita `admin:*`: con `catalog:read` una credencial de máquina (llave, token opaco o JWT de `machineTokens`) lee el catálogo comercial de su propio entorno —nunca el maestro global— y nada más. `customy apps validate` acepta esos tres scopes para `customy-access` en `customy.app.json`; `admin:*` y las escrituras siguen rechazados.

## 0.1.0

### Minor Changes

- Primera versión pública de `@customyai/cli` (antes `@customy/cli`, privada): `customy apps validate | codegen | sync` sobre el manifiesto `app/v1`, ejecutable como `customy` y usable como biblioteca (`validateManifest`, `generateAppTypes`, `syncApp`, `runCli`). Sin dependencias internas: el manifiesto viaja dentro del paquete y solo depende de `zod`.
