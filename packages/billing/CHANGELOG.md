# @customyai/billing

## 0.1.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.3.0

## 0.1.1

### Patch Changes

- - `send` (envíos y creaciones con `IdempotentOptions`) y `billing.usage.report` aceptan `timeoutMs` por llamada, además de `signal`.
  - `links`: las exportaciones CSV se leen como texto explícito (`responseType: "text"`).
- Dependencias actualizadas:
  - @customyai/core@0.2.0

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/billing` sobre `@customyai/core`: `usage.report` para los meters que declara la app (tipables con `customy apps codegen`), con la identidad de la app (`billing:usage:report`), validación local y reintento seguro del lote.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
