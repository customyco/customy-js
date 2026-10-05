import { pageAnnouncement } from "./a11y";
import { pageDurationMs, pageHasVideo, systemClock, type Clock } from "./clock";
import { resolveMessages, type Messages } from "./messages";
import { createPagePlayer, type PagePlayer, type PageSnapshot, type PauseReason } from "./page-player";
import { pageAssets, pageKey, planPreload, type Preloader } from "./preload";
import type { SeenTracker } from "./seen";
import type { AnswerMap, ButtonComponent, ComponentAction, CountdownComponent, PollComponent, ProductRef, PromoCodeComponent, StoryComponent, StoryGroup, StoryPage } from "./types";
import { evaluateVisibility } from "./visibility";

/** Un grupo con páginas (el de control, sin `pages`, no se abre). */
export type ViewerGroup = StoryGroup & { pages: StoryPage[] };

export function viewableGroups(groups: readonly StoryGroup[]): ViewerGroup[] {
  return groups.filter((g): g is ViewerGroup => !g.control && !!g.pages && g.pages.length > 0);
}

export type ViewerVia = "tap" | "swipe" | "auto" | "keyboard";
export type CloseReason = "user" | "swipe" | "completed" | "keyboard" | "app";

type Ctx = { groupId: string; variantId?: string; pageId?: string };
/** Eventos de dominio del visor; el SDK les pone `event_id`, fecha, canal y placement. */
export type ViewerEvent = Ctx &
  (
    | { type: "view" }
    | { type: "exit_page"; ms: number }
    | { type: "next"; via: ViewerVia }
    | { type: "prev"; via: Exclude<ViewerVia, "auto"> }
    | { type: "complete" }
    | { type: "close"; ms: number; reason: CloseReason }
    | { type: "share"; target?: string }
    | { type: "watch_length"; ms: number }
    | { type: "click"; elementId: string; componentId?: string }
    | { type: "component_response"; componentId: string; choiceId?: string; value?: string | number | boolean; consentPurpose: string }
    | { type: "product_viewed"; componentId: string; product: ProductRef }
    | { type: "add_to_cart"; componentId: string; product: ProductRef; quantity: number }
    | { type: "wishlist_added"; componentId: string; product: ProductRef }
    | { type: "report"; componentId: string; answerId: string; reason: ReportReason }
  );
export type ReportReason = "spam" | "abuse" | "privacy" | "other";

export type ViewerState = {
  open: boolean;
  groupIndex: number;
  pageIndex: number;
  group: ViewerGroup | null;
  page: StoryPage | null;
  snapshot: PageSnapshot;
  /** La interfaz del visor se oculta (mantener pulsado). */
  uiHidden: boolean;
  /** Pausa pedida por la persona (botón o Espacio). */
  userPaused: boolean;
  /** Texto para la región `aria-live`. */
  announcement: string;
  /** Sube con cada página mostrada (incluida la misma tras reiniciar): la UI re-pinta cuando cambia. */
  epoch: number;
  closeReason?: CloseReason;
  /** Respuestas de la sesión: `componentId → opción/valor`. */
  responses: Readonly<Record<string, string | number | boolean>>;
  /** Páginas que se pueden mostrar del grupo (la ramificación salta el resto) y posición de la actual entre ellas. */
  visibleCount: number;
  visibleIndex: number;
};

export type ViewerOptions = {
  groups: readonly ViewerGroup[];
  startGroupId?: string;
  startPageId?: string;
  seen?: SeenTracker;
  preloader?: Preloader;
  clock?: Clock;
  /** `prefers-reduced-motion`: el visor empieza en pausa y sin animaciones. */
  reducedMotion?: boolean;
  rtl?: boolean;
  locale?: string;
  messages?: Partial<Messages>;
  onEvent?: (event: ViewerEvent) => void;
  /** Abre un enlace (URL o deep link). La app decide cómo. */
  openLink?: (action: ComponentAction, ctx: { groupId: string; pageId: string; elementId?: string }) => void;
  onClose?: (reason: CloseReason) => void;
};

const idle: PageSnapshot = { state: "loading", progress: 0, elapsedMs: 0, durationMs: 1, pausedBy: [], degraded: false, mode: "timer" };

export type StoryViewer = ReturnType<typeof createStoryViewer>;

export function createStoryViewer(options: ViewerOptions) {
  const clock = options.clock ?? systemClock;
  /** Respuestas de la sesión por grupo (los ids de componente solo son únicos dentro de un grupo). */
  const sessionAnswers: Record<string, Record<string, string | number | boolean>> = {};
  const answersOf = (g: ViewerGroup): AnswerMap => ({ ...g.answers, ...sessionAnswers[g.id] });
  /** Ramificación: una página se salta si su condición no se cumple con lo que se sabe al entrar. */
  const shown = (g: ViewerGroup, pi: number): boolean => evaluateVisibility(g.pages[pi]?.visibility, answersOf(g)) !== false;
  const scan = (g: ViewerGroup, from: number, dir: 1 | -1): number => {
    for (let i = from; i >= 0 && i < g.pages.length; i += dir) if (shown(g, i)) return i;
    return -1;
  };
  /** Si ninguna condición se cumple, el grupo entero se oculta. */
  const groups = options.groups.filter((g) => scan(g, 0, 1) >= 0);
  const messages = resolveMessages(options.locale, options.messages);
  const listeners = new Set<() => void>();
  /** Pausas que sobreviven al cambio de página. */
  const sticky = new Set<PauseReason>(options.reducedMotion ? ["user"] : []);
  let player: PagePlayer | null = null;
  let token = 0;
  let openedAt = 0;
  let groupWatchMs = 0;
  let state: ViewerState = {
    open: false,
    groupIndex: 0,
    pageIndex: 0,
    group: null,
    page: null,
    snapshot: idle,
    uiHidden: false,
    userPaused: sticky.has("user"),
    announcement: "",
    epoch: 0,
    responses: {},
    visibleCount: 0,
    visibleIndex: 0,
  };

  const set = (patch: Partial<ViewerState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const ctx = (): Ctx => ({ groupId: state.group?.id ?? "", variantId: state.group?.variant_id, pageId: state.page?.id });
  type EventInput<T> = T extends unknown ? Omit<T, keyof Ctx> & Partial<Ctx> : never;
  const emit = (e: EventInput<ViewerEvent>): void => options.onEvent?.({ ...ctx(), ...e } as ViewerEvent);

  function preloadAround(gi: number, pi: number): void {
    const pre = options.preloader;
    if (!pre) return;
    const targets = [{ groupIndex: gi, pageIndex: pi }, ...planPreload(groups, gi, pi)];
    const keep: string[] = [];
    for (const t of targets) {
      const g = groups[t.groupIndex];
      const p = g?.pages[t.pageIndex];
      if (!g || !p) continue;
      const key = pageKey(g.id, p.id);
      keep.push(key);
      pre.request(key, pageAssets(p));
    }
    pre.cancelExcept(keep);
  }

  /** Cierra el registro de la página en curso (tiempo visto) sin cambiar de página. */
  function leavePage(): void {
    if (!state.page || !player) return;
    const ms = Math.round(player.playedMs());
    groupWatchMs += ms;
    emit({ type: "exit_page", ms });
    player.destroy();
    player = null;
  }

  function enterPage(gi: number, pi: number): void {
    const g = groups[gi];
    const page = g?.pages[pi];
    if (!g || !page) return;
    const mine = ++token;
      const media = pageHasVideo(page);
    const p = createPagePlayer({
      durationMs: pageDurationMs(page),
      media,
      clock,
      initialPauses: [...sticky],
      onChange: (snapshot) => {
        if (mine === token) set({ snapshot });
      },
      onComplete: () => {
        if (mine === token) advance("auto");
      },
    });
    player = p;
    const vis = g.pages.map((_, i) => i).filter((i) => shown(g, i));
    const visibleIndex = Math.max(0, vis.indexOf(pi));
    set({
      open: true,
      groupIndex: gi,
      pageIndex: pi,
      group: g,
      page,
      snapshot: p.snapshot(),
      epoch: state.epoch + 1,
      visibleCount: vis.length,
      visibleIndex,
      announcement: pageAnnouncement(g, page, { n: gi + 1, total: groups.length }, { n: visibleIndex + 1, total: vis.length }, messages),
    });
    emit({ type: "view" });
    options.seen?.markPageSeen(g.id, page.id);
    preloadAround(gi, pi);

    const pre = options.preloader;
    if (!pre) {
      p.ready();
      return;
    }
    pre
      .request(pageKey(g.id, page.id), pageAssets(page))
      .promise.then((res) => {
        if (mine !== token) return;
        if (res.posterFallback || !res.ok) p.fallbackToPoster();
        p.ready();
      })
      .catch(() => {
        // Cancelada por un cambio rápido de página: si seguimos aquí, se pinta con lo que haya.
        if (mine === token) {
          p.fallbackToPoster();
          p.ready();
        }
      });
  }

  function closeInternal(reason: CloseReason): void {
    if (!state.open) return;
    leavePage();
    emit({ type: "watch_length", ms: groupWatchMs });
    emit({ type: "close", ms: Math.max(0, clock.now() - openedAt), reason });
    token++;
    options.preloader?.cancelAll();
    set({ open: false, closeReason: reason, snapshot: { ...state.snapshot, state: "completed" } });
    options.onClose?.(reason);
  }

  /** Entra en el primer grupo desde `gi` (en la dirección dada) que tenga una página visible; `false` si no hay. */
  function gotoGroup(gi: number, startAtFirst: boolean, dir: 1 | -1 = 1): boolean {
    for (let i = gi; i >= 0 && i < groups.length; i += dir) {
      const g = groups[i]!;
      const want = startAtFirst ? 0 : options.seen?.startIndex(g) ?? 0;
      let pi = scan(g, want, 1);
      if (pi < 0) pi = scan(g, want, -1);
      if (pi < 0) continue;
      groupWatchMs = 0;
      enterPage(i, pi);
      return true;
    }
    return false;
  }

  const groupAt = (from: number, dir: 1 | -1): number => {
    for (let i = from; i >= 0 && i < groups.length; i += dir) if (scan(groups[i]!, 0, 1) >= 0) return i;
    return -1;
  };

  /** Hacia delante: la página siguiente (saltando las ocultas), o el grupo siguiente, o cerrar al final. */
  function advance(via: ViewerVia): void {
    if (!state.open || !state.group) return;
    const g = state.group;
    const n = scan(g, state.pageIndex + 1, 1);
    leavePage();
    emit({ type: "next", via });
    if (n >= 0) {
      enterPage(state.groupIndex, n);
      return;
    }
    emit({ type: "complete" });
    emit({ type: "watch_length", ms: groupWatchMs });
    if (groupAt(state.groupIndex + 1, 1) >= 0) {
      gotoGroup(state.groupIndex + 1, false, 1);
    } else {
      // Ya se cerró la página y emitió `exit_page`: se cierra sin repetirlo.
      emit({ type: "close", ms: Math.max(0, clock.now() - openedAt), reason: "completed" });
      token++;
      options.preloader?.cancelAll();
      set({ open: false, closeReason: "completed" });
      options.onClose?.("completed");
    }
  }

  function back(via: Exclude<ViewerVia, "auto">): void {
    if (!state.open || !state.group) return;
    const g = state.group;
    const p = scan(g, state.pageIndex - 1, -1);
    leavePage();
    emit({ type: "prev", via });
    if (p >= 0) enterPage(state.groupIndex, p);
    else if (groupAt(state.groupIndex - 1, -1) >= 0) {
      emit({ type: "watch_length", ms: groupWatchMs });
      gotoGroup(state.groupIndex - 1, true, -1);
    } else enterPage(state.groupIndex, Math.max(0, scan(g, 0, 1)));
  }

  function swipeGroup(direction: "next" | "prev"): void {
    if (!state.open) return;
    const dir = direction === "next" ? 1 : -1;
    const target = groupAt(state.groupIndex + dir, dir);
    if (target < 0) return;
    leavePage();
    emit({ type: direction, via: "swipe" });
    emit({ type: "watch_length", ms: groupWatchMs });
    gotoGroup(target, direction === "prev", dir);
  }

  const findComponent = <T extends StoryComponent["type"]>(id: string, type: T): Extract<StoryComponent, { type: T }> | undefined =>
    state.page?.canvas.components.find((c): c is Extract<StoryComponent, { type: T }> => c.id === id && c.type === type);

  const api = {
    getState: (): ViewerState => state,
    /** Progreso de la página en curso (0–1), calculado al momento: para pintar la barra con rAF. */
    progress: (): number => player?.snapshot().progress ?? 0,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    messages,
    /** Abre el visor en el grupo pedido (o el primero). */
    open(): void {
      const gi = Math.max(0, options.startGroupId ? groups.findIndex((g) => g.id === options.startGroupId) : 0);
      const g = groups[gi];
      if (!g) return;
      groupWatchMs = 0;
      openedAt = clock.now();
      let pi = options.seen?.startIndex(g) ?? 0;
      if (options.startPageId) {
        const found = g.pages.findIndex((p) => p.id === options.startPageId);
        if (found >= 0) pi = found;
      }
      const first = scan(g, pi, 1);
      enterPage(gi, first >= 0 ? first : Math.max(0, scan(g, pi, -1)));
    },
    next: (via: ViewerVia = "tap"): void => advance(via),
    prev: (via: Exclude<ViewerVia, "auto"> = "tap"): void => back(via),
    nextGroup: (): void => swipeGroup("next"),
    prevGroup: (): void => swipeGroup("prev"),
    /** Pausa/reanuda por un motivo externo (visibilidad, foco, superficie). */
    pause(reason: PauseReason): void {
      sticky.add(reason);
      player?.pause(reason);
      if (reason === "user") set({ userPaused: true });
    },
    resume(reason: PauseReason): void {
      sticky.delete(reason);
      player?.resume(reason);
      if (reason === "user") set({ userPaused: false });
    },
    /** Botón de pausa / Espacio. */
    togglePause(): void {
      if (sticky.has("user")) api.resume("user");
      else api.pause("user");
    },
    /** Mantener pulsado: pausa y oculta la interfaz mientras dure. */
    hold(on: boolean): void {
      if (!state.open) return;
      if (on) {
        player?.pause("hold");
        set({ uiHidden: true });
      } else {
        player?.resume("hold");
        set({ uiHidden: false });
      }
    },
    close: (reason: CloseReason = "user"): void => closeInternal(reason),
    /** El vídeo avisa de su reloj. */
    mediaTime: (currentMs: number, totalMs?: number): void => player?.setMediaTime(currentMs, totalMs),
    mediaEnded: (): void => player?.mediaEnded(),
    mediaBuffering(on: boolean): void {
      if (on) player?.pause("buffering");
      else player?.resume("buffering");
    },
    /** El vídeo no se pudo reproducir: sigue con el póster. */
    mediaFailed: (): void => player?.fallbackToPoster(),
    share(target?: string): void {
      if (state.open) emit({ type: "share", target });
    },
    /** Pulsar un botón: registra el clic con su nombre y abre el enlace. */
    activateButton(componentId: string): ButtonComponent | undefined {
      const c = findComponent(componentId, "button");
      if (!c || !state.group || !state.page) return undefined;
      emit({ type: "click", elementId: c.element_id, componentId: c.id });
      options.openLink?.(c.action, { groupId: state.group.id, pageId: state.page.id, elementId: c.element_id });
      return c;
    },
    /** Deslizar hacia arriba: abre el CTA de la página (el `swipe_up`, o el primer botón). */
    swipeUp(): boolean {
      const comps = state.page?.canvas.components ?? [];
      const btn = comps.find((c): c is ButtonComponent => c.type === "button" && c.style === "swipe_up") ?? comps.find((c): c is ButtonComponent => c.type === "button");
      if (!btn) return false;
      api.activateButton(btn.id);
      return true;
    },
    /** Voto de una encuesta: anónimo por defecto; el propósito de consentimiento viaja en el evento. */
    answerPoll(componentId: string, choiceId: string): PollComponent | undefined {
      const c = findComponent(componentId, "poll");
      if (!c || state.responses[c.id] !== undefined || !c.options.some((o) => o.id === choiceId)) return undefined;
      emit({ type: "component_response", componentId: c.id, choiceId, consentPurpose: c.consent_purpose });
      api.setAnswer(c.id, choiceId);
      return c;
    },
    /**
     * Para el módulo de componentes de la Ola 2: registra un evento de dominio de la página en curso
     * (respuesta, producto, reporte, clic…). El módulo valida lo suyo; el servidor lo vuelve a validar.
     */
    track(e: EventInput<ViewerEvent>): void {
      if (state.open) emit(e);
    },
    /**
     * Guarda la respuesta de un componente en la sesión. Las elecciones y los valores alimentan la
     * ramificación (las páginas dependientes se re-evalúan y la barra de progreso se recuenta); un texto
     * abierto (`branching: false`) no.
     */
    setAnswer(componentId: string, answer: string | number | boolean, branching = true): void {
      const g = state.group;
      if (!g) return;
      if (branching) sessionAnswers[g.id] = { ...sessionAnswers[g.id], [componentId]: answer };
      const vis = g.pages.map((_, i) => i).filter((i) => shown(g, i));
      set({ responses: { ...state.responses, [componentId]: answer }, visibleCount: vis.length, visibleIndex: Math.max(0, vis.indexOf(state.pageIndex)) });
    },
    /** Recordatorio de una cuenta atrás: SOLO con la acción explícita de la persona (opt-in). */
    optInReminder(componentId: string): CountdownComponent | undefined {
      const c = findComponent(componentId, "countdown");
      if (!c || !c.reminder.enabled || state.responses[c.id] !== undefined) return undefined;
      emit({ type: "component_response", componentId: c.id, value: true, consentPurpose: "reminders" });
      api.setAnswer(c.id, true, false);
      return c;
    },
    /** Copiar un código: registra el clic con su nombre (el portapapeles lo toca la capa DOM). */
    copyPromo(componentId: string): PromoCodeComponent | undefined {
      const c = findComponent(componentId, "promo_code");
      if (!c) return undefined;
      emit({ type: "click", elementId: c.element_id, componentId: c.id });
      return c;
    },
    destroy(): void {
      token++;
      player?.destroy();
      player = null;
      listeners.clear();
      options.preloader?.cancelAll();
    },
  };
  return api;
}
