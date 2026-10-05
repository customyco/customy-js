import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { CanvasView, masonryColumns } from "../src/widgets";
import { rn } from "./mocks/react-native";
import { attr, renderWithProvider } from "./harness";
import { canvasEntry } from "./widget-fixtures";
import type { WidgetEvent } from "../src/widgets";

const setup = (over = {}, props: Record<string, unknown> = {}) => {
  const events: WidgetEvent[] = [];
  const view = renderWithProvider(<CanvasView entry={canvasEntry(over)} onEvent={(e) => events.push(e)} />, props);
  return { events, ...view };
};

describe("Canvas nativo", () => {
  it("reparte en columnas con el mismo algoritmo masonry, título como cabecera y una pieza por ítem", () => {
    setup();
    expect(screen.getAllByTestId(/^cs-canvas-tile-/)).toHaveLength(3);
    const grid = screen.getByLabelText("Novedades", { selector: '[data-rn="View"]' });
    const actual = [...grid.children].map((col) => [...col.querySelectorAll('[data-testid^="cs-canvas-tile-"]')].map((t) => t.getAttribute("data-testid")!.replace("cs-canvas-tile-", "")));
    expect(actual).toEqual(masonryColumns(canvasEntry().items!, 2).map((c) => c.map((t) => t.id)));
    expect(actual[0]).toEqual(["t1"]); // la alta sola; las otras dos, juntas
    expect(screen.getByText("Novedades").getAttribute("data-role")).toBe("header");
  });

  it("alt obligatorio como etiqueta (con título, el título) y rol según la acción; ≥ 48 pt de alto mínimo", () => {
    setup();
    const t1 = screen.getByTestId("cs-canvas-tile-t1");
    expect(attr(t1, "aria-label")).toBe("Zapatillas");
    expect(attr(t1, "data-role")).toBe("link");
    const t2 = screen.getByTestId("cs-canvas-tile-t2");
    expect(attr(t2, "aria-label")).toBe("Gorra azul");
    expect(attr(t2, "data-role")).toBe("imagebutton");
    expect(JSON.parse(attr(t2, "data-style")!).minHeight).toBe(48);
  });

  it("clic: evento con el nombre del elemento (propio o `widget.<campaña>.<ítem>`), aviso `onActionClicked` y apertura", () => {
    const onActionClicked = vi.fn();
    const { events } = setup({}, { onActionClicked, allowedSchemes: ["myapp"] });
    fireEvent.click(screen.getByTestId("cs-canvas-tile-t1"));
    fireEvent.click(screen.getByTestId("cs-canvas-tile-t2"));
    const clicks = events.filter((e) => e.type === "click");
    expect(clicks).toEqual([
      { widgetId: "canvas", type: "click", elementId: "widget.canvas.t1", itemId: "t1" },
      { widgetId: "canvas", type: "click", elementId: "canvas.gorra", itemId: "t2" },
    ]);
    expect(onActionClicked).toHaveBeenCalledWith({ type: "url", url: "https://shop.example.com/a" }, expect.objectContaining({ surface: "widget", widgetId: "canvas", itemId: "t1", elementId: "widget.canvas.t1" }));
    expect(Linking.openURL).toHaveBeenCalledWith("https://shop.example.com/a");
    expect(Linking.openURL).toHaveBeenCalledWith("myapp://gorra");
  });

  it("CTA: clic con su nombre; la impresión se registra una vez al pintarse", () => {
    const { events } = setup({ config: { ...canvasEntry().config, cta: { label: "Ver todo", action: { type: "url", url: "https://shop.example.com" }, element_id: "canvas.cta" } } });
    expect(events.filter((e) => e.type === "impression")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("cs-canvas-cta"));
    expect(events.at(-1)).toEqual({ widgetId: "canvas", type: "click", elementId: "canvas.cta" });
  });

  it("variante: el evento lleva `variantId`; RTL espeja la dirección", () => {
    rn.setRTL(true);
    const events: WidgetEvent[] = [];
    renderWithProvider(<CanvasView entry={canvasEntry({ variant_id: "v2" })} onEvent={(e) => events.push(e)} />);
    expect(events[0]).toMatchObject({ variantId: "v2", type: "impression" });
    expect(JSON.parse(attr(screen.getByTestId("cs-canvas-canvas"), "data-style")!).direction).toBe("rtl");
  });

  it("un valor raro como color de fondo se ignora (token del tema)", () => {
    setup({ config: { ...canvasEntry().config, background: { color: "red; background:url(x)" } } });
    const style = JSON.parse(attr(screen.getByTestId("cs-canvas-canvas"), "data-style")!);
    expect(style.backgroundColor).not.toContain("url(");
  });
});
