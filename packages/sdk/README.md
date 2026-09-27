# @customyai/sdk

Todo Customy con una sola identidad de app. `createCustomy()` lee el discovery del entorno, guarda los tokens de máquina de la app (uno perezoso y cacheado por audiencia) y compone los paquetes de cada servicio, ya apuntando a su URL: [`@customyai/access`](../access), [`@customyai/data`](../data), [`@customyai/send`](../send), [`@customyai/billing`](../billing) y [`@customyai/links`](../links), más `product(clave)` para cualquier otro producto del discovery. No añade transporte, reintentos ni errores propios: son los de [`@customyai/core`](../core) y cada paquete.

```bash
npm install @customyai/sdk
```

```ts
import { createCustomy } from "@customyai/sdk";
import type { CustomyCapability, CustomyEventProperties, CustomyMeter } from "./customy.generated"; // customy apps codegen

const customy = await createCustomy<{ events: CustomyEventProperties; meters: CustomyMeter; capabilities: CustomyCapability }>({
  issuer: process.env.CUSTOMY_ISSUER!,
  clientId: process.env.CUSTOMY_CLIENT_ID!,
  clientSecret: process.env.CUSTOMY_CLIENT_SECRET!,
});

await customy.send.emails.send({ templateId: "welcome", to: "ana@example.com", variables: { name: "Ana" } });
await customy.data.track("lesson.completed", { lessonId: "l1", minutes: 12 }, { userId: "u1" });
await customy.billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: `run-${runId}` }]);
const { allowed } = await customy.access.capabilities.check("reports.export", { userId: "u1", environmentId });
await customy.product("crm").get("/v1/contacts");
```

- **Scopes**: por clave de producto (`scopes: { send: ["send:emails:send"] }`). Con `manifest` (el `customy.app.json` de la app), los scopes de cada producto salen de él (`scopes` manda sobre el manifiesto). Sin nada, los de cada paquete: Access pide en cada método el scope que necesita (`access.users.contact` → `users:contact:read`) y, si la credencial no lo tiene, el error lo nombra (`requiredScope`).
- **Red privada**: `allowPrivateHttp` permite `http://` a hosts privados (nunca públicos); lo recomendado es el nombre público https.
- **Perezoso**: ningún cliente pide token hasta su primera llamada; cada cliente se crea una vez.
- **Discovery**: `platform` evita volver a pedirlo (por ejemplo, entre invocaciones de una función sin estado).
- **Solo servidor**: lleva el secreto de la app; un bundle de navegador no resuelve el paquete (`browser: null`). En el navegador van `@customyai/client` y `@customyai/data` con write key.

Sustituye a `@customyai/customy-sdk/server`: `createCustomy({ issuer, clientId, clientSecret })` y `product(clave)` tienen la misma forma; `billing.report(...)` pasa a `billing.usage.report(...)`, y `send`, `links` y `data` son los clientes de los paquetes nuevos (`createSend`, `createLinks`, `createData`).
