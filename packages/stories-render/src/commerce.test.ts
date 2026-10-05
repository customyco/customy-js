import { describe, expect, it } from "vitest";
import { readStoryContext, storyCartAttributes } from "./commerce";

describe("contexto de historia en el carrito", () => {
  it("escribe los atributos que escribe el conector de Shopify (carrito sin guion bajo, línea oculta con _) y solo UTM válidas", () => {
    const out = storyCartAttributes({ storyId: "g1", slideId: "p2", componentId: "cart1" }, { utm_source: "customy_stories", utm_campaign: "otono", gclid: "x", utm_medium: "" });
    expect(out.cart).toEqual({ customy_story_id: "g1", customy_slide_id: "p2", customy_component_id: "cart1", utm_source: "customy_stories", utm_campaign: "otono" });
    expect(out.line).toEqual({ _customy_story_id: "g1", _customy_slide_id: "p2", _customy_component_id: "cart1" });
    expect(storyCartAttributes({ storyId: "g1" }).cart).toEqual({ customy_story_id: "g1" });
  });

  it("lo lee de vuelta desde el pedido (de carrito o de línea) y devuelve null sin historia", () => {
    const { cart, line } = storyCartAttributes({ storyId: "g1", slideId: "p2", componentId: "cart1" }, { utm_source: "s" });
    expect(readStoryContext(cart)).toEqual({ context: { storyId: "g1", slideId: "p2", componentId: "cart1" }, utm: { utm_source: "s" } });
    expect(readStoryContext(line)?.context.storyId).toBe("g1");
    expect(readStoryContext({ note: "hola", utm_source: "s" })).toBeNull();
  });
});
