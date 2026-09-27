# @customyai/customy-sdk

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
