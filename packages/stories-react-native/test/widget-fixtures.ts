import type { ChecklistEntry, ChecklistItem, DeliveredCanvas, DeliveredChecklist, DeliveredInline, DeliveredSwipeCards, DeliveredVideoFeed, DeliveredGame, DeliveredWidget, GameConfig, PlacementResponse, ProductRef, TourStep, VideoFeedItem } from "@customyai/stories-render";
import { fakeFetch, json, placementResponse } from "../../stories-render/src/test-fixtures";
import { makeClient } from "./harness";

/** Fixtures mínimas con la forma que entrega `GET /client/placements/:id` para los widgets (valores por defecto ya aplicados). */
export const ref = (n: number): ProductRef => ({ connector: "commerce", external_id: `p${n}` });

export const swipeEntry = (n: number, over: Partial<DeliveredSwipeCards["config"]> = {}, rest: Partial<DeliveredSwipeCards> = {}): DeliveredSwipeCards => ({
  id: "cards",
  priority: 50,
  control: false,
  items: Array.from({ length: n }, (_, i) => ({ product: ref(i + 1), headline: `Producto ${i + 1}` })),
  config: {
    layout: "stack",
    aspect: "3:4",
    corner_radius: 16,
    show_price: true,
    remember_swipes: true,
    swipe_right: "wishlist",
    buttons: true,
    feedback: { like: { icon: "heart", label: "Me gusta" }, nope: { icon: "x", label: "No me interesa" }, show_stamps: true },
    end: { title: "Fin", message: "Vuelve pronto", show_liked: true },
    ...over,
  },
  ...rest,
});

export const canvasEntry = (over: Partial<DeliveredCanvas> = {}): DeliveredCanvas => ({
  id: "canvas",
  priority: 50,
  control: false,
  config: { columns: 2, gap: 8, padding: 8, corner_radius: 8, background: {}, title: "Novedades" },
  items: [
    { id: "t1", image: { url: "https://cdn.test/a.jpg", alt: "Zapatillas rojas", width: 100, height: 200 }, title: "Zapatillas", action: { type: "url", url: "https://shop.example.com/a" } },
    { id: "t2", image: { url: "https://cdn.test/b.jpg", alt: "Gorra azul", width: 100, height: 100 }, action: { type: "deep_link", uri: "myapp://gorra" }, element_id: "canvas.gorra" },
    { id: "t3", image: { url: "https://cdn.test/c.jpg", alt: "Bolso", width: 100, height: 150 }, action: { type: "url", url: "https://shop.example.com/c" } },
  ],
  ...over,
});

export const item = (id: string, complete_on: ChecklistItem["complete_on"] = { type: "click" }, over: Partial<ChecklistItem> = {}): ChecklistItem => ({ type: "item", id, title: `Paso ${id}`, complete_on, ...over });
export const checklistEntry = (items: ChecklistEntry[], over: Partial<DeliveredChecklist["config"]> = {}, rest: Partial<DeliveredChecklist> = {}): DeliveredChecklist => ({
  id: "start",
  priority: 50,
  control: false,
  items,
  config: { mode: "checklist", title: "Empieza", ordered: false, dismissible: true, dismiss_confirm: true, progress: "bar", tour: { presentation: "tooltip", skippable: true }, ...over },
  ...rest,
});
export const step = (id: string, anchor: string, over: Partial<TourStep> = {}): TourStep => ({ type: "step", id, title: `Título ${id}`, body: `Cuerpo ${id}`, anchor, placement: "auto", next_on: "button", ...over });
export const tourEntry = (steps: TourStep[], over: Partial<DeliveredChecklist["config"]> = {}): DeliveredChecklist => checklistEntry(steps, { mode: "tour", title: "Recorrido", ...over });

export const inlineEntry = (anchor: DeliveredInline["config"]["anchor"], over: Partial<DeliveredInline> = {}, cfg: Partial<DeliveredInline["config"]> = {}): DeliveredInline => ({
  id: "promo",
  priority: 50,
  control: false,
  config: { anchor, aspect: "16:9", corner_radius: 12, dismissible: true, ...cfg },
  items: [{ id: "c1", title: "Oferta", body: "Solo hoy", image: { url: "https://cdn.test/o.jpg", alt: "Oferta de hoy" }, cta: { label: "Ver", action: { type: "url", url: "https://shop.example.com/o" }, element_id: "inline.ver" } }],
  ...over,
});

const wire = (n: number) => ({ hls: `https://cdn.test/${n}.m3u8`, mp4: `https://cdn.test/${n}.mp4`, poster: `https://cdn.test/${n}.jpg`, captions: [], duration_ms: 8000 });
export const video = (n: number, over: Record<string, unknown> = {}): VideoFeedItem => ({ type: "video", id: `v${n}`, title: `Vídeo ${n}`, alt: `Alt ${n}`, video: wire(n), ctas: [], share: { enabled: true, url: `https://example.com/v${n}` }, archived: false, ...over }) as VideoFeedItem;
export const feedEntry = (items: VideoFeedItem[], config: Partial<DeliveredVideoFeed["config"]> = {}): DeliveredVideoFeed => ({
  id: "feed",
  priority: 50,
  control: false,
  items,
  config: { layout: "carousel", aspect: "9:16", columns: 2, corner_radius: 12, show_title: true, autoplay: { enabled: true, mode: "visible", pausable: true, muted: true }, preload: { before: 1, after: 1 }, share: { enabled: true }, ...config },
});

export const gameConfig = (over: Partial<GameConfig> = {}): GameConfig => ({
  mechanic: "wheel",
  title: "Gira y gana",
  cta_label: "Jugar",
  copy: {},
  min_age: 0,
  identified: false,
  consent_purpose: "analytics",
  prizes: [
    { id: "nada", label: "Otra vez", kind: "nothing" },
    { id: "p10", label: "10 %", kind: "promo_code" },
    { id: "p20", label: "20 %", kind: "promo_code" },
  ],
  ...over,
});
export const gameEntry = (over: Partial<GameConfig> = {}): DeliveredGame => ({ id: "g1", priority: 50, control: false, config: gameConfig(over) });

export const widgetsPlacement = (widgets: DeliveredWidget[], over: Partial<PlacementResponse> = {}): PlacementResponse => placementResponse({ widgets, ...over });

/** Cliente con un transporte que responde el placement y acepta los eventos; `sent()` = los eventos enviados. */
export function widgetSetup(response: PlacementResponse, extra: Record<string, unknown> = {}) {
  const t = fakeFetch([(call) => (call.url.includes("/client/events") ? json({ accepted: true }) : json(response))]);
  const client = makeClient(t.fn, extra);
  const sent = (): Record<string, unknown>[] => t.calls.filter((c) => c.url.endsWith("/client/events")).flatMap((c) => (c.body as { events: Record<string, unknown>[] }).events);
  return { client, calls: t.calls, sent };
}
