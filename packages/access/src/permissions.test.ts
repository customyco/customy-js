import { describe, expect, it, vi } from "vitest";
import { CustomyAccessError, createPermissionDirectory } from "./index";

type Role = "app.admin" | "app.viewer";
type Permission = "app.read" | "app.manage";

function stub(answers: Record<string, { roles: Role[]; permissions: Permission[] }>) {
    const effective = vi.fn(async (userId: string) => ({ userId, ...(answers[userId] ?? { roles: [], permissions: [] }) }));
    return { access: { permissions: { effective } } as never, effective };
}

describe("createPermissionDirectory", () => {
    it("answers can / hasRole / canAny / canAll from the effective permissions", async () => {
        const { access } = stub({ ana: { roles: ["app.viewer"], permissions: ["app.read"] } });
        const directory = createPermissionDirectory<Role, Permission>(access);
        expect(await directory.can("ana", "app.read")).toBe(true);
        expect(await directory.can("ana", "app.manage")).toBe(false);
        expect(await directory.hasRole("ana", "app.viewer")).toBe(true);
        expect(await directory.canAny("ana", ["app.manage", "app.read"])).toBe(true);
        expect(await directory.canAll("ana", ["app.manage", "app.read"])).toBe(false);
        expect(await directory.can("nobody", "app.read")).toBe(false);
    });

    it("require throws a 403 PERMISSION_DENIED naming the permission", async () => {
        const { access } = stub({});
        const directory = createPermissionDirectory<Role, Permission>(access);
        const failure = await directory.require("ana", "app.manage").catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(CustomyAccessError);
        expect(failure).toMatchObject({ code: "PERMISSION_DENIED", status: 403, body: { permission: "app.manage" } });
    });

    it("caches per user for ttlMs, deduplicates concurrent reads and can be invalidated", async () => {
        const { access, effective } = stub({ ana: { roles: ["app.admin"], permissions: ["app.manage"] } });
        let clock = 1_000;
        const directory = createPermissionDirectory<Role, Permission>(access, { ttlMs: 30_000, now: () => clock });
        await Promise.all([directory.can("ana", "app.manage"), directory.can("ana", "app.manage"), directory.hasRole("ana", "app.admin")]);
        expect(effective).toHaveBeenCalledTimes(1);
        clock += 29_000;
        await directory.can("ana", "app.manage");
        expect(effective).toHaveBeenCalledTimes(1);
        clock += 2_000;
        await directory.can("ana", "app.manage");
        expect(effective).toHaveBeenCalledTimes(2);
        directory.invalidate("ana");
        await directory.can("ana", "app.manage");
        expect(effective).toHaveBeenCalledTimes(3);
        await directory.can("bruno", "app.manage");
        directory.invalidate();
        await directory.can("bruno", "app.manage");
        expect(effective).toHaveBeenCalledTimes(5);
    });

    it("environments do not share entries, and ttlMs 0 never caches", async () => {
        const { access, effective } = stub({ ana: { roles: [], permissions: ["app.read"] } });
        const directory = createPermissionDirectory<Role, Permission>(access);
        await directory.can("ana", "app.read", { environmentId: "env_a" });
        await directory.can("ana", "app.read", { environmentId: "env_b" });
        expect(effective).toHaveBeenCalledTimes(2);
        const uncached = stub({});
        const fresh = createPermissionDirectory<Role, Permission>(uncached.access, { ttlMs: 0 });
        await fresh.can("ana", "app.read");
        await fresh.can("ana", "app.read");
        expect(uncached.effective).toHaveBeenCalledTimes(2);
    });

    it("fails closed: an Access error propagates and is not cached", async () => {
        const effective = vi.fn()
            .mockRejectedValueOnce(new CustomyAccessError({ code: "HTTP_503", status: 503 }))
            .mockResolvedValue({ userId: "ana", roles: ["app.admin"], permissions: ["app.manage"] });
        const directory = createPermissionDirectory<Role, Permission>({ permissions: { effective } } as never);
        await expect(directory.can("ana", "app.manage")).rejects.toMatchObject({ status: 503 });
        await expect(directory.can("ana", "app.manage")).resolves.toBe(true);
        expect(effective).toHaveBeenCalledTimes(2);
    });

    it("evicts the oldest user past maxEntries", async () => {
        const { access, effective } = stub({});
        const directory = createPermissionDirectory<Role, Permission>(access, { maxEntries: 2 });
        for (const id of ["a", "b", "c"]) await directory.can(id, "app.read");
        await directory.can("a", "app.read");
        expect(effective).toHaveBeenCalledTimes(4);
    });
});
