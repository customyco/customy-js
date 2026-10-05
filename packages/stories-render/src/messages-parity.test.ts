import { describe, expect, it } from "vitest";
import canvasSrc from "./widgets/canvas.ts?raw";
import inlineSrc from "./widgets/inline.ts?raw";
import feedSrc from "./widgets/video-feed.ts?raw";
import swipeSrc from "./widgets/swipe-cards.ts?raw";
import checklistSrc from "./widgets/checklist.ts?raw";
import tourSrc from "./widgets/tour.ts?raw";
import actionsSrc from "./widgets/product-actions.ts?raw";
import { resolveMessages } from "./messages";
import { messagesFor } from "./dom/components";
import { canvasMessages, checklistMessages, inlineMessages, resolveWidgetMessages, swipeCardsMessages, tourMessages, videoFeedMessages, WIDGET_MESSAGE_KEYS } from "./widgets/messages";
import { resolveGameMessages } from "./widgets/game-messages";
import { resolveLiveMessages } from "./widgets/live-messages";
import { resolveUgcMessages } from "./ugc/messages";
import { resolveAdMessages } from "./widgets/ads";

type Bundle = Record<string, unknown>;
const slots = (v: unknown): string[] => (typeof v === "string" ? [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort() : Object.entries(v as Bundle).flatMap(([k, x]) => slots(x).map((s) => `${k}.${s}`)));

/** es, en y pt-BR (también `pt`, `pt-BR`, `pt_PT`) traen las mismas claves y los mismos huecos `{x}`: un hueco perdido muestra «{n}» o una cadena vacía. */
const BUNDLES: Array<[string, (l: string) => Bundle]> = [
  ["núcleo", (l) => resolveMessages(l) as unknown as Bundle],
  ["widgets", (l) => resolveWidgetMessages(l) as unknown as Bundle],
  ["componentes", (l) => messagesFor(l) as unknown as Bundle],
  ["juego", (l) => resolveGameMessages(l) as unknown as Bundle],
  ["live", (l) => resolveLiveMessages(l) as unknown as Bundle],
  ["comunidad", (l) => resolveUgcMessages(l) as unknown as Bundle],
  ["anuncios", (l) => resolveAdMessages(l) as unknown as Bundle],
];

describe("textos del renderer: es / en / pt-BR", () => {
  for (const [name, resolve] of BUNDLES) {
    it(`${name}: pt trae todas las claves y los mismos huecos que en`, () => {
      const en = resolve("en");
      const pt = resolve("pt-BR");
      expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
      for (const k of Object.keys(en)) {
        expect(slots(pt[k]), `${name}.${k}`).toEqual(slots(en[k]));
        expect(slots(resolve("es")[k]), `${name}.es.${k}`).toEqual(slots(en[k]));
      }
    });
    it(`${name}: pt está traducido (no cae en inglés) y las variantes de región resuelven igual`, () => {
      const en = resolve("en");
      const pt = resolve("pt");
      const same = Object.keys(en).filter((k) => JSON.stringify(en[k]) === JSON.stringify(pt[k]));
      // Pocas palabras idénticas a propósito («Tour», «{title}», «{n} de {total}» no cuenta: difiere solo en inglés).
      expect(same.length, `${name} idénticas: ${same.join(", ")}`).toBeLessThan(Math.max(6, Object.keys(en).length * 0.25));
      expect(resolve("pt_BR")).toEqual(pt);
      expect(resolve("PT-br")).toEqual(pt);
    });
  }

  it("un idioma sin traducción cae en inglés y un texto puesto por la app gana", () => {
    expect(resolveMessages("fr").close).toBe("Close");
    expect(resolveMessages("pt-BR", { close: "X" }).close).toBe("X");
    expect(resolveMessages("pt-BR").close).toBe("Fechar");
    expect(resolveWidgetMessages("pt-BR").addToCart).toBe("Adicionar ao carrinho");
    expect(messagesFor("pt-BR").soldOut).toBe("Esgotado");
  });

  it("cada widget carga solo sus textos y su código no lee ninguno que no lleve", () => {
    const used = (...sources: string[]): string[] => [...new Set(sources.flatMap((src) => [...src.matchAll(/\bm\.(\w+)/g)].map((x) => x[1]!)))];
    const loaders = { canvas: canvasMessages, inline: inlineMessages, video_feed: videoFeedMessages, swipe_cards: swipeCardsMessages, checklist: checklistMessages, tour: tourMessages } as const;
    const files = { canvas: [canvasSrc, actionsSrc], inline: [inlineSrc, actionsSrc], video_feed: [feedSrc, actionsSrc], swipe_cards: [swipeSrc], checklist: [checklistSrc], tour: [tourSrc] } as const;
    const all = Object.keys(resolveWidgetMessages("en"));
    for (const kind of Object.keys(loaders) as Array<keyof typeof loaders>) {
      for (const l of ["en", "es", "pt-BR"]) {
        const got = loaders[kind](l) as unknown as Record<string, string>;
        expect(Object.keys(got).sort(), `${kind} ${l}`).toEqual([...WIDGET_MESSAGE_KEYS[kind]].sort());
        expect(got).toEqual(Object.fromEntries(WIDGET_MESSAGE_KEYS[kind].map((k) => [k, (resolveWidgetMessages(l) as unknown as Record<string, string>)[k]])));
      }
      const missing = used(...files[kind]).filter((k) => all.includes(k) && !WIDGET_MESSAGE_KEYS[kind].includes(k as never));
      expect(missing, `${kind} lee textos que no carga`).toEqual([]);
    }
    expect(loaders.canvas("en", { dismiss: "X" } as never)).toMatchObject({ dismiss: "X" });
  });
});
