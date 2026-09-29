/**
 * Tipos del contrato HTTP de Customy Access que usa la fachada.
 */

export type CapabilityState = "enabled" | "hidden" | "disabled" | "read_only" | "requires_upgrade" | "requires_admin";

export type CapabilityUsage = {
    capability: string;
    meterCode?: string | null;
    limitCode?: string | null;
    period?: string | null;
    current: number | null;
    limit: number | null;
    remaining: number | null;
    status: "ok" | "near_limit" | "at_limit" | "exceeded" | "unmetered" | "unknown";
    source: string;
};

export type EntitlementItem = {
    capability: string;
    label: string;
    module: string;
    decisionState: CapabilityState;
    commerciallyIncluded: boolean;
    commerciallyIncludedVia: "plan" | "addon" | "none";
    requiredPlans: string[];
    reason: string;
    usage?: CapabilityUsage | null;
};

export type SubscriptionStatus = {
    environmentId: string;
    organizationId: string;
    primaryPlanCode: string | null;
    subscriptionStatus: string | null;
    hasActiveSubscription: boolean;
    planCodes: string[];
    addOnCodes: string[];
};

/** Plan y capabilities de una app instalada por manifiesto (`customy.app.json`). */
export type ApplicationEntitlements = {
    applicationKey: string;
    /** `member` (asiento), `subscription` (entorno) o `default` (plan de menor rango). */
    plan: { code: string; source: "member" | "subscription" | "default" } | null;
    /** Valor de cada capability del manifiesto: booleano, límite de un meter o configuración. */
    capabilities: Record<string, unknown>;
};

/** Respuesta de `GET /api/v1/me`. */
export type AccessMeSnapshot = {
    environmentId: string;
    user: { id: string } | null;
    subscription: SubscriptionStatus;
    entitlements: {
        environmentId: string;
        organizationId: string;
        planCodes: string[];
        addOnCodes: string[];
        entitlements: EntitlementItem[];
    } & Record<string, unknown>;
    modules: Array<{ key: string; label: string; state: CapabilityState; visible: boolean } & Record<string, unknown>>;
    usage: Record<string, unknown>;
    application?: ApplicationEntitlements;
};

export type CapabilityCheck<Capability extends string = string> = {
    capability: Capability;
    allowed: boolean;
    /** Valor del manifiesto (booleano, límite, configuración) o el estado de la decisión. */
    value: unknown;
    /** De dónde salió: el manifiesto de la app, los entitlements del entorno, o ninguno (no existe). */
    source: "application" | "entitlements" | "none";
    plan: string | null;
    reason?: string;
    usage?: CapabilityUsage;
};

export type CatalogStatus = "draft" | "active" | "archived";

export type CatalogFeature = {
    lookupKey: string;
    name: string;
    type: "boolean" | "metered" | "config";
    productKey: string;
    moduleKey?: string;
    meterCode?: string | null;
    defaultValue?: unknown;
    status: CatalogStatus;
    version: number;
    metadata: Record<string, unknown>;
};

export type CatalogPlan = {
    code: string;
    version: number;
    name: string;
    status: CatalogStatus;
    rank: number;
    eligibleAddOns: string[];
    limits: Record<string, unknown>;
    metadata: Record<string, unknown>;
};

export type CatalogAddOn = { code: string; version: number; name: string; status: CatalogStatus; limits: Record<string, unknown>; metadata: Record<string, unknown> };

export type CatalogPrice = {
    id: string;
    planCode?: string | null;
    addOnCode?: string | null;
    model: "flat" | "per_unit" | "tiered" | "volume" | "graduated" | "package" | "usage";
    config: Record<string, unknown>;
    currency: string;
    recurrence: "one_time" | "monthly" | "annual" | "usage";
    version: number;
    meterCode?: string | null;
    status: CatalogStatus;
    metadata: Record<string, unknown>;
};

export type CatalogMeter = { meterCode: string; aggregation: "sum" | "count" | "last"; unit: string; status: CatalogStatus; metadata: Record<string, unknown> };

export type AccessCatalog = {
    version: string;
    source: string;
    features: CatalogFeature[];
    plans: CatalogPlan[];
    planFeatures: Array<{ planCode: string; planVersion: number; featureLookupKey: string; config: Record<string, unknown> }>;
    addOns: CatalogAddOn[];
    addOnFeatures: Array<{ addOnCode: string; addOnVersion: number; featureLookupKey: string; config: Record<string, unknown> }>;
    prices: CatalogPrice[];
    meters: CatalogMeter[];
};

export type UserSummary = {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    role?: string;
    banned?: boolean;
    banReason?: string;
};

/** Contacto de un usuario para enviarle (`users:contact:read`). */
export type UserContact = { userId: string; email: string; emailVerified: boolean; name: string | null; locale: string | null };

/**
 * Una relación de la app: `subjectType` es `user` o `<clave>/…`, `objectType`
 * siempre `<clave>/…`; `relation` en `^[a-z0-9][a-z0-9_.:-]{0,63}$` (`owner`,
 * `role:<clave-de-rol>`, `perm:<permiso>`…); ids de 1 a 128 caracteres.
 */
export type RelationshipTuple = { subjectType: string; subjectId: string; relation: string; objectType: string; objectId: string };

/** Filtro de `relationships.list`: `objectType` obligatorio, el resto opcional. */
export type RelationshipQuery = { objectType: string; objectId?: string; subjectType?: string; subjectId?: string; relation?: string };

export type RelationshipList = { tuples: RelationshipTuple[]; truncated: boolean };

/** Resultado de `relationships.write`: filas nuevas y borradas (escribir una que ya existe no cuenta). */
export type RelationshipWriteResult = { written: number; deleted: number; consistencyToken: string | null };

export type PermissionCheckInput = { subject: { type: "user"; id: string }; permission: string; object: { type: string; id: string } };

/** `owner` (dueño), `direct` (`perm:<permiso>`), `role:<clave>` (rol con ese permiso sobre ese objeto) o `null`. */
export type PermissionCheckResult = { allowed: boolean; via: "owner" | "direct" | `role:${string}` | null };

export type MemberPlanResult = { userId: string; planCode: string | null; previousPlanCode: string | null };
