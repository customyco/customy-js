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

- **Alcance por credencial**: organización, proyecto, entorno y fuente salen del write key o del token; un evento con campos de tenant se rechaza (`SDK_TENANT_FIELDS_FORBIDDEN`) y no se envían cabeceras de tenant.
- **Entrega**: cada evento lleva `messageId` y Data deduplica, así que los reintentos ante red o `5xx` son seguros; un acuse que no confirma cada evento cuenta como fallo y `flush` devuelve lo no confirmado a la cola, en orden.
- **Privacidad**: `redactFields` y `beforeSend`.
- **Errores**: `CustomyDataError` (un `CustomySdkError` con `service: "data"`); `DATA_EVENT_QUARANTINED` si el evento quedó en cuarentena.
