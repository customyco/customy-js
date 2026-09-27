# @customyai/client

Cliente de navegador de Customy: sesión, login (email, social, magic link, passkeys, MFA), organización activa, capabilities y vinculación de cuentas. Todo va contra `/api/auth/*` y `/api/*` del **mismo origen** —la app los reenvía a Customy Access con `@customyai/web`— con cookies `HttpOnly`: el cliente nunca lee cookies ni guarda tokens, y rechaza secretos de servidor.

```bash
npm install @customyai/client
```

- `.`: `createCustomyClient({ publishableKey, environmentId })` — `getSession()` (`signedIn` · `signedOut` · `unknown`: un fallo transitorio nunca cierra la sesión), `signInWithEmail`, `signUp`, `socialSignInUrl`, `signOut`, `capabilities.*`, `accountLinking.*`, `realtimeTicket()`.
- **Errores de login**: `signInWithEmail`, `signUp`, `signInWithMagicLink`, `verifyMFA`… devuelven `{ error, status, code, retryable }`: `error` es el texto de siempre; `status` 401/403 son credenciales o cuenta, `429`/`5xx`/`502` servicio caído (`retryable: true`), `408`/`SDK_TIMEOUT` plazo y `0`/`SDK_NETWORK_ERROR` sin red; `code` es el del sobre de Access (`INVALID_EMAIL_OR_PASSWORD`…) o `HTTP_<estado>`. Lee `{ error: { code, message } }` y el formato plano.
- **Organización**: el slug de `organizationSlug` viaja en `x-organization-slug` y, durante la transición, también en `x-organization-id`.
- **Enlace mágico**: `signInWithMagicLink` usa `/api/auth/sign-in/magic-link` (la ruta de Access); `@customyai/web` sigue aceptando la vieja `magic-link/send`.
- `./react`: `CustomyProvider`, `useAuth`, `useSession`, `useUser`, `useOrganization`, hooks y puertas de capabilities, formularios y componentes de cuenta.
- `./native`: login para apps nativas (OAuth 2.1 con PKCE, navegador del sistema, refresh token en el almacenamiento seguro del dispositivo); almacenamiento, navegador y cripto son adaptadores de la app.
- `./native/react`: `CustomyNativeAuthProvider` y `useCustomyNativeAuth`.

```tsx
import { CustomyProvider, useAuth } from "@customyai/client/react";

export function App({ children }: { children: React.ReactNode }) {
  return <CustomyProvider publishableKey="pk_live_...">{children}</CustomyProvider>;
}
```
