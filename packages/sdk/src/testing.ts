/**
 * `@customyai/sdk/testing`: throw-away users for tests, always cleaned up.
 * The implementation lives in `@customyai/provisioning/testing`.
 */
export {
    createEphemeralBatch,
    ephemeralUsersFixture,
    resolveRunId,
    withEphemeralUsers,
    type EphemeralBatch,
    type EphemeralUser,
    type EphemeralUsersFixture,
    type EphemeralUsersOptions,
} from "@customyai/provisioning/testing";
