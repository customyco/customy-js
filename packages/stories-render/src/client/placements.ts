import { systemClock, type Clock } from "../clock";
import { readJson, type KeyValueStore } from "../store";
import type { BannerAspect, DeliveredBanner, DeliveredWidget, PlacementKill, PlacementResponse, StoryPlatform } from "../types";
import { errorFromResponse, StoriesError } from "./errors";
import { compareVersions, STORIES_SDK_ID, STORIES_SDK_VERSION } from "./version";

export type PlacementQuery = { locale?: string; appVersion?: string; platform?: StoryPlatform };

export type PlacementStatus = "ok" | "killed" | "unsupported" | "empty";

export type PlacementResult = {
  placementId: string;
  /**
   * `ok` hay algo que pintar; `killed` el kill switch del placement lo oculta; `unsupported` este
   * SDK es anterior a `min_sdk` (degradación DECLARADA, no silenciosa); `empty` no hay nada elegible.
   */
  status: PlacementStatus;
  /** La respuesta tal como llegó (o salió de la caché). */
  response: PlacementResponse | null;
  /** Los widgets ya filtrados por kill, `min_sdk`, calendario y caducidad. */
  widgets: DeliveredWidget[];
  etag: string | null;
  /** Salió de la caché sin red (ttl vigente) o con un 304. */
  fromCache: boolean;
  notModified: boolean;
  /** Se sirvió la caché porque la red falló. */
  stale: boolean;
  fetchedAt: number;
  killed: PlacementKill;
  minSdk: string | null;
  /** Por qué se degradó, si pasó (`min_sdk`, `kill`). */
  notice?: { code: "min_sdk" | "kill_placement" | "kill_story" | "kill_banner" | "kill_widget"; message: string };
};

export type PlacementClientOptions = {
  /** Por defecto https://send-api.customy.ai */
  baseUrl?: string;
  /** Token de suscriptor (`sst_…`) que pide la app a su backend; se llama de nuevo tras un 401. */
  token: (forceRefresh?: boolean) => Promise<string>;
  fetch?: typeof fetch;
  platform?: StoryPlatform;
  appVersion?: string;
  locale?: string;
  /** Persistencia de la caché (offline); sin ella, solo memoria. */
  store?: KeyValueStore;
  namespace?: string;
  clock?: Clock;
  timeoutMs?: number;
  /** Reintentos ante red, 429 y 5xx. Por defecto 2. */
  maxRetries?: number;
  /** Versión de este SDK para `min_sdk` (solo pruebas). */
  sdkVersion?: string;
  /** Pausa entre reintentos (inyectable en pruebas). */
  sleep?: (ms: number) => Promise<void>;
  /** Un placement degradado (`min_sdk`, kill) se avisa aquí para que la app lo registre. */
  onNotice?: (placementId: string, notice: NonNullable<PlacementResult["notice"]>) => void;
  onError?: (error: unknown) => void;
};

type CacheEntry = { etag: string; body: PlacementResponse; fetchedAt: number };

const ASPECTS = new Set<BannerAspect>(["4:3", "16:9", "1:1", "2:1"]);

/** Comprobación estructural mínima (sin zod: el paquete es ligero). Lo demás es contrato del servidor. */
export function assertPlacementResponse(x: unknown): asserts x is PlacementResponse {
  const r = x as Partial<PlacementResponse> | null;
  if (!r || typeof r !== "object" || typeof r.placement_id !== "string" || !Array.isArray(r.widgets) || typeof r.etag !== "string") {
    throw new StoriesError("invalid_response", "respuesta de placement inválida (faltan placement_id, etag o widgets)");
  }
  for (const w of r.widgets) {
    if (!w || typeof w !== "object" || typeof (w as { kind?: unknown }).kind !== "string" || !Array.isArray((w as { items?: unknown }).items)) {
      throw new StoriesError("invalid_response", "widget inválido en la respuesta del placement");
    }
  }
}

/**
 * Cliente de placements: `GET /client/placements/:id` con ETag/`If-None-Match`, caché respetando
 * `ttl`, caché persistida (offline), reintentos con `Retry-After`, y el filtrado que el servidor
 * no puede hacer por el cliente: kill por superficie (vacía la lista), `min_sdk`, calendario y
 * caducidad de banners.
 */
export function createPlacementClient(options: PlacementClientOptions) {
  const baseUrl = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const clock = options.clock ?? systemClock;
  const ns = options.namespace ?? "customy-stories";
  const sdkVersion = options.sdkVersion ?? STORIES_SDK_VERSION;
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => clock.setTimeout(r, ms)));
  const memory = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<PlacementResult>>();
  let persisted: Promise<Record<string, CacheEntry>> | null = null;

  const loadPersisted = (): Promise<Record<string, CacheEntry>> => (persisted ??= options.store ? readJson<Record<string, CacheEntry>>(options.store, `${ns}:placements`, {}) : Promise.resolve({}));
  const savePersisted = async (): Promise<void> => {
    if (!options.store) return;
    try {
      await options.store.set(`${ns}:placements`, JSON.stringify(Object.fromEntries(memory)));
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  };

  const backoff = new Map<string, number>();
  const fill = (id: string, q: PlacementQuery) => ({ locale: q.locale ?? options.locale, app_version: q.appVersion ?? options.appVersion, platform: q.platform ?? options.platform, id });
  const cacheKey = (p: ReturnType<typeof fill>): string => `${p.id}|${p.locale ?? ""}|${p.platform ?? ""}|${p.app_version ?? ""}`;

  function clientHeader(p: ReturnType<typeof fill>): string {
    return JSON.stringify({ sdk: STORIES_SDK_ID, ...(p.app_version ? { app_version: p.app_version } : {}), ...(p.platform ? { platform: p.platform } : {}), features: ["stories", "banners", "widgets"] });
  }

  async function request(p: ReturnType<typeof fill>, etag: string | null, fast = false): Promise<{ status: 200 | 304; body?: PlacementResponse; etag: string | null }> {
    const qs = new URLSearchParams();
    if (p.locale) qs.set("locale", p.locale);
    if (p.app_version) qs.set("app_version", p.app_version);
    if (p.platform) qs.set("platform", p.platform);
    const url = `${baseUrl}/client/placements/${encodeURIComponent(p.id)}${qs.toString() ? `?${qs}` : ""}`;
    let attempt = 0;
    let refreshed = false;
    for (;;) {
      let token: string;
      try {
        token = await options.token(refreshed);
      } catch (e) {
        throw new StoriesError("token", "no se pudo obtener el token de suscriptor", { cause: e });
      }
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? clock.setTimeout(() => controller.abort(), timeoutMs) : null;
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "GET",
          headers: { authorization: `Bearer ${token}`, accept: "application/json", "customy-client": clientHeader(p), ...(etag ? { "if-none-match": etag } : {}) },
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (error) {
        if (timer !== null) clock.clearTimeout(timer);
        if (attempt < maxRetries) {
          attempt += 1;
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw new StoriesError(controller?.signal.aborted ? "timeout" : "network", (error as Error)?.message ?? "network error", { cause: error });
      }
      if (timer !== null) clock.clearTimeout(timer);
      if (res.status === 304) return { status: 304, etag: res.headers.get("etag") ?? etag };
      if (res.ok) {
        const body: unknown = await res.json().catch(() => {
          throw new StoriesError("invalid_response", "el cuerpo no es JSON", { status: res.status });
        });
        assertPlacementResponse(body);
        return { status: 200, body, etag: res.headers.get("etag") ?? body.etag };
      }
      if (res.status === 401 && !refreshed) {
        await res.text().catch(() => "");
        refreshed = true;
        continue;
      }
      const err = await errorFromResponse(res);
      // With something to show (`fast`) a 429/5xx is not waited for: the caller serves the cache and honors Retry-After across calls (`backoff`).
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries && !fast) {
        attempt += 1;
        await sleep(err.retryAfterMs ?? 300 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  function build(id: string, entry: CacheEntry, flags: { fromCache: boolean; notModified: boolean; stale: boolean }): PlacementResult {
    const res = entry.body;
    const processed = processPlacement(res, { sdkVersion, now: clock.now() });
    if (processed.notice) {
      try {
        options.onNotice?.(id, processed.notice);
      } catch {
        /* el callback no rompe el cliente */
      }
    }
    return { placementId: id, etag: entry.etag, fetchedAt: entry.fetchedAt, response: res, killed: res.kill, minSdk: res.min_sdk, ...flags, ...processed };
  }

  async function load(id: string, query: PlacementQuery, force: boolean): Promise<PlacementResult> {
    const p = fill(id, query);
    const key = cacheKey(p);
    if (!memory.has(key)) {
      const disk = (await loadPersisted())[key];
      if (disk) memory.set(key, disk);
    }
    const cached = memory.get(key);
    if (cached && !force && clock.now() - cached.fetchedAt < cached.body.ttl * 1000) {
      return build(id, cached, { fromCache: true, notModified: false, stale: false });
    }
    // The server said «later» (503/429 + Retry-After: it is shedding load): not before then, not even when forced. Without a cache the request goes out.
    if (cached && (backoff.get(key) ?? 0) > clock.now()) return build(id, cached, { fromCache: true, notModified: false, stale: true });
    try {
      const out = await request(p, cached?.etag ?? null, Boolean(cached));
      if (out.status === 304 && cached) {
        const entry = { ...cached, fetchedAt: clock.now() };
        memory.set(key, entry);
        void savePersisted();
        return build(id, entry, { fromCache: true, notModified: true, stale: false });
      }
      if (!out.body) throw new StoriesError("invalid_response", "304 sin caché local", { status: 304 });
      const entry: CacheEntry = { etag: out.etag ?? out.body.etag, body: out.body, fetchedAt: clock.now() };
      memory.set(key, entry);
      void savePersisted();
      return build(id, entry, { fromCache: false, notModified: false, stale: false });
    } catch (error) {
      if (error instanceof StoriesError && (error.status === 429 || error.status >= 500)) backoff.set(key, clock.now() + Math.min(Math.max(error.retryAfterMs ?? 15_000, 1_000), 120_000));
      options.onError?.(error);
      // Sin red (o el servidor caído) se sirve lo último conocido; un 404/401 no se disfraza.
      const recoverable = error instanceof StoriesError && (error.code === "network" || error.code === "timeout" || error.code === "server" || error.code === "rate_limited");
      if (cached && recoverable) return build(id, cached, { fromCache: true, notModified: false, stale: true });
      throw error;
    }
  }

  return {
    /** El placement `id`: caché si el `ttl` sigue vigente, o `If-None-Match` con el ETag guardado. */
    placement(id: string, query: PlacementQuery & { force?: boolean } = {}): Promise<PlacementResult> {
      const p = fill(id, query);
      const key = `${cacheKey(p)}${query.force ? "|force" : ""}`;
      const running = inflight.get(key);
      if (running) return running;
      const job = load(id, query, !!query.force).finally(() => inflight.delete(key));
      inflight.set(key, job);
      return job;
    },
    /** Olvida la caché (cierre de sesión). */
    async clear(): Promise<void> {
      memory.clear();
      persisted = Promise.resolve({});
      await options.store?.remove(`${ns}:placements`);
    },
  };
}
export type PlacementClient = ReturnType<typeof createPlacementClient>;

/**
 * Aplica lo que decide el cliente sobre la respuesta: `min_sdk`, kill (placement y por superficie,
 * que VACÍA la lista de esa superficie), calendario de grupos y caducidad de banners.
 */
export function processPlacement(res: PlacementResponse, ctx: { sdkVersion: string; now: number }): { status: PlacementStatus; widgets: DeliveredWidget[]; notice?: PlacementResult["notice"] } {
  if (res.min_sdk && compareVersions(ctx.sdkVersion, res.min_sdk) < 0) {
    return { status: "unsupported", widgets: [], notice: { code: "min_sdk", message: `este SDK (${ctx.sdkVersion}) es anterior al mínimo del placement (${res.min_sdk}): actualiza @customyai/stories-render` } };
  }
  if (res.kill.placement) return { status: "killed", widgets: [], notice: { code: "kill_placement", message: "el placement está apagado (kill switch)" } };
  let notice: PlacementResult["notice"];
  const widgets: DeliveredWidget[] = [];
  for (const w of res.widgets) {
    if (w.kind === "story_bar") {
      if (res.kill.story) {
        notice ??= { code: "kill_story", message: "las historias están apagadas (kill switch de la superficie)" };
        widgets.push({ ...w, items: [] });
        continue;
      }
      widgets.push({ ...w, items: w.items.filter((g) => inWindow(g.schedule, ctx.now)) });
    } else if (w.kind === "banner") {
      if (res.kill.banner) {
        notice ??= { code: "kill_banner", message: "los banners están apagados (kill switch de la superficie)" };
        widgets.push({ ...w, items: [] });
        continue;
      }
      widgets.push({ ...w, items: w.items.filter((b) => notExpired(b, ctx.now) && ASPECTS.has(b.style.aspect)) });
    } else if (res.kill.widget) {
      notice ??= { code: "kill_widget", message: "los widgets están apagados (kill switch de la superficie)" };
      widgets.push({ ...w, items: [] } as DeliveredWidget);
    } else widgets.push({ ...w, items: (w.items as Array<{ expires_at?: string }>).filter((i) => !i.expires_at || Date.parse(i.expires_at) > ctx.now) } as DeliveredWidget);
  }
  const has = widgets.some((w) => w.items.length > 0);
  return { status: has ? "ok" : notice ? "killed" : "empty", widgets, ...(notice ? { notice } : {}) };
}

function inWindow(schedule: { start_at?: string; end_at?: string } | undefined, now: number): boolean {
  if (!schedule) return true;
  if (schedule.start_at && Date.parse(schedule.start_at) > now) return false;
  if (schedule.end_at && Date.parse(schedule.end_at) <= now) return false;
  return true;
}
const notExpired = (b: DeliveredBanner, now: number): boolean => !b.expires_at || Date.parse(b.expires_at) > now;
