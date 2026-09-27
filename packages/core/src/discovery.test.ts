import { describe, expect, it } from "vitest";
import { discoverPlatform, parsePlatformConfiguration } from "./discovery";
import { collect, paginate, paginatePages } from "./pagination";

const issuer = "https://access.fixture.invalid";
const document = {
    issuer,
    environment: "staging",
    jwks_uri: `${issuer}/oauth/jwks.json`,
    token_endpoint: `${issuer}/oauth/token`,
    grant_types_supported: ["client_credentials", "urn:ietf:params:oauth:grant-type:token-exchange"],
    products: {
        send: { base_url: "https://send.fixture.invalid/", audience: "customy-send" },
        broken: { base_url: "http://plain.fixture.invalid", audience: "customy-broken" },
        nameless: { base_url: "https://x.fixture.invalid" },
    },
};

describe("discoverPlatform", () => {
    it("lee el discovery y normaliza productos, descartando los que no son https o no tienen audiencia", async () => {
        const urls: string[] = [];
        const fetch = (async (input: RequestInfo | URL) => { urls.push(String(input)); return new Response(JSON.stringify(document), { status: 200 }); }) as typeof globalThis.fetch;
        const platform = await discoverPlatform(`${issuer}/`, { fetch });
        expect(urls).toEqual([`${issuer}/.well-known/customy-configuration`]);
        expect(platform).toEqual({
            issuer,
            environment: "staging",
            jwksUri: `${issuer}/oauth/jwks.json`,
            tokenEndpoint: `${issuer}/oauth/token`,
            grantTypesSupported: ["client_credentials", "urn:ietf:params:oauth:grant-type:token-exchange"],
            products: { send: { baseUrl: "https://send.fixture.invalid", audience: "customy-send" } },
        });
        // Firma anterior (`customy-access/server`): fetch como segundo argumento.
        await expect(discoverPlatform(issuer, fetch)).resolves.toMatchObject({ issuer });
    });

    it("rechaza un issuer distinto y endpoints fuera del origen del issuer", () => {
        expect(() => parsePlatformConfiguration(issuer, { ...document, issuer: "https://other.fixture.invalid" })).toThrow(/issuer/);
        expect(() => parsePlatformConfiguration(issuer, { ...document, token_endpoint: "https://evil.fixture.invalid/oauth/token" })).toThrow(/token_endpoint/);
        expect(() => parsePlatformConfiguration(issuer, { ...document, jwks_uri: "https://evil.fixture.invalid/jwks" })).toThrow(/jwks_uri/);
        expect(() => parsePlatformConfiguration(issuer, [])).toThrow(/object/);
    });

    it("un fallo HTTP o de red sale como SDK_DISCOVERY_FAILED", async () => {
        const notFound = (async () => new Response("", { status: 404 })) as typeof globalThis.fetch;
        await expect(discoverPlatform(issuer, { fetch: notFound })).rejects.toMatchObject({ code: "SDK_DISCOVERY_FAILED", status: 404 });
        const down = (async () => { throw new TypeError("fetch failed"); }) as typeof globalThis.fetch;
        await expect(discoverPlatform(issuer, { fetch: down })).rejects.toMatchObject({ code: "SDK_DISCOVERY_FAILED" });
    });
});

describe("paginate", () => {
    const pages: Record<string, { items: number[]; nextCursor?: string | null }> = {
        start: { items: [1, 2], nextCursor: "b" },
        b: { items: [3], nextCursor: "c" },
        c: { items: [4, 5], nextCursor: null },
    };

    it("recorre por cursor hasta el final", async () => {
        const cursors: Array<string | undefined> = [];
        const items = await collect(paginate(async (cursor) => { cursors.push(cursor); return pages[cursor ?? "start"]!; }));
        expect(items).toEqual([1, 2, 3, 4, 5]);
        expect(cursors).toEqual([undefined, "b", "c"]);
    });

    it("collect con límite deja de pedir páginas", async () => {
        let calls = 0;
        const items = await collect(paginate(async (cursor) => { calls += 1; return pages[cursor ?? "start"]!; }), 2);
        expect(items).toEqual([1, 2]);
        expect(calls).toBe(1);
    });

    it("falla si el servidor repite un cursor y respeta maxPages", async () => {
        await expect(collect(paginatePages(async () => ({ items: [1], nextCursor: "same" })))).rejects.toThrow("SDK_PAGINATION_CURSOR_REPEATED");
        let n = 0;
        const all = await collect(paginatePages(async () => ({ items: [n], nextCursor: `c${n++}` }), { maxPages: 3 }));
        expect(all).toHaveLength(3);
    });
});
