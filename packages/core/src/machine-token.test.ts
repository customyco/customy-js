import { describe, expect, it } from "vitest";
import { parsePlatformConfiguration } from "./discovery";
import { createMachineTokenProvider, createMachineTokens } from "./machine-token";

const issuer = "https://access.fixture.invalid";

function tokenEndpoint(options: { expiresIn?: number; status?: number; error?: string } = {}) {
    const requests: Array<{ url: string; authorization: string; body: URLSearchParams }> = [];
    let counter = 0;
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), authorization: (init?.headers as Record<string, string>).authorization!, body: new URLSearchParams(String(init?.body)) });
        await Promise.resolve();
        if (options.status && options.status >= 400) return new Response(JSON.stringify({ error: options.error ?? "server_error" }), { status: options.status });
        counter += 1;
        return new Response(JSON.stringify({ access_token: `tok_${counter}`, token_type: "Bearer", expires_in: options.expiresIn ?? 900 }), { status: 200 });
    }) as typeof globalThis.fetch;
    return { fetch, requests };
}

describe("createMachineTokenProvider", () => {
    it("pide client_credentials con Basic y la audiencia, y cachea el token", async () => {
        const { fetch, requests } = tokenEndpoint();
        let clock = 1_000_000;
        const provider = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "s3cr:et", audience: "customy-send", scopes: ["send:email"], fetch, now: () => clock });
        expect(await provider()).toBe("tok_1");
        expect(await provider()).toBe("tok_1");
        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe(`${issuer}/oauth/token`);
        expect(requests[0]!.authorization).toBe(`Basic ${btoa("key_1:s3cr%3Aet")}`);
        expect(Object.fromEntries(requests[0]!.body)).toEqual({ grant_type: "client_credentials", audience: "customy-send", scope: "send:email" });
        expect(provider.audience).toBe("customy-send");
        clock += 5 * 60_000;
        expect(await provider()).toBe("tok_1");
    });

    it("renueva antes de caducar (skew) y tras caducar", async () => {
        const { fetch, requests } = tokenEndpoint({ expiresIn: 900 });
        let clock = 0;
        const provider = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "secret", audience: "customy-data", fetch, now: () => clock });
        await provider();
        clock = (900 - 61) * 1000;
        expect(await provider()).toBe("tok_1");
        clock = (900 - 59) * 1000;
        expect(await provider()).toBe("tok_2");
        clock += 2_000_000;
        expect(await provider()).toBe("tok_3");
        expect(requests).toHaveLength(3);
    });

    it("un token de vida corta sigue cacheándose (el skew nunca supera la mitad de la vida)", async () => {
        const { fetch, requests } = tokenEndpoint({ expiresIn: 60 });
        let clock = 0;
        const provider = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "secret", audience: "customy-data", fetch, now: () => clock });
        await provider();
        clock = 29_000;
        await provider();
        expect(requests).toHaveLength(1);
        clock = 31_000;
        await provider();
        expect(requests).toHaveLength(2);
    });

    it("agrupa las peticiones concurrentes en una sola", async () => {
        const { fetch, requests } = tokenEndpoint();
        const provider = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "secret", audience: "customy-data", fetch });
        const tokens = await Promise.all(Array.from({ length: 50 }, () => provider()));
        expect(new Set(tokens)).toEqual(new Set(["tok_1"]));
        expect(requests).toHaveLength(1);
    });

    it("invalidate() fuerza un token nuevo", async () => {
        const { fetch } = tokenEndpoint();
        const provider = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "secret", audience: "customy-data", fetch });
        expect(await provider()).toBe("tok_1");
        provider.invalidate();
        expect(await provider()).toBe("tok_2");
    });

    it("un fallo del token endpoint sale tipado con el código OAuth y no se cachea", async () => {
        const { fetch } = tokenEndpoint({ status: 401, error: "invalid_client" });
        const provider = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "bad", audience: "customy-data", fetch });
        await expect(provider()).rejects.toMatchObject({ code: "SDK_MACHINE_TOKEN_INVALID_CLIENT", status: 401 });
        await expect(provider()).rejects.toMatchObject({ status: 401 });
    });

    it("valida la configuración: issuer https, credenciales, audiencia y token endpoint en el origen del issuer", () => {
        const { fetch } = tokenEndpoint();
        const base = { issuer, clientId: "key_1", clientSecret: "secret", audience: "customy-data", fetch };
        expect(() => createMachineTokenProvider({ ...base, issuer: "http://access.fixture.invalid" })).toThrow(/issuer/);
        expect(() => createMachineTokenProvider({ ...base, clientSecret: "" })).toThrow(/clientSecret/);
        expect(() => createMachineTokenProvider({ ...base, audience: " " })).toThrow(/audience/);
        expect(() => createMachineTokenProvider({ ...base, tokenEndpoint: "https://evil.fixture.invalid/oauth/token" })).toThrow(/token endpoint/);
    });
});

describe("createMachineTokens", () => {
    const platform = parsePlatformConfiguration(issuer, {
        issuer,
        token_endpoint: `${issuer}/oauth/token`,
        jwks_uri: `${issuer}/oauth/jwks.json`,
        products: { send: { base_url: "https://send.fixture.invalid/", audience: "customy-send" }, data: { base_url: "https://data.fixture.invalid", audience: "customy-data" } },
    });

    it("un proveedor perezoso por audiencia: nada se pide hasta usarlo, y cada audiencia tiene su token", async () => {
        const { fetch, requests } = tokenEndpoint();
        const tokens = createMachineTokens({ issuer, clientId: "key_1", clientSecret: "secret", platform, fetch, scopes: { send: ["send:email"] } });
        const send = tokens.forProduct("send");
        expect(requests).toHaveLength(0);
        expect(tokens.forProduct("send")).toBe(send);
        expect(tokens.forAudience("customy-send", ["send:email"])).toBe(send);
        await send();
        await tokens.forProduct("data")();
        await send();
        expect(requests.map((request) => [request.body.get("audience"), request.body.get("scope")])).toEqual([["customy-send", "send:email"], ["customy-data", null]]);
        expect(() => tokens.forProduct("crm")).toThrow(/crm/);
        tokens.invalidateAll();
        await send();
        expect(requests).toHaveLength(3);
    });

    it("rechaza un discovery de otro issuer", () => {
        expect(() => createMachineTokens({ issuer: "https://other.fixture.invalid", clientId: "k", clientSecret: "s", platform })).toThrow(/issuer/);
    });
});
