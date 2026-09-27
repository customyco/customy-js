# @customyai/cli

La CLI de Customy para apps: valida, tipa y sincroniza el `customy.app.json` de una app (manifiesto `app/v1`: productos y scopes, recursos, eventos con schema y propósitos de consentimiento, capabilities, planes y meters).

```bash
npm install --save-dev @customyai/cli

npx customy apps validate                          # --file customy.app.json
npx customy apps codegen --out src/customy.generated.ts
CUSTOMY_ACCESS_URL=https://access-api.customy.ai CUSTOMY_ACCESS_TOKEN=… \
  npx customy apps sync --workspace-env <envId>    # --reason "…"
```

- **validate**: sale 1 y enseña cada problema con su ruta (`plans.0.capabilities.missing: CAPABILITY_UNDECLARED`).
- **codegen**: escribe los tipos de la app — `CustomyEventName`, `CustomyEventProperties` (de los JSON Schema de sus eventos), `CustomyCapability`, `CustomyPlan`, `CustomyMeter` y los propósitos por evento — para `createCustomy<…>()` de `@customyai/sdk`, `createData<CustomyEventProperties>()` y `createBilling<CustomyMeter>()`.
- **sync**: idempotente. Instala la app en el Workspace si no existe y publica una versión nueva del manifiesto sobre la revisión actual; Access lo lleva a cada producto y la CLI enseña cómo quedó cada uno (sale 1 si alguno falló; repetir `sync` lo repara). Lee `CUSTOMY_ACCESS_URL` y `CUSTOMY_ACCESS_TOKEN` (el de un administrador del Workspace) del entorno, nunca de la línea de comandos, y nunca crea credenciales.

También se puede usar como biblioteca: `validateManifest`, `generateAppTypes`, `syncApp` y `runCli`.
