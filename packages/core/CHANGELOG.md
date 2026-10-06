# @customyai/core

## 0.3.0

### Minor Changes

- `discoverApplication({ issuer, publishableKey | machineTokens | accessToken })` (`@customyai/sdk/core`) returns the application scope of a credential — organization, environment, Access application, product endpoints — from `GET /api/v1/application`, cached with a ttl and typed as `CustomySdkError`; and `createAccessAdmin` (`@customyai/sdk/admin`) is a typed Access admin client for a Next/node/edge runtime: cookie or bearer forwarding, environment scope headers, session with roles/capabilities, `me`, directory members, provisioning status, workspace config, governance token and a raw `fetch` for private bridges.

## 0.2.0

### Minor Changes

- - `CallOptions` (`signal`, `timeoutMs`) y `callOptions()`: las opciones por llamada que aceptan los SDK de producto; el plazo por llamada manda sobre el del cliente.
  - `allowPrivateHttp` (transporte y `connectProduct`) permite `http://` solo hacia hosts privados (`isPrivateHost`: loopback, RFC 1918, IPv6 local, `*.internal`, nombres de una etiqueta), nunca a uno público. Lo recomendado sigue siendo el nombre público https.
  - Una respuesta 2xx que no es JSON es ahora `SDK_RESPONSE_INVALID` (antes llegaba el texto como si fueran datos); para leer texto, `responseType: "text"`.

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/core`: transporte `fetch` con error tipado (`CustomySdkError`), reintentos con `Retry-After`, idempotencia, paginación por cursor, discovery del entorno (`discoverPlatform`) y tokens de máquina perezosos y cacheados por audiencia (`createMachineTokenProvider`, `createMachineTokens`). Funciona en Node, runtimes edge y navegador.
- `connectProduct` y `resolveBearer`: la conexión común de los SDK de producto (URL explícita, del discovery o pública; credencial como llave, token, proveedor o `machineTokens` con la audiencia del producto y sus scopes mínimos).
