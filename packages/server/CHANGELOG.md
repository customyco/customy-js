# @customyai/server

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/server`: JWKS remoto con rotación (`createRemoteJwks`), verificadores de tokens de máquina (`createMachineTokenVerifier`) y de usuario (`createAccessTokenVerifier`, con introspección opcional), assertion del BFF (`signActorAssertion`, `verifyActorAssertion`) y `verifyRequest` sobre `Request` estándar con adaptador para `IncomingMessage` de Node. Solo servidor: no se exporta a bundles de navegador.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
