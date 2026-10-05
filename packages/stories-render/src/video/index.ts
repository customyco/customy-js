/**
 * @customyai/stories-render/video — módulo OPCIONAL de vídeo: reproductor por capacidad
 * (HLS nativo / hls.js diferido / MP4), póster y BlurHash, autoplay `muted playsinline` con
 * botón de play si el navegador lo rechaza, y precarga en ventana (actual, siguiente, anterior).
 *
 *   import { createVideoPlayer } from "@customyai/stories-render/video";
 *   const player = createVideoPlayer(el, source, { loadHls: () => import("hls.js").then((m) => m.default) });
 *   await player.play();
 *
 * `hls.js` NO es dependencia de este paquete: lo trae la app y se descarga sólo si hace falta.
 */
export { createVideoPlayer, type VideoPlayer, type VideoPlayerOptions } from "./player";
export { chooseDelivery, detectCapabilities, pickStartLevel, FAST_PATH_MS } from "./select";
export { createVideoWindow, planWindow, prefetchFirstSegment, MP4_WARM_BYTES, type VideoWindow, type VideoWindowOptions, type WindowRole, type FetchLike, type PrefetchOptions } from "./preload";
export { decodeBlurhash, isValidBlurhash, paintBlurhash } from "./blurhash";
export { parseMaster, parseMedia, resolveUrl, type MasterVariant } from "./hls-parse";
export type { Capabilities, Delivery, DeliveryKind, HlsCtor, HlsInstance, HlsLoader, PlayerState, VideoCaption, VideoPlayerEvent, VideoSource } from "./types";
