/**
 * Tipos del módulo OPCIONAL `@customyai/stories-render/video`: reproductor de vídeo por capacidad
 * (HLS nativo, hls.js diferido, MP4 progresivo) con póster/blurhash, autoplay `muted playsinline`
 * y precarga en ventana. Nada de esto entra en `.`/`./dom`/`./react`: quien no lo importa no lo paga.
 */

export type VideoCaption = { lang: string; label?: string; url: string };

/** Lo que el pipeline de Storage deja listo para una capa (ver `toStoryVideoFields` en Storage). */
export type VideoSource = {
  /** Playlist maestra HLS (fMP4/CMAF). */
  hls?: string;
  /** MP4 progresivo (camino rápido para clips < 30 s). */
  mp4?: string;
  /** Póster 9:16 obligatorio. */
  poster: string;
  /** BlurHash que ocupa el espacio antes de que cargue el póster. */
  blurhash?: string;
  /** Dimensiones para reservar el espacio sin saltos (por omisión 9:16). */
  width?: number;
  height?: number;
  durationMs?: number;
  captions?: VideoCaption[];
  alt?: string;
};

/** Cómo se va a entregar. `poster` = no hay forma de reproducir: se queda el póster. */
export type DeliveryKind = "hls-native" | "hls-js" | "mp4" | "poster";
export type Delivery = { kind: DeliveryKind; url?: string };

export type Capabilities = {
  /** `canPlayType("application/vnd.apple.mpegurl")` ≠ "" (Safari, iOS, WebViews de Apple). */
  nativeHls: boolean;
  /** `MediaSource` disponible (hls.js puede funcionar). */
  mse: boolean;
  /** La app dio un cargador de hls.js. */
  hlsJs: boolean;
  saveData: boolean;
  /** Mbps estimados por `navigator.connection.downlink`, si hay. */
  downlinkMbps?: number;
  deviceMemoryGb?: number;
  /** Alto del reproductor en píxeles físicos (CSS × DPR), para no pedir más de lo que se ve. */
  viewportHeightPx?: number;
};

/** Superficie mínima de hls.js que usa el reproductor (así no se importa el paquete). */
export type HlsEvents = { ERROR: string; MANIFEST_PARSED: string };
export interface HlsInstance {
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
  on(event: string, handler: (event: string, data: { fatal?: boolean; type?: string; details?: string }) => void): void;
  startLoad?(): void;
  recoverMediaError?(): void;
  destroy(): void;
}
export interface HlsCtor {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  Events: HlsEvents;
}
export type HlsLoader = () => Promise<HlsCtor>;

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "blocked" | "ended" | "error";

export type VideoPlayerEvent =
  | { type: "state"; state: PlayerState }
  | { type: "delivery"; delivery: Delivery }
  | { type: "fallback"; from: DeliveryKind; to: DeliveryKind; reason: string }
  | { type: "error"; reason: string };
