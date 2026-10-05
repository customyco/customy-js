# @customyai/server

## 0.3.0

### Minor Changes

- Correo verificado sin llamadas a mano. `@customyai/client`: `signUp` y `signInWithEmail` devuelven `verificationRequired: true` cuando Access pide verificar el correo antes de abrir sesión, y el nuevo `sendVerificationEmail(email, opciones?)` reenvía el correo de verificación. `@customyai/server`: el nuevo `fetchUserInfo(token, { issuer })` lee el perfil con el token del usuario (`emailVerified` es `null` si Access no lo informa, nunca se asume verificado) y falla con `ACCESS_UNAVAILABLE` si Access no contesta.

## 0.2.0

### Minor Changes

- - **401 frente a 503**: los verificadores devuelven `null` ante un token inválido y lanzan `CustomySdkError` `ACCESS_UNAVAILABLE` (status 503) cuando Access no puede decidir (JWKS inalcanzable o sin claves pasado `maxStaleMs`, introspección caída, 429 o 5xx). `verifyRequest` y `verifyMachineRequest` lo dejan pasar; `isAccessUnavailable` lo reconoce.
  - Un `iat` en el futuro más allá de `issuedAtSkewSeconds` (60 s por defecto) se rechaza.
  - El JWKS solo cuenta las claves que se importan de verdad: una malformada con `kid` no aparece en `kids` ni se usa, y un JWKS sin ninguna utilizable es `SDK_JWKS_INVALID`.
  - El secreto de la assertion se valida al construir: `createRequestVerifier`, `createActorAssertionVerifier` y `assertActorAssertionSecret` lanzan `SDK_ASSERTION_SECRET_INVALID` al arrancar; `verifyRequest` ya no lanza por petición con un secreto inválido (devuelve `null`).

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/server`: JWKS remoto con rotación (`createRemoteJwks`), verificadores de tokens de máquina (`createMachineTokenVerifier`) y de usuario (`createAccessTokenVerifier`, con introspección opcional), assertion del BFF (`signActorAssertion`, `verifyActorAssertion`) y `verifyRequest` sobre `Request` estándar con adaptador para `IncomingMessage` de Node. Solo servidor: no se exporta a bundles de navegador.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
