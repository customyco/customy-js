# @customyai/send

## 0.6.0

### Minor Changes

- Un mensaje in-app (o una tarjeta) con un diseño por plataforma, sin duplicar campañas; todo aditivo y opcional.

  - `platform_overrides?: { ios?, android?, web?, mobile? }` en `InAppMessageInput`/`InAppMessage`, en cada `InAppVariant` y en las plantillas (`InAppTemplateInput`/`InAppTemplate`): `{ layout?, content? }` con contenido parcial (`InAppOverrideContent`: title, body, image, buttons, blocks, html, fallback, style, position, anchor, locales; `null` quita el valor de la base en esa plataforma). `mobile` vale para iOS y Android salvo que la específica diga otra cosa. Send lo resuelve al pedir el mensaje (base → mobile → plataforma → variante → overrides de la variante) y después adapta a lo que la app sabe pintar; editar un override devuelve el mensaje a borrador como cualquier cambio de contenido.
  - Tarjetas: `ContentCardPlatformOverrides` (`kind`, textos, imagen, enlace y `locales` por plataforma) en `ContentCardInput`, `ContentCard` y sus variantes.
  - Métricas: `by_platform` (`ios`, `android`, `web`, `unknown`) en `InAppStats`/`ContentCardStats` y en su bloque `test`.
  - `inApp.plan` e `inApp.estimate` devuelven `per_platform` (`PlatformPlan`: si se apunta, personas elegibles, overrides aplicados y el diseño que pinta un SDK al día y uno antiguo); nueva regla `platform_override` en `PlanRuleName`.
  - `ClientEvent.platform`; el cliente de `./inbox` lo pone solo con la plataforma de la app (`platform` o `capabilities.platform`).
  - `@customyai/sdk` reexporta estos tipos.

## 0.5.0

### Minor Changes

- Audiencias, envíos de prueba y el motor de decisiones de entrega de Customy Send: `notifications.send` acepta `audience` (filtros con la gramática de in-app y `segment_id` de Customy Data) en vez de `to`, `test: true` (sale ya, fuera de las estadísticas reales) y `delivery.decision` (el plan visto: `option` y `plan_hash`). Nuevos `notifications.plan` (reglas con severidad y efecto, cuándo sale cada parte, alcance y opciones con una hora sugerida), `notifications.estimate`, `inApp.estimate` e `inApp.plan`. `Notification` trae `test`, `audience`, `platforms`, `decision`, `decisions` y, en `get`, `delivery_plan` (`held_until` y `reason` por canal); `NotificationStats` trae `decisions` y el bloque `test`; los ajustes, `country` y `legal_windows` (ventanas legales de contacto, Ley 2300 en Colombia) y los interruptores `kill.push` / `kill.inbox`. `@customyai/sdk` reexporta estos tipos.

## 0.4.0

### Minor Changes

- HTML en todos los diseños (contrato in-app v2 §9; todo aditivo y opcional).

  - `content.html` vale con modal, fullscreen, banner, card y slideup (con tooltip Send responde `422 html_not_allowed_in_tooltip`); `layout: "html"` sigue siendo modal + HTML. Precedencia: html > blocks > título/cuerpo.
  - Nueva función de cliente `html_layouts` (`ClientFeature`, constante `HTML_LAYOUTS_FEATURE`): declárala solo si tu app pinta HTML en esos diseños; `DEFAULT_CAPABILITIES` no la incluye. Sin ella Send manda el `fallback` nativo en el mismo diseño (`rendered_as: "fallback"`).
  - `buildHtmlDocument(html, { safeArea, viewportHeight })` inyecta `--customy-safe-top|-bottom|-left|-right` y `--customy-viewport-height` en `:root` antes del código del autor (`safeAreaStyle` para hacerlo a mano); `HTML_LAYOUTS`; `clampHtmlHeight(layout, alto, pantalla)` aplica los topes (40 % banner/slideup, 80 % card/modal; fullscreen lo decide el anfitrión).
  - `BRIDGE_SCRIPT` informa solo el alto del contenido (caja de `<body>` más márgenes) al cargar y cada vez que cambia (ResizeObserver) con `resize`; `customy.resize(h)` sigue disponible.
  - El interruptor `kill.html` de la configuración remota oculta también los mensajes con `content.html` en otros diseños.

## 0.3.1

### Patch Changes

- - `send` (envíos y creaciones con `IdempotentOptions`) y `billing.usage.report` aceptan `timeoutMs` por llamada, además de `signal`.
  - `links`: las exportaciones CSV se leen como texto explícito (`responseType: "text"`).
- Dependencias actualizadas:
  - @customyai/core@0.2.0

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
