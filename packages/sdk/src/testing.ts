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

/**
 * Customy Access en memoria con roles, planes y relaciones del manifiesto, para los tests de contrato de una app.
 * La implementación vive en `./fake-access`.
 */
export {
    createFakeAccess,
    type FakeAccess,
    type FakeAccessCall,
    type FakeAccessControls,
    type FakeAccessManifest,
    type FakeAccessOptions,
} from "./fake-access";
