// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeliveredInline, InlineAnchor } from "../types";
import type { WidgetEvent } from "./common";
import { createAnchorRegistry, insertionPoint, mountInline } from "./inline";

const entry = (anchor: InlineAnchor, over: Partial<DeliveredInline["config"]> = {}): DeliveredInline => ({
  id: "promo", priority: 50, control: false,
  config: { anchor, aspect: "auto", corner_radius: 8, dismissible: true, ...over },
  items: [{ id: "c1", title: "Oferta", body: "Solo hoy", image: { url: "https://cdn.example.com/a.jpg", alt: "Oferta" }, cta: { label: "Ver", action: { type: "url", url: "https://example.com/x" }, element_id: "promo.ver" } }],
});
const page = () => {
  document.body.innerHTML = `<main><header data-customy-anchor="home.header">H</header><ul data-customy-anchor="feed"><li>1</li><li>2</li><li>3</li></ul><footer>F</footer></main>`;
};
afterEach(() => { document.body.innerHTML = ""; });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("mountInline", () => {
  it("coloca la tarjeta según la posición respecto al ancla", () => {
    for (const [position, expectFn] of [
      ["before", () => document.querySelector("header")!.previousElementSibling],
      ["after", () => document.querySelector("header")!.nextElementSibling],
      ["inside_start", () => document.querySelector("header")!.firstElementChild],
      ["inside_end", () => document.querySelector("header")!.lastElementChild],
    ] as const) {
      page();
      const h = mountInline(null, { entry: entry({ type: "element", element_id: "home.header", position }) });
      expect(expectFn()).toBe(h.element);
      h.destroy();
    }
  });

  it("replace oculta el elemento y lo restaura al destruir", () => {
    page();
    const h = mountInline(null, { entry: entry({ type: "element", element_id: "home.header", position: "replace" }) });
    const header = document.querySelector<HTMLElement>("header")!;
    expect(header.hidden).toBe(true);
    expect(header.nextElementSibling).toBe(h.element);
    h.destroy();
    expect(header.hidden).toBe(false);
    expect(document.querySelector("[data-widget-kind]")).toBeNull();
  });

  it("por índice en una lista: antes del hijo N, o al final", () => {
    page();
    const h = mountInline(null, { entry: entry({ type: "index", list_id: "feed", index: 1 }) });
    expect(Array.from(document.querySelector("ul")!.children).map((c) => c.textContent?.trim().slice(0, 1))).toEqual(["1", "O", "2", "3"]);
    h.destroy();
    page();
    const h2 = mountInline(null, { entry: entry({ type: "index", list_id: "feed", index: 99 }) });
    expect(document.querySelector("ul")!.lastElementChild).toBe(h2.element);
    h2.destroy();
  });

  it("espera al ancla y se retira (y vuelve) con ella", async () => {
    document.body.innerHTML = "<main></main>";
    const h = mountInline(null, { entry: entry({ type: "element", element_id: "late", position: "after" }) });
    expect(h.element.isConnected).toBe(false);
    const a = document.createElement("div");
    a.setAttribute("data-customy-anchor", "late");
    document.querySelector("main")!.append(a);
    await tick();
    expect(a.nextElementSibling).toBe(h.element);
    a.remove();
    await tick();
    expect(h.element.isConnected).toBe(false);
    h.destroy();
  });

  it("registro de anclas de la app, sin atributos en el DOM", () => {
    document.body.innerHTML = "<main><section id='x'>X</section></main>";
    const anchors = createAnchorRegistry();
    anchors.register("custom", document.getElementById("x")!);
    const h = mountInline(null, { entry: entry({ type: "element", element_id: "custom", position: "before" }), anchors });
    expect(document.getElementById("x")!.previousElementSibling).toBe(h.element);
    h.destroy();
  });

  it("clic en la CTA emite click con su element_id; descartar emite dismiss y se retira; sin ancla no pinta nada", () => {
    page();
    const events: WidgetEvent[] = [];
    const openLink = vi.fn();
    const h = mountInline(null, { entry: entry({ type: "element", element_id: "home.header", position: "after" }), onEvent: (e) => events.push(e), openLink, locale: "es" });
    expect(events).toContainEqual({ widgetId: "promo", type: "impression" });
    h.element.querySelector<HTMLElement>(".cs-widget__cta")!.click();
    expect(events).toContainEqual({ widgetId: "promo", type: "click", elementId: "promo.ver", itemId: "c1" });
    expect(openLink).toHaveBeenCalledTimes(1);
    const x = h.element.querySelector<HTMLButtonElement>(".cs-inline__dismiss")!;
    expect(x.getAttribute("aria-label")).toBe("Descartar");
    x.click();
    expect(events).toContainEqual({ widgetId: "promo", type: "dismiss", reason: "user" });
    expect(h.element.isConnected).toBe(false);
    const none = mountInline(null, { entry: entry({ type: "element", element_id: "nope", position: "after" }) });
    expect(none.element.isConnected).toBe(false);
    none.destroy();
  });

  it("insertionPoint es pura sobre el elemento", () => {
    page();
    const header = document.querySelector<HTMLElement>("header")!;
    expect(insertionPoint({ type: "element", element_id: "home.header", position: "after" }, header)).toMatchObject({ parent: header.parentNode });
    expect(insertionPoint({ type: "element", element_id: "home.header", position: "replace" }, header)).toEqual({ replace: header });
  });
});
