import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
    ACCESS_UNAVAILABLE,
    assertActorAssertionSecret,
    createAccessTokenVerifier,
    createActorAssertionVerifier,
    createMachineTokenVerifier,
    createRemoteJwks,
    createRequestVerifier,
    isAccessUnavailable,
    signActorAssertion,
    verifyMachineRequest,
    verifyRequest,
} from "./index";

const issuer = "https://access.fixture.invalid";
const jwksUri = `${issuer}/oauth/jwks.json`;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const nowSeconds = Math.floor(NOW / 1000);
const userClaims = { sub: "user_1", org_id: "org_fixture", environment_id: "env_fixture", typ: "access_token", scope: "openid" };
const machineClaims = {
    sub: "machine:key_1", client_id: "key_1", scope: "data:read", org_id: "org_fixture", project_id: "proj_fixture", application_id: "app_fixture",
    environment_id: "env_fixture", gty: "client_credentials", token_use: "machine", typ: "access_token", jti: "00000000-0000-4000-8000-000000000002",
};

let privateKey: CryptoKey;
let jwk: JWK;

beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey as CryptoKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
});

const jwksFetch = (respond: () => Response | Promise<Response>) => (async () => respond()) as typeof globalThis.fetch;
const jwksOk = () => jwksFetch(() => Response.json({ keys: [jwk] }));

function sign(claims: Record<string, unknown>, options: { audience: string; iat?: number; lifetime?: number }) {
    const iat = options.iat ?? nowSeconds;
    return new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(options.audience)
        .setIssuedAt(iat).setExpirationTime(iat + (options.lifetime ?? 600)).sign(privateKey);
}

describe("iat en el futuro", () => {
    it("se rechaza más allá del margen (60 s por defecto, configurable)", async () => {
        const verify = createAccessTokenVerifier({ issuer, audience: "client_app", jwks: { fetch: jwksOk() }, now: () => NOW });
        expect(await verify(await sign(userClaims, { audience: "client_app", iat: nowSeconds + 30 }))).not.toBeNull();
        expect(await verify(await sign(userClaims, { audience: "client_app", iat: nowSeconds + 120 }))).toBeNull();
        const strict = createAccessTokenVerifier({ issuer, audience: "client_app", jwks: { fetch: jwksOk() }, now: () => NOW, issuedAtSkewSeconds: 10 });
        expect(await strict(await sign(userClaims, { audience: "client_app", iat: nowSeconds + 30 }))).toBeNull();
        const machine = createMachineTokenVerifier({ issuer, audience: "customy-data", jwks: { fetch: jwksOk() }, now: () => NOW });
        expect(await machine(await sign(machineClaims, { audience: "customy-data", iat: nowSeconds + 300 }))).toBeNull();
    });
});

describe("token inválido (null) frente a Access no disponible (ACCESS_UNAVAILABLE)", () => {
    it("JWKS caído o inalcanzable al arrancar ⇒ ACCESS_UNAVAILABLE con status 503", async () => {
        const token = await sign(userClaims, { audience: "client_app" });
        for (const fetch of [jwksFetch(() => new Response("", { status: 503 })), jwksFetch(() => { throw new TypeError("fetch failed"); }), jwksFetch(() => new Response("<html>", { status: 200 }))]) {
            const verify = createAccessTokenVerifier({ issuer, audience: "client_app", jwks: { fetch }, now: () => NOW });
            const error = await verify(token).catch((e: unknown) => e);
            expect(isAccessUnavailable(error)).toBe(true);
            expect(error).toMatchObject({ code: ACCESS_UNAVAILABLE, status: 503, service: "access" });
        }
    });

    it("un token malo sigue siendo null con el JWKS sano", async () => {
        const verify = createAccessTokenVerifier({ issuer, audience: "client_app", jwks: { fetch: jwksOk() }, now: () => NOW });
        expect(await verify(await sign(userClaims, { audience: "other" }))).toBeNull();
        expect(await verify("x".repeat(30) + ".y.z")).toBeNull();
    });

    it("introspección: inactivo ⇒ null; caída, 5xx o 429 ⇒ ACCESS_UNAVAILABLE", async () => {
        const token = await sign(userClaims, { audience: "client_app" });
        const verifier = (introspect: () => Response | Promise<Response>) => createAccessTokenVerifier({
            issuer, audience: "client_app", jwks: { fetch: jwksOk() }, now: () => NOW, introspection: { fetch: jwksFetch(introspect) },
        });
        expect(await verifier(() => Response.json({ active: false }))(token)).toBeNull();
        expect(await verifier(() => new Response("", { status: 401 }))(token)).toBeNull();
        await expect(verifier(() => new Response("", { status: 502 }))(token)).rejects.toMatchObject({ code: ACCESS_UNAVAILABLE });
        await expect(verifier(() => new Response("", { status: 429 }))(token)).rejects.toMatchObject({ code: ACCESS_UNAVAILABLE });
        await expect(verifier(() => { throw new TypeError("offline"); })(token)).rejects.toMatchObject({ code: ACCESS_UNAVAILABLE });
    });

    it("verifyRequest y verifyMachineRequest dejan pasar ACCESS_UNAVAILABLE (→ 503) y siguen devolviendo null ante un token malo", async () => {
        const down = createMachineTokenVerifier({ issuer, audience: "customy-data", jwks: { fetch: jwksFetch(() => new Response("", { status: 503 })) }, now: () => NOW });
        const token = await sign(machineClaims, { audience: "customy-data" });
        const request = () => new Request("https://api.fixture.invalid/v1", { headers: { authorization: `Bearer ${token}` } });
        await expect(verifyRequest(request(), { bearer: down })).rejects.toMatchObject({ code: ACCESS_UNAVAILABLE });
        await expect(verifyMachineRequest(request(), down)).rejects.toMatchObject({ code: ACCESS_UNAVAILABLE });
        const healthy = createMachineTokenVerifier({ issuer, audience: "customy-send", jwks: { fetch: jwksOk() }, now: () => NOW });
        expect(await verifyRequest(request(), { bearer: healthy })).toBeNull();
    });
});

describe("secreto de la assertion", () => {
    const secret = "s".repeat(32);

    it("se valida al construir y nunca lanza al verificar", async () => {
        expect(() => assertActorAssertionSecret("short")).toThrow(expect.objectContaining({ code: "SDK_ASSERTION_SECRET_INVALID" }));
        expect(() => assertActorAssertionSecret(undefined)).toThrow(expect.objectContaining({ code: "SDK_ASSERTION_SECRET_INVALID" }));
        expect(() => createRequestVerifier({ assertion: { secret: "", audience: "acme-api" } })).toThrow(expect.objectContaining({ code: "SDK_ASSERTION_SECRET_INVALID" }));
        expect(() => createRequestVerifier({ assertion: { secret, audience: "" } })).toThrow(expect.objectContaining({ code: "SDK_ASSERTION_INVALID" }));
        expect(() => createActorAssertionVerifier({ secret: "short", audience: "acme-api" })).toThrow(expect.objectContaining({ code: "SDK_ASSERTION_SECRET_INVALID" }));
    });

    it("verifyRequest con un secreto corto devuelve null en vez de lanzar", async () => {
        const request = new Request("https://api.fixture.invalid/api/items", { headers: { "x-customy-actor": "a.b" } });
        expect(await verifyRequest(request, { assertion: { secret: "short", audience: "acme-api" } })).toBeNull();
    });

    it("createRequestVerifier y createActorAssertionVerifier verifican igual que verifyRequest", async () => {
        const actor = { issuer, subject: "user_1", environmentId: "env_fixture" };
        const assertion = await signActorAssertion(actor, { secret, audience: "acme-api", method: "GET", path: "/api/items", now: () => NOW });
        const verify = createRequestVerifier({ assertion: { secret, audience: "acme-api", now: () => NOW } });
        expect(await verify(new Request("https://api.fixture.invalid/api/items", { headers: { "x-customy-actor": assertion } }))).toEqual({ kind: "assertion", actor });
        const verifyAssertion = createActorAssertionVerifier({ secret, audience: "acme-api", now: () => NOW });
        expect(await verifyAssertion(assertion, { method: "GET", path: "/api/items" })).toEqual(actor);
        expect(await verifyAssertion(assertion, { method: "POST", path: "/api/items" })).toBeNull();
        expect(await verifyAssertion("garbage", { method: "GET", path: "/api/items" })).toBeNull();
    });
});

describe("JWKS: claves que de verdad se importan", () => {
    it("una clave malformada con kid no cuenta en kids ni se usa", async () => {
        const broken: JWK = { kty: "RSA", kid: "broken", alg: "RS256", use: "sig", n: "not-base64!!", e: "AQAB" };
        const keys = createRemoteJwks(jwksUri, { fetch: jwksFetch(() => Response.json({ keys: [broken, jwk] })) });
        await keys.refresh({ force: true });
        expect(keys.kids).toEqual(["k1"]);
    });

    it("un JWKS con solo claves malformadas no se da por disponible", async () => {
        const broken: JWK = { kty: "RSA", kid: "broken", alg: "RS256", use: "sig", n: "AA", e: "AQAB" };
        const keys = createRemoteJwks(jwksUri, { fetch: jwksFetch(() => Response.json({ keys: [broken] })) });
        await expect(keys.refresh({ force: true })).rejects.toMatchObject({ code: "SDK_JWKS_INVALID" });
        expect(keys.kids).toEqual([]);
    });
});
