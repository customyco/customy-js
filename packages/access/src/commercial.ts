/**
 * Agency plans, commercial relationship per org-tree edge and the entitlement explanation (Access, phase 1).
 *
 * `admin.commercial` is a typed layer over `/api/admin/env/{envId}/...`; it uses the admin client's credential and
 * scope, so the caller must administer the environment (session cookie of an org admin, or an admin machine key).
 * `explain` is read-only. Writes are decided by Access (no escalation, ceiling, immutable plan versions): a refusal
 * is a `CustomySdkError` whose `body.violations` lists every rule that failed.
 *
 * ```ts
 * const why = await admin.commercial.explain({ organizationId, projectId, environmentId });
 * why.decision.entitled; why.plan?.inheritedFrom; why.ceilings; why.steps;
 * ```
 */
import type { AccessAdminCallOptions } from "./admin";

export type CommercialPayer = "agency" | "platform" | "customer";
export type CommercialController = "platform" | "agency" | "customer";

/** What an edge (parent -> child; the platform is the parent of a root org) means commercially. */
export type CommercialTerms = Readonly<{
    payer: CommercialPayer;
    controller: CommercialController;
    /** The child may resell the parent's plans to its own children. */
    resaleAllowed: boolean;
    /** The child may create its own plans, always inside the ceiling of a base plan. */
    planCreationAllowed: boolean;
    /** Cost basis of the child toward the parent: list price * (1 - bps / 10000). 0..10000. */
    wholesaleDiscountBps: number;
    /** `null` = every active parent plan; a list narrows it (never widens down the tree). */
    resellablePlanCodes: readonly string[] | null;
}>;

/** The version in force of an edge. `source: "default"` = no row: today's behaviour. */
export type CommercialRelationship = Readonly<{
    terms: CommercialTerms;
    source: "explicit" | "default";
    relationshipId: string | null;
    version: number | null;
    parentOrganizationId: string | null;
    childOrganizationId: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
}>;

export type CommercialRelationshipVersion = CommercialTerms & Readonly<{
    id: string;
    parentOrganizationId: string | null;
    childOrganizationId: string;
    version: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: string | null;
    createdBy: string | null;
}>;

export type SetCommercialRelationshipInput = Readonly<{
    terms: CommercialTerms;
    /** ISO date-time; defaults to now. Backdating is refused. */
    effectiveFrom?: string;
    /** Required: every version is audited. */
    reason: string;
}>;

export type AgencyPlanInput = Readonly<{
    /** The plan code becomes `<organizationId>.<slug>`. */
    slug: string;
    /** Omit for a new version; an existing DRAFT version is updated; active/archived versions are immutable. */
    version?: number;
    name: string;
    /** The plan this one derives from and is capped by (a plan the organization may resell). */
    basePlan: Readonly<{ code: string; version: number }>;
    features: ReadonlyArray<Readonly<{ featureLookupKey: string; config?: Readonly<Record<string, unknown>> }>>;
    limits?: Readonly<Record<string, unknown>>;
    eligibleAddOns?: readonly string[];
    /** Only `flat` and `per_unit` prices can be proven against the cost basis. */
    prices?: ReadonlyArray<Readonly<{ model: string; recurrence: "one_time" | "monthly" | "annual" | "usage"; currency: string; config: Readonly<Record<string, unknown>> }>>;
    rank?: number;
    metadata?: Readonly<Record<string, unknown>>;
    /** `true` publishes the version (ceiling re-checked, then immutable); default is a draft. */
    activate?: boolean;
}>;

export type PlanSummary = Readonly<{
    code: string;
    version: number;
    name: string;
    status: string;
    rank: number;
    ownerOrganizationId: string | null;
    basePlan: Readonly<{ code: string; version: number }> | null;
}>;

export type CeilingViolation = Readonly<{
    code: string;
    path: string;
    message: string;
    candidate?: unknown;
    ceiling?: unknown;
}>;

export type PlanValidation = Readonly<{
    ok: boolean;
    code: string;
    violations: readonly CeilingViolation[];
    applied: Readonly<{
        basePlan: Readonly<{ code: string; version: number }>;
        wholesaleDiscountBps: number;
        priceFloors: ReadonlyArray<Readonly<{ recurrence: string; currency: string; baseAmountMinor: number | null; floorMinor: number }>>;
        productAllowlist: readonly string[] | null;
    }> | null;
    /** `PLAN_CREATION_NOT_ALLOWED`, `BASE_PLAN_NOT_VISIBLE`, `PLAN_CEILING_VIOLATION`, `INVALID_SLUG` or null. */
    blockedBy: string | null;
}>;

export type VisiblePlans = Readonly<{
    organizationId: string;
    canCreatePlans: boolean;
    relationship: CommercialRelationship | undefined;
    /** Platform plans the organization may resell (allowlists applied) plus active plans of ancestor agencies. */
    inherited: ReadonlyArray<PlanSummary & Readonly<{ inheritedFrom: string | null }>>;
    own: readonly PlanSummary[];
    platformAllowlist: readonly string[] | null;
    /** Platform operators only: every active platform plan code, for a catalog-wide allowlist picker. */
    catalogPlanCodes?: readonly string[];
}>;

/** What the caller may choose when writing an edge: each refused choice carries the violation code and message of the rule. */
export type CommercialEdgeChoice<T> = Readonly<{ value: T; allowed: boolean; reasonCode?: string; reason?: string }>;
export type CommercialEdgeOptions = Readonly<{
    payer: ReadonlyArray<CommercialEdgeChoice<CommercialPayer>>;
    controller: ReadonlyArray<CommercialEdgeChoice<CommercialController>>;
    resaleAllowed: Readonly<{ canEnable: boolean; reasonCode?: string; reason?: string }>;
    planCreationAllowed: Readonly<{ canEnable: boolean; reasonCode?: string; reason?: string }>;
    /** Largest discount (basis points) the caller may set. */
    maxDiscountBps: number;
    /** `null` = any plan code (and "all plans") is allowed; a list = only subsets of it. */
    allowlistCeiling: readonly string[] | null;
    /** Only a platform operator may touch this edge. */
    locked: boolean;
}>;

/** Content of a plan version (what the editor and the simulator work on). */
export type PlanContent = Readonly<{
    features: ReadonlyArray<Readonly<{ featureLookupKey: string; config: Readonly<Record<string, unknown>> }>>;
    limits: Readonly<Record<string, unknown>>;
    eligibleAddOns: readonly string[];
    prices: ReadonlyArray<Readonly<{ model: string; recurrence: string; currency: string; config: Readonly<Record<string, unknown>> }>>;
}>;

export type PlanDetail = Readonly<{ plan: PlanSummary; owned: boolean; content: PlanContent; ceilingProof: Readonly<Record<string, unknown>> | null }>;

/** What a save of `plan` would decide and produce (nothing is stored): verdict, resulting entitlements, price margin and diffs. */
export type PlanSimulation = Readonly<{
    ok: boolean;
    blockedBy: string | null;
    code: string;
    version: number;
    status: "draft" | "active";
    immutableAfterSave: boolean;
    violations: readonly CeilingViolation[];
    applied: PlanValidation["applied"];
    resulting: Readonly<{
        features: PlanContent["features"];
        limits: Readonly<Record<string, unknown>>;
        eligibleAddOns: readonly string[];
        prices: ReadonlyArray<Readonly<{ model: string; recurrence: string; currency: string; amountMinor: number | null; floorMinor: number | null; marginMinor: number | null }>>;
    }>;
    diffVsBase: Readonly<Record<string, unknown>> | null;
    previousVersion: number | null;
    diffVsPrevious: Readonly<Record<string, unknown>> | null;
    /** Workspaces subscribed to this plan code (null when the code has no versions of this organization yet). */
    subscribers: PlanSubscriberImpact | null;
}>;

/** Who a plan change touches: workspaces that follow the newest active version change by themselves, pinned ones only move when asked. */
export type PlanSubscriberImpact = Readonly<{
    code: string;
    total: number;
    following: number;
    pinned: ReadonlyArray<Readonly<{ version: number; count: number }>>;
    sample: ReadonlyArray<Readonly<{ organizationId: string; projectId: string; environmentId: string; status: string; planVersionPin: number | null }>>;
    truncated: boolean;
}>;

export type MigratePlanSubscribersResult = Readonly<{
    success: true;
    /** true = nothing was written; `movable` says how many workspaces would move. */
    dryRun: boolean;
    code: string;
    from: number;
    to: number;
    movable: number;
    moved: number;
    sample: PlanSubscriberImpact["sample"];
    truncated: boolean;
}>;

/** Subscription states Access's declared policy knows (`SUBSCRIPTION_ACCESS_POLICY`); any other state denies. */
export type SubscriptionPolicyState = "active" | "trialing" | "past_due" | "soft_blocked" | "paused" | "canceled" | "expired";
/** Declared posture of a state: `grace` = still entitled, a payment is overdue; `read_only` = soft block (no entitlements, data kept). */
export type SubscriptionAccessMode = "full" | "grace" | "read_only" | "none";
/** One row of the declared policy, as explain reports it in `SUBSCRIPTION_STATE` step refs (`status`, `mode`). */
export type SubscriptionAccessPolicyEntry = Readonly<{ entitled: boolean; mode: SubscriptionAccessMode; note: string }>;

/** Step codes explain emits today. The wire type stays open (`string`) because new codes are additive. */
export type ExplainStepCode =
    | "SUBSCRIPTION_FOUND" | "NO_SUBSCRIPTION" | "SUBSCRIPTION_STATE" | "SUBSCRIPTION_EXPIRED"
    | "PLAN_RESOLVED" | "PLAN_NOT_FOUND" | "PLAN_NOT_VISIBLE" | "PLAN_ARCHIVED"
    | "CEILING_OK" | "CEILING_DRIFT" | "CEILING_UNVERIFIABLE"
    | "RELATIONSHIP" | "GUARDRAIL_PRODUCT_ALLOWLIST"
    | "OVERRIDE_APPLIED" | "OVERRIDE_IGNORED"
    | "SUBSCRIPTION_GRACE" | "SUBSCRIPTION_SOFT_BLOCK"
    | "SETTLEMENT";

export type ExplainStep = Readonly<{
    /** An {@link ExplainStepCode}; `SETTLEMENT` steps carry the settlement step code in brackets at the start of `message`, e.g. `[LEG] ...`. */
    code: ExplainStepCode | (string & {});
    effect: "allow" | "deny" | "info" | "limit";
    message: string;
    /** `SUBSCRIPTION_GRACE`: `{ graceEndsAt: string | null }`; `SUBSCRIPTION_SOFT_BLOCK`: `{ pastDueSince, graceEndsAt }` (ISO). */
    refs?: Readonly<Record<string, unknown>>;
}>;

/** Settlement mode of Billing's `billing_edge_settlement` flag (`on` is reserved: it behaves as `shadow`). */
export type SettlementMode = "off" | "shadow" | "on";
export type SettlementListPriceSource = "platform_plan" | "base_plan" | "usage_list" | "explicit" | "unknown";
export type SettlementStepCode =
    | "PAYER_CUSTOMER" | "PAYER_AGENCY" | "PAYER_PLATFORM"
    | "PAYER_AGENCY_NOT_BILLABLE" | "PAYER_AGENCY_INVALID"
    | "LIST_PRICE" | "LIST_PRICE_UNKNOWN" | "LIST_PRICE_ASSUMED_CHARGED"
    | "LEG" | "MARGIN_NEGATIVE" | "NO_CHAIN";

export type SettlementStep = Readonly<{
    code: SettlementStepCode;
    effect: "info" | "limit" | "deny";
    message: string;
    refs?: Readonly<Record<string, unknown>>;
}>;

/** One amount owed along the chain. Amounts are minor units as decimal strings; `null` = unpriced (list price unknown). */
export type SettlementLeg = Readonly<{
    fromOrganizationId: string;
    /** `null` = the platform. */
    toOrganizationId: string | null;
    /** `charged` = the workspace pays its plan price; `cost_basis` = list x (1 - discount); `absorbed` = someone above pays instead. */
    basis: "charged" | "cost_basis" | "absorbed";
    amountMinor: string | null;
    edge: Readonly<{ relationshipId: string | null; version: number | null; source: "explicit" | "default"; wholesaleDiscountBps: number; payer: CommercialPayer }>;
}>;

export type SettlementMargin = Readonly<{ organizationId: string; name: string; receivedMinor: string; owedMinor: string; marginMinor: string }>;

/**
 * Who pays and at which price for ONE charge, with the relationship versions in force at `asOf`. Deterministic
 * (`inputsHash`). In this phase it is a shadow: no charge changes because of it.
 */
export type SettlementResult = Readonly<{
    schemaVersion: number;
    asOf: string;
    /** The workspace's organization; `null` only when the chain was empty. */
    organizationId: string | null;
    currency: string;
    chargedMinor: string;
    list: Readonly<{ amountMinor: string | null; source: SettlementListPriceSource }>;
    /** Who is finally billed. `party: "platform"` with `organizationId: null` = absorbed by the platform. */
    billTo: Readonly<{ party: "customer" | "agency" | "platform"; organizationId: string | null; name: string | null }>;
    /** `true` when `billTo` is not the workspace itself (today's behaviour is always the workspace). */
    differsFromToday: boolean;
    legs: readonly SettlementLeg[];
    /** Net per organization (only when every leg is priced; otherwise empty). */
    margins: readonly SettlementMargin[];
    /** What the platform collects for this charge; `null` when unpriced. */
    platformNetMinor: string | null;
    steps: readonly SettlementStep[];
    inputsHash: string;
}>;

/** Body of `POST .../commercial/settlement/resolve` (platform operators only; read-only). */
export type ResolveSettlementInput = Readonly<{
    /** The workspace's organization (Billing's `org_`-prefixed spelling is accepted too). */
    organizationId: string;
    /** ISO date-time: the relationship versions in force at that moment decide. */
    asOf: string;
    /** Net amount charged to the workspace, minor units before tax, as a decimal string of 1 to 18 digits. */
    chargedMinor: string;
    /** 3-letter currency code (upper-cased by Access). */
    currency: string;
    /** Billing invoice kind; `usage`, `usage_advance`, `extra_usage` and `progressive` settle at charged = list. */
    kind?: string;
    planCode?: string | null;
    planVersion?: number | null;
    recurrence?: "monthly" | "annual" | null;
    /** Opaque references echoed into the hash. */
    refs?: Readonly<Record<string, unknown>>;
}>;

/** Why a workspace has (or lacks) what it has: plan, who it is inherited from, which ceilings applied. Deterministic. */
export type EntitlementExplanation = Readonly<{
    schemaVersion: number;
    asOf: string;
    organizationId: string;
    projectId: string;
    environmentId: string;
    decision: Readonly<{ entitled: boolean; deniedBy: string | null }>;
    plan: Readonly<{
        code: string;
        version: number;
        name: string;
        origin: "platform" | "agency";
        ownerOrganizationId: string | null;
        inheritedFrom: Readonly<{ organizationId: string; name: string }> | null;
        basePlan: Readonly<{ code: string; version: number }> | null;
        pinnedVersion: number | null;
    }> | null;
    /** Root first; `relationship` is the edge INTO that organization. */
    chain: ReadonlyArray<Readonly<{ organizationId: string; name: string; type: string; relationship: Omit<CommercialRelationship, "childOrganizationId"> }>>;
    ceilings: ReadonlyArray<Readonly<{
        source: "base_plan" | "relationship_allowlist" | "relationship_discount" | "guardrail_product_allowlist";
        appliedBy: string | null;
        detail: Readonly<Record<string, unknown>>;
    }>>;
    /** `drift`: the current ceiling is tighter than when the plan was published (the plan stays valid until replaced). */
    ceilingStatus: "ok" | "drift" | "not_applicable" | "unverifiable";
    ceilingViolations: readonly CeilingViolation[];
    entitlements: ReadonlyArray<Readonly<{ featureLookupKey: string; enabled: boolean; config: Readonly<Record<string, unknown>>; source: "plan" | "override"; overrideId: string | null }>>;
    limits: Readonly<Record<string, unknown>>;
    /**
     * Who pays for the plan's recurring price (monthly first, then annual) and at what price, with the edges in force
     * at `asOf`. `null` when the plan has no flat or per-unit recurring price (a `SETTLEMENT` step says so). Absent in
     * responses of Access versions before phase 2.
     */
    settlement?: SettlementResult | null;
    steps: readonly ExplainStep[];
    /** sha256 of the canonical inputs. */
    inputsHash: string;
}>;

export type ExplainInput = Readonly<{
    /** Organization to explain: the administered environment's organization or one of its descendants. */
    organizationId: string;
    projectId: string;
    /** The workspace environment whose subscription is explained. */
    environmentId: string;
    /** Explain as of a past or future instant (ISO date-time). */
    asOf?: string;
}>;

export type AccessCommercial = Readonly<{
    /** `GET .../orgs/{orgId}/entitlements/explain`. Read-only. */
    explain(input: ExplainInput, options?: AccessCommercialCallOptions): Promise<EntitlementExplanation>;
    settlement: Readonly<{
        /** `POST .../commercial/settlement/resolve`. Read-only; platform operators only (others get a 403 `PLATFORM_OPERATOR_ONLY`). */
        resolve(input: ResolveSettlementInput, options?: AccessCommercialCallOptions): Promise<SettlementResult>;
    }>;
    relationships: Readonly<{
        /** Direct children of the administered organization with the edge in force. */
        list(options?: AccessCommercialCallOptions): Promise<Readonly<{ organizationId: string; children: ReadonlyArray<Readonly<{ organization: Readonly<{ id: string; name: string; type: string; parentId: string | null }>; relationship: CommercialRelationship }>> }>>;
        /** The edge into `organizationId` (parent, child or platform operator) with its version history. */
        get(organizationId: string, options?: AccessCommercialCallOptions): Promise<Readonly<{ organization: Readonly<{ id: string; name: string; type: string; parentId: string | null }>; effective: CommercialRelationship; versions: readonly CommercialRelationshipVersion[]; canEdit: boolean; options: CommercialEdgeOptions | null }>>;
        /** Platform operators only: every agency with the edge in force. */
        agencies(input?: Readonly<{ search?: string; limit?: number }>, options?: AccessCommercialCallOptions): Promise<Readonly<{ agencies: ReadonlyArray<Readonly<{ organization: Readonly<{ id: string; name: string; type: string; parentId: string | null }>; relationship: CommercialRelationship }>> }>>;
        /** Create the next version of the edge into `organizationId` (parent or platform operator only). */
        set(organizationId: string, input: SetCommercialRelationshipInput, options?: AccessCommercialCallOptions): Promise<Readonly<{ success: true; relationship: CommercialRelationshipVersion; previousVersion: number | null }>>;
    }>;
    plans: Readonly<{
        list(options?: AccessCommercialCallOptions): Promise<VisiblePlans>;
        /** One plan the organization sees (inherited or own) with its content. */
        get(code: string, version: number, options?: AccessCommercialCallOptions): Promise<PlanDetail>;
        /** Publish simulator: exactly what `save` would decide plus the entitlements it would grant and the diffs. Stores nothing. */
        simulate(plan: AgencyPlanInput, options?: AccessCommercialCallOptions): Promise<PlanSimulation>;
        /** Dry run of the whole write path (right, base plan, ceiling). Stores nothing. */
        validate(plan: AgencyPlanInput, options?: AccessCommercialCallOptions): Promise<PlanValidation>;
        save(plan: AgencyPlanInput, options?: AccessCommercialCallOptions): Promise<Readonly<{ success: true; plan: PlanSummary; ceiling: NonNullable<PlanValidation["applied"]> }>>;
        archive(code: string, version: number, options?: AccessCommercialCallOptions): Promise<Readonly<{ success: true; plan: PlanSummary }>>;
        /**
         * Move the workspaces pinned to `version` of an own plan onto the newer ACTIVE `toVersion`. `dryRun` defaults to true (only counts);
         * pass `dryRun: false` to write. Refusals: MIGRATION_SAME_VERSION, MIGRATION_TARGET_NOT_ACTIVE, MIGRATION_TARGET_OLDER, MIGRATION_*_NOT_FOUND.
         */
        migrateSubscribers(code: string, version: number, input: Readonly<{ toVersion: number; dryRun?: boolean }>, options?: AccessCommercialCallOptions): Promise<MigratePlanSubscribersResult>;
    }>;
}>;

export type AccessCommercialCallOptions = AccessAdminCallOptions & Readonly<{
    /** Environment of the administered organization (path `envId`); defaults to the client's `scope.environmentId`. */
    adminEnvironmentId?: string;
}>;

type Json = <T>(method: "GET" | "POST" | "PUT", path: string, options?: AccessAdminCallOptions) => Promise<T>;

/** Wiring used by `createAccessAdmin`; `defaultEnvironmentId()` is the client's scope environment. */
export function createAccessCommercial(json: Json, defaultEnvironmentId: () => string | undefined, missing: (message: string) => Error): AccessCommercial {
    const base = (options?: AccessCommercialCallOptions) => {
        const envId = options?.adminEnvironmentId ?? options?.scope?.environmentId ?? defaultEnvironmentId();
        if (!envId) throw missing("commercial calls need the administered environment: pass adminEnvironmentId or set scope.environmentId");
        return `/api/admin/env/${encodeURIComponent(envId)}`;
    };
    const strip = (options?: AccessCommercialCallOptions): AccessAdminCallOptions | undefined => {
        if (!options) return undefined;
        const { adminEnvironmentId: _ignored, ...rest } = options;
        return rest;
    };
    const enc = encodeURIComponent;
    return {
        explain: (input, options) => json("GET", `${base(options)}/orgs/${enc(input.organizationId)}/entitlements/explain`, {
            ...strip(options),
            query: { ...options?.query, projectId: input.projectId, environmentId: input.environmentId, ...(input.asOf ? { asOf: input.asOf } : {}) },
        }),
        settlement: {
            resolve: (input, options) => json("POST", `${base(options)}/commercial/settlement/resolve`, { ...strip(options), body: input }),
        },
        relationships: {
            list: (options) => json("GET", `${base(options)}/commercial/relationships`, strip(options)),
            get: (organizationId, options) => json("GET", `${base(options)}/commercial/relationships/${enc(organizationId)}`, strip(options)),
            agencies: (input, options) => json("GET", `${base(options)}/commercial/agencies`, {
                ...strip(options),
                query: { ...options?.query, ...(input?.search ? { search: input.search } : {}), ...(input?.limit !== undefined ? { limit: String(input.limit) } : {}) },
            }),
            set: (organizationId, input, options) => json("PUT", `${base(options)}/commercial/relationships/${enc(organizationId)}`, { ...strip(options), body: input }),
        },
        plans: {
            list: (options) => json("GET", `${base(options)}/agency/plans`, strip(options)),
            get: (code, version, options) => json("GET", `${base(options)}/agency/plans/${enc(code)}/${version}`, strip(options)),
            simulate: (plan, options) => json("POST", `${base(options)}/agency/plans/simulate`, { ...strip(options), body: plan }),
            validate: (plan, options) => json("POST", `${base(options)}/agency/plans/validate`, { ...strip(options), body: plan }),
            save: (plan, options) => json("POST", `${base(options)}/agency/plans`, { ...strip(options), body: plan }),
            archive: (code, version, options) => json("POST", `${base(options)}/agency/plans/${enc(code)}/${version}/archive`, { ...strip(options), body: {} }),
            migrateSubscribers: (code, version, input, options) => json("POST", `${base(options)}/agency/plans/${enc(code)}/${version}/migrate-subscribers`, { ...strip(options), body: { dryRun: true, ...input } }),
        },
    };
}
