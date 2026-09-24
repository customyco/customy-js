import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createMachineTokenVerifier, verifyMachineRequest } from "./server";

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
