# @customyai/send

## 0.3.0

### Minor Changes

- Pruebas visibles y buscar a una persona por atributo (todo aditivo).

  - Servidor: `inApp.testEvents(id, { limit })` y `contentCards.testEvents(id)` (la actividad de quien prueba, del más reciente); `subscribers.find({ attribute, value })` (atributo exacto, `email` sin distinguir mayúsculas; con sus dispositivos, tipo `SubscriberMatch`).
  - Tipos: `stats.test` (`EngagementTestStats`: impresiones, clics por botón, cierres, encuestas, personas y `last_at` de quien prueba, aparte de los números reales); `EngagementTestEvent`; `InAppTestResult` / `ContentCardTestResult` con `test_sent_at` y `refresh_push`.
  - Apps: `test_sent_at` en los mensajes in-app y tarjetas de prueba (`EligibleInAppMessage`, `EligibleContentCard`): mostrar primero las pruebas, la más reciente antes, al refrescar. Send además manda un push silencioso con `customy_refresh` (APNs `customy.refresh`, FCM `customy_refresh`) al enviar una prueba. Un mensaje o tarjeta archivado no vuelve a salir, ni como prueba.

## 0.2.0

### Minor Changes

- Customy Send in-app v2, content cards y clientes evergreen (todo aditivo; sin `capabilities` las apps siguen como en 1.x).

  - Tipos: diseños `slideup`, `tooltip` y `html`; bloques (`heading`, `text`, `image`, `buttons`, `spacer`, `divider`, `survey`); botones con `style` y `action`; audiencia por filtros, `trigger_filters`, `delay_seconds`, variantes A/B, grupo de control, conversión, plantillas, kits de marca, tarjetas de contenido, estadísticas, atributos de la persona, `require_approval`, `api_version` y `client_config`.
  - Servidor: `inApp.submit/approve/reject/activate/pause/test/stats/approvals`, `inApp.templates`, `brandKits`, `contentCards` (con el mismo flujo de aprobación), `templates.preview`; opción `actor` (`x-customy-actor`); scopes `send:content_cards:*`; cabecera `Customy-Version` (`SEND_API_VERSION = "2026-09-27"`).
  - Apps (`/inbox`): opción `capabilities` (cabecera `Customy-Client`) y `DEFAULT_CAPABILITIES`; `config()` con sondeo e interruptores `kill`; `inAppMessages({ trigger, properties, appVersion })` y `matchesFilters`; `contentCards()`; `track.inApp`, `track.card`, `submitSurvey`, `logEvent`; puente HTML (`HTML_CSP`, `BRIDGE_SCRIPT`, `parseBridgeMessage`, `buildHtmlDocument`) y `createInAppPresenter`.
  - React (`/inbox/react`): `useInAppMessages({ trigger, properties })` con espera `delay_seconds`, `useContentCards()` y `useCustomyConfig()`.

  Las uniones ampliadas (`InAppLayout`, `InAppStatus`, `ClientEventType`) son adiciones: los valores nuevos solo llegan a las apps que los declaran en `capabilities`.

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/send` sobre `@customyai/core`: correo con plantillas y variables (`templateId`, `variables`, `templates.*`), dominios, llaves, webhooks, supresiones, notificaciones, push, bandeja e in-app, con `CustomySendError`, reintentos con `Retry-After` y clave de idempotencia automática en los envíos.
- `@customyai/send/inbox` y `@customyai/send/inbox/react`: el cliente de Customy Engage para las apps de las personas (bandeja in-app, contadores en vivo, recibos, mensajes in-app, preferencias y dispositivo push) con un token de suscriptor, y sus hooks sin interfaz para React y React Native (`react` como dependencia par opcional). Los errores son el mismo `CustomySendError` del servidor. En el servidor, paridad con el push P0 de Send: `notifications.cancel`, `notifications.categories`, `notifications.settings`, `subscribers` y `actionCategoryId`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
