# @customyai/cli

La CLI de Customy para apps: valida, tipa y sincroniza el `customy.app.json` de una app, y provisiona usuarios de prueba (manifiesto `app/v1`: productos y scopes, recursos, eventos con schema y propósitos de consentimiento, capabilities, planes y meters; opcionalmente `permissions` y `roles` de la app).

```bash
npm install --save-dev @customyai/cli

npx customy apps validate                          # --file customy.app.json
npx customy apps codegen --out src/customy.generated.ts
CUSTOMY_ACCESS_URL=https://access-api.customy.ai CUSTOMY_ACCESS_TOKEN=… \
  npx customy apps sync --workspace-env <envId>    # --reason "…"
```

- **validate**: sale 1 y enseña cada problema con su ruta (`plans.0.capabilities.missing: CAPABILITY_UNDECLARED`) e imprime cuántos eventos, capabilities, permisos y roles declara.
- **permisos y roles** (opcionales): `permissions: [{ key, description }]` y `roles: [{ key, name, description?, permissions }]`. Las claves van en el espacio de nombres de la app (`<clave>.…`, en minúsculas y sin comodines), todo permiso de un rol debe estar declarado en `permissions[]` y hay topes (128 permisos, 32 roles, 128 permisos por rol). Para que la app asigne esos roles a sus miembros, pide los scopes `app-roles:read` / `app-roles:write` en el producto `customy-access`. Los errores salen como `permissions.0.key: PERMISSION_NAMESPACE_VIOLATION`, `roles.0.permissions.1: PERMISSION_UNDECLARED`.
- **codegen**: escribe los tipos de la app — `CustomyEventName`, `CustomyEventProperties` (de los JSON Schema de sus eventos), `CustomyCapability`, `CustomyPlan`, `CustomyMeter`, `CustomyPermission` y `CustomyRole` (de `permissions[]` y `roles[]`), `CUSTOMY_ROLE_PERMISSIONS` (lo que da cada rol), `CustomyAppTypes` (todos juntos) y los propósitos por evento — para `createCustomy<CustomyAppTypes>()` y `createAccess<CustomyCapability, CustomyRole, CustomyPermission>()` de `@customyai/sdk` (con ellos `permissions.effective`, `appRoles.assignments.assign` y `me()` salen tipados y un nombre de rol mal escrito no compila), `createData<CustomyEventProperties>()` y `createBilling<CustomyMeter>()`.
- **sync**: idempotente. Instala la app en el Workspace si no existe y publica una versión nueva del manifiesto sobre la revisión actual; Access lo lleva a cada producto y la CLI enseña cómo quedó cada uno (sale 1 si alguno falló; repetir `sync` lo repara). Si el manifiesto declara permisos o roles, enseña también cuántos quedaron reconciliados (y los huérfanos). Lee `CUSTOMY_ACCESS_URL` y `CUSTOMY_ACCESS_TOKEN` (el de un administrador del Workspace) del entorno, nunca de la línea de comandos, y nunca crea credenciales.

## Provisioning de usuarios de PRUEBA

Sobre [`@customyai/provisioning`](../sdk-provisioning). Todo comando que habla con el servidor exige `--env staging|production` (no hay entorno por defecto) y envía `Customy-Environment`.

```bash
export CUSTOMY_ACCESS_URL=https://<access-origin>      # o --base-url
export CUSTOMY_CLIENT_ID=… CUSTOMY_CLIENT_SECRET=…     # llave de API de Access de UN entorno (o CUSTOMY_TOKEN)

customy users test create --env staging --count 5 --email-domain qa.example.com --currency USD --country US --locale es-CO --expires-in-days 7 --reason "e2e checkout"
customy users test cleanup --env staging --batch <id> --reason "fin de la corrida"     # o --mine
customy users get <externalKey> --env staging
customy users list --env staging --kind test --batch <id> --all
customy users upsert qa-ana --env staging --email ana@qa.example.com --attr tier=pro --reason "cuenta de QA"   # --password generate por defecto en test
customy users delete <externalKey> --env staging --reason "..."
customy users signin-link <externalKey> --env staging --reason "..."
customy audit list --env staging --subject <externalKey> | audit export --format csv --out audit.csv | audit verify
customy policy get --env staging
customy whoami --env staging
customy login                                           # device flow: aún no disponible (sale 2)
```

- `--json`: un solo documento JSON en stdout y nada más; los diagnósticos van a stderr.
- `--dry-run` (toda escritura): no envía nada; imprime método, ruta, cuerpo y entorno, y sale 0.
- **Producción**: una escritura pide teclear `production` (terminal) o `--yes-i-am-sure production` (sin terminal); si no, sale 4.
- Las contraseñas generadas y los enlaces de acceso se muestran **una sola vez** (stdout y `--json`); nunca se escriben a archivos, a stderr ni a argv (`--password` solo acepta `generate` o `none`).
- Códigos de salida: `0` ok, `1` error de servidor o de uso, `2` no soportado, `3` credenciales o scope, `4` entorno distinto o confirmación rechazada.

También se puede usar como biblioteca: `validateManifest`, `generateAppTypes`, `syncApp` y `runCli`.

## Customy Experiments: flags, segmentos y experimentos

Control de Customy Experiments desde la terminal o un pipeline. El origen sale de `--base-url` o `CUSTOMY_EXPERIMENTS_URL` y la credencial de `CUSTOMY_EXPERIMENTS_TOKEN` (nunca por la línea de comandos); el inquilino y el entorno los decide el servidor por la credencial. Toda escritura exige `--reason` (la auditoría pide el porqué) y admite `--dry-run`, que imprime la petición y no envía nada.

```bash
customy flags list --q checkout --json
customy flags create --file flag.json --reason "alta del flag de checkout"      # el JSON es el cuerpo de POST /v1/experiments/flags
customy flags kill checkout.v2 --environment env_prod --reason "incidente 42"
customy flags archive|restore|delete <key> --reason "..."
customy segments create --file segment.json --reason "segmento Pro"
customy segments members add beta --unit-keys u1,u2,u3 --reason "alta de la beta"
customy experiments create --file experiment.json --reason "hipótesis del hero"
customy experiments start <key> --reason "arranque"
customy experiments conclude <key> --decision ship --reason "ganó la variante B"
```

Códigos de salida: 0 ok, 1 error del servidor o de uso, 3 credencial rechazada (401/403), 4 conflicto o solicitud de cambio pendiente (409/412).
