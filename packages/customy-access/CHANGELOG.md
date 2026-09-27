# Changelog

## 0.8.3

### Patch Changes

- - `./nextjs` `getServerSession` vuelve a aplicar sola la renovación de sesión de Access con `cookies().set` donde se puede (Route Handlers y Server Actions).
  - `./server` conserva la semántica de 0.x: con Access sin responder, el verificador sigue devolviendo `null`.
- Dependencias actualizadas:
  - @customyai/access@0.2.0
  - @customyai/client@0.2.0
  - @customyai/core@0.2.0
  - @customyai/server@0.2.0
  - @customyai/web@0.2.0

## 0.8.2

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.1.1

## 0.8.1

### Patch Changes

- Dependencias actualizadas:
  - @customyai/web@0.1.1
  - @customyai/client@0.1.1

## 0.8.0

### Minor Changes

- En desuso: usa los paquetes nuevos de la plataforma. Cada subpath es ahora un adaptador y avisa una vez por proceso (`DeprecationWarning` `CUSTOMY_SDK_DEPRECATED`; `console.warn` fuera de Node):

  - `./react` reexporta `@customyai/client/react`; `CustomyProvider` (con `adminSecret`) y `useSDK()` siguen dando el cliente de administración `CustomyAccess`.
  - `./native` y `./native/react` reexportan `@customyai/client/native` (misma API).
  - `./nextjs` resuelve la configuración como en 0.x (URL de Access, origen público y ámbito desde las variables de entorno), llama a los handlers de `@customyai/web` y devuelve `NextResponse`.
  - `./server` usa `@customyai/server` (verificación) y `@customyai/core` (tokens de máquina y discovery) con los mensajes `CUSTOMY_*` de siempre.
  - `./edge` y `./cookies` son los de `@customyai/web` (`./cookies` ya no entra en un bundle de navegador).
  - `./flags` delega en `@customyai/access/flags`, con `bearerToken`, cabeceras de ámbito y rutas propias de 0.x.
  - La raíz reexporta los tipos y ayudantes de capacidades de `@customyai/client`; `CustomyAccess`, `createAccessClient` y `./generated` no tienen equivalente y quedan congelados.

  Los cambios que marca el informe de API no rompen: `SocialSignInOptions` pasa a ser alias de `ScopedAuthOptions` (mismos campos), `fetchRealtimeTicket` gana un parámetro opcional, `SignInResult` un campo opcional, y `CustomyFlagsClient` solo cambia miembros privados.

### Patch Changes

- Dependencias actualizadas:
  - @customyai/access@0.1.0
  - @customyai/client@0.1.0
  - @customyai/core@0.1.0
  - @customyai/server@0.1.0
  - @customyai/web@0.1.0

## 0.7.1

### Fixed

- The published package now exposes `./native` and `./native/react` (0.7.0 shipped their
  sources but not the entry points).

## 0.7.0

### Added

- `./native`: `createCustomyNativeAuth` — Customy Access for iOS/Android apps (React
  Native, Expo) following OAuth 2.1 for native apps (RFC 8252). The app gives only its
  publishable key and the Access URL; organization, environment, providers and its
  registered native client are discovered from `/api/public/auth-config`. Email/password
  sign-in and sign-up, social providers (Google…) in the system browser with PKCE S256
  (hosted by Access, optionally through the app's web origin so provider callbacks are
  reused), rotating refresh tokens kept in the device's secure storage (the Access session
  never stays on the device), silent renewal (`getAccessToken`), revocation on `signOut`
  (RFC 7009). Storage, browser and crypto are injected adapters: no platform imports.
- `./native/react`: `CustomyNativeAuthProvider` and `useCustomyNativeAuth` (status, user,
  discovered providers, actions).
- Flags: `trackConversion(flagKey, context, { value, metric, id })` attributes a
  conversion to the treatment the flag serves that key, so Customy Analytics
  measures each flag as an experiment per treatment. Retries keep their `id`
  and count once.
- Flags: `verifySignature: true` requires each snapshot to be signed by the Access
  issuer (RS256, checked against `/oauth/jwks.json`) and its content to match
  the signed SHA-256; a snapshot that fails is rejected and the previous one
  stays in use, so a CDN or cache in between cannot alter flags.
- Flags: `cdn: true` (with `publishableKey`) reads the public snapshot from the CDN:
  `latest.json` for polling (5 s at the edge) and the immutable URL of each
  version announced over realtime, so a kill switch never waits on a cache.
  A cached response older than the current version is ignored.

Requires Access with native apps (`/api/auth/native/*`, `refresh_token` grant for public
clients, `/oauth/revoke`).

## 0.6.0

### Added

- `./flags`: `CustomyFlagsClient` loads the published flag snapshot of an
  environment (publishable key → public view; machine token with `flags:read`
  → full view, `ETag`/304) and evaluates locally with `@customyai/flags-eval`.
  `subscribe({ realtimeUrl })` applies new versions (including the kill
  switch) as soon as they are published, reconnecting on its own;
  `startPolling()` is the fallback. Impressions are deduplicated per flag, key,
  treatment and hour before they are sent.

## 0.5.1

Never published: the `0.5.0` tag points at the 0.4.0 sources. These changes ship in 0.6.0.

### Added

- `./server`: `createMachineTokenProvider` caches an Access machine token per
  audience until shortly before it expires and coalesces concurrent requests;
  `discoverPlatform` reads the environment's products and audiences from
  `/.well-known/customy-configuration`. Product SDKs accept the provider as
  their credential, so one app identity works across the ecosystem.
- `AccessMeSnapshot.application`: plan and capabilities of an app installed
  from an `app/v1` manifest.

## 0.4.0

### Added

- `./server`: `createMachineTokenVerifier` and `verifyMachineRequest` verify
  Access machine tokens (RS256 JWT, `client_credentials`) against the issuer's
  JWKS for one product audience, returning the tenant from signed claims.
- `m2m.getMachineToken`: requests a signed machine token from the standard
  OIDC token endpoint; the audience is required.
- `m2m.exchangeToken` (RFC 8693): a product exchanges an app's token it
  received for one scoped to another product, on the app's behalf. The
  verifier accepts these delegated tokens and exposes the acting product as
  `principal.actor`.

### Fixed

- Session cookies are read under either naming generation, so sign-in keeps
  working while an identity server and its apps roll out at different times.
- `m2m.createApiKey`, `listApiKeys`, `revokeApiKey` and `introspect` call the
  routes the server exposes; `introspect` returns `{ active }`.

## 0.3.0

### Breaking

- Access session cookies use Customy names:
  `[__Secure-]customy-<stg|prd|dev>[-<env8>].<session_token|state|...>`.
  Deploy this version together with an Access release that issues them.
- Node.js 20 or later is required (Web Crypto `randomUUID`).
- The typed client under `./generated` only contains public operations;
  service-to-service routes are no longer included.

### Added

- `./cookies`: single source of Access cookie names (`accessCookiePrefix`,
  `accessCookieNames`, `parseAccessCookieName`, `isAccessSessionCookieName`).
- `./nextjs`: same-origin auth proxy handlers (`customyAuthProxyHandlers`,
  `customySocialRedirectHandlers`, `customySignOutHandlers`) with fixed tenant
  scope (`enforceTenantScope`, `requireExactEnvironment`, `allowedAuthPaths`).

### Fixed

- The package installs from npm without private dependencies.
- Idempotency keys are random UUIDs instead of sequential identifiers.
- CommonJS consumers resolve `.d.cts` types; `types` conditions come first.
- Source files, tests and internal configuration are no longer published.

### Notes

- `./flags` is not part of the published package until the flags service is
  available.
