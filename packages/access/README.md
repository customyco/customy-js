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

- **Scopes** (`ACCESS_SCOPES`), el mínimo por función: `capabilities:read` (por defecto; `me`, `capabilities.*`), `users:contact:read` (`users.contact`; se pide explícito, ningún comodín lo concede; cada lectura se audita), `users:read` (`users.list`/`iterate`/`get`), `catalog:read` (`catalog.*`: el catálogo del propio entorno, nunca el maestro global de Customy; no abre usuarios ni escrituras) y `flags:read` (vista completa de flags en servidor).
- **Capabilities**: en apps instaladas por manifiesto (`customy.app.json`) deciden los valores del plan (booleano, límite > 0, configuración no nula); si no, los entitlements del entorno.
- **Credencial**: todas las rutas aceptan el token de máquina de la app (`machineTokens`, JWT de `/oauth/token` con audiencia `customy-access`), además de la llave del entorno (`cak_live_…`) y el token opaco de Access. El entorno es el firmado en el token (otro `environmentId` da 403 `ENVIRONMENT_FORBIDDEN`) y cada petición con el JWT se audita (`m2m.token.used`). El scope decide, igual que con la llave: `me`/`capabilities.*` → `capabilities:read`; `users.contact` → `users:contact:read`; `users.list/iterate/get` → `users:read` (o `admin:*`); `catalog` → `catalog:read` (o `admin:*`, que además ve el catálogo maestro global); vista completa de flags → `flags:read`. La llave tiene que declarar esos scopes y la audiencia `customy-access`, y `machineTokens` pedirlos (por defecto solo pide `capabilities:read`; p. ej. `createAccess({ platform, machineTokens, scopes: ["catalog:read"] })`). Una app instalada por manifiesto (`customy.app.json`) puede declarar para Access exactamente `ACCESS_SCOPES`; `admin:*` y cualquier escritura se rechazan.
- **Flags**: con la clave publicable (vista pública, apta para navegador) o, en servidor, un token con `flags:read`.
- **Errores**: `CustomyAccessError` (un `CustomySdkError` con `service: "access"`).
