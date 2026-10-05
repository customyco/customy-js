import type { BannerSlide, DeliveredBanner, StoryGroup, StoryPage } from "./types";

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

import type { PlacementResponse } from "./types";

/** Respuesta de placement con 2 grupos (+1 de control) y 2 banners (+1 de control). */
export function placementResponse(over: Partial<PlacementResponse> = {}): PlacementResponse {
  return {
    placement_id: "home_top",
    etag: 'W/"v1"',
    ttl: 60,
    min_sdk: null,
    kill: { placement: false, story: false, banner: false },
    widgets: [
      {
        kind: "story_bar",
        style: { variant: "classic", cover_shape: "circle", size: "medium", ring: { enabled: true }, order: "manual", pinned_first: true, show_title: true, live_badge: { enabled: true, label: "LIVE" } },
        items: [group("g1", ["p1", "p2"], { order: 1 }), group("g2", ["p1"], { order: 0, pinned: true }), group("gc", [], { control: true, pages: undefined })],
      },
      { kind: "banner", items: [banner("b1", ["s1"], { priority: 10 }), banner("b2", ["s1", "s2"], { priority: 90 }), banner("bc", ["s1"], { control: true, slides: undefined })] },
    ],
    ...over,
  };
}

export type FakeCall = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/** Transporte simulado: responde lo que se le encola y guarda las llamadas. */
export function fakeFetch(responses: (Response | Error | ((call: FakeCall) => Response))[]) {
  const calls: FakeCall[] = [];
  const queue = [...responses];
  const fn = (async (url: unknown, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const call: FakeCall = { url: String(url), method: init?.method ?? "GET", headers, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    calls.push(call);
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next.clone();
  }) as typeof fetch;
  return { fn, calls };
}

export const json = (body: unknown, init: ResponseInit = {}): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) }, ...init });
