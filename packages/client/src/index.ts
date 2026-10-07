/**
 * @customyai/client — cliente de navegador de Customy: sesión, login, MFA,
 * passkeys, organización activa, capabilities y vinculación de cuentas, todo
 * same-origin con cookies `HttpOnly`. Sin secretos ni código de servidor.
 * Bindings de UI como subrutas: `./react`, `./native`, `./native/react`.
 */
export {
    authFailureFromResponse,
    browserAuthBase,
    createCustomyClient,
    createSocialSignInUrl,
    fetchRealtimeTicket,
    resolveCustomyAccessClientConfig,
    type AuthActionFailure,
    type CustomyAccessClientConfig,
    type CustomyAccessClientEnv,
    type CustomyActor,
    type CustomyClient,
    type CustomyClientOptions,
    type CustomyOrganization,
    type CustomySession,
    type CustomyUser,
    type RealtimeTicketResponse,
    type ScopedAuthOptions,
    type SessionState,
    type SignInResult,
    type SocialSignInOptions,
    type SocialSignInUrlOptions,
} from "./client";
export { accessGrantsFrom, type AccessGrants, type AccessGrantsSource } from "./access-grants";
export {
    getCapabilityFromMatrix,
    getModuleFromMatrix,
    isCapabilityDecisionAllowed,
    isCapabilityStateAllowed,
    summarizeCapabilityUsage,
    type AccessApplicationEntitlements,
    type AccessCommercialUsageSnapshot,
    type AccessEntitlementItem,
    type AccessEntitlements,
    type AccessMeSnapshot,
    type AccessSubscriptionRecord,
    type AccessSubscriptionStatus,
    type AccountLinkingConfig,
    type CapabilityBootstrapOptions,
    type CapabilityBootstrapSnapshot,
    type CapabilityDecision,
    type CapabilityMatrix,
    type CapabilityMatrixItem,
    type CapabilityMatrixModule,
    type CapabilityState,
    type CapabilityUsagePressureSummary,
    type CapabilityUsageStatus,
    type LinkBlockedResult,
    type LinkedProvider,
    type LinkHistoryEntry,
    type LinkResult,
} from "./capabilities";
export { CustomySdkError, isCustomySdkError } from "@customyai/core";
