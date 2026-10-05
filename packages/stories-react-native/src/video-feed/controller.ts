import { visibleFeedItems } from "@customyai/stories-render/widgets/video-feed";
import { systemClock, type Clock, type DeliveredVideoFeed, type VideoFeedItem, type WidgetEvent } from "../core";
import { widgetEmitter } from "../widgets/common";

/**
 * Controlador del Video Feed nativo: el estado del visor vertical (qué elemento, pausa, sonido) y los eventos, con la
 * misma semántica que el visor web (`mountVideoFeed`): `view` una vez por elemento y apertura; `next`/`prev` con su vía;
 * `playback` play/pause/mute/unmute; `watch_length` al salir de un elemento y `playback pause` si tenía medio en marcha.
 * No pinta ni reproduce nada (el reproductor lo inyecta la app, ver `VideoPlayerAdapter`) y no usa temporizadores propios:
 * se prueba sin Reanimated ni reproductor. El renderer web no exporta esta parte como controlador; aquí está aparte para poder probarla.
 */

export type FeedWindowRole = "current" | "next" | "prev" | "ahead" | "behind";

/**
 * Ventana de precarga alrededor del elemento actual: `after` elementos por delante y `before` por detrás (la config
 * `preload { before, after }` de la campaña; el renderer web solo precarga el siguiente y el anterior). El actual lo
 * carga el reproductor; los demás se calientan y se cancelan al salir de la ventana. Orden: actual, los de delante
 * (el más cercano primero) y los de detrás.
 */
export function planFeedWindow(count: number, current: number, preload: { before: number; after: number }): Array<{ index: number; role: FeedWindowRole }> {
  if (count <= 0 || current < 0 || current >= count) return [];
  const out: Array<{ index: number; role: FeedWindowRole }> = [{ index: current, role: "current" }];
  for (let d = 1; d <= Math.max(0, preload.after) && current + d < count; d++) out.push({ index: current + d, role: d === 1 ? "next" : "ahead" });
  for (let d = 1; d <= Math.max(0, preload.before) && current - d >= 0; d++) out.push({ index: current - d, role: d === 1 ? "prev" : "behind" });
  return out;
}

export type FeedState = {
  open: boolean;
  /** Índice del elemento a la vista (`null` con el visor cerrado). */
  current: number | null;
  /** Pausa de la persona (el botón de pausa, siempre visible: WCAG 2.2.2). Persiste entre elementos. */
  paused: boolean;
  muted: boolean;
  /** La app, el segundo plano o la pausa de superficie detienen el medio sin cambiar la elección de la persona. */
  suspended: boolean;
};

export type FeedControllerOptions = {
  entry: DeliveredVideoFeed;
  onEvent?: (e: WidgetEvent) => void;
  clock?: Pick<Clock, "now">;
  /** «Reducir movimiento»: nada arranca solo. */
  reducedMotion?: boolean;
  /** ¿Hay un reproductor (adaptador inyectado)? Sin él los vídeos muestran el póster y no hay «medio en marcha». */
  hasPlayer?: boolean;
};

/** ¿Este elemento tiene un medio que se reproduce (vídeo, o repost en modo `background` con su `media`)? */
export const hasVideoMedia = (i: VideoFeedItem): boolean => i.type === "video" || (i.type === "repost" && i.mode === "background" && !!i.media);

export type FeedController = ReturnType<typeof createVideoFeedController>;

export function createVideoFeedController(options: FeedControllerOptions) {
  const { entry } = options;
  const cfg = entry.config;
  const clock = options.clock ?? systemClock;
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const items = visibleFeedItems(entry.items ?? [], clock.now(), cfg.max_items);
  /** Autoplay: solo con `mode: "visible"`, activado y con movimiento permitido. `mode: "tap"` = nada arranca solo. */
  const autoplay = cfg.autoplay.enabled && cfg.autoplay.mode === "visible" && !options.reducedMotion;
  const listeners = new Set<() => void>();
  let state: FeedState = { open: false, current: null, paused: false, muted: cfg.autoplay.muted, suspended: false };
  let since = 0;
  let viewed = new Set<string>();
  const set = (patch: Partial<FeedState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  /** ¿Tiene este elemento algo en marcha que se detiene al salir? (vídeo con reproductor, o pase de imágenes con autoplay). */
  const running = (i: VideoFeedItem): boolean => (hasVideoMedia(i) && !!options.hasPlayer) || (i.type === "images" && i.images.length > 1 && autoplay);

  function leave(): void {
    if (state.current === null) return;
    const item = items[state.current];
    if (!item) return;
    const ms = clock.now() - since;
    if (ms > 0) emit({ type: "watch_length", itemId: item.id, ms: Math.min(ms, 3_600_000) });
    if (running(item)) emit({ type: "playback", itemId: item.id, action: "pause" });
  }

  function activate(index: number, via: "tap" | "swipe" | "keyboard" | null): void {
    if (index === state.current || index < 0 || index >= items.length) return;
    const prev = state.current;
    const item = items[index]!;
    if (prev !== null && via) emit({ type: index > prev ? "next" : "prev", via, itemId: item.id });
    leave();
    since = clock.now();
    // La pausa de la persona se conserva al cambiar de elemento; sin autoplay todo empieza en pausa.
    set({ current: index, paused: !autoplay || state.paused });
    if (!viewed.has(item.id)) {
      viewed.add(item.id);
      emit({ type: "view", itemId: item.id });
    }
    emit({ type: "playback", itemId: item.id, action: "play" });
    if (!autoplay) emit({ type: "playback", itemId: item.id, action: "pause" });
  }

  return {
    items,
    autoplay,
    getState: (): FeedState => state,
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    /** Pausa efectiva del medio: la de la persona o la suspensión. */
    isPaused: (): boolean => state.paused || state.suspended,
    window: (): Array<{ index: number; role: FeedWindowRole }> => (state.current === null ? [] : planFeedWindow(items.length, state.current, cfg.preload)),
    open(index = 0): void {
      if (state.open || items.length === 0) return;
      viewed = new Set();
      set({ open: true, current: null, paused: false, muted: cfg.autoplay.muted });
      activate(Math.max(0, Math.min(items.length - 1, index)), null);
    },
    close(): void {
      if (!state.open) return;
      leave();
      set({ open: false, current: null });
    },
    /** Ir a un elemento (`tap` = botones, `swipe` = el desplazamiento del visor, `keyboard` = teclado/accesibilidad). */
    goTo(index: number, via: "tap" | "swipe" | "keyboard"): void {
      activate(Math.max(0, Math.min(items.length - 1, index)), via);
    },
    togglePause(): void {
      const item = state.current === null ? null : items[state.current];
      if (!item) return;
      const paused = !state.paused;
      set({ paused });
      emit({ type: "playback", itemId: item.id, action: paused ? "pause" : "play" });
    },
    toggleMute(): void {
      const item = state.current === null ? null : items[state.current];
      const muted = !state.muted;
      set({ muted });
      if (item) emit({ type: "playback", itemId: item.id, action: muted ? "mute" : "unmute" });
    },
    setSuspended(suspended: boolean): void {
      if (state.suspended !== suspended) set({ suspended });
    },
    /** Compartió (`target`: `app` si la app puso el menú, `native` si fue el del sistema). */
    shared(itemId: string, target: string): void {
      emit({ type: "share", itemId, target });
    },
    click(itemId: string, elementId: string): void {
      emit({ type: "click", elementId, itemId });
    },
    impression(): void {
      emit({ type: "impression" });
    },
    destroy(): void {
      leave();
      state = { ...state, open: false, current: null };
      listeners.clear();
    },
  };
}
