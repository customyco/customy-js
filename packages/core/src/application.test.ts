import { beforeEach, describe, expect, it } from "vitest";
import { clearApplicationCache, discoverApplication, parseApplicationScope } from "./application";
import { CustomySdkError } from "./errors";
import { createMachineTokens } from "./machine-token";

const issuer = "https://access.fixture.invalid";
const platformDocument = {
    issuer,
    environment: "staging",
    jwks_uri: `${issuer}/oauth/jwks.json`,
    token_endpoint: `${issuer}/oauth/token`,
    grant_types_supported: ["client_credentials"],
    products: { send: { base_url: "https://send.fixture.invalid", audience: "customy-send" } },
};
const scope = {
    organizationId: "org_1", organizationSlug: "acme", environmentId: "env_1", environmentType: "production",
    applicationId: "app_1", applicationKey: "habit-app", publishableKey: "pk_live_acme",
};

type Call = { url: string; headers: Record<string, string> };
function fixture(handler?: (call: Call) => Response | undefined) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call = { url: String(input), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
        calls.push(call);
        const custom = handler?.(call);
        if (custom) return custom;
        if (call.url.endsWith("/.well-known/customy-configuration")) return new Response(JSON.stringify(platformDocument), { status: 200 });
        if (call.url.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "machine-jwt", token_type: "Bearer", expires_in: 900 }), { status: 200 });
        if (call.url.endsWith("/api/v1/application")) return new Response(JSON.stringify(scope), { status: 200 });
        return new Response("", { status: 404 });
    }) as typeof globalThis.fetch;
    return { calls, fetch };
}

beforeEach(() => clearApplicationCache());

describe("discoverApplication", () => {
    it("from a publishable key: platform discovery, then the application scope with only that key", async () => {
        const { calls, fetch } = fixture();
        const app = await discoverApplication({ issuer: `${issuer}/`, publishableKey: "pk_live_acme", fetch });
        expect(calls.map((call) => call.url)).toEqual([`${issuer}/.well-known/customy-configuration`, `${issuer}/api/v1/application`]);
        expect(calls[1]!.headers["x-publishable-key"]).toBe("pk_live_acme");
        expect(calls[1]!.headers.authorization).toBeUndefined();
        expect(app).toMatchObject({
            issuer, accessUrl: issuer, environment: "staging", organizationId: "org_1", organizationSlug: "acme",
            environmentId: "env_1", environmentType: "production", applicationId: "app_1", applicationKey: "habit-app", publishableKey: "pk_live_acme",
            products: { send: { baseUrl: "https://send.fixture.invalid", audience: "customy-send" } },
        });
        expect(app.platform.tokenEndpoint).toBe(`${issuer}/oauth/token`);
    });

    it("from an M2M client: asks customy-access for capabilities:read and sends the bearer, not a key", async () => {
        const { calls, fetch } = fixture();
        const machineTokens = createMachineTokens({ issuer, clientId: "client", clientSecret: "secret", fetch });
        const app = await discoverApplication({ issuer, machineTokens, fetch });
        const token = calls.find((call) => call.url.endsWith("/oauth/token"))!;
        expect(token).toBeDefined();
        expect(calls.at(-1)!.headers.authorization).toBe("Bearer machine-jwt");
        expect(calls.at(-1)!.headers["x-publishable-key"]).toBeUndefined();
        expect(app.environmentId).toBe("env_1");
    });

    it("reuses a platform already read, and caches by credential until the ttl", async () => {
        const { calls, fetch } = fixture();
        let clock = 1_000;
        const options = { issuer, publishableKey: "pk_live_acme", fetch, ttlMs: 60_000, now: () => clock };
        const [a, b] = await Promise.all([discoverApplication(options), discoverApplication(options)]);
        expect(b).toBe(a);
        expect(calls).toHaveLength(2);
        await discoverApplication(options);
        expect(calls).toHaveLength(2);
        clock += 61_000;
        await discoverApplication(options);
        expect(calls).toHaveLength(4);
        // Another key is another entry; ttlMs: 0 never caches.
        await discoverApplication({ ...options, publishableKey: "pk_live_other" });
        expect(calls).toHaveLength(6);
        await discoverApplication({ ...options, ttlMs: 0 });
        await discoverApplication({ ...options, ttlMs: 0 });
        expect(calls).toHaveLength(10);
        const platform = (await discoverApplication(options)).platform;
        const before = calls.length;
        clearApplicationCache();
        await discoverApplication({ ...options, platform });
        expect(calls.length).toBe(before + 1);
    });

    it("needs a credential, rejects two, and types every failure as CustomySdkError", async () => {
        const { fetch } = fixture();
        await expect(discoverApplication({ issuer, fetch })).rejects.toMatchObject({ code: "SDK_CREDENTIALS_REQUIRED" });
        await expect(discoverApplication({ issuer, fetch, accessToken: "t", machineTokens: createMachineTokens({ issuer, clientId: "c", clientSecret: "s", fetch }) }))
            .rejects.toMatchObject({ code: "SDK_CREDENTIALS_AMBIGUOUS" });
        await expect(discoverApplication({ issuer: "http://insecure.invalid", publishableKey: "pk", fetch })).rejects.toMatchObject({ code: "SDK_ISSUER_INVALID" });

        const notFound = fixture((call) => call.url.endsWith("/api/v1/application") ? new Response(JSON.stringify({ error: "APPLICATION_NOT_FOUND", message: "No application for this publishable key." }), { status: 404 }) : undefined);
        const error = await discoverApplication({ issuer, publishableKey: "pk_nope", fetch: notFound.fetch }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CustomySdkError);
        expect(error).toMatchObject({ code: "APPLICATION_NOT_FOUND", status: 404, service: "access" });

        const forbidden = fixture((call) => call.url.endsWith("/api/v1/application") ? new Response(JSON.stringify({ error: "SCOPE_REQUIRED" }), { status: 403 }) : undefined);
        await expect(discoverApplication({ issuer, accessToken: () => "t", fetch: forbidden.fetch })).rejects.toMatchObject({ code: "SCOPE_REQUIRED", status: 403 });

        const down = (async () => { throw new TypeError("fetch failed"); }) as typeof globalThis.fetch;
        await expect(discoverApplication({ issuer, publishableKey: "pk", fetch: down })).rejects.toMatchObject({ code: "SDK_DISCOVERY_FAILED" });
    });

    it("does not cache a failure", async () => {
        let fail = true;
        const { calls, fetch } = fixture((call) => call.url.endsWith("/api/v1/application") && fail ? new Response("{}", { status: 404 }) : undefined);
        await expect(discoverApplication({ issuer, publishableKey: "pk", fetch })).rejects.toBeInstanceOf(CustomySdkError);
        fail = false;
        await expect(discoverApplication({ issuer, publishableKey: "pk", fetch })).resolves.toMatchObject({ applicationId: "app_1" });
        expect(calls.filter((call) => call.url.endsWith("/api/v1/application"))).toHaveLength(2);
    });
});

describe("parseApplicationScope", () => {
    const platform = { issuer, jwksUri: `${issuer}/oauth/jwks.json`, tokenEndpoint: `${issuer}/oauth/token`, grantTypesSupported: [], products: {} };
    it("requires the three ids and drops what is not text", () => {
        expect(() => parseApplicationScope(platform, { ...scope, applicationId: "" })).toThrow(/applicationId/);
        expect(() => parseApplicationScope(platform, { ...scope, organizationId: undefined })).toThrow(/organizationId/);
        expect(() => parseApplicationScope(platform, [])).toThrow(/object/);
        const parsed = parseApplicationScope(platform, { ...scope, applicationKey: null, publishableKey: 7 });
        expect(parsed).not.toHaveProperty("applicationKey");
        expect(parsed).not.toHaveProperty("publishableKey");
    });
});
