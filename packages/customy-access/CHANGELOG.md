# Changelog

## 0.5.0

### Added

- `./server`: `createMachineTokenProvider` caches an Access machine token per
  audience until shortly before it expires and coalesces concurrent requests;
  `discoverPlatform` reads the environment's products and audiences from
  `/.well-known/customy-configuration`. Product SDKs accept the provider as
  their credential, so one app identity works across the ecosystem.

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
