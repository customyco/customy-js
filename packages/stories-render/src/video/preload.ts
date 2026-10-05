import { parseMaster, parseMedia, resolveUrl } from "./hls-parse";
import { chooseDelivery, pickStartLevel } from "./select";
import type { Capabilities, VideoSource } from "./types";

/**
 * Precarga en ventana: actual (lo carga el reproductor), siguiente y anterior. Para el
 * siguiente basta el primer segmento (+ init y playlists); saltar a otra página cancela lo
 * pendiente de las que salen de la ventana.
 */

export type WindowRole = "current" | "next" | "prev";

export function planWindow(count: number, current: number): { index: number; role: WindowRole }[] {
  if (count <= 0 || current < 0 || current >= count) return [];
  const out: { index: number; role: WindowRole }[] = [{ index: current, role: "current" }];
  if (current + 1 < count) out.push({ index: current + 1, role: "next" });
  if (current - 1 >= 0) out.push({ index: current - 1, role: "prev" });
  return out;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

export type PrefetchOptions = { fetch?: FetchLike; caps: Capabilities; platform?: "web" | "native"; mp4Bytes?: number };

/** Cuántos bytes del MP4 se piden por Range: cubre `moov` (faststart) y el arranque. */
export const MP4_WARM_BYTES = 256 * 1024;

/**
 * Calienta lo que el reproductor va a pedir primero. Con HLS: playlist maestra → playlist del
 * escalón inicial → `init.mp4` y primer segmento. Con MP4: los primeros bytes. No lanza: la
 * precarga es una mejora, no un requisito (un fallo se traga y el reproductor pedirá lo suyo).
 * Devuelve las URLs que pidió (útil en pruebas y telemetría).
 */
export async function prefetchFirstSegment(source: VideoSource, signal: AbortSignal, options: PrefetchOptions): Promise<string[]> {
  const f = options.fetch ?? (typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined);
  const requested: string[] = [];
  if (!f) return requested;
  const get = async (url: string, headers?: Record<string, string>) => {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
    requested.push(url);
    const r = await f(url, { signal, headers });
    if (!r.ok) throw new Error(`HTTP ${url}`);
    return r;
  };
  try {
    const delivery = chooseDelivery(source, options.caps, options.platform);
    if (delivery.kind === "mp4" && delivery.url) {
      await (await get(delivery.url, { Range: `bytes=0-${(options.mp4Bytes ?? MP4_WARM_BYTES) - 1}` })).arrayBuffer();
    } else if ((delivery.kind === "hls-native" || delivery.kind === "hls-js") && delivery.url) {
      const variants = parseMaster(await (await get(delivery.url)).text());
      const level = pickStartLevel(variants, options.caps);
      const chosen = variants[level];
      if (!chosen) return requested;
      const mediaUrl = resolveUrl(delivery.url, chosen.uri);
      const media = parseMedia(await (await get(mediaUrl)).text());
      const first = media.segments[0];
      await Promise.all([
        media.init ? get(resolveUrl(mediaUrl, media.init)).then((r) => r.arrayBuffer()) : Promise.resolve(),
        first ? get(resolveUrl(mediaUrl, first)).then((r) => r.arrayBuffer()) : Promise.resolve(),
      ]);
    }
  } catch {
    /* abortado o red caída: no pasa nada */
  }
  return requested;
}

export type VideoWindow<T> = {
  /** Recalcula la ventana: lanza la precarga de los nuevos y cancela los que salen. */
  update(items: readonly T[], current: number): void;
  /** Claves con precarga viva o completada dentro de la ventana. */
  resident(): string[];
  cancelAll(): void;
};

export type VideoWindowOptions<T> = {
  keyOf: (item: T) => string;
  /** Precarga un elemento. Debe respetar `signal`. */
  warm: (item: T, role: Exclude<WindowRole, "current">, signal: AbortSignal) => Promise<unknown>;
};

export function createVideoWindow<T>(options: VideoWindowOptions<T>): VideoWindow<T> {
  const live = new Map<string, AbortController>();
  return {
    update(items, current) {
      const plan = planWindow(items.length, current);
      const wanted = new Map(plan.map((p) => [options.keyOf(items[p.index]!), p.role]));
      for (const [key, controller] of live) {
        if (!wanted.has(key)) { controller.abort(); live.delete(key); }
      }
      for (const p of plan) {
        const item = items[p.index]!;
        const key = options.keyOf(item);
        // La actual la carga el reproductor; si ya calentaba, que termine (es justo lo que va a usar).
        if (p.role === "current" || live.has(key)) continue;
        const controller = new AbortController();
        live.set(key, controller);
        void options.warm(item, p.role, controller.signal).catch(() => undefined);
      }
    },
    resident: () => [...live.keys()],
    cancelAll() {
      for (const c of live.values()) c.abort();
      live.clear();
    },
  };
}
