# @customyai/sdk

Todo Customy con una sola identidad de app. `createCustomy()` lee el discovery del entorno, guarda los tokens de máquina de la app (uno perezoso y cacheado por audiencia) y compone los paquetes de cada servicio, ya apuntando a su URL: [`@customyai/access`](../access), [`@customyai/data`](../data), [`@customyai/send`](../send), [`@customyai/billing`](../billing) y [`@customyai/links`](../links), Personas del CRM (`people`) y los eventos de tu app conectada (`apps`), más `product(clave)` para cualquier otro producto del discovery. No añade transporte, reintentos ni errores propios: son los de [`@customyai/core`](../core) y cada paquete.

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

## Personas y roles (`customy.people`)

Una persona por tenant en Customy CRM, con roles por contexto y vigencia (usuario de una app, cliente, lead, estudiante, paciente…), identificadores, relaciones, grupos y contactabilidad por propósito. Las entradas se validan con el contrato antes de tocar la red (`SDK_INPUT_INVALID`, con `body.issues`); los errores del CRM llegan como `CustomySdkError` (`status`, `code`, `requestId`). Credencial: token M2M de Access con audiencia `customy-crm` y scopes `crm:people.read crm:people.write` (cambia con `people: { scopes, audience }`; el token se cachea hasta que caduca).

```ts
// Identificar (o crear) a un usuario con el rol app_user de tu app
const { person, created } = await customy.people.identify({
  identifiers: [
    { type: "application_user_id", value: userId, source: "my-app" },
    { type: "email", value: "ana@example.com", verified: true },
  ],
  profile: { displayName: "Ana", locale: "es-CO", country: "CO" },
  roles: [{ roleTypeKey: "app_user", contextKind: "application", contextId: "my-app" }],
});

// Rol propio del tenant (tipo `x_…` creado en Workspace → CRM → Roles)
const role = await customy.people.assignRole(person.id, { roleTypeKey: "x_mentor", contextKind: "program", contextId: "prg_42", stage: "active" });
await customy.people.endRole(person.id, role.id, { endReason: "program_finished" });

// ¿Se le puede escribir? Decisión explicada con base legal y motivos
const decision = await customy.people.contactability(person.id, { purpose: "marketing", channel: "email" });
if (!decision.allowed) console.log(decision.reasons); // ["consent_missing"]

// Listas: iterador sobre todas las páginas, o una sola página
for await (const p of customy.people.list({ role: "app_user", activeWithinDays: 30 })) { /* … */ }
const { items, nextCursor } = await customy.people.list.page({ family: "commercial", limit: 100 });
```

También: `get`, `updateRole`, `linkIdentifier`, `listIdentifiers`, `setState` («no contactar» y estados especiales), `relationships.create/list/end`, `groups.create/list/addMembers`, `roleTypes.list` y `applicationsUsersSummary`. `evaluateContactability`, `ROLE_TYPE_CATALOG`, `RELATIONSHIP_TYPE_CATALOG` y las constantes del modelo se exportan para decidir en tu propio código.

## Eventos de tu app conectada (`customy.apps`)

Una app conectada informa el ciclo de vida de sus usuarios con su propia llave de ingesta; CRM los convierte en Personas con el rol `app_user`. La identidad viaja con base legal de relación de servicio: nunca autoriza marketing.

```ts
const customy = await createCustomy({
  issuer, clientId, clientSecret,
  apps: {
    applicationKey: "my-app",
    ingestKey: process.env.CUSTOMY_EVENTS_INGEST_KEY!,
    organizationId: process.env.CUSTOMY_ORGANIZATION_ID!,
    projectId: process.env.CUSTOMY_PROJECT_ID!,
    environment: "production", // o "staging": elige https://events.customy.ai o https://events.staging.customy.ai
    accessEnvironmentId: process.env.CUSTOMY_ACCESS_ENVIRONMENT_ID!,
  },
});

await customy.apps.userRegistered({ userId, identity: { email: "ana@example.com", emailVerified: true, displayName: "Ana" } });
await customy.apps.activity({ userId, kind: "lesson_completed", resourceId: lessonId });
await customy.apps.identityUpdated({ userId, identity: { phone: "+573001234567" } });
await customy.apps.deleted({ userId, erasure: true });
```

- `userId` es el UUID seudónimo del usuario en tu app (nunca el email); `kind` es `^[a-z][a-z0-9_]{0,63}$`.
- Claves deterministas: el alta es `<app>:user:registered:<userId>`, una actividad con `resourceId` es `<app>:<kind>:<resourceId>:<userId>`, la baja `<app>:user:deleted:<userId>`; el `eventId` es un UUID derivado de la clave. Un reintento, aunque venga de otro proceso, se deduplica.
- 5xx, 408, 429 y fallos de red se reintentan con backoff; 400/401/422 no. `batch([...])` envía varios con concurrencia limitada y devuelve un resultado por evento; `envelopes.*` construye el sobre sin enviarlo (para tu outbox) y `send(sobre)` lo envía.
- Sin credenciales de Access: `createConnectedApp({ ... })` hace lo mismo por separado.

### In English

`customy.people` manages CRM People: `identify` (find-or-create by identifiers, with roles), `get`, `list` (async iterator; `list.page` for one page), `assignRole` / `updateRole` / `endRole`, `linkIdentifier` / `listIdentifiers`, `setState`, `contactability` (explained decision per purpose and channel), `relationships.*`, `groups.*`, `roleTypes.list`, `applicationsUsersSummary`. Inputs are validated against the contract schemas before any request; it uses an Access M2M token for audience `customy-crm` with scopes `crm:people.read crm:people.write` (configurable via `people: { scopes, audience, baseUrl }`). `customy.apps` (or standalone `createConnectedApp`) emits `application.user.registered | activity | identity_updated | deleted` to Customy Events with the app's ingest key, deterministic idempotency keys and event ids, and retries on 5xx/network errors. `evaluateContactability` and the role catalog are exported too.

Sustituye a `@customyai/customy-sdk/server`: `createCustomy({ issuer, clientId, clientSecret })` y `product(clave)` tienen la misma forma; `billing.report(...)` pasa a `billing.usage.report(...)`, y `send`, `links` y `data` son los clientes de los paquetes nuevos (`createSend`, `createLinks`, `createData`).
