# @customyai/links

## 0.1.1

### Patch Changes

- - `send` (envíos y creaciones con `IdempotentOptions`) y `billing.usage.report` aceptan `timeoutMs` por llamada, además de `signal`.
  - `links`: las exportaciones CSV se leen como texto explícito (`responseType: "text"`).
- Dependencias actualizadas:
  - @customyai/core@0.2.0

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/links` sobre `@customyai/core`: enlaces (con `iterate` para recorrer todas las páginas), analítica, conversiones, dominios, webhooks, UTM, etiquetas y grupos, con `CustomyLinksError` y la identidad de la app (`links:track`, `links:read`, `links:write`).

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
