import { systemClock, type Clock, type TimerHandle } from "./clock";
import type { StoryGroup, StoryPage } from "./types";

export type AssetKind = "image" | "video" | "lottie" | "caption";
export type PreloadAsset = {
  url: string;
  kind: AssetKind;
  /** Póster de un vídeo: si el vídeo no carga, la página sigue con él. */
  poster?: string;
  /** Sin él la página no se puede pintar (fondo/póster); lo demás degrada. */
  critical: boolean;
};

/** Los medios de una página. El orden es el de importancia: fondo primero. */
export function pageAssets(page: StoryPage): PreloadAsset[] {
  const out: PreloadAsset[] = [];
  const bg = page.background;
  if (bg?.type === "image") out.push({ url: bg.url, kind: "image", critical: true });
  if (bg?.type === "video") {
    out.push({ url: bg.poster, kind: "image", critical: true });
    out.push({ url: bg.url, kind: "video", poster: bg.poster, critical: false });
    for (const c of bg.captions) out.push({ url: c.url, kind: "caption", critical: false });
  }
  for (const l of page.canvas.layers) {
    if (l.type === "image" || l.type === "sticker") out.push({ url: l.url, kind: "image", critical: false });
    else if (l.type === "lottie") out.push({ url: l.url, kind: "lottie", critical: false });
    else if (l.type === "video") {
      out.push({ url: l.poster, kind: "image", critical: false });
      out.push({ url: l.url, kind: "video", poster: l.poster, critical: false });
      for (const c of l.captions) out.push({ url: c.url, kind: "caption", critical: false });
    }
  }
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(`${a.kind}:${a.url}`) ? false : (seen.add(`${a.kind}:${a.url}`), true)));
}

/** Qué páginas conviene tener listas desde (grupo, página): la siguiente y la 1.ª del grupo siguiente. */
export function planPreload(groups: readonly Pick<StoryGroup, "id" | "pages">[], groupIndex: number, pageIndex: number): { groupIndex: number; pageIndex: number }[] {
  const plan: { groupIndex: number; pageIndex: number }[] = [];
  const g = groups[groupIndex];
  if (!g?.pages) return plan;
  if (pageIndex + 1 < g.pages.length) plan.push({ groupIndex, pageIndex: pageIndex + 1 });
  const next = groups[groupIndex + 1];
  if (next?.pages?.length) plan.push({ groupIndex: groupIndex + 1, pageIndex: 0 });
  return plan;
}

export const pageKey = (groupId: string, pageId: string): string => `${groupId}/${pageId}`;

export type AssetLoader = (asset: PreloadAsset, signal: AbortSignal) => Promise<void>;

export type PreloadResult = {
  key: string;
  /** El fondo/póster cargó. */
  ok: boolean;
  /** Activos que fallaron tras los reintentos. */
  failed: PreloadAsset[];
  /** Algún vídeo falló: la página corre con su póster. */
  posterFallback: boolean;
};

export type PreloadHandle = { key: string; promise: Promise<PreloadResult>; cancel(): void };

export type PreloaderOptions = {
  load: AssetLoader;
  /** Reintentos por activo además del primer intento. Por defecto 2. */
  retries?: number;
  /** Esperas entre reintentos (ms). Por defecto 300 y 900. */
  backoffMs?: readonly number[];
  clock?: Clock;
};

/**
 * Precarga con cancelación, reintento con espera creciente y degradación a póster: un vídeo
 * que no carga NO rompe la página; se pinta su póster y corre con temporizador.
 * Pedir la misma página dos veces devuelve el mismo trabajo; cancelar aborta los `fetch`
 * en curso y los reintentos pendientes.
 */
export function createPreloader(options: PreloaderOptions) {
  const clock = options.clock ?? systemClock;
  const retries = options.retries ?? 2;
  const backoff = options.backoffMs ?? [300, 900];
  const jobs = new Map<string, { handle: PreloadHandle; controller: AbortController; timers: Set<TimerHandle>; done: boolean }>();
  const results = new Map<string, PreloadResult>();

  const wait = (ms: number, signal: AbortSignal, timers: Set<TimerHandle>): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      const t = clock.setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
      signal.addEventListener(
        "abort",
        () => {
          clock.clearTimeout(t);
          timers.delete(t);
          reject(new DOMException("aborted", "AbortError"));
        },
        { once: true },
      );
    });

  async function loadWithRetry(asset: PreloadAsset, signal: AbortSignal, timers: Set<TimerHandle>): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      try {
        await options.load(asset, signal);
        return true;
      } catch (error) {
        if (signal.aborted) throw error;
        if (attempt === retries) return false;
        await wait(backoff[Math.min(attempt, backoff.length - 1)] ?? 300, signal, timers);
      }
    }
    return false;
  }

  function request(key: string, assets: readonly PreloadAsset[]): PreloadHandle {
    const existing = jobs.get(key);
    if (existing) return existing.handle;
    const controller = new AbortController();
    const timers = new Set<TimerHandle>();
    const job = { handle: undefined as unknown as PreloadHandle, controller, timers, done: false };
    const promise = (async (): Promise<PreloadResult> => {
      const outcomes = await Promise.all(assets.map(async (a) => ({ a, ok: await loadWithRetry(a, controller.signal, timers) })));
      const failed = outcomes.filter((o) => !o.ok).map((o) => o.a);
      const posterFallback = failed.some((a) => a.kind === "video");
      // Un fallo crítico solo es definitivo si no hay nada con qué pintar (imagen de fondo/póster).
      const ok = !failed.some((a) => a.critical);
      const result: PreloadResult = { key, ok, failed, posterFallback };
      results.set(key, result);
      job.done = true;
      return result;
    })();
    job.handle = {
      key,
      promise,
      cancel: () => {
        if (job.done) return;
        controller.abort();
        jobs.delete(key);
      },
    };
    // Una cancelación rechaza la promesa; quien no la espera no debe ver un rechazo sin atender.
    promise.catch(() => undefined);
    jobs.set(key, job);
    return job.handle;
  }

  return {
    request,
    /** Resultado ya conocido (si la precarga terminó). */
    result: (key: string): PreloadResult | undefined => results.get(key),
    has: (key: string): boolean => jobs.has(key),
    /** Cancela lo que no esté en `keep` (al moverse el visor). */
    cancelExcept(keep: Iterable<string>): void {
      const keepSet = new Set(keep);
      for (const [key, job] of [...jobs]) if (!keepSet.has(key) && !job.done) job.handle.cancel();
    },
    cancelAll(): void {
      for (const job of [...jobs.values()]) if (!job.done) job.handle.cancel();
    },
  };
}
export type Preloader = ReturnType<typeof createPreloader>;
