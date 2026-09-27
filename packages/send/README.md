# @customyai/send

Customy Send para el servidor de una app: correo (con plantillas y variables), dominios, llaves, webhooks, supresiones, notificaciones, push, bandeja in-app y mensajes in-app. Sobre [`@customyai/core`](../core): reintentos con `Retry-After`, idempotencia, errores tipados y la identidad de la app en Customy Access.

```bash
npm install @customyai/send @customyai/core
```

```ts
import { createMachineTokens, discoverPlatform } from "@customyai/core";
import { createSend } from "@customyai/send";

const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
const machineTokens = createMachineTokens({ issuer: platform.issuer, clientId: process.env.CUSTOMY_CLIENT_ID!, clientSecret: process.env.CUSTOMY_CLIENT_SECRET!, platform });
const send = createSend({ platform, machineTokens, scopes: ["send:emails:send"] });

await send.emails.send({ templateId: "welcome", to: "ana@example.com", variables: { name: "Ana" } });
```

- **Credencial**: `machineTokens` (+ `platform`) pide tokens con audiencia `customy-send` y los scopes que indiques (`SEND_SCOPES`); también acepta `accessToken` (una llave `cs_live_…`/`cs_test_…`, un token o un proveedor). Solo servidor.
- **Idempotencia**: `emails.send`, `emails.batch`, `notifications.send` e `inApp.create` generan una `Idempotency-Key` si no pasas la tuya: un reintento ante red o `5xx` nunca manda dos veces. Otros `POST` no se repiten solos.
- **Errores**: `CustomySendError` (un `CustomySdkError` con `service: "send"`); `code` es el de la API (`validation_error`, `daily_quota_exceeded`, `template_variable_missing`…) o `SDK_*`.
- **Webhooks**: `verifyWebhook(rawBody, headers, secret)`.
- **Push P0**: `notifications.cancel(id, { recall })`, `notifications.categories`, `notifications.settings`, `subscribers` (perfil y preferencias) y `actionCategoryId(botones)` (la categoría de iOS que manda Send).

## En la app de cada persona: `@customyai/send/inbox`

Navegador, React Native o escritorio, con un token de suscriptor (`sst_…`) que emite tu backend con `send.inbox.createToken(userId)`; nunca con la credencial de la app. Sin dependencias de plataforma: `fetch` y `WebSocket` se pueden inyectar.

```ts
import { createInboxClient } from "@customyai/send/inbox";

const inbox = createInboxClient({
  token: () => fetch("/api/inbox-token").then((r) => r.json()).then((b) => b.token),
  platform: "web",
});
const off = inbox.subscribe(() => render(inbox.getState()));   // en vivo; sin tiempo real, consulta cada 45 s
await inbox.list();                                            // primera página; luego inbox.loadMore()
await inbox.markRead(["ibx_…"]);                                // optimista; se deshace si falla
inbox.opened("ntf_…", { action: "view", channel: "apns" });     // recibos en lote, con ids estables
```

- `list`, `loadMore`, `counts`, `markSeen`/`markRead` (ids o `"all"`), `markUnread`, `archive`, `track`/`flush`, `opened`.
- `inApp.eligible()`, `inApp.forTrigger("session_start")`, `inApp.impression/click/dismiss(id)`; `preferences.get/set`; `devices.register/unregister`.
- Los errores son el mismo `CustomySendError` del servidor (una sola clase entre subrutas).

Hooks sin interfaz (React y React Native; `react` es dependencia par opcional), en `@customyai/send/inbox/react`:

```tsx
import { InboxProvider, useInbox, useInboxCounts, useInAppMessages } from "@customyai/send/inbox/react";

<InboxProvider client={inbox}><App /></InboxProvider>;
const { items, loadMore, hasMore, markRead, markAllRead } = useInbox();
const { unread, unreadLabel } = useInboxCounts();            // «99+»
const { message, trackInApp } = useInAppMessages({ trigger: "session_start" });
```

Diferencias con `@customyai/send-sdk/inbox`: los códigos de error del SDK son los de `@customyai/core` (`SDK_NETWORK_ERROR` en lugar de `network_error`; `HTTP_<estado>` en lugar de `http_<estado>` cuando la API no da nombre) y `retryAfterMs` es `undefined` —no `null`— si no hay `Retry-After`.
