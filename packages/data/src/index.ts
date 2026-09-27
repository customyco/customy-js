/**
 * @customyai/data — eventos tipados hacia Customy Data sobre `@customyai/core`:
 * `track`, `identify`, `page`, `screen`, `group` y `alias`, directos o en cola
 * con `flush` por lotes.
 *
 * El alcance sale de la credencial —el write key de la fuente en el navegador,
 * el token de máquina de la app (`data:collect`) en el servidor—, nunca de
 * cabeceras ni de campos del evento.
 *
 * ```ts
 * import type { CustomyEventProperties } from "./customy.generated"; // customy apps codegen
 * import { createData } from "@customyai/data";
 *
 * const data = createData<CustomyEventProperties>({ platform, machineTokens });
 * await data.track("lesson.completed", { lessonId: "l1", minutes: 12 }, { userId: "u1", consent: { analytics: true } });
 * ```
 */
export {
    createData,
    CustomyDataError,
    DATA_AUDIENCE,
    DATA_COLLECT_SCOPE,
    DATA_DEFAULT_BASE_URL,
    type BatchOutcome,
    type CollectionScope,
    type CollectionSourceDescriptor,
    type CustomerDataEvent,
    type CustomerDataEventType,
    type CustomyData,
    type DataOptions,
    type EventIdentity,
    type EventMap,
    type EventOutcome,
    type NormalizedEvent,
} from "./client";
