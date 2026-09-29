# @customyai/client

## 0.3.0

### Minor Changes

- Correo verificado sin llamadas a mano. `@customyai/client`: `signUp` y `signInWithEmail` devuelven `verificationRequired: true` cuando Access pide verificar el correo antes de abrir sesión, y el nuevo `sendVerificationEmail(email, opciones?)` reenvía el correo de verificación. `@customyai/server`: el nuevo `fetchUserInfo(token, { issuer })` lee el perfil con el token del usuario (`emailVerified` es `null` si Access no lo informa, nunca se asume verificado) y falla con `ACCESS_UNAVAILABLE` si Access no contesta.

## 0.2.0

### Minor Changes

- - Los fallos de login (`signInWithEmail`, `signUp`, `signInWithMagicLink`, `verifyMFA`, passkeys…) llevan, además del texto de siempre en `error`, `status`, `code` y `retryable`: 401/403 credenciales o cuenta; 429/5xx servicio caído; `SDK_TIMEOUT` (408) y `SDK_NETWORK_ERROR` (0). Se lee el sobre `{ error: { code, message } }` y el formato plano (`authFailureFromResponse`).
  - El slug de la organización viaja en `x-organization-slug` y, durante la transición, también en `x-organization-id`.
  - `signInWithMagicLink` usa `/api/auth/sign-in/magic-link`, la ruta de Access (antes `magic-link/send`, que no existía allí).

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0

## 0.1.1

### Patch Changes

- Las barras finales de URLs y rutas se quitan en tiempo lineal. La expresión `/\/+$/` era cuadrática con entradas de muchas `/` (CodeQL `js/polynomial-redos`).

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/client`: cliente de navegador same-origin (`createCustomyClient`: sesión, login, MFA, passkeys, organización activa, capabilities con reintentos y `CustomySdkError`, vinculación de cuentas, ticket de realtime) y bindings de UI como subrutas: `./react` (`CustomyProvider`, hooks, puertas y componentes), `./native` y `./native/react`. Rechaza secretos de servidor.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
