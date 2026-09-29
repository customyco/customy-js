# @customy/flags-eval

## 0.2.0

### Minor Changes

- Contrato del evaluador (D6): `EvaluationDetail` añade `reasonCode` (`default | off | killed | prerequisite_failed | rule:<id> | rollout | segment:<key> | error`) y `bucketBp` (0..9999). `reason` y `bucket` no cambian. Nuevos `createDependencies` (prerrequisitos con ciclo y profundidad máxima), `LEGACY_REASON_ALIASES` y tope de 512 caracteres para `regex`.
