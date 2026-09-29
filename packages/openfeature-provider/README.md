# @customyai/openfeature-provider

Proveedor de [OpenFeature](https://openfeature.dev) para Customy Experiments, para servidor (`@openfeature/server-sdk`) y navegador (`@openfeature/web-sdk`). Sobre [`@customyai/access`](../access).

```bash
npm install @customyai/openfeature-provider @openfeature/server-sdk
```

## Servidor

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { CustomyServerProvider } from "@customyai/openfeature-provider";

await OpenFeature.setProviderAndWait(new CustomyServerProvider({
  clientOptions: { accessToken: process.env.CUSTOMY_TOKEN! }, // token de máquina con flags:read
  realtimeUrl: "https://realtime.customy.ai",                 // cambios y kill switch en vivo
}));

const flags = OpenFeature.getClient();
const on = await flags.getBooleanValue("checkout.v2", false, { targetingKey: user.id, plan: "pro" });
flags.track("purchase", { targetingKey: user.id }, { value: 49.9, eventId: order.id });
```

## Navegador

```ts
import { OpenFeature } from "@openfeature/web-sdk";
import { CustomyWebProvider } from "@customyai/openfeature-provider/web";

await OpenFeature.setContext({ targetingKey: visitorId });
await OpenFeature.setProviderAndWait(new CustomyWebProvider({ clientOptions: { publishableKey }, pollIntervalMs: 30_000 }));
```

## Dos modos

| Modo | Cómo evalúa | Para quién |
|---|---|---|
| `local` (por defecto) | La instantánea publicada se evalúa en el proceso con el cliente de `@customyai/access/flags` (ETag/304, firma, realtime). Sin red por evaluación. | Node, navegador. |
| `remote` (`{ mode: "remote", baseUrl, publishableKey \| accessToken }`) | `POST /v1/flags/evaluate` en Customy Experiments, con el mismo motor. Exposiciones y conversiones por `/v1/flags/impressions` y `/conversions`. | Quien no puede evaluar localmente. En web precarga todos los flags del contexto y sirve de esa copia. |

Se puede inyectar un cliente propio (`client`) para compartir la instantánea con el resto de la app.

## Contrato de razones

El proveedor traduce el `reasonCode` del evaluador (el mismo en todos los SDK) al spec de OpenFeature; el original queda en `flagMetadata.reasonCode`.

| `reasonCode` | `reason` OpenFeature |
|---|---|
| `default`, `prerequisite_failed` | `DEFAULT` |
| `rule:<id>`, `segment:<key>` | `TARGETING_MATCH` (`flagMetadata.ruleId`) |
| `rollout` | `SPLIT` (`flagMetadata.bucketBp`, 0..9999) |
| `off`, `killed` | `DISABLED` |
| `error` | `ERROR` + `errorCode` (`FLAG_NOT_FOUND`, `PROVIDER_NOT_READY`, `TARGETING_KEY_MISSING`, `GENERAL`) |

`variant` es la clave del tratamiento. Un valor que no es del tipo pedido da `TYPE_MISMATCH` y el valor por defecto del código. **Nunca lanza ni bloquea**: ante cualquier fallo devuelve el valor por defecto con `reason: ERROR`.

## Eventos

- `PROVIDER_CONFIGURATION_CHANGED` con `flagsChanged` cuando llega una versión nueva (realtime o sondeo).
- `PROVIDER_STALE` si falla refrescar con una instantánea en mano (se sigue sirviendo la última); `PROVIDER_READY` al volver.
- `PROVIDER_ERROR` si la evaluación remota falla (una vez por racha); `PROVIDER_READY` al recuperarse.

## `track()` y exposición

La exposición se registra con un hook `after` cuando el valor se entregó de verdad (una por flag, unidad y hora). `track(nombre, contexto, { value, eventId, flagKey? })` registra una conversión de métrica `nombre` en los flags que esa unidad ha visto (o en `flagKey`/`flagKeys`); `eventId` hace idempotente un reintento.

## Contexto

`targetingKey` es la clave de la unidad (obligatoria: sin ella el evaluador responde `missing_context_key` ⇒ `TARGETING_KEY_MISSING`). El resto son atributos para segmentar; los objetos se aplanan con punto (`account.tier`) y las fechas van en ISO 8601.

## Otros lenguajes

Go, Python, Java, .NET y Ruby usan el proveedor OpenFeature de su lenguaje contra `POST /v1/flags/evaluate` (cuerpo `{ context: { key, attributes }, flagKey? | flags? }`, cabecera `x-publishable-key` o `Authorization: Bearer`).
