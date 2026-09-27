# @customyai/send-sdk

> **En desuso.** Usa [`@customyai/send`](../sdk-send): `createSend({ accessToken })` para el servidor y `@customyai/send/inbox` (+ `/inbox/react`) en las apps. Este paquete se mantiene un ciclo major como adaptador de esos clientes, con la misma API de 1.x (`CustomySend`, `CustomySendError`, `createInboxClient`, los hooks de React). Avisa una vez por proceso. Único cambio de comportamiento: un `POST` sin `idempotencyKey` lleva una llave generada, así que se reintenta ante un 5xx sin duplicar.

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

## Customy Engage: notificaciones push, bandeja in-app y mensajes in-app

Desde tu servidor (llave `cs_live_…` o token de máquina de Customy Access):

```ts
// Push (APNs, FCM, Web Push) + bandeja, aceptada en milisegundos. La llave de idempotencia permite reintentar sin duplicar.
const n = await send.notifications.send(
  { to: "user_123", title: "Pago recibido", body: "Gracias, Ana", url: "/pagos/42", category: "payments" },
  { idempotencyKey: "payment-42" },
);
await send.notifications.get(n.id);                           // estado + embudo por canal
await send.notifications.stats({ from: "2026-09-01" });        // serie diaria
await send.notifications.conversion(n.id, { subscriber: "user_123", id: "order-9", value: 20 });

await send.push.credentials.putApns({ team_id, key_id, bundle_id, private_key }); // tu .p8
await send.push.credentials.putFcm({ service_account });                          // tu cuenta de servicio
await send.push.devices.register({ subscriber: "user_123", platform: "android", token });

await send.inApp.create({ name: "Novedades", layout: "modal", content: { title: "Nuevo", body: "…" }, trigger_event: "session_start" });

// Token de suscriptor para la app de esa persona (1 h por defecto, 24 h como máximo).
const { token } = await send.inbox.createToken("user_123");

// Push de primer nivel: botones, nivel de interrupción, canal de Android, programación en la zona de cada persona.
await send.notifications.send({
  to: "user_123", title: "Tu factura vence hoy", subtitle: "Internet", category: "payments",
  interruption_level: "time_sensitive", android: { visibility: "private" },
  actions: [{ id: "mark_paid", label: "Marcar pagada", auth_required: true }, { id: "open", label: "Ver", foreground: true }],
  send_at: "2026-10-01T09:00:00", delivery: { timezone: "subscriber", quiet_hours: { start: "22:00", end: "07:00", action: "delay" } },
});
await send.notifications.send({ to: "user_123", type: "background", data: { sync: "bills" } }); // silencioso
await send.notifications.cancel(n.id, { recall: true });      // cancela lo pendiente y retira lo entregado
await send.notifications.categories.put("payments", { name: "Pagos", android_channel_id: "payments", frequency_cap: { per: "day", max: 3 } });
await send.notifications.settings.put({ frequency_caps: [{ per: "day", max: 5 }] });
await send.subscribers.put("user_123", { timezone: "America/Bogota", quiet_hours: { start: "22:00", end: "07:00" } });
await send.subscribers.preferences.put("user_123", { categories: { offers: { push: false } } });
actionCategoryId([{ id: "mark_paid", auth_required: true }, { id: "open", foreground: true }]); // la categoría de iOS que manda Send
```

En la app (navegador o React Native), con `@customyai/send-sdk/inbox`; nunca con la llave:

```ts
import { createInboxClient } from "@customyai/send-sdk/inbox";

const inbox = createInboxClient({
  token: () => fetch("/api/inbox-token").then((r) => r.json()).then((b) => b.token), // tu backend llama a inbox.createToken
});
const off = inbox.subscribe(() => render(inbox.getState()));   // en vivo; si no hay tiempo real, consulta cada 45 s
await inbox.list();                                            // primera página; luego inbox.loadMore()
await inbox.markRead(["ibx_…"]);                                // optimista; se deshace si falla
inbox.track({ type: "opened", notification_id: "ntf_…", channel: "apns" }); // recibos en lote
await inbox.devices.register({ platform: "ios", token: apnsToken });
```

- `list`, `loadMore`, `counts`, `markSeen`/`markRead` (ids o `"all"`), `markUnread`, `archive`.
- `track(events)`: recibos del embudo (`delivered`, `displayed`, `opened`, `clicked`, `dismissed`) en lotes, con ids estables y reintentos; `flush()` al pasar a segundo plano.
- `inApp.eligible()`, `inApp.forTrigger("session_start")`, `inApp.impression/click/dismiss(id)`.
- `opened(notificationId, { action, channel })`: la persona abrió el push o pulsó un botón (`action` = su id).
- `preferences.get()` / `preferences.set({ offers: { push: false } })`: la pantalla de ajustes de temas y canales.
- `subscribe(onChange)`: WebSocket con reconexión y ticket nuevo en cada intento; ignora señales atrasadas; sin tiempo real, sondeo de contadores.
- Sin dependencias de plataforma: `fetch` y `WebSocket` se pueden inyectar.

Hooks sin interfaz (React y React Native), en `@customyai/send-sdk/inbox/react`:

```tsx
import { InboxProvider, useInbox, useInboxCounts, useInAppMessages } from "@customyai/send-sdk/inbox/react";

<InboxProvider client={inbox}><App /></InboxProvider>;

const { items, loadMore, hasMore, markRead, markAllRead } = useInbox();
const { unread, unreadLabel } = useInboxCounts();            // «99+»
const { message, trackInApp } = useInAppMessages({ trigger: "session_start" });
```

Referencia completa: `GET https://send-api.customy.ai/openapi.json`.
