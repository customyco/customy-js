# @customyai/flags-eval

Pure feature-flag evaluation engine used by the Customy SDKs: treatments, targeting rules, segments, percentage rollouts with deterministic bucketing and prerequisites. No network, no I/O — give it a flag definition and a context, get a treatment.

```bash
npm install @customyai/flags-eval
```

```ts
import { evaluate } from "@customyai/flags-eval";

const detail = evaluate(flag, { key: "user-123", attributes: { plan: "pro" } });
detail.treatment; // "on"
```

Most apps do not use this package directly: `@customyai/customy-access/flags` loads the published snapshot of an environment, evaluates locally with this engine and reports exposures.

Bucketing is MurmurHash3 (32-bit) over `namespace:key`, so the same key always lands in the same bucket in every runtime.
