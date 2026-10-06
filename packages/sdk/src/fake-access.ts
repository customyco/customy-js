/**
 * `createFakeAccess`: Customy Access en memoria para los tests de contrato de una app, con la misma forma que `createAccess()`
 * (`me`, `capabilities`, `permissions`, `appRoles`, `plans`, `relationships`). La app prueba su autorización contra roles y planes
 * del manifiesto, no contra mocks de `fetch` ni nombres de rol escritos en el test.
 *
 * ```ts
 * import { createFakeAccess } from "@customyai/sdk/testing";
 * import manifest from "../customy.app.json";
 *
 * const access = createFakeAccess<CustomyCapability, CustomyRole, CustomyPermission>({ manifest });
 * access.grantRole("usr_1", "bonu.admin");
 * await access.permissions.effective("usr_1");          // { roles: ["bonu.admin"], permissions: [...] }
 * const directory = createPermissionDirectory(access);  // lo mismo que la app usa en producción
 * access.failNext(new CustomyAccessError({ code: "HTTP_503", status: 503 })); // y comprueba que falla cerrado
 * ```
 *
 * Qué copia del servidor: la resolución de roles y permisos contra el manifiesto (una asignación caducada no cuenta), el plan por
 * miembro o el de menor rango por defecto, los valores por defecto de las capabilities (`false`, `0`, `null`), la decisión de
 * `capabilities.check` (es la real, `capabilityFromSnapshot`), el espacio de nombres `<clave>/` de las relaciones y el evaluador
 * `owner` / `perm:<p>` / `role:<K>` de `permissions.checkMany`. Lo que no copia: autenticación, scopes, límites ni la lista de
 * usuarios. Los códigos de error de rechazo (`ROLE_NOT_FOUND`, `PLAN_NOT_DECLARED`…) son aproximados: prueba el comportamiento
 * (que la app rechaza y no concede), no el texto.
 */
import { capabilityFromSnapshot, CustomyAccessError, explainPermission } from "@customyai/access";
import type {
    AccessMeSnapshot,
    AppEffectivePermissions,
    AppRole,
    AppRoleAssignInput,
    AppRoleAssignResult,
    AppRoleAssignment,
    CapabilityCheck,
    CustomyAccess,
    MemberPlanResult,
    PermissionCheckInput,
    PermissionCheckResult,
    RelationshipList,
    RelationshipQuery,
    RelationshipTuple,
    RelationshipWriteResult,
} from "@customyai/access";

/** Lo que el fake lee del manifiesto (`customy.app.json`): pasa el JSON tal cual. */
export type FakeAccessManifest = Readonly<{
    key: string;
    capabilities?: ReadonlyArray<Readonly<{ lookupKey: string; type?: "boolean" | "metered" | "config" }>>;
    /** El primero es el plan por defecto (el de menor rango), salvo `defaultPlan`. */
    plans?: ReadonlyArray<Readonly<{ code: string; capabilities?: Readonly<Record<string, unknown>> }>>;
    roles?: ReadonlyArray<Readonly<{ key: string; name?: string; description?: string; permissions: readonly string[] }>>;
}>;

export type FakeAccessOptions = Readonly<{
    manifest: FakeAccessManifest;
    /** Entorno que responde (por defecto `env_fake`); una llamada con otro `environmentId` es `ENVIRONMENT_FORBIDDEN`. */
    environmentId?: string;
    /** Plan de quien no tiene uno asignado (por defecto, el primero del manifiesto). */
    defaultPlan?: string;
    now?: () => number;
}>;

type Scope = Readonly<{ environmentId?: string; signal?: AbortSignal; timeoutMs?: number }>;
type UserScope = Scope & Readonly<{ userId?: string }>;

type Held = { source: string; assignedAt: number; expiresAt: number | null };

export type FakeAccessCall = Readonly<{ method: string; args: readonly unknown[] }>;

export type FakeAccessControls<Role extends string, Permission extends string> = Readonly<{
    /** Da un rol del manifiesto a un usuario (como la app o el Workspace). `expiresAt` en epoch ms. */
    grantRole(userId: string, role: Role, options?: { expiresAt?: number; source?: string }): void;
    revokeRole(userId: string, role: Role): void;
    /** Fija el plan de un usuario (`null` vuelve al de por defecto). */
    setPlan(userId: string, planCode: string | null): void;
    /** El próximo método que se llame rechaza con este error (uno solo): para probar que la app falla cerrado. */
    failNext(error: unknown): void;
    /** Cada llamada a un método, en orden. */
    readonly calls: ReadonlyArray<FakeAccessCall>;
    /** Vuelve a un fake vacío: sin asignaciones, planes, tuplas ni llamadas. */
    reset(): void;
    /** Los permisos que el manifiesto da a un rol (para afirmar sin repetir la tabla). */
    permissionsOf(role: Role): readonly Permission[];
}>;

export type FakeAccess<Capability extends string = string, Role extends string = string, Permission extends string = string> =
    Pick<CustomyAccess<Capability, Role, Permission>, "me" | "capabilities" | "permissions" | "appRoles" | "plans" | "relationships">
    & FakeAccessControls<Role, Permission>;

const DEFAULTS = { boolean: false, metered: 0, config: null } as const;
const tupleKey = (t: RelationshipTuple) => JSON.stringify([t.subjectType, t.subjectId, t.relation, t.objectType, t.objectId]);

export function createFakeAccess<Capability extends string = string, Role extends string = string, Permission extends string = string>(options: FakeAccessOptions): FakeAccess<Capability, Role, Permission> {
    const { manifest } = options;
    const environmentId = options.environmentId ?? "env_fake";
    const now = options.now ?? Date.now;
    const prefix = `${manifest.key}/`;
    const declaredRoles = (manifest.roles ?? []) as ReadonlyArray<{ key: Role; name?: string; description?: string; permissions: readonly Permission[] }>;
    const roleOf = (key: string) => declaredRoles.find((role) => role.key === key);
    const defaultPlan = options.defaultPlan ?? manifest.plans?.[0]?.code ?? null;

    let held = new Map<string, Map<Role, Held>>();
    let userPlans = new Map<string, string>();
    let tuples = new Map<string, RelationshipTuple>();
    let calls: FakeAccessCall[] = [];
    let failure: { error: unknown } | null = null;

    const error = (code: string, status: number, message: string) => new CustomyAccessError({ code, status, message });
    function enter(method: string, args: readonly unknown[], scope?: Scope) {
        calls.push({ method, args });
        if (failure) {
            const { error: pending } = failure;
            failure = null;
            throw pending;
        }
        if (scope?.environmentId && scope.environmentId !== environmentId) throw error("ENVIRONMENT_FORBIDDEN", 403, "This credential cannot read that environment");
    }
    const live = (entry: Held) => entry.expiresAt === null || entry.expiresAt > now();
    const heldBy = (userId: string) => [...(held.get(userId) ?? new Map<Role, Held>()).entries()].filter(([, entry]) => live(entry));
    const roleView = (role: (typeof declaredRoles)[number]): AppRole<Role, Permission> => ({ key: role.key, name: role.name ?? role.key, description: role.description ?? null, permissions: [...role.permissions] });

    function effectiveOf(userId: string): AppEffectivePermissions<Role, Permission> {
        const roles = heldBy(userId).map(([key]) => key).filter((key) => roleOf(key)).sort();
        const permissions = [...new Set(roles.flatMap((key) => roleOf(key)!.permissions))].sort();
        return { userId, roles, permissions };
    }
    function planOf(userId: string | undefined): { code: string; source: "member" | "default" } | null {
        const member = userId ? userPlans.get(userId) : undefined;
        if (member) return { code: member, source: "member" };
        return defaultPlan ? { code: defaultPlan, source: "default" } : null;
    }
    function snapshot(userId: string | undefined): AccessMeSnapshot<Role, Permission> {
        const plan = planOf(userId);
        const planCapabilities = manifest.plans?.find((candidate) => candidate.code === plan?.code)?.capabilities ?? {};
        const capabilities = Object.fromEntries((manifest.capabilities ?? []).map((capability) => [capability.lookupKey, planCapabilities[capability.lookupKey] ?? DEFAULTS[capability.type ?? "boolean"]]));
        const grants = userId ? effectiveOf(userId) : { roles: [], permissions: [] };
        return {
            environmentId,
            user: userId ? { id: userId } : null,
            subscription: { environmentId, organizationId: "org_fake", primaryPlanCode: plan?.code ?? null, subscriptionStatus: null, hasActiveSubscription: false, planCodes: plan ? [plan.code] : [], addOnCodes: [], subscriptions: [] } as AccessMeSnapshot["subscription"],
            entitlements: { environmentId, organizationId: "org_fake", planCodes: plan ? [plan.code] : [], addOnCodes: [], entitlements: [] },
            modules: [],
            usage: {},
            application: { applicationKey: manifest.key, plan, capabilities, roles: grants.roles, permissions: grants.permissions },
        };
    }

    function inNamespace(type: string) {
        return type.startsWith(prefix);
    }
    function assertTuple(tuple: RelationshipTuple) {
        if (!inNamespace(tuple.objectType) || !(tuple.subjectType === "user" || inNamespace(tuple.subjectType))) {
            throw error("NAMESPACE_FORBIDDEN", 403, `Relationship types must start with ${prefix}`);
        }
    }

    const me = async (params: UserScope = {}) => {
        enter("me", [params], params);
        return snapshot(params.userId);
    };

    const api = {
        me,
        capabilities: {
            async check(capability: Capability, params: UserScope & { mode?: "read" | "write" } = {}): Promise<CapabilityCheck<Capability>> {
                return capabilityFromSnapshot(await me(params), capability, params.mode);
            },
            async checkMany<Name extends Capability>(names: readonly Name[], params: UserScope & { mode?: "read" | "write" } = {}) {
                const current = await me(params);
                return Object.fromEntries(names.map((name) => [name, capabilityFromSnapshot(current, name, params.mode)])) as Record<Name, CapabilityCheck<Name>>;
            },
        },
        permissions: {
            async effective(userId: string, params: Scope = {}) {
                enter("permissions.effective", [userId, params], params);
                return effectiveOf(userId);
            },
            async explain(userId: string, permission: Permission, params: Scope = {}) {
                enter("permissions.explain", [userId, permission, params], params);
                const assignments = [...(held.get(userId) ?? new Map<Role, Held>()).entries()].map(([roleKey, entry]) => ({ userId, roleKey, source: entry.source, assignedAt: entry.assignedAt, expiresAt: entry.expiresAt }));
                return explainPermission<Role, Permission>({ userId, permission, roles: declaredRoles.map(roleView), assignments, now: now() });
            },
            async checkMany(checks: readonly PermissionCheckInput[], params: Scope = {}): Promise<PermissionCheckResult[]> {
                enter("permissions.checkMany", [checks, params], params);
                const has = new Set([...tuples.values()].map(tupleKey));
                return checks.map((check) => {
                    if (!inNamespace(check.object.type)) throw error("NAMESPACE_FORBIDDEN", 403, `Relationship types must start with ${prefix}`);
                    const base = { objectType: check.object.type, objectId: check.object.id };
                    const user = { subjectType: "user", subjectId: check.subject.id };
                    if (has.has(tupleKey({ ...user, relation: "owner", ...base }))) return { allowed: true, via: "owner" };
                    const relation = `perm:${check.permission}`;
                    if (has.has(tupleKey({ ...user, relation, ...base }))) return { allowed: true, via: "direct" };
                    const roles = [...tuples.values()]
                        .filter((t) => t.subjectType === "user" && t.subjectId === check.subject.id && t.objectType === base.objectType && t.objectId === base.objectId && t.relation.startsWith("role:"))
                        .map((t) => t.relation.slice("role:".length)).sort();
                    const via = roles.find((key) => has.has(tupleKey({ subjectType: `${prefix}role`, subjectId: `${check.object.id}#${key}`, relation, ...base })));
                    return via ? { allowed: true, via: `role:${via}` } : { allowed: false, via: null };
                });
            },
        },
        relationships: {
            async list(query: RelationshipQuery, params: Scope = {}): Promise<RelationshipList> {
                enter("relationships.list", [query, params], params);
                if (!inNamespace(query.objectType)) throw error("NAMESPACE_FORBIDDEN", 403, `Relationship types must start with ${prefix}`);
                const matching = [...tuples.values()].filter((t) => t.objectType === query.objectType
                    && (query.objectId === undefined || t.objectId === query.objectId) && (query.subjectType === undefined || t.subjectType === query.subjectType)
                    && (query.subjectId === undefined || t.subjectId === query.subjectId) && (query.relation === undefined || t.relation === query.relation));
                return { tuples: matching.slice(0, 1000), truncated: matching.length > 1000 };
            },
            async write(change: { writes?: readonly RelationshipTuple[]; deletes?: readonly RelationshipTuple[] }, params: Scope = {}): Promise<RelationshipWriteResult> {
                enter("relationships.write", [change, params], params);
                const writes = change.writes ?? [];
                const deletes = change.deletes ?? [];
                for (const tuple of [...writes, ...deletes]) assertTuple(tuple);
                const written = new Set(writes.map(tupleKey));
                if (deletes.some((tuple) => written.has(tupleKey(tuple)))) throw error("OVERLAPPING_CHANGES", 400, "The same tuple is in writes and deletes");
                let added = 0;
                let removed = 0;
                for (const tuple of deletes) if (tuples.delete(tupleKey(tuple))) removed += 1;
                for (const tuple of writes) if (!tuples.has(tupleKey(tuple))) { tuples.set(tupleKey(tuple), { ...tuple }); added += 1; }
                return { written: added, deleted: removed, consistencyToken: null };
            },
        },
        appRoles: {
            async list(params: Scope = {}) {
                enter("appRoles.list", [params], params);
                return declaredRoles.map(roleView);
            },
            assignments: {
                async list(query: { userId?: string } = {}, params: Scope = {}): Promise<Array<AppRoleAssignment<Role>>> {
                    enter("appRoles.assignments.list", [query, params], params);
                    return [...held.entries()].filter(([userId]) => query.userId === undefined || userId === query.userId)
                        .flatMap(([userId, roles]) => [...roles.entries()].filter(([, entry]) => live(entry))
                            .map(([roleKey, entry]) => ({ userId, roleKey, source: entry.source, assignedAt: entry.assignedAt, expiresAt: entry.expiresAt })));
                },
                async assign(input: AppRoleAssignInput<Role>, params: Scope = {}): Promise<AppRoleAssignResult<Role>> {
                    enter("appRoles.assignments.assign", [input, params], params);
                    if (!roleOf(input.roleKey)) throw error("ROLE_NOT_FOUND", 404, `The manifest does not declare ${input.roleKey}`);
                    if (input.expiresAt !== undefined && input.expiresAt <= now()) throw error("INVALID_EXPIRY", 400, "expiresAt must be in the future");
                    const current = held.get(input.userId)?.get(input.roleKey);
                    if (current && live(current) && current.source !== "application") throw error("ASSIGNMENT_MANAGED_BY_WORKSPACE", 409, "That assignment belongs to the Workspace");
                    setHeld(input.userId, input.roleKey, { source: "application", assignedAt: now(), expiresAt: input.expiresAt ?? null });
                    return { userId: input.userId, roleKey: input.roleKey, source: "application" };
                },
                async revoke(input: { userId: string; roleKey: Role }, params: Scope = {}) {
                    enter("appRoles.assignments.revoke", [input, params], params);
                    const current = held.get(input.userId)?.get(input.roleKey);
                    if (current && live(current) && current.source !== "application") throw error("ASSIGNMENT_MANAGED_BY_WORKSPACE", 409, "That assignment belongs to the Workspace");
                    held.get(input.userId)?.delete(input.roleKey);
                    return { success: true };
                },
            },
        },
        plans: {
            async set(userId: string, planCode: string | null, params: Scope = {}): Promise<MemberPlanResult> {
                enter("plans.set", [userId, planCode, params], params);
                if (planCode !== null && !manifest.plans?.some((plan) => plan.code === planCode)) throw error("PLAN_NOT_DECLARED", 422, `The manifest does not declare the plan ${planCode}`);
                const previousPlanCode = userPlans.get(userId) ?? null;
                if (planCode === null) userPlans.delete(userId);
                else userPlans.set(userId, planCode);
                return { userId, planCode, previousPlanCode };
            },
        },
    };

    function setHeld(userId: string, role: Role, entry: Held) {
        const roles = held.get(userId) ?? new Map<Role, Held>();
        roles.set(role, entry);
        held.set(userId, roles);
    }

    return {
        ...api,
        grantRole(userId, role, grant = {}) {
            if (!roleOf(role)) throw new Error(`createFakeAccess: the manifest does not declare the role ${role}`);
            setHeld(userId, role, { source: grant.source ?? "application", assignedAt: now(), expiresAt: grant.expiresAt ?? null });
        },
        revokeRole: (userId, role) => { held.get(userId)?.delete(role); },
        setPlan(userId, planCode) {
            if (planCode === null) userPlans.delete(userId);
            else userPlans.set(userId, planCode);
        },
        failNext: (pending) => { failure = { error: pending }; },
        get calls() {
            return calls;
        },
        reset() {
            held = new Map();
            userPlans = new Map();
            tuples = new Map();
            calls = [];
            failure = null;
        },
        permissionsOf: (role) => [...(roleOf(role)?.permissions ?? [])],
    };
}
