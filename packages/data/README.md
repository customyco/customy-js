# @customyai/data

Eventos tipados hacia Customy Data: `track`, `identify`, `page`, `screen`, `group` y `alias`, directos o en cola con `flush` por lotes. Sobre [`@customyai/core`](../core). Funciona en servidor, edge y navegador.

```bash
npm install @customyai/data @customyai/core
```

```ts
import { createData } from "@customyai/data";
import type { CustomyEventProperties } from "./customy.generated"; // customy apps codegen

// Servidor: la identidad de la app (scope data:collect).
const data = createData<CustomyEventProperties>({ platform, machineTokens });
await data.track("lesson.completed", { lessonId: "l1", minutes: 12 }, { userId: "u1", consent: { analytics: true } });

// Navegador: el write key de la fuente.
const browser = createData<CustomyEventProperties>({ writeKey: "…" });
browser.enqueueTrack("lesson.completed", { lessonId: "l1", minutes: 12 }, { anonymousId });
await browser.flush();
```

- **Alcance por credencial**: organización, proyecto, entorno y fuente salen del write key o del token; un evento con campos de tenant se rechaza (`SDK_TENANT_FIELDS_FORBIDDEN`). Cabeceras de tenant en `headers` (`x-org-id`, `x-environment-id`…) no se envían: se ignoran con aviso (`onWarning`, por defecto `console.warn`).
- **Fuente externa con write key**: `collectionScope: { sourceId, organizationId, projectId, environmentId, applicationId }` viaja en `x-customy-collection-*`; Data lo compara con la fuente y rechaza con `DATA_COLLECTION_SCOPE_MISMATCH` si no coincide (nunca concede alcance). Una fuente dedicada a una app externa lo exige. Con un token de Access va firmado en el token y `collectionScope` se ignora con aviso.
- **`verifySource()`**: `GET /v1/collect/source` antes de enviar: alcance real de la fuente y gobernanza del contrato.
- **Biblioteca**: cada evento lleva `context.library = { name: "@customyai/data", version }` con la versión del paquete.
- **Entrega**: cada evento lleva `messageId` y Data deduplica, así que los reintentos ante red o `5xx` son seguros; un acuse que no confirma cada evento cuenta como fallo y `flush` devuelve lo no confirmado a la cola, en orden.
- **Privacidad**: `redactFields` y `beforeSend`.
- **Errores**: `CustomyDataError` (un `CustomySdkError` con `service: "data"`); `DATA_EVENT_QUARANTINED` si el evento quedó en cuarentena.
