/**
 * Manifiesto de aplicación `app/v1` — el `customy.app.json` que versiona cada
 * app del ecosistema (ADR CUSTOMY_SDK_PLATFORM_DECISION_2026-09-24, D3).
 *
 * Declara qué productos usa la app y con qué scopes, qué recursos enlaza
 * (validados contra el `product/v1` de cada producto), qué eventos emite con su
 * schema y propósito de consentimiento, y sus capabilities, planes y meters.
 * `customy apps sync` lo reconcilia; ningún servicio de Customy conoce apps por nombre.
 */
import { z } from "zod";
import { EntitlementMeterAggregationSchema } from "./meter-aggregation.js";
import {
  CONNECTABLE_PRODUCT_MANIFESTS, ConnectedBindingKindSchema, ConnectedOperationSchema, connectedResourceLimit,
  connectedResourceViolation, type ProductManifest,
} from "./product-manifest.js";

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/);
const productKey = z.string().regex(/^customy-[a-z][a-z0-9-]*$/);
const httpsOrigin = z.string().url().max(512).refine((value) => {
  const url = new URL(value);
  return url.origin === value && (url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname));
}, "Origins must be bare https origins");
const eventName = z.string().regex(/^[a-z][a-z0-9_.:-]{0,199}$/);
const lookupKey = z.string().regex(/^[a-z][a-z0-9_.:-]{0,79}$/);

export const AppProductUseSchema = z.object({
  product: productKey,
  /** Scopes de producto que pedirán sus credenciales de máquina (`<producto>:<scope>`). */
  scopes: z.array(z.string().regex(/^[a-z][a-z0-9_-]*:[a-z0-9_:.-]+$/)).max(64).default([]),
}).strict();

export const AppResourceSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  product: productKey,
  bindingKind: ConnectedBindingKindSchema.optional(),
  operations: z.array(ConnectedOperationSchema).min(1).max(2).optional(),
}).strict();

export const AppEventSchema = z.object({
  name: eventName,
  type: z.enum(["track", "identify", "group", "page", "screen", "alias"]),
  schemaVersion: z.number().int().positive(),
  /** JSON Schema de `properties`; se publica como schema fijado del evento. */
  properties: z.record(z.unknown()).default({ type: "object" }),
  purposes: z.array(z.string().regex(/^[a-z][a-z0-9_.:-]{0,79}$/)).min(1).max(8),
}).strict();

export const AppCapabilitySchema = z.object({
  lookupKey,
  name: z.string().min(1).max(120),
  type: z.enum(["boolean", "metered", "config"]),
  meter: lookupKey.optional(),
}).strict();

export const AppPlanSchema = z.object({
  code: lookupKey,
  name: z.string().min(1).max(120),
  rank: z.number().int().nonnegative().default(100),
  capabilities: z.record(lookupKey, z.unknown()).default({}),
}).strict();

export const AppMeterSchema = z.object({
  code: lookupKey,
  aggregation: EntitlementMeterAggregationSchema,
  unit: z.string().min(1).max(40),
}).strict();

export const AppManifestSchema = z.object({
  /** Referencia opcional al JSON Schema publicado, para autocompletado en editores. */
  $schema: z.string().url().max(200).optional(),
  schema: z.literal("app/v1"),
  key: slug,
  name: z.string().trim().min(1).max(80),
  origins: z.object({ staging: httpsOrigin.optional(), production: httpsOrigin.optional() }).strict()
    .refine((origins) => Boolean(origins.staging || origins.production), "Declare at least one origin"),
  products: z.array(AppProductUseSchema).max(32).default([]),
  resources: z.array(AppResourceSchema).max(64).default([]),
  events: z.array(AppEventSchema).max(256).default([]),
  capabilities: z.array(AppCapabilitySchema).max(256).default([]),
  plans: z.array(AppPlanSchema).max(32).default([]),
  meters: z.array(AppMeterSchema).max(64).default([]),
}).strict();
export type AppManifest = z.infer<typeof AppManifestSchema>;

/**
 * Scopes de Access que una app puede declarar para `customy-access`. Lista
 * blanca cerrada de LECTURAS acotadas al entorno de la propia app: Access no
 * expone su prefijo (`access:`) a las apps.
 *  - `capabilities:read`: el plan de sus usuarios (`GET /api/v1/me`).
 *  - `users:contact:read`: el contacto de UN usuario al enviarle
 *    (`GET /api/v1/users/:userId/contact`).
 *  - `users:read`: lista y detalle de sus usuarios y miembros (solo GET).
 *  - `flags:read`: la instantánea completa de flags del entorno (runtime).
 *  - `catalog:read` (2026-09-27): el catálogo comercial de su entorno —nunca el
 *    maestro global de Customy— (`GET …/catalog` y `…/catalog/:entity`).
 * Cualquier otro scope (`admin:*`, `*`, escrituras, comodines) es
 * `SCOPE_OUTSIDE_PRODUCT`: una app nunca obtiene administración de Access.
 */
export const APP_ACCESS_SCOPES = ["capabilities:read", "users:contact:read", "users:read", "flags:read", "catalog:read"] as const;
export type AppAccessScope = (typeof APP_ACCESS_SCOPES)[number];
const APP_ACCESS_SCOPE_SET: ReadonlySet<string> = new Set(APP_ACCESS_SCOPES);

/** Si un producto del manifiesto puede pedir ese scope para sus credenciales de máquina. */
export function appScopeAllowed(product: string, scope: string): boolean {
  if (product === "customy-access") return APP_ACCESS_SCOPE_SET.has(scope);
  return scope.startsWith(`${product.replace(/^customy-/, "")}:`);
}

/**
 * Valida un manifiesto de app completo, incluidas las reglas entre secciones
 * y contra los `product/v1` de los productos que usa. Devuelve los problemas
 * como códigos estables con su ruta; lista vacía si es válido.
 */
export function appManifestProblems(input: unknown, manifests: readonly ProductManifest[] = CONNECTABLE_PRODUCT_MANIFESTS): Array<{ path: string; code: string }> {
  const parsed = AppManifestSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: "SCHEMA_INVALID" }));
  const app = parsed.data;
  const problems: Array<{ path: string; code: string }> = [];
  const unique = <T>(items: T[], key: (item: T) => string, path: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => { const k = key(item); if (seen.has(k)) problems.push({ path: `${path}.${index}`, code: "DUPLICATE" }); seen.add(k); });
  };
  unique(app.products, (p) => p.product, "products");
  unique(app.resources, (r) => r.key, "resources");
  unique(app.events, (e) => e.name, "events");
  unique(app.capabilities, (c) => c.lookupKey, "capabilities");
  unique(app.plans, (p) => p.code, "plans");
  unique(app.meters, (m) => m.code, "meters");

  app.products.forEach((use, index) => {
    use.scopes.forEach((scope, scopeIndex) => {
      if (!appScopeAllowed(use.product, scope)) problems.push({ path: `products.${index}.scopes.${scopeIndex}`, code: "SCOPE_OUTSIDE_PRODUCT" });
    });
  });
  const counts = new Map<string, number>();
  app.resources.forEach((resource, index) => {
    const violation = connectedResourceViolation({ ...resource, productKey: resource.product, resourceId: "manifest" }, manifests);
    // El identificador concreto lo aporta la conexión; aquí se valida el resto.
    if (violation && violation !== "BINDING_RESOURCE_ID_INVALID") problems.push({ path: `resources.${index}`, code: violation });
    counts.set(resource.product, (counts.get(resource.product) ?? 0) + 1);
  });
  for (const [product, count] of counts) {
    const limit = connectedResourceLimit(product, manifests);
    if (limit !== null && count > limit) problems.push({ path: "resources", code: "BINDING_LIMIT_EXCEEDED" });
  }
  const meters = new Set(app.meters.map((meter) => meter.code));
  const capabilities = new Set(app.capabilities.map((capability) => capability.lookupKey));
  app.capabilities.forEach((capability, index) => {
    if (capability.type === "metered" && (!capability.meter || !meters.has(capability.meter))) problems.push({ path: `capabilities.${index}.meter`, code: "METER_UNDECLARED" });
    if (capability.type !== "metered" && capability.meter) problems.push({ path: `capabilities.${index}.meter`, code: "METER_ON_UNMETERED" });
  });
  app.plans.forEach((plan, index) => {
    for (const key of Object.keys(plan.capabilities)) if (!capabilities.has(key)) problems.push({ path: `plans.${index}.capabilities.${key}`, code: "CAPABILITY_UNDECLARED" });
  });
  return problems;
}
