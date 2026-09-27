import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
    createAccessTokenVerifier,
    createMachineTokenVerifier,
    createRemoteJwks,
    requestFromIncomingMessage,
    signActorAssertion,
    verifyActorAssertion,
    verifyIncomingMessage,
    verifyMachineRequest,
    verifyRequest,
} from "./index";

const issuer = "https://access.fixture.invalid";
const jwksUri = `${issuer}/oauth/jwks.json`;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const nowSeconds = Math.floor(NOW / 1000);

type Pair = { privateKey: CryptoKey; jwk: JWK };
let k1: Pair;
let k2: Pair;

async function pair(kid: string): Promise<Pair> {
    const generated = await generateKeyPair("RS256");
    return { privateKey: generated.privateKey as CryptoKey, jwk: { ...(await exportJWK(generated.publicKey)), kid, alg: "RS256", use: "sig" } };
}

beforeAll(async () => {
    k1 = await pair("k1");
    k2 = await pair("k2");
});

/** Issuer de mentira cuyo JWKS se puede rotar. */
function jwksServer(initial: JWK[]) {
    let keys = initial;
    let requests = 0;
    let down = false;
    const fetch = (async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(jwksUri);
        requests += 1;
        if (down) return new Response("", { status: 503 });
        return new Response(JSON.stringify({ keys }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;
    return {
        fetch,
        rotate(next: JWK[]) { keys = next; },
        setDown(value: boolean) { down = value; },
        get requests() { return requests; },
    };
}

const machineClaims = {
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

async function sign(key: Pair, claims: Record<string, unknown>, options: { audience?: string; issuer?: string; iat?: number; lifetime?: number } = {}) {
    const iat = options.iat ?? nowSeconds;
    return new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: key.jwk.kid! })
        .setIssuer(options.issuer ?? issuer)
        .setAudience(options.audience ?? "customy-data")
        .setIssuedAt(iat)
        .setExpirationTime(iat + (options.lifetime ?? 900))
        .sign(key.privateKey);
}

describe("createRemoteJwks", () => {
    it("rota: un kid nuevo refresca el JWKS y una clave retirada deja de valer tras el refresco", async () => {
        const server = jwksServer([k1.jwk]);
        let clock = NOW;
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", jwks: { fetch: server.fetch, cooldownMs: 30_000 }, now: () => clock });
        expect(await verify(await sign(k1, machineClaims))).toMatchObject({ clientId: "key_1" });
        expect(server.requests).toBe(1);

        // El issuer rota a k2 (conservando k1 un tiempo, como Access).
        server.rotate([k1.jwk, k2.jwk]);
        clock += 31_000;
        expect(await verify(await sign(k2, machineClaims))).toMatchObject({ clientId: "key_1" });
        expect(server.requests).toBe(2);

        // k1 se retira. Mientras la caché es fresca sigue valiendo; tras caducar, no.
        server.rotate([k2.jwk]);
        expect(await verify(await sign(k1, machineClaims))).not.toBeNull();
        clock += 11 * 60_000;
        expect(await verify(await sign(k1, machineClaims, { iat: Math.floor(clock / 1000) }))).toBeNull();
        expect(await verify(await sign(k2, machineClaims, { iat: Math.floor(clock / 1000) }))).not.toBeNull();
    });

    it("un kid inventado no convierte cada petición en una llamada al issuer (cooldown)", async () => {
        const server = jwksServer([k1.jwk]);
        let clock = NOW;
        const keys = createRemoteJwks(jwksUri, { fetch: server.fetch, cooldownMs: 30_000, now: () => clock });
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", keys, now: () => clock });
        const forged = await sign(k2, machineClaims);
        for (let index = 0; index < 20; index += 1) expect(await verify(forged)).toBeNull();
        expect(server.requests).toBe(1);
        clock += 31_000;
        for (let index = 0; index < 20; index += 1) expect(await verify(forged)).toBeNull();
        expect(server.requests).toBe(2);
        expect(keys.kids).toEqual(["k1"]);
    });

    it("si el issuer cae, sigue verificando con las claves conocidas hasta maxStale", async () => {
        const server = jwksServer([k1.jwk]);
        let clock = NOW;
        const verify = createMachineTokenVerifier({ issuer, audience: "customy-data", jwks: { fetch: server.fetch, cacheMaxAgeMs: 60_000, maxStaleMs: 120_000 }, now: () => clock });
        expect(await verify(await sign(k1, machineClaims))).not.toBeNull();
        server.setDown(true);
        clock += 90_000;
        expect(await verify(await sign(k1, machineClaims, { iat: Math.floor(clock / 1000) }))).not.toBeNull();
        clock += 200_000;
        expect(await verify(await sign(k1, machineClaims, { iat: Math.floor(clock / 1000) }))).toBeNull();
    });

    it("exige https", () => {
        expect(() => createRemoteJwks("http://access.fixture.invalid/jwks")).toThrow(/https/);
    });
});

describe("createMachineTokenVerifier", () => {
    const server = () => jwksServer([k1.jwk]);
    const verifier = () => createMachineTokenVerifier({ issuer, audience: "customy-data", jwks: { fetch: server().fetch }, now: () => NOW });

    it("acepta un token válido y devuelve el tenant firmado", async () => {
        expect(await verifier()(await sign(k1, machineClaims))).toEqual({
            clientId: "key_1", organizationId: "org_fixture", projectId: "proj_fixture", applicationId: "app_fixture", environmentId: "env_fixture",
            audience: "customy-data", scopes: ["data:write", "data:read"], tokenId: machineClaims.jti, expiresAt: nowSeconds + 900,
        });
    });

    it("rechaza otra audiencia, otro issuer, caducado, vida excesiva y claims que no son de máquina", async () => {
        const verify = verifier();
        expect(await verify(await sign(k1, machineClaims, { audience: "customy-send" }))).toBeNull();
        expect(await verify(await sign(k1, machineClaims, { issuer: "https://other.fixture.invalid" }))).toBeNull();
        expect(await verify(await sign(k1, machineClaims, { iat: nowSeconds - 2000 }))).toBeNull();
        expect(await verify(await sign(k1, machineClaims, { lifetime: 3600 }))).toBeNull();
        expect(await verify(await sign(k1, { ...machineClaims, token_use: undefined }))).toBeNull();
        expect(await verify(await sign(k1, { ...machineClaims, sub: "user_1" }))).toBeNull();
        expect(await verify(await sign(k1, { ...machineClaims, client_id: "key_2" }))).toBeNull();
        expect(await verify(await sign(k1, { ...machineClaims, environment_id: "" }))).toBeNull();
        expect(await verify(await sign(k1, { ...machineClaims, scope: "" }))).toBeNull();
        expect(await verify("not-a-jwt")).toBeNull();
    });

    it("acepta la delegación (token exchange) y expone el actor", async () => {
        const delegated = { ...machineClaims, gty: "urn:ietf:params:oauth:grant-type:token-exchange", act: { sub: "machine:key_forms", client_id: "key_forms", service: "forms" } };
        expect(await verifier()(await sign(k1, delegated))).toMatchObject({ clientId: "key_1", actor: { clientId: "key_forms", service: "forms" } });
        expect(await verifier()(await sign(k1, { ...delegated, act: { ...delegated.act, act: {} } }))).toBeNull();
    });

    it("verifyMachineRequest exige Bearer y scopes", async () => {
        const verify = verifier();
        const token = await sign(k1, machineClaims);
        const request = (auth?: string) => new Request("https://data.fixture.invalid/v1/collect", { headers: auth ? { authorization: auth } : {} });
        expect(await verifyMachineRequest(request(`Bearer ${token}`), verify, ["data:write"])).toMatchObject({ clientId: "key_1" });
        expect(await verifyMachineRequest(request(`Bearer ${token}`), verify, ["data:admin"])).toBeNull();
        expect(await verifyMachineRequest(request(`Basic ${token}`), verify)).toBeNull();
        expect(await verifyMachineRequest(request(), verify)).toBeNull();
    });
});

describe("createAccessTokenVerifier (usuario)", () => {
    const userClaims = { sub: "user_1", org_id: "org_fixture", environment_id: "env_fixture", typ: "access_token", scope: "openid profile" };
    const options = { issuer, audience: "client_app", organizationId: "org_fixture", environmentId: "env_fixture", requiredScopes: ["openid"], now: () => NOW };

    it("acepta el token de la app para su tenant y rechaza audiencia, tenant, scope y caducidad ajenos", async () => {
        const verify = createAccessTokenVerifier({ ...options, jwks: { fetch: jwksServer([k1.jwk]).fetch } });
        const signUser = (claims: Record<string, unknown> = {}, extra: { audience?: string; iat?: number; lifetime?: number; issuer?: string } = {}) =>
            sign(k1, { ...userClaims, ...claims }, { audience: "client_app", lifetime: 3600, ...extra });
        expect(await verify(await signUser())).toEqual({
            issuer, subject: "user_1", organizationId: "org_fixture", environmentId: "env_fixture", audience: "client_app", scopes: ["openid", "profile"], expiresAt: nowSeconds + 3600,
        });
        expect(await verify(await signUser({}, { audience: "other_client" }))).toBeNull();
        expect(await verify(await signUser({}, { issuer: "https://other.fixture.invalid" }))).toBeNull();
        expect(await verify(await signUser({ environment_id: "env_other" }))).toBeNull();
        expect(await verify(await signUser({ org_id: "org_other" }))).toBeNull();
        expect(await verify(await signUser({ scope: "profile" }))).toBeNull();
        expect(await verify(await signUser({}, { iat: nowSeconds - 7200, lifetime: 3600 }))).toBeNull();
        expect(await verify(await signUser({}, { lifetime: 86_400 }))).toBeNull();
        expect(await verify(await signUser({ sub: "machine:key_1", token_use: "machine" }))).toBeNull();
    });

    it("con introspección, un token revocado deja de valer al momento", async () => {
        let active = true;
        const introspected: string[] = [];
        const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            introspected.push(String(input));
            const { token } = JSON.parse(String(init?.body)) as { token: string };
            expect(token.split(".")).toHaveLength(3);
            return new Response(JSON.stringify({ active, sub: "user_1", org_id: "org_fixture", environment_id: "env_fixture", exp: nowSeconds + 3600 }), { status: 200 });
        }) as typeof globalThis.fetch;
        const verify = createAccessTokenVerifier({ ...options, jwks: { fetch: jwksServer([k1.jwk]).fetch }, introspection: { fetch } });
        const token = await sign(k1, userClaims, { audience: "client_app", lifetime: 3600 });
        expect(await verify(token)).not.toBeNull();
        active = false;
        expect(await verify(token)).toBeNull();
        expect(introspected).toEqual([`${issuer}/oauth/introspect`, `${issuer}/oauth/introspect`]);
        expect(() => createAccessTokenVerifier({ ...options, introspection: { endpoint: "https://evil.fixture.invalid/introspect" } })).toThrow(/introspection/);
    });
});

describe("assertion del BFF", () => {
    const secret = "s".repeat(32);
    const actor = { issuer, subject: "user_1", organizationId: "org_fixture", environmentId: "env_fixture" };
    const base = { secret, audience: "acme-api", method: "post", path: "/api/items", now: () => NOW };

    it("se verifica para el mismo método, ruta y audiencia, dentro de su vida", async () => {
        const assertion = await signActorAssertion(actor, base);
        expect(await verifyActorAssertion(assertion, { ...base, method: "POST" })).toEqual(actor);
        expect(await verifyActorAssertion(assertion, { ...base, method: "DELETE" })).toBeNull();
        expect(await verifyActorAssertion(assertion, { ...base, path: "/api/other" })).toBeNull();
        expect(await verifyActorAssertion(assertion, { ...base, audience: "other-api" })).toBeNull();
        expect(await verifyActorAssertion(assertion, { ...base, secret: "t".repeat(32) })).toBeNull();
        expect(await verifyActorAssertion(assertion, { ...base, now: () => NOW + 31_000 })).toBeNull();
        expect(await verifyActorAssertion(assertion, { ...base, now: () => NOW - 60_000 })).toBeNull();
    });

    it("rechaza una assertion manipulada y secretos cortos", async () => {
        const assertion = await signActorAssertion(actor, base);
        const [payload, mac] = assertion.split(".");
        const forged = btoa(JSON.stringify({ ...JSON.parse(atob(payload!.replace(/-/g, "+").replace(/_/g, "/"))), sub: "admin" })).replace(/=+$/, "");
        expect(await verifyActorAssertion(`${forged}.${mac}`, base)).toBeNull();
        expect(await verifyActorAssertion(`${payload}.`, base)).toBeNull();
        await expect(signActorAssertion(actor, { ...base, secret: "short" })).rejects.toMatchObject({ code: "SDK_ASSERTION_SECRET_INVALID" });
        await expect(signActorAssertion(actor, { ...base, ttlSeconds: 3600 })).rejects.toMatchObject({ code: "SDK_ASSERTION_INVALID" });
    });
});

describe("verifyRequest", () => {
    const secret = "s".repeat(32);
    const actor = { issuer, subject: "user_1", environmentId: "env_fixture" };

    it("acepta exactamente una credencial: Bearer o assertion", async () => {
        const bearer = createMachineTokenVerifier({ issuer, audience: "customy-data", jwks: { fetch: jwksServer([k1.jwk]).fetch }, now: () => NOW });
        const options = { bearer, requiredScopes: ["data:read"], assertion: { secret, audience: "acme-api", now: () => NOW } };
        const token = await sign(k1, machineClaims);
        const assertion = await signActorAssertion(actor, { secret, audience: "acme-api", method: "GET", path: "/api/items", now: () => NOW });
        const url = "https://api.fixture.invalid/api/items?page=2";

        expect(await verifyRequest(new Request(url, { headers: { authorization: `Bearer ${token}` } }), options)).toMatchObject({ kind: "bearer", principal: { clientId: "key_1" } });
        expect(await verifyRequest(new Request(url, { headers: { "x-customy-actor": assertion } }), options)).toEqual({ kind: "assertion", actor });
        expect(await verifyRequest(new Request(url, { headers: { authorization: `Bearer ${token}`, "x-customy-actor": assertion } }), options)).toBeNull();
        expect(await verifyRequest(new Request(url, { method: "DELETE", headers: { "x-customy-actor": assertion } }), options)).toBeNull();
        expect(await verifyRequest(new Request(url, { headers: { authorization: "Bearer nope" } }), options)).toBeNull();
        expect(await verifyRequest(new Request(url), options)).toBeNull();
        expect(await verifyRequest(new Request(url, { headers: { authorization: `Bearer ${token}` } }), { ...options, requiredScopes: ["data:admin"] })).toBeNull();
        expect(await verifyRequest(new Request(url, { headers: { "x-customy-actor": assertion } }), { bearer })).toBeNull();
    });

    it("adaptador IncomingMessage: método, ruta y cabeceras (múltiples incluidas)", async () => {
        const assertion = await signActorAssertion(actor, { secret, audience: "acme-api", method: "PUT", path: "/api/items/1", now: () => NOW });
        const message = { method: "put", url: "/api/items/1?x=1", headers: { "x-customy-actor": assertion, "x-list": ["a", "b"], host: "api.fixture.invalid" } };
        const request = requestFromIncomingMessage(message);
        expect(request.method).toBe("PUT");
        expect(new URL(request.url).pathname).toBe("/api/items/1");
        expect(request.headers.get("x-list")).toBe("a, b");
        expect(await verifyIncomingMessage(message, { assertion: { secret, audience: "acme-api", now: () => NOW } })).toEqual({ kind: "assertion", actor });
        expect(await verifyIncomingMessage({ ...message, url: "/api/items/2" }, { assertion: { secret, audience: "acme-api", now: () => NOW } })).toBeNull();
    });
});
