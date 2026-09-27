# @customyai/client

## 0.1.1

### Patch Changes

- Las barras finales de URLs y rutas se quitan en tiempo lineal. La expresión `/\/+$/` era cuadrática con entradas de muchas `/` (CodeQL `js/polynomial-redos`).

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/client`: cliente de navegador same-origin (`createCustomyClient`: sesión, login, MFA, passkeys, organización activa, capabilities con reintentos y `CustomySdkError`, vinculación de cuentas, ticket de realtime) y bindings de UI como subrutas: `./react` (`CustomyProvider`, hooks, puertas y componentes), `./native` y `./native/react`. Rechaza secretos de servidor.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
