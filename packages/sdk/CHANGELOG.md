# @customyai/sdk

## 0.25.0

### Minor Changes

- `admin.commercial`: types for the `settlement` section of `explain` (`SettlementResult`, `SettlementLeg`, `SettlementMargin`, `SettlementStep`, `SettlementListPriceSource`, `SettlementMode`; `EntitlementExplanation.settlement`), `ExplainStepCode` (open: `ExplainStep.code` still accepts any string), the subscription policy states `past_due` (grace) and `soft_blocked` (read-only) as `SubscriptionPolicyState` / `SubscriptionAccessMode`, and `commercial.settlement.resolve(...)` for the operator-only, read-only `POST /commercial/settlement/resolve`. Additive only.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.15.0
  - @customyai/customy-access@0.9.14
  - @customyai/openfeature-provider@0.1.9

## 0.24.0

### Minor Changes

- `access.permissions.explain(userId, permission)` and the pure `explainPermission`: why a user has or lacks an app permission (`granted` / `expired` / `not_assigned` / `not_declared`, the roles that grant it, the expired ones and the roles that would), also in `createFakeAccess`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.14.0
  - @customyai/customy-access@0.9.13
  - @customyai/openfeature-provider@0.1.8

## 0.23.0

### Minor Changes

- `createFakeAccess({ manifest })` in `@customyai/sdk/testing`: in-memory Customy Access for app contract tests, with the shape of `createAccess()` (`me`, `capabilities`, `permissions`, `appRoles`, `plans`, `relationships`) and roles, plans and capabilities taken from the app manifest; test controls `grantRole`, `revokeRole`, `setPlan`, `failNext`, `calls`, `reset`.

## 0.22.0

### Minor Changes

- Typed connected-app entry for servers: `createCustomy({ issuer, clientId, clientSecret, discoverApplication: true })` takes the organization, environment and Access application from the machine client (`customy.application`), so no environment id is configured; `customy.permissions` (and `createPermissionDirectory(access)` in `@customyai/access`) answers `can` / `canAny` / `canAll` / `hasRole` / `require` with a short per-user cache, de-duplicated reads and fail-closed errors (`CustomyAccessError` 403 `PERMISSION_DENIED`), typed by the manifest's roles and permissions.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.13.0
  - @customyai/customy-access@0.9.12
  - @customyai/openfeature-provider@0.1.7

## 0.21.0

### Minor Changes

- `admin.commercial` gains `plans.get(code, version)` (a plan the organization sees, with its content), `plans.simulate(plan)` (what a save would decide plus the entitlements it would grant, the price margin over cost and the differences against its base and previous version; nothing is stored) and `relationships.agencies({ search, limit })` (platform operators: every agency with its edge). `relationships.get` also returns `canEdit` and `options`: for each choice on the edge (payer, controller, resale, plan creation, maximum discount, allowlist) whether the caller may pick it and, when not, the rule that refuses it. Only additions: existing calls and fields are unchanged.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.12.0
  - @customyai/customy-access@0.9.11
  - @customyai/openfeature-provider@0.1.6

## 0.20.0

### Minor Changes

- Typed roles and permissions from the manifest: `customy apps codegen` also writes `CustomyPermission`, `CustomyRole`, `CUSTOMY_ROLE_PERMISSIONS` and `CustomyAppTypes` (and `CustomyEventProperties` is now a type alias so it satisfies the event map); `createAccess<Capability, Role, Permission>()` types `permissions.effective`, `appRoles.*`, `me()` and `AccessMeSnapshot<Role, Permission>`; `createCustomy<CustomyAppTypes>()` carries `roles` and `permissions` into `customy.access`. A misspelled role or permission fails to compile.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.11.0
  - @customyai/customy-access@0.9.10
  - @customyai/openfeature-provider@0.1.5

## 0.19.0

### Minor Changes

- Roles and permissions of the signed-in user in the app, typed, so apps never hardcode role names: `AccessMeSnapshot.application.roles` / `.permissions` (the `/api/v1/me` block) in the client and `@customyai/access` types; `accessGrantsFrom<Role, Permission>(meOrGrants)` returns `can`, `canAny`, `canAll`, `hasRole`, `hasAnyRole`; `createCustomyClient().capabilities.getGrants(envId)`; the `useAccessGrants()` hook in `@customyai/sdk/client/react` and, for apps native, `useAccessGrants(load)` in `@customyai/sdk/native/react` (your API reads `/me` with its machine token). Showing or hiding never authorizes: the server still decides.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/client@0.4.0
  - @customyai/access@0.10.0
  - @customyai/customy-access@0.9.9
  - @customyai/openfeature-provider@0.1.4

## 0.18.0

### Minor Changes

- `createAccessAdmin(...).commercial` (`@customyai/sdk/admin`, `@customyai/sdk/access`): agency plans, the commercial relationship per org-tree edge (payer, controller, resale and plan-creation rights, wholesale cost basis, plan allowlist; versioned) and `explain`, a read-only deterministic answer to "which plan does this workspace have, inherited from whom, under which ceilings", with its steps and an inputs hash. Writes are decided by Access: an agency can never grant more than it holds and an agency plan never exceeds its base plan or sells below cost; a refusal is a `CustomySdkError` with the list of violations in `body.violations`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.9.0
  - @customyai/customy-access@0.9.8
  - @customyai/openfeature-provider@0.1.3

## 0.17.0

### Minor Changes

- `discoverApplication({ issuer, publishableKey | machineTokens | accessToken })` (`@customyai/sdk/core`) returns the application scope of a credential — organization, environment, Access application, product endpoints — from `GET /api/v1/application`, cached with a ttl and typed as `CustomySdkError`; and `createAccessAdmin` (`@customyai/sdk/admin`) is a typed Access admin client for a Next/node/edge runtime: cookie or bearer forwarding, environment scope headers, session with roles/capabilities, `me`, directory members, provisioning status, workspace config, governance token and a raw `fetch` for private bridges.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.3.0
  - @customyai/access@0.8.0
  - @customyai/customy-access@0.9.7
  - @customyai/billing@0.1.2
  - @customyai/client@0.3.1
  - @customyai/data@0.2.1
  - @customyai/links@0.1.2
  - @customyai/provisioning@0.1.1
  - @customyai/send@0.7.1
  - @customyai/server@0.4.1
  - @customyai/storage@0.1.1
  - @customyai/web@0.2.4
  - @customyai/openfeature-provider@0.1.2

## 0.16.0

### Minor Changes

- `@customyai/sdk` gains the app-integration kit of Access in the same install: `app`, `app/react`, `app/nextjs`, `app/cookies`, `app/flags`, `app/edge` and `app/server` (each re-exports the matching path of `@customyai/customy-access`), so an app can drop `@customyai/customy-access` and import only from `@customyai/sdk/...`.

## 0.15.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/web@0.2.3

## 0.15.0

### Minor Changes

- El paquete único cubre también los productos. Nuevas rutas de importación: `@customyai/sdk/send` (correo, push y bandeja), `/send/inbox` y `/send/inbox/react` (la bandeja en la app, navegador y móvil), `/storage` (archivos), `/billing`, `/data` y `/links`. Cada una con su bundle, igual que las anteriores. Una app ya no necesita instalar `@customyai/send`, `@customyai/storage` ni los demás por separado; los que siguen separados son los componentes de interfaz (`stories-*`).

## 0.14.0

### Minor Changes

- Una sola instalación para todo Customy. `@customyai/sdk` suma una ruta de importación por entorno, cada una con su propio bundle para que el navegador nunca cargue código de servidor: `@customyai/sdk/client` y `/client/react` (navegador), `/native` y `/native/react` (React Native), `/web` (Next.js y servidores web: proxy de autenticación, sesión de servidor y middleware), `/server` (verificar tokens y webhooks), `/flags`, `/flags/edge`, `/flags/react` y `/openfeature`, `/openfeature/web` (banderas), `/provisioning`, `/access` (roles y permisos de la app incluidos) y `/core`. La raíz y `/testing` no cambian. `react` es una dependencia opcional. Los paquetes pequeños (`@customyai/client`, `web`, `server`, `access`…) siguen existiendo por dentro, pero una app solo necesita instalar este.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.7.0
  - @customyai/openfeature-provider@0.1.1

## 0.13.0

### Minor Changes

- Customy Stories desde el servidor del cliente: `send.stories.conversion(input)` reporta una compra con su importe (`POST /api/stories/conversions`), que es la única vía por la que entra un importe a la atribución de ingresos de una story. La app del usuario solo manda una señal de compra sin importe (auditoría de seguridad de Stories, A-1), así que quien medía ingresos con el SDK de la app debe pasar ese reporte a su backend.

  - `StoryConversionInput` (`event_id` idempotente, `subscriber`, `value` en unidad menor como texto, `currency` ISO, `order_id`, `products`, `story_id`, `slide_id`, `component_id`, `utm`), `StoryConversionProduct` y `StoryConversion`.
  - Pide el alcance `stories:convert` (en un token de máquina, `send:stories:convert`, ya en `SEND_SCOPES`); `stories:manage` no lo implica. 503 `commerce_unavailable` si el puente con Commerce está apagado: reintenta.
  - `@customyai/sdk` lo trae en `customy.send.stories.conversion` y reexporta los tipos.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.7.0

## 0.12.0

### Minor Changes

- Los consentimientos de los eventos de usuario de una aplicación usan ahora el tipo `ConnectedApplicationConsentItem` (cada consentimiento con su finalidad, canal y texto), y el SDK lo exporta junto a `ConnectedApplicationConsent`.

## 0.11.0

### Minor Changes

- `customy.apps.activity()` acepta `properties` (hasta 8 etiquetas planas, validadas con el contrato) y los identificadores de correlación opcionales `sessionId`, `anonymousId` y `accountId` (slugs de hasta 64 caracteres; `accountId` es un id opaco de cuenta o grupo). Son aditivos: sin ellos el sobre es idéntico al de antes (`v1`). Requiere Events con el contrato `application.user.activity` ampliado (CRM y Data primero).

## 0.10.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.5.0

## 0.10.0

### Minor Changes

- Contrato del evaluador (D6): `EvaluationDetail` añade `reasonCode` (`default | off | killed | prerequisite_failed | rule:<id> | rollout | segment:<key> | error`) y `bucketBp` (0..9999). `reason` y `bucket` no cambian. Nuevos `createDependencies` (prerrequisitos con ciclo y profundidad máxima), `LEGACY_REASON_ALIASES` y tope de 512 caracteres para `regex`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.4.0

## 0.9.0

### Minor Changes

- Customy Provisioning para usuarios de PRUEBA: `@customyai/provisioning` (cliente sobre `@customyai/core` con token de máquina en memoria, `Customy-Environment` en cada petición, `Idempotency-Key` estable en reintentos, errores tipados y redacción de secretos), `createProvisioning`, el namespace `provisioning` y `@customyai/sdk/testing` (`withEphemeralUsers`) en `@customyai/sdk`, y los comandos `customy users | audit | policy | whoami | login` en `@customyai/cli`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/provisioning@0.1.0

## 0.8.0

### Minor Changes

- `customy.apps.consentUpdated({ userId, consents })` (y `envelopes.consentUpdated`, `batch` con `type: "consent_updated"`): emite `application.user.consent_updated` con los consentimientos que la persona dio, negó o retiró en la app —propósito y canal del vocabulario único de Customy, `status` `granted | denied | withdrawn`, `capturedAt`, `textVersion`, `textHash` opcional, `source` `signup | profile | banner | import` y `legalBasis: "consent"`— validados con el contrato antes de enviar. CRM los escribe en su registro de consentimientos y la contactabilidad los refleja al momento. La clave de idempotencia sale de las decisiones. Se exportan `UserConsentUpdatedInput`, `ConnectedApplicationConsent` y sus constantes.

## 0.7.0

### Minor Changes

- Relaciones, permisos y plan de la propia app con Access como fuente de verdad: `relationships.list` / `relationships.write`, `permissions.checkMany` y `plans.set`, con los scopes nuevos `app-relationships:read`, `app-relationships:write` y `app-plans:write` (en `ACCESS_SCOPES`). Solo con el JWT de máquina de la app y dentro de su prefijo `<clave>/`. `@customyai/sdk` los expone en `customy.access`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.3.0

## 0.6.0

### Minor Changes

- Personas y roles de Customy CRM y eventos de apps conectadas.

  - `customy.people` (y `createPeople`): `identify`, `get`, `list` (iterador sobre todas las páginas; `list.page` y `list.pages`), `assignRole`, `updateRole`, `endRole`, `linkIdentifier`, `listIdentifiers`, `setState`, `contactability`, `relationships.create/list/end`, `groups.create/list/addMembers`, `roleTypes.list` y `applicationsUsersSummary`. Las entradas se validan con el contrato antes de la llamada (`SDK_INPUT_INVALID` con `body.issues`). Token M2M con audiencia `customy-crm` y scopes `crm:people.read crm:people.write`, configurables con `people: { audience, scopes, baseUrl }`.
  - `customy.apps` (opción `apps` de `createCustomy`) y `createConnectedApp`: `userRegistered`, `activity`, `identityUpdated`, `deleted`, `batch`, `envelopes.*` y `send`, con el sobre de Customy Events, claves de idempotencia y `eventId` deterministas y reintentos ante 5xx y fallos de red.
  - Se exportan `evaluateContactability`, `ROLE_TYPE_CATALOG`, `RELATIONSHIP_TYPE_CATALOG`, las constantes y los tipos del modelo de Personas.
  - Nueva dependencia: `zod`.

## 0.5.1

### Patch Changes

- Un mensaje in-app (o una tarjeta) con un diseño por plataforma, sin duplicar campañas; todo aditivo y opcional.

  - `platform_overrides?: { ios?, android?, web?, mobile? }` en `InAppMessageInput`/`InAppMessage`, en cada `InAppVariant` y en las plantillas (`InAppTemplateInput`/`InAppTemplate`): `{ layout?, content? }` con contenido parcial (`InAppOverrideContent`: title, body, image, buttons, blocks, html, fallback, style, position, anchor, locales; `null` quita el valor de la base en esa plataforma). `mobile` vale para iOS y Android salvo que la específica diga otra cosa. Send lo resuelve al pedir el mensaje (base → mobile → plataforma → variante → overrides de la variante) y después adapta a lo que la app sabe pintar; editar un override devuelve el mensaje a borrador como cualquier cambio de contenido.
  - Tarjetas: `ContentCardPlatformOverrides` (`kind`, textos, imagen, enlace y `locales` por plataforma) en `ContentCardInput`, `ContentCard` y sus variantes.
  - Métricas: `by_platform` (`ios`, `android`, `web`, `unknown`) en `InAppStats`/`ContentCardStats` y en su bloque `test`.
  - `inApp.plan` e `inApp.estimate` devuelven `per_platform` (`PlatformPlan`: si se apunta, personas elegibles, overrides aplicados y el diseño que pinta un SDK al día y uno antiguo); nueva regla `platform_override` en `PlanRuleName`.
  - `ClientEvent.platform`; el cliente de `./inbox` lo pone solo con la plataforma de la app (`platform` o `capabilities.platform`).
  - `@customyai/sdk` reexporta estos tipos.

- Dependencias actualizadas:
  - @customyai/send@0.6.0

## 0.5.0

### Minor Changes

- Audiencias, envíos de prueba y el motor de decisiones de entrega de Customy Send: `notifications.send` acepta `audience` (filtros con la gramática de in-app y `segment_id` de Customy Data) en vez de `to`, `test: true` (sale ya, fuera de las estadísticas reales) y `delivery.decision` (el plan visto: `option` y `plan_hash`). Nuevos `notifications.plan` (reglas con severidad y efecto, cuándo sale cada parte, alcance y opciones con una hora sugerida), `notifications.estimate`, `inApp.estimate` e `inApp.plan`. `Notification` trae `test`, `audience`, `platforms`, `decision`, `decisions` y, en `get`, `delivery_plan` (`held_until` y `reason` por canal); `NotificationStats` trae `decisions` y el bloque `test`; los ajustes, `country` y `legal_windows` (ventanas legales de contacto, Ley 2300 en Colombia) y los interruptores `kill.push` / `kill.inbox`. `@customyai/sdk` reexporta estos tipos.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.5.0

## 0.4.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.4.0

## 0.4.0

### Minor Changes

- - `manifest` (el `customy.app.json` de la app): los scopes de cada producto salen de él; `scopes` manda sobre el manifiesto (`scopesFromManifest` exportado).
  - Sin scopes, Access pide en cada método el scope que necesita (`access.users.contact` funciona sin configurar nada si la credencial tiene `users:contact:read`).
  - `allowPrivateHttp` para tráfico `http://` hacia hosts privados (nunca públicos).

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.2.0
  - @customyai/core@0.2.0
  - @customyai/data@0.2.0
  - @customyai/send@0.3.1
  - @customyai/billing@0.1.1
  - @customyai/links@0.1.1

## 0.3.0

### Minor Changes

- Pruebas visibles y buscar a una persona por atributo (todo aditivo).

  - Servidor: `inApp.testEvents(id, { limit })` y `contentCards.testEvents(id)` (la actividad de quien prueba, del más reciente); `subscribers.find({ attribute, value })` (atributo exacto, `email` sin distinguir mayúsculas; con sus dispositivos, tipo `SubscriberMatch`).
  - Tipos: `stats.test` (`EngagementTestStats`: impresiones, clics por botón, cierres, encuestas, personas y `last_at` de quien prueba, aparte de los números reales); `EngagementTestEvent`; `InAppTestResult` / `ContentCardTestResult` con `test_sent_at` y `refresh_push`.
  - Apps: `test_sent_at` en los mensajes in-app y tarjetas de prueba (`EligibleInAppMessage`, `EligibleContentCard`): mostrar primero las pruebas, la más reciente antes, al refrescar. Send además manda un push silencioso con `customy_refresh` (APNs `customy.refresh`, FCM `customy_refresh`) al enviar una prueba. Un mensaje o tarjeta archivado no vuelve a salir, ni como prueba.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.3.0

## 0.2.0

### Minor Changes

- `customy.send` expone lo nuevo de Customy Send in-app v2 (aprobación, prueba, estadísticas, plantillas, kits de marca, tarjetas de contenido, `templates.preview` y `Customy-Version`), heredado de `@customyai/send` y `@customyai/send-sdk`. Solo adiciones: las uniones ampliadas (`InAppLayout`, `InAppStatus`, `ClientEventType`) no cambian nada para quien ya las usa.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.2.0

## 0.1.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.1.1

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/sdk`: `createCustomy({ issuer, clientId, clientSecret })` lee el discovery del entorno, guarda los tokens de máquina de la app (uno perezoso y cacheado por audiencia y scopes) y compone `access`, `data`, `send`, `billing` y `links` desde sus paquetes, más `product(clave)` (el transporte de `@customyai/core` de cualquier producto del discovery) y `token(producto)`. Tipable con lo que genera `customy apps codegen` (`createCustomy<{ events; meters; capabilities }>`). Solo servidor: no se resuelve en un bundle de navegador.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.1.0
  - @customyai/billing@0.1.0
  - @customyai/core@0.1.0
  - @customyai/data@0.1.0
  - @customyai/links@0.1.0
  - @customyai/send@0.1.0
