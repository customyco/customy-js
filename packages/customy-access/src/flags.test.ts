import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CustomyFlagsClient, type CustomyFlagsSnapshot, type CustomyWebSocketLike } from "./flags";

const snapshot = (version: number, defaultTreatment = "off"): CustomyFlagsSnapshot => ({
    schemaVersion: "2026-06-fme", organizationId: "org_1", projectId: "proj_1", environmentId: "env_1", version, etag: `"v${version}"`,
    generatedAt: "2026-09-25T00:00:00.000Z", segments: [],
    flags: [{ key: "checkout", type: "boolean", defaultTreatment, treatments: [{ key: "on", value: true }, { key: "off", value: false }] } as CustomyFlagsSnapshot["flags"][number]],
});

describe("CustomyFlagsClient", () => {
    it("modo optimizado: una impresión por flag, clave y tratamiento; en debug, todas", async () => {
        const bodies: Array<{ impressions: unknown[] }> = [];
        const fetch = vi.fn(async (_url: string, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response("{}", { status: 202 }); }) as unknown as typeof globalThis.fetch;
        const client = new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, snapshot: snapshot(1) });
        for (let i = 0; i < 5; i += 1) client.getTreatment("checkout", { key: "u1" });
        client.getTreatment("checkout", { key: "u2" });
        client.getTreatment("missing", { key: "u1" });
        expect(await client.flush()).toBe(2);
        const debug = new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, snapshot: snapshot(1), impressionsMode: "debug" });
        for (let i = 0; i < 3; i += 1) debug.getTreatment("checkout", { key: "u1" });
        expect(await debug.flush()).toBe(3);
    });

    it("trackConversion: atribuye al tratamiento servido, reintenta lo fallido con el mismo id y no inventa flags", async () => {
        const posts: Array<{ url: string; body: { conversions?: Array<Record<string, unknown>> } }> = [];
        let status = 503;
        const fetch = vi.fn(async (url: string, init?: RequestInit) => {
            posts.push({ url, body: JSON.parse(String(init?.body)) });
            return new Response("{}", { status });
        }) as unknown as typeof globalThis.fetch;
        const client = new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, snapshot: snapshot(1, "on") });
        expect(client.trackConversion("checkout", { key: "u1" }, { value: 20, metric: "purchase" })).toBe(true);
        expect(client.trackConversion("missing", { key: "u1" })).toBe(false);
        await expect(client.flush()).rejects.toThrow("conversions flush failed: 503");
        status = 202;
        expect(await client.flush()).toBe(1);
        const sent = posts.filter((post) => post.url.endsWith("/api/v1/flags/conversions"));
        expect(sent).toHaveLength(2);
        expect(sent[1]!.body.conversions![0]).toMatchObject({ flagKey: "checkout", contextKey: "u1", treatment: "on", metric: "purchase", value: 20 });
        expect(sent[1]!.body.conversions![0]!.id).toBe(sent[0]!.body.conversions![0]!.id);
        expect(posts.some((post) => post.url.endsWith("/impressions"))).toBe(false);
        expect(() => client.trackConversion("checkout", { key: "u1" }, { value: -1 })).toThrow();
    });

    it("verifySignature: acepta la instantánea firmada por el emisor y rechaza la alterada, conservando la anterior", async () => {
        const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
        const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
            : value && typeof value === "object" ? `{${Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined)
                .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(value);
        const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
        const sign = (served: CustomyFlagsSnapshot, kid = "k1") => {
            const head = b64({ alg: "RS256", typ: "JWT", kid });
            const body = b64({ typ: "flags_snapshot", environment_id: served.environmentId, version: served.version, view: "full",
                content_sha256: createHash("sha256").update(canonical({ flags: served.flags, segments: served.segments ?? [] })).digest("base64url") });
            return `${head}.${body}.${createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url")}`;
        };
        let served: CustomyFlagsSnapshot = { ...snapshot(1), signature: "" };
        served.signature = sign(served);
        const fetch = vi.fn(async (url: string) => url.endsWith("/oauth/jwks.json")
            ? Response.json({ keys: [jwk] })
            : new Response(JSON.stringify(served), { status: 200, headers: { etag: served.etag! } })) as unknown as typeof globalThis.fetch;
        const client = new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, verifySignature: true });
        expect((await client.refresh()).version).toBe(1);

        const signedV2 = snapshot(2, "on");
        served = { ...signedV2, signature: sign(signedV2), flags: [{ ...signedV2.flags[0]!, defaultTreatment: "off" }] };
        expect((await client.refresh()).version).toBe(1);
        served = { ...signedV2, signature: sign(signedV2, "otra") };
        expect((await client.refresh()).version).toBe(1);
        served = { ...signedV2, signature: sign(signedV2) };
        expect((await client.refresh()).version).toBe(2);

        const strict = new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, verifySignature: true });
        served = { ...signedV2, signature: undefined };
        await expect(strict.refresh()).rejects.toThrow("signature invalid");
    });

    it("cdn: latest para sondear, la versión anunciada por su URL inmutable, sin cabeceras propias y sin retroceder", async () => {
        const urls: string[] = [];
        const inits: Array<RequestInit | undefined> = [];
        const served: Record<string, CustomyFlagsSnapshot> = { latest: snapshot(4), "5": snapshot(5, "on"), "3": snapshot(3) };
        const fetch = vi.fn(async (url: string, init?: RequestInit) => {
            urls.push(url);
            inits.push(init);
            const file = /\/([^/]+)\.json$/.exec(url)?.[1] ?? "";
            return served[file] ? Response.json(served[file]) : new Response("{}", { status: 404 });
        }) as unknown as typeof globalThis.fetch;
        expect(() => new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, cdn: true })).toThrow("publishableKey");
        const client = new CustomyFlagsClient({ baseUrl: "https://access.invalid/", publishableKey: "pk live/1", fetch, cdn: { baseUrl: "https://flags-cdn.invalid" } });
        expect((await client.refresh()).version).toBe(4);
        expect(urls[0]).toBe("https://flags-cdn.invalid/api/v1/flags/cdn/pk%20live%2F1/latest.json");
        expect(inits[0]?.headers).toBeUndefined();
        expect((await client.refresh(5)).version).toBe(5);
        expect(urls[1]).toBe("https://flags-cdn.invalid/api/v1/flags/cdn/pk%20live%2F1/5.json");
        served.latest = snapshot(3);
        expect((await client.refresh()).version).toBe(5);
    });

    it("subscribe: canjea el ticket, refresca al abrir y con cada versión nueva, y reconecta con otro ticket", async () => {
        vi.useFakeTimers();
        let served = snapshot(1);
        const tickets: string[] = [];
        const fetch = vi.fn(async (url: string) => {
            if (url.endsWith("/realtime-ticket")) { tickets.push(url); return Response.json({ ticket: `t${tickets.length}`, channel: "flags:org_1:env_1" }); }
            return new Response(JSON.stringify(served), { status: 200, headers: { etag: served.etag! } });
        }) as unknown as typeof globalThis.fetch;
        const sockets: Array<CustomyWebSocketLike & { url: string; closed: boolean }> = [];
        class FakeSocket implements CustomyWebSocketLike {
            onopen: CustomyWebSocketLike["onopen"] = null; onmessage: CustomyWebSocketLike["onmessage"] = null;
            onclose: CustomyWebSocketLike["onclose"] = null; onerror: CustomyWebSocketLike["onerror"] = null;
            closed = false;
            constructor(public url: string) { sockets.push(this); }
            close() { this.closed = true; }
        }
        const client = new CustomyFlagsClient({ baseUrl: "https://access.invalid", fetch, publishableKey: "pk" });
        const updates: number[] = [];
        const stop = client.subscribe({ realtimeUrl: "https://realtime.invalid", WebSocket: FakeSocket, onUpdate: (s) => updates.push(s.version) });
        await vi.waitFor(() => expect(sockets).toHaveLength(1));
        expect(sockets[0]!.url).toBe("wss://realtime.invalid/ws?channels=flags%3Aorg_1%3Aenv_1&ticket=t1");
        sockets[0]!.onopen?.({});
        await vi.waitFor(() => expect(updates).toEqual([1]));
        served = snapshot(2, "on");
        sockets[0]!.onmessage?.({ data: JSON.stringify({ type: "flags.snapshot.published", version: 1 }) });
        sockets[0]!.onmessage?.({ data: JSON.stringify({ type: "flags.snapshot.published", version: 2 }) });
        await vi.waitFor(() => expect(updates).toEqual([1, 2]));
        expect(client.getTreatment("checkout", { key: "u1" }, { track: false }).treatment).toBe("on");
        sockets[0]!.onclose?.({});
        await vi.advanceTimersByTimeAsync(2_000);
        await vi.waitFor(() => expect(sockets).toHaveLength(2));
        expect(sockets[1]!.url).toContain("ticket=t2");
        stop();
        expect(sockets[1]!.closed).toBe(true);
        vi.useRealTimers();
    });
});
