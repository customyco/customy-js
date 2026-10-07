# @customyai/cli

## 0.7.0

### Minor Changes

- Environment discovery without hand-written ids: `createCustomy` resolves the Access URL, the Workspace environment and the project from `CUSTOMY_ACCESS_URL` (falls back to `CUSTOMY_ISSUER`), `CUSTOMY_WORKSPACE_ENVIRONMENT_ID` and `CUSTOMY_PROJECT_ID` (explicit option, then variable, then what `discoverApplication` found), `issuer` is now optional, and `customy.apps` fills `organizationId`, `projectId` and `accessEnvironmentId` the same way. `readCustomyEnvironment` is exported. Typed capability values: `customy apps codegen` also writes `CustomyCapabilityValues` (and `capabilityValues` in `CustomyAppTypes`), and `typedCapability` narrows the `value` of a check; existing code keeps compiling. `createFakeAccess` simulates sessions (`sessions.create/get/revoke`) and discovery (`application()`, `environment()`).

## 0.6.0

### Minor Changes

- Typed roles and permissions from the manifest: `customy apps codegen` also writes `CustomyPermission`, `CustomyRole`, `CUSTOMY_ROLE_PERMISSIONS` and `CustomyAppTypes` (and `CustomyEventProperties` is now a type alias so it satisfies the event map); `createAccess<Capability, Role, Permission>()` types `permissions.effective`, `appRoles.*`, `me()` and `AccessMeSnapshot<Role, Permission>`; `createCustomy<CustomyAppTypes>()` carries `roles` and `permissions` into `customy.access`. A misspelled role or permission fails to compile.

## 0.5.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/provisioning@0.1.1

## 0.5.0

### Minor Changes

- `customy apps validate | sync` ahora aceptan los campos opcionales `permissions` y `roles` del manifiesto `app/v1` y los scopes de Access `app-roles:read` / `app-roles:write`. La validación es la misma que aplica el servidor (claves en el espacio de nombres `<clave-de-la-app>.`, sin comodines, permisos de rol declarados, topes de cantidad); `validate` y `sync` imprimen los conteos de permisos y roles y la reconciliación del servidor. Los manifiestos existentes siguen validando igual.

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
