import { describe, expect, it } from "vitest";
import { CustomySdkError } from "@customyai/core";
import { createAccessAdmin } from "./admin";
import type { EntitlementExplanation, ResolveSettlementInput, SettlementResult, SubscriptionPolicyState } from "./commercial";

type Call = { url: URL; method: string; headers: Record<string, string>; body?: unknown };
function server(respond: (call: Call) => Response) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call: Call = {
            url: new URL(String(input)), method: init?.method ?? "GET",
            headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        };
        calls.push(call);
        return respond(call);
    }) as typeof globalThis.fetch;
    return { calls, fetch };
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const baseUrl = "https://access.fixture.invalid";
const terms = { payer: "customer", controller: "agency", resaleAllowed: true, planCreationAllowed: true, wholesaleDiscountBps: 500, resellablePlanCodes: null } as const;

describe("admin.commercial", () => {
    it("explain: GET with the workspace in the query, the administered env in the path, read-only", async () => {
        const { calls, fetch } = server(() => ok({ decision: { entitled: true, deniedBy: null }, steps: [] }));
        const admin = createAccessAdmin({ baseUrl, fetch, cookie: "s=1", scope: { environmentId: "env_admin" } });
        const result = await admin.commercial.explain({ organizationId: "org_1", projectId: "prj_1", environmentId: "env_ws", asOf: "2026-10-06T00:00:00.000Z" });
        expect(result.decision.entitled).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.method).toBe("GET");
        expect(calls[0]!.url.pathname).toBe("/api/admin/env/env_admin/orgs/org_1/entitlements/explain");
        expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ projectId: "prj_1", environmentId: "env_ws", asOf: "2026-10-06T00:00:00.000Z" });
        expect(calls[0]!.headers.cookie).toBe("s=1");
    });

    it("an explicit adminEnvironmentId wins and is never forwarded as a query/header", async () => {
        const { calls, fetch } = server(() => ok({ items: [] }));
        const admin = createAccessAdmin({ baseUrl, fetch });
        await admin.commercial.plans.list({ adminEnvironmentId: "env/with space" });
        expect(calls[0]!.url.pathname).toBe("/api/admin/env/env%2Fwith%20space/agency/plans");
        expect(calls[0]!.url.search).toBe("");
    });

    it("needs an administered environment", async () => {
        const admin = createAccessAdmin({ baseUrl, fetch: server(() => ok({})).fetch });
        expect(() => admin.commercial.plans.list()).toThrow(CustomySdkError);
    });

    it("relationships: list, get, set (PUT body carries terms and reason)", async () => {
        const { calls, fetch } = server(() => ok({ success: true, relationship: { version: 2 }, previousVersion: 1 }));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        await admin.commercial.relationships.list();
        await admin.commercial.relationships.get("org_c");
        const set = await admin.commercial.relationships.set("org_c", { terms, reason: "negotiated" });
        expect(set.previousVersion).toBe(1);
        expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
            "GET /api/admin/env/env_a/commercial/relationships",
            "GET /api/admin/env/env_a/commercial/relationships/org_c",
            "PUT /api/admin/env/env_a/commercial/relationships/org_c",
        ]);
        expect(calls[2]!.body).toEqual({ terms, reason: "negotiated" });
    });

    it("plans: validate, save and archive map to the agency routes", async () => {
        const { calls, fetch } = server(() => ok({ ok: true, success: true }));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        const plan = { slug: "gold", name: "Gold", basePlan: { code: "pro", version: 1 }, features: [{ featureLookupKey: "crm.contacts", config: { max: 10 } }], activate: true } as const;
        await admin.commercial.plans.validate(plan);
        await admin.commercial.plans.save(plan);
        await admin.commercial.plans.archive("org_a.gold", 2);
        expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
            "POST /api/admin/env/env_a/agency/plans/validate",
            "POST /api/admin/env/env_a/agency/plans",
            "POST /api/admin/env/env_a/agency/plans/org_a.gold/2/archive",
        ]);
        expect(calls[1]!.body).toEqual(plan);
    });

    it("migrateSubscribers defaults to a dry run and only writes when asked", async () => {
        const { calls, fetch } = server(() => ok({ success: true }));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        await admin.commercial.plans.migrateSubscribers("org_a.gold", 1, { toVersion: 2 });
        await admin.commercial.plans.migrateSubscribers("org_a.gold", 1, { toVersion: 2, dryRun: false });
        expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual(Array(2).fill("POST /api/admin/env/env_a/agency/plans/org_a.gold/1/migrate-subscribers"));
        expect(calls[0]!.body).toEqual({ dryRun: true, toVersion: 2 });
        expect(calls[1]!.body).toEqual({ dryRun: false, toVersion: 2 });
    });

    it("a refusal is a CustomySdkError that keeps the list of violations", async () => {
        const body = { error: "PLAN_CEILING_VIOLATION", message: "The plan was rejected", violations: [{ code: "PRICE_BELOW_COST", field: "prices[0]", message: "below cost" }] };
        const { fetch } = server(() => ok(body, 422));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        const error = await admin.commercial.plans.save({ slug: "x", name: "x", basePlan: { code: "pro", version: 1 }, features: [] }).catch((e) => e);
        expect(error).toBeInstanceOf(CustomySdkError);
        expect(error).toMatchObject({ status: 422 });
        expect((error as CustomySdkError & { body?: any }).body.violations[0].code).toBe("PRICE_BELOW_COST");
    });

    it("agencies (operator), plan detail and the publish simulator map to their routes", async () => {
        const { calls, fetch } = server(() => ok({ agencies: [], ok: true }));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        await admin.commercial.relationships.agencies({ search: "acme", limit: 20 });
        await admin.commercial.relationships.agencies();
        await admin.commercial.plans.get("org_a.gold", 2);
        const plan = { slug: "gold", name: "Gold", basePlan: { code: "pro", version: 1 }, features: [] } as const;
        await admin.commercial.plans.simulate(plan);
        expect(calls.map((c) => `${c.method} ${c.url.pathname}${c.url.search}`)).toEqual([
            "GET /api/admin/env/env_a/commercial/agencies?search=acme&limit=20",
            "GET /api/admin/env/env_a/commercial/agencies",
            "GET /api/admin/env/env_a/agency/plans/org_a.gold/2",
            "POST /api/admin/env/env_a/agency/plans/simulate",
        ]);
        expect(calls[3]!.body).toEqual(plan);
    });
});

// Fixture = the shape and numbers of Access's own tests (entitlement-explain.test.ts "settlement steps in explain" and
// edge-settlement.test.ts): client pays 9000, list 10000, agency edge discount 2000 bps -> agency owes 8000, margin 1000.
const settlementFixture = {
    schemaVersion: 1, asOf: "2026-06-01T00:00:00.000Z", organizationId: "client", currency: "USD", chargedMinor: "9000",
    list: { amountMinor: "10000", source: "base_plan" },
    billTo: { party: "customer", organizationId: "client", name: "Client" },
    differsFromToday: false,
    legs: [
        { fromOrganizationId: "client", toOrganizationId: "agency", basis: "charged", amountMinor: "9000", edge: { relationshipId: null, version: null, source: "default", wholesaleDiscountBps: 0, payer: "customer" } },
        { fromOrganizationId: "agency", toOrganizationId: null, basis: "cost_basis", amountMinor: "8000", edge: { relationshipId: "r0", version: 2, source: "explicit", wholesaleDiscountBps: 2000, payer: "customer" } },
    ],
    margins: [
        { organizationId: "agency", name: "Agency", receivedMinor: "9000", owedMinor: "8000", marginMinor: "1000" },
        { organizationId: "client", name: "Client", receivedMinor: "0", owedMinor: "9000", marginMinor: "-9000" },
    ],
    platformNetMinor: "8000",
    steps: [{ code: "LIST_PRICE", effect: "info", message: "list price 10000 USD minor (base_plan)", refs: { listMinor: "10000", source: "base_plan" } }],
    inputsHash: "0".repeat(64),
} as const satisfies SettlementResult;

describe("admin.commercial settlement and subscription states", () => {
    it("explain exposes the settlement section and SETTLEMENT / grace steps with precise types", async () => {
        const body = {
            schemaVersion: 1, asOf: "2026-06-01T00:00:00.000Z", organizationId: "client", projectId: "p", environmentId: "e",
            decision: { entitled: true, deniedBy: null }, plan: null, chain: [], ceilings: [], ceilingStatus: "ok", ceilingViolations: [],
            entitlements: [], limits: {}, settlement: settlementFixture,
            steps: [
                { code: "SUBSCRIPTION_GRACE", effect: "limit", message: "payment overdue: grace window ends at 2026-06-04T00:00:00.000Z, then soft block", refs: { graceEndsAt: "2026-06-04T00:00:00.000Z" } },
                { code: "SETTLEMENT", effect: "info", message: "[LEG] client owes agency 9000 USD minor (charged)", refs: { from: "client", to: "agency", basis: "charged", amountMinor: "9000" } },
            ],
            inputsHash: "h",
        } satisfies EntitlementExplanation;
        const { fetch } = server(() => ok(body));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        const why = await admin.commercial.explain({ organizationId: "client", projectId: "p", environmentId: "e" });
        expect(why.settlement?.billTo.party).toBe("customer");
        expect(why.settlement?.legs.map((l) => [l.fromOrganizationId, l.basis, l.amountMinor])).toEqual([["client", "charged", "9000"], ["agency", "cost_basis", "8000"]]);
        expect(why.settlement?.margins.find((m) => m.organizationId === "agency")?.marginMinor).toBe("1000");
        expect(why.steps.map((s) => s.code)).toEqual(["SUBSCRIPTION_GRACE", "SETTLEMENT"]);
    });

    it("settlement.resolve: POST with the body as is, under the administered env, returns the typed result", async () => {
        const { calls, fetch } = server(() => ok(settlementFixture));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        const input: ResolveSettlementInput = { organizationId: "org_client", asOf: "2026-06-01T00:00:00.000Z", chargedMinor: "10000", currency: "usd", kind: "subscription", planCode: "pro", planVersion: 2 };
        const r = await admin.commercial.settlement.resolve(input);
        expect(r.platformNetMinor).toBe("8000");
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.url.pathname).toBe("/api/admin/env/env_a/commercial/settlement/resolve");
        expect(calls[0]!.body).toEqual(input);
    });

    it("settlement.resolve surfaces the operator-only refusal as a CustomySdkError", async () => {
        const { fetch } = server(() => ok({ error: "PLATFORM_OPERATOR_ONLY", message: "settlement resolution is a platform billing operation" }, 403));
        const admin = createAccessAdmin({ baseUrl, fetch, scope: { environmentId: "env_a" } });
        await expect(admin.commercial.settlement.resolve({ organizationId: "o", asOf: "2026-06-01T00:00:00.000Z", chargedMinor: "1", currency: "USD" })).rejects.toBeInstanceOf(CustomySdkError);
    });

    it("subscription policy states include past_due (grace) and soft_blocked (read-only)", () => {
        const states: SubscriptionPolicyState[] = ["active", "trialing", "past_due", "soft_blocked", "paused", "canceled", "expired"];
        expect(states).toContain("past_due");
        expect(states).toContain("soft_blocked");
    });
});
