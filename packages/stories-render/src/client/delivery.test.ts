import { describe, expect, it } from "vitest";
import { banner, placementResponse } from "../test-fixtures";
import { createMemoryStore } from "../store";
import { compareBanners, createDismissStore, createFrequencyTracker, createOverlayGate, createSurfaceControl, DEFAULT_FREQUENCY, selectDelivery } from "./delivery";
import { processPlacement } from "./placements";
import type { DeliveredBanner, DeliveredWidget } from "../types";

const HOUR = 3_600_000;
let now = Date.parse("2026-10-02T12:00:00Z");
const clock = { now: () => now };
const fresh = () => ({ frequency: createFrequencyTracker(undefined, { clock }), dismissed: createDismissStore(undefined, { clock }), surfaces: createSurfaceControl() });
const widgets = (over: Partial<Parameters<typeof placementResponse>[0]> = {}): DeliveredWidget[] => processPlacement(placementResponse(over), { sdkVersion: "0.1.0", now }).widgets;

describe("frecuencia por persona", () => {
  it("por defecto hay tope (5 por 7 días), no «cada vez»", () => {
    const f = createFrequencyTracker(undefined, { clock });
    for (let i = 0; i < DEFAULT_FREQUENCY.max_impressions; i++) {
      expect(f.canShow("k")).toBe(true);
      f.record("k");
    }
    expect(f.canShow("k")).toBe(false);
    now += 169 * HOUR;
    expect(f.canShow("k")).toBe(true);
  });
  it("tope y ventana propios, y separación mínima", () => {
    const f = createFrequencyTracker(undefined, { clock });
    const freq = { max_impressions: 2, window_hours: 24, min_gap_seconds: 600 };
    f.record("k");
    expect(f.canShow("k", freq)).toBe(false); // dentro del mínimo
    now += 601_000;
    expect(f.canShow("k", freq)).toBe(true);
    f.record("k");
    now += 601_000;
    expect(f.canShow("k", freq)).toBe(false); // 2 en 24 h
  });
  it("persiste y es por clave", async () => {
    const store = createMemoryStore();
    const a = createFrequencyTracker(store, { clock });
    a.record("x");
    await new Promise((r) => setTimeout(r, 5));
    const b = createFrequencyTracker(store, { clock });
    await b.ready;
    expect(b.count("x", 24)).toBe(1);
    expect(b.count("y", 24)).toBe(0);
  });
});

describe("selección de entrega", () => {
  it("separa el grupo de control, no pinta grupos sin páginas y aplica la frecuencia a las historias", () => {
    const ctx = fresh();
    const d = selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx);
    expect(d.control.stories.map((g) => g.id)).toEqual(["gc"]);
    expect(d.storyBars[0]!.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    for (let i = 0; i < 5; i++) ctx.frequency.record("story:home_top:g1");
    const d2 = selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx);
    expect(d2.storyBars[0]!.groups.map((g) => g.id)).toEqual(["g2"]);
    expect(d2.held.frequency).toContain("g1");
  });

  it("UN banner por placement: el de mayor prioridad; el de control no cuenta", () => {
    const d = selectDelivery({ placementId: "home_top", widgets: widgets() }, fresh());
    expect(d.banner?.id).toBe("b2");
    expect(d.control.banners.map((b) => b.id)).toEqual(["bc"]);
  });

  it("empate de prioridad: determinista por id", () => {
    const a = banner("zeta", ["s"], { priority: 50 });
    const b = banner("alfa", ["s"], { priority: 50 });
    expect([a, b].sort(compareBanners).map((x) => x.id)).toEqual(["alfa", "zeta"]);
    expect([b, a].sort(compareBanners).map((x) => x.id)).toEqual(["alfa", "zeta"]);
  });

  it("un banner descartado o sin frecuencia deja paso al siguiente; un no descartable no bloquea a los demás", () => {
    const ctx = fresh();
    ctx.dismissed.dismiss("b2");
    const d = selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx);
    expect(d.banner?.id).toBe("b1");
    expect(d.held.dismissed).toEqual(["b2"]);

    const noDismiss: DeliveredBanner = banner("sticky", ["s"], { priority: 99, style: { ...banner("x").style, dismissible: false, carousel: false } });
    const w: DeliveredWidget[] = [...widgets(), { kind: "banner", items: [noDismiss] }];
    const d2 = selectDelivery({ placementId: "other", widgets: w }, fresh());
    expect(d2.banner?.id).toBe("sticky");
    // …y las historias de ese mismo placement siguen disponibles
    expect(d2.storyBars[0]!.groups.length).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) ctx.frequency.record("banner:home_top:b1");
    expect(selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx).banner).toBeNull();
  });

  it("pausa por superficie: DIFIERE (no descarta ni consume frecuencia) y al reanudar vuelve", () => {
    const ctx = fresh();
    ctx.surfaces.pause("banner", "checkout");
    const paused = selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx);
    expect(paused.banner).toBeNull();
    expect(paused.held.paused).toEqual(["banner"]);
    expect(paused.storyBars[0]!.groups.length).toBe(2); // la otra superficie sigue
    expect(ctx.frequency.count("banner:home_top:b2", 24)).toBe(0);
    ctx.surfaces.resume("banner", "checkout");
    expect(selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx).banner?.id).toBe("b2");
    ctx.surfaces.pause("all", "juego");
    const all = selectDelivery({ placementId: "home_top", widgets: widgets() }, ctx);
    expect(all.held.paused.sort()).toEqual(["banner", "story"]);
  });

  it("kill por superficie: la lista llega vacía y no se entrega nada de esa superficie", () => {
    const w = processPlacement(placementResponse({ kill: { placement: false, story: true, banner: false } }), { sdkVersion: "0.1.0", now }).widgets;
    const d = selectDelivery({ placementId: "home_top", widgets: w }, fresh());
    expect(d.storyBars[0]!.groups).toEqual([]);
    expect(d.banner?.id).toBe("b2");
  });
});

describe("descartes de banners", () => {
  it("un descarte dura hasta la caducidad del banner", () => {
    const d = createDismissStore(undefined, { clock });
    d.dismiss("b", now + HOUR);
    expect(d.isDismissed("b")).toBe(true);
    now += 2 * HOUR;
    expect(d.isDismissed("b")).toBe(false);
    d.dismiss("c");
    now += 1000 * HOUR;
    expect(d.isDismissed("c")).toBe(true);
  });
});

describe("un overlay a la vez", () => {
  it("el segundo espera su turno sin perderse (FIFO) y tryAcquire falla mientras tanto", async () => {
    const gate = createOverlayGate();
    const releaseA = gate.tryAcquire("a")!;
    expect(gate.tryAcquire("b")).toBeNull();
    const order: string[] = [];
    const pb = gate.acquire("b").then((r) => (order.push("b"), r));
    const pc = gate.acquire("c").then((r) => (order.push("c"), r));
    expect(gate.current()).toBe("a");
    releaseA();
    const releaseB = await pb;
    expect(gate.current()).toBe("b");
    releaseB();
    await pc;
    expect(order).toEqual(["b", "c"]);
    expect(gate.current()).toBe("c");
  });
  it("soltar dos veces no libera al siguiente", () => {
    const gate = createOverlayGate();
    const r = gate.tryAcquire("a")!;
    r();
    const r2 = gate.tryAcquire("b")!;
    r();
    expect(gate.current()).toBe("b");
    r2();
    expect(gate.current()).toBeNull();
  });
});
