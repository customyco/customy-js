/**
 * Manifiesto de producto `product/v1` (ADR CUSTOMY_SDK_PLATFORM_DECISION_2026-09-24, D3).
 *
 * Cada producto declara como DATOS qué recursos suyos puede enlazar una
 * aplicación conectada: el tipo de enlace, qué claves y identificadores admite
 * y qué operaciones concede. Connected Applications valida contra estas
 * declaraciones en vez de ramas de código por producto o por aplicación.
 */
import { z } from "zod";

const identifier = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);

export const ConnectedOperationSchema = z.enum([
  "read", "propose", "submit", "read_owned", "write_owned", "research", "deliver_budget_alert", "deliver_notification",
]);
export type ConnectedOperation = z.infer<typeof ConnectedOperationSchema>;

export const ConnectedBindingKindSchema = z.enum([
  "product", "internal_service", "external_destination", "public_form", "private_collection", "external_source",
  "external_automation", "external_communication",
]);
export type ConnectedBindingKind = z.infer<typeof ConnectedBindingKindSchema>;

/** Un tipo de enlace que un producto ofrece a las aplicaciones conectadas. */
export const ProductBindingSchema = z.object({
  kind: ConnectedBindingKindSchema,
  /** Claves de recurso admitidas; sin lista, cualquiera. Son nombres del producto, nunca de apps. */
  keys: z.array(identifier).min(1).optional(),
  /** Patrón que debe cumplir el identificador del recurso en el producto. */
  resourceIdPattern: z.string().min(1).optional(),
  operations: z.object({
    allowed: z.array(ConnectedOperationSchema).max(4),
    /** exact: exactamente `allowed`; subset: un subconjunto no vacío. */
    mode: z.enum(["exact", "subset"]),
    /** false: las operaciones pueden omitirse (si se dan, cumplen el modo). */
    required: z.boolean().default(true),
  }).strict().optional(),
  maxPerConnection: z.number().int().positive().optional(),
}).strict();
export type ProductBinding = z.infer<typeof ProductBindingSchema>;

export const ProductManifestSchema = z.object({
  schema: z.literal("product/v1"),
  key: z.string().regex(/^customy-[a-z][a-z0-9-]*$/),
  /** Audiencia de sus tokens de máquina (discovery). */
  audience: z.string().regex(/^customy-[a-z][a-z0-9-]*$/),
  /** Si true, todo enlace debe declarar `bindingKind` (no admite el enlace implícito). */
  bindingRequired: z.boolean().default(false),
  bindings: z.array(ProductBindingSchema).default([]),
  /** Productos a los que llama en nombre de una app (token exchange). Solo esos lo aceptan como actor. */
  requires: z.array(z.string().regex(/^customy-[a-z][a-z0-9-]*$/)).default([]),
}).strict().superRefine((manifest, context) => {
  const kinds = manifest.bindings.map((binding) => binding.kind);
  if (new Set(kinds).size !== kinds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Binding kinds must be unique per product" });
  if (manifest.requires.includes(manifest.key)) context.addIssue({ code: z.ZodIssueCode.custom, message: "A product cannot require itself" });
});
export type ProductManifest = z.infer<typeof ProductManifestSchema>;

const product = (key: string, bindings: z.input<typeof ProductBindingSchema>[] = [], bindingRequired = false, requires: string[] = []): ProductManifest =>
  ProductManifestSchema.parse({ schema: "product/v1", key, audience: key, bindingRequired, bindings, requires });

/**
 * Productos que aceptan enlaces de aplicaciones conectadas. Cada entrada la
 * mantiene el equipo del producto; añadir un tipo de enlace es cambiar datos
 * aquí, no ramas en Access.
 */
export const CONNECTABLE_PRODUCT_MANIFESTS: readonly ProductManifest[] = [
  product("customy-atlas", [{ kind: "internal_service", operations: { allowed: ["read", "propose"], mode: "subset" } }]),
  product("customy-tables", [{ kind: "private_collection", keys: ["favorites", "comparisons", "preferences"], operations: { allowed: ["read_owned", "write_owned"], mode: "subset" } }]),
  product("customy-agent", [{ kind: "external_automation", keys: ["catalog-updater"], operations: { allowed: ["research", "deliver_budget_alert"], mode: "subset" } }]),
  product("customy-forms", [{ kind: "public_form", keys: ["subscription", "contact", "commercial"], resourceIdPattern: "^frm_[a-zA-Z0-9_-]+$", operations: { allowed: ["read", "submit"], mode: "exact" } }], false, ["customy-links"]),
  product("customy-crm"),
  product("customy-content", [{ kind: "external_destination", operations: { allowed: ["read"], mode: "exact" } }]),
  product("customy-storage"),
  product("customy-data", [{ kind: "external_source", keys: ["analytics-source"], operations: { allowed: ["submit"], mode: "exact" } }]),
  product("customy-analytics"),
  product("customy-campaigns", [{ kind: "external_communication", keys: ["weekly-brief"], operations: { allowed: ["read"], mode: "exact" } }]),
  product("customy-engagement", [{ kind: "external_communication", keys: ["notification-delivery"], operations: { allowed: ["deliver_notification"], mode: "exact" } }]),
  // Una referencia de solo lectura a un sitio de Pages del Workspace; no concede edición ni publicación.
  product("customy-pages", [{ kind: "product", resourceIdPattern: "^[0-9]{6,20}$", operations: { allowed: ["read"], mode: "exact", required: false }, maxPerConnection: 1 }], true),
];

export type ConnectedResourceRequest = {
  key: string;
  productKey: string;
  resourceId: string;
  bindingKind?: ConnectedBindingKind;
  operations?: ConnectedOperation[];
};

/**
 * Motivo por el que un recurso no cumple el manifiesto de su producto, o null.
 * Un recurso sin `bindingKind` (o con `product` en un producto sin ese enlace
 * declarado) es una referencia simple y no admite operaciones.
 */
export function connectedResourceViolation(resource: ConnectedResourceRequest, manifests: readonly ProductManifest[] = CONNECTABLE_PRODUCT_MANIFESTS): string | null {
  const manifest = manifests.find((entry) => entry.key === resource.productKey);
  if (!manifest) return "PRODUCT_NOT_CONNECTABLE";
  if (manifest.bindingRequired && !resource.bindingKind) return "BINDING_KIND_REQUIRED";
  const binding = resource.bindingKind ? manifest.bindings.find((entry) => entry.kind === resource.bindingKind) : undefined;
  if (!binding) {
    const plainReference = resource.bindingKind === undefined || resource.bindingKind === "product";
    if (plainReference && !resource.operations) return null;
    return plainReference ? "OPERATIONS_REQUIRE_BINDING" : "BINDING_NOT_OFFERED";
  }
  if (binding.keys && !binding.keys.includes(resource.key)) return "BINDING_KEY_NOT_ALLOWED";
  if (binding.resourceIdPattern && !new RegExp(binding.resourceIdPattern).test(resource.resourceId)) return "BINDING_RESOURCE_ID_INVALID";
  const rule = binding.operations;
  const operations = resource.operations;
  if (!rule) return operations ? "OPERATIONS_REQUIRE_BINDING" : null;
  if (!operations || operations.length === 0) return rule.required ? "BINDING_OPERATIONS_REQUIRED" : null;
  if (operations.some((operation) => !rule.allowed.includes(operation))) return "BINDING_OPERATION_NOT_ALLOWED";
  if (rule.mode === "exact" && (operations.length !== rule.allowed.length || rule.allowed.some((operation) => !operations.includes(operation)))) return "BINDING_OPERATIONS_MISMATCH";
  return null;
}

/** Máximo de recursos de un producto por conexión, si su manifiesto lo acota. */
export function connectedResourceLimit(productKey: string, manifests: readonly ProductManifest[] = CONNECTABLE_PRODUCT_MANIFESTS): number | null {
  const limits = manifests.find((entry) => entry.key === productKey)?.bindings.map((binding) => binding.maxPerConnection).filter((value): value is number => value !== undefined) ?? [];
  return limits.length ? Math.min(...limits) : null;
}

/** Productos que un producto dado requiere, transitivamente, en orden estable. Falla si hay un ciclo. */
export function resolveProductRequirements(root: string, manifests: readonly ProductManifest[] = CONNECTABLE_PRODUCT_MANIFESTS): string[] {
  const byKey = new Map(manifests.map((manifest) => [manifest.key, manifest]));
  const order: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (key: string, path: string[]) => {
    if (done.has(key)) return;
    if (visiting.has(key)) throw new Error(`PRODUCT_REQUIREMENT_CYCLE: ${[...path, key].join(" -> ")}`);
    visiting.add(key);
    for (const next of byKey.get(key)?.requires ?? []) visit(next, [...path, key]);
    visiting.delete(key);
    done.add(key);
    if (key !== root) order.push(key);
  };
  visit(root, []);
  return order;
}

/** Si `target` acepta que `actor` le llame en nombre de una app: solo si el actor lo declaró en `requires`. */
export function delegationAllowed(actor: string, target: string, manifests: readonly ProductManifest[] = CONNECTABLE_PRODUCT_MANIFESTS): boolean {
  return manifests.find((manifest) => manifest.key === actor)?.requires.includes(target) ?? false;
}
