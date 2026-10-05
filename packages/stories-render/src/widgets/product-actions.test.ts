// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { DeliveredCanvas, DeliveredInline, DeliveredVideoFeed, ProductRef } from "../types";
import type { WidgetEvent } from "./common";
import { mountCanvas } from "./canvas";
import { mountInline } from "./inline";
import { mountVideoFeed } from "./video-feed";
import { WIDGET_PRODUCT_COMPONENT_IDS } from "./product-actions";

const p1: ProductRef = { connector: "commerce", external_id: "p1" };
const p2: ProductRef = { connector: "commerce", external_id: "p2", variant_id: "v" };
const img = { url: "https://cdn.example.com/a.jpg", alt: "A" };

const canvas = (): DeliveredCanvas => ({ id: "mosaic", priority: 50, control: false, config: { columns: 2, gap: 8, padding: 12, corner_radius: 12, background: {} }, items: [{ id: "t1", image: img, title: "T", action: { type: "url", url: "https://example.com/t" }, products: [p1, p2] }, { id: "t2", image: img, action: { type: "url", url: "https://example.com/u" } }] });

describe("productos de un elemento de widget", () => {
  it("un elemento sin productos no pinta nada de carrito", () => {
    const host = document.createElement("div");
    mountCanvas(host, { entry: { ...canvas(), items: [canvas().items![1]!] } });
    expect(host.querySelector(".cs-wp")).toBeNull();
  });

  it("canvas: product_viewed una vez por producto, y add_to_cart/wishlist con el elemento y el componente fijos", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const events: WidgetEvent[] = [];
    const onAddToCart = vi.fn();
    const onWishlist = vi.fn();
    mountCanvas(host, { entry: canvas(), onEvent: (e) => events.push(e), onAddToCart, onWishlist });
    const products = events.filter((e) => e.type === "product");
    expect(products.map((e) => (e as { name: string }).name)).toEqual(["product_viewed", "product_viewed"]);
    expect(products[0]).toMatchObject({ widgetId: "mosaic", itemId: "t1", componentId: "canvas", product: p1 });
    const buttons = host.querySelectorAll<HTMLButtonElement>(".cs-wp__add");
    buttons[0]!.click();
    buttons[0]!.click(); // doble clic rápido = una intención
    host.querySelectorAll<HTMLButtonElement>(".cs-wp__save")[1]!.click();
    const added = events.filter((e) => e.type === "product" && e.name === "add_to_cart");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ itemId: "t1", componentId: "canvas", product: p1, quantity: 1 });
    expect(onAddToCart).toHaveBeenCalledWith(p1, { storyId: "mosaic", slideId: "t1", componentId: "canvas", quantity: 1 });
    expect(onWishlist).toHaveBeenCalledWith(p2, { storyId: "mosaic", slideId: "t1", componentId: "canvas" });
    // el clic en el botón no abre el enlace de la pieza
    expect(events.some((e) => e.type === "click")).toBe(false);
  });

  it("inline y video feed usan su propio componente", () => {
    const doc = document;
    doc.body.innerHTML = `<header data-customy-anchor="h">H</header>`;
    const ev: WidgetEvent[] = [];
    const inline: DeliveredInline = { id: "promo", priority: 50, control: false, config: { anchor: { type: "element", element_id: "h", position: "after" }, aspect: "auto", corner_radius: 8, dismissible: false }, items: [{ id: "c1", title: "x", products: [p1] }] };
    const h = mountInline(null, { entry: inline, onEvent: (e) => ev.push(e) });
    expect(ev[0]).toMatchObject({ type: "product", name: "product_viewed", itemId: "c1", componentId: "inline" });
    h.destroy();
    const host = document.createElement("div");
    const feed = { id: "vf", priority: 50, control: false, config: { layout: "carousel", aspect: "9:16", columns: 2, corner_radius: 12, show_title: true, autoplay: { enabled: false, mode: "visible", pausable: true, muted: true }, preload: { before: 1, after: 1 }, share: { enabled: false } }, items: [{ id: "v1", type: "images", images: [img], slide_ms: 3000, ctas: [], share: { enabled: false }, archived: false, products: [p1] }] } as unknown as DeliveredVideoFeed;
    const ev2: WidgetEvent[] = [];
    const vf = mountVideoFeed(host, { entry: feed, onEvent: (e) => ev2.push(e) });
    vf.open(0);
    expect(document.querySelector(".cs-wp")).not.toBeNull();
    expect(ev2.find((e) => e.type === "product")).toMatchObject({ itemId: "v1", componentId: "feed" });
  });

  it("los componentes fijos son los que el servidor exige", () => {
    expect(WIDGET_PRODUCT_COMPONENT_IDS).toEqual({ swipe_cards: "cards", video_feed: "feed", canvas: "canvas", inline: "inline" });
  });
});
