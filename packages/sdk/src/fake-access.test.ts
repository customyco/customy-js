import { CustomyAccessError, createPermissionDirectory, type CustomyAccess } from "@customyai/access";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeAccess } from "./testing";

const manifest = {
    key: "bonu",
    capabilities: [{ lookupKey: "ai.coach", type: "metered" as const }, { lookupKey: "export.pdf", type: "boolean" as const }, { lookupKey: "theme", type: "config" as const }],
    plans: [
        { code: "free", capabilities: { "ai.coach": 3 } },
        { code: "black", capabilities: { "ai.coach": 200, "export.pdf": true, theme: "dark" } },
    ],
    roles: [
        { key: "bonu.admin", name: "Admin", permissions: ["bonu.funds.read", "bonu.funds.manage"] },
        { key: "bonu.viewer", permissions: ["bonu.funds.read"] },
    ],
};
type Capability = "ai.coach" | "export.pdf" | "theme";
type Role = "bonu.admin" | "bonu.viewer";
type Permission = "bonu.funds.read" | "bonu.funds.manage";
const make = (now?: () => number) => createFakeAccess<Capability, Role, Permission>({ manifest, now });

describe("createFakeAccess: roles and permissions", () => {
    it("resolves effective roles and permissions from the manifest, sorted and without expired assignments", async () => {
        let clock = 1_000;
        const access = make(() => clock);
        access.grantRole("usr_1", "bonu.admin");
        access.grantRole("usr_1", "bonu.viewer", { expiresAt: 2_000 });
        expect(await access.permissions.effective("usr_1")).toEqual({ userId: "usr_1", roles: ["bonu.admin", "bonu.viewer"], permissions: ["bonu.funds.manage", "bonu.funds.read"] });
        clock = 2_001;
        expect((await access.permissions.effective("usr_1")).roles).toEqual(["bonu.admin"]);
        expect(await access.permissions.effective("nobody")).toEqual({ userId: "nobody", roles: [], permissions: [] });
        expect(access.permissionsOf("bonu.viewer")).toEqual(["bonu.funds.read"]);
    });

    it("is what the app's permission directory runs on, including fail-closed", async () => {
        const access = make();
        access.grantRole("usr_1", "bonu.viewer");
        const directory = createPermissionDirectory<Role, Permission>(access, { ttlMs: 0 });
        expect(await directory.can("usr_1", "bonu.funds.read")).toBe(true);
        await expect(directory.require("usr_1", "bonu.funds.manage")).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
        access.failNext(new CustomyAccessError({ code: "HTTP_503", status: 503 }));
        await expect(directory.can("usr_1", "bonu.funds.read")).rejects.toMatchObject({ status: 503 });
        expect(await directory.can("usr_1", "bonu.funds.read")).toBe(true); // failNext is one-shot
    });

    it("appRoles: list, assign, revoke; the Workspace's assignments are not overwritten; undeclared roles are refused", async () => {
        const access = make();
        expect((await access.appRoles.list()).map((role) => role.key)).toEqual(["bonu.admin", "bonu.viewer"]);
        await access.appRoles.assignments.assign({ userId: "usr_1", roleKey: "bonu.admin" });
        expect(await access.appRoles.assignments.list({ userId: "usr_1" })).toMatchObject([{ roleKey: "bonu.admin", source: "application" }]);
        await access.appRoles.assignments.revoke({ userId: "usr_1", roleKey: "bonu.admin" });
        expect(await access.appRoles.assignments.list()).toEqual([]);
        access.grantRole("usr_2", "bonu.admin", { source: "workspace" });
        await expect(access.appRoles.assignments.revoke({ userId: "usr_2", roleKey: "bonu.admin" })).rejects.toMatchObject({ code: "ASSIGNMENT_MANAGED_BY_WORKSPACE" });
        await expect(access.appRoles.assignments.assign({ userId: "usr_1", roleKey: "bonu.ghost" as Role })).rejects.toMatchObject({ code: "ROLE_NOT_FOUND" });
    });

    it("explain tells why: granted, expired, not assigned or not declared", async () => {
        let clock = 1_000;
        const access = make(() => clock);
        access.grantRole("usr_1", "bonu.admin", { expiresAt: 2_000 });
        expect(await access.permissions.explain("usr_1", "bonu.funds.manage")).toMatchObject({ allowed: true, reason: "granted", grantedBy: [{ role: "bonu.admin", source: "application" }] });
        expect(await access.permissions.explain("usr_2", "bonu.funds.manage")).toMatchObject({ allowed: false, reason: "not_assigned", grantableBy: ["bonu.admin"] });
        expect(await access.permissions.explain("usr_1", "bonu.ghost" as Permission)).toMatchObject({ reason: "not_declared" });
        clock = 3_000;
        expect(await access.permissions.explain("usr_1", "bonu.funds.manage")).toMatchObject({ allowed: false, reason: "expired", expired: [{ role: "bonu.admin", expiredAt: 2_000 }] });
    });

    it("a foreign environment is refused like the real service", async () => {
        const access = make();
        await expect(access.permissions.effective("usr_1", { environmentId: "env_other" })).rejects.toMatchObject({ code: "ENVIRONMENT_FORBIDDEN", status: 403 });
        await expect(access.permissions.effective("usr_1", { environmentId: "env_fake" })).resolves.toBeTruthy();
    });
});

describe("createFakeAccess: me, plans and capabilities", () => {
    it("me carries application.roles / permissions and the plan; capabilities.check uses the real decision", async () => {
        const access = make();
        access.grantRole("usr_1", "bonu.admin");
        const me = await access.me({ userId: "usr_1" });
        expect(me.application).toMatchObject({ applicationKey: "bonu", plan: { code: "free", source: "default" }, roles: ["bonu.admin"], capabilities: { "ai.coach": 3, "export.pdf": false, theme: null } });
        expect(await access.capabilities.check("export.pdf", { userId: "usr_1" })).toMatchObject({ allowed: false, source: "application", plan: "free" });
        await access.plans.set("usr_1", "black");
        expect(await access.capabilities.checkMany(["ai.coach", "export.pdf"], { userId: "usr_1" })).toMatchObject({ "ai.coach": { allowed: true, value: 200 }, "export.pdf": { allowed: true } });
        expect(await access.plans.set("usr_1", null)).toEqual({ userId: "usr_1", planCode: null, previousPlanCode: "black" });
        await expect(access.plans.set("usr_1", "gold")).rejects.toMatchObject({ code: "PLAN_NOT_DECLARED" });
    });

    it("without a user the snapshot has no roles", async () => {
        const me = await make().me();
        expect(me.user).toBeNull();
        expect(me.application).toMatchObject({ roles: [], permissions: [] });
    });
});

describe("createFakeAccess: relationships", () => {
    const tuple = (subjectType: string, subjectId: string, relation: string, objectType: string, objectId: string) => ({ subjectType, subjectId, relation, objectType, objectId });

    it("keeps tuples in the app namespace and evaluates owner, direct and role checks like Access", async () => {
        const access = make();
        const result = await access.relationships.write({ writes: [
            tuple("user", "ana", "owner", "bonu/fund", "f1"),
            tuple("user", "bruno", "perm:fund.pay", "bonu/fund", "f1"),
            tuple("user", "carla", "role:treasurer", "bonu/fund", "f1"),
            tuple("bonu/role", "f1#treasurer", "perm:fund.pay", "bonu/fund", "f1"),
        ] });
        expect(result).toMatchObject({ written: 4, deleted: 0 });
        expect((await access.relationships.write({ writes: [tuple("user", "ana", "owner", "bonu/fund", "f1")] })).written).toBe(0);
        const check = (id: string, permission = "fund.pay") => ({ subject: { type: "user" as const, id }, permission, object: { type: "bonu/fund", id: "f1" } });
        expect(await access.permissions.checkMany([check("ana"), check("bruno"), check("carla"), check("dario"), check("carla", "fund.close")])).toEqual([
            { allowed: true, via: "owner" }, { allowed: true, via: "direct" }, { allowed: true, via: "role:treasurer" }, { allowed: false, via: null }, { allowed: false, via: null },
        ]);
        expect((await access.relationships.list({ objectType: "bonu/fund", relation: "owner" })).tuples).toHaveLength(1);
        await expect(access.relationships.write({ writes: [tuple("user", "ana", "owner", "other/fund", "f1")] })).rejects.toMatchObject({ code: "NAMESPACE_FORBIDDEN" });
        await expect(access.relationships.list({ objectType: "other/fund" })).rejects.toMatchObject({ code: "NAMESPACE_FORBIDDEN" });
        expect(await access.relationships.write({ deletes: [tuple("user", "ana", "owner", "bonu/fund", "f1")] })).toMatchObject({ deleted: 1 });
    });

    it("reset empties roles, plans, tuples and calls; calls records every method", async () => {
        const access = make();
        access.grantRole("usr_1", "bonu.admin");
        await access.plans.set("usr_1", "black");
        await access.relationships.write({ writes: [tuple("user", "ana", "owner", "bonu/fund", "f1")] });
        expect(access.calls.map((call) => call.method)).toEqual(["plans.set", "relationships.write"]);
        access.reset();
        expect(access.calls).toEqual([]);
        expect((await access.permissions.effective("usr_1")).roles).toEqual([]);
        expect((await access.me({ userId: "usr_1" })).application?.plan?.code).toBe("free");
    });
});

describe("createFakeAccess: shape", () => {
    it("is assignable where the app takes the real facade's methods", () => {
        const access = make();
        type Needed = Pick<CustomyAccess<Capability, Role, Permission>, "permissions" | "appRoles">;
        const needed: Needed = access;
        expect(needed.permissions.effective).toBeTypeOf("function");
        expectTypeOf(access.grantRole).parameter(1).toEqualTypeOf<Role>();
    });
});
