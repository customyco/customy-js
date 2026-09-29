/**
 * @customyai/provisioning: identity provisioning for TEST users in Customy
 * Access, with an Access API key of one environment, over `@customyai/core`.
 *
 * ```ts
 * const provisioning = createProvisioning({
 *   environment: "staging",
 *   baseUrl: process.env.CUSTOMY_ACCESS_URL!,
 *   clientId: process.env.CUSTOMY_CLIENT_ID!,
 *   clientSecret: process.env.CUSTOMY_CLIENT_SECRET!,
 * });
 * const batch = await provisioning.testUsers.batch({ count: 3, emailDomain: "qa.example.com", reason: "e2e checkout run" });
 * ```
 */
export {
    createProvisioning,
    ENVIRONMENT_HEADER,
    PROVISIONING_AUDIENCE,
    type CustomyProvisioning,
    type ProvisioningCredentials,
    type ProvisioningOptions,
    type ProvisioningRetry,
} from "./client";
export {
    CustomyAuthError,
    CustomyCapabilityDisabledError,
    CustomyConflictError,
    CustomyEnvironmentMismatchError,
    CustomyProvisioningError,
    CustomyRateLimitError,
    CustomyScopeError,
    CustomyValidationError,
} from "./errors";
export { PROVISIONING_SCOPES } from "./types";
export type * from "./types";
