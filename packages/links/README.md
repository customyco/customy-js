# @customyai/links

Customy Links: enlaces cortos, analítica, conversiones, dominios, webhooks, UTM, etiquetas y grupos. Sobre [`@customyai/core`](../core): reintentos con `Retry-After`, paginación, errores tipados y la identidad de la app en Customy Access.

```bash
npm install @customyai/links @customyai/core
```

```ts
import { createLinks } from "@customyai/links";

const links = createLinks({ platform, machineTokens, scopes: ["links:write"] });
const link = await links.links.create({ destinationUrl: "https://example.com/launch" });
for await (const item of links.links.iterate({ status: "active" })) console.log(item.slug);
await links.track.sale({ externalId: "user_1", amount: 49.9, currency: "USD" });
```

- **Credencial**: `machineTokens` (audiencia `customy-links`; scopes `links:track`, `links:read` o `links:write`) o `accessToken` (llave `cl_live_…`/`cl_test_…`, token o proveedor). `status()` no la necesita.
- **Reintentos**: lecturas y borrados ante red, `429` y `5xx`; un `POST` no se repite solo.
- **Errores**: `CustomyLinksError` (un `CustomySdkError` con `service: "links"`).
- **Webhooks**: `verifyWebhook(rawBody, headers, secret)`.
