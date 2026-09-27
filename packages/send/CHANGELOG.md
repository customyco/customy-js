# @customyai/send

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/send` sobre `@customyai/core`: correo con plantillas y variables (`templateId`, `variables`, `templates.*`), dominios, llaves, webhooks, supresiones, notificaciones, push, bandeja e in-app, con `CustomySendError`, reintentos con `Retry-After` y clave de idempotencia automática en los envíos.
- `@customyai/send/inbox` y `@customyai/send/inbox/react`: el cliente de Customy Engage para las apps de las personas (bandeja in-app, contadores en vivo, recibos, mensajes in-app, preferencias y dispositivo push) con un token de suscriptor, y sus hooks sin interfaz para React y React Native (`react` como dependencia par opcional). Los errores son el mismo `CustomySendError` del servidor. En el servidor, paridad con el push P0 de Send: `notifications.cancel`, `notifications.categories`, `notifications.settings`, `subscribers` y `actionCategoryId`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
