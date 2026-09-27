# @customyai/web

Handlers de sesión same-origin de Customy sobre `Request`/`Response` estándar. La app expone `/api/auth/*` en su propio origen y lo reenvía a Customy Access: las cookies de sesión son de host (sin `Domain`), `HttpOnly` y nunca viajan a otro origen. Funciona en node y edge y en cualquier framework cuyas rutas reciban una `Request` y devuelvan una `Response`. **Solo servidor**: la condición `browser` del paquete no exporta nada.

```bash
npm install @customyai/web
```

- `customyAuthProxyHandlers(options)`: proxy de `/api/auth/*` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). Adapta las `Set-Cookie` de Access al host (sin `Domain`, `SameSite=Lax`, `Secure` en https), rechaza peticiones cross-site que cambian estado (CSRF) y rutas fuera de `allowedAuthPaths`. `enforceTenantScope` fija la identidad a la configuración del servidor. Los errores de Access salen con el sobre `{ error: { code, message } }` (más `code`/`message` planos durante la transición; `normalizeErrors: false` lo apaga).
- `customySocialRedirectHandlers`, `customySignOutHandlers`, `customyClearOAuthStateHandlers`, `handleCustomyAuth` (callback de impersonación).
- `getServerSession(source, options)` y `verifyActionSession`: sesión validada en Access. `source` es la `Request`, unas cabeceras (`Headers` o el `headers()` del framework: cualquier objeto con `get`), un almacén de cookies con `getAll()` o la cabecera `Cookie`. Las `Set-Cookie` de renovación vienen en `setCookies`: **aplícalas** con `applySessionCookies(response, session)`.
- `customyMiddleware(options)`: protección de rutas; devuelve `{ action: "next", requestHeaders?, responseHeaders? }` o `{ action: "respond", response }`. La renovación viaja en `responseHeaders`; `applySessionCookies(response, result)` también la acepta.

### Seguridad por defecto

- **Origen público**: configura `publicOrigin`. Si está, manda él para CSRF, redirecciones y el callback social; las cabeceras reenviadas (`x-forwarded-host`…) solo cuentan con `trustProxyHeaders: true`. Detrás de varios proxies el último salto puede dar un host interno y, sin `publicOrigin`, se rechazarían logins legítimos.
- **CSRF** (proxy, sign-out y limpieza de estado): una mutación sin `Origin` solo pasa si `Sec-Fetch-Site` es `same-origin`/`none` o `Referer` es del origen público; con `Origin`, debe ser exactamente el público; `Sec-Fetch-Site: cross-site` nunca. Un cliente de servidor que llame al proxy debe mandar `Origin`. `csrfProtection: false` lo apaga (no recomendado).
- **Destino tras el login social**: el `?callbackURL=` solo se usa si resuelve al origen público y pasa `allowedCallbackPaths` (ruta exacta y sus subrutas) e `isCallbackAllowed(url)`; si no, `defaultCallbackPath` (o `/`).
- **Organización**: el slug viaja en `x-organization-slug` y en la heredada `x-organization-id`; se lee cualquiera de las dos.

```ts
import { applySessionCookies, getServerSession } from "@customyai/web";

export async function GET(request: Request) {
  const session = await getServerSession(request, { accessUrl, publicOrigin, environmentId, publishableKey });
  return applySessionCookies(Response.json({ user: session?.user ?? null }), session);
}
```

### Migrar desde `@customyai/customy-access/nextjs`

| Antes | Ahora |
|---|---|
| `getServerSession(options)` leía `cookies()` | `getServerSession(await headers(), options)` (o la `Request`, o `await cookies()`); en un Route Handler o Server Action, `applySessionCookies(response, session)` para renovar. El adaptador `customy-access/nextjs` sigue aplicándolas solo con `cookies().set` donde se puede. |
| middleware que devolvía `NextResponse` | `result.action === "respond"` → `result.response`; si no, sigue y copia `result.responseHeaders` (las `Set-Cookie` de renovación) a tu respuesta. |
| URL de Access y origen desde variables de entorno | `accessUrl` y `publicOrigin` explícitos (el SDK no adivina hosts). |
| sin CSRF fuera del ámbito fijo | CSRF activo; los formularios propios deben mandar `Origin` (los navegadores lo hacen). |
| `callbackURL` social de la query sin lista | `allowedCallbackPaths` / `isCallbackAllowed` y `defaultCallbackPath`. |
| errores de Access en su formato | `{ error: { code, message } }` (+ `code`/`message` planos). |
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
