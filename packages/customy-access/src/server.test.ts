import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createMachineTokenProvider, createMachineTokenVerifier, discoverPlatform, verifyMachineRequest } from "./server";

const issuer = "https://access.fixture.invalid";
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

const baseClaims = {
    sub: "machine:key_1",
    client_id: "key_1",
    scope: "data:write data:read",
    org_id: "org_fixture",
    project_id: "proj_fixture",
    application_id: "app_fixture",
    environment_id: "env_fixture",
    gty: "client_credentials",
    token_use: "machine",
    typ: "access_token",
    jti: "00000000-0000-4000-8000-000000000001",
};

async function sign(claims: Record<string, unknown> = {}, options: { audience?: string; issuer?: string; lifetime?: number; alg?: string } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ ...baseClaims, ...claims })
        .setProtectedHeader({ alg: options.alg ?? "RS256", kid: "k1" })
        .setIssuer(options.issuer ?? issuer)
        .setAudience(options.audience ?? "customy-data")
        .setIssuedAt(now)
        .setExpirationTime(now + (options.lifetime ?? 900))
        .sign(privateKey);
}

beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey as CryptoKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" } as JWK;
    keys = createLocalJWKSet({ keys: [jwk] });
});

describe("machine token verifier", () => {
    it("acepta un token de máquina válido para su audiencia y devuelve el tenant de los claims", async () => {
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", keys });
        expect(await verify(await sign())).toMatchObject({
            clientId: "key_1", organizationId: "org_fixture", projectId: "proj_fixture", applicationId: "app_fixture", environmentId: "env_fixture", audience: "customy-data", scopes: ["data:write", "data:read"],
        });
    });

    it("rechaza otra audiencia, otro issuer y tokens que no son de máquina", async () => {
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", keys });
        expect(await verify(await sign({}, { audience: "customy-send" }))).toBeNull();
        expect(await verify(await sign({}, { issuer: "https://other.fixture.invalid" }))).toBeNull();
        expect(await verify(await sign({ token_use: undefined }))).toBeNull();
        expect(await verify(await sign({ gty: "authorization_code" }))).toBeNull();
        expect(await verify(await sign({ sub: "user_1" }))).toBeNull();
        expect(await verify(await sign({ client_id: "key_2" }))).toBeNull();
        expect(await verify(await sign({ environment_id: "" }))).toBeNull();
        expect(await verify(await sign({ project_id: undefined }))).toBeNull();
        expect(await verify(await sign({ application_id: "" }))).toBeNull();
        expect(await verify(await sign({ scope: "" }))).toBeNull();
    });

    it("acepta tokens delegados (RFC 8693) y expone el producto que actúa", async () => {
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", keys });
        const exchanged = { gty: "urn:ietf:params:oauth:grant-type:token-exchange", act: { sub: "machine:key_forms", client_id: "key_forms", service: "customy-forms" } };
        expect(await verify(await sign(exchanged))).toMatchObject({ clientId: "key_1", organizationId: "org_fixture", actor: { clientId: "key_forms", service: "customy-forms" } });
        expect((await verify(await sign()))?.actor).toBeUndefined();
        expect(await verify(await sign({ gty: exchanged.gty }))).toBeNull();
        expect(await verify(await sign({ ...exchanged, act: { ...exchanged.act, sub: "machine:other" } }))).toBeNull();
        expect(await verify(await sign({ ...exchanged, act: { ...exchanged.act, service: "" } }))).toBeNull();
        expect(await verify(await sign({ ...exchanged, act: { ...exchanged.act, act: { sub: "machine:x" } } }))).toBeNull();
        expect(await verify(await sign({ act: exchanged.act }))).toBeNull();
    });

    it("rechaza vidas mayores que las que emite Access y tokens manipulados", async () => {
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", keys });
        expect(await verify(await sign({}, { lifetime: 3600 }))).toBeNull();
        const token = await sign();
        const [header, , signature] = token.split(".");
        const forged = Buffer.from(JSON.stringify({ ...baseClaims, org_id: "org_other", aud: "customy-data", iss: issuer })).toString("base64url");
        expect(await verify(`${header}.${forged}.${signature}`)).toBeNull();
        expect(await verify("not-a-token")).toBeNull();
    });

    it("exige issuer https y audiencia al construir el verificador", () => {
        expect(() => createMachineTokenVerifier({ issuer: "http://access.fixture.invalid", audience: "customy-data", keys })).toThrow("CUSTOMY_ACCESS_ISSUER_INVALID");
        expect(() => createMachineTokenVerifier({ issuer, audience: "", keys })).toThrow("CUSTOMY_MACHINE_TOKEN_AUDIENCE_REQUIRED");
    });

    it("verifica el Bearer de una Request y exige los scopes pedidos", async () => {
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", keys });
        const request = new Request("https://data.fixture.invalid/v1/collect", { headers: { authorization: `Bearer ${await sign()}` } });
        expect(await verifyMachineRequest(request, verify, ["data:write"])).not.toBeNull();
        expect(await verifyMachineRequest(request, verify, ["data:admin"])).toBeNull();
        expect(await verifyMachineRequest(new Request("https://data.fixture.invalid/"), verify)).toBeNull();
    });
});

describe("machine token provider", () => {
    it("cachea el token hasta poco antes de caducar y agrupa las peticiones concurrentes", async () => {
        let clock = 1_000_000;
        const calls: RequestInit[] = [];
        const fetchMock = async (_url: RequestInfo | URL, init?: RequestInit) => {
            calls.push(init!);
            return Response.json({ access_token: `jwt-${calls.length}`, expires_in: 900 });
        };
        const token = createMachineTokenProvider({ issuer, clientId: "key_1", clientSecret: "s3cret", audience: "customy-send", scopes: ["send:emails:send"], fetch: fetchMock as typeof fetch, now: () => clock });
        expect(await Promise.all([token(), token(), token()])).toEqual(["jwt-1", "jwt-1", "jwt-1"]);
        expect(calls).toHaveLength(1);
        const body = new URLSearchParams(String(calls[0].body));
        expect(Object.fromEntries(body)).toEqual({ grant_type: "client_credentials", audience: "customy-send", scope: "send:emails:send" });
        expect((calls[0].headers as Record<string, string>).authorization).toBe(`Basic ${btoa("key_1:s3cret")}`);
        clock += 800_000;
        expect(await token()).toBe("jwt-1");
        clock += 60_000;
        expect(await token()).toBe("jwt-2");
    });

    it("propaga el error de Access y no cachea un fallo", async () => {
        let fail = true;
        const fetchMock = async () => (fail ? Response.json({ error: "invalid_client" }, { status: 401 }) : Response.json({ access_token: "jwt-ok", expires_in: 900 }));
        const token = createMachineTokenProvider({ issuer, clientId: "k", clientSecret: "s", audience: "customy-data", fetch: fetchMock as typeof fetch });
        await expect(token()).rejects.toThrow("CUSTOMY_MACHINE_TOKEN_FAILED: 401 invalid_client");
        fail = false;
        expect(await token()).toBe("jwt-ok");
        expect(() => createMachineTokenProvider({ issuer, clientId: "", clientSecret: "s", audience: "customy-data" })).toThrow("CUSTOMY_MACHINE_CREDENTIALS_REQUIRED");
    });
});

describe("platform discovery", () => {
    it("normaliza los productos del discovery y exige que el issuer coincida", async () => {
        const fetchMock = async () => Response.json({ issuer, token_endpoint: `${issuer}/oauth/token`, products: { send: { base_url: "https://send.fixture.invalid/", audience: "customy-send" }, broken: { base_url: 1 } } });
        expect(await discoverPlatform(issuer, fetchMock as typeof fetch)).toEqual({
            issuer, tokenEndpoint: `${issuer}/oauth/token`, products: { send: { baseUrl: "https://send.fixture.invalid", audience: "customy-send" } },
        });
        const other = async () => Response.json({ issuer: "https://evil.fixture.invalid", token_endpoint: "x" });
        await expect(discoverPlatform(issuer, other as typeof fetch)).rejects.toThrow("CUSTOMY_DISCOVERY_INVALID");
    });
});
