import { createMachineTokens } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { createAccess, CustomyAccessError } from "./index";

const BASE = "https://access.fixture.invalid";
const ENV = "env_fixture_0001";

type Call = { url: string; body?: string; signal?: AbortSignal | null };

function platform(respond: (url: string, body: URLSearchParams | null) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined, signal: init?.signal });
        return respond(url, typeof init?.body === "string" ? new URLSearchParams(init.body) : null);
    }) as typeof globalThis.fetch;
    return { fetch, calls };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const tokenScopes = (calls: Call[]) => calls.filter((call) => call.url.endsWith("/oauth/token")).map((call) => new URLSearchParams(call.body).get("scope"));

describe("scopes perezosos por método", () => {
    it("sin `scopes`, cada método pide su propio scope una sola vez", async () => {
        const { fetch, calls } = platform((url, form) => {
            if (url.endsWith("/oauth/token")) return json(200, { access_token: `tok-${form?.get("scope")}`, expires_in: 300 });
            if (url.includes("/contact")) return json(200, { userId: "usr_1", email: "ana@example.com", emailVerified: true, name: null, locale: null });
            if (url.includes("/catalog/")) return json(200, { items: [] });
            if (url.includes("/users")) return json(200, { users: [], total: 0 });
            return json(200, { environmentId: ENV, user: null, subscription: {}, entitlements: { entitlements: [] }, modules: [], usage: {} });
        });
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess({ baseUrl: BASE, machineTokens, environmentId: ENV, fetch });
        await access.users.contact("usr_1");
        await access.users.contact("usr_2");
        await access.me();
        await access.catalog.plans();
        await access.users.list();
        expect(tokenScopes(calls)).toEqual(["users:contact:read", "capabilities:read", "catalog:read", "users:read"]);
    });

    it("con `scopes` explícitos se usa ese único token, y el fallo de scope nombra método y scope", async () => {
        const { fetch, calls } = platform((url) => url.endsWith("/oauth/token")
            ? json(200, { access_token: "tok", expires_in: 300 })
            : json(403, { error: "SCOPE_REQUIRED", message: "This credential needs the users:contact:read scope." }));
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess({ baseUrl: BASE, machineTokens, scopes: ["capabilities:read"], environmentId: ENV, fetch });
        const error = await access.users.contact("usr_1").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CustomyAccessError);
        expect(error).toMatchObject({ code: "SCOPE_REQUIRED", status: 403, requiredScope: "users:contact:read" });
        expect((error as Error).message).toContain("users.contact");
        expect((error as Error).message).toContain("users:contact:read");
        expect(tokenScopes(calls)).toEqual(["capabilities:read"]);
    });

    it("un token que Access no concede con ese scope también nombra el scope", async () => {
        const { fetch } = platform(() => json(400, { error: "invalid_scope" }));
        const machineTokens = createMachineTokens({ issuer: BASE, clientId: "app", clientSecret: "secret", fetch });
        const access = createAccess({ baseUrl: BASE, machineTokens, environmentId: ENV, fetch });
        await expect(access.catalog.features()).rejects.toMatchObject({ code: "SDK_MACHINE_TOKEN_INVALID_SCOPE", requiredScope: "catalog:read" });
    });
});

describe("signal y timeoutMs por llamada", () => {
    it("llegan al transporte y no se cuelan en la query", async () => {
        const { fetch, calls } = platform(() => json(200, { users: [], total: 0 }));
        const access = createAccess({ baseUrl: BASE, accessToken: "cak_live_fixture", environmentId: ENV, fetch });
        const controller = new AbortController();
        await access.users.list({ search: "ana", signal: controller.signal, timeoutMs: 1_000 });
        const url = new URL(calls[0]!.url);
        expect([...url.searchParams.keys()]).toEqual(["search"]);
        expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    });

    it("timeoutMs por llamada corta aunque el cliente espere más", async () => {
        const fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof globalThis.fetch;
        const access = createAccess({ baseUrl: BASE, accessToken: "tok", environmentId: ENV, fetch, timeoutMs: 60_000, retry: false });
        await expect(access.me({ timeoutMs: 5 })).rejects.toMatchObject({ code: "SDK_TIMEOUT", service: "access" });
        await expect(access.users.contact("usr_1", { timeoutMs: 5 })).rejects.toMatchObject({ code: "SDK_TIMEOUT" });
        const aborted = new AbortController();
        aborted.abort();
        await expect(access.catalog.get({ signal: aborted.signal })).rejects.toMatchObject({ code: "SDK_ABORTED" });
    });
});
