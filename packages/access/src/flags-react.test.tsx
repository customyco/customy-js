// @vitest-environment happy-dom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlagsClient, type CustomyFlagsSnapshot } from "./flags";
import { createBootstrap } from "./flags-bootstrap";
import { Experience, FlagsProvider, useExperiment, useFlag, useFlagDetail, type FlagsClientLike } from "./flags-react";
import type { ReactNode } from "react";

const flags: CustomyFlagsSnapshot["flags"] = [
    { key: "new.checkout", type: "boolean", status: "active", defaultTreatment: "off", treatments: [{ key: "on", value: true }, { key: "off", value: false }],
        targetingRules: [{ id: "all", rollout: { variants: [{ treatment: "on", weight: 100 }] } }] },
    { key: "hero.layout", type: "multivariate", status: "active", defaultTreatment: "control", treatments: [{ key: "control", value: "A", config: { cols: 1 } }, { key: "wide", value: "B", config: { cols: 3 } }],
        targetingRules: [{ id: "split", rollout: { variants: [{ treatment: "control", weight: 50 }, { treatment: "wide", weight: 50 }] } }] },
    { key: "limit", type: "number", status: "active", defaultTreatment: "low", treatments: [{ key: "low", value: 10 }] },
    { key: "theme", type: "json", status: "active", defaultTreatment: "d", treatments: [{ key: "d", value: { mode: "dark" } }] },
];
const snapshot = (version: number, patch: Partial<CustomyFlagsSnapshot["flags"][number]>[] = []): CustomyFlagsSnapshot => ({
    schemaVersion: "2026-06-fme", organizationId: "o", projectId: "p", environmentId: "e", version, generatedAt: "2026-10-02T00:00:00.000Z",
    flags: flags.map((flag) => ({ ...flag, ...(patch.find((p) => p.key === flag.key) ?? {}) })),
});

function makeClient(initial?: CustomyFlagsSnapshot) {
    const real = createFlagsClient({ publishableKey: "pk", fetch: (async () => { throw new Error("offline"); }) as never });
    let published = initial ?? snapshot(1);
    let current = initial;
    const tracked: string[] = [];
    const conversions: unknown[] = [];
    const client: FlagsClientLike = {
        ready: async () => (current ??= published),
        refresh: async () => (current = published),
        getTreatment: (key, context, options) => {
            if (!current) return { flagKey: key, treatment: "control", value: undefined, reason: "error", reasonCode: "error", error: "snapshot_not_loaded" };
            (real as unknown as { snapshot?: CustomyFlagsSnapshot }).snapshot = current;
            return real.getTreatment(key, context, options);
        },
        track: (detail) => { tracked.push(`${detail.flagKey}:${detail.treatment}`); },
        trackConversion: (key, _ctx, options) => { conversions.push([key, options]); return true; },
    };
    return { client, tracked, conversions, publish(version: number, patch: Partial<CustomyFlagsSnapshot["flags"][number]>[] = []) { published = snapshot(version, patch); } };
}

const ctxOf = (key = "visitor-1") => ({ key, attributes: {} });
afterEach(() => cleanup());

const wrapper = (client: FlagsClientLike, context = ctxOf(), extra: Record<string, unknown> = {}) =>
    ({ children }: { children?: ReactNode }) => <FlagsProvider client={client} context={context} {...extra}>{children}</FlagsProvider>;

describe("hooks", () => {
    it("useFlag: valor por defecto hasta que carga la instantánea y luego el servido (CSR)", async () => {
        const { client } = makeClient();
        const { result } = renderHook(() => ({ flag: useFlag("new.checkout", false), detail: useFlagDetail("new.checkout") }), { wrapper: wrapper(client) });
        expect(result.current.flag).toBe(false);
        expect(result.current.detail).toMatchObject({ ready: false, source: "fallback", reasonCode: "error" });
        await waitFor(() => expect(result.current.flag).toBe(true));
        expect(result.current.detail).toMatchObject({ ready: true, source: "live", treatment: "on", reasonCode: "rollout" });
    });

    it("useFlag por tipo: number, string (sin valor ⇒ tratamiento) y object; tipo equivocado ⇒ defecto", async () => {
        const { client } = makeClient(snapshot(1));
        const { result } = renderHook(() => ({ n: useFlag("limit", 0), o: useFlag("theme", {}), s: useFlag("hero.layout", "z"), wrong: useFlag("limit", "str") }), { wrapper: wrapper(client) });
        await waitFor(() => expect(result.current.n).toBe(10));
        expect(result.current.o).toEqual({ mode: "dark" });
        expect(["A", "B"]).toContain(result.current.s);
        expect(result.current.wrong).toBe("str");
    });

    it("useExperiment: variante, isControl, config y track() atribuido; sin asignación no registra", async () => {
        const { client, conversions } = makeClient(snapshot(1));
        const { result } = renderHook(() => useExperiment("hero.layout"), { wrapper: wrapper(client, ctxOf("u-wide")) });
        await waitFor(() => expect(result.current.ready).toBe(true));
        expect(result.current.variant).toBe(result.current.treatment);
        expect(result.current.isControl).toBe(result.current.treatment === "control");
        expect(result.current.config).toMatchObject({ cols: expect.any(Number) });
        expect(result.current.track("click", { value: 2, id: "c1" })).toBe(true);
        expect(conversions).toEqual([["hero.layout", { value: 2, id: "c1", metric: "click" }]]);
        const cold = renderHook(() => useExperiment("hero.layout"), { wrapper: wrapper(makeClient().client) });
        expect(cold.result.current.track("click")).toBe(false);
    });

    it("la exposición se registra una vez montado, con el detalle mostrado", async () => {
        const { client, tracked } = makeClient(snapshot(1));
        renderHook(() => useFlag("new.checkout", false), { wrapper: wrapper(client) });
        await waitFor(() => expect(tracked).toContain("new.checkout:on"));
    });

    it("fuera de FlagsProvider lanza un error claro", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(() => renderHook(() => useFlag("x", false))).toThrow(/FlagsProvider/);
        spy.mockRestore();
    });
});

describe("<Experience>", () => {
    it("pinta la variante asignada, cae a control y luego a fallback", async () => {
        const { client } = makeClient(snapshot(1));
        const { container } = render(
            <FlagsProvider client={client} context={ctxOf("u1")}>
                <Experience point="hero.layout" variants={{ control: <i>control</i>, wide: <b>wide</b> }} fallback={<u>fb</u>} />
                <Experience point="missing.point" variants={{ control: <i>c2</i> }} fallback={<u>fb2</u>} />
            </FlagsProvider>,
        );
        await waitFor(() => expect(container.querySelector("i,b")).toBeTruthy());
        expect(container.textContent).toMatch(/^(control|wide)fb2$/);
    });

    it("render-prop con el estado (config) y sin datos pinta el fallback", async () => {
        const { client } = makeClient();
        render(
            <FlagsProvider client={client} context={ctxOf("u1")}>
                <Experience point="hero.layout" fallback={<u>espera</u>}>{(state) => <span data-testid="x">{state.ready ? `cols=${String(state.config?.cols)}` : "cargando"}</span>}</Experience>
            </FlagsProvider>,
        );
        expect(screen.getByTestId("x").textContent).toBe("cargando");
        await waitFor(() => expect(screen.getByTestId("x").textContent).toMatch(/cols=[13]/));
    });
});

describe("SSR sin parpadeo", () => {
    const tree = (client: FlagsClientLike, bootstrap: ReturnType<typeof createBootstrap> | undefined, key = "visitor-9") => (
        <FlagsProvider client={client} context={ctxOf(key)} bootstrap={bootstrap}>
            <Experience point="hero.layout" variants={{ control: <p id="v">control</p>, wide: <p id="v">wide</p> }} fallback={<p id="v">fallback</p>} />
        </FlagsProvider>
    );

    it("el servidor pinta la variante asignada con bootstrap, y sin él, el fallback", () => {
        const bootstrap = createBootstrap(snapshot(1), ctxOf("visitor-9"));
        const html = renderToString(tree(makeClient().client, bootstrap));
        expect(html).toMatch(/<p id="v">(control|wide)<\/p>/);
        expect(html).toBe(renderToString(tree(makeClient().client, bootstrap)));
        expect(renderToString(tree(makeClient().client, undefined))).toContain("fallback");
    });

    it("la hidratación coincide con el HTML del servidor aunque el cliente aún no tenga instantánea, y no hay mismatch", async () => {
        const bootstrap = createBootstrap(snapshot(1), ctxOf("visitor-9"));
        const html = renderToString(tree(makeClient().client, bootstrap));
        const container = document.createElement("div");
        container.innerHTML = html;
        document.body.appendChild(container);
        const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { client } = makeClient();
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => { root = hydrateRoot(container, tree(client, bootstrap)); });
        expect(container.innerHTML).toBe(html);
        await act(async () => { await client.ready(); });
        expect(container.innerHTML).toBe(html);
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
        root.unmount();
    });

    it("tras hidratar, una versión más nueva con la variante cambiada sí actualiza; la misma versión no mueve nada", async () => {
        vi.useFakeTimers();
        try {
            const bootstrap = createBootstrap(snapshot(1), ctxOf("visitor-9"));
            const served = bootstrap.flags["hero.layout"]!.treatment;
            const other = served === "control" ? "wide" : "control";
            const container = document.createElement("div");
            container.innerHTML = renderToString(tree(makeClient().client, bootstrap));
            document.body.appendChild(container);
            const harness = makeClient(snapshot(1));
            const polling = (
                <FlagsProvider client={harness.client} context={ctxOf("visitor-9")} bootstrap={bootstrap} pollIntervalMs={5_000}>
                    <Experience point="hero.layout" variants={{ control: <p id="v">control</p>, wide: <p id="v">wide</p> }} />
                </FlagsProvider>
            );
            await act(async () => { hydrateRoot(container, polling); });
            await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
            expect(container.textContent).toBe(served); // misma versión: la asignación del servidor se mantiene
            harness.publish(2, [{ key: "hero.layout", targetingRules: [{ id: "force", serveTreatment: other }] }]);
            await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
            expect(container.textContent).toBe(other);
        } finally { vi.useRealTimers(); }
    });

    it("un bootstrap de otra unidad se ignora (no se sirve la asignación de otro visitante)", () => {
        const bootstrap = createBootstrap(snapshot(1), ctxOf("someone-else"));
        expect(renderToString(tree(makeClient().client, bootstrap, "visitor-9"))).toContain("fallback");
    });
});
