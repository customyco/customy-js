/**
 * Fachada de Customy Access para el servidor de una app: capabilities de sus
 * usuarios, catálogo comercial, usuarios y el contacto acotado de uno.
 */
import { connectProduct, paginate, type Query } from "@customyai/core";
import { accessCall, CustomyAccessError } from "./errors";
import { ACCESS_AUDIENCE, ACCESS_DEFAULT_BASE_URL, type AccessOptions } from "./options";
import type {
    AccessCatalog,
    AccessMeSnapshot,
    CapabilityCheck,
    CatalogAddOn,
    CatalogFeature,
    CatalogMeter,
    CatalogPlan,
    CatalogPrice,
    UserContact,
    UserSummary,
} from "./types";

const enc = encodeURIComponent;

/**
 * Valor de una capability del manifiesto → permitida o no: booleana, su valor;
 * medida, un límite > 0; de configuración, cualquier valor no nulo (los
 * valores por defecto sin plan son `false`, `0` y `null`).
 */
function allowedValue(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (typeof value === "number") return value > 0;
    return true;
}

/** Decisión de una capability a partir del snapshot de `/api/v1/me`. */
export function capabilityFromSnapshot<Capability extends string>(snapshot: AccessMeSnapshot, capability: Capability, mode: "read" | "write" = "write"): CapabilityCheck<Capability> {
    const plan = snapshot.application?.plan?.code ?? snapshot.subscription?.primaryPlanCode ?? null;
    const application = snapshot.application?.capabilities;
    if (application && Object.prototype.hasOwnProperty.call(application, capability)) {
        const value = application[capability];
        return { capability, allowed: allowedValue(value), value, source: "application", plan };
    }
    const item = snapshot.entitlements?.entitlements?.find((entry) => entry.capability === capability);
    if (item) {
        const allowed = item.decisionState === "enabled" || (mode === "read" && item.decisionState === "read_only");
        return { capability, allowed, value: item.decisionState, source: "entitlements", plan, reason: item.reason, ...(item.usage ? { usage: item.usage } : {}) };
    }
    return { capability, allowed: false, value: null, source: "none", plan };
}

export type CustomyAccess<Capability extends string = string> = ReturnType<typeof buildAccess<Capability>>;

/**
 * ```ts
 * import type { CustomyCapability } from "./customy.generated"; // customy apps codegen
 * const access = createAccess<CustomyCapability>({ platform, machineTokens, scopes: ["capabilities:read"] });
 * const { allowed } = await access.capabilities.check("reports.export", { userId });
 * ```
 */
export function createAccess<Capability extends string = string>(options: AccessOptions): CustomyAccess<Capability> {
    return buildAccess<Capability>(options);
}

function buildAccess<Capability extends string>(options: AccessOptions) {
    const { transport, baseUrl } = connectProduct(options, {
        key: "access", audience: ACCESS_AUDIENCE, defaultBaseUrl: ACCESS_DEFAULT_BASE_URL, defaultScopes: ["capabilities:read"],
    });
    // La ruta se resuelve dentro de la llamada: un entorno que falta es un rechazo, no una excepción síncrona.
    const get = <T>(path: string | (() => string), query?: Query | (() => Query)) => accessCall(async () => {
        const resolvedPath = typeof path === "function" ? path() : path;
        return (await transport.request<T>("GET", resolvedPath, { query: typeof query === "function" ? query() : query })).data;
    });
    const environment = (explicit: string | undefined): string => {
        const value = explicit ?? options.environmentId;
        if (!value) throw new CustomyAccessError({ code: "SDK_ENVIRONMENT_REQUIRED", message: "Pass environmentId (in the options or the call)" });
        return value;
    };
    const admin = (environmentId: string | undefined, path: string) => () => `/api/admin/env/${enc(environment(environmentId))}${path}`;
    type Scope = { environmentId?: string };
    type UserScope = Scope & { userId?: string };

    function me(params: UserScope = {}): Promise<AccessMeSnapshot> {
        // Con un token de máquina el entorno sale del token: no hace falta pasarlo.
        return get<AccessMeSnapshot>("/api/v1/me", { envId: params.environmentId ?? options.environmentId, userId: params.userId });
    }

    const listUsers = (params: Scope & { search?: string; page?: number; limit?: number; sort?: string; order?: "asc" | "desc" } = {}) => {
        const { environmentId, ...query } = params;
        return get<{ users: UserSummary[]; total: number }>(admin(environmentId, "/users"), query);
    };

    return {
        baseUrl,

        /** Plan, entitlements, módulos, uso y —en apps por manifiesto— sus capabilities (scope `capabilities:read`). */
        me,

        capabilities: {
            /** ¿Puede el usuario (o el entorno) usar esta capability? Una petición. */
            async check(capability: Capability, params: UserScope & { mode?: "read" | "write" } = {}): Promise<CapabilityCheck<Capability>> {
                return capabilityFromSnapshot(await me(params), capability, params.mode);
            },
            /** Varias capabilities con una sola petición. */
            async checkMany<Name extends Capability>(capabilities: readonly Name[], params: UserScope & { mode?: "read" | "write" } = {}): Promise<Record<Name, CapabilityCheck<Name>>> {
                const snapshot = await me(params);
                return Object.fromEntries(capabilities.map((capability) => [capability, capabilityFromSnapshot(snapshot, capability, params.mode)])) as Record<Name, CapabilityCheck<Name>>;
            },
        },

        /** Catálogo comercial del propio entorno (scope `catalog:read`; `admin:*` además ve el maestro global). */
        catalog: {
            get: (params: Scope = {}) => get<AccessCatalog>(admin(params.environmentId, "/catalog")),
            features: (params: Scope = {}) => get<{ items: CatalogFeature[] }>(admin(params.environmentId, "/catalog/features")).then((r) => r.items),
            plans: (params: Scope = {}) => get<{ items: CatalogPlan[] }>(admin(params.environmentId, "/catalog/plans")).then((r) => r.items),
            addOns: (params: Scope = {}) => get<{ items: CatalogAddOn[] }>(admin(params.environmentId, "/catalog/addons")).then((r) => r.items),
            prices: (params: Scope = {}) => get<{ items: CatalogPrice[] }>(admin(params.environmentId, "/catalog/prices")).then((r) => r.items),
            meters: (params: Scope = {}) => get<{ items: CatalogMeter[] }>(admin(params.environmentId, "/catalog/meters")).then((r) => r.items),
        },

        users: {
            /** Una página de usuarios del entorno (scope `users:read`). */
            list: listUsers,
            /** Todos los usuarios, página a página. */
            iterate: (params: Scope & { search?: string; limit?: number } = {}, iteration: { signal?: AbortSignal; maxPages?: number } = {}) => {
                const limit = Math.min(100, Math.max(1, Math.trunc(params.limit ?? 100)));
                return paginate<UserSummary>(async (cursor) => {
                    const page = cursor ? Number(cursor) : 1;
                    const result = await listUsers({ ...params, page, limit });
                    const more = result.users.length > 0 && page * limit < result.total;
                    return { items: result.users, nextCursor: more ? String(page + 1) : null };
                }, iteration);
            },
            get: (userId: string, params: Scope = {}) => get<UserSummary>(admin(params.environmentId, `/users/${enc(userId)}`)),
            /**
             * El contacto de UN usuario del entorno, leído al enviarle para no
             * guardarlo (scope exacto `users:contact:read`; cada lectura se audita).
             * Un no miembro y un id inexistente dan el mismo `USER_NOT_FOUND`.
             */
            contact: (userId: string, params: Scope = {}) => get<UserContact>(`/api/v1/users/${enc(userId)}/contact`, () => ({ envId: environment(params.environmentId) })),
        },
    };
}
