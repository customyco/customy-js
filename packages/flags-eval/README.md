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

## Evaluation contract

`evaluate()` returns an `EvaluationDetail`:

| Field | Meaning |
|---|---|
| `treatment`, `value`, `config` | Served treatment, its value and its optional per-treatment `config` (also on rollouts and on the default). |
| `reasonCode` | Contract reason: `default`, `off` (archived), `killed`, `prerequisite_failed`, `rule:<id>`, `segment:<key>` (a rule whose condition is a bare segment), `rollout`, `error`. |
| `reason` | Legacy spelling, unchanged for existing consumers: `default`, `killed`, `archived`, `prerequisite_failed`, `rule_match`, `rollout`, `error`. See `LEGACY_REASON_ALIASES`. |
| `bucketBp` | Stable bucket 0..9999 = `floor(murmur3_32("<flagKey>:<salt>:<contextKey>") / 2^32 * 10000)`. `bucket` (0..99) is `floor(bucketBp / 100)`. |

Rules: the salt is `rollout.salt ?? flag.salt ?? ""`; raising a rollout percentage never moves a unit already inside it; changing the salt reshuffles everyone. `regex` patterns longer than 512 characters or invalid evaluate to `error` (default treatment). A missing numeric attribute never satisfies `gt/gte/lt/lte`. `createDependencies()` resolves prerequisites over a whole snapshot; a cycle, an unknown flag or a chain deeper than 10 counts as not met (`prerequisite_failed`). The shared parity vectors live in `packages/customy-access-php/tests/fixtures/flags-parity.json` and every SDK must reproduce them.
