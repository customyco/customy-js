import { describe, expect, it, vi } from "vitest";
import { createProvisioning } from "./index";
import { ephemeralUsersFixture, resolveRunId, withEphemeralUsers } from "./testing";

const BASE = "https://access.fixture.invalid";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req_t" } });

type Call = { method: string; url: string; body?: string };

function server(options: { cleanupStatus?: number } = {}) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const call: Call = { method: init?.method ?? "GET", url, body: typeof init?.body === "string" ? init.body : undefined };
        if (url.endsWith("/oauth/token")) return json(200, { access_token: "tok-aaaaaaaa", expires_in: 900 });
        calls.push(call);
        if (url.includes("test-users:batch")) {
            const input = JSON.parse(call.body!) as { count: number; batchId: string };
            return json(201, {
                batch: { id: input.batchId, count: input.count, expiresAt: null },
                users: Array.from({ length: input.count }, (_, i) => ({ externalKey: `k${i}`, id: `usr_${i}`, email: `u${i}@qa.example.com`, name: null, expiresAt: null, credentials: { password: `pw-${i}` } })),
                audit: { id: "a" },
            });
        }
        if (call.method === "DELETE") {
            return options.cleanupStatus && options.cleanupStatus >= 400
                ? json(options.cleanupStatus, { error: { code: "NOT_FOUND", message: "gone", requestId: "req_t" } })
                : json(200, { deleted: 2, batch: "x", audit: { id: "a" } });
        }
        throw new Error(`unexpected ${call.method} ${url}`);
    }) as typeof globalThis.fetch;
    const client = createProvisioning({ environment: "staging", baseUrl: BASE, clientId: "c", clientSecret: "s3cret-value", fetch, retry: false });
    return { client, calls };
}

const base = { count: 2, emailDomain: "qa.example.com", runId: "run-42", env: {} };

describe("withEphemeralUsers", () => {
    it("creates one tagged batch, passes users and cleans up after success", async () => {
        const { client, calls } = server();
        const result = await withEphemeralUsers({ ...base, client, currency: "COP", country: "CO" }, async (users) => {
            expect(users).toEqual([
                { externalKey: "k0", email: "u0@qa.example.com", password: "pw-0", id: "usr_0" },
                { externalKey: "k1", email: "u1@qa.example.com", password: "pw-1", id: "usr_1" },
            ]);
            return "done";
        });
        expect(result).toBe("done");
        expect(calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
        const batch = JSON.parse(calls[0]!.body!);
        expect(batch).toMatchObject({ count: 2, emailDomain: "qa.example.com", batchId: "run-42", attributes: { currency: "COP", country: "CO" } });
        expect(batch.reason.length).toBeGreaterThanOrEqual(10);
        const cleanup = new URL(calls[1]!.url);
        expect(cleanup.searchParams.get("batch")).toBe("run-42");
        expect(cleanup.searchParams.get("reason")).toBe("ephemeral cleanup run-42");
    });

    it("cleans up and rethrows the original error when the callback throws", async () => {
        const { client, calls } = server();
        const boom = new Error("test failed");
        await expect(withEphemeralUsers({ ...base, client }, async () => { throw boom; })).rejects.toBe(boom);
        expect(calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
    });

    it("does not mask the callback error when cleanup also fails; reports it via onCleanupError", async () => {
        const { client } = server({ cleanupStatus: 404 });
        const boom = new Error("test failed");
        const onCleanupError = vi.fn();
        await expect(withEphemeralUsers({ ...base, client, onCleanupError }, async () => { throw boom; })).rejects.toBe(boom);
        expect(onCleanupError).toHaveBeenCalledTimes(1);
    });

    it("rethrows the cleanup failure when the callback succeeded", async () => {
        const { client } = server({ cleanupStatus: 404 });
        const onCleanupError = vi.fn();
        await expect(withEphemeralUsers({ ...base, client, onCleanupError }, async () => 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(onCleanupError).toHaveBeenCalledTimes(1);
    });

    it("accepts credentials instead of a client", async () => {
        const { client } = server();
        expect(client.environment).toBe("staging");
        await expect(withEphemeralUsers({ ...base, credentials: { environment: "staging", baseUrl: BASE, clientId: "c", clientSecret: "s", fetch: (async () => json(401, { error: "invalid_client" })) as typeof fetch, retry: false } }, async () => 1)).rejects.toMatchObject({ name: "CustomyAuthError" });
    });
});

describe("runId and fixture", () => {
    it("derives the run id from CI env and sanitises it", () => {
        expect(resolveRunId("my run/1", undefined)).toBe("my-run-1");
        expect(resolveRunId(undefined, { GITHUB_RUN_ID: "123456", GITHUB_RUN_ATTEMPT: "2" })).toMatch(/^123456-2-[0-9a-f]{4}$/);
        expect(resolveRunId(undefined, {})).toMatch(/^local-/);
        expect(resolveRunId("a", undefined)).toBe("run-a");
    });

    it("fixture creates in setup and cleans in teardown, idempotently", async () => {
        const { client, calls } = server();
        const fixture = ephemeralUsersFixture({ ...base, client });
        expect(fixture.users).toEqual([]);
        const users = await fixture.setup();
        expect(users).toHaveLength(2);
        expect(fixture.users).toHaveLength(2);
        await fixture.teardown();
        await fixture.teardown();
        expect(calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
    });
});
