# @customyai/web

## 0.1.1

### Patch Changes

- Las barras finales de URLs y rutas se quitan en tiempo lineal. La expresión `/\/+$/` era cuadrática con entradas de muchas `/` (CodeQL `js/polynomial-redos`).

## 0.1.0

### Minor Changes

- Primera versión de `@customyai/web`: handlers de sesión same-origin sobre `Request`/`Response` estándar (proxy de `/api/auth/*` con protección CSRF y cookies de host, login social, sign-out, limpieza del estado OAuth, callback de impersonación), `getServerSession`/`verifyActionSession` con cookies de renovación, `customyMiddleware` sin atarse a un framework, verificación local del JWT de sesión (`createEdgeClient`) y nombres de cookie de Access. Node y edge; nunca en un bundle de navegador.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.1.0
  - @customyai/server@0.1.0
