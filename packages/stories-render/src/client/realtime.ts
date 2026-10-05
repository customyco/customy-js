import { systemClock, type Clock } from "../clock";

/**
 * Tiempo real de Stories: Send avisa por Customy Realtime (`stories.changed`, `banners.changed`,
 * `widgets.changed` en el canal de la cuenta) y el SDK vuelve a pedir el placement SIN esperar el
 * `ttl` ni el ETag. La señal NO lleva contenido: solo ids de placement, un motivo y una versión.
 *
 * Garantías:
 *  - Apagado por defecto (`enabled: false`): sin la opción, el SDK se comporta como antes.
 *  - Solo en primer plano: al pasar a segundo plano cierra el socket y para los temporizadores;
 *    al volver revalida todo lo observado una vez.
 *  - Reconexión con backoff exponencial y jitter completo; mientras no hay socket, sondeo corto
 *    (`pollMs`, 30 s) que revalida con ETag (un 304 es barato).
 *  - Una señal perdida solo retrasa la actualización: tras reconectar se revalida todo.
 */

/** Los tres tipos de señal que Send emite para Stories. */
export const STORY_SIGNAL_TYPES: ReadonlySet<string> = new Set(["stories.changed", "banners.changed", "widgets.changed"]);

export type RealtimeStatus = "off" | "connecting" | "live" | "polling";

export type ForegroundSource = {
  isActive(): boolean;
  /** Avisa de cada cambio; devuelve la baja. */
  subscribe(listener: (active: boolean) => void): () => void;
};

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
export type WebSocketCtor = new (url: string) => WebSocketLike;

export type StoriesRealtimeOptions = {
  /** Apagado por defecto: hasta verificarlo en cada despliegue, el SDK sigue con ttl + ETag. */
  enabled?: boolean;
  baseUrl: string;
  token: (forceRefresh?: boolean) => Promise<string>;
  fetch?: typeof fetch;
  WebSocket?: WebSocketCtor;
  clock?: Clock;
  /** Sondeo mientras no hay socket. Por defecto 30 s; mínimo 5 s. */
  pollMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Espera para agrupar señales seguidas (`stories` + `banners` del mismo cambio). Por defecto 150 ms. */
  coalesceMs?: number;
  /** Primer plano de la app. Por defecto, la visibilidad del documento si existe; si no, siempre activo. */
  foreground?: ForegroundSource;
  random?: () => number;
  onError?: (error: unknown) => void;
};

const OPEN = 1;
const PING_MS = 25_000;
const SILENCE_MS = 75_000;

export function documentForeground(): ForegroundSource {
  const doc = (globalThis as { document?: { visibilityState?: string; addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void } }).document;
  if (!doc?.addEventListener) return { isActive: () => true, subscribe: () => () => undefined };
  return {
    isActive: () => doc.visibilityState !== "hidden",
    subscribe(listener) {
      const handler = (): void => listener(doc.visibilityState !== "hidden");
      doc.addEventListener!("visibilitychange", handler);
      return () => doc.removeEventListener?.("visibilitychange", handler);
    },
  };
}

/** Backoff exponencial con jitter completo, acotado. Exportado para probarlo. */
export function backoffDelay(attempt: number, min: number, max: number, random: () => number): number {
  const ceiling = Math.min(max, min * 2 ** Math.max(0, attempt));
  return Math.max(min, Math.floor(random() * ceiling));
}

export function createStoriesRealtime(options: StoriesRealtimeOptions) {
  const enabled = options.enabled === true;
  const clock = options.clock ?? systemClock;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const WS: WebSocketCtor | undefined = options.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  const pollMs = Math.max(5_000, options.pollMs ?? 30_000);
  const minBackoff = options.minBackoffMs ?? 1_000;
  const maxBackoff = options.maxBackoffMs ?? 60_000;
  const coalesceMs = options.coalesceMs ?? 150;
  const random = options.random ?? Math.random;
  const foreground = options.foreground ?? documentForeground();

  const watchers = new Map<string, Set<() => void>>();
  const statusListeners = new Set<(s: RealtimeStatus) => void>();
  let status: RealtimeStatus = "off";
  let socket: WebSocketLike | null = null;
  let attempt = 0;
  let generation = 0; // invalida callbacks de conexiones anteriores
  let reconnectTimer: unknown = null;
  let pollTimer: unknown = null;
  let pingTimer: unknown = null;
  let coalesceTimer: unknown = null;
  let lastMessageAt = 0;
  let needsCatchUp = false;
  let unsubscribeForeground: (() => void) | null = null;
  const pendingIds = new Set<string>();
  let pendingAll = false;
  let tickets404 = false;
  let connecting = false;

  const setStatus = (next: RealtimeStatus): void => {
    if (status === next) return;
    status = next;
    for (const l of [...statusListeners]) {
      try {
        l(next);
      } catch {
        /* un oyente roto no rompe el cliente */
      }
    }
  };
  const clearTimer = (h: unknown): void => {
    if (h !== null) clock.clearTimeout(h);
  };
  const active = (): boolean => enabled && watchers.size > 0 && foreground.isActive();

  function fire(ids: string[] | "all"): void {
    const targets = new Set<() => void>();
    if (ids === "all") for (const set of watchers.values()) for (const cb of set) targets.add(cb);
    else for (const id of ids) for (const cb of watchers.get(id) ?? []) targets.add(cb);
    for (const cb of targets) {
      try {
        cb();
      } catch (e) {
        options.onError?.(e);
      }
    }
  }

  /** Agrupa ráfagas (stories + banners del mismo cambio) en una sola revalidación por placement. */
  function schedule(ids: string[] | "all"): void {
    if (ids === "all") pendingAll = true;
    else for (const id of ids) pendingIds.add(id);
    if (coalesceTimer !== null) return;
    coalesceTimer = clock.setTimeout(() => {
      coalesceTimer = null;
      const all = pendingAll;
      const list = [...pendingIds];
      pendingAll = false;
      pendingIds.clear();
      fire(all ? "all" : list);
    }, coalesceMs);
  }

  function stopPolling(): void {
    clearTimer(pollTimer);
    pollTimer = null;
  }
  function startPolling(): void {
    if (pollTimer !== null || !active()) return;
    const tick = (): void => {
      pollTimer = null;
      if (!active() || status === "live") return;
      schedule("all");
      pollTimer = clock.setTimeout(tick, pollMs);
    };
    pollTimer = clock.setTimeout(tick, pollMs);
  }

  function teardownSocket(): void {
    generation += 1;
    connecting = false;
    clearTimer(pingTimer);
    pingTimer = null;
    const s = socket;
    socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close(1000, "client_closing");
      } catch {
        /* ya cerrado */
      }
    }
  }

  function degrade(): void {
    teardownSocket();
    needsCatchUp = true;
    if (!active()) {
      setStatus("off");
      return;
    }
    setStatus("polling");
    startPolling();
    clearTimer(reconnectTimer);
    // Sin servicio de tiempo real (404 realtime_disabled) no se insiste cada segundo: se reintenta despacio.
    const delay = tickets404 ? Math.max(maxBackoff, 300_000) : backoffDelay(attempt, minBackoff, maxBackoff, random);
    attempt += 1;
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function fetchTicketUrl(): Promise<string | null> {
    let refreshed = false;
    for (;;) {
      const token = await options.token(refreshed);
      const res = await fetchImpl(`${baseUrl}/client/realtime-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (res.status === 401 && !refreshed) {
        await res.text().catch(() => "");
        refreshed = true;
        continue;
      }
      if (res.status === 404) {
        await res.text().catch(() => "");
        tickets404 = true;
        return null;
      }
      if (!res.ok) {
        await res.text().catch(() => "");
        throw new Error(`realtime-ticket ${res.status}`);
      }
      tickets404 = false;
      const body = (await res.json()) as { url?: unknown };
      return typeof body.url === "string" ? body.url : null;
    }
  }

  async function connect(): Promise<void> {
    if (!active() || socket || connecting || !WS) {
      if (!WS && active()) {
        setStatus("polling");
        startPolling();
      }
      return;
    }
    const mine = ++generation;
    connecting = true;
    setStatus(status === "polling" ? "polling" : "connecting");
    let url: string | null;
    try {
      url = await fetchTicketUrl();
    } catch (error) {
      if (mine === generation) {
        options.onError?.(error);
        degrade();
      }
      return;
    }
    if (mine !== generation) return;
    connecting = false;
    if (!url) {
      degrade();
      return;
    }
    let ws: WebSocketLike;
    try {
      ws = new WS(url);
    } catch (error) {
      options.onError?.(error);
      degrade();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (mine !== generation) return;
      attempt = 0;
      lastMessageAt = clock.now();
      stopPolling();
      setStatus("live");
      // Lo ocurrido mientras no había socket (o al volver de segundo plano) se recupera revalidando.
      if (needsCatchUp) schedule("all");
      needsCatchUp = false;
      const beat = (): void => {
        if (mine !== generation || !socket) return;
        if (clock.now() - lastMessageAt > SILENCE_MS) {
          degrade();
          return;
        }
        try {
          if (socket.readyState === OPEN) socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          /* el cierre lo gestiona onclose */
        }
        pingTimer = clock.setTimeout(beat, PING_MS);
      };
      pingTimer = clock.setTimeout(beat, PING_MS);
    };
    ws.onmessage = (ev) => {
      if (mine !== generation) return;
      lastMessageAt = clock.now();
      let msg: { type?: unknown; placement_ids?: unknown; all?: unknown };
      try {
        msg = JSON.parse(String(ev.data)) as typeof msg;
      } catch {
        return;
      }
      if (typeof msg.type !== "string" || !STORY_SIGNAL_TYPES.has(msg.type)) return;
      const ids = Array.isArray(msg.placement_ids) ? msg.placement_ids.filter((x): x is string => typeof x === "string") : [];
      // Sin ids, o con la lista recortada por Send (`all`), cualquiera puede haber cambiado.
      schedule(ids.length === 0 || msg.all === true ? "all" : ids);
    };
    ws.onerror = () => {
      /* el cierre llega después y decide */
    };
    ws.onclose = () => {
      if (mine !== generation) return;
      degrade();
    };
  }

  function start(): void {
    if (!active()) return;
    if (!unsubscribeForeground) return;
    if (!socket && reconnectTimer === null) void connect();
  }

  function stop(): void {
    clearTimer(reconnectTimer);
    reconnectTimer = null;
    stopPolling();
    clearTimer(coalesceTimer);
    coalesceTimer = null;
    teardownSocket();
    setStatus("off");
  }

  function ensureForegroundListener(): void {
    if (unsubscribeForeground || !enabled) return;
    unsubscribeForeground = foreground.subscribe((isActive) => {
      if (!isActive) {
        stop();
        return;
      }
      if (watchers.size === 0) return;
      attempt = 0;
      start();
      // Al volver a primer plano se revalida una vez, haya o no socket.
      schedule("all");
    });
  }

  return {
    enabled,
    get status(): RealtimeStatus {
      return status;
    },
    onStatus(listener: (s: RealtimeStatus) => void): () => void {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    /** Pide que `callback` se llame cuando el placement deba revalidarse. Sin `enabled` no hace nada. */
    watch(placementId: string, callback: () => void): () => void {
      if (!enabled) return () => undefined;
      let set = watchers.get(placementId);
      if (!set) watchers.set(placementId, (set = new Set()));
      set.add(callback);
      ensureForegroundListener();
      start();
      return () => {
        const current = watchers.get(placementId);
        current?.delete(callback);
        if (current && current.size === 0) watchers.delete(placementId);
        if (watchers.size === 0) {
          stop();
          unsubscribeForeground?.();
          unsubscribeForeground = null;
        }
      };
    },
    /** Revalida a mano (los mismos callbacks que la señal). */
    invalidate(placementIds?: string[]): void {
      if (enabled) schedule(placementIds && placementIds.length > 0 ? placementIds : "all");
    },
    close(): void {
      stop();
      unsubscribeForeground?.();
      unsubscribeForeground = null;
      watchers.clear();
    },
  };
}
export type StoriesRealtime = ReturnType<typeof createStoriesRealtime>;
