// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { CanvasTile, DeliveredCanvas } from "../types";
import { masonryColumns, mountCanvas } from "./canvas";
import type { WidgetEvent } from "./common";

const tile = (id: string, w?: number, h?: number, over: Partial<CanvasTile> = {}): CanvasTile => ({ id, image: { url: `https://cdn.example.com/${id}.jpg`, alt: `Foto ${id}`, ...(w ? { width: w, height: h } : {}) }, title: `T ${id}`, action: { type: "url", url: `https://example.com/${id}` }, ...over });
const entry = (items: CanvasTile[], config: Partial<DeliveredCanvas["config"]> = {}): DeliveredCanvas => ({
  id: "mosaic", priority: 50, control: false, items,
  config: { columns: 2, gap: 8, padding: 12, corner_radius: 12, background: {}, ...config },
});

describe("masonryColumns", () => {
  it("reparte por altura acumulada y conserva el orden por filas", () => {
    const cols = masonryColumns([tile("a", 100, 300), tile("b", 100, 100), tile("c", 100, 100), tile("d", 100, 100)], 2);
    expect(cols.map((c) => c.map((t) => t.id))).toEqual([["a"], ["b", "c", "d"]]);
  });
  it("sin medidas reparte por turnos; columnas acotadas a 1-6", () => {
    expect(masonryColumns([tile("a"), tile("b"), tile("c")], 2).map((c) => c.length)).toEqual([2, 1]);
    expect(masonryColumns([tile("a")], 0)).toHaveLength(1);
    expect(masonryColumns([tile("a")], 99)).toHaveLength(6);
  });
});

describe("mountCanvas", () => {
  it("pinta una pieza por elemento con enlace real, alt y etiqueta; clic emite click y abre la acción", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const events: WidgetEvent[] = [];
    const openLink = vi.fn();
    const h = mountCanvas(host, { entry: entry([tile("a"), tile("b", 100, 200, { element_id: "mosaic.b" })], { title: "Novedades", cta: { label: "Ver todo", action: { type: "url", url: "https://example.com/all" }, element_id: "mosaic.all" } }), onEvent: (e) => events.push(e), openLink, locale: "es" });
    const tiles = host.querySelectorAll<HTMLAnchorElement>("a.cs-canvas__tile");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]!.href).toBe("https://example.com/a");
    expect(tiles[0]!.querySelector("img")!.alt).toBe("Foto a");
    expect(host.querySelector("section")!.getAttribute("aria-label")).toBe("Novedades");
    expect(host.querySelector("h2")!.textContent).toBe("Novedades");
    const b = host.querySelector<HTMLAnchorElement>('[data-tile-id="b"]')!;
    b.click();
    expect(events).toContainEqual({ widgetId: "mosaic", type: "impression" });
    expect(events).toContainEqual({ widgetId: "mosaic", type: "click", elementId: "mosaic.b", itemId: "b" });
    expect(openLink).toHaveBeenCalledWith({ type: "url", url: "https://example.com/b" }, { widgetId: "mosaic", tileId: "b", elementId: "mosaic.b" });
    host.querySelector<HTMLElement>(".cs-widget__cta")!.click();
    expect(events).toContainEqual({ widgetId: "mosaic", type: "click", elementId: "mosaic.all" });
    h.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("nombre de clic por defecto widget.<campaña>.<pieza>; estilos solo si son seguros", () => {
    const host = document.createElement("div");
    const events: WidgetEvent[] = [];
    mountCanvas(host, { entry: entry([tile("a")], { background: { color: "red; background:url(x)", image_url: "javascript:alert(1)" } }), onEvent: (e) => events.push(e), openLink: () => undefined });
    host.querySelector<HTMLElement>(".cs-canvas__tile")!.click();
    expect(events.find((e) => e.type === "click")).toMatchObject({ elementId: "widget.mosaic.a" });
    const root = host.querySelector<HTMLElement>("section")!;
    expect(root.style.getPropertyValue("--cs-w-bg")).toBe("");
    expect(root.style.getPropertyValue("--cs-w-bg-image")).toBe("");
    const ok = document.createElement("div");
    mountCanvas(ok, { entry: entry([tile("a")], { background: { color: "#112233", image_url: "https://cdn.example.com/bg.jpg" }, gap: 4, padding: 20 }) });
    const r = ok.querySelector<HTMLElement>("section")!;
    expect(r.style.getPropertyValue("--cs-w-bg")).toBe("#112233");
    expect(r.style.getPropertyValue("--cs-w-bg-image")).toContain("https://cdn.example.com/bg.jpg");
    expect(r.style.getPropertyValue("--cs-w-gap")).toBe("4px");
  });

  it("un evento de impresión por montaje y rtl por idioma", () => {
    const host = document.createElement("div");
    const events: WidgetEvent[] = [];
    mountCanvas(host, { entry: entry([tile("a")]), onEvent: (e) => events.push(e), locale: "ar" });
    expect(events.filter((e) => e.type === "impression")).toHaveLength(1);
    expect(host.querySelector("section")!.getAttribute("dir")).toBe("rtl");
  });
});
