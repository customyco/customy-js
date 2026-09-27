/**
 * Fachada de Customy Access para el servidor de una app: capabilities de sus
 * usuarios, catálogo comercial, usuarios y el contacto acotado de uno.
 */
import { callOptions, connectProduct, paginate, type CallOptions, type Query, type Transport } from "@customyai/core";
import { accessCall, CustomyAccessError, withRequiredScope } from "./errors";
import { ACCESS_AUDIENCE, ACCESS_DEFAULT_BASE_URL, type AccessOptions, type AccessScope } from "./options";
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
 * const access = createAccess<CustomyCapability>({ platform, machineTokens });
 * const { allowed } = await access.capabilities.check("reports.export", { userId });
 * ```
 *
 * Con `machineTokens` y sin `scopes`, cada método pide su token con el scope
 * que necesita, la primera vez que se usa (`me`/`capabilities` →
 * `capabilities:read`, `users.contact` → `users:contact:read`, `users.*` →
 * `users:read`, `catalog.*` → `catalog:read`). Con `scopes`, un solo token con
 * esos scopes para todo. Todos los métodos aceptan `signal` y `timeoutMs`.
 */
export function createAccess<Capability extends string = string>(options: AccessOptions): CustomyAccess<Capability> {
    return buildAccess<Capability>(options);
}

const DESCRIPTOR = { key: "access", audience: ACCESS_AUDIENCE, defaultBaseUrl: ACCESS_DEFAULT_BASE_URL, defaultScopes: ["capabilities:read"] } as const;

function buildAccess<Capability extends string>(options: AccessOptions) {
    const { transport: baseTransport, baseUrl } = connectProduct(options, DESCRIPTOR);
    // Scopes perezosos: solo con tokens de máquina y sin scopes explícitos. Un token por scope, cacheado por `machineTokens`.
    const lazyScopes = options.machineTokens !== undefined && options.scopes === undefined;
    const transports = new Map<AccessScope, Transport>();
    const transportFor = (scope: AccessScope): Transport => {
        if (!lazyScopes || scope === "capabilities:read") return baseTransport;
        let transport = transports.get(scope);
        if (!transport) {
            transport = connectProduct({ ...options, scopes: [scope] }, DESCRIPTOR).transport;
            transports.set(scope, transport);
        }
        return transport;
    };
    // La ruta se resuelve dentro de la llamada: un entorno que falta es un rechazo, no una excepción síncrona.
    const get = <T>(method: string, scope: AccessScope, path: string | (() => string), query: Query | (() => Query) | undefined, call: CallOptions | undefined) =>
        accessCall(async () => {
            const resolvedPath = typeof path === "function" ? path() : path;
            const request = { query: typeof query === "function" ? query() : query, ...callOptions(call) };
            return (await transportFor(scope).request<T>("GET", resolvedPath, request)).data;
        }).catch((error: unknown) => { throw withRequiredScope(error, method, scope); });
    const environment = (explicit: string | undefined): string => {
        const value = explicit ?? options.environmentId;
        if (!value) throw new CustomyAccessError({ code: "SDK_ENVIRONMENT_REQUIRED", message: "Pass environmentId (in the options or the call)" });
        return value;
    };
    const admin = (environmentId: string | undefined, path: string) => () => `/api/admin/env/${enc(environment(environmentId))}${path}`;
    type Scope = CallOptions & { environmentId?: string };
    type UserScope = Scope & { userId?: string };

    function me(params: UserScope = {}): Promise<AccessMeSnapshot> {
        // Con un token de máquina el entorno sale del token: no hace falta pasarlo.
        return get<AccessMeSnapshot>("me", "capabilities:read", "/api/v1/me", { envId: params.environmentId ?? options.environmentId, userId: params.userId }, params);
    }

    const listUsers = (params: Scope & { search?: string; page?: number; limit?: number; sort?: string; order?: "asc" | "desc" } = {}) => {
        const { environmentId, signal, timeoutMs, ...query } = params;
        return get<{ users: UserSummary[]; total: number }>("users.list", "users:read", admin(environmentId, "/users"), query, { signal, timeoutMs });
    };

    const catalogItems = <T>(name: string, path: string) => (params: Scope = {}) =>
        get<{ items: T[] }>(`catalog.${name}`, "catalog:read", admin(params.environmentId, path), undefined, params).then((r) => r.items);

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
            get: (params: Scope = {}) => get<AccessCatalog>("catalog.get", "catalog:read", admin(params.environmentId, "/catalog"), undefined, params),
            features: catalogItems<CatalogFeature>("features", "/catalog/features"),
            plans: catalogItems<CatalogPlan>("plans", "/catalog/plans"),
            addOns: catalogItems<CatalogAddOn>("addOns", "/catalog/addons"),
            prices: catalogItems<CatalogPrice>("prices", "/catalog/prices"),
            meters: catalogItems<CatalogMeter>("meters", "/catalog/meters"),
        },

        users: {
            /** Una página de usuarios del entorno (scope `users:read`). */
            list: listUsers,
            /** Todos los usuarios, página a página (`signal`/`timeoutMs` de `iteration` valen para cada página). */
            iterate: (params: Omit<Scope, "signal" | "timeoutMs"> & { search?: string; limit?: number } = {}, iteration: { signal?: AbortSignal; maxPages?: number; timeoutMs?: number } = {}) => {
                const limit = Math.min(100, Math.max(1, Math.trunc(params.limit ?? 100)));
                return paginate<UserSummary>(async (cursor) => {
                    const page = cursor ? Number(cursor) : 1;
                    const result = await listUsers({ ...params, page, limit, signal: iteration.signal, timeoutMs: iteration.timeoutMs });
                    const more = result.users.length > 0 && page * limit < result.total;
                    return { items: result.users, nextCursor: more ? String(page + 1) : null };
                }, { signal: iteration.signal, maxPages: iteration.maxPages });
            },
            get: (userId: string, params: Scope = {}) => get<UserSummary>("users.get", "users:read", admin(params.environmentId, `/users/${enc(userId)}`), undefined, params),
            /**
             * El contacto de UN usuario del entorno, leído al enviarle para no
             * guardarlo (scope exacto `users:contact:read`; cada lectura se audita).
             * Un no miembro y un id inexistente dan el mismo `USER_NOT_FOUND`.
             */
            contact: (userId: string, params: Scope = {}) =>
                get<UserContact>("users.contact", "users:contact:read", `/api/v1/users/${enc(userId)}/contact`, () => ({ envId: environment(params.environmentId) }), params),
        },
    };
}
