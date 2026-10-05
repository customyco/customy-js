import { el } from "../dom/util";
import { safeHttpsUrl } from "../safe-url";
import { paintBlurhash } from "./blurhash";
import { parseMaster } from "./hls-parse";
import { chooseDelivery, detectCapabilities, pickStartLevel } from "./select";
import type { Capabilities, Delivery, DeliveryKind, HlsInstance, HlsLoader, PlayerState, VideoPlayerEvent, VideoSource } from "./types";

export type VideoPlayerOptions = {
  doc?: Document;
  /** `native` en WebViews de las apps: HLS preferente. Por omisión `web`. */
  platform?: "web" | "native";
  /** hls.js se carga SOLO cuando hace falta: `() => import("hls.js").then((m) => m.default)`. */
  loadHls?: HlsLoader;
  /** Para pruebas o para forzar capacidades. */
  caps?: Partial<Capabilities>;
  /** Autoplay al activar (por omisión sí). Siempre `muted playsinline` mientras `muted` sea true. */
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  fit?: "fill" | "fit";
  /** Texto del botón de play (accesibilidad). */
  playLabel?: string;
  hlsConfig?: Record<string, unknown>;
  onEvent?: (event: VideoPlayerEvent) => void;
};

export type VideoPlayer = {
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly state: PlayerState;
  readonly delivery: Delivery | null;
  /** Elige entrega y la engancha al `<video>` (sin reproducir). Idempotente. */
  load(): Promise<void>;
  /** `load` + `play()`. Devuelve `blocked` si el navegador rechazó el autoplay (se enseña el botón). */
  play(): Promise<"playing" | "blocked" | "error">;
  pause(): void;
  setMuted(muted: boolean): void;
  setCaptions(on: boolean): void;
  destroy(): void;
};

const fill = { position: "absolute", inset: "0", width: "100%", height: "100%" };

/**
 * Reproductor de una capa de vídeo de una historia.
 *
 * Orden de cosas en pantalla: el hueco ya tiene su proporción (sin saltos de maquetación) →
 * BlurHash → póster → vídeo (opacidad 0 hasta que hay fotograma). Si `play()` se rechaza (política
 * de autoplay), se queda el póster y aparece un botón de play que sí cuenta como gesto.
 */
export function createVideoPlayer(container: HTMLElement, rawSource: VideoSource, options: VideoPlayerOptions = {}): VideoPlayer {
  // Contenido remoto: solo https sin credenciales (póster, mp4, hls, subtítulos); lo que no lo cumpla se omite.
  const source: VideoSource = {
    ...rawSource,
    poster: safeHttpsUrl(rawSource.poster) ?? "",
    mp4: safeHttpsUrl(rawSource.mp4),
    hls: safeHttpsUrl(rawSource.hls),
    captions: (rawSource.captions ?? []).filter((c) => safeHttpsUrl(c.url)).map((c) => ({ ...c, url: safeHttpsUrl(c.url)! })),
  } as VideoSource;
  const doc = options.doc ?? container.ownerDocument ?? document;
  const win = (doc.defaultView ?? undefined) as (Window & typeof globalThis) | undefined;
  const platform = options.platform ?? "web";
  const muted = options.muted ?? true;
  const fit = options.fit === "fit" ? "contain" : "cover";
  const w = source.width && source.height ? source.width : 9;
  const h = source.width && source.height ? source.height : 16;

  const root = el(doc, "div", { class: "cs-video", style: { position: "relative", overflow: "hidden", background: "var(--cs-video-bg, black)", width: "100%", aspectRatio: `${w} / ${h}` } });
  const blur = source.blurhash ? el(doc, "canvas", { class: "cs-video__blur", "aria-hidden": "true", style: { ...fill, objectFit: "cover" } }) : null;
  if (blur && !paintBlurhash(blur, source.blurhash!)) blur.remove();
  const poster = el(doc, "img", { class: "cs-video__poster", src: source.poster, alt: source.alt ?? "", decoding: "async", style: { ...fill, objectFit: fit, transition: "opacity .2s" } });
  const video = el(doc, "video", { class: "cs-video__el", playsinline: true, "webkit-playsinline": "", preload: "none", poster: source.poster, "aria-label": source.alt ?? null, "aria-hidden": source.alt ? null : "true", style: { ...fill, objectFit: fit, opacity: "0", transition: "opacity .2s" } });
  video.muted = muted; // el atributo `muted` no basta en todos los navegadores
  video.defaultMuted = muted;
  video.playsInline = true;
  video.loop = options.loop ?? false;
  const button = el(doc, "button", { class: "cs-video__play", type: "button", hidden: true, "aria-label": options.playLabel ?? "Play", style: { position: "absolute", inset: "0", margin: "auto", width: "64px", height: "64px", borderRadius: "50%", border: "0", background: "var(--cs-video-play-bg, color-mix(in srgb, black 55%, transparent))", color: "var(--cs-video-play-fg, white)", cursor: "pointer", display: "grid", placeItems: "center" } });
  button.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
  if (blur) root.append(blur);
  root.append(poster, video, button);
  container.append(root);

  let state: PlayerState = "idle";
  let delivery: Delivery | null = null;
  let hls: HlsInstance | null = null;
  let loading: Promise<void> | null = null;
  let destroyed = false;
  let captionsOn = false;

  const emit = (e: VideoPlayerEvent) => options.onEvent?.(e);
  const setState = (next: PlayerState) => {
    if (state === next || destroyed) return;
    state = next;
    button.hidden = next !== "blocked";
    emit({ type: "state", state: next });
  };
  const showVideo = () => { video.style.opacity = "1"; poster.style.opacity = "0"; if (blur) blur.style.opacity = "0"; };
  const showPoster = () => { video.style.opacity = "0"; poster.style.opacity = "1"; if (blur) blur.style.opacity = "1"; };

  for (const c of source.captions ?? []) {
    const track = doc.createElement("track");
    track.kind = "captions"; track.srclang = c.lang; track.label = c.label ?? c.lang; track.src = c.url;
    video.append(track);
  }
  const applyCaptions = () => { for (let i = 0; i < (video.textTracks?.length ?? 0); i++) { const t = video.textTracks[i]; if (t) t.mode = captionsOn ? "showing" : "hidden"; } };

  const teardownHls = () => { try { hls?.destroy(); } catch { /* ya destruido */ } hls = null; };
  const attach = (url: string) => { video.src = url; };

  function fallback(reason: string) {
    if (destroyed) return;
    const from = delivery?.kind ?? "poster";
    if (from !== "mp4" && source.mp4) {
      teardownHls();
      delivery = { kind: "mp4", url: source.mp4 };
      emit({ type: "fallback", from, to: "mp4", reason });
      emit({ type: "delivery", delivery });
      attach(source.mp4);
      video.load();
      if (state === "playing" || state === "loading") void video.play?.()?.catch?.(() => setState("blocked"));
      return;
    }
    teardownHls();
    delivery = { kind: "poster" };
    showPoster();
    setState("error");
    emit({ type: "error", reason });
  }

  async function startHls(url: string) {
    const Hls = await options.loadHls!();
    if (destroyed) return;
    if (!Hls.isSupported()) return fallback("hls.js no soportado");
    let startLevel = -1;
    try {
      // El nivel de partida se decide con las mismas reglas que la precarga (ver `pickStartLevel`).
      const text = await (await win!.fetch(url)).text();
      startLevel = pickStartLevel(parseMaster(text), caps);
    } catch { /* hls.js decide solo */ }
    if (destroyed) return;
    const instance = new Hls({ capLevelToPlayerSize: true, startLevel, maxBufferLength: 8, maxMaxBufferLength: 20, enableWorker: true, ...options.hlsConfig });
    hls = instance;
    instance.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === "mediaError" && instance.recoverMediaError && hlsRecoveries++ < 1) return instance.recoverMediaError();
      fallback(`hls.js: ${data.details ?? data.type ?? "error fatal"}`);
    });
    instance.attachMedia(video);
    instance.loadSource(url);
  }
  let hlsRecoveries = 0;
  const caps: Capabilities = { ...detectCapabilities(win, Boolean(options.loadHls)), ...options.caps };

  video.addEventListener("playing", () => { showVideo(); setState("playing"); });
  video.addEventListener("pause", () => { if (!video.ended && state === "playing") setState("paused"); });
  video.addEventListener("ended", () => setState("ended"));
  video.addEventListener("waiting", () => { if (state === "playing") setState("loading"); });
  video.addEventListener("loadedmetadata", applyCaptions);
  video.addEventListener("error", () => fallback(`video error ${video.error?.code ?? ""}`.trim()));
  button.addEventListener("click", () => { void player.play(); });

  function load(): Promise<void> {
    if (loading) return loading;
    loading = (async () => {
      delivery = chooseDelivery(source, caps, platform);
      emit({ type: "delivery", delivery });
      video.preload = "auto";
      if (delivery.kind === "poster" || !delivery.url) { showPoster(); return; }
      if (delivery.kind === "hls-js") await startHls(delivery.url).catch((e) => fallback(`hls.js: ${(e as Error).message}`));
      else attach(delivery.url);
    })();
    return loading;
  }

  const player: VideoPlayer = {
    element: root,
    video,
    get state() { return state; },
    get delivery() { return delivery; },
    load,
    async play() {
      if (destroyed) return "error";
      setState("loading");
      await load();
      if (delivery?.kind === "poster") { setState("error"); return "error"; }
      video.muted = muted;
      try {
        await video.play();
        return "playing" as const;
      } catch (error) {
        const name = (error as { name?: string })?.name;
        // Política de autoplay: NotAllowedError. Cualquier otra cosa que no sea una carga abortada
        // por un cambio de fuente (AbortError) es un fallo de reproducción real.
        if (name === "NotAllowedError") { setState("blocked"); return "blocked" as const; }
        if (name === "AbortError") return "playing" as const;
        fallback(`play(): ${name ?? (error as Error)?.message}`);
        return state === "error" ? ("error" as const) : ("playing" as const);
      }
    },
    pause() { video.pause?.(); if (state === "playing" || state === "loading") setState("paused"); },
    setMuted(m) { video.muted = m; },
    setCaptions(on) { captionsOn = on; applyCaptions(); },
    destroy() {
      if (destroyed) return;
      try { video.pause?.(); } catch { /* jsdom */ }
      teardownHls();
      // Soltar el decodificador: `src` vacío + `load()` es lo que libera de verdad el recurso.
      video.removeAttribute("src");
      try { video.load?.(); } catch { /* jsdom */ }
      destroyed = true;
      root.remove();
    },
  };
  return player;
}

export type { DeliveryKind };
