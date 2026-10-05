import type { Capabilities, Delivery, VideoSource } from "./types";
import type { MasterVariant } from "./hls-parse";

/** Duración por debajo de la cual, en web, se prefiere el MP4 progresivo (camino rápido). */
export const FAST_PATH_MS = 30_000;

type NavLike = { connection?: { saveData?: boolean; downlink?: number }; deviceMemory?: number };

/** Capacidades del entorno. Seguro en SSR (todo `false`). */
export function detectCapabilities(win: (Window & typeof globalThis) | undefined = typeof window === "undefined" ? undefined : window, hlsJs = false): Capabilities {
  if (!win) return { nativeHls: false, mse: false, hlsJs, saveData: false };
  const nav = win.navigator as Navigator & NavLike;
  let nativeHls = false;
  try {
    const probe = win.document.createElement("video");
    nativeHls = typeof probe.canPlayType === "function" && probe.canPlayType("application/vnd.apple.mpegurl") !== "";
  } catch { /* sin vídeo */ }
  const dpr = win.devicePixelRatio || 1;
  return {
    nativeHls,
    mse: typeof (win as unknown as { MediaSource?: unknown }).MediaSource !== "undefined" || typeof (win as unknown as { ManagedMediaSource?: unknown }).ManagedMediaSource !== "undefined",
    hlsJs,
    saveData: nav.connection?.saveData === true,
    downlinkMbps: nav.connection?.downlink,
    deviceMemoryGb: nav.deviceMemory,
    viewportHeightPx: win.innerHeight ? Math.round(win.innerHeight * dpr) : undefined,
  };
}

/**
 * Qué entrega usar.
 *  - Nativo (apps, WebViews): HLS si hay; el MP4 sólo de respaldo.
 *  - Web: clips < 30 s con MP4 → MP4 (una petición, `moov` al principio); si no, HLS nativo (Safari)
 *    o hls.js diferido; sin ninguno de los dos, MP4; sin MP4, póster.
 *  - `saveData` prefiere HLS (puede empezar por el escalón más bajo) cuando se puede reproducir.
 */
export function chooseDelivery(source: VideoSource, caps: Capabilities, platform: "web" | "native" = "web"): Delivery {
  const hlsPlayable = Boolean(source.hls) && (caps.nativeHls || (caps.mse && caps.hlsJs));
  const hls = (): Delivery => ({ kind: caps.nativeHls ? "hls-native" : "hls-js", url: source.hls });
  const mp4 = (): Delivery => ({ kind: "mp4", url: source.mp4 });
  if (platform === "native") {
    if (hlsPlayable) return hls();
    return source.mp4 ? mp4() : { kind: "poster" };
  }
  const short = source.durationMs !== undefined && source.durationMs < FAST_PATH_MS;
  if (source.mp4 && short && !(caps.saveData && hlsPlayable)) return mp4();
  if (hlsPlayable) return hls();
  return source.mp4 ? mp4() : { kind: "poster" };
}

/**
 * Escalón por el que empezar (índice en la lista ORDENADA por ancho de banda ascendente).
 * El más alto que cabe en el ~70 % del ancho de banda estimado, no mayor que la pantalla, y con
 * topes de 540 p en dispositivos de poca memoria y 360 p con ahorro de datos.
 */
export function pickStartLevel(variants: readonly Pick<MasterVariant, "bandwidth" | "height" | "width">[], caps: Pick<Capabilities, "saveData" | "downlinkMbps" | "deviceMemoryGb" | "viewportHeightPx">): number {
  if (variants.length === 0) return -1;
  const sorted = variants.map((v, i) => ({ ...v, i }));
  const longSide = (v: { width: number; height: number }) => Math.max(v.width, v.height);
  let capLong = caps.viewportHeightPx ?? Infinity;
  if (caps.deviceMemoryGb !== undefined && caps.deviceMemoryGb <= 2) capLong = Math.min(capLong, 960);
  if (caps.saveData) capLong = Math.min(capLong, 640);
  const budget = caps.downlinkMbps ? caps.downlinkMbps * 1_000_000 * 0.7 : Infinity;
  let pick = 0;
  for (const v of sorted) if (longSide(v) <= capLong && v.bandwidth <= budget) pick = v.i;
  return pick;
}
