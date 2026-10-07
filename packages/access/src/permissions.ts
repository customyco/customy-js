/**
 * Directorio de permisos de una app en el servidor: «¿puede este usuario hacer X?» contra Access, con caché corta y sin nombres de rol.
 * Es lo que cada app escribía a mano sobre `permissions.effective` (caché por usuario, fallar cerrado, un error claro al denegar).
 *
 * ```ts
 * const permissions = createPermissionDirectory<CustomyRole, CustomyPermission>(access);
 * await permissions.require(userId, "bonu.funds.manage");   // lanza CustomyAccessError 403 PERMISSION_DENIED
 * if (await permissions.can(userId, "bonu.support.read")) …
 * ```
 *
 * Falla cerrado: si Access no responde, `can` rechaza con el error de Access (nunca devuelve `true` por defecto) y el fallo no se
 * cachea. Un cambio de rol se ve al caducar la caché (`ttlMs`, 30 s por defecto) o con `invalidate(userId)`.
 */
import type { CustomyAccess } from "./facade";
import { CustomyAccessError } from "./errors";
import type { AppEffectivePermissions } from "./types";

export type PermissionDirectoryOptions = Readonly<{
    /** Cuánto se recuerdan los permisos de un usuario, en ms (por defecto 30 000; 0 desactiva la caché). */
    ttlMs?: number;
    /** Tope de usuarios en memoria; al llenarse sale el más antiguo (por defecto 1000). */
    maxEntries?: number;
    now?: () => number;
}>;

type CallScope = Readonly<{ environmentId?: string; signal?: AbortSignal; timeoutMs?: number }>;

export interface PermissionDirectory<Role extends string = string, Permission extends string = string> {
    /** Roles y permisos vigentes del usuario (de la caché si es reciente). */
    effective(userId: string, scope?: CallScope): Promise<AppEffectivePermissions<Role, Permission>>;
    can(userId: string, permission: Permission, scope?: CallScope): Promise<boolean>;
    canAny(userId: string, permissions: readonly Permission[], scope?: CallScope): Promise<boolean>;
    canAll(userId: string, permissions: readonly Permission[], scope?: CallScope): Promise<boolean>;
    hasRole(userId: string, role: Role, scope?: CallScope): Promise<boolean>;
    /** Como `can`, pero lanza `CustomyAccessError` (403, `PERMISSION_DENIED`, con `body.permission`) si no lo tiene. */
    require(userId: string, permission: Permission, scope?: CallScope): Promise<void>;
    /** Olvida a un usuario (p. ej. tras asignarle o quitarle un rol) o, sin argumento, a todos. */
    invalidate(userId?: string): void;
}

export function createPermissionDirectory<Role extends string = string, Permission extends string = string>(
    access: Pick<CustomyAccess<string, Role, Permission>, "permissions">,
    options: PermissionDirectoryOptions = {},
): PermissionDirectory<Role, Permission> {
    const ttlMs = Math.max(0, options.ttlMs ?? 30_000);
    const maxEntries = Math.max(1, options.maxEntries ?? 1000);
    const now = options.now ?? Date.now;
    const entries = new Map<string, { at: number; value: AppEffectivePermissions<Role, Permission> }>();
    const inflight = new Map<string, Promise<AppEffectivePermissions<Role, Permission>>>();
    const keyOf = (userId: string, scope?: CallScope) => `${scope?.environmentId ?? ""}\u0000${userId}`;

    function effective(userId: string, scope?: CallScope) {
        const key = keyOf(userId, scope);
        const hit = entries.get(key);
        if (hit && ttlMs > 0 && now() - hit.at < ttlMs) return Promise.resolve(hit.value);
        const pending = inflight.get(key);
        if (pending) return pending;
        const request = access.permissions.effective(userId, scope ?? {}).then((value) => {
            if (ttlMs > 0) {
                entries.delete(key);
                entries.set(key, { at: now(), value });
                while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
            }
            return value;
        }).finally(() => inflight.delete(key));
        inflight.set(key, request);
        return request;
    }

    const can = async (userId: string, permission: Permission, scope?: CallScope) => (await effective(userId, scope)).permissions.includes(permission);
    return {
        effective,
        can,
        canAny: async (userId, permissions, scope) => {
            const held = (await effective(userId, scope)).permissions;
            return permissions.some((permission) => held.includes(permission));
        },
        canAll: async (userId, permissions, scope) => {
            const held = (await effective(userId, scope)).permissions;
            return permissions.every((permission) => held.includes(permission));
        },
        hasRole: async (userId, role, scope) => (await effective(userId, scope)).roles.includes(role),
        async require(userId, permission, scope) {
            if (await can(userId, permission, scope)) return;
            throw new CustomyAccessError({ code: "PERMISSION_DENIED", status: 403, message: `User lacks the "${permission}" permission`, body: { permission } });
        },
        invalidate(userId) {
            if (userId === undefined) {
                entries.clear();
                return;
            }
            for (const key of [...entries.keys()]) if (key.endsWith(`\u0000${userId}`)) entries.delete(key);
        },
    };
}
