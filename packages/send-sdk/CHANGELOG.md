# Changelog

## 1.6.4

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.3.0
  - @customyai/send@0.7.1

## 1.6.3

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.7.0

## 1.6.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.6.0

## 1.6.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.5.0

## 1.6.0

### Minor Changes

- HTML en todos los diseños (contrato in-app v2 §9; todo aditivo y opcional).

  - `content.html` vale con modal, fullscreen, banner, card y slideup (con tooltip Send responde `422 html_not_allowed_in_tooltip`); `layout: "html"` sigue siendo modal + HTML. Precedencia: html > blocks > título/cuerpo.
  - Nueva función de cliente `html_layouts` (`ClientFeature`, constante `HTML_LAYOUTS_FEATURE`): declárala solo si tu app pinta HTML en esos diseños; `DEFAULT_CAPABILITIES` no la incluye. Sin ella Send manda el `fallback` nativo en el mismo diseño (`rendered_as: "fallback"`).
  - `buildHtmlDocument(html, { safeArea, viewportHeight })` inyecta `--customy-safe-top|-bottom|-left|-right` y `--customy-viewport-height` en `:root` antes del código del autor (`safeAreaStyle` para hacerlo a mano); `HTML_LAYOUTS`; `clampHtmlHeight(layout, alto, pantalla)` aplica los topes (40 % banner/slideup, 80 % card/modal; fullscreen lo decide el anfitrión).
  - `BRIDGE_SCRIPT` informa solo el alto del contenido (caja de `<body>` más márgenes) al cargar y cada vez que cambia (ResizeObserver) con `resize`; `customy.resize(h)` sigue disponible.
  - El interruptor `kill.html` de la configuración remota oculta también los mensajes con `content.html` en otros diseños.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.4.0

## 1.5.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0
  - @customyai/send@0.3.1

## 1.5.0

### Minor Changes

- Pruebas visibles y buscar a una persona por atributo (todo aditivo).

  - Servidor: `inApp.testEvents(id, { limit })` y `contentCards.testEvents(id)` (la actividad de quien prueba, del más reciente); `subscribers.find({ attribute, value })` (atributo exacto, `email` sin distinguir mayúsculas; con sus dispositivos, tipo `SubscriberMatch`).
  - Tipos: `stats.test` (`EngagementTestStats`: impresiones, clics por botón, cierres, encuestas, personas y `last_at` de quien prueba, aparte de los números reales); `EngagementTestEvent`; `InAppTestResult` / `ContentCardTestResult` con `test_sent_at` y `refresh_push`.
  - Apps: `test_sent_at` en los mensajes in-app y tarjetas de prueba (`EligibleInAppMessage`, `EligibleContentCard`): mostrar primero las pruebas, la más reciente antes, al refrescar. Send además manda un push silencioso con `customy_refresh` (APNs `customy.refresh`, FCM `customy_refresh`) al enviar una prueba. Un mensaje o tarjeta archivado no vuelve a salir, ni como prueba.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.3.0

## 1.4.0

### Minor Changes

- Customy Send in-app v2, content cards y clientes evergreen (todo aditivo; sin `capabilities` las apps siguen como en 1.x).

  - Tipos: diseños `slideup`, `tooltip` y `html`; bloques (`heading`, `text`, `image`, `buttons`, `spacer`, `divider`, `survey`); botones con `style` y `action`; audiencia por filtros, `trigger_filters`, `delay_seconds`, variantes A/B, grupo de control, conversión, plantillas, kits de marca, tarjetas de contenido, estadísticas, atributos de la persona, `require_approval`, `api_version` y `client_config`.
  - Servidor: `inApp.submit/approve/reject/activate/pause/test/stats/approvals`, `inApp.templates`, `brandKits`, `contentCards` (con el mismo flujo de aprobación), `templates.preview`; opción `actor` (`x-customy-actor`); scopes `send:content_cards:*`; cabecera `Customy-Version` (`SEND_API_VERSION = "2026-09-27"`).
  - Apps (`/inbox`): opción `capabilities` (cabecera `Customy-Client`) y `DEFAULT_CAPABILITIES`; `config()` con sondeo e interruptores `kill`; `inAppMessages({ trigger, properties, appVersion })` y `matchesFilters`; `contentCards()`; `track.inApp`, `track.card`, `submitSurvey`, `logEvent`; puente HTML (`HTML_CSP`, `BRIDGE_SCRIPT`, `parseBridgeMessage`, `buildHtmlDocument`) y `createInAppPresenter`.
  - React (`/inbox/react`): `useInAppMessages({ trigger, properties })` con espera `delay_seconds`, `useContentCards()` y `useCustomyConfig()`.

  Las uniones ampliadas (`InAppLayout`, `InAppStatus`, `ClientEventType`) son adiciones: los valores nuevos solo llegan a las apps que los declaran en `capabilities`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send@0.2.0

## 1.3.0

### Minor Changes

- En desuso: usa `@customyai/send` (`createSend`) y `@customyai/send/inbox`. `CustomySend` y `createInboxClient` son ahora adaptadores de esos clientes (transporte, reintentos con `Retry-After`, tokens de Access y tiempo real de `@customyai/send`) y avisan una vez por proceso (`DeprecationWarning` `CUSTOMY_SDK_DEPRECATED`; `console.warn` fuera de Node). La API pública no cambia (informes de API idénticos): `CustomySendError` conserva su constructor posicional, sus códigos (`network_error`, `http_<estado>`, los de la API) y `retryAfterMs: null` sin `Retry-After`; `request` y `requestBinary` siguen. Cambio de comportamiento: un `POST` sin `idempotencyKey` lleva ahora una llave generada y se reintenta ante un 5xx sin riesgo de duplicar; un 429 se reintenta con cualquier nombre de error (antes solo `rate_limit_exceeded`).
- Push de primer nivel (P0): `notifications.send` acepta `subtitle`, `sound` (o `null` = silencio), `thread_id`, `interruption_level`, `relevance_score`, `actions` (≤ 3 botones), `media`, `android` (canal, visibilidad, color, fijo), `type: "background"` (push silencioso), `replace`, `send_at` y `delivery` (zona de cada persona, horas de silencio). Nuevos `notifications.cancel` (con `recall`), `notifications.categories`, `notifications.settings` y `subscribers` (perfil y preferencias). En `/inbox`: `preferences.get/set` y `opened(id, { action })`. `actionCategoryId` da la categoría de iOS de un juego de botones, igual que Send. Todo es opcional: nada existente cambia.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
  - @customyai/send@0.1.0

## 1.2.0

Customy Engage: notificaciones push, bandeja in-app y mensajes in-app.

- Servidor: `notifications.send(input, { idempotencyKey })`, `notifications.get`, `notifications.stats`, `notifications.conversion`; `push.devices.register/list/remove`; `push.credentials.putFcm/putApns/list/remove`; `inbox.list/mark/createToken`; `inApp.create/list/get/update/archive`. Misma autenticación que el resto (llave o token de máquina de Customy Access).
- Nuevo `@customyai/send-sdk/inbox`: cliente para las apps (navegador, React Native) con token de suscriptor renovable; lista paginada, contadores, marcas optimistas con marcha atrás, recibos en lote con ids estables, mensajes in-app por disparador y prioridad, registro del dispositivo push y cambios en vivo por WebSocket (reconexión con ticket nuevo, señales atrasadas ignoradas, sondeo de contadores como respaldo).
- Nuevo `@customyai/send-sdk/inbox/react`: `InboxProvider`, `useInbox`, `useInboxCounts`, `useInAppMessages` y `formatBadgeCount`, sin DOM.
- `CustomySendError` se exporta también desde `@customyai/send-sdk/inbox`.
