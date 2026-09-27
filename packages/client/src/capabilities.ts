/**
 * Capabilities, entitlements y uso tal como los ve el navegador: tipos del
 * contrato de Access y funciones puras para decidir qué mostrar. Mostrar u
 * ocultar no autoriza: el servidor vuelve a decidir en cada petición.
 */
export type CapabilityState =
    | "enabled"
    | "hidden"
    | "disabled"
    | "read_only"
    | "requires_upgrade"
    | "requires_admin";

export interface CapabilityDecision {
    capability: string;
    state: CapabilityState;
    reason: string;
    requiredPermissions: string[];
}

export interface CapabilityUsageStatus {
    capability: string;
    meterCode?: string | null;
    limitCode?: string | null;
    period?: string | null;
    current: number | null;
    limit: number | null;
    remaining: number | null;
    status: "ok" | "near_limit" | "at_limit" | "exceeded" | "unmetered" | "unknown";
    source: "billing" | "access_limits" | "none";
}

export interface CapabilityUsagePressureSummary {
    level: "healthy" | "warning" | "critical";
    warnings: CapabilityUsageStatus[];
    critical: CapabilityUsageStatus[];
    affectedCapabilities: string[];
    affectedMeterCodes: string[];
    recommendedAction: "none" | "review_usage" | "upgrade_now";
}

export interface AccessSubscriptionRecord {
    externalId: string;
    planCode: string;
    status: string;
    startedAt: string;
    addOnCodes: string[];
}

export interface AccessSubscriptionStatus {
    environmentId: string;
    organizationId: string;
    primaryPlanCode: string | null;
    subscriptionStatus: string | null;
    hasActiveSubscription: boolean;
    planCodes: string[];
    addOnCodes: string[];
    subscriptions: AccessSubscriptionRecord[];
}

export interface AccessEntitlementItem {
    capability: string;
    label: string;
    module: string;
    decisionState: CapabilityState;
    commerciallyIncluded: boolean;
    commerciallyIncludedVia: "plan" | "addon" | "none";
    requiredPlans: string[];
    reason: string;
    usage?: CapabilityUsageStatus | null;
}

export interface AccessEntitlements {
    environmentId: string;
    organizationId: string;
    planCodes: string[];
    addOnCodes: string[];
    subscriptions: AccessSubscriptionRecord[];
    entitlements: AccessEntitlementItem[];
    productGovernance?: {
        productKey: string | null;
        planMatrixVersion: string | null;
        activePlanCode: string | null;
        activePlanVersion: string | null;
        migrationPolicy: string | null;
        grandfatherEligible: boolean | null;
        availablePlans: Array<{
            planCode: string;
            version: string | null;
            migrationPolicy: string | null;
            grandfatherEligible: boolean | null;
            roleCount: number;
            featureCount: number;
            limitCount: number;
        }>;
        activePlan: {
            roles: string[];
            features: string[];
            limits: Record<string, unknown>;
        } | null;
        paywallHooks: Record<string, unknown>;
        planGovernance: Record<string, unknown> | null;
    };
}

export interface AccessCommercialUsageSnapshot {
    environmentId: string;
    organizationId: string;
    planCodes: string[];
    addOnCodes: string[];
    usageByCode: Record<string, { current: number | null; limit: number | null }>;
    usage: CapabilityUsageStatus[];
    summary: CapabilityUsagePressureSummary;
}

export interface AccessMeSnapshot {
    environmentId: string;
    user: { id: string } | null;
    subscription: AccessSubscriptionStatus;
    entitlements: AccessEntitlements;
    modules: CapabilityMatrixModule[];
    usage: AccessCommercialUsageSnapshot;
    /** Solo en entornos de apps instaladas por manifiesto `app/v1`: su plan y sus capabilities. */
    application?: AccessApplicationEntitlements;
}

export interface AccessApplicationEntitlements {
    applicationKey: string;
    /** `member` (asiento), `subscription` (entorno) o `default` (plan de menor rank del manifiesto). */
    plan: { code: string; source: "member" | "subscription" | "default" } | null;
    /** Valor de cada capability del manifiesto: boolean, límite de un meter o configuración. */
    capabilities: Record<string, unknown>;
}

export interface CapabilityMatrixItem extends CapabilityDecision {
    module: string;
    label: string;
    allowed: boolean;
    visible: boolean;
    usage?: CapabilityUsageStatus;
}

export interface CapabilityMatrixModule {
    key: string;
    label: string;
    state: CapabilityState;
    visible: boolean;
    capabilities: CapabilityMatrixItem[];
}

export interface CapabilityMatrix {
    environmentId: string;
    organizationId: string;
    subject: {
        userId: string | null;
        permissions: string[];
        roles: string[];
    };
    modules: CapabilityMatrixModule[];
    capabilities: CapabilityMatrixItem[];
}

export interface CapabilityBootstrapOptions {
    userId?: string;
    capabilities?: string[];
    includeUsage?: boolean;
}

export interface CapabilityBootstrapSnapshot {
    matrix: CapabilityMatrix;
    modules: CapabilityMatrixModule[];
    usage: CapabilityUsageStatus[];
    decisions: Record<string, CapabilityMatrixItem>;
    canUseCapability: (
        capability: string,
        accessMode?: "read" | "write",
    ) => boolean;
    canAccessModule: (
        moduleKey: string,
        accessMode?: "read" | "write",
    ) => boolean;
    getCapability: (capability: string) => CapabilityMatrixItem | undefined;
    getModule: (moduleKey: string) => CapabilityMatrixModule | undefined;
}

export function isCapabilityStateAllowed(
    state: CapabilityState,
    accessMode: "read" | "write" = "write",
): boolean {
    if (state === "enabled") return true;
    if (accessMode === "read" && state === "read_only") return true;
    return false;
}

export function isCapabilityDecisionAllowed(
    decision: Pick<CapabilityDecision, "state"> | null | undefined,
    accessMode: "read" | "write" = "write",
): boolean {
    if (!decision) return false;
    return isCapabilityStateAllowed(decision.state, accessMode);
}

export function getCapabilityFromMatrix(
    matrix: CapabilityMatrix,
    capability: string,
): CapabilityMatrixItem | undefined {
    return matrix.capabilities.find((item) => item.capability === capability);
}

export function getModuleFromMatrix(
    matrix: CapabilityMatrix,
    moduleKey: string,
): CapabilityMatrixModule | undefined {
    return matrix.modules.find((module) => module.key === moduleKey);
}

export function summarizeCapabilityUsage(
    usage: CapabilityUsageStatus[],
): CapabilityUsagePressureSummary {
    const warnings = usage.filter(
        (item) => item.status === "near_limit" || item.status === "at_limit",
    );
    const critical = usage.filter((item) => item.status === "exceeded");
    const affectedCapabilities = Array.from(
        new Set([...warnings, ...critical].map((item) => item.capability)),
    );
    const affectedMeterCodes = Array.from(
        new Set(
            [...warnings, ...critical]
                .map((item) => item.meterCode)
                .filter((value): value is string => Boolean(value)),
        ),
    );

    if (critical.length > 0) {
        return {
            level: "critical",
            warnings,
            critical,
            affectedCapabilities,
            affectedMeterCodes,
            recommendedAction: "upgrade_now",
        };
    }

    if (warnings.length > 0) {
        return {
            level: "warning",
            warnings,
            critical,
            affectedCapabilities,
            affectedMeterCodes,
            recommendedAction: "review_usage",
        };
    }

    return {
        level: "healthy",
        warnings: [],
        critical: [],
        affectedCapabilities: [],
        affectedMeterCodes: [],
        recommendedAction: "none",
    };
}


export interface LinkedProvider {
    providerId: string;
    accountId: string;
    createdAt: string;
}

export interface LinkResult {
    linked: boolean;
    primaryUserId: string;
    mergedUserIds: string[];
    accountsMerged: number;
    linkHistoryId?: string;
}

export interface LinkBlockedResult {
    linked: false;
    blocked: true;
    reason: "email_not_verified" | "untrusted_provider" | "config_disabled" | "conflict";
    verificationRequired?: boolean;
    existingProviders?: string[];
    resolution?: { signInAndLink?: string; verifyEmail?: string };
}

export interface AccountLinkingConfig {
    autoLinkEnabled: boolean;
    autoLinkStrategy: "email" | "email_verified" | "disabled";
    requireEmailVerification: boolean;
    allowUserInitiatedLink: boolean;
    allowUserInitiatedUnlink: boolean;
    allowAdminLink: boolean;
    conflictResolution: "block" | "merge_verified" | "trust_hierarchy";
    notifyUserOnLink: boolean;
    notifyUserOnUnlink: boolean;
    rollbackWindowDays: number;
}

export interface LinkHistoryEntry {
    id: string;
    primaryUserId: string;
    secondaryUserId: string;
    secondaryEmail: string | null;
    action: string;
    trigger: string;
    providerId: string | null;
    performedBy: string | null;
    rolledBackAt: string | null;
    createdAt: string;
}

