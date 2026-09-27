# @customyai/core

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/core`: transporte `fetch` con error tipado (`CustomySdkError`), reintentos con `Retry-After`, idempotencia, paginación por cursor, discovery del entorno (`discoverPlatform`) y tokens de máquina perezosos y cacheados por audiencia (`createMachineTokenProvider`, `createMachineTokens`). Funciona en Node, runtimes edge y navegador.
- `connectProduct` y `resolveBearer`: la conexión común de los SDK de producto (URL explícita, del discovery o pública; credencial como llave, token, proveedor o `machineTokens` con la audiencia del producto y sus scopes mínimos).
