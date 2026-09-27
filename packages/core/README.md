# @customyai/core

Base común de los SDK de Customy. Sin dependencias y sin APIs propias de un runtime: funciona en Node (20+), runtimes edge y navegador.

```bash
npm install @customyai/core
```

- **Transporte** `createTransport({ baseUrl, accessToken })` sobre el `fetch` estándar: URL segura (https; `http` solo a loopback con `allowLoopbackHttp`, o a un host privado —RFC 1918, `*.internal`, nombre de una etiqueta— con `allowPrivateHttp`, nunca a uno público; lo recomendado es el nombre público https), límite de tiempo por intento, límite de tamaño de la respuesta.
- **Respuestas**: un 2xx se lee como JSON; un cuerpo que no lo es es `SDK_RESPONSE_INVALID` (nunca texto colado como datos). Para texto, `responseType: "text"`.
- **Por llamada**: `signal` y `timeoutMs` (`CallOptions`, `callOptions()`); el plazo por llamada manda sobre el del cliente. `@customyai/access` los acepta en todos sus métodos; `send` (envíos y creaciones) y `billing` (`usage.report`), en sus operaciones de escritura.
- **Errores**: todo fallo es un `CustomySdkError { code, status, service, requestId, retryAfterMs, body }`; `code` es estable y sale del sobre de error de Customy (`{ error: { code, message, requestId } }`) o es un `SDK_*`.
- **Reintentos** ante errores de red, `408`, `425`, `429` y `5xx` transitorios, con backoff exponencial y jitter, respetando `Retry-After` (segundos o fecha). Un `Retry-After` mayor que `maxRetryAfterMs` no se espera: el error sale con `retryAfterMs`.
- **Idempotencia**: `GET`/`PUT`/`DELETE` se reintentan; un `POST`/`PATCH` solo si lleva `idempotencyKey` (propia o `true` para generarla, o `autoIdempotencyKey` en el transporte). La misma clave viaja en todos los intentos.
- **Paginación** por cursor: `for await (const item of paginate(fetchPage))`, `collect(iterable, limit)`.
- **Discovery** del entorno: `discoverPlatform(issuer)` lee `/.well-known/customy-configuration` (issuer, JWKS, token endpoint y, por producto, URL y audiencia) y rechaza endpoints fuera del origen del issuer.
- **Tokens de máquina** (solo servidor: usan el secreto de la app): `createMachineTokenProvider({ issuer, clientId, clientSecret, audience })` pide `client_credentials` la primera vez, cachea hasta poco antes de caducar y agrupa las peticiones concurrentes; `createMachineTokens({ …, platform })` da un proveedor perezoso por audiencia (`forProduct("send")`). Si el servicio responde `401`, el transporte invalida el token y repite una vez.

```ts
import { createMachineTokens, createTransport, discoverPlatform } from "@customyai/core";

const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
const tokens = createMachineTokens({ issuer: platform.issuer, clientId, clientSecret, platform });
const send = createTransport({ baseUrl: platform.products.send!.baseUrl, service: "send", accessToken: tokens.forProduct("send") });

await send.post("/api/emails", message, { idempotencyKey: `welcome-${userId}` });
```
