import { el, resolveUi, type UiOptions } from "../dom/util";
import { safeHttpsUrl } from "../safe-url";
import { systemClock, type Clock, type TimerHandle } from "../clock";
import type { ProductRef } from "../types";
import { fmt, resolveLiveMessages, type LiveMessages } from "./live-messages";

/**
 * Live (Ola 4): una transmisión de LiveKit dentro de un grupo de historias. MÓDULO OPCIONAL (`./widgets/live`): el núcleo no lo paga y
 * `livekit-client` NO es dependencia de este paquete: la app lo inyecta con `loadLiveKit: () => import("livekit-client")` y solo se
 * descarga al pulsar «Ver en vivo». El cliente nunca tiene una credencial de LiveKit: pide a Send un token de espectador (corto,
 * sin permiso de publicar) y se conecta con él.
 *
 * Tres capas, de adentro hacia afuera:
 *   1. `createLiveClient` — `/client/live/*` de Send (unirse, estado, latido, eventos de comercio, chat, reacciones).
 *   2. `createLiveController` — la máquina de estados SIN DOM (conectar, pausar, reconectar, degradar a repetición, latido de
 *      visionado, sondeo del estado, productos, chat). Probable con un LiveKit simulado.
 *   3. `mountLive` — el DOM accesible (región, insignia, pausa visible, subtítulos, productos, chat, reacciones, aviso).
 * Todo el texto de otras personas entra por `textContent`.
 */

// ─── Contrato mínimo con la app y con Send ──────────────────────────────────

/** Lo que Send añade al grupo (`live_session`): sin credenciales. Espejo de `DeliveredLive` del contrato. */
export type LiveMarker = {
  session_id: string;
  state: "scheduled" | "live" | "replay";
  title: string;
  description?: string;
  scheduled_at: string;
  started_at: string | null;
  ends_by: string | null;
  chat_mode: "off" | "reactions" | "premoderated" | "filtered";
  reactions: boolean;
  featured: ProductRef[];
  notice: { version: string; url: string } | null;
  replay: { url: string; poster: string; captions_url?: string; duration_seconds?: number } | null;
  transports: Array<"webrtc" | "hls">;
};

export type LiveReaction = "heart" | "fire" | "clap" | "laugh" | "wow";
export const LIVE_REACTIONS: readonly LiveReaction[] = ["heart", "fire", "clap", "laugh", "wow"];
export type LiveReportReason = "spam" | "harassment" | "hate" | "nudity" | "violence" | "illegal" | "minor_safety" | "personal_data" | "other";
export const LIVE_REPORT_REASONS: readonly LiveReportReason[] = ["spam", "harassment", "hate", "nudity", "violence", "illegal", "minor_safety", "personal_data", "other"];

export type LiveChatMessage = { id: string; text: string; label: string; at: string; mine: boolean };
export type LiveStateSnapshot = {
  session_id: string;
  state: "scheduled" | "live" | "ended" | "replay" | "closed" | "cancelled";
  featured: ProductRef[];
  chat: { mode: LiveMarker["chat_mode"]; messages: LiveChatMessage[]; next_cursor: string | null };
  reactions: Partial<Record<LiveReaction, number>>;
  audience_hint: number | null;
};
export type LiveJoin = { url: string; token: string; expires_in: number; identity: string; hls_url: string | null };

/** El contexto de comercio de un live: el MISMO que Swipe Cards/Stories (`storyCartAttributes`) más el componente `live-<id>`. */
export type LiveCommerceContext = { storyId: string; componentId: string };
export const liveComponentId = (sessionId: string): string => `live-${sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 34)}`;
export const liveCommerceContext = (groupId: string, sessionId: string): LiveCommerceContext => ({ storyId: groupId, componentId: liveComponentId(sessionId) });

// ─── Cliente de `/client/live/*` ────────────────────────────────────────────

export type LiveErrorCode =
  | "notice_required" | "live_not_live" | "live_full" | "live_unavailable" | "live_kill_switch" | "live_disabled" | "live_minors" | "live_placement_killed"
  | "chat_disabled" | "chat_rate_limited" | "chat_unavailable_minors" | "rejected_by_filter" | "muted" | "not_joined" | "reactions_disabled" | "reaction_rate_limited"
  | "invalid" | "network" | "unauthorized" | "not_found" | "server";

export class LiveError extends Error {
  readonly code: LiveErrorCode;
  readonly status: number;
  /** Con `notice_required`: la versión del aviso que hay que aceptar. */
  readonly requiredNoticeVersion?: string;
  constructor(code: LiveErrorCode, message: string, o: { status?: number; requiredNoticeVersion?: string } = {}) {
    super(message);
    this.name = "LiveError";
    this.code = code;
    this.status = o.status ?? 0;
    if (o.requiredNoticeVersion) this.requiredNoticeVersion = o.requiredNoticeVersion;
  }
}
const KNOWN = new Set<string>(["notice_required", "live_not_live", "live_full", "live_unavailable", "live_kill_switch", "live_disabled", "live_minors", "live_placement_killed", "chat_disabled", "chat_rate_limited", "chat_unavailable_minors", "rejected_by_filter", "muted", "not_joined", "reactions_disabled", "reaction_rate_limited"]);

export type LiveClientOptions = { baseUrl?: string; token: (forceRefresh?: boolean) => Promise<string>; fetch?: typeof fetch };

export function createLiveClient(options: LiveClientOptions) {
  const baseUrl = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        token = await options.token(attempt > 0);
      } catch (e) {
        throw new LiveError("unauthorized", `no se pudo obtener el token de suscriptor: ${(e as Error).message}`);
      }
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/client${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      } catch (e) {
        throw new LiveError("network", `sin conexión: ${(e as Error).message}`);
      }
      if (res.status === 401 && attempt === 0) continue;
      if (res.ok) return (await res.json()) as T;
      let payload: { name?: string; message?: string; required_notice_version?: string } = {};
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        /* sin cuerpo */
      }
      const code: LiveErrorCode = payload.name && KNOWN.has(payload.name) ? (payload.name as LiveErrorCode) : res.status === 401 || res.status === 403 ? "unauthorized" : res.status === 404 ? "not_found" : res.status === 422 ? "invalid" : "server";
      throw new LiveError(code, payload.message ?? `HTTP ${res.status}`, { status: res.status, requiredNoticeVersion: payload.required_notice_version });
    }
    throw new LiveError("unauthorized", "el token de suscriptor no fue aceptado", { status: 401 });
  }
  const p = (id: string) => `/live/${encodeURIComponent(id)}`;

  return {
    join: (id: string, input: { noticeVersion?: string; acceptedAt?: string } = {}) => call<LiveJoin>("POST", `${p(id)}/join`, { ...(input.noticeVersion ? { notice_version: input.noticeVersion } : {}), ...(input.acceptedAt ? { accepted_at: input.acceptedAt } : {}) }),
    state: (id: string, after?: string | null) => call<LiveStateSnapshot>("GET", `${p(id)}/state${after ? `?after=${encodeURIComponent(after)}` : ""}`),
    heartbeat: (id: string, seconds: number, state: "playing" | "paused" = "playing") => call<{ counted: boolean }>("POST", `${p(id)}/heartbeat`, { seconds, state }),
    events: (id: string, events: Array<{ event_id: string; type: "product_viewed" | "product_click" | "add_to_cart" | "wishlist_added"; product: ProductRef; quantity?: number }>) => call<{ accepted: number }>("POST", `${p(id)}/events`, { events }),
    sendChat: (id: string, text: string) => call<{ id: string; status: "pending" | "approved" }>("POST", `${p(id)}/chat`, { text }),
    deleteChat: (id: string, messageId: string) => call<{ id: string }>("DELETE", `${p(id)}/chat/${encodeURIComponent(messageId)}`),
    reportChat: (id: string, messageId: string, reason: LiveReportReason) => call<{ counted: boolean }>("POST", `${p(id)}/chat/${encodeURIComponent(messageId)}/report`, { reason }),
    blockChat: (id: string, messageId: string) => call<{ already_blocked: boolean }>("POST", `${p(id)}/chat/${encodeURIComponent(messageId)}/block`, {}),
    react: (id: string, reaction: LiveReaction) => call<{ ok: boolean }>("POST", `${p(id)}/reactions`, { reaction }),
  };
}
export type LiveClient = ReturnType<typeof createLiveClient>;

// ─── LiveKit inyectado (tipos estructurales: el paquete no depende de livekit-client) ──

export type LiveKitTrackLike = { kind: string; attach(element?: HTMLMediaElement): HTMLMediaElement; detach(element?: HTMLMediaElement): unknown };
export type LiveKitPublicationLike = { setSubscribed?(subscribed: boolean): void; track?: LiveKitTrackLike; kind?: string };
export type LiveKitRoomLike = {
  connect(url: string, token: string, options?: Record<string, unknown>): Promise<unknown>;
  disconnect(stopTracks?: boolean): unknown;
  on(event: string, handler: (...args: never[]) => void): unknown;
  remoteParticipants?: Map<string, { trackPublications?: Map<string, LiveKitPublicationLike> }>;
};
export type LiveKitModule = { Room: new (options?: Record<string, unknown>) => LiveKitRoomLike; RoomEvent?: Record<string, string> };

// ─── Controlador (sin DOM) ──────────────────────────────────────────────────

export type LiveState = "idle" | "needs_notice" | "connecting" | "waiting_host" | "playing" | "paused" | "reconnecting" | "ended" | "replay" | "full" | "unavailable" | "error";

export type LiveProductEvent = { name: "product_viewed" | "product_click" | "add_to_cart" | "wishlist_added"; product: ProductRef; quantity?: number; context: LiveCommerceContext };

export type LiveControllerOptions = {
  live: LiveMarker;
  groupId: string;
  client: Pick<LiveClient, "join" | "state" | "heartbeat" | "events" | "sendChat" | "deleteChat" | "reportChat" | "blockChat" | "react">;
  /** `() => import("livekit-client")`: lo pone la app; solo se llama al entrar. */
  loadLiveKit: () => Promise<LiveKitModule>;
  clock?: Clock;
  /** Dónde se pinta el vídeo (el controlador adjunta ahí las pistas). */
  stage?: HTMLElement;
  /** `true` si la pestaña no se ve (por defecto `document.hidden`). */
  isHidden?: () => boolean;
  onVisibility?: (cb: () => void) => () => void;
  pollMs?: number;
  heartbeatMs?: number;
  maxReconnects?: number;
  onState?: (state: LiveState, detail?: { error?: LiveError }) => void;
  onSnapshot?: (s: LiveStateSnapshot) => void;
  /** El evento de comercio con su contexto: la app lo manda a su analítica y al carrito (`storyCartAttributes(context)`). */
  onProduct?: (e: LiveProductEvent) => void;
  /** Texto de subtítulos (transcripción de LiveKit), si la sala los publica. */
  onCaption?: (text: string) => void;
  /** El live terminó: la app vuelve a pedir el placement (ahí llega la repetición, si la hay). */
  onEnded?: (state: "ended" | "replay") => void;
};

/** El transporte de medios que el controlador no conoce: LiveKit en el DOM (aquí), `@livekit/react-native` o el SDK Swift (SDK nativos). */
export type LiveTransportHandlers = {
  /** Se adjuntó una pista (`video`: es de vídeo). */
  onAttached: (video: boolean) => void;
  /** Se soltó una pista; `videoLeft`: si aún queda alguna de vídeo. */
  onDetached: (videoLeft: boolean) => void;
  onCaption: (text: string) => void;
  onReconnecting: () => void;
  onReconnected: () => void;
  onDisconnected: () => void;
};
export type LiveTransport = {
  connect(join: { url: string; token: string }, handlers: LiveTransportHandlers): Promise<void>;
  /** `false` pausa el medio y la suscripción a las pistas; `true` los restaura. */
  setPlaying(on: boolean): void;
  /** Desconecta y suelta las pistas (sin avisar a los manejadores). */
  close(): Promise<void> | void;
};

export type LiveCoreOptions = Omit<LiveControllerOptions, "loadLiveKit" | "stage"> & { openTransport: () => Promise<LiveTransport> | LiveTransport };

const UNAVAILABLE_CODES: readonly LiveErrorCode[] = ["live_kill_switch", "live_disabled", "live_minors", "live_unavailable", "live_placement_killed"];
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const MAX_CHAT_KEPT = 200;
const SEND_WINDOW_MS = 60_000;
const SEND_MAX = 6;

export function createLiveCore(o: LiveCoreOptions) {
  const clock = o.clock ?? systemClock;
  const id = o.live.session_id;
  const pollMs = o.pollMs ?? 5000;
  const heartbeatMs = o.heartbeatMs ?? 15_000;
  const maxReconnects = o.maxReconnects ?? BACKOFF_MS.length;
  let state: LiveState = "idle";
  let transport: LiveTransport | null = null;
  let noticeAccepted = !o.live.notice;
  let acceptedAt: string | null = null;
  let userPaused = false;
  let leaving = false;
  let destroyed = false;
  let hasVideo = false;
  let cursor: string | null = null;
  let snapshot: LiveStateSnapshot | null = null;
  let lastBeat = 0;
  let attempts = 0;
  const messages: LiveChatMessage[] = [];
  const timers: TimerHandle[] = [];
  const sentAt: number[] = [];
  const queue: Array<{ event_id: string; type: LiveProductEvent["name"]; product: ProductRef; quantity?: number }> = [];
  let eventSeq = 0;
  let flushTimer: TimerHandle | null = null;
  let offVisibility: (() => void) | null = null;
  let lastReactAt = 0;

  const hidden = () => (o.isHidden ? o.isHidden() : typeof document !== "undefined" && document.hidden);
  const set = (next: LiveState, error?: LiveError) => {
    if (destroyed || next === state) return;
    state = next;
    o.onState?.(next, error ? { error } : undefined);
  };
  const later = (fn: () => void, ms: number) => {
    const h = clock.setTimeout(() => { if (!destroyed) fn(); }, ms);
    timers.push(h);
    return h;
  };

  const mediaPlaying = (on: boolean) => {
    // Pausar también deja de gastar ancho de banda: el transporte baja la suscripción a las pistas.
    try { transport?.setPlaying(on); } catch { /* ya cerrado */ }
  };
  const handlers: Omit<LiveTransportHandlers, "onDisconnected"> = {
    onAttached(video) {
      if (video) hasVideo = true;
      if (state === "connecting" || state === "waiting_host" || state === "reconnecting") set(userPaused ? "paused" : "playing");
    },
    onDetached(videoLeft) {
      if (!videoLeft) {
        hasVideo = false;
        if (state === "playing") set("waiting_host");
      }
    },
    onCaption: (text) => o.onCaption?.(text),
    onReconnecting: () => set("reconnecting"),
    onReconnected: () => set(userPaused ? "paused" : hasVideo ? "playing" : "waiting_host"),
  };

  async function degrade(to: "ended" | "replay") {
    await closeRoom();
    set(to);
    o.onEnded?.(to);
  }
  async function closeRoom() {
    stopLoops();
    const t = transport;
    transport = null;
    hasVideo = false;
    try { await t?.close(); } catch { /* ya cerrada */ }
  }

  // ─── Sondeo del estado y latido ───────────────────────────────────────
  function stopLoops() {
    for (const h of timers.splice(0)) clock.clearTimeout(h);
    if (flushTimer) clock.clearTimeout(flushTimer);
    flushTimer = null;
  }
  async function poll() {
    if (destroyed || leaving || !transport) return;
    try {
      const s = await o.client.state(id, cursor);
      snapshot = s;
      cursor = s.chat.next_cursor ?? cursor;
      for (const m of s.chat.messages) if (!messages.some((x) => x.id === m.id)) messages.push(m);
      if (messages.length > MAX_CHAT_KEPT) messages.splice(0, messages.length - MAX_CHAT_KEPT);
      o.onSnapshot?.(s);
      if (s.state !== "live") return void (await degrade(s.state === "replay" ? "replay" : "ended"));
    } catch (e) {
      // Un 404/409 del servidor es «ya no está»; una red caída se reintenta en el siguiente turno.
      if (e instanceof LiveError && (e.code === "not_found" || e.code === "live_not_live")) return void (await degrade("ended"));
      // El interruptor de la cuenta, de la superficie o la política de menores cierran la sala: no se ofrece reintentar.
      if (e instanceof LiveError && UNAVAILABLE_CODES.includes(e.code)) {
        await closeRoom();
        return set("unavailable", e);
      }
    }
    later(poll, pollMs);
  }
  async function beat() {
    if (destroyed || leaving || !transport) return;
    const now = clock.now();
    if (state === "playing" && !hidden()) {
      const seconds = Math.min(60, Math.max(1, Math.round((now - lastBeat) / 1000)));
      lastBeat = now;
      void o.client.heartbeat(id, seconds, "playing").catch(() => undefined);
    } else lastBeat = now;
    later(beat, heartbeatMs);
  }

  // ─── Conectar, reconectar, salir ──────────────────────────────────────
  async function connect(): Promise<void> {
    set(attempts > 0 ? "reconnecting" : "connecting");
    let join: LiveJoin;
    try {
      join = await o.client.join(id, { ...(o.live.notice ? { noticeVersion: o.live.notice.version } : {}), ...(acceptedAt ? { acceptedAt } : {}) });
    } catch (e) {
      const err = e instanceof LiveError ? e : new LiveError("server", String(e));
      if (err.code === "live_full") return set("full", err);
      if (err.code === "live_not_live" || err.code === "not_found") return void (await degrade("ended"));
      if (err.code === "notice_required") { noticeAccepted = false; return set("needs_notice", err); }
      if (UNAVAILABLE_CODES.includes(err.code) || err.code === "unauthorized") return set("unavailable", err);
      if (err.code === "network" && attempts < maxReconnects) return retry();
      return set("error", err);
    }
    let next: LiveTransport | null = null;
    try {
      next = await o.openTransport();
      const mine = next;
      transport = mine;
      await mine.connect({ url: join.url, token: join.token }, { ...handlers, onDisconnected: () => { if (!leaving && !destroyed && transport === mine) { transport = null; void retry(); } } });
      attempts = 0;
      lastBeat = clock.now();
      set(userPaused ? "paused" : hasVideo ? "playing" : "waiting_host");
      later(poll, 800);
      later(beat, heartbeatMs);
    } catch (e) {
      transport = null;
      try { await next?.close(); } catch { /* ya cerrada */ }
      if (attempts < maxReconnects) return retry();
      set("error", new LiveError("network", (e as Error).message));
    }
  }
  async function retry() {
    if (leaving || destroyed) return;
    stopLoops();
    if (attempts >= maxReconnects) return set("error", new LiveError("network", "no se pudo reconectar"));
    const wait = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]!;
    attempts++;
    set("reconnecting");
    later(() => void connect(), wait);
  }

  offVisibility = o.onVisibility?.(() => {
    if (state !== "playing" && state !== "paused") return;
    // Pestaña oculta: se pausa la reproducción (sin tocar la pausa que eligió la persona); al volver, se reanuda.
    if (hidden()) mediaPlaying(false);
    else if (!userPaused) mediaPlaying(true);
  }) ?? null;

  function flush() {
    flushTimer = null;
    const batch = queue.splice(0, 20);
    if (!batch.length) return;
    o.client.events(id, batch).catch(() => { if (queue.length < 100) queue.unshift(...batch); });
    if (queue.length) flushTimer = clock.setTimeout(flush, 500);
  }

  return {
    get state() { return state; },
    get snapshot() { return snapshot; },
    get messages() { return messages.slice(); },
    get hasVideo() { return hasVideo; },
    get paused() { return userPaused; },
    get noticeAccepted() { return noticeAccepted; },

    /** La persona aceptó el aviso (versión vigente y hora). Sin él no se pide token. */
    acceptNotice() {
      noticeAccepted = true;
      acceptedAt = new Date(clock.now()).toISOString();
      if (state === "needs_notice") set("idle");
    },
    /** Entra: pide el token, carga LiveKit y se conecta. Debe llamarse desde un gesto de la persona (el sonido lo exige). */
    async join(): Promise<void> {
      if (destroyed) return;
      if (o.live.state === "replay") return void set("replay");
      if (o.live.state !== "live") return void set("idle");
      if (o.live.notice && !noticeAccepted) return void set("needs_notice");
      leaving = false;
      attempts = 0;
      await connect();
    },
    pause() {
      if (userPaused || (state !== "playing" && state !== "waiting_host")) return;
      userPaused = true;
      mediaPlaying(false);
      void o.client.heartbeat(id, 1, "paused").catch(() => undefined);
      set("paused");
    },
    resume() {
      if (!userPaused) return;
      userPaused = false;
      lastBeat = clock.now();
      if (!hidden()) mediaPlaying(true);
      set(hasVideo ? "playing" : "waiting_host");
    },
    /** Kill switch (de la app o del servidor): suelta la sala y deja el live como no disponible. */
    async kill() {
      leaving = true;
      await closeRoom();
      set("unavailable");
    },
    async leave() {
      leaving = true;
      await closeRoom();
      set("idle");
    },
    async destroy() {
      leaving = true;
      offVisibility?.();
      await closeRoom();
      destroyed = true;
    },

    /** Un evento de comercio: sale a la app (con el contexto del carrito) y a Send (idempotente por `event_id`). */
    product(name: LiveProductEvent["name"], product: ProductRef, quantity?: number) {
      o.onProduct?.({ name, product, ...(quantity ? { quantity } : {}), context: liveCommerceContext(o.groupId, id) });
      queue.push({ event_id: `${id.slice(-12)}-${clock.now().toString(36)}-${(eventSeq++).toString(36)}`, type: name, product, ...(quantity ? { quantity } : {}) });
      if (!flushTimer) flushTimer = clock.setTimeout(flush, 300);
    },

    /** Mensaje de chat. El tope por minuto es un aviso local; el que manda es el del servidor. */
    async send(text: string): Promise<{ id: string; status: "pending" | "approved" }> {
      const clean = text.trim();
      if (!clean) throw new LiveError("invalid", "mensaje vacío");
      const now = clock.now();
      while (sentAt.length && now - sentAt[0]! > SEND_WINDOW_MS) sentAt.shift();
      if (sentAt.length >= SEND_MAX) throw new LiveError("chat_rate_limited", "demasiados mensajes por minuto");
      sentAt.push(now);
      return o.client.sendChat(id, clean.slice(0, 200));
    },
    deleteMine: (messageId: string) => o.client.deleteChat(id, messageId).then((r) => { const i = messages.findIndex((m) => m.id === messageId); if (i >= 0) messages.splice(i, 1); return r; }),
    report: (messageId: string, reason: LiveReportReason) => o.client.reportChat(id, messageId, reason),
    async block(messageId: string) {
      const r = await o.client.blockChat(id, messageId);
      const i = messages.findIndex((m) => m.id === messageId);
      if (i >= 0) messages.splice(i, 1);
      return r;
    },
    /** Una reacción; como mucho una cada 400 ms (el servidor tiene su propio tope). */
    async react(reaction: LiveReaction): Promise<boolean> {
      const now = clock.now();
      if (now - lastReactAt < 400) return false;
      lastReactAt = now;
      await o.client.react(id, reaction);
      return true;
    },
  };
}

/** El transporte de LiveKit en el DOM (`livekit-client` inyectado): adjunta las pistas al escenario. */
function createDomTransport(module: LiveKitModule, stage: HTMLElement | undefined, title: string): LiveTransport {
  const room = new module.Room({ adaptiveStream: true, dynacast: true });
  const attached = new Map<LiveKitTrackLike, HTMLMediaElement>();
  let h: LiveTransportHandlers | null = null;
  let closed = false;
  const ev = (name: string, fallback: string) => module.RoomEvent?.[name] ?? fallback;
  const videoLeft = () => Array.from(attached.keys()).some((t) => t.kind === "video");
  const detach = (track: LiveKitTrackLike) => {
    const element = attached.get(track);
    try { track.detach(element); } catch { /* ya liberada */ }
    element?.remove();
    attached.delete(track);
  };
  return {
    async connect(join, handlers) {
      h = handlers;
      room.on(ev("TrackSubscribed", "trackSubscribed"), ((track: LiveKitTrackLike) => {
        if (track.kind !== "video" && track.kind !== "audio") return;
        const element = track.attach();
        if (track.kind === "video") {
          element.setAttribute("playsinline", "");
          element.setAttribute("class", "cs-live__video");
          element.setAttribute("aria-label", title);
        } else element.setAttribute("class", "cs-live__audio");
        attached.set(track, element);
        stage?.append(element);
        if (!closed) h?.onAttached(track.kind === "video");
      }) as never);
      room.on(ev("TrackUnsubscribed", "trackUnsubscribed"), ((track: LiveKitTrackLike) => { detach(track); if (!closed) h?.onDetached(videoLeft()); }) as never);
      room.on(ev("Reconnecting", "reconnecting"), (() => { if (!closed) h?.onReconnecting(); }) as never);
      room.on(ev("Reconnected", "reconnected"), (() => { if (!closed) h?.onReconnected(); }) as never);
      room.on(ev("TranscriptionReceived", "transcriptionReceived"), ((segments: Array<{ text?: string; final?: boolean }>) => {
        const text = segments?.filter((s) => s.final !== false).map((s) => s.text ?? "").join(" ").trim();
        if (text && !closed) h?.onCaption(text);
      }) as never);
      room.on(ev("Disconnected", "disconnected"), (() => { if (!closed) h?.onDisconnected(); }) as never);
      await room.connect(join.url, join.token, { autoSubscribe: true });
    },
    setPlaying(on) {
      for (const element of attached.values()) {
        try {
          if (on) void element.play?.()?.catch?.(() => undefined);
          else element.pause?.();
        } catch { /* jsdom y similares */ }
      }
      for (const participant of room.remoteParticipants?.values() ?? []) for (const pub of participant.trackPublications?.values() ?? []) pub.setSubscribed?.(on);
    },
    async close() {
      closed = true;
      for (const t of [...attached.keys()]) detach(t);
      try { await room.disconnect(true); } catch { /* ya cerrada */ }
    },
  };
}

export function createLiveController(o: LiveControllerOptions) {
  let module: LiveKitModule | null = null;
  const { loadLiveKit, stage, ...rest } = o;
  return createLiveCore({
    ...rest,
    openTransport: async () => {
      module = module ?? (await loadLiveKit());
      return createDomTransport(module, stage, o.live.title);
    },
  });
}
export type LiveController = ReturnType<typeof createLiveCore>;

// ─── Mensajes de error y cuenta atrás (puras) ───────────────────────────────

export function liveErrorText(error: unknown, m: LiveMessages): string {
  if (!(error instanceof LiveError)) return m.errGeneric;
  switch (error.code) {
    case "chat_rate_limited": case "reaction_rate_limited": return m.chatRateLimited;
    case "rejected_by_filter": return m.chatRefused;
    case "muted": return m.chatMuted;
    case "live_full": return m.full;
    case "live_kill_switch": case "live_disabled": case "live_minors": case "live_unavailable": case "live_placement_killed": case "chat_disabled": case "chat_unavailable_minors": case "reactions_disabled": return m.unavailable;
    case "live_not_live": return m.ended;
    case "network": return m.errNetwork;
    default: return m.errGeneric;
  }
}

/** «Empieza en 12 min» / «en un momento» / la fecha, según lo cerca que esté. */
export function startsText(scheduledAt: string, nowMs: number, m: LiveMessages, locale?: string): string {
  const at = Date.parse(scheduledAt);
  if (!Number.isFinite(at)) return "";
  const minutes = Math.ceil((at - nowMs) / 60_000);
  if (minutes <= 0) return m.startsNow;
  if (minutes <= 60) return fmt(m.startsIn, { n: minutes });
  let when = new Date(at).toISOString();
  try { when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(at)); } catch { /* locale inválido */ }
  return fmt(m.startsAt, { when });
}

// ─── DOM ────────────────────────────────────────────────────────────────────

export type LiveProductInfo = { title: string; price?: string; image?: string };

export type LiveMountOptions = UiOptions & {
  live: LiveMarker;
  groupId: string;
  client: LiveControllerOptions["client"];
  loadLiveKit: LiveControllerOptions["loadLiveKit"];
  messages?: Partial<LiveMessages>;
  /** Nombre, precio y foto de un producto (los resuelve la app contra Commerce); sin esto se muestra su id. */
  productInfo?: (ref: ProductRef) => LiveProductInfo | null;
  onProduct?: LiveControllerOptions["onProduct"];
  onEnded?: LiveControllerOptions["onEnded"];
  onState?: LiveControllerOptions["onState"];
  /** Pedir el placement de nuevo (la repetición llega ahí). */
  onRefetch?: () => void;
  pollMs?: number;
  heartbeatMs?: number;
};

const REACTION_GLYPH: Record<LiveReaction, string> = { heart: "❤", fire: "🔥", clap: "👏", laugh: "😂", wow: "😮" };

/** Pinta el live. Devuelve el controlador y `destroy()` (cierra la sala y suelta las pistas). */
export function mountLive(container: HTMLElement, options: LiveMountOptions): { controller: LiveController; destroy: () => Promise<void> } {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const clock = options.clock ?? systemClock;
  const m = resolveLiveMessages(options.locale, options.messages);
  const live = options.live;
  const root = el(doc, "section", { class: "cs-live", role: "region", "aria-label": fmt(m.region, { title: live.title }), dir: rtl ? "rtl" : undefined, "data-state": live.state, "data-reduced-motion": reducedMotion ? "true" : undefined });
  const badge = el(doc, "span", { class: "cs-live__badge", "data-kind": live.state }, live.state === "live" ? m.liveBadge : live.state === "replay" ? m.replayBadge : m.soonBadge);
  const status = el(doc, "p", { class: "cs-live__status", role: "status", "aria-live": "polite" });
  const stage = el(doc, "div", { class: "cs-live__stage" });
  const controls = el(doc, "div", { class: "cs-live__controls", role: "group", "aria-label": live.title });
  const header = el(doc, "header", { class: "cs-live__head" }, badge, el(doc, "h2", { class: "cs-live__title" }, live.title));
  root.append(header, stage, status, controls);
  container.append(root);
  const say = (text: string) => { status.textContent = text; };

  // ── Repetición: un vídeo normal con sus controles y subtítulos ──
  if (live.state === "replay" && live.replay) {
    const video = el(doc, "video", { class: "cs-live__video", controls: true, playsinline: true, preload: "metadata", poster: safeHttpsUrl(live.replay.poster), src: safeHttpsUrl(live.replay.url), "aria-label": live.title });
    if (safeHttpsUrl(live.replay.captions_url)) video.append(el(doc, "track", { kind: "captions", src: safeHttpsUrl(live.replay.captions_url), default: true, label: m.captionsRegion }));
    stage.append(video);
    if (live.notice) root.append(el(doc, "p", { class: "cs-live__note" }, m.recordingNotice));
    return { controller: noopController(options), destroy: async () => root.remove() };
  }

  // ── Aún no empieza: título, hora y cuenta atrás (sin conectarse a nada) ──
  if (live.state === "scheduled") {
    const when = el(doc, "p", { class: "cs-live__when" });
    const tick = () => { when.textContent = startsText(live.scheduled_at, clock.now(), m, options.locale); };
    tick();
    const handle = win.setInterval(tick, 30_000);
    root.append(when);
    return { controller: noopController(options), destroy: async () => { win.clearInterval(handle); root.remove(); } };
  }

  // ── En vivo ──
  const captions = el(doc, "p", { class: "cs-live__captions", "aria-label": m.captionsRegion, "aria-live": "off", hidden: true });
  stage.append(captions);
  const controller = createLiveController({
    live,
    groupId: options.groupId,
    client: options.client,
    loadLiveKit: options.loadLiveKit,
    clock,
    stage,
    pollMs: options.pollMs,
    heartbeatMs: options.heartbeatMs,
    onVisibility: (cb) => { doc.addEventListener("visibilitychange", cb); return () => doc.removeEventListener("visibilitychange", cb); },
    isHidden: () => doc.hidden,
    onProduct: options.onProduct,
    onCaption: (text) => { captions.textContent = text; },
    onEnded: (to) => { options.onEnded?.(to); options.onRefetch?.(); },
    onState: (s, d) => { render(s, d?.error); options.onState?.(s, d); },
    onSnapshot: (s) => renderSnapshot(s),
  });

  const button = (label: string, cls: string, onClick: () => void, extra: Record<string, string | boolean> = {}) => {
    const b = el(doc, "button", { type: "button", class: `cs-btn cs-live__btn ${cls}`, "aria-label": label, title: label, ...extra }, label);
    b.addEventListener("click", onClick);
    return b;
  };
  const gate = el(doc, "div", { class: "cs-live__gate" });
  const watchBtn = button(m.watch, "cs-live__watch", () => { void controller.join(); });
  const noticeBox = live.notice ? el(doc, "input", { type: "checkbox", id: `cs-live-notice-${live.session_id}`, class: "cs-live__check" }) : null;
  if (live.notice && noticeBox) {
    watchBtn.setAttribute("disabled", "");
    noticeBox.addEventListener("change", () => {
      if (noticeBox.checked) { controller.acceptNotice(); watchBtn.removeAttribute("disabled"); } else watchBtn.setAttribute("disabled", "");
    });
    gate.append(el(doc, "label", { class: "cs-live__notice", for: noticeBox.id }, noticeBox, m.noticeCheck));
    const noticeHref = safeHttpsUrl(live.notice.url);
    if (noticeHref) gate.append(el(doc, "a", { class: "cs-live__link", href: noticeHref, target: "_blank", rel: "noopener noreferrer" }, m.noticeLink));
    if (live.replay === null && live.notice) gate.append(el(doc, "p", { class: "cs-live__note" }, m.recordingNotice));
  }
  gate.append(watchBtn);
  root.insertBefore(gate, status);

  const pauseBtn = button(m.pause, "cs-live__pause", () => { if (controller.paused) controller.resume(); else controller.pause(); }, { "aria-pressed": "false", hidden: true });
  const muteBtn = button(m.mute, "cs-live__mute", () => {
    const muted = muteBtn.getAttribute("aria-pressed") !== "true";
    stage.querySelectorAll("video,audio").forEach((n) => { (n as HTMLMediaElement).muted = muted; });
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.textContent = muteBtn.title = muted ? m.unmute : m.mute;
    muteBtn.setAttribute("aria-label", muted ? m.unmute : m.mute);
  }, { "aria-pressed": "false", hidden: true });
  const ccBtn = button(m.captionsOn, "cs-live__cc", () => {
    const show = captions.hasAttribute("hidden");
    if (show) captions.removeAttribute("hidden"); else captions.setAttribute("hidden", "");
    ccBtn.setAttribute("aria-pressed", String(show));
    ccBtn.textContent = ccBtn.title = show ? m.captionsOff : m.captionsOn;
    ccBtn.setAttribute("aria-label", ccBtn.title);
  }, { "aria-pressed": "false", hidden: true });
  const leaveBtn = button(m.leave, "cs-live__leave cs-btn--ghost", () => { void controller.leave(); }, { hidden: true });
  const retryBtn = button(m.retry, "cs-live__retry", () => { void controller.join(); }, { hidden: true });
  controls.append(pauseBtn, muteBtn, ccBtn, leaveBtn, retryBtn);
  const audience = el(doc, "p", { class: "cs-live__audience", "aria-live": "off" });
  const rail = el(doc, "section", { class: "cs-live__products", "aria-label": m.featured, hidden: true });
  const reactionsBar = el(doc, "div", { class: "cs-live__reactions", role: "group", "aria-label": m.reactionsRegion, hidden: true });
  const chat = el(doc, "section", { class: "cs-live__chat", "aria-label": m.chatTitle, hidden: true });
  const log = el(doc, "ol", { class: "cs-live__log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  const chatStatus = el(doc, "p", { class: "cs-live__chatstatus", role: "status", "aria-live": "polite" });
  const input = el(doc, "input", { type: "text", class: "cs-live__input", maxlength: 200, "aria-label": m.chatInput, placeholder: m.chatInput, autocomplete: "off" });
  const form = el(doc, "form", { class: "cs-live__form" }, input, el(doc, "button", { type: "submit", class: "cs-btn cs-live__btn" }, m.chatSend));
  chat.append(el(doc, "h3", { class: "cs-live__chat-title" }, m.chatTitle), log, chatStatus, form);
  root.append(audience, rail, reactionsBar, chat);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    input.value = "";
    chatStatus.textContent = "";
    controller.send(text).then((r) => { chatStatus.textContent = r.status === "pending" ? m.chatPending : ""; }, (e) => { input.value = text; chatStatus.textContent = liveErrorText(e, m); });
  });

  // Reacciones: botones con nombre; la animación flotante solo sin «reducir movimiento».
  const counts = new Map<LiveReaction, HTMLElement>();
  for (const r of LIVE_REACTIONS) {
    const count = el(doc, "span", { class: "cs-live__count", "aria-hidden": "true" }, "");
    counts.set(r, count);
    const b = el(doc, "button", { type: "button", class: "cs-btn cs-live__react", "aria-label": m.reactionNames[r], title: m.reactionNames[r] }, el(doc, "span", { "aria-hidden": "true" }, REACTION_GLYPH[r]), count);
    b.addEventListener("click", () => {
      controller.react(r).then((sent) => {
        if (sent && !reducedMotion) {
          const f = el(doc, "span", { class: "cs-live__float", "aria-hidden": "true" }, REACTION_GLYPH[r]);
          b.append(f);
          win.setTimeout(() => f.remove(), 1200);
        }
      }, (e) => { chatStatus.textContent = liveErrorText(e, m); });
    });
    reactionsBar.append(b);
  }

  const productCard = (ref: ProductRef) => {
    const info = options.productInfo?.(ref) ?? { title: ref.external_id };
    const li = el(doc, "li", { class: "cs-live__product", "data-product": `${ref.connector}:${ref.external_id}` });
    if (safeHttpsUrl(info.image)) li.append(el(doc, "img", { class: "cs-live__product-img", src: safeHttpsUrl(info.image), alt: "", loading: "lazy" }));
    li.append(el(doc, "span", { class: "cs-live__product-title" }, info.title));
    if (info.price) li.append(el(doc, "span", { class: "cs-live__product-price" }, info.price));
    const act = (label: string, name: LiveProductEvent["name"], qty?: number) => {
      const b = el(doc, "button", { type: "button", class: "cs-btn cs-live__btn", "aria-label": `${label}: ${info.title}` }, label);
      b.addEventListener("click", () => controller.product(name, ref, qty));
      return b;
    };
    li.append(act(m.view, "product_click"), act(m.addToCart, "add_to_cart", 1), act(m.wishlist, "wishlist_added"));
    return li;
  };

  let shownFeatured = "";
  function renderSnapshot(s: LiveStateSnapshot) {
    const key = s.featured.map((p) => `${p.connector}:${p.external_id}#${p.variant_id ?? ""}`).join("|");
    if (key !== shownFeatured) {
      shownFeatured = key;
      rail.replaceChildren(...s.featured.map(productCard));
      rail.hidden = !s.featured.length;
      for (const p of s.featured) controller.product("product_viewed", p);
    }
    audience.textContent = s.audience_hint ? fmt(m.audience, { n: s.audience_hint }) : "";
    for (const [r, node] of counts) { const n = s.reactions[r]; node.textContent = n ? String(n) : ""; }
    chat.hidden = !(s.chat.mode === "filtered" || s.chat.mode === "premoderated");
    reactionsBar.hidden = !(live.reactions || s.chat.mode === "reactions") || s.state !== "live";
    renderLog();
  }
  function renderLog() {
    const keep = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.replaceChildren(...controller.messages.map((msg) => {
      const li = el(doc, "li", { class: "cs-live__msg", "data-mine": msg.mine ? "true" : undefined, "data-id": msg.id });
      li.append(el(doc, "strong", { class: "cs-live__who" }, msg.mine ? m.chatMine : msg.label), " ", el(doc, "span", { class: "cs-live__text" }, msg.text));
      const details = el(doc, "details", { class: "cs-live__opts" }, el(doc, "summary", { "aria-label": m.chatOptions, title: m.chatOptions }, "⋯"));
      if (msg.mine) {
        const del = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.deleteMine);
        del.addEventListener("click", () => { controller.deleteMine(msg.id).then(renderLog, (e) => { chatStatus.textContent = liveErrorText(e, m); }); });
        details.append(del);
      } else {
        const select = el(doc, "select", { class: "cs-live__reason", "aria-label": m.report }, ...LIVE_REPORT_REASONS.map((r) => el(doc, "option", { value: r }, m.reportReasons[r])));
        const send = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.reportSend);
        send.addEventListener("click", () => { controller.report(msg.id, select.value as LiveReportReason).then(() => { chatStatus.textContent = m.reportThanks; details.removeAttribute("open"); }, (e) => { chatStatus.textContent = liveErrorText(e, m); }); });
        const block = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.block);
        block.addEventListener("click", () => { controller.block(msg.id).then(() => { chatStatus.textContent = m.blockedThanks; renderLog(); }, (e) => { chatStatus.textContent = liveErrorText(e, m); }); });
        details.append(select, send, block);
      }
      li.append(details);
      return li;
    }));
    if (keep) log.scrollTop = log.scrollHeight;
  }

  function render(s: LiveState, error?: LiveError) {
    root.setAttribute("data-state", s);
    const playingLike = s === "playing" || s === "paused" || s === "waiting_host" || s === "reconnecting";
    gate.hidden = !(s === "idle" || s === "needs_notice");
    if (s === "needs_notice" && noticeBox) { noticeBox.checked = false; watchBtn.setAttribute("disabled", ""); }
    for (const b of [pauseBtn, muteBtn, leaveBtn]) b.hidden = !playingLike;
    ccBtn.hidden = !playingLike;
    retryBtn.hidden = !(s === "error" || s === "full");
    const paused = s === "paused";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.textContent = pauseBtn.title = paused ? m.resume : m.pause;
    pauseBtn.setAttribute("aria-label", paused ? m.resume : m.pause);
    badge.setAttribute("data-kind", s === "ended" || s === "unavailable" ? "ended" : s === "replay" ? "replay" : "live");
    stage.toggleAttribute("data-paused", paused);
    // El estado en palabras: es lo que oye quien usa lector de pantalla (región `status`, cortés).
    say(
      s === "connecting" ? m.connecting
      : s === "waiting_host" ? m.waitingHost
      : s === "reconnecting" ? m.reconnecting
      : s === "paused" ? m.paused
      : s === "ended" ? m.ended
      : s === "replay" ? m.endedReplay
      : s === "full" ? m.full
      : s === "unavailable" ? m.unavailable
      : s === "error" ? liveErrorText(error, m)
      : s === "needs_notice" ? m.noticeCheck
      : "",
    );
    if (s === "ended" || s === "replay" || s === "unavailable") { rail.hidden = true; reactionsBar.hidden = true; chat.hidden = true; }
  }

  return { controller, destroy: async () => { await controller.destroy(); root.remove(); } };
}

/** El controlador de una repetición o de un live que aún no empieza: no se conecta a nada. */
function noopController(options: LiveMountOptions): LiveController {
  return createLiveController({ live: options.live, groupId: options.groupId, client: options.client, loadLiveKit: options.loadLiveKit });
}

/** Los textos y su formato, para los SDK nativos (que pintan con sus propios componentes pero hablan igual). */
export { fmt, resolveLiveMessages, type LiveMessages };
