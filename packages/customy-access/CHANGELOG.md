# Changelog

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
