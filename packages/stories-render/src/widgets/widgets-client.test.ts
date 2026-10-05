import { describe, expect, it } from "vitest";
import { createEventQueue } from "../client/events";
import { selectDelivery, createDismissStore, createFrequencyTracker, createSurfaceControl } from "../client/delivery";
import { processPlacement } from "../client/placements";
import { createMemoryStore } from "../store";
import { createWidgetProgressStore } from "./progress";
import type { DeliveredChecklist, DeliveredInline, DeliveredCanvas, PlacementResponse } from "../types";

const canvas = (id: string, priority: number, over: Partial<DeliveredCanvas> = {}): DeliveredCanvas => ({ id, priority, control: false, config: { columns: 2, gap: 8, padding: 8, corner_radius: 8, background: {} }, items: [{ id: "t", image: { url: "https://x.test/a.jpg", alt: "a" }, action: { type: "url", url: "https://x.test" } }], ...over });
const checklist = (id: string, mode: "checklist" | "tour", over: Partial<DeliveredChecklist> = {}): DeliveredChecklist => ({
  id, priority: 50, control: false,
  config: { mode, title: "Empieza", ordered: false, dismissible: true, dismiss_confirm: true, progress: "bar", tour: { presentation: "tooltip", skippable: true } },
  items: [{ type: "item", id: "a", title: "A", complete_on: { type: "click" } }, { type: "item", id: "b", title: "B", complete_on: { type: "click" } }],
  ...over,
});
const inline = (id: string, anchor: DeliveredInline["config"]["anchor"], priority = 50): DeliveredInline => ({ id, priority, control: false, config: { anchor, aspect: "auto", corner_radius: 8, dismissible: true }, items: [{ id: "c" }] });

const ctx = (extra: { surfaces?: ReturnType<typeof createSurfaceControl> } = {}) => {
  const store = createMemoryStore();
  return { frequency: createFrequencyTracker(store), dismissed: createDismissStore(store), progress: createWidgetProgressStore(store), ...extra };
};
const res = (widgets: PlacementResponse["widgets"]) => ({ placementId: "home", widgets });

describe("selectDelivery: widgets de la Ola 3", () => {
  it("uno por tipo (mayor prioridad, desempate por id) y el control sale aparte", () => {
    const d = selectDelivery(res([{ kind: "canvas", items: [canvas("b", 10), canvas("a", 90), canvas("c", 90), canvas("ctl", 99, { control: true, items: undefined })] }]), ctx());
    expect(d.widgets.canvas?.id).toBe("a");
    expect(d.control.widgets).toEqual([{ kind: "canvas", id: "ctl" }]);
  });
  it("inline: uno por ancla", () => {
    const d = selectDelivery(res([{ kind: "inline", items: [inline("x", { type: "element", element_id: "hero", position: "after" }, 10), inline("y", { type: "element", element_id: "hero", position: "after" }, 80), inline("z", { type: "index", list_id: "feed", index: 3 })] }]), ctx());
    expect(d.widgets.inline.map((i) => i.id).sort()).toEqual(["y", "z"]);
  });
  it("un checklist no gasta frecuencia; un tour sí; descartado o completo no vuelve", () => {
    const c = ctx();
    const tour = checklist("t1", "tour", { frequency: { max_impressions: 1, window_hours: 24, min_gap_seconds: 0 } });
    const list = checklist("l1", "checklist", { frequency: { max_impressions: 1, window_hours: 24, min_gap_seconds: 0 } });
    c.frequency.record("widget:home:t1");
    c.frequency.record("widget:home:l1");
    const d = selectDelivery(res([{ kind: "checklist", items: [tour] }]), c);
    expect(d.widgets.checklist).toBeNull();
    expect(d.held.frequency).toEqual(["t1"]);
    expect(selectDelivery(res([{ kind: "checklist", items: [list] }]), c).widgets.checklist?.id).toBe("l1");
    c.progress.complete("l1", "a");
    expect(selectDelivery(res([{ kind: "checklist", items: [list] }]), c).widgets.checklist?.id).toBe("l1");
    c.progress.complete("l1", "b");
    expect(selectDelivery(res([{ kind: "checklist", items: [list] }]), c).widgets.checklist).toBeNull();
    const c2 = ctx();
    expect(selectDelivery(res([{ kind: "checklist", items: [checklist("l2", "checklist", { progress: { completed: {}, dismissed: true } })] }]), c2).widgets.checklist).toBeNull();
  });
  it("la pausa de la superficie widget DIFIERE", () => {
    const surfaces = createSurfaceControl();
    surfaces.pause("widget");
    const d = selectDelivery(res([{ kind: "canvas", items: [canvas("a", 1)] }]), ctx({ surfaces }));
    expect(d.widgets.canvas).toBeNull();
    expect(d.held.paused).toEqual(["widget"]);
  });
});

describe("processPlacement: kill.widget", () => {
  const base = (kill: PlacementResponse["kill"], widgets: PlacementResponse["widgets"]): PlacementResponse => ({ placement_id: "home", etag: "e", ttl: 60, min_sdk: null, kill, widgets });
  it("vacía los widgets y avisa; caducados fuera", () => {
    const r = processPlacement(base({ placement: false, story: false, banner: false, widget: true }, [{ kind: "canvas", items: [canvas("a", 1)] }]), { sdkVersion: "9.9.9", now: Date.now() });
    expect(r.status).toBe("killed");
    expect(r.notice?.code).toBe("kill_widget");
    const r2 = processPlacement(base({ placement: false, story: false, banner: false }, [{ kind: "canvas", items: [canvas("a", 1, { expires_at: "2020-01-01T00:00:00Z" }), canvas("b", 1)] }]), { sdkVersion: "9.9.9", now: Date.now() });
    expect(r2.widgets[0]!.items.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("progreso que no se deshace", () => {
  it("el primero gana; une el servidor con lo local; persiste", async () => {
    const store = createMemoryStore();
    const p = createWidgetProgressStore(store, { now: () => 0 });
    expect(p.complete("w", "a", "2026-10-02T10:00:00Z")).toBe(true);
    expect(p.complete("w", "a", "2026-10-03T10:00:00Z")).toBe(false);
    expect(p.swipe("w", "commerce:p1")).toBe(true);
    expect(p.swipe("w", "commerce:p1")).toBe(false);
    expect(p.get("w", { completed: { b: "2026-10-02T11:00:00Z" }, dismissed: false, swiped: ["commerce:p0"] })).toEqual({ completed: { a: "2026-10-02T10:00:00Z", b: "2026-10-02T11:00:00Z" }, dismissed: false, swiped: ["commerce:p0", "commerce:p1"] });
    await new Promise((r) => setTimeout(r, 5));
    const again = createWidgetProgressStore(store);
    await again.ready;
    expect(again.get("w").completed).toEqual({ a: "2026-10-02T10:00:00Z" });
  });
});

describe("events.fromWidget", () => {
  it("mapea al contrato (canal widget) y deduplica la impresión", () => {
    const q = createEventQueue({ token: async () => "t", fetch: (async () => new Response("{}")) as typeof fetch, newId: (() => { let n = 0; return () => `e${++n}`; })() });
    const ctx = { placementId: "home" };
    q.fromWidget(ctx, { widgetId: "w", type: "impression" });
    expect(q.fromWidget(ctx, { widgetId: "w", type: "impression" })).toBeNull();
    expect(q.fromWidget(ctx, { widgetId: "w", type: "swipe", direction: "right", via: "button", product: { connector: "commerce", external_id: "p1" }, position: 2 })).toBe("e2");
    q.fromWidget(ctx, { widgetId: "w", type: "checklist_item", itemId: "a", via: "click" });
    q.fromWidget(ctx, { widgetId: "w", type: "tour_step", stepId: "s1", step: "shown" });
    q.fromWidget(ctx, { widgetId: "w", type: "playback", itemId: "v1", action: "pause" });
    expect(q.pending()).toBe(5);
  });

  it("un evento de producto lleva el elemento (page_id), el componente fijo y la sesión; sin contexto sigue siendo «cards»", async () => {
    const bodies: Array<{ events: Array<Record<string, unknown>> }> = [];
    const q = createEventQueue({ token: async () => "t", fetch: (async (_u: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response("{}"); }) as typeof fetch, newId: (() => { let n = 0; return () => `evt-${String(++n).padStart(8, "0")}`; })() });
    const ctx = { placementId: "home" };
    const p = { connector: "commerce", external_id: "p1" };
    q.fromWidget(ctx, { widgetId: "shop", type: "product", name: "add_to_cart", product: p, quantity: 2, itemId: "v1", componentId: "feed" });
    q.fromWidget(ctx, { widgetId: "cards", type: "product", name: "wishlist_added", product: p });
    await q.flush();
    const [a, b] = bodies.flatMap((x) => x.events);
    expect(a).toMatchObject({ channel: "widget", campaign_id: "shop", type: "add_to_cart", component_id: "feed", page_id: "v1", quantity: 2 });
    expect(a!.session_id).toEqual(expect.any(String));
    expect(b).toMatchObject({ campaign_id: "cards", component_id: "cards" });
    expect(b!.page_id).toBeUndefined();
  });
});
