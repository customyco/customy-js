import { systemClock, type Clock, type TimerHandle } from "./clock";
import { fmt, resolveMessages, type Messages } from "./messages";
import type { BannerSlide, ComponentAction, DeliveredBanner } from "./types";

export type BannerVia = "tap" | "swipe" | "auto" | "keyboard";
export type DismissReason = "user" | "auto" | "expired" | "app";

type Ctx = { bannerId: string; variantId?: string; slideId?: string };
export type BannerEvent = Ctx &
  (
    | { type: "impression" }
    | { type: "view" }
    | { type: "click"; elementId: string }
    | { type: "next"; via: BannerVia }
    | { type: "prev"; via: Exclude<BannerVia, "auto"> }
    | { type: "dismiss"; reason: DismissReason }
  );

export type BannerState = {
  index: number;
  slide: BannerSlide | null;
  slides: number;
  /** Pausas activas del carrusel (`user`, `hover`, `focus`, `hidden`, `reduced-motion`). */
  pausedBy: readonly string[];
  autoplaying: boolean;
  dismissed: boolean;
  dismissReason?: DismissReason;
  announcement: string;
};

export type BannerOptions = {
  banner: DeliveredBanner;
  clock?: Clock;
  reducedMotion?: boolean;
  locale?: string;
  messages?: Partial<Messages>;
  onEvent?: (event: BannerEvent) => void;
  openLink?: (action: ComponentAction, ctx: { bannerId: string; slideId: string; elementId?: string }) => void;
};

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,254}$/;

/**
 * Banner o carrusel de banners. Reglas:
 *  - el autoavance (si está activo) SIEMPRE se puede pausar (WCAG 2.2.2) y con
 *    `prefers-reduced-motion` empieza pausado;
 *  - NO se cierra solo salvo que el banner lo pida (`auto_close_ms`, por defecto nulo: WCAG 2.2.1);
 *  - `logClick(nombre)` registra un clic con nombre (el contrato exige charset seguro y ≤ 255).
 */
export function createBannerController(options: BannerOptions) {
  const { banner } = options;
  const clock = options.clock ?? systemClock;
  const messages = resolveMessages(options.locale, options.messages);
  const slides = banner.slides ?? [];
  const style = banner.style;
  const listeners = new Set<() => void>();
  const reasons = new Set<string>(options.reducedMotion ? ["reduced-motion"] : []);
  let timer: TimerHandle | null = null;
  let closeTimer: TimerHandle | null = null;
  let impressed = false;
  let state: BannerState = { index: 0, slide: slides[0] ?? null, slides: slides.length, pausedBy: [...reasons], autoplaying: false, dismissed: false, announcement: "" };

  const canAutoplay = style.autoplay.enabled && style.carousel && slides.length > 1;
  const set = (patch: Partial<BannerState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const ctx = (): Ctx => ({ bannerId: banner.id, variantId: banner.variant_id, slideId: state.slide?.id });
  type EventInput<T> = T extends unknown ? Omit<T, keyof Ctx> : never;
  const emit = (e: EventInput<BannerEvent>): void => options.onEvent?.({ ...ctx(), ...e } as BannerEvent);

  const stopTimer = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const schedule = (): void => {
    stopTimer();
    if (!canAutoplay || reasons.size > 0 || state.dismissed) return;
    timer = clock.setTimeout(() => {
      timer = null;
      move(1, "auto");
    }, style.autoplay.interval_ms);
  };
  const refreshAutoplay = (): void => {
    set({ pausedBy: [...reasons], autoplaying: canAutoplay && reasons.size === 0 && !state.dismissed });
    schedule();
  };

  function announce(index: number): string {
    return fmt(messages.slideOf, { n: index + 1, total: slides.length });
  }

  function move(delta: number, via: BannerVia): void {
    if (state.dismissed || slides.length < 2) return;
    let target = state.index + delta;
    if (target < 0 || target >= slides.length) {
      if (!style.carousel) return;
      target = (target + slides.length) % slides.length;
    }
    emit({ type: delta > 0 ? "next" : "prev", via } as EventInput<BannerEvent>);
    goTo(target);
  }
  function goTo(index: number): void {
    const slide = slides[index];
    if (!slide || state.dismissed) return;
    set({ index, slide, announcement: announce(index) });
    emit({ type: "view" });
    schedule();
  }

  const api = {
    getState: (): BannerState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    messages,
    /** Se pinta: una impresión por vida del controlador y la vista de la imagen 1. */
    show(): void {
      if (impressed || state.dismissed || !state.slide) return;
      impressed = true;
      emit({ type: "impression" });
      emit({ type: "view" });
      refreshAutoplay();
      if (style.auto_close_ms) {
        closeTimer = clock.setTimeout(() => api.dismiss("auto"), style.auto_close_ms);
      }
    },
    next: (via: BannerVia = "tap"): void => move(1, via),
    prev: (via: Exclude<BannerVia, "auto"> = "tap"): void => move(-1, via),
    goTo(index: number): void {
      if (index !== state.index) goTo(index);
    },
    pause(reason: string): void {
      reasons.add(reason);
      refreshAutoplay();
    },
    resume(reason: string): void {
      reasons.delete(reason);
      refreshAutoplay();
    },
    /** Botón pausa/reanudar del carrusel. Con reduced-motion, reanudar quita también esa pausa inicial. */
    toggleAutoplay(): void {
      if (reasons.has("user") || reasons.has("reduced-motion")) {
        reasons.delete("user");
        reasons.delete("reduced-motion");
      } else reasons.add("user");
      refreshAutoplay();
    },
    /** Clic con nombre (`logClick`): sin enlace, solo la medición. Devuelve `false` si el nombre no es válido. */
    logClick(name: string, slideId?: string): boolean {
      if (!NAME.test(name) || state.dismissed) return false;
      options.onEvent?.({ ...ctx(), ...(slideId ? { slideId } : {}), type: "click", elementId: name });
      return true;
    },
    /** Clic en la imagen actual: registra su `element_id` (o `banner:<id>`) y abre su acción. */
    activate(): void {
      const slide = state.slide;
      if (!slide || state.dismissed) return;
      const elementId = slide.element_id ?? `banner.${banner.id}.${slide.id}`;
      emit({ type: "click", elementId });
      if (slide.action) options.openLink?.(slide.action, { bannerId: banner.id, slideId: slide.id, elementId });
    },
    dismiss(reason: DismissReason = "user"): void {
      if (state.dismissed) return;
      if (reason === "user" && !style.dismissible) return;
      stopTimer();
      if (closeTimer !== null) clock.clearTimeout(closeTimer);
      emit({ type: "dismiss", reason });
      set({ dismissed: true, dismissReason: reason, autoplaying: false });
    },
    destroy(): void {
      stopTimer();
      if (closeTimer !== null) clock.clearTimeout(closeTimer);
      listeners.clear();
    },
  };
  return api;
}
export type BannerController = ReturnType<typeof createBannerController>;
