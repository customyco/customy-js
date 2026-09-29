/**
 * @customyai/send/inbox — el cliente de Customy Engage para las apps de las
 * personas (navegador, React Native, escritorio): bandeja in-app, contadores en
 * vivo, recibos del embudo, mensajes in-app y registro del dispositivo push.
 *
 *   import { createInboxClient } from "@customyai/send/inbox";
 *   const inbox = createInboxClient({ token: () => miBackend.tokenDeBandeja() });
 *   const off = inbox.subscribe((change) => render(inbox.getState()));
 *   await inbox.list();
 *   await inbox.markRead(["ibx_…"]);
 *
 * Se autentica con un token de suscriptor (`sst_…`) que emite el backend de la
 * app (`send.inbox.createToken(userId)` en `@customyai/send`): nunca una
 * llave de la API en una app. El token se pide otra vez antes de caducar y ante
 * un 401.
 *
 * Sin dependencias de plataforma: `fetch` y `WebSocket` se inyectan (por defecto
 * los globales). En vivo = señal + relectura: el servidor avisa por WebSocket
 * con `{ counts, version }` y el cliente vuelve a leer; si el tiempo real no está
 * disponible o falla, consulta los contadores cada 30–60 s.
 *
 * Clientes evergreen: con `capabilities` (lo que la app sabe pintar) cada
 * petición lleva la cabecera `Customy-Client` y Send adapta cada mensaje; sin
 * ella el servidor trata la app como de 1.x. La configuración remota
 * (`config()`) se relee cada `poll_seconds` y sus interruptores `kill` ocultan
 * al momento los mensajes in-app, las tarjetas o los mensajes HTML.
 */
import { CustomySendError, errorFromResponse } from "../errors";
import type {
  ChannelPreference,
  ClientCapabilities,
  ClientConfig,
  ClientEvent,
  EligibleContentCard,
  EligibleInAppMessage,
  InAppLayout,
  InboxAction,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxStatus,
  PushDevice,
  RegisterDeviceInput,
  SubscriberPreferences,
  SurveyAnswers,
} from "../engage-types";
import { EVENT_NAME_MAX, EVENT_PROPERTIES_MAX_BYTES, jsonBytes } from "./bridge";
import { matchesFilters } from "./filters";

export { CustomySendError } from "../errors";
export { actionCategoryId, type ActionCategoryInput } from "../actions";
export { matchesFilter, matchesFilters, type FilterCondition } from "./filters";
export { BRIDGE_SCRIPT, buildHtmlDocument, clampHtmlHeight, HTML_CSP, HTML_LAYOUTS, HTML_LAYOUTS_FEATURE, isSafeBridgeUrl, parseBridgeMessage, safeAreaStyle, type BridgeMessage, type BridgeMessageType, type HtmlDocumentOptions, type SafeAreaInsets } from "./bridge";
export { createInAppPresenter, type InAppPresenter, type InAppPresenterClient, type InAppPresenterOptions } from "./presenter";
export type {
  ChannelPreference,
  SubscriberPreferences,
  ClientCapabilities,
  ClientConfig,
  ClientEvent,
  ClientEventType,
  ClientFeature,
  ClientKillSwitches,
  EligibleContentCard,
  EligibleInAppMessage,
  FilterOp,
  InAppBlock,
  InAppBlockAlign,
  InAppBlockType,
  InAppButton,
  InAppButtonAction,
  InAppButtonStyle,
  InAppButtonsBlock,
  InAppDividerBlock,
  InAppHeadingBlock,
  InAppImageBlock,
  InAppLayout,
  InAppSpacerBlock,
  InAppStyle,
  InAppSurveyBlock,
  InAppSurveyKind,
  InAppSurveyOption,
  InAppTextBlock,
  ContentCardKind,
  InboxAction,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxStatus,
  PushDevice,
  PushPlatform,
  PushProvider,
  RegisterDeviceInput,
  SurveyAnswers,
  TriggerFilter,
} from "../engage-types";

/** Versión de este SDK en `Customy-Client` (`sdk`). */
const SDK_ID = "send/0.2.0";

/** Lo que Send da por hecho sin `Customy-Client` (apps de 1.x). */
const LEGACY_LAYOUTS: readonly InAppLayout[] = ["modal", "banner", "fullscreen", "card"];

/**
 * Lo que declara una app que pinta todo: los 7 diseños, los 7 bloques y las
 * funciones `variables`, `content_cards`, `bridge_v1` y `push_primer`.
 * `html_layouts` (HTML dentro de modal, pantalla completa, banner, tarjeta y
 * slideup) NO va aquí: se declara solo si la app lo pinta de verdad
 * (`features: [...DEFAULT_CAPABILITIES.features, HTML_LAYOUTS_FEATURE]`); sin
 * ella Send manda el `fallback` nativo de esos mensajes.
 *
 *   createInboxClient({ token, platform: "ios", capabilities: { ...DEFAULT_CAPABILITIES, app_version: "1.4.2" } });
 */
export const DEFAULT_CAPABILITIES: Readonly<Required<Pick<ClientCapabilities, "layouts" | "blocks" | "features">>> = Object.freeze({
  layouts: Object.freeze(["modal", "banner", "fullscreen", "card", "slideup", "tooltip", "html"] as const),
  blocks: Object.freeze(["heading", "text", "image", "buttons", "spacer", "divider", "survey"] as const),
  features: Object.freeze(["variables", "content_cards", "bridge_v1", "push_primer"] as const),
});

/** Una interacción in-app para `track.inApp`. */
export type InAppTrackInput = {
  id: string;
  type: "impression" | "click" | "dismiss";
  /** Id del botón pulsado. */
  action?: string;
  /** Por defecto los del mensaje en caché. */
  variant_id?: string | null;
  rendered_as?: string | null;
};
/** Una interacción con una tarjeta para `track.card`. */
export type CardTrackInput = { id: string; type: "impression" | "click" | "dismiss"; variant_id?: string | null };
export type SurveyResponseInput = { in_app_id: string; survey_id: string; answers: SurveyAnswers; variant_id?: string | null };
export type InAppMessagesQuery = {
  /** `session_start` (por defecto) o un evento de la app. */
  trigger?: string;
  /** Propiedades del evento, para `trigger_filters`. */
  properties?: Record<string, unknown>;
  /** Versión de la app: viaja como `app_version` (y en `Customy-Client`). */
  appVersion?: string;
  locale?: string;
  /** Relee del servidor aunque ya estén cargados. */
  refresh?: boolean;
};

/** Lo mínimo de un WebSocket (el del navegador, el de React Native o `ws`). */
export type WebSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};
export type WebSocketConstructor = new (url: string) => WebSocketLike;

export type InboxClientOptions = {
  /** Por defecto https://send-api.customy.ai */
  baseUrl?: string;
  /**
   * Devuelve un token de suscriptor vigente (`sst_…`) pidiéndoselo al backend
   * de la app. Se llama al empezar, poco antes de que caduque y tras un 401.
   */
  token: () => Promise<string>;
  fetch?: typeof fetch;
  /** Por defecto el `WebSocket` global; `null` desactiva el tiempo real (solo sondeo). */
  WebSocket?: WebSocketConstructor | null;
  /** Elementos por página. Por defecto 20 (máximo 100). */
  pageSize?: number;
  /** Idioma de los mensajes in-app (`es`, `en-US`). */
  locale?: string;
  /**
   * Qué es esta app: `ios`, `android` o `web`. Los mensajes in-app dirigidos a otras
   * plataformas no se muestran aquí (uno sin plataformas llega a todas).
   */
  platform?: "ios" | "android" | "web";
  /** Intervalo del sondeo de contadores sin tiempo real. Por defecto 45 s. */
  pollIntervalMs?: number;
  /** Recibos: se envían cada `flushIntervalMs` (3 s) o al juntar `maxBatch` (20, máximo 100). */
  events?: { flushIntervalMs?: number; maxBatch?: number; maxQueue?: number };
  timeoutMs?: number;
  /** Reintentos ante red, 429 y 5xx. Por defecto 2. */
  maxRetries?: number;
  /** Tras tantos fallos seguidos del WebSocket se queda en sondeo. Por defecto 6. */
  maxRealtimeFailures?: number;
  /** Errores de fondo (tiempo real, sondeo, recibos) que no llegan a ninguna promesa. */
  onError?: (error: unknown) => void;
  /**
   * Lo que esta app sabe pintar (`DEFAULT_CAPABILITIES` si lo pinta todo): cada
   * petición lleva `Customy-Client` y Send adapta los mensajes. Sin esta opción
   * no se manda la cabecera y Send la trata como una app de 1.x.
   */
  capabilities?: ClientCapabilities;
};

export type InboxConnection = "idle" | "connecting" | "realtime" | "polling";

export type InboxState = {
  items: InboxItem[];
  status: InboxStatus;
  hasMore: boolean;
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: CustomySendError | null;
  /** `version` es −1 hasta la primera lectura. */
  counts: InboxCounts;
  connection: InboxConnection;
  inApp: { loaded: boolean; messages: EligibleInAppMessage[] };
  /** Configuración remota (`config()`); `null` hasta leerla. */
  config: ClientConfig | null;
  /** Tarjetas de contenido (`contentCards()`), fijadas primero. */
  cards: { loaded: boolean; items: EligibleContentCard[] };
};

export type InboxChange =
  | { type: "inbox"; counts: InboxCounts; reason?: string }
  | { type: "in_app"; id?: string };

export type InboxClient = ReturnType<typeof createInboxClient>;

const DEFAULT_BASE_URL = "https://send-api.customy.ai";
const MARK_CHUNK = 500;

// ── Utilidades sin plataforma ──────────────────────────────────────────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlDecode(input: string): string {
  const clean = input.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  let out = "";
  for (const char of clean) {
    const index = B64.indexOf(char);
    if (index < 0) return "";
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(out.split("").map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
  } catch {
    return out;
  }
}

/** Caducidad (ms) de un token `sst_<cabecera>.<cuerpo>.<firma>`, o null si no se puede leer. */
export function subscriberTokenExpiry(token: string): number | null {
  const body = token.replace(/^sst_/, "").split(".")[1];
  if (!body) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(body)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(12);
  const cryptoLike = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoLike?.getRandomValues) cryptoLike.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const byte of bytes) out += B64[byte & 63];
  return `${prefix}_${Date.now().toString(36)}${out}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const jitter = (ms: number) => Math.round(ms * (0.5 + Math.random() / 2));

function applyAction(item: InboxItem, action: InboxAction): InboxItem {
  switch (action) {
    case "seen":
      return item.seen ? item : { ...item, seen: true };
    case "read":
      return item.read && item.seen ? item : { ...item, read: true, seen: true };
    case "unread":
      return item.read ? { ...item, read: false } : item;
    case "archived":
      return item.archived ? item : { ...item, archived: true, seen: true };
  }
}

/** Los candidatos para un disparador, de mayor a menor prioridad (a igual prioridad, el orden del servidor). */
function inAppCandidates(messages: EligibleInAppMessage[], trigger: string, properties: Record<string, unknown> | undefined, exclude: Set<string>, now = Date.now()): EligibleInAppMessage[] {
  const out: EligibleInAppMessage[] = [];
  for (const message of messages) {
    if (exclude.has(message.id)) continue;
    if (message.trigger_event !== trigger && message.trigger_event !== "now") continue;
    if (message.ends_at && Date.parse(message.ends_at) <= now) continue;
    if (message.trigger_filters?.length && !matchesFilters(message.trigger_filters, properties ?? {})) continue;
    out.push(message);
  }
  return out.map((message, index) => ({ message, index })).sort((a, b) => b.message.priority - a.message.priority || a.index - b.index).map((entry) => entry.message);
}

/** Mismos elementos en el mismo orden: así el estado no cambia de referencia sin motivo. */
function sameItems<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function normalizeConfig(raw: Partial<ClientConfig> | null | undefined): ClientConfig {
  const kill = (raw?.kill ?? {}) as Partial<ClientConfig["kill"]>;
  const poll = Number(raw?.poll_seconds);
  return {
    ...(raw ?? {}),
    object: "client_config",
    poll_seconds: Number.isFinite(poll) && poll > 0 ? poll : 300,
    features: raw?.features && typeof raw.features === "object" ? raw.features : {},
    min_sdk: typeof raw?.min_sdk === "string" ? raw.min_sdk : null,
    kill: { in_app: kill.in_app === true, content_cards: kill.content_cards === true, html: kill.html === true },
    api_version: typeof raw?.api_version === "string" ? raw.api_version : null,
  };
}

function invalidEvent(message: string): CustomySendError {
  return new CustomySendError({ code: "SDK_INVALID_EVENT", status: 0, message });
}

// ── El cliente ─────────────────────────────────────────────────────────

export function createInboxClient(options: InboxClientOptions) {
  if (typeof options?.token !== "function") throw new Error("createInboxClient: hace falta `token: () => Promise<string>` (un token de suscriptor sst_… de tu backend)");
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const WS: WebSocketConstructor | null = options.WebSocket === undefined ? ((globalThis as { WebSocket?: WebSocketConstructor }).WebSocket ?? null) : options.WebSocket;
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const pollIntervalMs = options.pollIntervalMs ?? 45_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 2;
  const maxRealtimeFailures = options.maxRealtimeFailures ?? 6;
  const flushIntervalMs = options.events?.flushIntervalMs ?? 3_000;
  const maxBatch = Math.min(100, Math.max(1, options.events?.maxBatch ?? 20));
  const maxQueue = options.events?.maxQueue ?? 1_000;
  const capabilities = options.capabilities ?? null;
  let appVersion = capabilities?.app_version;
  let clientHeader: string | null = null;
  /** `Customy-Client`, solo si la app declaró lo que sabe pintar. */
  function capabilityHeaders(): Record<string, string> {
    if (!capabilities) return {};
    if (clientHeader === null) {
      const platform = capabilities.platform ?? options.platform;
      clientHeader = JSON.stringify({
        sdk: capabilities.sdk ?? SDK_ID,
        ...(appVersion ? { app_version: appVersion } : {}),
        ...(platform ? { platform } : {}),
        layouts: capabilities.layouts ?? LEGACY_LAYOUTS,
        blocks: capabilities.blocks ?? [],
        features: capabilities.features ?? [],
      });
    }
    return { "customy-client": clientHeader };
  }
  const reportError = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      /* el callback del usuario no rompe el cliente */
    }
  };

  let closed = false;

  // ── Estado observable (para React: useSyncExternalStore) ────────────
  let state: InboxState = {
    items: [],
    status: "all",
    hasMore: false,
    nextCursor: null,
    loaded: false,
    loading: false,
    error: null,
    counts: { unread: 0, unseen: 0, version: -1 },
    connection: "idle",
    inApp: { loaded: false, messages: [] },
    config: null,
    cards: { loaded: false, items: [] },
  };
  const stateListeners = new Set<() => void>();
  const changeListeners = new Set<(change: InboxChange) => void>();
  function setState(patch: Partial<InboxState>) {
    state = { ...state, ...patch };
    for (const listener of [...stateListeners]) listener();
  }
  function emit(change: InboxChange) {
    for (const listener of [...changeListeners]) {
      try {
        listener(change);
      } catch (error) {
        reportError(error);
      }
    }
  }

  // ── Token ──────────────────────────────────────────────────────────
  let cachedToken: string | null = null;
  let tokenExpiry: number | null = null;
  let tokenInFlight: Promise<string> | null = null;
  function getToken(force: boolean): Promise<string> {
    const fresh = cachedToken && (tokenExpiry === null || tokenExpiry - Date.now() > 60_000);
    if (!force && fresh) return Promise.resolve(cachedToken!);
    if (tokenInFlight) return tokenInFlight;
    tokenInFlight = options.token().then(
      (token) => {
        cachedToken = token;
        tokenExpiry = subscriberTokenExpiry(token);
        tokenInFlight = null;
        return token;
      },
      (error) => {
        tokenInFlight = null;
        throw error;
      },
    );
    return tokenInFlight;
  }

  // ── HTTP ───────────────────────────────────────────────────────────
  async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
    let attempt = 0;
    let refreshed = false;
    for (;;) {
      const token = await getToken(refreshed);
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...capabilityHeaders() },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (error) {
        if (timer) clearTimeout(timer);
        if (attempt < maxRetries) {
          attempt += 1;
          await sleep(jitter(500 * 2 ** attempt));
          continue;
        }
        throw new CustomySendError({ code: "SDK_NETWORK_ERROR", status: 0, message: (error as Error)?.message ?? "network error", cause: error });
      }
      if (timer) clearTimeout(timer);
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }
      // Token caducado o revocado: se pide uno nuevo una vez.
      if (res.status === 401 && !refreshed) {
        await res.text().catch(() => "");
        refreshed = true;
        cachedToken = null;
        continue;
      }
      const error = await errorFromResponse(res);
      // Todas las rutas del cliente son idempotentes: se pueden repetir.
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        attempt += 1;
        await sleep(error.retryAfterMs ?? jitter(500 * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }

  // ── Contadores y versión ────────────────────────────────────────────
  /** Aplica contadores del servidor si son más nuevos que los locales. Devuelve si se aplicaron. */
  function applyCounts(counts: InboxCounts | undefined | null): boolean {
    if (!counts || typeof counts.version !== "number") return false;
    if (counts.version <= state.counts.version) return false;
    setState({ counts: { unread: counts.unread, unseen: counts.unseen, version: counts.version } });
    return true;
  }

  /** Señal remota (tiempo real o sondeo): contadores nuevos → relectura de la primera página. */
  function remoteCounts(counts: InboxCounts, reason?: string) {
    if (!applyCounts(counts)) return;
    emit({ type: "inbox", counts: state.counts, reason });
    if (state.loaded) scheduleRefetch();
  }

  // ── Bandeja ────────────────────────────────────────────────────────
  /** Marcas en vuelo por id: una relectura no las deshace. */
  const pending = new Map<string, InboxAction[]>();
  const pendingAll: InboxAction[] = [];
  function withPending(item: InboxItem): InboxItem {
    let out = item;
    for (const action of pendingAll) out = applyAction(out, action);
    for (const action of pending.get(item.id) ?? []) out = applyAction(out, action);
    return out;
  }
  function visible(item: InboxItem, status: InboxStatus) {
    return status === "archived" ? item.archived : !item.archived;
  }

  let listSeq = 0;
  async function list(params: { cursor?: string | null; status?: InboxStatus; limit?: number } = {}): Promise<InboxPage> {
    const status = params.status ?? state.status;
    const seq = ++listSeq;
    const q = new URLSearchParams({ limit: String(params.limit ?? pageSize), status });
    if (params.cursor) q.set("cursor", params.cursor);
    setState({ loading: true, error: null, ...(status !== state.status ? { status, items: [], loaded: false, hasMore: false, nextCursor: null } : {}) });
    try {
      const page = await http<InboxPage>("GET", `/client/inbox?${q}`);
      applyCounts(page.counts);
      if (seq === listSeq || params.cursor) {
        const incoming = page.data.map(withPending).filter((item) => visible(item, status));
        if (params.cursor) {
          const known = new Set(state.items.map((item) => item.id));
          setState({ items: [...state.items, ...incoming.filter((item) => !known.has(item.id))], hasMore: page.has_more, nextCursor: page.next_cursor, loaded: true, loading: false });
        } else {
          setState({ items: incoming, hasMore: page.has_more, nextCursor: page.next_cursor, loaded: true, loading: false });
        }
      }
      return page;
    } catch (error) {
      if (seq === listSeq) setState({ loading: false, error: error instanceof CustomySendError ? error : new CustomySendError({ code: "SDK_ERROR", status: 0, message: String(error), cause: error }) });
      throw error;
    }
  }

  /** Primera página otra vez, mezclada con lo ya cargado (los nuevos arriba). */
  async function refetchFirstPage() {
    const status = state.status;
    const page = await http<InboxPage>("GET", `/client/inbox?${new URLSearchParams({ limit: String(pageSize), status })}`);
    applyCounts(page.counts);
    if (status !== state.status) return;
    const fresh = page.data.map(withPending).filter((item) => visible(item, status));
    const freshIds = new Set(fresh.map((item) => item.id));
    const rest = state.items.filter((item) => !freshIds.has(item.id));
    const hadMorePages = state.items.length > fresh.length && state.nextCursor !== null;
    setState({ items: [...fresh, ...rest], ...(hadMorePages ? {} : { hasMore: page.has_more, nextCursor: page.next_cursor }), loaded: true });
  }
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleRefetch() {
    if (refetchTimer) return;
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      refetchFirstPage().catch(reportError);
    }, 150);
  }

  async function counts(): Promise<InboxCounts> {
    const out = await http<InboxCounts & { object?: string }>("GET", "/client/inbox/counts");
    remoteCounts({ unread: out.unread, unseen: out.unseen, version: out.version }, "poll");
    return state.counts;
  }

  /**
   * Marca optimista: la interfaz cambia al momento; si el servidor falla, se
   * deshace y se relee. Repetirla es inocuo (el servidor solo avanza).
   */
  async function mark(action: InboxAction, ids: string[] | "all"): Promise<InboxCounts> {
    const all = ids === "all";
    if (!all && ids.length === 0) return state.counts;
    const idSet = all ? null : new Set(ids);
    const before = { items: state.items, counts: state.counts };
    const affected = state.items.filter((item) => all || idSet!.has(item.id));

    // Deltas locales (solo de lo que conocemos; el servidor devuelve la verdad).
    let { unread, unseen } = state.counts;
    if (all) {
      unseen = 0;
      if (action === "read") unread = 0;
    } else {
      for (const item of affected) {
        if (item.archived && action !== "archived") continue;
        if ((action === "read" || action === "archived") && !item.read) unread -= 1;
        if (action !== "unread" && !item.seen) unseen -= 1;
        if (action === "unread" && item.read) unread += 1;
      }
    }
    const status = state.status;
    const items = state.items
      .map((item) => (all || idSet!.has(item.id) ? applyAction(item, action) : item))
      .filter((item) => visible(item, status));
    setState({ items, counts: { unread: Math.max(0, unread), unseen: Math.max(0, unseen), version: state.counts.version } });

    if (all) pendingAll.push(action);
    else for (const id of ids) pending.set(id, [...(pending.get(id) ?? []), action]);
    const release = () => {
      if (all) pendingAll.splice(pendingAll.indexOf(action), 1);
      else
        for (const id of ids) {
          const list = pending.get(id);
          if (!list) continue;
          list.splice(list.indexOf(action), 1);
          if (!list.length) pending.delete(id);
        }
    };

    try {
      let result: InboxCounts | null = null;
      if (all) {
        result = await http<InboxCounts>("POST", "/client/inbox/mark", { action, all: true });
      } else {
        for (let i = 0; i < ids.length; i += MARK_CHUNK) {
          result = await http<InboxCounts>("POST", "/client/inbox/mark", { action, ids: ids.slice(i, i + MARK_CHUNK) });
        }
      }
      release();
      if (result && applyCounts({ unread: result.unread, unseen: result.unseen, version: result.version })) emit({ type: "inbox", counts: state.counts, reason: action });
      return state.counts;
    } catch (error) {
      release();
      // Deshacer: los elementos tocados vuelven a como estaban; los contadores también si nadie los movió.
      const previous = new Map(before.items.map((item) => [item.id, item]));
      const restored = state.items.map((item) => ((all || idSet!.has(item.id)) && previous.has(item.id) ? previous.get(item.id)! : item));
      for (const item of before.items) {
        if ((all || idSet!.has(item.id)) && !restored.some((r) => r.id === item.id)) restored.splice(before.items.indexOf(item), 0, item);
      }
      setState({ items: restored, ...(state.counts.version === before.counts.version ? { counts: before.counts } : {}) });
      counts().catch(reportError);
      throw error;
    }
  }

  // ── Recibos (embudo) ───────────────────────────────────────────────
  let queue: Array<ClientEvent & { id: string }> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;
  let eventFailures = 0;
  function scheduleFlush(delay: number) {
    if (flushTimer || closed) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, delay);
  }
  /** Encola recibos; salen en lotes. Cada uno lleva un id estable: reintentar no duplica. */
  function trackEvents(events: ClientEvent | ClientEvent[]) {
    const list = Array.isArray(events) ? events : [events];
    // Dónde pasó (el `by_platform` de las métricas): la plataforma de la app salvo que el evento diga otra.
    const appPlatform = capabilities?.platform ?? options.platform;
    for (const event of list) {
      const platform = event.platform ?? appPlatform;
      queue.push({ ...event, id: event.id ?? randomId("evt"), occurred_at: event.occurred_at ?? new Date().toISOString(), ...(platform ? { platform } : {}) });
    }
    if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
    if (queue.length >= maxBatch) void flush();
    else scheduleFlush(flushIntervalMs);
  }
  /** Envía ya lo encolado (p. ej. al pasar la app a segundo plano). */
  function flush(): Promise<void> {
    if (flushing) return flushing;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushing = (async () => {
      while (queue.length) {
        const batch = queue.slice(0, maxBatch);
        try {
          await http("POST", "/client/events", { events: batch });
          eventFailures = 0;
          const sent = new Set(batch.map((e) => e.id));
          queue = queue.filter((e) => !sent.has(e.id));
        } catch (error) {
          const status = error instanceof CustomySendError ? error.status : 0;
          if (status === 0 || status === 429 || status >= 500 || status === 401) {
            // Se quedan en la cola con sus mismos ids y se reintenta más tarde.
            eventFailures += 1;
            reportError(error);
            scheduleFlush(Math.min(60_000, jitter(flushIntervalMs * 2 ** eventFailures)));
            return;
          }
          // Lote inválido: se descarta para no bloquear los siguientes.
          const dropped = new Set(batch.map((e) => e.id));
          queue = queue.filter((e) => !dropped.has(e.id));
          reportError(error);
        }
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  // ── Configuración remota e interruptores ───────────────────────────
  const shown = new Set<string>();
  const closedInApp = new Set<string>();
  const closedCards = new Set<string>();
  /** Lo último que dio el servidor; el estado es esto menos lo cerrado y lo apagado por `kill`. */
  let rawInApp: EligibleInAppMessage[] = [];
  let rawCards: EligibleContentCard[] = [];
  function visibleInApp(): EligibleInAppMessage[] {
    const kill = state.config?.kill;
    if (kill?.in_app) return [];
    return rawInApp.filter((m) => !closedInApp.has(m.id) && !(kill?.html && (m.layout === "html" || Boolean(m.content?.html))));
  }
  function visibleCards(): EligibleContentCard[] {
    if (state.config?.kill.content_cards) return [];
    return rawCards.filter((card) => !closedCards.has(card.id));
  }
  /** Recalcula lo visible; solo cambia la referencia de lo que de verdad cambió. */
  function refreshVisible(patch: Partial<InboxState> = {}) {
    setState(patch);
    const messages = visibleInApp();
    const items = visibleCards();
    const next: Partial<InboxState> = {};
    if (!sameItems(messages, state.inApp.messages)) next.inApp = { ...state.inApp, messages };
    if (!sameItems(items, state.cards.items)) next.cards = { ...state.cards, items };
    if (next.inApp || next.cards) setState(next);
  }

  let configInFlight: Promise<ClientConfig | null> | null = null;
  /** Leerla: siempre con `capabilities`, o desde la primera llamada a `config()`. */
  let configWanted = capabilities !== null;
  let configAttempted = false;
  /** Un Send sin `/client/config` (404): no se vuelve a pedir. */
  let configUnavailable = false;
  let configTimer: ReturnType<typeof setTimeout> | null = null;
  /** Lee la configuración remota y aplica sus interruptores al momento. `null` si el servidor no la tiene. */
  function config(): Promise<ClientConfig | null> {
    configWanted = true;
    configAttempted = true;
    if (configUnavailable) return Promise.resolve(state.config);
    if (configInFlight) return configInFlight;
    configInFlight = http<Partial<ClientConfig>>("GET", "/client/config")
      .then(
        (raw) => {
          refreshVisible({ config: normalizeConfig(raw) });
          scheduleConfigPoll();
          return state.config;
        },
        (error) => {
          if (error instanceof CustomySendError && error.status === 404) {
            configUnavailable = true;
            return state.config;
          }
          throw error;
        },
      )
      .finally(() => {
        configInFlight = null;
      });
    return configInFlight;
  }
  function stopConfigPoll() {
    if (configTimer) clearTimeout(configTimer);
    configTimer = null;
  }
  /** Mientras hay alguien suscrito, cada `poll_seconds` (30 s … 1 día). */
  function scheduleConfigPoll() {
    stopConfigPoll();
    if (!liveCount || closed || configUnavailable || !configWanted) return;
    const seconds = Math.min(86_400, Math.max(30, state.config?.poll_seconds ?? 300));
    configTimer = setTimeout(() => {
      configTimer = null;
      config().catch((error) => {
        reportError(error);
        scheduleConfigPoll();
      });
    }, seconds * 1000);
  }
  /** Con `capabilities`, la primera lectura de mensajes o tarjetas trae también la configuración. */
  function ensureConfig() {
    if (capabilities && !configAttempted) config().catch(reportError);
  }

  // ── Mensajes in-app ────────────────────────────────────────────────
  let inAppLocale = options.locale;
  let inAppLoading: Promise<EligibleInAppMessage[]> | null = null;
  function clientQuery(): string {
    const params = new URLSearchParams({
      ...(inAppLocale ? { locale: inAppLocale } : {}),
      ...(options.platform ? { platform: options.platform } : {}),
      ...(appVersion ? { app_version: appVersion } : {}),
    });
    return params.toString() ? `?${params}` : "";
  }
  function setAppVersion(version: string | undefined) {
    if (!version || version === appVersion) return false;
    appVersion = version;
    clientHeader = null;
    return true;
  }
  function eligible(locale?: string, params: { appVersion?: string } = {}): Promise<EligibleInAppMessage[]> {
    if (locale) inAppLocale = locale;
    setAppVersion(params.appVersion);
    if (inAppLoading) return inAppLoading;
    ensureConfig();
    inAppLoading = http<{ data: EligibleInAppMessage[] }>("GET", `/client/in-app${clientQuery()}`)
      .then((out) => {
        rawInApp = Array.isArray(out?.data) ? out.data : [];
        const messages = visibleInApp();
        setState({ inApp: { loaded: true, messages } });
        return messages;
      })
      .finally(() => {
        inAppLoading = null;
      });
    return inAppLoading;
  }
  /**
   * Los mensajes para un disparador cuyos `trigger_filters` cumplen estas
   * propiedades, de mayor a menor prioridad. Los lee del servidor si aún no
   * están (o con `refresh`, o si cambió `appVersion`).
   */
  async function inAppMessages(query: InAppMessagesQuery = {}): Promise<EligibleInAppMessage[]> {
    const versionChanged = setAppVersion(query.appVersion);
    if (!state.inApp.loaded || query.refresh || versionChanged || (query.locale && query.locale !== inAppLocale)) await eligible(query.locale);
    return inAppCandidates(state.inApp.messages, query.trigger ?? "session_start", query.properties, new Set([...shown, ...closedInApp]));
  }
  function cachedInApp(id: string) {
    return rawInApp.find((m) => m.id === id);
  }
  /** `variant_id` y `rendered_as` del mensaje en caché (solo si el servidor los mandó). */
  function inAppExtras(id: string, override: { variant_id?: string | null; rendered_as?: string | null } = {}) {
    const cached = cachedInApp(id);
    const variant = override.variant_id !== undefined ? override.variant_id : cached?.variant_id;
    const rendered = override.rendered_as !== undefined ? override.rendered_as : cached?.rendered_as;
    return { ...(variant != null ? { variant_id: variant } : {}), ...(rendered != null ? { rendered_as: rendered } : {}) };
  }
  let inAppTimer: ReturnType<typeof setTimeout> | null = null;
  function inAppChanged(id?: string) {
    emit({ type: "in_app", id });
    if (!state.inApp.loaded || inAppTimer) return;
    inAppTimer = setTimeout(() => {
      inAppTimer = null;
      eligible().catch(reportError);
    }, 250);
  }
  function frequencyOf(id: string) {
    return (state.inApp.messages.find((m) => m.id === id) ?? cachedInApp(id))?.frequency ?? "once";
  }
  function closeInApp(id: string) {
    closedInApp.add(id);
    refreshVisible();
  }
  const inApp = {
    /** Los mensajes que le tocan a esta persona ahora (el servidor aplica audiencia, fechas y topes). */
    eligible,
    /**
     * El mensaje a mostrar para un disparador (`session_start`, un evento de la
     * app): el de mayor prioridad cuyos `trigger_filters` cumplen `properties`.
     */
    forTrigger(trigger: string, properties?: Record<string, unknown>): EligibleInAppMessage | null {
      return inAppCandidates(state.inApp.messages, trigger, properties, new Set([...shown, ...closedInApp]))[0] ?? null;
    },
    /** Se mostró. Con frecuencia distinta de `always` no vuelve en esta sesión. */
    impression(id: string) {
      if (frequencyOf(id) !== "always") shown.add(id);
      trackEvents({ type: "impression", in_app_id: id, channel: "in_app", ...inAppExtras(id) });
    },
    /** Pulsó un botón (`action` = id del botón) o el mensaje. */
    click(id: string, action?: string) {
      trackEvents({ type: "clicked", in_app_id: id, channel: "in_app", ...(action ? { action } : {}), ...inAppExtras(id) });
      closeInApp(id);
    },
    dismiss(id: string) {
      trackEvents({ type: "dismissed", in_app_id: id, channel: "in_app", ...inAppExtras(id) });
      closeInApp(id);
    },
  };

  // ── Tarjetas de contenido ──────────────────────────────────────────
  let cardsLoading: Promise<EligibleContentCard[]> | null = null;
  /** El feed de tarjetas de esta persona (fijadas primero, luego por prioridad). */
  function contentCards(params: { locale?: string; appVersion?: string } = {}): Promise<EligibleContentCard[]> {
    if (params.locale) inAppLocale = params.locale;
    setAppVersion(params.appVersion);
    if (cardsLoading) return cardsLoading;
    ensureConfig();
    cardsLoading = http<{ data: EligibleContentCard[] }>("GET", `/client/content-cards${clientQuery()}`)
      .then((out) => {
        const list = Array.isArray(out?.data) ? out.data : [];
        rawCards = list
          .map((card, index) => ({ card, index }))
          .sort((a, b) => Number(b.card.pinned) - Number(a.card.pinned) || (b.card.priority ?? 0) - (a.card.priority ?? 0) || a.index - b.index)
          .map((entry) => entry.card);
        const items = visibleCards();
        setState({ cards: { loaded: true, items } });
        return items;
      })
      .finally(() => {
        cardsLoading = null;
      });
    return cardsLoading;
  }

  // ── Recibos v2: in-app, tarjetas, encuestas y eventos propios ──────
  const track = Object.assign(trackEvents, {
    /** `in_app_impression|in_app_click|in_app_dismiss` con botón, variante y cómo se pintó; también marca visto o cerrado. */
    inApp(input: InAppTrackInput) {
      trackEvents({ type: `in_app_${input.type}`, in_app_id: input.id, channel: "in_app", ...(input.action ? { action: input.action } : {}), ...inAppExtras(input.id, input) });
      if (input.type === "impression") {
        if (frequencyOf(input.id) !== "always") shown.add(input.id);
      } else closeInApp(input.id);
    },
    /** `card_impression|card_click|card_dismiss`; al descartarla sale del feed. */
    card(input: CardTrackInput) {
      const variant = input.variant_id !== undefined ? input.variant_id : rawCards.find((card) => card.id === input.id)?.variant_id;
      trackEvents({ type: `card_${input.type}`, card_id: input.id, ...(variant != null ? { variant_id: variant } : {}) });
      if (input.type === "dismiss") {
        closedCards.add(input.id);
        refreshVisible();
      }
    },
  });

  /** Respuesta a un bloque `survey` (opciones elegidas, una nota o un texto). */
  function submitSurvey(input: SurveyResponseInput) {
    if (!input || typeof input.in_app_id !== "string" || !input.in_app_id || typeof input.survey_id !== "string" || !input.survey_id) throw invalidEvent("submitSurvey: hacen falta in_app_id y survey_id");
    const answers = input.answers;
    const valid = typeof answers === "string" || (typeof answers === "number" && Number.isFinite(answers)) || (Array.isArray(answers) && answers.every((a) => typeof a === "string"));
    if (!valid) throw invalidEvent("submitSurvey: answers es string[], número o texto");
    const bytes = jsonBytes(answers);
    if (bytes === null || bytes > EVENT_PROPERTIES_MAX_BYTES) throw invalidEvent("submitSurvey: answers supera 2 KB");
    const variant = input.variant_id !== undefined ? input.variant_id : cachedInApp(input.in_app_id)?.variant_id;
    trackEvents({ type: "survey_response", in_app_id: input.in_app_id, survey_id: input.survey_id, answers, ...(variant != null ? { variant_id: variant } : {}) });
  }

  /**
   * Un evento propio (`custom`): cuenta para las conversiones y los disparadores
   * con filtros. Nombre de 1 a 60 caracteres y propiedades de hasta 2 KB en
   * JSON; si no, lanza `CustomySendError` con código `SDK_INVALID_EVENT`.
   */
  function logEvent(name: string, properties?: Record<string, unknown>) {
    if (typeof name !== "string" || name.length === 0 || name.length > EVENT_NAME_MAX) throw invalidEvent(`logEvent: el nombre tiene de 1 a ${EVENT_NAME_MAX} caracteres`);
    if (properties !== undefined && properties !== null) {
      if (typeof properties !== "object" || Array.isArray(properties)) throw invalidEvent("logEvent: las propiedades son un objeto");
      const bytes = jsonBytes(properties);
      if (bytes === null) throw invalidEvent("logEvent: las propiedades no se pueden pasar a JSON");
      if (bytes > EVENT_PROPERTIES_MAX_BYTES) throw invalidEvent(`logEvent: las propiedades ocupan ${bytes} B (máximo ${EVENT_PROPERTIES_MAX_BYTES})`);
    }
    trackEvents({ type: "custom", name, ...(properties ? { properties } : {}) });
  }

  // ── Preferencias de la persona ─────────────────────────────────────
  const preferences = {
    /** Cada tema del catálogo con sus canales efectivos (para la pantalla de ajustes). */
    get: (): Promise<SubscriberPreferences> => http("GET", "/client/preferences"),
    /** Cambia los temas que vienen (por canal); el resto queda igual. */
    set: (categories: Record<string, Partial<ChannelPreference>>): Promise<SubscriberPreferences> => http("PUT", "/client/preferences", { categories }),
  };

  /**
   * La persona abrió un push (o pulsó uno de sus botones: `action` = su id).
   * `channel`: `apns`, `fcm` o `webpush`, según de dónde llegó.
   */
  function opened(notificationId: string, options: { action?: string; channel?: "apns" | "fcm" | "webpush" | "inbox"; deviceId?: string } = {}) {
    track({ type: "opened", notification_id: notificationId, ...(options.channel ? { channel: options.channel } : {}), ...(options.action ? { action: options.action } : {}), ...(options.deviceId ? { device_id: options.deviceId } : {}) });
  }

  // ── Dispositivos push (el de esta app) ─────────────────────────────
  const devices = {
    /** Alta o actualización del token APNs/FCM de este dispositivo (idempotente). */
    register: (input: RegisterDeviceInput): Promise<PushDevice> => http("POST", "/client/push/devices", input),
    /** Al cerrar sesión o si el sistema retira el permiso. */
    unregister: (token: string): Promise<{ object: "push_device_removal"; removed: number }> =>
      http("DELETE", `/client/push/devices?${new URLSearchParams({ token })}`),
  };

  // ── En vivo: WebSocket de Customy Realtime, o sondeo ───────────────
  let liveCount = 0;
  let socket: WebSocketLike | null = null;
  let realtimeDisabled = !WS;
  let realtimeFailures = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling() {
    if (pollTimer || !liveCount) return;
    setState({ connection: "polling" });
    counts().catch(reportError);
    pollTimer = setInterval(() => {
      counts().catch(reportError);
    }, pollIntervalMs);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }
  function stopSocket() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    const current = socket;
    socket = null;
    if (current) {
      current.onopen = current.onmessage = current.onclose = current.onerror = null;
      try {
        current.close(1000, "bye");
      } catch {
        /* ya cerrado */
      }
    }
  }

  function handleFrame(raw: unknown) {
    let message: unknown = raw;
    if (typeof raw === "string") {
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (!message || typeof message !== "object") return;
    const frame = message as { type?: string; payload?: unknown };
    if (frame.type === "connected") return onConnected();
    if (frame.type === "pong") return;
    // Sobre de Realtime: `{ type: <canal>, payload: { type: "inbox.changed", … } }`.
    const payload = (frame.payload && typeof frame.payload === "object" ? frame.payload : frame) as { type?: string; counts?: { unread?: number; unseen?: number }; version?: number; reason?: string; id?: string };
    if (payload.type === "inbox.changed" && payload.counts && typeof payload.version === "number") {
      onConnected();
      remoteCounts({ unread: Number(payload.counts.unread ?? 0), unseen: Number(payload.counts.unseen ?? 0), version: payload.version }, payload.reason);
    } else if (payload.type === "in_app.changed") {
      onConnected();
      inAppChanged(payload.id);
    }
  }

  function onConnected() {
    if (state.connection === "realtime") return;
    realtimeFailures = 0;
    stopPolling();
    setState({ connection: "realtime" });
    // Lo que pasó mientras no había conexión: una lectura de contadores lo recupera.
    counts().catch(reportError);
    if (!pingTimer) {
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === 1) socket.send(JSON.stringify({ type: "ping" }));
      }, 25_000);
    }
  }

  function realtimeFailed(error?: unknown) {
    if (error) reportError(error);
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    realtimeFailures += 1;
    startPolling();
    if (realtimeFailures >= maxRealtimeFailures || !liveCount || closed) return;
    const delay = Math.min(60_000, jitter(1_000 * 2 ** (realtimeFailures - 1)));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect() {
    if (!liveCount || closed || socket) return;
    if (realtimeDisabled || !WS) return startPolling();
    if (state.connection !== "polling") setState({ connection: "connecting" });
    let ticket: { url: string };
    try {
      // Un ticket nuevo en cada intento: son de un solo uso.
      ticket = await http<{ ticket: string; channels: string[]; url: string }>("POST", "/client/realtime-ticket");
    } catch (error) {
      if (error instanceof CustomySendError && error.status === 404) {
        realtimeDisabled = true;
        return startPolling();
      }
      return realtimeFailed(error);
    }
    if (!liveCount || closed || socket) return;
    let ws: WebSocketLike;
    try {
      ws = new WS(ticket.url);
    } catch (error) {
      return realtimeFailed(error);
    }
    socket = ws;
    ws.onmessage = (event) => {
      if (socket === ws) handleFrame(event.data);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* nada */
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      if (state.connection === "realtime") setState({ connection: "connecting" });
      realtimeFailed();
    };
  }

  /**
   * Cambios en vivo (contadores nuevos, mensajes in-app). Abre el tiempo real
   * con la primera suscripción y lo cierra con la última.
   */
  function subscribe(onChange: (change: InboxChange) => void): () => void {
    changeListeners.add(onChange);
    liveCount += 1;
    if (liveCount === 1 && !closed) {
      void connect();
      // La configuración remota se relee mientras la app escucha.
      if (configWanted && !configUnavailable) {
        config().catch((error) => {
          reportError(error);
          scheduleConfigPoll();
        });
      }
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      changeListeners.delete(onChange);
      liveCount -= 1;
      if (liveCount === 0) {
        stopSocket();
        stopPolling();
        stopConfigPoll();
        setState({ connection: "idle" });
      }
    };
  }

  return {
    /** Estado actual (inmutable: cambia de referencia en cada actualización). */
    getState: (): InboxState => state,
    /** Avisa de cada cambio de estado (para `useSyncExternalStore`). */
    onState(listener: () => void): () => void {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    /** Una página. Sin `cursor` sustituye la lista; con `cursor` la amplía. */
    list,
    loadMore(): Promise<InboxPage | null> {
      if (!state.hasMore || !state.nextCursor || state.loading) return Promise.resolve(null);
      return list({ cursor: state.nextCursor, status: state.status });
    },
    refresh: (): Promise<InboxPage> => list({ status: state.status }),
    counts,
    markSeen: (ids: string[] | "all") => mark("seen", ids),
    markRead: (ids: string[] | "all") => mark("read", ids),
    markUnread: (ids: string[]) => mark("unread", ids),
    archive: (ids: string[]) => mark("archived", ids),
    /** Recibos (`track(evento)`), y `track.inApp(…)` / `track.card(…)`. */
    track,
    opened,
    flush,
    inApp,
    inAppMessages,
    contentCards,
    config,
    submitSurvey,
    logEvent,
    devices,
    preferences,
    subscribe,
    /** Cierra el tiempo real y los temporizadores y envía los recibos pendientes. */
    async close(): Promise<void> {
      stopSocket();
      stopPolling();
      stopConfigPoll();
      if (refetchTimer) clearTimeout(refetchTimer);
      if (inAppTimer) clearTimeout(inAppTimer);
      refetchTimer = inAppTimer = null;
      liveCount = 0;
      changeListeners.clear();
      await flush().catch(reportError);
      closed = true;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      setState({ connection: "idle" });
    },
  };
}

/** «99+» para insignias. */
export function formatBadgeCount(count: number, max = 99): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > max ? `${max}+` : String(Math.floor(count));
}
