import { systemClock, type TimerHandle } from "../clock";
import { safeHttpsUrl } from "../safe-url";
import { applyTheme } from "../dom/util";
import type { ComponentAction, DeliveredVideoFeed, VideoFeedItem, VideoSourceWire } from "../types";
import type { VideoPlayerEvent, VideoSource } from "../video/types";
import { planWindow } from "../video/preload";
import { defaultOpenLink, el, linkNode, onVisible, resolveUi, widgetElementId, widgetEmitter, widgetIcon, widgetRoot, type WidgetControllerBase, type WidgetHandle } from "./common";
import { renderProductActions, WIDGET_PRODUCT_COMPONENT_IDS, type WidgetProductHooks } from "./product-actions";
import { videoFeedMessages, fmt } from "./messages";

/**
 * Video Feed: tarjetas (carrusel o cuadrícula) que abren un visor vertical estilo TikTok en un `<dialog>` modal.
 * Contenido: vídeo (pipeline de `./video`), carpeta de imágenes (pase de diapositivas) y «repost» de una red
 * (Instagram, TikTok, YouTube, Drive, Dropbox) con el enlace o medio que el cliente aportó: se redirige a la red o
 * se usa como fondo; **este módulo nunca descarga ni raspa nada**. Precarga en ventana (`planWindow`: actual,
 * siguiente, anterior: solo la actual monta un reproductor; las vecinas se calientan con `warm`). Accesibilidad:
 * autoplay solo con movimiento permitido y botón de pausa SIEMPRE visible (WCAG 2.2.2), anterior/siguiente además
 * del scroll, Escape cierra, foco al visor y de vuelta a la tarjeta, textos accesibles en cada control.
 *
 * El reproductor y la precarga se INYECTAN (`createPlayer`, `warm`) para no pagar `./video` quien no lo use:
 *   import { createVideoPlayer, prefetchFirstSegment, detectCapabilities } from "@customyai/stories-render/video";
 *   mountVideoFeed(el, { entry, createPlayer: createVideoPlayer, warm: (s, sig) => prefetchFirstSegment(s, sig, { caps: detectCapabilities(window, false) }) });
 * Sin `createPlayer`, un vídeo con MP4 usa un `<video>` nativo simple; sin MP4, queda el póster.
 */

const NETWORKS: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", drive: "Google Drive", dropbox: "Dropbox" };

/** Los elementos que se pueden mostrar ahora: sin archivar, dentro de su programación y con el tope. */
export function visibleFeedItems(items: readonly VideoFeedItem[], now: number, max?: number): VideoFeedItem[] {
  const out = items.filter((i) => {
    if (i.archived) return false;
    if (i.schedule?.start_at && Date.parse(i.schedule.start_at) > now) return false;
    if (i.schedule?.end_at && Date.parse(i.schedule.end_at) <= now) return false;
    return true;
  });
  return max ? out.slice(0, max) : out;
}

/** El vídeo del cable (`duration_ms`) → el del reproductor de `./video` (`durationMs`). */
export function toPlayerSource(v: VideoSourceWire, alt?: string): VideoSource {
  return { ...(v.hls ? { hls: v.hls } : {}), ...(v.mp4 ? { mp4: v.mp4 } : {}), poster: v.poster, ...(v.blurhash ? { blurhash: v.blurhash } : {}), ...(v.width ? { width: v.width } : {}), ...(v.height ? { height: v.height } : {}), ...(v.duration_ms ? { durationMs: v.duration_ms } : {}), captions: v.captions, ...(alt ? { alt } : {}) };
}

/** Lo mínimo que se usa de `VideoPlayer` (compatible con `createVideoPlayer` de `./video`). */
export type FeedPlayer = { play(): Promise<"playing" | "blocked" | "error">; pause(): void; setMuted(m: boolean): void; destroy(): void };
export type FeedPlayerFactory = (container: HTMLElement, source: VideoSource, options: { doc?: Document; autoplay?: boolean; muted?: boolean; loop?: boolean; fit?: "fill" | "fit"; onEvent?: (e: VideoPlayerEvent) => void }) => FeedPlayer;

export type VideoFeedOptions = WidgetControllerBase & WidgetProductHooks & {
  entry: DeliveredVideoFeed;
  createPlayer?: FeedPlayerFactory;
  /** Calienta lo que el reproductor pedirá primero (vecinas de la ventana). Debe respetar `signal`. */
  warm?: (source: VideoSource, signal: AbortSignal) => Promise<unknown>;
  openLink?: (action: ComponentAction, ctx: { widgetId: string; itemId?: string; elementId: string }) => void;
  /** Compartir propio (por defecto `navigator.share` y, si no, copiar el enlace). */
  onShare?: (data: { url: string; title?: string; itemId: string }) => void | Promise<void>;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
};

export type VideoFeedHandle = WidgetHandle & { open(index?: number): void; close(): void; readonly current: number | null };

type Slide = { item: VideoFeedItem; el: HTMLElement; media: HTMLElement; player?: FeedPlayer; timer?: TimerHandle; frame: number };

export function mountVideoFeed(container: HTMLElement, options: VideoFeedOptions): VideoFeedHandle {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const clock = options.clock ?? systemClock;
  const m = videoFeedMessages(options.locale, options.messages);
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const productCleanup: Array<() => void> = [];
  const productViewed = new Set<string>();
  const items = visibleFeedItems(entry.items ?? [], clock.now(), cfg.max_items);
  const open = (a: ComponentAction, elementId: string, itemId?: string): void => (options.openLink ?? ((x) => defaultOpenLink(x, win, options.allowedSchemes)))(a, { widgetId: entry.id, elementId, ...(itemId ? { itemId } : {}) });
  const posterOf = (i: VideoFeedItem): { url: string; alt: string } => (i.type === "video" ? { url: i.video.poster, alt: i.alt } : i.type === "images" ? i.images[0]! : i.poster);
  const titleOf = (i: VideoFeedItem): string => i.title ?? posterOf(i).alt;
  const autoplay = cfg.autoplay.enabled && cfg.autoplay.mode === "visible" && !reducedMotion;

  // ─── Tarjetas ─────────────────────────────────────────────────────────────
  const root = widgetRoot(doc, "video_feed", entry.id, m.videoFeed, { dir: rtl ? "rtl" : "ltr", "data-layout": cfg.layout, "data-aspect": cfg.aspect, style: { "--cs-radius": `${cfg.corner_radius}px`, "--cs-w-cols": String(cfg.columns) } });
  applyTheme(root, options.theme);
  const list = el(doc, "ul", { class: "cs-vf__list", role: "list" });
  const cards: HTMLElement[] = items.map((item, i) => {
    const p = posterOf(item);
    const card = el(doc, "button", { type: "button", class: "cs-vf__card", "aria-label": fmt(m.openVideo, { title: titleOf(item) }), "aria-haspopup": "dialog", "data-item-id": item.id }, el(doc, "img", { src: safeHttpsUrl(p.url), alt: "", loading: "lazy", decoding: "async" }), item.type === "images" ? null : el(doc, "span", { class: "cs-vf__play", "aria-hidden": "true" }, widgetIcon(doc, "play", 20)));
    if (cfg.show_title && item.title) card.append(el(doc, "span", { class: "cs-vf__caption" }, item.title));
    card.addEventListener("click", () => {
      emit({ type: "click", elementId: widgetElementId(entry.id, item.id), itemId: item.id });
      api.open(i);
    });
    list.append(el(doc, "li", { class: "cs-vf__item" }, card));
    return card;
  });
  root.append(list);
  container.append(root);
  const stopVisible = items.length ? onVisible(win, root, () => emit({ type: "impression" })) : () => undefined;

  // ─── Visor ────────────────────────────────────────────────────────────────
  let dialog: HTMLDialogElement | null = null;
  let scroller: HTMLElement | null = null;
  let slides: Slide[] = [];
  let current: number | null = null;
  let since = 0;
  let paused = false;
  let muted = cfg.autoplay.muted;
  let opener: HTMLElement | null = null;
  const viewed = new Set<string>();
  let warm: ReturnType<typeof makeWarm> | null = null;
  let live: HTMLElement;
  let pauseBtn: HTMLButtonElement;
  let muteBtn: HTMLButtonElement;
  let shareBtn: HTMLButtonElement | null;

  function makeWarm() {
    const live = new Map<string, AbortController>();
    return {
      update(index: number): void {
        const plan = planWindow(items.length, index);
        const want = new Set(plan.map((p) => items[p.index]!.id));
        for (const [id, c] of live) {
          if (want.has(id)) continue;
          c.abort();
          live.delete(id);
        }
        for (const p of plan) {
          const it = items[p.index]!;
          if (p.role === "current" || live.has(it.id) || it.type !== "video" || !options.warm) continue;
          const c = new AbortController();
          live.set(it.id, c);
          void options.warm(toPlayerSource(it.video, it.alt), c.signal).catch(() => undefined);
        }
      },
      cancel(): void {
        for (const c of live.values()) c.abort();
        live.clear();
      },
    };
  }

  const mediaSource = (i: VideoFeedItem): VideoSource | null => (i.type === "video" ? toPlayerSource(i.video, i.alt) : i.type === "repost" && i.mode === "background" && i.media ? toPlayerSource(i.media, i.poster.alt) : null);

  function mountMedia(s: Slide): void {
    const { item } = s;
    const src = mediaSource(item);
    if (src) {
      const onEvent = (e: VideoPlayerEvent): void => {
        if (e.type === "state" && (e.state === "playing" || e.state === "paused")) syncPause(e.state === "paused");
      };
      if (options.createPlayer) {
        s.player = options.createPlayer(s.media, src, { doc, autoplay: false, muted, loop: true, fit: "fill", onEvent });
        s.media.querySelector(".cs-vf__poster")?.setAttribute("hidden", "");
      } else if (src.mp4) {
        const v = el(doc, "video", { class: "cs-vf__native", src: safeHttpsUrl(src.mp4), poster: safeHttpsUrl(src.poster), playsinline: true, loop: true, preload: "metadata", "aria-label": item.type === "video" ? item.alt : item.title ?? "" });
        v.muted = muted;
        s.media.append(v);
        s.player = { play: async () => (await v.play().then(() => "playing" as const, () => "blocked" as const)), pause: () => v.pause(), setMuted: (x) => void (v.muted = x), destroy: () => {
          v.removeAttribute("src");
          try { v.load(); } catch { /* sin motor de medios */ }
          v.remove();
        } };
      }
      if (s.player && autoplay && !paused) void s.player.play();
    } else if (item.type === "images" && item.images.length > 1) {
      const imgs = item.images.map((im, i) => el(doc, "img", { class: "cs-vf__img", src: safeHttpsUrl(im.url), alt: im.alt, hidden: i !== 0, decoding: "async" }));
      s.media.querySelector(".cs-vf__poster")?.setAttribute("hidden", "");
      s.media.append(...imgs);
      const tick = (): void => {
        s.timer = clock.setTimeout(() => {
          if (paused || reducedMotion) return tick();
          imgs[s.frame]!.hidden = true;
          s.frame = (s.frame + 1) % imgs.length;
          imgs[s.frame]!.hidden = false;
          tick();
        }, item.slide_ms);
      };
      if (autoplay) tick();
    }
  }
  function unmountMedia(s: Slide): void {
    s.player?.destroy();
    s.player = undefined;
    if (s.timer !== undefined) clock.clearTimeout(s.timer);
    s.timer = undefined;
    s.frame = 0;
    s.media.replaceChildren(...Array.from(s.media.children).filter((c) => c.classList.contains("cs-vf__poster")).map((c) => (c.removeAttribute("hidden"), c)));
  }

  function syncPause(isPaused: boolean): void {
    paused = isPaused;
    if (!pauseBtn) return;
    pauseBtn.setAttribute("aria-label", paused ? m.playVideo : m.pauseVideo);
    pauseBtn.replaceChildren(widgetIcon(doc, paused ? "play" : "pause"));
    pauseBtn.setAttribute("aria-pressed", String(paused));
  }

  function leave(): void {
    if (current === null) return;
    const ms = clock.now() - since;
    const s = slides[current]!;
    if (ms > 0 && s) emit({ type: "watch_length", itemId: s.item.id, ms: Math.min(ms, 3_600_000) });
    if (s.player || s.timer !== undefined) emit({ type: "playback", itemId: s.item.id, action: "pause" });
  }

  function activate(index: number, via: "tap" | "swipe" | "keyboard" | null): void {
    if (index === current || index < 0 || index >= slides.length) return;
    const prev = current;
    if (prev !== null && via) emit({ type: index > prev ? "next" : "prev", via, itemId: items[index]!.id } as never);
    leave();
    current = index;
    since = clock.now();
    const plan = new Set(planWindow(items.length, index).map((p) => p.index));
    slides.forEach((s, i) => {
      if (i === index) {
        s.el.setAttribute("aria-current", "true");
        unmountMedia(s);
        mountMedia(s);
      } else {
        s.el.removeAttribute("aria-current");
        if (!plan.has(i) || s.player || s.timer !== undefined) unmountMedia(s);
      }
    });
    warm?.update(index);
    const it = items[index]!;
    if (!viewed.has(it.id)) {
      viewed.add(it.id);
      emit({ type: "view", itemId: it.id });
    }
    live.textContent = fmt(it.type === "images" ? m.imageOf : m.videoOf, { n: index + 1, total: items.length });
    muteBtn.hidden = !slides[index]!.player;
    if (shareBtn) shareBtn.hidden = !it.share.enabled;
    syncPause(!autoplay || paused);
    emit({ type: "playback", itemId: it.id, action: "play" });
    if (!autoplay) emit({ type: "playback", itemId: it.id, action: "pause" });
  }

  function goTo(index: number, via: "tap" | "keyboard" | "swipe"): void {
    if (!scroller) return;
    const i = Math.max(0, Math.min(items.length - 1, index));
    const h = scroller.clientHeight;
    if (h) scroller.scrollTo?.({ top: i * h, behavior: reducedMotion ? "auto" : "smooth" });
    activate(i, via);
  }

  async function share(s: Slide): Promise<void> {
    const url = s.item.share.url ?? (s.item.type === "repost" ? s.item.url : win.location.href);
    const data = { url, title: s.item.title, itemId: s.item.id };
    if (options.onShare) {
      await options.onShare(data);
      emit({ type: "share", itemId: s.item.id, target: "app" });
    } else if (typeof win.navigator.share === "function") {
      try {
        await win.navigator.share({ url, ...(s.item.title ? { title: s.item.title } : {}) });
        emit({ type: "share", itemId: s.item.id, target: "native" });
      } catch { /* cancelado */ }
    } else {
      try {
        await win.navigator.clipboard.writeText(url);
        live.textContent = m.shared;
        emit({ type: "share", itemId: s.item.id, target: "clipboard" });
      } catch { /* sin permiso: no se informa un éxito falso */ }
    }
  }

  function buildSlide(item: VideoFeedItem, i: number): Slide {
    const p = posterOf(item);
    const media = el(doc, "div", { class: "cs-vf__media" }, el(doc, "img", { class: "cs-vf__poster", src: safeHttpsUrl(p.url), alt: item.type === "video" ? "" : p.alt, decoding: "async" }));
    const info = el(doc, "div", { class: "cs-vf__info" });
    if (item.title) info.append(el(doc, "h3", { class: "cs-vf__title" }, item.title));
    if (item.caption) info.append(el(doc, "p", { class: "cs-vf__text" }, item.caption));
    const actions = el(doc, "div", { class: "cs-vf__ctas" });
    if (item.type === "repost") {
      const net = NETWORKS[item.network] ?? item.network;
      const id = widgetElementId(entry.id, `${item.id}.repost`.slice(0, 80));
      const act: ComponentAction = { type: "url", url: item.url };
      const link = linkNode(doc, "button", act, { class: "cs-widget__cta cs-vf__repost", rel: "noopener noreferrer", target: "_blank" }, () => {
        emit({ type: "click", elementId: id, itemId: item.id });
        open(act, id, item.id);
      });
      link.append(fmt(m.viewOnNetwork, { network: net }));
      actions.append(link);
    }
    for (const c of item.ctas) {
      const node = linkNode(doc, "button", c.action, { class: "cs-widget__cta" }, () => {
        emit({ type: "click", elementId: c.element_id, itemId: item.id });
        open(c.action, c.element_id, item.id);
      });
      node.append(c.label);
      actions.append(node);
    }
    info.append(actions);
    const shop = renderProductActions(doc, win, { widgetId: entry.id, itemId: item.id, componentId: WIDGET_PRODUCT_COMPONENT_IDS.video_feed, products: item.products, emit, m, hooks: options, visibleOn: info, cleanup: productCleanup, viewed: productViewed });
    if (shop) info.append(shop);
    const slide = el(doc, "section", { class: "cs-vf__slide", role: "group", "aria-roledescription": "slide", "aria-label": fmt(m.videoOf, { n: i + 1, total: items.length }), "data-index": i }, media, info);
    return { item, el: slide, media, frame: 0 };
  }

  function teardown(): void {
    productCleanup.splice(0).forEach((f) => f());
    leave();
    current = null;
    for (const s of slides) unmountMedia(s);
    warm?.cancel();
    warm = null;
    slides = [];
    scroller = null;
    const d = dialog;
    dialog = null;
    d?.remove();
  }

  const api: VideoFeedHandle = {
    element: root,
    get current() { return current; },
    open(index = 0) {
      if (dialog || items.length === 0) return;
      opener = (doc.activeElement as HTMLElement | null) ?? cards[index] ?? null;
      viewed.clear();
      paused = false;
      muted = cfg.autoplay.muted;
      warm = makeWarm();
      live = el(doc, "div", { class: "cs-sr", role: "status", "aria-live": "polite" });
      const closeBtn = el(doc, "button", { type: "button", class: "cs-ctl cs-vf__close", "aria-label": m.closeViewer }, widgetIcon(doc, "close"));
      pauseBtn = el(doc, "button", { type: "button", class: "cs-ctl cs-vf__pause", "aria-label": m.pauseVideo, "aria-pressed": "false" }, widgetIcon(doc, "pause"));
      muteBtn = el(doc, "button", { type: "button", class: "cs-ctl cs-vf__mute", "aria-label": muted ? m.unmuteVideo : m.muteVideo, "aria-pressed": String(muted) }, widgetIcon(doc, muted ? "volume-off" : "volume"));
      shareBtn = cfg.share.enabled ? el(doc, "button", { type: "button", class: "cs-ctl cs-vf__share", "aria-label": m.share }, widgetIcon(doc, "share")) : null;
      const prevBtn = el(doc, "button", { type: "button", class: "cs-ctl cs-vf__prev", "aria-label": m.previousVideo }, widgetIcon(doc, "up"));
      const nextBtn = el(doc, "button", { type: "button", class: "cs-ctl cs-vf__next", "aria-label": m.nextVideo }, widgetIcon(doc, "up"));
      scroller = el(doc, "div", { class: "cs-vf__scroller" });
      slides = items.map(buildSlide);
      scroller.append(...slides.map((s) => s.el));
      const d = el(doc, "dialog", { class: "cs-vf__dialog cs-root", dir: rtl ? "rtl" : "ltr", "aria-label": m.videoFeed, "data-aspect": cfg.aspect });
      applyTheme(d, options.theme);
      d.append(scroller, closeBtn, pauseBtn, muteBtn, ...(shareBtn ? [shareBtn] : []), prevBtn, nextBtn, live);
      dialog = d;
      doc.body.append(d);

      closeBtn.addEventListener("click", () => api.close());
      pauseBtn.addEventListener("click", () => {
        const s = current === null ? null : slides[current];
        if (!s) return;
        syncPause(!paused);
        if (paused) s.player?.pause();
        else void s.player?.play();
        emit({ type: "playback", itemId: s.item.id, action: paused ? "pause" : "play" });
      });
      muteBtn.addEventListener("click", () => {
        const s = current === null ? null : slides[current];
        muted = !muted;
        s?.player?.setMuted(muted);
        muteBtn.setAttribute("aria-label", muted ? m.unmuteVideo : m.muteVideo);
        muteBtn.setAttribute("aria-pressed", String(muted));
        muteBtn.replaceChildren(widgetIcon(doc, muted ? "volume-off" : "volume"));
        if (s) emit({ type: "playback", itemId: s.item.id, action: muted ? "mute" : "unmute" });
      });
      shareBtn?.addEventListener("click", () => {
        const s = current === null ? null : slides[current];
        if (s) void share(s);
      });
      prevBtn.addEventListener("click", () => goTo((current ?? 0) - 1, "tap"));
      nextBtn.addEventListener("click", () => goTo((current ?? 0) + 1, "tap"));
      d.addEventListener("keydown", (e) => {
        const down = e.key === "ArrowDown" || e.key === "PageDown";
        if (!down && e.key !== "ArrowUp" && e.key !== "PageUp") return;
        e.preventDefault();
        goTo((current ?? 0) + (down ? 1 : -1), "keyboard");
      });
      let raf = 0;
      scroller.addEventListener("scroll", () => {
        if (raf || !scroller) return;
        raf = win.setTimeout(() => {
          raf = 0;
          const h = scroller?.clientHeight;
          if (scroller && h) activate(Math.round(scroller.scrollTop / h), "swipe");
        }, 60) as unknown as number;
      }, { passive: true });
      d.addEventListener("close", () => {
        teardown();
        opener?.focus?.();
      });
      d.addEventListener("cancel", () => undefined);
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      const h = scroller.clientHeight;
      if (h && index) scroller.scrollTop = index * h;
      activate(index, null);
      closeBtn.focus();
    },
    close() {
      const d = dialog;
      if (!d) return;
      if (typeof d.close === "function" && d.open) d.close();
      else {
        teardown();
        opener?.focus?.();
      }
    },
    destroy() {
      stopVisible();
      api.close();
      teardown();
      root.remove();
    },
  };
  return api;
}
