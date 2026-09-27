# @customyai/web

Handlers de sesión same-origin de Customy sobre `Request`/`Response` estándar. La app expone `/api/auth/*` en su propio origen y lo reenvía a Customy Access: las cookies de sesión son de host (sin `Domain`), `HttpOnly` y nunca viajan a otro origen. Funciona en node y edge y en cualquier framework cuyas rutas reciban una `Request` y devuelvan una `Response`. **Solo servidor**: la condición `browser` del paquete no exporta nada.

```bash
npm install @customyai/web
```

- `customyAuthProxyHandlers(options)`: proxy de `/api/auth/*` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). Adapta las `Set-Cookie` de Access al host (sin `Domain`, `SameSite=Lax`, `Secure` en https), rechaza peticiones cross-site que cambian estado (CSRF) y rutas fuera de `allowedAuthPaths`. `enforceTenantScope` fija la identidad a la configuración del servidor.
- `customySocialRedirectHandlers`, `customySignOutHandlers`, `customyClearOAuthStateHandlers`, `handleCustomyAuth` (callback de impersonación).
- `getServerSession(request | headers | cookieHeader, options)` y `verifyActionSession`: sesión validada en Access, con las `Set-Cookie` de renovación en `setCookies`.
- `customyMiddleware(options)`: protección de rutas; devuelve `{ action: "next", requestHeaders?, responseHeaders? }` o `{ action: "respond", response }`.
- `createEdgeClient({ publishableKey, authUrl })`: verificación local del JWT de sesión con el JWKS de Access (rotación y caché de `@customyai/server`).
- Nombres de cookie de Access y utilidades de `Cookie`/`Set-Cookie`.

```ts
import { customyAuthProxyHandlers } from "@customyai/web";

// Ruta /api/auth/[...path] de la app
export const { GET, POST, PUT, PATCH, DELETE } = customyAuthProxyHandlers({
  accessUrl: "https://access-api.customy.ai",
  publicOrigin: "https://app.example.com",
  publishableKey: "pk_live_...",
});
```
