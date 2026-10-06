# @customyai/customy-sdk

## 0.5.19

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.25.0
  - @customyai/customy-access@0.9.14

## 0.5.18

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.24.0
  - @customyai/customy-access@0.9.13

## 0.5.17

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.23.0

## 0.5.16

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.22.0
  - @customyai/customy-access@0.9.12

## 0.5.15

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.21.0
  - @customyai/customy-access@0.9.11

## 0.5.14

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.20.0
  - @customyai/customy-access@0.9.10

## 0.5.13

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.19.0
  - @customyai/customy-access@0.9.9

## 0.5.12

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.18.0
  - @customyai/customy-access@0.9.8

## 0.5.11

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.17.0
  - @customyai/customy-access@0.9.7
  - @customyai/links-sdk@0.3.2
  - @customyai/send-sdk@1.6.4

## 0.5.10

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.16.0

## 0.5.9

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.9.6
  - @customyai/sdk@0.15.1

## 0.5.8

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.15.0

## 0.5.7

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.9.5
  - @customyai/sdk@0.14.0

## 0.5.6

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.9.4

## 0.5.5

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.9.3

## 0.5.4

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.13.0
  - @customyai/send-sdk@1.6.3

## 0.5.3

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.12.0

## 0.5.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.11.0

## 0.5.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.9.1
  - @customyai/sdk@0.10.1

## 0.5.0

### Minor Changes

- Contrato del evaluador (D6): `EvaluationDetail` añade `reasonCode` (`default | off | killed | prerequisite_failed | rule:<id> | rollout | segment:<key> | error`) y `bucketBp` (0..9999). `reason` y `bucket` no cambian. Nuevos `createDependencies` (prerrequisitos con ciclo y profundidad máxima), `LEGACY_REASON_ALIASES` y tope de 512 caracteres para `regex`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.9.0
  - @customyai/sdk@0.10.0

## 0.4.10

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.9.0

## 0.4.9

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.8.0

## 0.4.8

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.7.0
  - @customyai/customy-access@0.8.5

## 0.4.7

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.6.0

## 0.4.6

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.5.1
  - @customyai/send-sdk@1.6.2

## 0.4.5

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.5.0
  - @customyai/send-sdk@1.6.1

## 0.4.4

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send-sdk@1.6.0
  - @customyai/sdk@0.4.1

## 0.4.3

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.8.4

## 0.4.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.8.3
  - @customyai/sdk@0.4.0
  - @customyai/links-sdk@0.3.1
  - @customyai/send-sdk@1.5.1

## 0.4.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/send-sdk@1.5.0
  - @customyai/sdk@0.3.0

## 0.4.0

### Minor Changes

- `customy.send` expone lo nuevo de Customy Send in-app v2 (aprobación, prueba, estadísticas, plantillas, kits de marca, tarjetas de contenido, `templates.preview` y `Customy-Version`), heredado de `@customyai/send` y `@customyai/send-sdk`. Solo adiciones: las uniones ampliadas (`InAppLayout`, `InAppStatus`, `ClientEventType`) no cambian nada para quien ya las usa.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/sdk@0.2.0
  - @customyai/send-sdk@1.4.0

## 0.3.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.8.2
  - @customyai/sdk@0.1.1

## 0.3.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/customy-access@0.8.1

## 0.3.0

### Minor Changes

- En desuso: usa `@customyai/sdk`. `./server` toma ahora el discovery y los tokens de máquina de `@customyai/sdk` (y `@customyai/core`) y avisa una vez por proceso (`DeprecationWarning` `CUSTOMY_SDK_DEPRECATED`; `console.warn` fuera de Node); `createCustomy`, `token`, `product`, `send`, `links`, `data` y `billing` conservan su forma y sus mensajes de error (`CUSTOMY_DISCOVERY_FAILED: <estado>`, `CUSTOMY_MACHINE_TOKEN_FAILED: <estado> <motivo>`, con el error de `@customyai/core` en `cause`). `CustomyClient` y los clientes de cartera (`createCustomySdk`) no tienen equivalente en los paquetes nuevos y siguen igual, con el mismo aviso.

### Patch Changes

- `customy.send` recoge lo nuevo de `@customyai/send-sdk` para push: contenido rico, programación, cancelar/retirar, categorías, ajustes y preferencias por persona. Solo añade.
- `customy.send` (en `@customyai/customy-sdk/server`) incluye las notificaciones de Customy Send: enviar con clave de idempotencia, dispositivos y credenciales de push nativo, bandeja e in-app. Solo añade: nada existente cambia.
- Dependencias actualizadas:
  - @customyai/customy-access@0.8.0
  - @customyai/links-sdk@0.3.0
  - @customyai/sdk@0.1.0
  - @customyai/send-sdk@1.3.0

## 0.2.0

- `./server`: `createCustomy({ issuer, clientId, clientSecret })` discovers the
  platform, keeps one machine token per audience and returns ready clients for
  Send, Links, Data and Billing, plus a generic `product(key)`.

## 0.1.0

- Initial portfolio umbrella SDK with isolated clients for every Customy product
  and platform service.
