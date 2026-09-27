# @customyai/links-sdk

## 0.3.0

### Minor Changes

- En desuso: usa `@customyai/links` (`createLinks`). `CustomyLinks` es ahora un adaptador de ese cliente (transporte, reintentos con `Retry-After` y tokens de Access de `@customyai/core`) y avisa una vez por proceso (`DeprecationWarning` `CUSTOMY_SDK_DEPRECATED`; `console.warn` fuera de Node). La API pública no cambia (informe de API idéntico): `CustomyLinksError(status, code, message, details)` con `NETWORK_ERROR` sin respuesta, las respuestas 204 resuelven `undefined`, `status()` sigue sin enviar la llave y `verifyWebhook`/`signPayload` son los de `@customyai/links`. Nuevas dependencias: `@customyai/core` y `@customyai/links`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
  - @customyai/links@0.1.0
