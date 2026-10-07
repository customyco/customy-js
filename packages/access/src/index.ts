/**
 * @customyai/access — Customy Access para el servidor de una app, sobre
 * `@customyai/core`: capabilities de sus usuarios, catálogo comercial, usuarios
 * y el contacto acotado de uno.
 *
 * ```ts
 * import { createMachineTokens, discoverPlatform } from "@customyai/core";
 * import { createAccess } from "@customyai/access";
 *
 * const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
 * const machineTokens = createMachineTokens({ issuer: platform.issuer, clientId, clientSecret, platform });
 * const access = createAccess({ platform, machineTokens });
 * const { allowed } = await access.capabilities.check("reports.export", { userId });
 * ```
 *
 * `createAccessAdmin` es el cliente de administración para el BFF de una app (Next, node, edge): reenvía la
 * cookie de sesión o un bearer y el contexto del entorno, y devuelve estados HTTP. Ver `src/admin.ts`.
 *
 * Subrutas: `@customyai/access/flags` (flags con evaluación local) y
 * `@customyai/access/generated` (cualquier operación pública por su `operationId`).
 */
export { capabilityFromSnapshot, createAccess, explainPermission, type CustomyAccess } from "./facade";
export {
    accessScopeHeaders,
    createAccessAdmin,
    type AccessAdmin,
    type AccessAdminCallOptions,
    type AccessAdminMe,
    type AccessAdminOptions,
    type AccessAdminResponse,
    type AccessAdminScope,
    type AccessDirectoryMember,
    type AccessGovernanceToken,
    type AccessSessionPayload,
} from "./admin";
export {
    createAccessCommercial,
    type AccessCommercial,
    type AccessCommercialCallOptions,
    type AgencyPlanInput,
    type CeilingViolation,
    type CommercialController,
    type CommercialEdgeChoice,
    type CommercialEdgeOptions,
    type CommercialPayer,
    type CommercialRelationship,
    type CommercialRelationshipVersion,
    type CommercialTerms,
    type EntitlementExplanation,
    type ExplainInput,
    type ExplainStep,
    type ExplainStepCode,
    type PlanContent,
    type PlanDetail,
    type PlanSimulation,
    type PlanSubscriberImpact,
    type MigratePlanSubscribersResult,
    type PlanSummary,
    type PlanValidation,
    type ResolveSettlementInput,
    type SetCommercialRelationshipInput,
    type SettlementLeg,
    type SettlementListPriceSource,
    type SettlementMargin,
    type SettlementMode,
    type SettlementResult,
    type SettlementStep,
    type SettlementStepCode,
    type SubscriptionAccessMode,
    type SubscriptionAccessPolicyEntry,
    type SubscriptionPolicyState,
    type VisiblePlans,
} from "./commercial";
export { createPermissionDirectory, type PermissionDirectory, type PermissionDirectoryOptions } from "./permissions";
export { CustomyAccessError, toAccessError } from "./errors";
export { ACCESS_AUDIENCE, ACCESS_DEFAULT_BASE_URL, ACCESS_SCOPES, type AccessOptions, type AccessScope } from "./options";
export type * from "./types";
