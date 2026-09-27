# @customyai/sdk

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
