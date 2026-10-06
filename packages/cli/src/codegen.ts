/**
 * Tipos de una app a partir de su manifiesto `app/v1`: nombres y propiedades
 * de sus eventos, capabilities, planes y meters. Con ellos `track()` o
 * `capabilities.check()` fallan en compilación ante un nombre o una propiedad
 * que el manifiesto no declara.
 */
import type { AppManifest } from "./vendor/app-manifest";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
};

const literal = (value: unknown) => JSON.stringify(value);
const union = (values: readonly string[]) => (values.length ? values.map(literal).join(" | ") : "never");
const key = (name: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : literal(name));

/** Un JSON Schema (subconjunto habitual) como tipo TypeScript; lo desconocido es `unknown`. */
export function schemaToType(schema: JsonSchema | undefined, indent = ""): string {
  if (!schema || typeof schema !== "object") return "unknown";
  if (Array.isArray(schema.enum)) return schema.enum.length ? schema.enum.map(literal).join(" | ") : "never";
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 1) return types.map((type) => schemaToType({ ...schema, type }, indent)).join(" | ");
  switch (types[0]) {
    case "string": return "string";
    case "number": case "integer": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "array": return `Array<${schemaToType(schema.items, indent)}>`;
    case "object": {
      const required = new Set(schema.required ?? []);
      const inner = `${indent}  `;
      const fields = Object.entries(schema.properties ?? {}).map(([name, value]) => `${inner}${key(name)}${required.has(name) ? "" : "?"}: ${schemaToType(value, inner)};`);
      if (schema.additionalProperties !== false && !schema.properties) return "Record<string, unknown>";
      return fields.length ? `{\n${fields.join("\n")}\n${indent}}` : "Record<string, never>";
    }
    default: return "unknown";
  }
}

export function generateAppTypes(manifest: AppManifest): string {
  const roles = manifest.roles ?? [];
  const permissions = (manifest.permissions ?? []).map((permission) => permission.key);
  const events = manifest.events.map((event) => `  ${literal(event.name)}: ${schemaToType(event.properties as JsonSchema, "  ")};`);
  return [
    `// Generado por \`customy apps codegen\` desde customy.app.json (${manifest.key}). No editar a mano.`,
    "",
    `export type CustomyEventName = ${union(manifest.events.map((event) => event.name))};`,
    "",
    "export type CustomyEventProperties = {",
    ...events,
    "};",
    "",
    `export type CustomyCapability = ${union(manifest.capabilities.map((capability) => capability.lookupKey))};`,
    `export type CustomyPlan = ${union(manifest.plans.map((plan) => plan.code))};`,
    `export type CustomyMeter = ${union(manifest.meters.map((meter) => meter.code))};`,
    "",
    "/** Permisos y roles del manifiesto (`permissions[]`, `roles[]`): la app pregunta por permisos y nunca escribe un nombre de rol. */",
    `export type CustomyPermission = ${union(permissions)};`,
    `export type CustomyRole = ${union(roles.map((role) => role.key))};`,
    "",
    "/** Lo que da cada rol, tal como lo declara el manifiesto. */",
    `export const CUSTOMY_ROLE_PERMISSIONS = {\n${roles.map((role) => `  ${literal(role.key)}: ${literal(role.permissions)},`).join("\n")}\n} as const satisfies Record<CustomyRole, readonly CustomyPermission[]>;`,
    "",
    "/** Los tipos de la app juntos: `createCustomy<CustomyAppTypes>()`, `createAccess<CustomyCapability, CustomyRole, CustomyPermission>()`. */",
    "export type CustomyAppTypes = {",
    "  events: CustomyEventProperties;",
    "  meters: CustomyMeter;",
    "  capabilities: CustomyCapability;",
    "  roles: CustomyRole;",
    "  permissions: CustomyPermission;",
    "};",
    "",
    "/** Propósitos de consentimiento que exige cada evento. */",
    `export const CUSTOMY_EVENT_PURPOSES = {\n${manifest.events.map((event) => `  ${literal(event.name)}: ${literal(event.purposes)},`).join("\n")}\n} as const;`,
    "",
  ].join("\n");
}
