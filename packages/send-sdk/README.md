# @customyai/send-sdk

Cliente TypeScript de [Customy Send](https://send-api.customy.ai/docs): correo transaccional y masivo por API, con la misma forma que Resend.

```bash
npm install @customyai/send-sdk
```

```ts
import { CustomySend } from "@customyai/send-sdk";

const send = new CustomySend(process.env.CUSTOMY_SEND_API_KEY!); // cs_live_…

const { id } = await send.emails.send({
  from: "Acme <hello@acme.com>",
  to: ["ana@example.com"],
  subject: "Tu pedido va en camino",
  html: "<p>Gracias por tu compra.</p>",
});
```

- Sin dependencias: usa el `fetch` nativo (Node 18+, Deno, Bun, Workers).
- Reintentos automáticos en `429 rate_limit_exceeded`, `5xx` y errores de red; un `POST` sólo se repite si lleva `idempotencyKey`.
- Espacios: `emails`, `domains`, `apiKeys`, `webhooks`, `suppressions`.
- Correo entrante (Inbound): `domains.setReceiving(id, true)` devuelve el MX `INBOUND_MX` a publicar; lo que llegue a `*@tu-dominio` sale por el webhook `email.received` y se lee con `emails.receiving.list()`, `.get(id)`, `.attachment(id, index)` y `.raw(id)`.
- Pools: `domains.create("acme.com", { pool: "ses" })` o `domains.update(id, { pool: "ses" })` saca el dominio por Amazon SES en vez del MTA compartido. No pide DNS extra: SES verifica el mismo TXT DKIM y el dominio queda `pending` hasta que lo haga.
- `verifyWebhook(body, headers, secret)` comprueba la firma (`webhook-id`, `webhook-timestamp`, `webhook-signature`, esquema Svix) de cada entrega.
- Modo de pruebas: una llave creada con `mode: "test"` (`cs_test_…`) acepta correos que no salen; `bounced@`, `complained@` y `delayed@` simulan ese resultado y los webhooks se disparan igual.

Errores: `CustomySendError { status, code, retryAfterMs, body }`.

Referencia completa: `GET https://send-api.customy.ai/openapi.json`.
