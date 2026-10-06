# @customyai/openfeature-provider

## 0.1.10

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.16.0

## 0.1.9

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.15.0

## 0.1.8

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.14.0

## 0.1.7

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.13.0

## 0.1.6

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.12.0

## 0.1.5

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.11.0

## 0.1.4

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.10.0

## 0.1.3

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.9.0

## 0.1.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.8.0

## 0.1.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.7.0

## 0.1.0

### Minor Changes

- Nuevo `@customyai/openfeature-provider`: proveedor de OpenFeature para Customy Experiments, para servidor (`CustomyServerProvider`) y navegador (`@customyai/openfeature-provider/web`, `CustomyWebProvider`). Dos modos: `local` (evalúa la instantánea de Access en proceso con el cliente de `@customyai/access/flags`, con realtime y sondeo) y `remote` (`POST /v1/flags/evaluate`, para lenguajes sin SDK nativo). `reasonCode` del evaluador mapeado a las razones estándar de OpenFeature (`TARGETING_MATCH`, `SPLIT`, `DISABLED`, `DEFAULT`, `ERROR`) con la original en `flagMetadata`; eventos `PROVIDER_CONFIGURATION_CHANGED`, `PROVIDER_STALE`, `PROVIDER_READY` y `PROVIDER_ERROR`; `track()` hacia conversiones y exposición por hook. Probado contra los 3 300 vectores de paridad de flags-eval.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.6.0
