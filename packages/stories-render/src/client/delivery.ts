import { systemClock, type Clock } from "../clock";
import { readJson, type KeyValueStore } from "../store";
import type { DeliveredCanvas, DeliveredChecklist, DeliveredBanner, DeliveredGame, DeliveredInline, DeliveredSwipeCards, DeliveredVideoFeed, DeliveredWidget, StoryBarStyle, StoryFrequency, StoryGroup, StorySurface, WidgetKind } from "../types";
import type { PlacementResult } from "./placements";

/** Tope por defecto (no «cada vez»): el del contrato. */
export const DEFAULT_FREQUENCY: StoryFrequency = { max_impressions: 5, window_hours: 168, min_gap_seconds: 0 };

// ─── Frecuencia por persona ─────────────────────────────────────────────────

type Exposures = Record<string, number[]>;

export type FrequencyTracker = {
  ready: Promise<void>;
  /** ¿Puede mostrarse ahora? Máx. N exposiciones en la ventana y separación mínima. */
  canShow(key: string, frequency?: StoryFrequency): boolean;
  /** Anota una exposición (impresión de un banner, apertura de un grupo). */
  record(key: string): void;
  count(key: string, windowHours: number): number;
  reset(): void;
};

/**
 * Frecuencia por PERSONA (persistida en el almacenamiento inyectado): aplica a stories y banners
 * (en Braze/OneSignal no aplica a in-app) y, sin configuración, con tope por defecto.
 * La clave incluye el id de la campaña; el servidor aplica además su propio tope por perfil.
 */
export function createFrequencyTracker(store: KeyValueStore | undefined, options: { namespace?: string; clock?: Pick<Clock, "now"> } = {}): FrequencyTracker {
  const key = `${options.namespace ?? "customy-stories"}:freq`;
  const clock = options.clock ?? systemClock;
  let data: Exposures = {};
  const ready = store ? readJson<{ v?: number; e?: Exposures }>(store, key, {}).then((p) => void (data = { ...(p.e ?? {}), ...data })) : Promise.resolve();
  const prune = (): void => {
    const horizon = clock.now() - 8760 * 3_600_000;
    for (const [k, list] of Object.entries(data)) {
      const kept = list.filter((t) => t > horizon).slice(-200);
      if (kept.length === 0) delete data[k];
      else data[k] = kept;
    }
  };
  return {
    ready,
    canShow(k, frequency = DEFAULT_FREQUENCY) {
      const list = data[k] ?? [];
      const now = clock.now();
      const inWindow = list.filter((t) => now - t < frequency.window_hours * 3_600_000);
      if (inWindow.length >= frequency.max_impressions) return false;
      const last = list[list.length - 1];
      if (frequency.min_gap_seconds > 0 && last !== undefined && now - last < frequency.min_gap_seconds * 1000) return false;
      return true;
    },
    record(k) {
      (data[k] ??= []).push(clock.now());
      prune();
      if (store) void Promise.resolve(store.set(key, JSON.stringify({ v: 1, e: data }))).catch(() => undefined);
    },
    count: (k, hours) => (data[k] ?? []).filter((t) => clock.now() - t < hours * 3_600_000).length,
    reset() {
      data = {};
      if (store) void Promise.resolve(store.remove(key)).catch(() => undefined);
    },
  };
}

// ─── Descartes de banners ───────────────────────────────────────────────────

export type DismissStore = {
  ready: Promise<void>;
  isDismissed(bannerId: string): boolean;
  dismiss(bannerId: string, until?: number): void;
};

/** Un banner descartado no vuelve hasta que caduque (o nunca si no tiene fecha). */
export function createDismissStore(store: KeyValueStore | undefined, options: { namespace?: string; clock?: Pick<Clock, "now"> } = {}): DismissStore {
  const key = `${options.namespace ?? "customy-stories"}:dismissed`;
  const clock = options.clock ?? systemClock;
  let data: Record<string, number> = {};
  const ready = store ? readJson<Record<string, number>>(store, key, {}).then((p) => void (data = { ...p, ...data })) : Promise.resolve();
  return {
    ready,
    isDismissed(id) {
      const until = data[id];
      if (until === undefined) return false;
      if (until !== 0 && until <= clock.now()) {
        delete data[id];
        return false;
      }
      return true;
    },
    dismiss(id, until = 0) {
      data[id] = until;
      if (store) void Promise.resolve(store.set(key, JSON.stringify(data))).catch(() => undefined);
    },
  };
}

// ─── Un overlay a la vez ────────────────────────────────────────────────────

export type OverlayGate = {
  /** Intenta tomar el overlay; devuelve `release` o `null` si otro lo tiene. */
  tryAcquire(owner: string): (() => void) | null;
  /** Espera su turno SIN descartar la petición (FIFO). */
  acquire(owner: string): Promise<() => void>;
  current(): string | null;
  subscribe(listener: () => void): () => void;
};

/** Un modal/visor a la vez en toda la app: los demás esperan o se difieren, no se pierden. */
export function createOverlayGate(): OverlayGate {
  let owner: string | null = null;
  const waiting: { owner: string; grant: (release: () => void) => void }[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((l) => l());
  const take = (who: string): (() => void) => {
    owner = who;
    notify();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      owner = null;
      notify();
      const next = waiting.shift();
      if (next) next.grant(take(next.owner));
    };
  };
  return {
    tryAcquire: (who) => (owner === null ? take(who) : null),
    acquire: (who) => (owner === null ? Promise.resolve(take(who)) : new Promise((grant) => waiting.push({ owner: who, grant }))),
    current: () => owner,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

// ─── Pausa por superficie ───────────────────────────────────────────────────

/** Además de las tres superficies, `"live"` (Ola 4) pausa solo las transmisiones en vivo: el módulo `./live` de los SDK nativos suelta el reproductor y no lo retoma hasta reanudar. */
export type PausableSurface = StorySurface | "live";

export type SurfaceControl = {
  /** Pausa una superficie (juego, vídeo, checkout): lo pendiente se DIFIERE, no se descarta. */
  pause(surface: PausableSurface | "all", reason?: string): void;
  resume(surface: PausableSurface | "all", reason?: string): void;
  isPaused(surface: PausableSurface): boolean;
  subscribe(listener: () => void): () => void;
};

export function createSurfaceControl(): SurfaceControl {
  const reasons = new Map<string, Set<string>>();
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((l) => l());
  const set = (s: string): Set<string> => reasons.get(s) ?? reasons.set(s, new Set()).get(s)!;
  return {
    pause(surface, reason = "app") {
      set(surface).add(reason);
      notify();
    },
    resume(surface, reason = "app") {
      set(surface).delete(reason);
      notify();
    },
    isPaused: (surface) => (reasons.get(surface)?.size ?? 0) > 0 || (reasons.get("all")?.size ?? 0) > 0,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

// ─── Selección de lo que se entrega ─────────────────────────────────────────

export type StoryBarDelivery = { style: StoryBarStyle; groups: StoryGroup[]; control: StoryGroup[] };

export type Delivery = {
  placementId: string;
  /** Barras listas para pintar (grupos ya sin control, sin los que superaron su frecuencia). */
  storyBars: StoryBarDelivery[];
  /** UN banner por placement (el de mayor prioridad elegible), o `null`. */
  banner: DeliveredBanner | null;
  /** Grupos y banners del grupo de control: registran impresión SIN renderizar. */
  control: { stories: StoryGroup[]; banners: DeliveredBanner[]; widgets: { kind: WidgetKind; id: string; variant_id?: string }[] };
  /**
   * Widgets de la Ola 3: UNO por tipo (el de mayor prioridad elegible), salvo `inline`, que lleva uno por ancla.
   * Un checklist no pasa por frecuencia (sigue ahí hasta completarse o descartarse); un tour sí.
   */
  widgets: { video_feed: DeliveredVideoFeed | null; swipe_cards: DeliveredSwipeCards | null; canvas: DeliveredCanvas | null; checklist: DeliveredChecklist | null; inline: DeliveredInline[]; game: DeliveredGame | null };
  /** Por qué se retuvo algo. `paused` significa DIFERIDO (se entrega al reanudar). */
  held: { paused: StorySurface[]; frequency: string[]; dismissed: string[] };
};

export type DeliveryContext = {
  frequency: Pick<FrequencyTracker, "canShow">;
  dismissed: Pick<DismissStore, "isDismissed">;
  surfaces?: Pick<SurfaceControl, "isPaused">;
  /** Lo ya hecho por la persona con un checklist (un checklist completo o descartado no vuelve). */
  progress?: { get(widgetId: string, server?: import("../types").WidgetProgress): import("../types").WidgetProgress };
};

export const storyFrequencyKey = (placementId: string, groupId: string): string => `story:${placementId}:${groupId}`;
export const widgetFrequencyKey = (placementId: string, widgetId: string): string => `widget:${placementId}:${widgetId}`;
export const bannerFrequencyKey = (placementId: string, bannerId: string): string => `banner:${placementId}:${bannerId}`;

/** Orden de los banners: prioridad (mayor gana) y, a igualdad, por id (determinista). */
export function compareBanners(a: DeliveredBanner, b: DeliveredBanner): number {
  return b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Reglas de entrega (§6.8): kill ya aplicado por el cliente de placements; pausa por superficie
 * que DIFIERE; frecuencia por persona con tope por defecto; UN banner por placement (un banner
 * no descartable no bloquea a los demás placements ni a los grupos de historias); el grupo de
 * control se separa para registrar impresión sin pintar.
 */
export function selectDelivery(result: Pick<PlacementResult, "placementId" | "widgets">, ctx: DeliveryContext): Delivery {
  const held: Delivery["held"] = { paused: [], frequency: [], dismissed: [] };
  const out: Delivery = { placementId: result.placementId, storyBars: [], banner: null, control: { stories: [], banners: [], widgets: [] }, widgets: { video_feed: null, swipe_cards: null, canvas: null, checklist: null, inline: [], game: null }, held };
  const candidates: DeliveredBanner[] = [];

  for (const w of result.widgets as DeliveredWidget[]) {
    if (w.kind === "story_bar") {
      if (ctx.surfaces?.isPaused("story")) {
        if (!held.paused.includes("story")) held.paused.push("story");
        continue;
      }
      const groups: StoryGroup[] = [];
      for (const g of w.items) {
        if (g.control) {
          out.control.stories.push(g);
          continue;
        }
        if (!g.pages || g.pages.length === 0) continue;
        if (!ctx.frequency.canShow(storyFrequencyKey(result.placementId, g.id), g.frequency)) {
          held.frequency.push(g.id);
          continue;
        }
        groups.push(g);
      }
      out.storyBars.push({ style: w.style, groups, control: [] });
    } else if (w.kind === "banner") {
      if (ctx.surfaces?.isPaused("banner")) {
        if (!held.paused.includes("banner")) held.paused.push("banner");
        continue;
      }
      for (const b of w.items) {
        if (b.control) {
          out.control.banners.push(b);
          continue;
        }
        if (!b.slides || b.slides.length === 0) continue;
        if (ctx.dismissed.isDismissed(b.id)) {
          held.dismissed.push(b.id);
          continue;
        }
        if (!ctx.frequency.canShow(bannerFrequencyKey(result.placementId, b.id), b.frequency)) {
          held.frequency.push(b.id);
          continue;
        }
        candidates.push(b);
      }
    } else {
      if (ctx.surfaces?.isPaused("widget")) {
        if (!held.paused.includes("widget")) held.paused.push("widget");
        continue;
      }
      selectWidgets(w, result.placementId, ctx, out);
    }
  }
  out.banner = candidates.sort(compareBanners)[0] ?? null;
  return out;
}

const byPriority = (a: { priority: number; id: string }, b: { priority: number; id: string }): number => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Un checklist está cerrado si se descartó o si todos sus ítems están hechos (un tour no: lo cierra la frecuencia). */
function checklistClosed(c: DeliveredChecklist, ctx: DeliveryContext): boolean {
  const p = ctx.progress?.get(c.id, c.progress) ?? c.progress;
  if (p?.dismissed) return true;
  if (c.config.mode !== "checklist" || !c.items) return false;
  const items = c.items.filter((i) => i.type === "item");
  return items.length > 0 && items.every((i) => p?.completed[i.id]);
}

function selectWidgets(w: Exclude<DeliveredWidget, { kind: "story_bar" | "banner" }>, placementId: string, ctx: DeliveryContext, out: Delivery): void {
  const { held } = out;
  const live: Array<(typeof w.items)[number]> = [];
  for (const e of w.items as Array<DeliveredVideoFeed | DeliveredSwipeCards | DeliveredCanvas | DeliveredChecklist | DeliveredInline | DeliveredGame>) {
    if (e.control) {
      out.control.widgets.push({ kind: w.kind, id: e.id, ...(e.variant_id ? { variant_id: e.variant_id } : {}) });
      continue;
    }
    // Un juego no lleva elementos: su configuración es el `config`.
    if (w.kind !== "game" && (!e.items || e.items.length === 0)) continue;
    if (ctx.dismissed.isDismissed(e.id)) {
      held.dismissed.push(e.id);
      continue;
    }
    if (w.kind === "checklist") {
      if (checklistClosed(e as DeliveredChecklist, ctx)) {
        held.dismissed.push(e.id);
        continue;
      }
      if ((e as DeliveredChecklist).config.mode === "tour" && !ctx.frequency.canShow(widgetFrequencyKey(placementId, e.id), e.frequency)) {
        held.frequency.push(e.id);
        continue;
      }
    } else if (!ctx.frequency.canShow(widgetFrequencyKey(placementId, e.id), e.frequency)) {
      held.frequency.push(e.id);
      continue;
    }
    live.push(e);
  }
  const sorted = (live as Array<{ priority: number; id: string }>).sort(byPriority);
  if (w.kind === "inline") {
    const seenAnchors = new Set<string>();
    for (const e of sorted as unknown as DeliveredInline[]) {
      const a = e.config.anchor;
      const k = a.type === "element" ? `${a.element_id}:${a.position}` : `${a.list_id}:${a.index}`;
      if (seenAnchors.has(k)) continue;
      seenAnchors.add(k);
      out.widgets.inline.push(e);
    }
  } else (out.widgets as Record<string, unknown>)[w.kind] = sorted[0] ?? null;
}
