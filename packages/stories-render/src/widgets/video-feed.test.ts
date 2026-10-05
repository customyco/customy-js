// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeliveredVideoFeed, VideoFeedItem } from "../types";
import type { WidgetEvent } from "./common";
import { mountVideoFeed, toPlayerSource, visibleFeedItems, type FeedPlayer } from "./video-feed";

const wire = (n: number) => ({ hls: `https://cdn.example.com/${n}.m3u8`, mp4: `https://cdn.example.com/${n}.mp4`, poster: `https://cdn.example.com/${n}.jpg`, captions: [], duration_ms: 8000 });
const video = (n: number, over: Partial<VideoFeedItem> = {}): VideoFeedItem => ({ type: "video", id: `v${n}`, title: `Vídeo ${n}`, alt: `Alt ${n}`, video: wire(n), ctas: [], share: { enabled: true, url: `https://example.com/v${n}` }, archived: false, ...over }) as VideoFeedItem;
const entry = (items: VideoFeedItem[], config: Partial<DeliveredVideoFeed["config"]> = {}): DeliveredVideoFeed => ({
  id: "feed", priority: 50, control: false, items,
  config: { layout: "carousel", aspect: "9:16", columns: 2, corner_radius: 12, show_title: true, autoplay: { enabled: true, mode: "visible", pausable: true, muted: true }, preload: { before: 1, after: 1 }, share: { enabled: true }, ...config },
});

afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

function setup(e: DeliveredVideoFeed, extra: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const events: WidgetEvent[] = [];
  const players: Array<FeedPlayer & { id: string; destroyed: boolean; played: number; paused: number }> = [];
  const createPlayer = vi.fn((c: HTMLElement, source: { poster: string }) => {
    const p = { id: source.poster, destroyed: false, played: 0, paused: 0, play: async () => (p.played++, "playing" as const), pause: () => void p.paused++, setMuted: vi.fn(), destroy: () => void (p.destroyed = true) };
    c.append(document.createElement("video"));
    players.push(p);
    return p;
  });
  const warmed: Array<{ poster: string; signal: AbortSignal }> = [];
  const warm = vi.fn(async (s: { poster: string }, signal: AbortSignal) => void warmed.push({ poster: s.poster, signal }));
  const h = mountVideoFeed(host, { entry: e, onEvent: (ev) => events.push(ev), createPlayer: createPlayer as never, warm: warm as never, locale: "es", reducedMotion: false, ...extra });
  return { host, events, h, players, createPlayer, warmed };
}

describe("visibleFeedItems y toPlayerSource", () => {
  it("quita archivados y fuera de programación, y aplica el tope", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    const list = [video(1), video(2, { archived: true }), video(3, { schedule: { start_at: "2026-10-03T00:00:00Z" } }), video(4, { schedule: { end_at: "2026-10-01T00:00:00Z" } }), video(5, { schedule: { start_at: "2026-10-01T00:00:00Z", end_at: "2026-10-09T00:00:00Z" } }), video(6)];
    expect(visibleFeedItems(list, now).map((i) => i.id)).toEqual(["v1", "v5", "v6"]);
    expect(visibleFeedItems(list, now, 2).map((i) => i.id)).toEqual(["v1", "v5"]);
  });
  it("duration_ms pasa a durationMs", () => {
    expect(toPlayerSource(wire(1), "x")).toMatchObject({ durationMs: 8000, alt: "x", hls: "https://cdn.example.com/1.m3u8" });
  });
});

describe("tarjetas", () => {
  it("una por elemento visible, con etiqueta accesible, título y atributos de layout; abre el visor", () => {
    const { host, events, h } = setup(entry([video(1), video(2), video(3, { archived: true })], { layout: "grid" }));
    const cards = host.querySelectorAll<HTMLElement>(".cs-vf__card");
    expect(cards).toHaveLength(2);
    expect(host.querySelector("section")!.getAttribute("data-layout")).toBe("grid");
    expect(cards[0]!.getAttribute("aria-label")).toBe("Ver vídeo: Vídeo 1");
    expect(cards[0]!.querySelector(".cs-vf__caption")!.textContent).toBe("Vídeo 1");
    expect(events).toContainEqual({ widgetId: "feed", type: "impression" });
    cards[1]!.click();
    expect(h.current).toBe(1);
    expect(document.querySelector("dialog")).not.toBeNull();
    expect(events).toContainEqual({ widgetId: "feed", type: "click", elementId: "widget.feed.v2", itemId: "v2" });
    expect(events).toContainEqual({ widgetId: "feed", type: "view", itemId: "v2" });
  });
});

describe("visor: ventana de precarga", () => {
  it("solo el actual monta reproductor; los vecinos se calientan y al salir de la ventana se cancelan", () => {
    const items = [1, 2, 3, 4, 5].map((n) => video(n));
    const { h, players, warmed } = setup(entry(items));
    h.open(2);
    expect(players.map((p) => p.id)).toEqual(["https://cdn.example.com/3.jpg"]);
    expect(warmed.map((w) => w.poster).sort()).toEqual(["https://cdn.example.com/2.jpg", "https://cdn.example.com/4.jpg"]);
    document.querySelector<HTMLElement>(".cs-vf__next")!.click();
    expect(h.current).toBe(3);
    expect(players[0]!.destroyed).toBe(true);
    expect(players.at(-1)!.id).toBe("https://cdn.example.com/4.jpg");
    const two = warmed.find((w) => w.poster.endsWith("/2.jpg"))!;
    expect(two.signal.aborted).toBe(true);
    expect(warmed.find((w) => w.poster.endsWith("/4.jpg"))!.signal.aborted).toBe(false);
    expect(warmed.some((w) => w.poster.endsWith("/5.jpg"))).toBe(true);
  });

  it("anterior/siguiente por botón y teclado emiten next/prev con su vía; los extremos no se pasan", () => {
    const { h, events } = setup(entry([video(1), video(2), video(3)]));
    h.open(0);
    const d = document.querySelector("dialog")!;
    document.querySelector<HTMLElement>(".cs-vf__next")!.click();
    d.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    d.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(h.current).toBe(2);
    d.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(events.filter((e) => e.type === "next" || e.type === "prev").map((e) => `${e.type}:${(e as { via: string }).via}`)).toEqual(["next:tap", "next:keyboard", "prev:keyboard"]);
  });
});

describe("autoplay y accesibilidad de movimiento", () => {
  it("con autoplay reproduce, el botón de pausa pausa y reanuda (etiqueta y playback)", () => {
    const { h, players, events } = setup(entry([video(1)]));
    h.open(0);
    const btn = document.querySelector<HTMLButtonElement>(".cs-vf__pause")!;
    expect(players[0]!.played).toBe(1);
    expect(btn.getAttribute("aria-label")).toBe("Pausar");
    btn.click();
    expect(players[0]!.paused).toBe(1);
    expect(btn.getAttribute("aria-label")).toBe("Reproducir");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    btn.click();
    expect(players[0]!.played).toBe(2);
    expect(events.filter((e) => e.type === "playback").map((e) => (e as { action: string }).action)).toEqual(["play", "pause", "play"]);
  });

  it("reduce motion o modo tap: no arranca solo; el botón visible lo inicia", () => {
    for (const extra of [{ reducedMotion: true }, {}]) {
      document.body.innerHTML = "";
      const e = "reducedMotion" in extra ? entry([video(1)]) : entry([video(1)], { autoplay: { enabled: true, mode: "tap", pausable: true, muted: true } });
      const { h, players } = setup(e, extra);
      h.open(0);
      expect(players[0]!.played).toBe(0);
      const btn = document.querySelector<HTMLButtonElement>(".cs-vf__pause")!;
      expect(btn.getAttribute("aria-label")).toBe("Reproducir");
      btn.click();
      expect(players[0]!.played).toBe(1);
    }
  });

  it("silenciar alterna y avisa al reproductor", () => {
    const { h, events } = setup(entry([video(1)]));
    h.open(0);
    const mute = document.querySelector<HTMLButtonElement>(".cs-vf__mute")!;
    expect(mute.getAttribute("aria-label")).toBe("Activar sonido");
    mute.click();
    expect(mute.getAttribute("aria-label")).toBe("Silenciar");
    expect(events.some((e) => e.type === "playback" && e.action === "unmute")).toBe(true);
  });

  it("carpeta de imágenes: pase de diapositivas solo con autoplay y se detiene en pausa", () => {
    vi.useFakeTimers();
    const item: VideoFeedItem = { type: "images", id: "folder", alt: "", images: [{ url: "https://cdn.example.com/a.jpg", alt: "A" }, { url: "https://cdn.example.com/b.jpg", alt: "B" }], slide_ms: 1000, ctas: [], share: { enabled: false }, archived: false } as VideoFeedItem;
    const { h } = setup(entry([item]));
    h.open(0);
    const imgs = () => Array.from(document.querySelectorAll<HTMLImageElement>(".cs-vf__img")).map((i) => i.hidden);
    expect(imgs()).toEqual([false, true]);
    vi.advanceTimersByTime(1100);
    expect(imgs()).toEqual([true, false]);
    document.querySelector<HTMLButtonElement>(".cs-vf__pause")!.click();
    vi.advanceTimersByTime(3000);
    expect(imgs()).toEqual([true, false]);
  });
});

describe("repost, CTAs y compartir", () => {
  const repost = (mode: "repost" | "background" = "repost"): VideoFeedItem => ({ type: "repost", id: "r1", network: "tiktok", url: "https://vm.tiktok.com/Z/", poster: { url: "https://cdn.example.com/p.jpg", alt: "Post" }, mode, rights_confirmed: true, ctas: [{ id: "c1", label: "Comprar", action: { type: "url", url: "https://example.com/shop" }, element_id: "feed.shop" }], share: { enabled: false }, archived: false, ...(mode === "background" ? { media: wire(9) } : {}) }) as VideoFeedItem;

  it("repost redirige a la red con rel noopener; la CTA abre su acción; ambos emiten click", () => {
    const openLink = vi.fn();
    const { h, events } = setup(entry([repost()]), { openLink });
    h.open(0);
    const net = document.querySelector<HTMLAnchorElement>(".cs-vf__repost")!;
    expect(net.textContent).toBe("Ver en TikTok");
    expect(net.href).toBe("https://vm.tiktok.com/Z/");
    expect(net.rel).toBe("noopener noreferrer");
    net.click();
    expect(openLink).toHaveBeenCalledWith({ type: "url", url: "https://vm.tiktok.com/Z/" }, { widgetId: "feed", elementId: "widget.feed.r1.repost", itemId: "r1" });
    const ctas = document.querySelectorAll<HTMLElement>(".cs-vf__ctas .cs-widget__cta");
    ctas[1]!.click();
    expect(events).toContainEqual({ widgetId: "feed", type: "click", elementId: "feed.shop", itemId: "r1" });
    expect(document.querySelector<HTMLElement>(".cs-vf__share")!.hidden).toBe(true);
  });

  it("repost como fondo reproduce el medio aportado", () => {
    const { h, players } = setup(entry([repost("background")]));
    h.open(0);
    expect(players).toHaveLength(1);
  });

  it("compartir: hook propio, o copia el enlace y lo anuncia; sin éxito no se emite share", async () => {
    const onShare = vi.fn();
    const a = setup(entry([video(1)]), { onShare });
    a.h.open(0);
    document.querySelector<HTMLElement>(".cs-vf__share")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onShare).toHaveBeenCalledWith({ url: "https://example.com/v1", title: "Vídeo 1", itemId: "v1" });
    expect(a.events).toContainEqual({ widgetId: "feed", type: "share", itemId: "v1", target: "app" });
    a.h.destroy();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    const b = setup(entry([video(1)]));
    b.h.open(0);
    document.querySelector<HTMLElement>(".cs-vf__share")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith("https://example.com/v1");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Enlace copiado");
    expect(b.events.some((e) => e.type === "share" && e.target === "clipboard")).toBe(true);
  });

  it("share desactivado en la configuración: sin botón", () => {
    const { h } = setup(entry([video(1)], { share: { enabled: false } }));
    h.open(0);
    expect(document.querySelector(".cs-vf__share")).toBeNull();
  });
});

describe("cierre", () => {
  it("cerrar libera reproductores, cancela la precarga, emite watch_length y devuelve el foco a la tarjeta", () => {
    vi.useFakeTimers();
    const { host, h, players, warmed, events } = setup(entry([video(1), video(2)]));
    const card = host.querySelector<HTMLElement>(".cs-vf__card")!;
    card.focus();
    h.open(0);
    vi.advanceTimersByTime(2500);
    h.close();
    expect(document.querySelector("dialog")).toBeNull();
    expect(players.every((p) => p.destroyed)).toBe(true);
    expect(warmed.every((w) => w.signal.aborted)).toBe(true);
    expect(events.find((e) => e.type === "watch_length")).toMatchObject({ itemId: "v1", ms: 2500 });
    expect(document.activeElement).toBe(card);
    expect(h.current).toBeNull();
  });

  it("con dialog nativo usa showModal y el evento close limpia", () => {
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    proto.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
    const { h } = setup(entry([video(1)]));
    h.open(0);
    expect(document.querySelector("dialog")!.hasAttribute("open")).toBe(true);
    h.close();
    expect(document.querySelector("dialog")).toBeNull();
    delete proto.showModal;
    delete proto.close;
  });

  it("sin createPlayer: vídeo con MP4 usa <video> nativo; sin elementos no se abre", () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const host = document.createElement("div");
    const h = mountVideoFeed(host, { entry: entry([video(1)]), reducedMotion: true });
    h.open(0);
    expect(document.querySelector("video.cs-vf__native")).not.toBeNull();
    h.destroy();
    const empty = mountVideoFeed(document.createElement("div"), { entry: entry([]) });
    empty.open(0);
    expect(document.querySelector("dialog")).toBeNull();
  });
});
