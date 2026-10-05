import type { BannerSlide, DeliveredBanner, StoryGroup, StoryPage } from "@customyai/stories-render";

/** Fixtures mínimas con la forma que entrega `GET /client/placements/:id` (valores por defecto ya aplicados). */
export const textLayer = (id: string, over: Record<string, unknown> = {}) => ({
  type: "text" as const,
  id,
  x: 0.1,
  y: 0.4,
  w: 0.8,
  h: 0.1,
  rotation: 0,
  opacity: 1,
  z: 0,
  animations: [],
  decorative: false,
  text: "Hola",
  font_size: 0.04,
  weight: "regular" as const,
  align: "start" as const,
  ...over,
});

export const buttonComponent = (id: string, over: Record<string, unknown> = {}) => ({
  type: "button" as const,
  id,
  x: 0.1,
  y: 0.75,
  w: 0.8,
  h: 0.06,
  z: 0,
  collects: [],
  consent_purpose: "none",
  style: "button" as const,
  label: "Comprar",
  action: { type: "url" as const, url: "https://shop.example.com/p/1" },
  element_id: "cta.buy",
  ...over,
});

export function page(id: string, over: Partial<StoryPage> = {}): StoryPage {
  return {
    id,
    background: { type: "image", url: `https://cdn.test/${id}.jpg`, fit: "fill", decorative: false, alt: `fondo ${id}` },
    canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: [], components: [] },
    ...over,
  };
}

export function group(id: string, pageIds: string[] = ["p1", "p2"], over: Partial<StoryGroup> = {}): StoryGroup {
  return {
    id,
    title: `Grupo ${id}`,
    cover: { url: `https://cdn.test/${id}-cover.jpg`, alt: `Portada ${id}` },
    mode: "normal",
    pinned: false,
    order: 0,
    live: false,
    control: false,
    reeligibility_cooldown_hours: 0,
    pages: pageIds.map((p) => page(p)),
    ...over,
  };
}

export function banner(id: string, slideIds: string[] = ["s1", "s2", "s3"], over: Partial<DeliveredBanner> = {}): DeliveredBanner {
  const slides: BannerSlide[] = slideIds.map((s) => ({ id: s, image: { url: `https://cdn.test/${s}.jpg`, alt: `Imagen ${s}` }, action: { type: "url", url: "https://example.com/x" } }));
  return {
    id,
    name: `Banner ${id}`,
    priority: 50,
    control: false,
    slides,
    style: {
      aspect: "16:9",
      corner_radius: 12,
      progress: "dots",
      autoplay: { enabled: true, interval_ms: 5000, pausable: true },
      carousel: true,
      dismissible: true,
      auto_close_ms: null,
    },
    ...over,
  };
}
