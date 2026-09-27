import { describe, expect, it } from "vitest";
import { createMachineTokens } from "./machine-token";
import { connectProduct, resolveBearer } from "./product";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ISSUER = "https://access.fixture.invalid";
const platform = {
    issuer: ISSUER, jwksUri: `${ISSUER}/jwks`, tokenEndpoint: `${ISSUER}/oauth/token`, grantTypesSupported: [],
    products: { send: { baseUrl: "https://send.fixture.invalid", audience: "customy-send" } },
};

describe("connectProduct", () => {
    it("resuelve URL: explícita, del discovery o la pública del producto", () => {
        const product = { key: "send", audience: "customy-send", defaultBaseUrl: "https://public.fixture.invalid" };
        expect(connectProduct({ accessToken: "k", baseUrl: "https://own.fixture.invalid/" }, product).baseUrl).toBe("https://own.fixture.invalid");
        expect(connectProduct({ accessToken: "k", platform }, product).baseUrl).toBe("https://send.fixture.invalid");
        expect(connectProduct({ accessToken: "k" }, product).baseUrl).toBe("https://public.fixture.invalid");
        expect(() => connectProduct({ accessToken: "k" }, { key: "data", audience: "customy-data" })).toThrow(expect.objectContaining({ code: "SDK_BASE_URL_REQUIRED" }));
    });

    it("exige exactamente una credencial salvo que sea opcional", () => {
        const product = { key: "send", audience: "customy-send", defaultBaseUrl: "https://public.fixture.invalid" };
        const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret" });
        expect(() => connectProduct({}, product)).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_REQUIRED", service: "send" }));
        expect(() => connectProduct({ accessToken: "", }, product)).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_REQUIRED" }));
        expect(() => connectProduct({ accessToken: "k", machineTokens }, product)).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_AMBIGUOUS" }));
        expect(connectProduct({}, { ...product, credentialOptional: true }).credential).toBeUndefined();
    });

    it("con machineTokens usa la audiencia del discovery y los scopes pedidos o los del producto", async () => {
        const requests: URLSearchParams[] = [];
        const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            requests.push(new URLSearchParams(String(init?.body)));
            return json(200, { access_token: `tok-${requests.length}`, expires_in: 300 });
        }) as typeof globalThis.fetch;
        const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch, platform });
        const product = { key: "send", audience: "fallback-audience", defaultScopes: ["send:emails:send"] };
        const byDefault = connectProduct({ machineTokens, platform }, product);
        await resolveBearer(byDefault.credential, "send");
        const explicit = connectProduct({ machineTokens, platform, scopes: ["send:templates:read"] }, product);
        await resolveBearer(explicit.credential, "send");
        expect(requests.map((form) => [form.get("audience"), form.get("scope")])).toEqual([["customy-send", "send:emails:send"], ["customy-send", "send:templates:read"]]);
    });

    it("resolveBearer tipa el fallo del proveedor", async () => {
        await expect(resolveBearer(async () => { throw new Error("boom"); }, "send")).rejects.toMatchObject({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE", status: 401, service: "send" });
        await expect(resolveBearer(undefined)).rejects.toMatchObject({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE" });
        await expect(resolveBearer("tok")).resolves.toBe("tok");
    });
});
