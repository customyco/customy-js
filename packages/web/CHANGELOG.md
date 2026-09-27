# @customyai/web

## 0.2.0

### Minor Changes

- Seguridad y ergonomía de la sesión same-origin:

  - **CSRF más estricto** (proxy, sign-out y limpieza de estado): una mutación sin `Origin` ya no pasa; solo la aceptan `Sec-Fetch-Site: same-origin`/`none` o un `Referer` del origen público. `Origin: null` se rechaza.
  - **`publicOrigin` manda**: si está configurado, es el origen de CSRF, redirecciones y callback social; las cabeceras reenviadas (`x-forwarded-host`…) solo cuentan con `trustProxyHeaders: true`. Detrás de varios proxies ya no se rechazan logins legítimos.
  - **Callback social**: `allowedCallbackPaths` (ruta y subrutas) e `isCallbackAllowed(url)`; un destino fuera de ellos o de otro origen usa `defaultCallbackPath` en vez de `/`. `resolveCallbackUrl` y `callbackPathAllowed` exportados.
  - **Renovación de sesión**: `applySessionCookies(response | headers, session | middlewareResult)` aplica las `Set-Cookie` de renovación (copia la respuesta si sus cabeceras son inmutables). `getServerSession` acepta además cualquier objeto con `get(nombre)` (p. ej. el `headers()` del framework) o un almacén de cookies con `getAll()`.
  - **Sobre de error**: los errores JSON de Access salen como `{ error: { code, message } }`, conservando `code`/`message` planos durante la transición (`normalizeErrors: false` lo apaga); `customyErrorEnvelope` exportado.
  - **Organización**: el slug viaja en `x-organization-slug` y en `x-organization-id`; se lee cualquiera de las dos que traiga la petición.
  - **Enlace mágico**: `POST magic-link/send` (clientes anteriores) se reenvía a `sign-in/magic-link`.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/core@0.2.0
  - @customyai/server@0.2.0

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
