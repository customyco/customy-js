import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasView, InlineView } from "../src/widgets";
import type { WidgetEvent } from "../src/widgets";
import { VideoFeedView } from "../src/video-feed";
import { attr, renderWithProvider } from "./harness";
import { canvasEntry, feedEntry, inlineEntry, ref, video } from "./widget-fixtures";

afterEach(() => void vi.useRealTimers());
const flush = async (): Promise<void> => void (await act(async () => {}));
const products = (e: WidgetEvent[]) => e.filter((x): x is Extract<WidgetEvent, { type: "product" }> => x.type === "product");

const canvasWith = () => {
  const base = canvasEntry();
  return canvasEntry({ items: base.items!.map((t, i) => (i === 0 ? { ...t, products: [ref(1), ref(2)] } : t)) });
};

describe("botones de producto nativos (paridad con product-actions.ts)", () => {
  it("Canvas: product_viewed una vez por producto con itemId y componentId fijo; sin productos no pinta nada", () => {
    const events: WidgetEvent[] = [];
    renderWithProvider(<CanvasView entry={canvasWith()} onEvent={(e) => events.push(e)} />);
    expect(screen.getAllByTestId(/^cs-wp-row-/)).toHaveLength(2);
    expect(screen.queryByTestId("cs-wp-t2")).toBeNull();
    expect(products(events).map((e) => [e.name, e.product.external_id, e.itemId, e.componentId])).toEqual([
      ["product_viewed", "p1", "t1", "canvas"],
      ["product_viewed", "p2", "t1", "canvas"],
    ]);
  });

  it("add_to_cart: cantidad 1, gancho con {storyId, slideId, componentId}, «Añadido» y un doble toque es UNA intención (1,2 s)", async () => {
    vi.useFakeTimers();
    const events: WidgetEvent[] = [];
    const onAddToCart = vi.fn();
    renderWithProvider(<CanvasView entry={canvasWith()} onEvent={(e) => events.push(e)} />, { onAddToCart });
    const add = screen.getByTestId("cs-wp-add-p1");
    expect(attr(add, "aria-label")).toBe("Añadir al carrito: p1");
    fireEvent.click(add);
    fireEvent.click(add);
    expect(products(events).filter((e) => e.name === "add_to_cart")).toEqual([
      { widgetId: "canvas", type: "product", name: "add_to_cart", product: ref(1), quantity: 1, itemId: "t1", componentId: "canvas" },
    ]);
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart).toHaveBeenCalledWith(ref(1), 1, { storyId: "canvas", slideId: "t1", componentId: "canvas" });
    expect(screen.getByTestId("cs-wp-add-p1").textContent).toBe("Añadido");
    expect(attr(screen.getByTestId("cs-wp-add-p1"), "aria-label")).toBe("Añadir al carrito: p1. Añadido");
    await act(async () => void vi.advanceTimersByTime(1250));
    expect(screen.getByTestId("cs-wp-add-p1").textContent).toBe("Añadir al carrito");
    fireEvent.click(screen.getByTestId("cs-wp-add-p1"));
    expect(products(events).filter((e) => e.name === "add_to_cart")).toHaveLength(2);
  });

  it("guardar: una sola vez por producto y queda «Guardado»; usa el título de resolveProducts", async () => {
    const events: WidgetEvent[] = [];
    const onWishlist = vi.fn();
    const resolveProducts = vi.fn(async (refs: { external_id: string }[]) => refs.map((r) => ({ ref: ref(Number(r.external_id.slice(1))), title: `Gorra ${r.external_id}`, available: true })));
    renderWithProvider(<CanvasView entry={canvasWith()} onEvent={(e) => events.push(e)} />, { onWishlist, resolveProducts });
    await flush();
    const save = screen.getByTestId("cs-wp-save-p1");
    expect(attr(save, "aria-label")).toBe("Guardar: Gorra p1");
    fireEvent.click(save);
    fireEvent.click(save);
    expect(products(events).filter((e) => e.name === "wishlist_added")).toHaveLength(1);
    expect(onWishlist).toHaveBeenCalledTimes(1);
    expect(onWishlist).toHaveBeenCalledWith(ref(1), { storyId: "canvas", slideId: "t1", componentId: "canvas" });
    expect(screen.getByTestId("cs-wp-save-p1").textContent).toBe("Guardado");
    expect(screen.getByTestId("cs-wp-save-p2").textContent).toBe("Guardar");
  });

  it("Inline: botones dentro de la tarjeta con componentId inline y sin abrir la acción de la tarjeta", () => {
    const events: WidgetEvent[] = [];
    const base = inlineEntry({ type: "screen_top" } as never);
    const entry = { ...base, items: base.items!.map((c) => ({ ...c, products: [ref(3)] })) };
    renderWithProvider(<InlineView entry={entry} onEvent={(e) => events.push(e)} />);
    fireEvent.click(screen.getByTestId("cs-wp-add-p3"));
    expect(products(events).map((e) => [e.name, e.itemId, e.componentId])).toEqual([
      ["product_viewed", "c1", "inline"],
      ["add_to_cart", "c1", "inline"],
    ]);
    expect(events.some((e) => e.type === "click")).toBe(false);
  });

  it("Video Feed: los botones viven en el visor y product_viewed cuenta al ver el vídeo, sin repetirse al reabrir", async () => {
    const events: WidgetEvent[] = [];
    const items = [video(1, { products: [ref(7)] }), video(2)];
    renderWithProvider(<VideoFeedView entry={feedEntry(items)} onEvent={(e) => events.push(e)} />);
    expect(products(events)).toHaveLength(0);
    fireEvent.click(screen.getByTestId("cs-feed-card-v1"));
    await flush();
    expect(products(events).map((e) => [e.name, e.itemId, e.componentId])).toEqual([["product_viewed", "v1", "feed"]]);
    fireEvent.click(screen.getByTestId("cs-wp-add-p7"));
    expect(products(events).at(-1)).toMatchObject({ name: "add_to_cart", quantity: 1, itemId: "v1", componentId: "feed" });
    fireEvent.click(screen.getByTestId("cs-feed-close"));
    await flush();
    fireEvent.click(screen.getByTestId("cs-feed-card-v1"));
    await flush();
    expect(products(events).filter((e) => e.name === "product_viewed")).toHaveLength(1);
  });
});
