# Changelog

## 0.3.0

### Added

- `./nextjs`: same-origin auth proxy handlers (`customyAuthProxyHandlers`,
  `customySocialRedirectHandlers`, `customySignOutHandlers`) with fixed tenant
  scope (`enforceTenantScope`, `requireExactEnvironment`, `allowedAuthPaths`).

### Fixed

- The package installs from npm without private dependencies: internal
  helpers are bundled into the build.
- CommonJS consumers resolve `.d.cts` types; `types` conditions come first.
- Source files, tests and internal configuration are no longer published.

### Notes

- `./flags` is not part of the published package until the flags service is
  available.
