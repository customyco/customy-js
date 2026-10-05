// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { DeliveredSwipeCards, ProductRef, SwipeCard } from "../types";
import type { WidgetEvent } from "./common";
import { createSwipeDeck, mountSwipeCards, swipeKey } from "./swipe-cards";

const ref = (n: number, variant?: string): ProductRef => ({ connector: "commerce", external_id: `p${n}`, ...(variant ? { variant_id: variant } : {}) });
const card = (n: number): SwipeCard => ({ product: ref(n), headline: `Producto ${n}` });
const entry = (n: number, over: Partial<DeliveredSwipeCards["config"]> = {}): DeliveredSwipeCards => ({
  id: "cards", priority: 50, control: false, items: Array.from({ length: n }, (_, i) => card(i + 1)),
  config: {
    layout: "stack", aspect: "3:4", corner_radius: 16, show_price: true, remember_swipes: true, swipe_right: "wishlist", buttons: true,
    feedback: { like: { icon: "heart", label: "Me gusta" }, nope: { icon: "x", label: "No me interesa" }, show_stamps: true },
    end: { title: "Fin", message: "Vuelve pronto", show_liked: true },
    ...over,
  },
});

describe("createSwipeDeck", () => {
  it("clave estable con variante; el mazo salta lo ya deslizado (remember_swipes) y respeta el tope", () => {
    expect(swipeKey(ref(1, "v"))).toBe("commerce:p1#v");
    const d = createSwipeDeck({ entry: entry(5, { limit: 4 }), progress: { completed: {}, dismissed: false, swiped: ["commerce:p1"] } });
    expect(d.remaining.map((c) => c.product.external_id)).toEqual(["p2", "p3", "p4", "p5"].slice(0, 4));
    const off = createSwipeDeck({ entry: entry(3, { remember_swipes: false }), progress: { completed: {}, dismissed: false, swiped: ["commerce:p1"] } });
    expect(off.total).toBe(3);
  });

  it("emite swipe con la vía y la posición, el evento de producto según swipe_right y complete al terminar", () => {
    const events: WidgetEvent[] = [];
    const onWishlist = vi.fn();
    const d = createSwipeDeck({ entry: entry(2), onEvent: (e) => events.push(e), onWishlist });
    d.swipe("right", "button");
    d.swipe("left", "keyboard");
    expect(d.done).toBe(true);
    expect(d.swipe("right", "gesture")).toBeNull();
    expect(events.map((e) => e.type)).toEqual(["swipe", "product", "product", "swipe", "complete"]);
    expect(events[0]).toMatchObject({ direction: "right", via: "button", position: 0 });
    expect(events[1]).toMatchObject({ name: "wishlist_added", product: ref(1) });
    // La tarjeta que queda arriba se «vio»: product_viewed una vez, antes del siguiente deslizamiento.
    expect(events[2]).toMatchObject({ name: "product_viewed", product: ref(2) });
    expect(events[3]).toMatchObject({ direction: "left", via: "keyboard", position: 1 });
    expect(onWishlist).toHaveBeenCalledWith(ref(1), { storyId: "cards", componentId: "cards" });
    expect(d.liked).toHaveLength(1);
  });

  it("add_to_cart y none", () => {
    const ev: WidgetEvent[] = [];
    const cart = vi.fn();
    createSwipeDeck({ entry: entry(1, { swipe_right: "add_to_cart" }), onEvent: (e) => ev.push(e), onAddToCart: cart }).swipe("right", "button");
    expect(ev[1]).toMatchObject({ name: "add_to_cart", quantity: 1 });
    expect(cart).toHaveBeenCalled();
    const ev2: WidgetEvent[] = [];
    createSwipeDeck({ entry: entry(1, { swipe_right: "none" }), onEvent: (e) => ev2.push(e) }).swipe("right", "button");
    expect(ev2.map((e) => e.type)).toEqual(["swipe", "complete"]);
  });
});

describe("mountSwipeCards", () => {
  const mount = (e = entry(3), extra: Record<string, unknown> = {}) => {
    const host = document.createElement("div");
    document.body.append(host);
    const events: WidgetEvent[] = [];
    const h = mountSwipeCards(host, { entry: e, onEvent: (ev) => events.push(ev), reducedMotion: true, locale: "es", ...extra });
    return { host, events, h };
  };
  const pointer = (target: Element, type: string, x: number) => {
    const ev = new Event(type, { bubbles: true });
    Object.assign(ev, { pointerId: 1, isPrimary: true, clientX: x });
    target.dispatchEvent(ev);
  };

  it("botones: me gusta y no me interesa, con etiquetas y anuncio aria-live; fin con lista de gustados", () => {
    const { host, events } = mount(entry(2));
    expect(host.querySelectorAll(".cs-swipe__card")).toHaveLength(2);
    host.querySelector<HTMLButtonElement>(".cs-swipe__btn--like")!.click();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Producto 1: me gusta");
    host.querySelector<HTMLButtonElement>(".cs-swipe__btn--nope")!.click();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Producto 2: descartado");
    expect(host.querySelector(".cs-swipe__end-title")!.textContent).toBe("Fin");
    expect(host.querySelector(".cs-swipe__liked li")!.textContent).toBe("Producto 1");
    expect(events.filter((e) => e.type === "swipe").map((e) => e.type === "swipe" && [e.direction, e.via])).toEqual([["right", "button"], ["left", "button"]]);
    expect(events.at(-1)!.type).toBe("complete");
  });

  it("teclado: flechas sobre el mazo", () => {
    const { host, events } = mount();
    const stage = host.querySelector<HTMLElement>(".cs-swipe__stage")!;
    expect(stage.tabIndex).toBe(0);
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(events.filter((e) => e.type === "swipe").map((e) => e.type === "swipe" && [e.direction, e.via])).toEqual([["right", "keyboard"], ["left", "keyboard"]]);
  });

  it("gesto: pasado el umbral decide; antes, vuelve", () => {
    const { host, events } = mount();
    let top = host.querySelector('[data-depth="0"]')!;
    pointer(top, "pointerdown", 100);
    pointer(top, "pointermove", 130);
    pointer(top, "pointerup", 130);
    expect(events.some((e) => e.type === "swipe")).toBe(false);
    top = host.querySelector('[data-depth="0"]')!;
    pointer(top, "pointerdown", 200);
    pointer(top, "pointermove", 90);
    pointer(top, "pointerup", 90);
    expect(events.find((e) => e.type === "swipe")).toMatchObject({ direction: "left", via: "gesture" });
  });

  it("con movimiento: la carta vuela y se decide al terminar; reducedMotion lo salta", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const events: WidgetEvent[] = [];
    mountSwipeCards(host, { entry: entry(2), onEvent: (e) => events.push(e), reducedMotion: false });
    host.querySelector<HTMLButtonElement>(".cs-swipe__btn--like")!.click();
    expect(events.some((e) => e.type === "swipe")).toBe(false);
    vi.advanceTimersByTime(250);
    expect(events.some((e) => e.type === "swipe")).toBe(true);
    vi.useRealTimers();
  });

  it("resuelve productos en vivo: título, precio e imagen; sin resolver cae al titular", async () => {
    const resolveProducts = vi.fn(async (refs: ProductRef[]) => refs.map((r) => ({ ref: r, title: `Zapato ${r.external_id}`, image_url: "https://cdn.example.com/z.jpg", price: { amount: 10, currency: "USD", formatted: "$10" }, available: true })));
    const { host } = mount(entry(2), { resolveProducts });
    expect(host.querySelector(".cs-swipe__title")!.textContent).toBe("Producto 2");
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveProducts).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-depth="0"] .cs-swipe__title')!.textContent).toBe("Zapato p1");
    expect(host.querySelector('[data-depth="0"] .cs-swipe__price')!.textContent).toBe("$10");
    expect(host.querySelector('[data-depth="0"] img')!.getAttribute("alt")).toBe("Zapato p1");
  });

  it("mazo vacío (todo ya deslizado) pinta el mensaje final; cover pinta solo la de arriba", () => {
    const all = entry(2);
    const { host } = mount(all, { progress: { completed: {}, dismissed: false, swiped: ["commerce:p1", "commerce:p2"] } });
    expect(host.querySelector(".cs-swipe__end")).not.toBeNull();
    const { host: h2 } = mount(entry(3, { layout: "cover" }));
    expect(h2.querySelectorAll(".cs-swipe__card")).toHaveLength(1);
  });
});
