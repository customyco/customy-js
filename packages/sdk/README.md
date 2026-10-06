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

### Consentimientos de tu app (`consentUpdated`)

Lo que la persona decide en tu app (la casilla de ofertas del registro, el interruptor del perfil, un banner) va al registro de consentimientos de CRM, el sistema de registro de Customy; la contactabilidad lo refleja al momento. Sin esto, el marketing a tus usuarios queda bloqueado (`consent_missing`).

```ts
await customy.apps.consentUpdated({
  userId,
  consents: [
    {
      purpose: "marketing",            // vocabulario único: marketing, sales, education, event, survey, transactional, notification, security, support
      channel: "email",                // email, push, web_push, whatsapp, sms, voice, in_app; "*" solo para negar o retirar
      status: "granted",               // granted | denied | withdrawn
      capturedAt: "2026-09-29T15:04:05.000Z", // cuándo lo decidió la persona
      textVersion: "offers-2026-09",   // versión del texto mostrado (≤ 64, ASCII visible)
      textHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", // opcional: sha256 hex del texto exacto
      source: "signup",                // signup | profile | banner | import
      legalBasis: "consent",
    },
  ],
});
```

- 1 a 20 decisiones por evento; sin datos personales (solo ids). Un permiso nombra un propósito y un canal; `purpose: "*"` o `channel: "*"` solo valen para `denied`/`withdrawn` (p. ej. «no quiero nada»).
- En el mismo evento, una negativa gana a un permiso; entre eventos manda `capturedAt` y una decisión más reciente nunca se pisa.
- La clave es `<app>:user:consent_updated:<userId>:<huella de las decisiones>`: reenviar el mismo cambio se deduplica.

### In English

`customy.people` manages CRM People: `identify` (find-or-create by identifiers, with roles), `get`, `list` (async iterator; `list.page` for one page), `assignRole` / `updateRole` / `endRole`, `linkIdentifier` / `listIdentifiers`, `setState`, `contactability` (explained decision per purpose and channel), `relationships.*`, `groups.*`, `roleTypes.list`, `applicationsUsersSummary`. Inputs are validated against the contract schemas before any request; it uses an Access M2M token for audience `customy-crm` with scopes `crm:people.read crm:people.write` (configurable via `people: { scopes, audience, baseUrl }`). `customy.apps` (or standalone `createConnectedApp`) emits `application.user.registered | activity | identity_updated | deleted | consent_updated` to Customy Events with the app's ingest key, deterministic idempotency keys and event ids, and retries on 5xx/network errors. `consentUpdated({ userId, consents })` records the app's own communication consents (purpose/channel from Customy's single consent vocabulary, `granted | denied | withdrawn`, `capturedAt`, `textVersion`, optional `textHash`, `source`, `legalBasis: "consent"`) in the CRM consent ledger, which contactability reads immediately. `evaluateContactability` and the role catalog are exported too.

Sustituye a `@customyai/customy-sdk/server`: `createCustomy({ issuer, clientId, clientSecret })` y `product(clave)` tienen la misma forma; `billing.report(...)` pasa a `billing.usage.report(...)`, y `send`, `links` y `data` son los clientes de los paquetes nuevos (`createSend`, `createLinks`, `createData`).

## Roles y permisos sin nombres de rol (`/client/react`, `/native/react`)

El manifiesto de la app declara roles y los permisos que dan; Access los resuelve por usuario en `GET /api/v1/me` (`application.roles` / `application.permissions`). La app pregunta por permisos y nunca escribe una regla de rol:

```tsx
import { useAccessGrants } from "@customyai/sdk/client/react";

const { can, hasRole, isLoading } = useAccessGrants<CustomyRole, CustomyPermission>();
{can("fund:invite") && <InviteButton />}
```

`accessGrantsFrom(meOrGrants)` (`/client`, `/native`) es la misma lógica sin React: `can`, `canAny`, `canAll`, `hasRole`, `hasAnyRole`, `roles`, `permissions`, `plan`. `createCustomyClient().capabilities.getGrants(envId)` lo lee del servidor. En apps nativas el token de usuario no lee `/me`: `useAccessGrants(load)` (`/native/react`) llama a TU API, que usa su token de máquina (`createAccess().me({ userId })` o `permissions.effective`) y devuelve el snapshot o `{ roles, permissions }`. Mientras carga, o ante un fallo, nada está concedido. Mostrar u ocultar no autoriza: el servidor de la app vuelve a decidir en cada petición.

## App conectada en el servidor: una entrada tipada (`createCustomy`)

`createCustomy` ya es la entrada única de una app de servidor: discovery del issuer, tokens de máquina por audiencia y scope, Access, Data, Send, Billing, Links, CRM y permisos. Solo hace falta el issuer y el cliente de máquina; el entorno sale del cliente (`discoverApplication: true`) y los nombres salen del manifiesto (`customy apps codegen`):

```ts
import { createCustomy } from "@customyai/sdk";
import type { CustomyAppTypes } from "./customy.generated"; // npx customy apps codegen

const customy = await createCustomy<CustomyAppTypes>({
  issuer: process.env.CUSTOMY_ISSUER!,
  clientId: process.env.CUSTOMY_CLIENT_ID!,
  clientSecret: process.env.CUSTOMY_CLIENT_SECRET!,
  discoverApplication: true,            // customy.application: organización, entorno, aplicación de Access
});
await customy.permissions.require(userId, "bonu.funds.manage"); // CustomyAccessError 403 PERMISSION_DENIED
const { allowed } = await customy.access.capabilities.check("ai.coach", { userId });
```

`customy.permissions` (también suelto: `createPermissionDirectory(access)` de `@customyai/sdk/access`) es lo que cada app escribía sobre `permissions.effective`: `can`, `canAny`, `canAll`, `hasRole`, `require`, `effective`, `invalidate`. Recuerda 30 s a cada usuario (`permissions: { ttlMs, maxEntries }`), junta las lecturas simultáneas y **falla cerrado**: si Access no responde, rechaza con su error; nunca devuelve `true` por defecto ni cachea el fallo. Decisión de diseño: no se creó un segundo `createConnectedApp` (ese nombre ya es el de los eventos de ciclo de vida de usuarios, `customy.apps`); la fachada es `createCustomy`.

### Descubrimiento por variables de entorno

Una app conectada no escribe ids a mano. `createCustomy` resuelve su entorno así: opción explícita, variable de entorno y, por último, lo que descubre `discoverApplication`.

| Variable | Qué fija | Si falta |
| --- | --- | --- |
| `CUSTOMY_ACCESS_URL` | URL de Access (el issuer); `CUSTOMY_ISSUER` sigue valiendo | `issuer` es obligatorio |
| `CUSTOMY_WORKSPACE_ENVIRONMENT_ID` | entorno de Access (`customy.environmentId`) | el de `customy.application` |
| `CUSTOMY_PROJECT_ID` | proyecto (`customy.projectId`), que piden los eventos de `customy.apps` | Access no lo publica: pásalo en `apps.projectId` |

Con `discoverApplication: true`, `customy.apps` toma `organizationId` y `accessEnvironmentId` del descubrimiento; solo falta `projectId` (variable u opción). Lo que no se pueda resolver se nombra en el error. `env: {}` ignora las variables (tests); `readCustomyEnvironment(env)` es la lectura suelta. Nunca se leen secretos.

### Capabilities con tipo

`customy apps codegen` escribe también `CustomyCapabilityValues` (booleana → `boolean`, medida → `number`, configuración → `unknown`) y lo incluye en `CustomyAppTypes` como `capabilityValues`. `typedCapability<CustomyAppTypes, "ai.coach">(await customy.access.capabilities.check("ai.coach", { userId }))` estrecha `value`; es el mismo objeto, solo cambia el tipo. Sin `capabilityValues`, todo sigue como antes.

## Tests de contrato con roles: `createFakeAccess` (`@customyai/sdk/testing`)

Access en memoria con la forma de `createAccess()` (`me`, `capabilities`, `permissions`, `appRoles`, `plans`, `relationships`), construido desde tu `customy.app.json`: pruebas tu autorización contra los roles y planes del manifiesto, no contra mocks de `fetch` ni nombres de rol escritos a mano.

```ts
import { createFakeAccess } from "@customyai/sdk/testing";
import { createPermissionDirectory } from "@customyai/sdk/access";
import manifest from "../customy.app.json";

const access = createFakeAccess<CustomyCapability, CustomyRole, CustomyPermission>({ manifest });
access.grantRole("usr_1", "bonu.admin");                        // o { expiresAt }, o { source: "workspace" }
await access.plans.set("usr_1", "black");                       // el plan sale del manifiesto
const permissions = createPermissionDirectory(access);           // el mismo código que corre en producción
expect(await permissions.can("usr_1", "bonu.funds.manage")).toBe(true);
access.failNext(new CustomyAccessError({ code: "HTTP_503", status: 503 })); // Access caído: ¿tu app falla cerrado?
```

Sesiones y descubrimiento simulados: `sessions.create(userId, { email, name, activeRole, ttlMs })` devuelve un token y `sessions.get(token)` responde como `get-session` (roles y capabilities vigentes AHORA; `null` si caducó o se revocó; respeta `failNext`); `application()` responde como `discoverApplication` y `environment()` da las tres variables de arriba para `createCustomy({ env })`.

Controles del fake: `grantRole`, `revokeRole`, `setPlan`, `failNext(error)` (una sola llamada), `calls` (cada método llamado, en orden), `reset()`, `permissionsOf(rol)`. Copia del servidor: roles y permisos efectivos contra el manifiesto (una asignación caducada no cuenta; la del Workspace no se pisa), el plan por miembro o el primero del manifiesto, los valores por defecto de las capabilities, la decisión real de `capabilities.check`, el espacio de nombres `<clave>/` de las relaciones y el evaluador `owner` / `perm:<p>` / `role:<K>` de `permissions.checkMany`. No copia autenticación, scopes ni límites, y los códigos de rechazo (`ROLE_NOT_FOUND`, `PLAN_NOT_DECLARED`…) son aproximados: prueba el comportamiento de tu app (rechaza, no concede), no el texto del error. Un `environmentId` distinto del del fake (`environmentId`, por defecto `env_fake`) es `ENVIRONMENT_FORBIDDEN`.

### «¿Por qué puede / no puede?»: `permissions.explain`

`access.permissions.explain(userId, permission)` (y el mismo método en `createFakeAccess`) devuelve `{ allowed, reason, grantedBy, expired, grantableBy }`: `granted`, `expired`, `not_assigned` (el manifiesto lo declara, el usuario no tiene un rol que lo dé) o `not_declared`; con los roles vigentes y quién los asignó, los que caducaron y los que habría que asignarle. Son las mismas dos lecturas de `effective` (scope `app-roles:read`); `explainPermission` es la función pura. No envuelve `createAccessAdmin().commercial.explain`: ese explica derechos comerciales de agencias (otro dominio, otra ruta) y ya está en su cliente.
