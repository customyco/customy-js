/**
 * Roles y permisos del usuario en la app, tal como los devuelve `GET /api/v1/me` (`application.roles` / `application.permissions`).
 * Funciones puras: la app pregunta `can("fund:invite")` o `hasRole("owner")` y no escribe ni una regla de rol. Mostrar u ocultar
 * no autoriza: el servidor de la app vuelve a decidir en cada petición (`createAccess().permissions.effective`).
 */
import type { AccessMeSnapshot } from "./capabilities";

/** Lo que alimenta a `accessGrantsFrom`: el snapshot de `/me`, su bloque `application`, o roles y permisos ya resueltos. */
export type AccessGrantsSource =
    | Pick<AccessMeSnapshot, "application">
    | { roles?: readonly string[] | null; permissions?: readonly string[] | null }
    | null
    | undefined;

export interface AccessGrants<Role extends string = string, Permission extends string = string> {
    /** Claves de los roles del manifiesto que el usuario tiene vigentes. */
    readonly roles: readonly Role[];
    /** Permisos que esos roles le dan. */
    readonly permissions: readonly Permission[];
    /** Clave de la app (manifiesto) a la que pertenecen, si el snapshot la trae. */
    readonly applicationKey: string | null;
    /** Plan efectivo del usuario en la app, si lo hay. */
    readonly plan: string | null;
    hasRole(role: Role): boolean;
    hasAnyRole(...roles: Role[]): boolean;
    can(permission: Permission): boolean;
    canAny(...permissions: Permission[]): boolean;
    canAll(...permissions: Permission[]): boolean;
}

function strings(value: readonly string[] | null | undefined): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * ```ts
 * const grants = accessGrantsFrom<CustomyRole, CustomyPermission>(await client.capabilities.getMe(envId));
 * if (grants.can("fund:invite")) showInvite();
 * ```
 * Sin snapshot, o con un servidor que aún no devuelve roles: nada concedido (los métodos responden `false`).
 */
export function accessGrantsFrom<Role extends string = string, Permission extends string = string>(source: AccessGrantsSource): AccessGrants<Role, Permission> {
    const application = source && "application" in source ? source.application ?? null : null;
    const block: { roles?: readonly string[] | null; permissions?: readonly string[] | null } | null = application ?? (source && !("application" in source) ? (source as { roles?: readonly string[] | null; permissions?: readonly string[] | null }) : null);
    const roles = strings(block?.roles) as Role[];
    const permissions = strings(block?.permissions) as Permission[];
    const heldRoles = new Set<string>(roles);
    const heldPermissions = new Set<string>(permissions);
    return {
        roles,
        permissions,
        applicationKey: application?.applicationKey ?? null,
        plan: application?.plan?.code ?? null,
        hasRole: (role) => heldRoles.has(role),
        hasAnyRole: (...wanted) => wanted.some((role) => heldRoles.has(role)),
        can: (permission) => heldPermissions.has(permission),
        canAny: (...wanted) => wanted.some((permission) => heldPermissions.has(permission)),
        canAll: (...wanted) => wanted.every((permission) => heldPermissions.has(permission)),
    };
}
