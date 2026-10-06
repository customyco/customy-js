# @customyai/access

## 0.16.0

### Minor Changes

- Commercial surface: `plans.migrateSubscribers` moves pinned subscribers to a newer active plan version (dry run by default), `simulate` reports the subscribers affected by a plan change, operators get `catalogPlanCodes` in the agency plans listing, and the generated client covers the 13 commercial operations.

## 0.15.0

### Minor Changes

- `admin.commercial`: types for the `settlement` section of `explain` (`SettlementResult`, `SettlementLeg`, `SettlementMargin`, `SettlementStep`, `SettlementListPriceSource`, `SettlementMode`; `EntitlementExplanation.settlement`), `ExplainStepCode` (open: `ExplainStep.code` still accepts any string), the subscription policy states `past_due` (grace) and `soft_blocked` (read-only) as `SubscriptionPolicyState` / `SubscriptionAccessMode`, and `commercial.settlement.resolve(...)` for the operator-only, read-only `POST /commercial/settlement/resolve`. Additive only.

## 0.14.0

### Minor Changes

- `access.permissions.explain(userId, permission)` and the pure `explainPermission`: why a user has or lacks an app permission (`granted` / `expired` / `not_assigned` / `not_declared`, the roles that grant it, the expired ones and the roles that would), also in `createFakeAccess`.

## 0.13.0

### Minor Changes

- Typed connected-app entry for servers: `createCustomy({ issuer, clientId, clientSecret, discoverApplication: true })` takes the organization, environment and Access application from the machine client (`customy.application`), so no environment id is configured; `customy.permissions` (and `createPermissionDirectory(access)` in `@customyai/access`) answers `can` / `canAny` / `canAll` / `hasRole` / `require` with a short per-user cache, de-duplicated reads and fail-closed errors (`CustomyAccessError` 403 `PERMISSION_DENIED`), typed by the manifest's roles and permissions.

## 0.12.0

### Minor Changes

- `admin.commercial` gains `plans.get(code, version)` (a plan the organization sees, with its content), `plans.simulate(plan)` (what a save would decide plus the entitlements it would grant, the price margin over cost and the differences against its base and previous version; nothing is stored) and `relationships.agencies({ search, limit })` (platform operators: every agency with its edge). `relationships.get` also returns `canEdit` and `options`: for each choice on the edge (payer, controller, resale, plan creation, maximum discount, allowlist) whether the caller may pick it and, when not, the rule that refuses it. Only additions: existing calls and fields are unchanged.

## 0.11.0

### Minor Changes

- Typed roles and permissions from the manifest: `customy apps codegen` also writes `CustomyPermission`, `CustomyRole`, `CUSTOMY_ROLE_PERMISSIONS` and `CustomyAppTypes` (and `CustomyEventProperties` is now a type alias so it satisfies the event map); `createAccess<Capability, Role, Permission>()` types `permissions.effective`, `appRoles.*`, `me()` and `AccessMeSnapshot<Role, Permission>`; `createCustomy<CustomyAppTypes>()` carries `roles` and `permissions` into `customy.access`. A misspelled role or permission fails to compile.

## 0.10.0

### Minor Changes

- Roles and permissions of the signed-in user in the app, typed, so apps never hardcode role names: `AccessMeSnapshot.application.roles` / `.permissions` (the `/api/v1/me` block) in the client and `@customyai/access` types; `accessGrantsFrom<Role, Permission>(meOrGrants)` returns `can`, `canAny`, `canAll`, `hasRole`, `hasAnyRole`; `createCustomyClient().capabilities.getGrants(envId)`; the `useAccessGrants()` hook in `@customyai/sdk/client/react` and, for apps native, `useAccessGrants(load)` in `@customyai/sdk/native/react` (your API reads `/me` with its machine token). Showing or hiding never authorizes: the server still decides.

## 0.9.0

### Minor Changes

- `createAccessAdmin(...).commercial` (`@customyai/sdk/admin`, `@customyai/sdk/access`): agency plans, the commercial relationship per org-tree edge (payer, controller, resale and plan-creation rights, wholesale cost basis, plan allowlist; versioned) and `explain`, a read-only deterministic answer to "which plan does this workspace have, inherited from whom, under which ceilings", with its steps and an inputs hash. Writes are decided by Access: an agency can never grant more than it holds and an agency plan never exceeds its base plan or sells below cost; a refusal is a `CustomySdkError` with the list of violations in `body.violations`.

## 0.8.0

### Minor Changes

- `discoverApplication({ issuer, publishableKey | machineTokens | accessToken })` (`@customyai/sdk/core`) returns the application scope of a credential — organization, environment, Access application, product endpoints — from `GET /api/v1/application`, cached with a ttl and typed as `CustomySdkError`; and `createAccessAdmin` (`@customyai/sdk/admin`) is a typed Access admin client for a Next/node/edge runtime: cookie or bearer forwarding, environment scope headers, session with roles/capabilities, `me`, directory members, provisioning status, workspace config, governance token and a raw `fetch` for private bridges.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.3.0

## 0.7.0

### Minor Changes

- Roles y permisos de la app sin escribir ni un nombre de rol. Nuevo: `appRoles.list()` (los roles que declara el manifiesto, con sus permisos), `appRoles.assignments.list({ userId })`, `appRoles.assignments.assign({ userId, roleKey, expiresAt })` y `.revoke({ userId, roleKey })`, y `permissions.effective(userId)`, que devuelve los roles vigentes de un usuario y la unión de sus permisos ya resueltos contra el manifiesto (un rol caducado o que ya no existe no cuenta). Scopes nuevos `app-roles:read` y `app-roles:write`, que se piden solos con `machineTokens`. Lo que asignó el Workspace no se pisa: el servidor responde `ASSIGNMENT_MANAGED_BY_WORKSPACE`. `ACCESS_SCOPES` gana dos entradas.

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
