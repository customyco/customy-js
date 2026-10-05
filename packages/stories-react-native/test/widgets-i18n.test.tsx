import { readFileSync } from "node:fs";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resolveWidgetMessages as webWidgetMessages } from "../../stories-render/src/widgets/messages";
import { CanvasView, resolveWidgetMessages } from "../src/widgets";
import { FEED_MESSAGE_KEYS, resolveFeedMessages } from "../src/widgets/messages";
import { renderWithProvider } from "./harness";
import { canvasEntry, ref } from "./widget-fixtures";

const slots = (v: string): string[] => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe("textos de los widgets nativos: es / en / pt-BR", () => {
  it("mismas claves y mismos huecos {x} en los tres idiomas, y las mismas claves que el renderer web", () => {
    const en = resolveWidgetMessages("en") as unknown as Record<string, string>;
    expect(Object.keys(webWidgetMessages("en")).sort()).toEqual(Object.keys(en).sort());
    for (const l of ["es", "pt", "pt-BR", "pt_BR"]) {
      const m = resolveWidgetMessages(l) as unknown as Record<string, string>;
      expect(Object.keys(m).sort()).toEqual(Object.keys(en).sort());
      for (const k of Object.keys(en)) expect(slots(m[k]!), `${l}.${k}`).toEqual(slots(en[k]!));
    }
  });

  it("pt-BR está traducido y es el mismo texto de producto que el web; el resto de idiomas cae en inglés", () => {
    const pt = resolveWidgetMessages("pt-BR");
    const web = webWidgetMessages("pt-BR");
    for (const k of ["productsLabel", "addToCart", "addedToCart", "addToCartOf", "save", "saved", "saveOf", "dismiss", "checklist", "tour", "inline"] as const) expect(pt[k], k).toBe(web[k]);
    expect(pt.dismiss).toBe("Dispensar");
    expect(resolveWidgetMessages("fr").dismiss).toBe("Dismiss");
  });

  it("Canvas en pt-BR pinta los botones de producto en portugués", () => {
    const base = canvasEntry();
    const entry = canvasEntry({ items: base.items!.map((t, i) => (i === 0 ? { ...t, products: [ref(1)] } : t)) });
    renderWithProvider(<CanvasView entry={entry} />, { locale: "pt-BR" });
    expect(screen.getByTestId("cs-wp-add-p1").textContent).toBe("Adicionar ao carrinho");
    expect(screen.getByTestId("cs-wp-save-p1").textContent).toBe("Salvar");
  });

  it("el Video Feed carga solo sus textos y los de producto, y su código no lee otros", () => {
    const all = Object.keys(resolveWidgetMessages("en"));
    for (const l of ["en", "es", "pt-BR"]) {
      const got = resolveFeedMessages(l) as unknown as Record<string, string>;
      expect(Object.keys(got).sort()).toEqual([...FEED_MESSAGE_KEYS].sort());
      for (const k of FEED_MESSAGE_KEYS) expect(got[k]).toBe((resolveWidgetMessages(l) as unknown as Record<string, string>)[k]);
    }
    const src = ["../src/video-feed/index.tsx", "../src/widgets/product-actions.tsx"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    const used = [...new Set([...src.matchAll(/\bm\.(\w+)/g)].map((x) => x[1]!))].filter((k) => all.includes(k));
    expect(used.filter((k) => !FEED_MESSAGE_KEYS.includes(k))).toEqual([]);
  });
});
