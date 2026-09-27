# @customyai/server

Verificación de identidad de Customy para cualquier servidor, sobre `Request` estándar y con adaptador para el `IncomingMessage` de Node. Es el mismo verificador que usan los productos de Customy. **Solo servidor**: la condición `browser` del paquete no exporta nada, así que importarlo desde un bundle de navegador rompe el build.

```bash
npm install @customyai/server
```

- `createRemoteJwks(uri)`: JWKS en caché con rotación — refresca al caducar la caché y cuando llega un `kid` desconocido (con cooldown), y aguanta una caída breve del issuer con las claves conocidas.
- `createMachineTokenVerifier({ issuer, audience })`: tokens de máquina (`client_credentials` y token exchange con `actor`). Devuelve el principal con el tenant firmado o `null`.
- `createAccessTokenVerifier({ issuer, audience, organizationId, environmentId, requiredScopes, introspection })`: tokens de usuario emitidos para una aplicación; la introspección opcional da revocación inmediata.
- `signActorAssertion` / `verifyActorAssertion`: assertion HMAC de vida corta del BFF a la API, ligada a método, ruta y audiencia; la cookie del navegador nunca sale de la web.
- `verifyRequest(request, { bearer, assertion, requiredScopes })`: exactamente una credencial por petición (Bearer **o** assertion); `verifyIncomingMessage` y `requestFromIncomingMessage` para Node.

```ts
import { createMachineTokenVerifier, verifyRequest } from "@customyai/server";

const bearer = createMachineTokenVerifier({ issuer: process.env.CUSTOMY_ISSUER!, audience: "customy-data" });

export async function handler(request: Request) {
  const auth = await verifyRequest(request, { bearer, requiredScopes: ["data:collect"] });
  if (!auth) return new Response(null, { status: 401 });
  // auth.kind === "bearer": auth.principal.organizationId, environmentId, scopes…
}
```
