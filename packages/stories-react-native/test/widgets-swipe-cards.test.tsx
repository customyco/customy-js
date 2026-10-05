import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { SwipeCardsView, type WidgetEvent } from "../src/widgets";
import { pan } from "./mocks/gesture-handler";
import { rn } from "./mocks/react-native";
import { attr, renderWithProvider } from "./harness";
import { ref, swipeEntry } from "./widget-fixtures";

afterEach(() => void vi.useRealTimers());

function setup(n = 3, over = {}, rest = {}, props: Record<string, unknown> = {}, viewProps: Record<string, unknown> = {}) {
  const events: WidgetEvent[] = [];
  const view = renderWithProvider(<SwipeCardsView entry={swipeEntry(n, over, rest)} onEvent={(e) => events.push(e)} {...viewProps} />, props);
  return { events, ...view };
}
const swipes = (events: WidgetEvent[]) => events.filter((e) => e.type === "swipe");
/** Eventos de comercio de la decisión (`wishlist_added` / `add_to_cart`), sin los `product_viewed` de cada tarjeta que queda arriba. */
const commerce = (events: WidgetEvent[]) => events.filter((e) => e.type === "product" && e.name !== "product_viewed");
const viewed = (events: WidgetEvent[]) => events.filter((e): e is Extract<WidgetEvent, { type: "product" }> => e.type === "product" && e.name === "product_viewed");
const flyAway = async () => void (await act(async () => void vi.advanceTimersByTime(250)));

describe("Swipe Cards nativo", () => {
  it("pinta la de arriba con su etiqueta, apila las siguientes ocultas al lector y deja los botones siempre a la vista", () => {
    setup();
    const top = screen.getByTestId("cs-swipe-top");
    expect(attr(top, "aria-label")).toContain("Producto 1 de 3");
    expect(attr(top, "aria-label")).toContain("Producto 1");
    expect(attr(top, "data-hint")).toMatch(/Desliza/);
    expect(attr(top, "data-actions")).toBe("like,nope");
    // 3 tarjetas apiladas en total: 2 ocultas al lector de pantalla
    expect(document.querySelectorAll('[data-hidden="1"]').length).toBeGreaterThanOrEqual(2);
    expect(attr(screen.getByTestId("cs-swipe-like"), "aria-label")).toBe("Me gusta");
    expect(attr(screen.getByTestId("cs-swipe-nope"), "aria-label")).toBe("No me interesa");
    // botones ≥ 48 pt
    expect(JSON.parse(attr(screen.getByTestId("cs-swipe-like"), "data-style")!).width).toBeGreaterThanOrEqual(48);
  });

  it("botón «me gusta»: evento swipe (vía button), wishlist con contexto de campaña y `component_id: cards`, y anuncio", async () => {
    vi.useFakeTimers();
    const onWishlist = vi.fn();
    const { events } = setup(3, {}, {}, { onWishlist });
    expect(events.filter((e) => e.type === "impression")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    await flyAway();
    expect(swipes(events)[0]).toMatchObject({ widgetId: "cards", direction: "right", via: "button", product: ref(1), position: 0 });
    expect(commerce(events)[0]).toMatchObject({ name: "wishlist_added", product: ref(1) });
    expect(onWishlist).toHaveBeenCalledWith(ref(1), { storyId: "cards", componentId: "cards" });
    expect(screen.getByTestId("cs-swipe-live").textContent).toBe("Producto 1: me gusta");
    expect(attr(screen.getByTestId("cs-swipe-top"), "aria-label")).toContain("Producto 2 de 3");
  });

  it("add_to_cart: cantidad 1 y contexto en `onAddToCart`", async () => {
    vi.useFakeTimers();
    const onAddToCart = vi.fn();
    const { events } = setup(2, { swipe_right: "add_to_cart" }, {}, { onAddToCart });
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    await flyAway();
    expect(commerce(events)[0]).toMatchObject({ name: "add_to_cart", quantity: 1, product: ref(1) });
    expect(onAddToCart).toHaveBeenCalledWith(ref(1), 1, { storyId: "cards", componentId: "cards" });
  });

  it("descartar a la izquierda no dispara producto; las acciones de accesibilidad equivalen a los botones (vía keyboard)", async () => {
    vi.useFakeTimers();
    const { events } = setup(3);
    act(() => rn.fireAction("cs-swipe-top", "nope"));
    await flyAway();
    expect(swipes(events)[0]).toMatchObject({ direction: "left", via: "keyboard", position: 0 });
    expect(commerce(events)).toHaveLength(0);
    act(() => rn.fireAction("cs-swipe-top", "like"));
    await flyAway();
    expect(swipes(events)[1]).toMatchObject({ direction: "right", via: "keyboard", position: 1 });
    expect(commerce(events)).toHaveLength(1);
  });

  it("gesto: pasar el umbral decide (vía gesture); un arrastre corto no", async () => {
    vi.useFakeTimers();
    const { events } = setup(3);
    act(() => pan.update(30));
    act(() => pan.end(30));
    await flyAway();
    expect(swipes(events)).toHaveLength(0);
    act(() => pan.update(140));
    act(() => pan.end(140));
    await flyAway();
    expect(swipes(events)[0]).toMatchObject({ direction: "right", via: "gesture" });
    act(() => pan.end(-120));
    await flyAway();
    expect(swipes(events)[1]).toMatchObject({ direction: "left", via: "gesture", position: 1 });
  });

  it("mientras vuela la tarjeta, otro toque se ignora (una decisión por tarjeta)", async () => {
    vi.useFakeTimers();
    const { events } = setup(3);
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    fireEvent.click(screen.getByTestId("cs-swipe-nope"));
    await flyAway();
    expect(swipes(events)).toHaveLength(1);
  });

  it("reduce motion: la decisión es inmediata, sin vuelo", () => {
    const { events } = setup(3, {}, {}, { reducedMotion: true });
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    expect(swipes(events)).toHaveLength(1);
    expect(attr(screen.getByTestId("cs-swipe-top"), "aria-label")).toContain("Producto 2 de 3");
  });

  it("remember_swipes: lo ya deslizado no vuelve; con `false` el mazo es completo", () => {
    const progress = { completed: {}, dismissed: false, swiped: ["commerce:p1", "commerce:p2"] };
    setup(3, {}, {}, {}, { progress });
    expect(attr(screen.getByTestId("cs-swipe-top"), "aria-label")).toContain("Producto 1 de 1");
  });

  it("al terminar: complete, título de fin, lista de me gusta y CTA con su clic", async () => {
    const { events } = setup(2, { end: { title: "Eso es todo", message: "Vuelve", show_liked: true, cta: { label: "Ver tienda", action: { type: "url", url: "https://shop.example.com" }, element_id: "cards.end" } } }, {}, { reducedMotion: true });
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    fireEvent.click(screen.getByTestId("cs-swipe-nope"));
    expect(events.map((e) => e.type)).toEqual(["impression", "product", "swipe", "product", "product", "swipe", "complete"]);
    expect(viewed(events).map((e) => e.product)).toEqual([ref(1), ref(2)]);
    expect(screen.getByText("Eso es todo").getAttribute("data-role")).toBe("header");
    expect(screen.getByText("• Producto 1")).toBeTruthy();
    expect(screen.queryByTestId("cs-swipe-like")).toBeNull();
    fireEvent.click(screen.getByTestId("cs-swipe-cta"));
    expect(events.at(-1)).toEqual({ widgetId: "cards", type: "click", elementId: "cards.end" });
    expect(Linking.openURL).toHaveBeenCalledWith("https://shop.example.com");
  });

  it("`resolveProducts`: título, precio y no disponible en la etiqueta; `open` abre la URL del producto", async () => {
    const resolveProducts = vi.fn(async (refs: { external_id: string }[]) => refs.map((r) => ({ ref: ref(Number(r.external_id.slice(1))), title: `Camiseta ${r.external_id}`, price: { amount: "1990", currency: "USD", formatted: "$19,90" }, available: r.external_id !== "p2", url: `https://shop.example.com/${r.external_id}` })));
    const { events } = setup(2, { swipe_right: "open" }, {}, { resolveProducts, reducedMotion: true });
    await act(async () => {});
    expect(resolveProducts).toHaveBeenCalledTimes(1);
    expect(attr(screen.getByTestId("cs-swipe-top"), "aria-label")).toContain("Camiseta p1. $19,90");
    fireEvent.click(screen.getByTestId("cs-swipe-like"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://shop.example.com/p1");
    expect(commerce(events)).toHaveLength(0);
    expect(attr(screen.getByTestId("cs-swipe-top"), "aria-label")).toContain("No disponible");
  });
});
