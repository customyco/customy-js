import { describe, expect, it, vi } from "vitest";
import { createFlagsClient } from "./flags";
import { EDGE_BOOTSTRAP_HEADER, EDGE_UNIT_COOKIE, createEdgeFlags, decodeBootstrap, encodeBootstrap, type EdgeSnapshot } from "./flags-edge";

const flags: EdgeSnapshot["flags"] = [
    { key: "hero", type: "multivariate", status: "active", defaultTreatment: "control", treatments: [{ key: "control", value: "A" }, { key: "wide", value: "B", config: { cols: 3 } }],
        targetingRules: [{ id: "split", rollout: { variants: [{ treatment: "control", weight: 50 }, { treatment: "wide", weight: 50 }] } }] },
    { key: "pro-only", type: "boolean", status: "active", defaultTreatment: "off", treatments: [{ key: "on", value: true }, { key: "off", value: false }],
        targetingRules: [{ id: "pro", condition: { attribute: "plan", op: "equals", value: "pro" }, serveTreatment: "on" }] },
];
const snap = (version: number, etag = `"v${version}"`): EdgeSnapshot => ({ version, etag, flags });

function fetchOf(responses: Array<EdgeSnapshot | number | Error>) {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    let index = 0;
    const fn = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ url, headers: init.headers });
        const next = responses[Math.min(index++, responses.length - 1)]!;
        if (next instanceof Error) throw next;
        if (typeof next === "number") return new Response(null, { status: next });
        return Response.json(next, { headers: { etag: next.etag! } });
    });
    return { fn: fn as unknown as typeof fetch, calls };
}
const req = (headers: Record<string, string> = {}) => new Request("https://app.test/", { headers });

describe("createEdgeFlags", () => {
    it("asigna, crea la cookie de unidad y manda las asignaciones en la cabecera de la petición", async () => {
        const { fn, calls } = fetchOf([snap(3)]);
        const edge = createEdgeFlags({ publishableKey: "pk_1", baseUrl: "https://access.test", fetch: fn });
        const result = await edge.resolve(req());
        expect(calls[0]).toMatchObject({ url: "https://access.test/api/v1/flags/snapshot", headers: { "x-publishable-key": "pk_1" } });
        expect(result.setCookie).toMatch(new RegExp(`^${EDGE_UNIT_COOKIE}=[^;]+; Path=/; Max-Age=31536000; SameSite=Lax; Secure$`));
        const header = result.requestHeaders.get(EDGE_BOOTSTRAP_HEADER)!;
        const decoded = decodeBootstrap(header)!;
        expect(decoded).toMatchObject({ version: 3, unitKey: result.unitKey });
        expect(Object.keys(decoded.flags).sort()).toEqual(["hero", "pro-only"]);
        expect(decoded.flags.hero).toMatchObject({ reasonCode: "rollout", reason: "rollout", ruleId: "split" });
        expect(result.applyTo(new Response("x")).headers.get("set-cookie")).toBe(result.setCookie);
    });

    it("misma unidad ⇒ misma asignación que el SDK local (paridad con getTreatment) y sin cookie nueva", async () => {
        const { fn } = fetchOf([snap(1)]);
        const edge = createEdgeFlags({ publishableKey: "pk", fetch: fn, attributes: () => ({ plan: "pro" }) });
        const local = createFlagsClient({ publishableKey: "pk", snapshot: { schemaVersion: "2026-06-fme", organizationId: "o", projectId: "p", environmentId: "e", version: 1, generatedAt: "", flags } });
        for (const unit of ["u1", "u2", "u3", "visitor-xyz", "42"]) {
            const result = await edge.resolve(req({ cookie: `a=b; ${EDGE_UNIT_COOKIE}=${unit}` }));
            expect(result.setCookie).toBeUndefined();
            for (const key of ["hero", "pro-only"]) {
                const expected = local.getTreatment(key, { key: unit, attributes: { plan: "pro" } }, { track: false });
                expect(result.bootstrap!.flags[key]).toMatchObject({ treatment: expected.treatment, reasonCode: expected.reasonCode });
            }
        }
    });

    it("unitKey propio (usuario autenticado) manda sobre la cookie y no fija ninguna; `flags` acota", async () => {
        const edge = createEdgeFlags({ publishableKey: "pk", fetch: fetchOf([snap(1)]).fn, unitKey: () => "user-7" });
        const result = await edge.resolve(req({ cookie: `${EDGE_UNIT_COOKIE}=old` }), { flags: ["hero"] });
        expect(result.unitKey).toBe("user-7");
        expect(result.setCookie).toBeUndefined();
        expect(Object.keys(result.bootstrap!.flags)).toEqual(["hero"]);
    });

    it("jamás confía en una cabecera de asignaciones que traiga el cliente", async () => {
        const forged = encodeBootstrap({ version: 99, unitKey: "x", flags: { hero: { treatment: "wide", reasonCode: "rollout", reason: "rollout" } } });
        const edge = createEdgeFlags({ publishableKey: "pk", fetch: fetchOf([new Error("down")]).fn });
        const result = await edge.resolve(req({ [EDGE_BOOTSTRAP_HEADER]: forged }));
        expect(result.requestHeaders.has(EDGE_BOOTSTRAP_HEADER)).toBe(false);
    });

    it("fail-static: sin red y sin snapshot no asigna (la app pinta su valor por defecto); con snapshot sigue con la última", async () => {
        const cold = createEdgeFlags({ publishableKey: "pk", fetch: fetchOf([new Error("down")]).fn });
        const none = await cold.resolve(req());
        expect(none.bootstrap).toBeUndefined();
        expect(none.requestHeaders.has(EDGE_BOOTSTRAP_HEADER)).toBe(false);
        expect(none.setCookie).toBeDefined();
        let clock = 0;
        const { fn } = fetchOf([snap(2), new Error("down")]);
        const warm = createEdgeFlags({ publishableKey: "pk", fetch: fn, ttlMs: 1_000, now: () => clock });
        expect((await warm.resolve(req())).bootstrap!.version).toBe(2);
        clock = 5_000;
        await warm.resolve(req()); // dispara la revalidación fallida
        await new Promise((r) => setTimeout(r, 0));
        expect((await warm.resolve(req())).bootstrap!.version).toBe(2);
    });

    it("revalida con If-None-Match pasado el TTL (304 conserva) y nunca retrocede de versión", async () => {
        let clock = 0;
        const { fn, calls } = fetchOf([snap(5), 304, snap(4), snap(6)]);
        const edge = createEdgeFlags({ publishableKey: "pk", fetch: fn, ttlMs: 1_000, now: () => clock });
        await edge.snapshot();
        await edge.snapshot();
        expect(calls).toHaveLength(1); // dentro del TTL no hay petición
        clock = 2_000;
        await edge.snapshot(); await new Promise((r) => setTimeout(r, 0));
        expect(calls[1]!.headers["if-none-match"]).toBe('"v5"');
        clock = 4_000;
        await edge.snapshot(); await new Promise((r) => setTimeout(r, 0));
        expect((await edge.snapshot())!.version).toBe(5); // la v4 llegó tarde y se ignora
        clock = 6_000;
        await edge.snapshot(); await new Promise((r) => setTimeout(r, 0));
        expect((await edge.snapshot())!.version).toBe(6);
    });

    it("con cdn lee latest.json con petición simple (sin cabeceras propias)", async () => {
        const { fn, calls } = fetchOf([snap(1)]);
        await createEdgeFlags({ publishableKey: "pk/1", baseUrl: "https://access.test", cdn: true, fetch: fn }).snapshot();
        expect(calls[0]).toEqual({ url: "https://access.test/api/v1/flags/cdn/pk%2F1/latest.json", headers: {} });
    });

    it("una instantánea inicial sirve al primer visitante sin esperar a la red", async () => {
        const { fn, calls } = fetchOf([snap(9)]);
        const edge = createEdgeFlags({ publishableKey: "pk", fetch: fn, snapshot: snap(1) });
        expect((await edge.resolve(req())).bootstrap!.version).toBe(1);
        expect(calls).toHaveLength(0);
    });

    it("si las asignaciones no caben en una cabecera, no se envía (y bootstrap queda vacío)", async () => {
        const many: EdgeSnapshot = { version: 1, flags: Array.from({ length: 400 }, (_, i) => ({ key: `flag.number.${i}`, type: "boolean" as const, status: "active" as const, defaultTreatment: "off", treatments: [{ key: "on", value: true }, { key: "off", value: false }] })) };
        const result = await createEdgeFlags({ publishableKey: "pk", fetch: fetchOf([many]).fn }).resolve(req());
        expect(result.requestHeaders.has(EDGE_BOOTSTRAP_HEADER)).toBe(false);
        expect(result.bootstrap).toBeUndefined();
    });
});

describe("codificación de asignaciones", () => {
    it("ida y vuelta con Unicode; valores inválidos devuelven undefined sin lanzar", () => {
        const bootstrap = { version: 2, unitKey: "ü-ñ-日本", flags: { a: { treatment: "t", value: "é🙂", reasonCode: "default", reason: "default" } } };
        expect(decodeBootstrap(encodeBootstrap(bootstrap))).toEqual(bootstrap);
        expect(encodeBootstrap(bootstrap)).toMatch(/^[A-Za-z0-9_-]+$/);
        for (const bad of [undefined, null, "", "###", "e30", encodeBootstrap({ version: "x" } as never)]) expect(decodeBootstrap(bad as never)).toBeUndefined();
    });
});
