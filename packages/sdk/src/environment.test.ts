import { describe, expect, it } from "vitest";
import { readCustomyEnvironment } from "./environment";

describe("readCustomyEnvironment", () => {
    it("reads the three discovery variables, trims them and drops empty ones", () => {
        expect(readCustomyEnvironment({ CUSTOMY_ACCESS_URL: " https://access.fixture.invalid/ ", CUSTOMY_WORKSPACE_ENVIRONMENT_ID: "env_1", CUSTOMY_PROJECT_ID: "  " }))
            .toEqual({ accessUrl: "https://access.fixture.invalid", workspaceEnvironmentId: "env_1" });
        expect(readCustomyEnvironment({})).toEqual({});
    });
});
