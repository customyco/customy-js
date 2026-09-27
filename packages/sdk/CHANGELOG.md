# @customyai/sdk

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
