# @customyai/server

Verificación de identidad de Customy para cualquier servidor, sobre `Request` estándar y con adaptador para el `IncomingMessage` de Node. Es el mismo verificador que usan los productos de Customy. **Solo servidor**: la condición `browser` del paquete no exporta nada, así que importarlo desde un bundle de navegador rompe el build.

```bash
npm install @customyai/server
```

- `createRemoteJwks(uri)`: JWKS en caché con rotación — refresca al caducar la caché y cuando llega un `kid` desconocido (con cooldown), y aguanta una caída breve del issuer con las claves conocidas.
- `createMachineTokenVerifier({ issuer, audience })`: tokens de máquina (`client_credentials` y token exchange con `actor`). Devuelve el principal con el tenant firmado o `null`.
- `createAccessTokenVerifier({ issuer, audience, organizationId, environmentId, requiredScopes, introspection })`: tokens de usuario emitidos para una aplicación; la introspección opcional da revocación inmediata.
- `signActorAssertion` / `verifyActorAssertion`: assertion HMAC de vida corta del BFF a la API, ligada a método, ruta y audiencia; la cookie del navegador nunca sale de la web.
- `verifyRequest(request, { bearer, assertion, requiredScopes })`: exactamente una credencial por petición (Bearer **o** assertion); `verifyIncomingMessage` y `requestFromIncomingMessage` para Node. `createRequestVerifier(options)` comprueba la configuración al arrancar (un secreto de assertion ausente o de menos de 32 bytes lanza `SDK_ASSERTION_SECRET_INVALID` ahí, no en cada petición); `createActorAssertionVerifier` hace lo mismo para la assertion sola.
- **401 frente a 503**: un verificador devuelve `null` si el token no vale (→ 401) y lanza `CustomySdkError` con `code: "ACCESS_UNAVAILABLE"` (`status: 503`) si no puede decidir porque Access no responde: JWKS inalcanzable o sin claves utilizables pasado `maxStaleMs`, o introspección caída, `429` o `5xx`. `verifyRequest` y `verifyMachineRequest` lo dejan pasar; `isAccessUnavailable(error)` lo reconoce.
- **Reloj**: `exp`/`nbf` con `clockToleranceSeconds` (30 s); un `iat` en el futuro más allá de `issuedAtSkewSeconds` (60 s) se rechaza.
- **JWKS**: cada clave se importa al cargar; una malformada no cuenta en `kids` ni se usa, y un JWKS sin ninguna utilizable es `SDK_JWKS_INVALID`.

```ts
import { createMachineTokenVerifier, isAccessUnavailable, verifyRequest } from "@customyai/server";

const bearer = createMachineTokenVerifier({ issuer: process.env.CUSTOMY_ISSUER!, audience: "customy-data" });

export async function handler(request: Request) {
  let auth;
  try {
    auth = await verifyRequest(request, { bearer, requiredScopes: ["data:collect"] });
  } catch (error) {
    if (isAccessUnavailable(error)) return new Response(null, { status: 503, headers: { "retry-after": "5" } });
    throw error;
  }
  if (!auth) return new Response(null, { status: 401 });
  // auth.kind === "bearer": auth.principal.organizationId, environmentId, scopes…
}
```
