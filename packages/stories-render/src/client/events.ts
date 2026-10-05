import { systemClock, type Clock, type TimerHandle } from "../clock";
import { readJson, type KeyValueStore } from "../store";
import type { BannerEvent } from "../banner";
import type { ViewerEvent } from "../viewer";
import type { StoryPlatform, StorySurface } from "../types";
import type { WidgetEvent } from "../widgets/common";
import { errorFromResponse, StoriesError } from "./errors";
import { STORIES_SDK_ID } from "./version";

/** Eventos de la superficie (contrato `storyClientEventSchema`): máx. 100 por lote. */
export const MAX_EVENTS_PER_BATCH = 100;

export type ConsentPurpose = "none" | "analytics" | "personalization" | "reminders" | "marketing" | "contact";

export type WireEvent = {
  event_id: string;
  type: string;
  channel: StorySurface;
  placement_id: string;
  campaign_id: string;
  occurred_at: string;
  control: boolean;
  variant_id?: string;
  page_id?: string;
  slide_id?: string;
  platform?: StoryPlatform;
  sdk?: string;
  locale?: string;
  [extra: string]: unknown;
};

export type EventContext = { placementId: string; channel: StorySurface; campaignId: string; variantId?: string };

export type Consent = {
  /** Versión del texto de consentimiento aceptado. */
  version: string;
  /** ISO 8601. */
  at: string;
  purposes: Partial<Record<ConsentPurpose, boolean>>;
};

export type EventQueueOptions = {
  baseUrl?: string;
  token: (forceRefresh?: boolean) => Promise<string>;
  fetch?: typeof fetch;
  platform?: StoryPlatform;
  locale?: string;
  store?: KeyValueStore;
  namespace?: string;
  clock?: Clock;
  /** Cada cuánto se envía lo pendiente. Por defecto 3 s. */
  flushIntervalMs?: number;
  /** Eventos por lote (1–100). Por defecto 20. */
  maxBatch?: number;
  /** Tope de la cola (se descartan los más antiguos al pasarlo). Por defecto 1000. */
  maxQueue?: number;
  maxRetries?: number;
  /** Generador de `event_id` (inyectable en pruebas). */
  newId?: () => string;
  /** Sesión del SDK: seudónimo aleatorio por arranque (no identifica a la persona); permite atribuir ingresos indirectos. Inyectable en pruebas. */
  sessionId?: string;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Consentimiento por propósito. Sin él, solo `none` y `analytics` salen; `personalization`,
   * `reminders`, `marketing` y `contact` exigen un consentimiento explícito (`purposes[p] === true`).
   */
  consent?: () => Consent | null | undefined;
  onError?: (error: unknown) => void;
};

const NEVER_BLOCKED: ConsentPurpose[] = ["none", "analytics"];

/** `event_id` aleatorio (22 caracteres base64url): único por evento y estable en los reintentos. */
export function randomEventId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Cola de eventos con lote IDEMPOTENTE: cada evento lleva su `event_id` desde que nace y el mismo
 * `event_id` viaja en cada reintento (el servidor deduplica); el lote lleva además una
 * `idempotency-key` derivada de sus ids. Se persiste (si hay `store`) para sobrevivir a una
 * recarga. Un lote que el servidor rechaza por inválido (4xx salvo 408/429) se descarta, no se
 * reintenta eternamente; red, 429 y 5xx se reintentan con espera y se conservan.
 */
export function createEventQueue(options: EventQueueOptions) {
  const baseUrl = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const clock = options.clock ?? systemClock;
  const ns = options.namespace ?? "customy-stories";
  const flushMs = options.flushIntervalMs ?? 3000;
  const maxBatch = Math.min(MAX_EVENTS_PER_BATCH, Math.max(1, options.maxBatch ?? 20));
  const maxQueue = options.maxQueue ?? 1000;
  const maxRetries = options.maxRetries ?? 2;
  const newId = options.newId ?? randomEventId;
  const sessionId = options.sessionId ?? randomEventId();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => clock.setTimeout(r, ms)));
  let queue: WireEvent[] = [];
  let timer: TimerHandle | null = null;
  let sending: Promise<void> | null = null;
  let hydrated: Promise<void> | null = null;
  let closed = false;
  const onceKeys = new Set<string>();
  // Respuestas de texto libre (`component_response` con `value` de texto): datos personales posibles que NUNCA se
  // escriben en el almacén persistente. Viajan desde memoria en el primer intento; si falla, se descartan (no se guardan «para después»).
  const ephemeral = new Set<string>();

  const hydrate = (): Promise<void> =>
    (hydrated ??= options.store
      ? readJson<{ events?: WireEvent[] }>(options.store, `${ns}:events`, {}).then((p) => {
          const saved = Array.isArray(p.events) ? p.events : [];
          const have = new Set(queue.map((e) => e.event_id));
          queue = [...saved.filter((e) => e && typeof e.event_id === "string" && !have.has(e.event_id)), ...queue];
        })
      : Promise.resolve());
  const persist = (): void => {
    if (!options.store) return;
    const durable = queue.filter((e) => !ephemeral.has(e.event_id));
    void Promise.resolve(options.store.set(`${ns}:events`, JSON.stringify({ events: durable }))).catch(() => undefined);
  };
  const report = (e: unknown): void => {
    try {
      options.onError?.(e);
    } catch {
      /* no rompe */
    }
  };

  function allowed(purpose: string | undefined): { ok: boolean; consent?: Consent | null } {
    if (!purpose || NEVER_BLOCKED.includes(purpose as ConsentPurpose)) return { ok: true, consent: options.consent?.() ?? null };
    const consent = options.consent?.() ?? null;
    return { ok: consent?.purposes[purpose as ConsentPurpose] === true, consent };
  }

  function schedule(): void {
    if (timer !== null || closed || queue.length === 0) return;
    timer = clock.setTimeout(() => {
      timer = null;
      void api.flush();
    }, flushMs);
  }

  async function post(batch: WireEvent[]): Promise<void> {
    const key = `evb_${batch[0]!.event_id}_${batch.length}`;
    let attempt = 0;
    let refreshed = false;
    for (;;) {
      let token: string;
      try {
        token = await options.token(refreshed);
      } catch (e) {
        throw new StoriesError("token", "no se pudo obtener el token de suscriptor", { cause: e });
      }
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/client/events`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json", "idempotency-key": key },
          body: JSON.stringify({ events: batch }),
          keepalive: true,
        });
      } catch (error) {
        if (attempt < maxRetries) {
          attempt += 1;
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw new StoriesError("network", (error as Error)?.message ?? "network error", { cause: error });
      }
      if (res.ok) return;
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await res.text().catch(() => "");
        continue;
      }
      const err = await errorFromResponse(res);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        attempt += 1;
        await sleep(err.retryAfterMs ?? 300 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  const api = {
    sessionId,
    /** Construye y encola un evento. Devuelve su `event_id`, o `null` si el consentimiento lo impide. */
    track(ctx: EventContext, event: { type: string; occurredAt?: Date | number | string; control?: boolean; pageId?: string; slideId?: string; purpose?: string } & Record<string, unknown>): string | null {
      if (closed) return null;
      const { type, occurredAt, control, pageId, slideId, purpose, ...rest } = event;
      const gate = allowed(purpose);
      if (!gate.ok) return null;
      const at = occurredAt instanceof Date ? occurredAt.toISOString() : typeof occurredAt === "number" ? new Date(occurredAt).toISOString() : (occurredAt ?? new Date(clock.now()).toISOString());
      const wire: WireEvent = {
        event_id: newId(),
        type,
        channel: ctx.channel,
        placement_id: ctx.placementId,
        campaign_id: ctx.campaignId,
        occurred_at: at,
        control: control ?? false,
        ...(ctx.variantId ? { variant_id: ctx.variantId } : {}),
        ...(pageId ? { page_id: pageId } : {}),
        ...(slideId ? { slide_id: slideId } : {}),
        ...(options.platform ? { platform: options.platform } : {}),
        sdk: STORIES_SDK_ID,
        session_id: sessionId,
        ...(options.locale ? { locale: options.locale } : {}),
        ...rest,
      };
      if (type === "component_response" && gate.consent) {
        wire.consent_version = gate.consent.version;
        wire.consented_at = gate.consent.at;
      }
      if (type === "component_response" && typeof wire.value === "string") ephemeral.add(wire.event_id);
      queue.push(wire);
      if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
      persist();
      if (queue.length >= maxBatch) void api.flush();
      else schedule();
      return wire.event_id;
    },
    /** Una vez por clave (p. ej. impresión de un grupo por sesión). Devuelve `true` si se emitió ahora. */
    once(key: string, fn: () => void): boolean {
      if (onceKeys.has(key)) return false;
      onceKeys.add(key);
      fn();
      return true;
    },
    /** El grupo de control registra la impresión SIN renderizar (`rendered: false`, `control: true`). */
    trackControl(ctx: EventContext): string | null {
      return api.once(`control:${ctx.placementId}:${ctx.campaignId}`, () => undefined)
        ? api.track(ctx, { type: "impression", control: true, rendered: false })
        : null;
    },
    /** Eventos del visor → eventos del contrato. */
    fromViewer(ctx: Omit<EventContext, "campaignId" | "channel" | "variantId">, e: ViewerEvent): string | null {
      const c: EventContext = { ...ctx, channel: "story", campaignId: e.groupId, variantId: e.variantId };
      const base = { pageId: e.pageId };
      switch (e.type) {
        case "view":
          return api.track(c, { type: "view", ...base });
        case "exit_page":
          return api.track(c, { type: "exit_page", ms: e.ms, pageId: e.pageId });
        case "next":
          return api.track(c, { type: "next", via: e.via, ...base });
        case "prev":
          return api.track(c, { type: "prev", via: e.via, ...base });
        case "complete":
          return api.track(c, { type: "complete", ...base });
        case "close":
          return api.track(c, { type: "close", ms: e.ms });
        case "share":
          return api.track(c, { type: "share", ...(e.target ? { target: e.target } : {}), ...base });
        case "watch_length":
          return api.track(c, { type: "watch_length", ms: e.ms });
        case "click":
          return api.track(c, { type: "click", element_id: e.elementId, ...(e.componentId ? { component_id: e.componentId } : {}), ...base });
        case "component_response":
          return api.track(c, {
            type: "component_response",
            component_id: e.componentId,
            ...(e.choiceId ? { choice_id: e.choiceId } : {}),
            ...(e.value !== undefined ? { value: e.value } : {}),
            consent_purpose: e.consentPurpose,
            purpose: e.consentPurpose,
            ...base,
          });
        case "product_viewed":
        case "wishlist_added":
          return api.track(c, { type: e.type, component_id: e.componentId, product: e.product, ...base });
        case "add_to_cart":
          return api.track(c, { type: "add_to_cart", component_id: e.componentId, product: e.product, quantity: e.quantity, ...base });
        case "report":
          return api.track(c, { type: "report", component_id: e.componentId, answer_id: e.answerId, reason: e.reason, ...base });
      }
    },
    /** Eventos del banner → eventos del contrato. */
    fromBanner(ctx: Omit<EventContext, "campaignId" | "channel" | "variantId">, e: BannerEvent): string | null {
      const c: EventContext = { ...ctx, channel: "banner", campaignId: e.bannerId, variantId: e.variantId };
      const slideId = e.slideId;
      switch (e.type) {
        case "impression":
          return api.once(`banner:${ctx.placementId}:${e.bannerId}`, () => undefined) ? api.track(c, { type: "impression", rendered: true, slideId }) : null;
        case "view":
          return api.track(c, { type: "view", slideId });
        case "click":
          return api.track(c, { type: "click", element_id: e.elementId, slideId });
        case "next":
        case "prev":
          return api.track(c, { type: e.type, via: e.via, slideId });
        case "dismiss":
          return api.track(c, { type: "dismiss", reason: e.reason, slideId });
      }
    },
    /** Eventos de un widget de la Ola 3 → eventos del contrato (canal `widget`). */
    fromWidget(ctx: { placementId: string }, e: WidgetEvent): string | null {
      const c: EventContext = { ...ctx, channel: "widget", campaignId: e.widgetId, variantId: e.variantId };
      const pageId = "itemId" in e ? e.itemId : undefined;
      switch (e.type) {
        case "impression":
          return api.once(`widget:${ctx.placementId}:${e.widgetId}`, () => undefined) ? api.track(c, { type: "impression", rendered: true }) : null;
        case "view":
        case "complete":
          return api.track(c, { type: e.type, pageId });
        case "click":
          return api.track(c, { type: "click", element_id: e.elementId, ...(e.itemId ? { component_id: e.itemId } : {}) });
        case "next":
        case "prev":
          return api.track(c, { type: e.type, via: e.via, pageId });
        case "playback":
          return api.track(c, { type: "playback", pageId: e.itemId, action: e.action });
        case "watch_length":
          return api.track(c, { type: "watch_length", ms: e.ms, pageId: e.itemId });
        case "share":
          return api.track(c, { type: "share", pageId: e.itemId, ...(e.target ? { target: e.target } : {}) });
        case "swipe":
          return api.track(c, { type: "swipe", direction: e.direction, via: e.via, product: e.product, ...(e.position !== undefined ? { position: e.position } : {}) });
        case "product":
          return api.track(c, { type: e.name, component_id: e.componentId ?? "cards", product: e.product, ...(e.quantity ? { quantity: e.quantity } : {}), ...(e.itemId ? { pageId: e.itemId } : {}) });
        case "checklist_item":
          return api.track(c, { type: "checklist_item", component_id: e.itemId, via: e.via });
        case "tour_step":
          return api.track(c, { type: "tour_step", component_id: e.stepId, step: e.step });
        case "dismiss":
          return api.track(c, { type: "dismiss", reason: e.reason });
      }
    },
    pending: (): number => queue.length,
    /** Envía lo pendiente en lotes. No lanza: un fallo deja los eventos en la cola (mismos `event_id`) o los descarta si el servidor los rechaza por inválidos. */
    async flush(): Promise<void> {
      if (sending) return sending;
      sending = (async () => {
        await hydrate();
        if (timer !== null) {
          clock.clearTimeout(timer);
          timer = null;
        }
        while (queue.length > 0) {
          const batch = queue.slice(0, maxBatch);
          try {
            await post(batch);
          } catch (error) {
            report(error);
            const rejected = error instanceof StoriesError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429 && error.status !== 401;
            if (rejected) {
              queue = queue.filter((e) => !batch.includes(e));
              for (const e of batch) ephemeral.delete(e.event_id);
              persist();
              continue;
            }
            // Sin red: lo de texto libre no espera en la cola (ni en disco ni en memoria); el resto se conserva.
            if (ephemeral.size) {
              queue = queue.filter((e) => !ephemeral.has(e.event_id));
              ephemeral.clear();
              persist();
            }
            schedule();
            return;
          }
          const sent = new Set(batch.map((e) => e.event_id));
          for (const id of sent) ephemeral.delete(id);
          queue = queue.filter((e) => !sent.has(e.event_id));
          persist();
        }
      })().finally(() => {
        sending = null;
      });
      return sending;
    },
    /** Recupera lo persistido por una sesión anterior y lo envía. */
    async resume(): Promise<void> {
      await hydrate();
      await api.flush();
    },
    async close(): Promise<void> {
      await api.flush();
      closed = true;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
  };
  return api;
}
export type EventQueue = ReturnType<typeof createEventQueue>;
