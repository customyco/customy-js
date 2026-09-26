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
