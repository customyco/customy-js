import { describe, expect, it } from "vitest";
import { createProvisioning, CustomyConflictError, CustomyRateLimitError, CustomyScopeError, PROVISIONING_SCOPES } from "./index";
import * as provisioningPackage from "@customyai/provisioning";
import { withEphemeralUsers } from "./testing";

describe("provisioning in @customyai/sdk", () => {
    it("exposes the client, its typed errors and the testing helper", async () => {
        expect(createProvisioning).toBe(provisioningPackage.createProvisioning);
        expect(CustomyScopeError).toBe(provisioningPackage.CustomyScopeError);
        expect(CustomyConflictError).toBe(provisioningPackage.CustomyConflictError);
        expect(CustomyRateLimitError).toBe(provisioningPackage.CustomyRateLimitError);
        expect(PROVISIONING_SCOPES).toBe(provisioningPackage.PROVISIONING_SCOPES);
        const calls: string[] = [];
        const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const headers = new Headers(init?.headers);
            if (url.endsWith("/oauth/token")) return Response.json({ access_token: "tok-aaaaaaaa", expires_in: 900 });
            calls.push(`${init?.method} ${new URL(url).pathname} ${headers.get("customy-environment")}`);
            if (init?.method === "POST") {
                return Response.json({ batch: { id: "run-1", count: 1, expiresAt: null }, users: [{ externalKey: "k", id: "u", email: "a@qa.example.com", name: null, expiresAt: null, credentials: { password: "pw" } }], audit: { id: "a" } }, { status: 201 });
            }
            return Response.json({ deleted: 1, batch: "run-1", audit: { id: "a" } });
        }) as typeof globalThis.fetch;
        const client = createProvisioning({ environment: "staging", baseUrl: "https://access.fixture.invalid", clientId: "c", clientSecret: "s", fetch });
        const seen = await withEphemeralUsers({ client, count: 1, emailDomain: "qa.example.com", runId: "run-1", env: {} }, async ([user]) => user?.password);
        expect(seen).toBe("pw");
        expect(calls).toEqual(["POST /v1/provisioning/test-users:batch staging", "DELETE /v1/provisioning/test-users staging"]);
    });
});
