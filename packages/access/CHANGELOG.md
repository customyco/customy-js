# @customyai/access

## 0.6.0

### Minor Changes

- Nuevas entradas `@customyai/access/flags/react` (`FlagsProvider`, `useFlag`, `useFlagDetail`, `useExperiment`, `<Experience point=…>`, con SSR sin parpadeo: la hidratación usa las asignaciones del servidor o del borde y solo cede ante una versión de la instantánea más nueva) y `@customyai/access/flags/edge` (`createEdgeFlags` para middleware de Next.js/Workers: asigna en el borde con el mismo motor, fija la cookie de unidad y pasa las asignaciones en la cabecera `x-customy-flags`; `createBootstrap`, `encodeBootstrap`, `decodeBootstrap`). `react` es peer opcional. `./flags` no cambia.

## 0.5.0

### Minor Changes

- Flags: el lote de impresiones/conversiones solo se da por enviado con un 2xx que confirma el registro. Un 503 con `Retry-After` o un 202 `*_NOT_RECORDED` lo devuelve a la cola, y el envío automático espera con backoff exponencial (o el `Retry-After`). Un 400/413/422 se descarta como rechazo definitivo. La cola en memoria se acota a 50 000 por tipo.

## 0.4.0

### Minor Changes

- Contrato del evaluador (D6): `EvaluationDetail` añade `reasonCode` (`default | off | killed | prerequisite_failed | rule:<id> | rollout | segment:<key> | error`) y `bucketBp` (0..9999). `reason` y `bucket` no cambian. Nuevos `createDependencies` (prerrequisitos con ciclo y profundidad máxima), `LEGACY_REASON_ALIASES` y tope de 512 caracteres para `regex`.

### Patch Changes

- Dependencias actualizadas:
  - @customy/flags-eval@0.2.0

## 0.3.0

### Minor Changes

- Relaciones, permisos y plan de la propia app con Access como fuente de verdad: `relationships.list` / `relationships.write`, `permissions.checkMany` y `plans.set`, con los scopes nuevos `app-relationships:read`, `app-relationships:write` y `app-plans:write` (en `ACCESS_SCOPES`). Solo con el JWT de máquina de la app y dentro de su prefijo `<clave>/`. `@customyai/sdk` los expone en `customy.access`.

## 0.2.0

### Minor Changes

- - Con `machineTokens` y sin `scopes`, cada método pide su propio scope la primera vez que se usa (`users.contact` → `users:contact:read`, `users.*` → `users:read`, `catalog.*` → `catalog:read`, `me`/`capabilities` → `capabilities:read`): `access.users.contact` ya no falla por pedir solo el mínimo. Con `scopes`, un único token con esos, como antes.
  - Un fallo de scope (`SCOPE_REQUIRED`, token sin el scope) es `CustomyAccessError` con `requiredScope` y un mensaje que nombra el método y el scope.
  - `signal` y `timeoutMs` por llamada en todos los métodos (`me`, `capabilities.*`, `catalog.*`, `users.*`); `users.iterate` los toma de su segundo argumento.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0

## 0.1.1

### Patch Changes

- Scopes de Access para apps: `ACCESS_SCOPES` añade `users:read`, `catalog:read` y `flags:read` (antes solo `capabilities:read` y `users:contact:read`). `catalog.*` ya no necesita `admin:*`: con `catalog:read` una credencial de máquina (llave, token opaco o JWT de `machineTokens`) lee el catálogo comercial de su propio entorno —nunca el maestro global— y nada más. `customy apps validate` acepta esos tres scopes para `customy-access` en `customy.app.json`; `admin:*` y las escrituras siguen rechazados.

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/access` sobre `@customyai/core`: `me`, `capabilities.check`/`checkMany` (valores del plan de la app o entitlements del entorno), catálogo comercial, usuarios (`list`, `iterate`, `get`) y el contacto acotado de un usuario (`users.contact`, scope `users:contact:read`). `@customyai/access/flags`: flags con evaluación local, instantánea firmada, CDN, realtime, impresiones y conversiones. `@customyai/access/generated`: cualquier operación pública de Access por su `operationId`, con los parámetros de ruta tipados.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
