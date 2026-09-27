# @customyai/data

## 0.2.0

### Minor Changes

- - `verifySource()` comprueba la fuente antes de enviar (alcance real y gobernanza del contrato).
  - `collectionScope` para fuentes externas con write key (cabeceras `x-customy-collection-*`, que Data compara y nunca usa para conceder alcance). Con un token de Access se ignora con aviso.
  - Las cabeceras de tenant en `headers` (`x-org-id`, `x-environment-id`…) ya no se envían: se ignoran con aviso (`onWarning`) en vez de viajar.
  - `context.library` lleva `{ name: "@customyai/data", version }` con la versión del paquete.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/data` sobre `@customyai/core`: `track` tipado por evento (con los tipos de `customy apps codegen`), `identify`, `page`, `screen`, `group`, `alias`, cola con `flush` por lotes y acuse por evento. El alcance sale de la credencial (write key de la fuente o token de la app con `data:collect`); sin cabeceras ni campos de tenant.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
