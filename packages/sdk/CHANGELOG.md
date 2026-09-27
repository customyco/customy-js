# @customyai/sdk

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/sdk`: `createCustomy({ issuer, clientId, clientSecret })` lee el discovery del entorno, guarda los tokens de máquina de la app (uno perezoso y cacheado por audiencia y scopes) y compone `access`, `data`, `send`, `billing` y `links` desde sus paquetes, más `product(clave)` (el transporte de `@customyai/core` de cualquier producto del discovery) y `token(producto)`. Tipable con lo que genera `customy apps codegen` (`createCustomy<{ events; meters; capabilities }>`). Solo servidor: no se resuelve en un bundle de navegador.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.1.0
  - @customyai/billing@0.1.0
  - @customyai/core@0.1.0
  - @customyai/data@0.1.0
  - @customyai/links@0.1.0
  - @customyai/send@0.1.0
