# @customyai/access

Customy Access para el servidor de una app: capabilities de sus usuarios, catálogo comercial, usuarios, el contacto acotado de uno y feature flags con evaluación local. Sobre [`@customyai/core`](../core).

```bash
npm install @customyai/access @customyai/core
```

```ts
import { createAccess } from "@customyai/access";
import type { CustomyCapability } from "./customy.generated"; // customy apps codegen

const access = createAccess<CustomyCapability>({ platform, machineTokens });
const { allowed, value } = await access.capabilities.check("ai.coach", { userId });
```

| Export | Contenido |
|---|---|
| `@customyai/access` | `me`, `capabilities.check` / `checkMany`, `catalog`, `users.list` / `iterate` / `get`, `users.contact` |
| `@customyai/access/flags` | `createFlagsClient`: instantánea firmada (ETag/304, CDN opcional), evaluación local, realtime, impresiones y conversiones |
| `@customyai/access/generated` | `createAccessApi().call(operationId, { path, query, body })`: cualquier operación pública, 1:1 con el contrato |

- **Scopes** (`ACCESS_SCOPES`), el mínimo por función: `capabilities:read` (por defecto; `me`, `capabilities.*`), `users:contact:read` (`users.contact`; se pide explícito, ningún comodín lo concede; cada lectura se audita), `users:read` (`users.list`/`iterate`/`get`), `catalog:read` (`catalog.*`: el catálogo del propio entorno, nunca el maestro global de Customy; no abre usuarios ni escrituras), `flags:read` (vista completa de flags en servidor), `app-relationships:read` (`relationships.list`, `permissions.checkMany`), `app-relationships:write` (`relationships.write`) y `app-plans:write` (`plans.set`).
- **Relaciones, permisos y plan de la app** (Access como fuente de verdad de sus roles por recurso): solo con el JWT de máquina de la app (el token opaco da 401 `APPLICATION_TOKEN_REQUIRED`) y solo dentro de su prefijo `<clave>/` (`objectType` siempre `<clave>/…`; `subjectType` `user` o `<clave>/…`; si no, 403 `NAMESPACE_FORBIDDEN`). `relationships.write({ writes, deletes })` aplica hasta 500 en una transacción y es idempotente; `permissions.checkMany(checks)` (hasta 100) concede por `owner`, por `perm:<permiso>` directo o por `role:<rol>` del usuario más `perm:<permiso>` de `<clave>/role:<objectId>#<rol>` sobre ese mismo objeto; `plans.set(userId, planCode | null)` fija el plan del miembro entre los `plans[]` del manifiesto publicado (422 `PLAN_UNKNOWN`), que es el que luego resuelven `me`/`capabilities.*`.
- **Capabilities**: en apps instaladas por manifiesto (`customy.app.json`) deciden los valores del plan (booleano, límite > 0, configuración no nula); si no, los entitlements del entorno.
- **Credencial**: todas las rutas aceptan el token de máquina de la app (`machineTokens`, JWT de `/oauth/token` con audiencia `customy-access`), además de la llave del entorno (`cak_live_…`) y el token opaco de Access. El entorno es el firmado en el token (otro `environmentId` da 403 `ENVIRONMENT_FORBIDDEN`) y cada petición con el JWT se audita (`m2m.token.used`). El scope decide, igual que con la llave: `me`/`capabilities.*` → `capabilities:read`; `users.contact` → `users:contact:read`; `users.list/iterate/get` → `users:read` (o `admin:*`); `catalog` → `catalog:read` (o `admin:*`, que además ve el catálogo maestro global); vista completa de flags → `flags:read`. La llave tiene que declarar esos scopes y la audiencia `customy-access`, y `machineTokens` pedirlos (sin `scopes`, cada método pide el suyo; con `scopes`, solo esos, p. ej. `createAccess({ platform, machineTokens, scopes: ["catalog:read"] })`). Una app instalada por manifiesto (`customy.app.json`) puede declarar para Access exactamente `ACCESS_SCOPES`; `admin:*` y cualquier otra escritura se rechazan.
- **Scopes perezosos**: con `machineTokens` y sin `scopes`, cada método pide la primera vez un token con el scope que necesita (`users.contact` → `users:contact:read`, `catalog.*` → `catalog:read`…), cacheado por conjunto de scopes; la credencial debe tenerlos declarados. Con `scopes`, un único token con esos. Si falta uno, `CustomyAccessError` con `requiredScope` y un mensaje que nombra el método y el scope.
- **Por llamada**: todos los métodos aceptan `signal` y `timeoutMs` (`users.list({ search, signal, timeoutMs })`, `users.contact(id, { timeoutMs: 2_000 })`); `users.iterate` los toma de su segundo argumento.
- **Flags**: con la clave publicable (vista pública, apta para navegador) o, en servidor, un token con `flags:read`.
- **Errores**: `CustomyAccessError` (un `CustomySdkError` con `service: "access"`).

## React y Next.js sin parpadeo (`@customyai/access/flags/react` y `/flags/edge`)

Hooks sobre el cliente de flags: `FlagsProvider`, `useFlag(clave, porDefecto)`, `useFlagDetail`, `useExperiment(clave)` (`variant`, `isControl`, `config`, `track(métrica)`) y `<Experience point="…" variants={{ control: …, wide: … }} />`. Con `react` como peer opcional.

```tsx
// middleware.ts — asigna en el borde, fija la cookie de unidad y pasa las asignaciones al render
const flags = createEdgeFlags({ publishableKey: process.env.NEXT_PUBLIC_CUSTOMY_KEY! });
export async function middleware(request: NextRequest) {
  const edge = await flags.resolve(request, { flags: ["hero.layout"] });
  const response = NextResponse.next({ request: { headers: edge.requestHeaders } });
  return edge.applyTo(response);
}

// app/layout.tsx (servidor) → el cliente recibe `bootstrap`
const bootstrap = decodeBootstrap((await headers()).get(EDGE_BOOTSTRAP_HEADER));
<FlagsProvider client={client} context={{ key: bootstrap?.unitKey ?? "anon" }} bootstrap={bootstrap}>…</FlagsProvider>
```

Sin parpadeo: el primer render del navegador usa exactamente lo que el servidor pintó; el cliente solo lo sustituye al recibir una versión de la instantánea más nueva que la del `bootstrap`. Sin `bootstrap` ni instantánea, los hooks devuelven el valor por defecto del código (`ready: false`). La exposición se registra en el navegador al montar, no en el render del servidor. `createBootstrap(snapshot, contexto)` calcula las asignaciones en cualquier servidor Node (`await client.ready()`). El helper Edge conserva la última instantánea si la red falla, nunca confía en una cabecera de asignaciones que traiga el cliente y omite la cabecera si no cabe (≈ 6 KB).
