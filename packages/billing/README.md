# @customyai/billing

El consumo de una app en Customy Billing con su identidad de Customy Access. Sobre [`@customyai/core`](../core).

```bash
npm install @customyai/billing @customyai/core
```

```ts
import { createBilling } from "@customyai/billing";
import type { CustomyMeter } from "./customy.generated"; // customy apps codegen

const billing = createBilling<CustomyMeter>({ platform, machineTokens });
await billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: `run-${runId}` }]);
```

- **Credencial**: `machineTokens` pide por defecto solo `billing:usage:report` con audiencia `customy-billing`. La organización y la app salen del token.
- **Idempotencia**: cada evento lleva su clave; el lote se puede repetir (y el SDK lo reintenta ante red o `5xx`) sin sumar dos veces.
- **Errores**: `CustomyBillingError` (un `CustomySdkError` con `service: "billing"`); los fallos de validación local salen como `SDK_USAGE_INVALID` sin llamar a la API.
