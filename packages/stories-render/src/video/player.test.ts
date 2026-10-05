// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoPlayer } from "./player";
import type { HlsCtor, HlsInstance, VideoPlayerEvent, VideoSource } from "./types";

const source = (over: Partial<VideoSource> = {}): VideoSource => ({ poster: "https://c/p.jpg", mp4: "https://c/v.mp4", hls: "https://c/m.m3u8", durationMs: 12_000, width: 720, height: 1280, blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj", alt: "Oferta", ...over });
let playImpl: () => Promise<void>;
let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.body.appendChild(document.createElement("div"));
  playImpl = () => Promise.resolve();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => playImpl() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: () => undefined });
  // jsdom no trae canvas: sin contexto, el BlurHash simplemente no se pinta.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => null });
});
afterEach(() => vi.restoreAllMocks());

const reject = (name: string) => () => Promise.reject(Object.assign(new Error(name), { name }));
const events = () => { const log: VideoPlayerEvent[] = []; return { log, on: (e: VideoPlayerEvent) => log.push(e) }; };
const caps = { nativeHls: false, mse: true, hlsJs: false, saveData: false };

describe("estructura y reserva de espacio", () => {
  it("reserva la proporción, pone póster y vídeo mudo, inline y sin precarga", () => {
    const p = createVideoPlayer(host, source(), { caps });
    expect(p.element.style.aspectRatio).toBe("720 / 1280");
    expect(p.element.querySelector("img")!.getAttribute("src")).toBe("https://c/p.jpg");
    expect(p.video.muted).toBe(true);
    expect(p.video.playsInline).toBe(true);
    expect(p.video.preload).toBe("none");
    expect(p.video.getAttribute("src")).toBeNull();
    expect(p.state).toBe("idle");
  });
  it("pinta el BlurHash en un canvas debajo del póster cuando hay contexto 2d", () => {
    const putImageData = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData }) });
    const p = createVideoPlayer(host, source(), { caps });
    expect(putImageData).toHaveBeenCalledTimes(1);
    const children = [...p.element.children].map((c) => c.tagName);
    expect(children.slice(0, 2)).toEqual(["CANVAS", "IMG"]);
  });
  it("sin dimensiones usa 9:16", () => {
    expect(createVideoPlayer(host, source({ width: undefined, height: undefined }), { caps }).element.style.aspectRatio).toBe("9 / 16");
  });
  it("añade pistas de subtítulos", () => {
    const p = createVideoPlayer(host, source({ captions: [{ lang: "es", label: "Español", url: "https://c/es.vtt" }] }), { caps });
    expect(p.video.querySelector("track")!.getAttribute("src")).toBe("https://c/es.vtt");
  });
});

describe("entrega y autoplay", () => {
  it("clip corto → MP4; play() lo engancha y, al sonar `playing`, enseña el vídeo", async () => {
    const e = events();
    const p = createVideoPlayer(host, source(), { caps, onEvent: e.on });
    expect(await p.play()).toBe("playing");
    expect(p.video.getAttribute("src")).toBe("https://c/v.mp4");
    p.video.dispatchEvent(new Event("playing"));
    expect(p.state).toBe("playing");
    expect(p.video.style.opacity).toBe("1");
    expect(p.element.querySelector("img")!.style.opacity).toBe("0");
    expect(e.log.some((x) => x.type === "delivery" && x.delivery.kind === "mp4")).toBe(true);
  });

  it("autoplay rechazado (NotAllowedError) → estado blocked y botón de play visible; el clic reproduce", async () => {
    playImpl = reject("NotAllowedError");
    const p = createVideoPlayer(host, source(), { caps });
    expect(await p.play()).toBe("blocked");
    const button = p.element.querySelector("button")!;
    expect(p.state).toBe("blocked");
    expect(button.hidden).toBe(false);
    playImpl = () => Promise.resolve();
    button.click();
    await Promise.resolve();
    p.video.dispatchEvent(new Event("playing"));
    expect(p.state).toBe("playing");
    expect(button.hidden).toBe(true);
  });

  it("el rechazo se captura: play() nunca lanza", async () => {
    playImpl = reject("NotAllowedError");
    await expect(createVideoPlayer(host, source(), { caps }).play()).resolves.toBe("blocked");
  });

  it("sin MP4 ni HLS reproducible se queda en el póster", async () => {
    const p = createVideoPlayer(host, source({ mp4: undefined, durationMs: 90_000 }), { caps });
    expect(await p.play()).toBe("error");
    expect(p.delivery).toEqual({ kind: "poster" });
    expect(p.video.style.opacity).toBe("0");
  });

  it("HLS nativo (Safari) usa la playlist directamente", async () => {
    const p = createVideoPlayer(host, source({ durationMs: 90_000 }), { caps: { ...caps, nativeHls: true } });
    await p.play();
    expect(p.video.getAttribute("src")).toBe("https://c/m.m3u8");
    expect(p.delivery!.kind).toBe("hls-native");
  });
});

describe("hls.js diferido y respaldo MP4", () => {
  const fakeHls = () => {
    const instances: { cfg: Record<string, unknown>; handlers: Record<string, (e: string, d: { fatal?: boolean; type?: string; details?: string }) => void>; destroyed: boolean; source?: string }[] = [];
    class Hls implements HlsInstance {
      static Events = { ERROR: "hlsError", MANIFEST_PARSED: "hlsManifestParsed" };
      static isSupported() { return true; }
      rec: (typeof instances)[number];
      constructor(cfg: Record<string, unknown> = {}) { this.rec = { cfg, handlers: {}, destroyed: false }; instances.push(this.rec); }
      loadSource(u: string) { this.rec.source = u; }
      attachMedia() {}
      on(ev: string, h: (e: string, d: { fatal?: boolean }) => void) { this.rec.handlers[ev] = h; }
      destroy() { this.rec.destroyed = true; }
    }
    return { Hls: Hls as unknown as HlsCtor, instances };
  };

  it("hls.js NO se carga al crear el reproductor, sólo al reproducir un clip largo", async () => {
    const { Hls, instances } = fakeHls();
    const loadHls = vi.fn(async () => Hls);
    const p = createVideoPlayer(host, source({ durationMs: 90_000 }), { caps: { ...caps, hlsJs: true }, loadHls });
    expect(loadHls).not.toHaveBeenCalled();
    await p.play();
    expect(loadHls).toHaveBeenCalledTimes(1);
    expect(instances[0]!.source).toBe("https://c/m.m3u8");
    expect(instances[0]!.cfg.capLevelToPlayerSize).toBe(true);
  });

  it("un error fatal de hls.js cae a MP4 y lo avisa", async () => {
    const { Hls, instances } = fakeHls();
    const e = events();
    const p = createVideoPlayer(host, source({ durationMs: 90_000 }), { caps: { ...caps, hlsJs: true }, loadHls: async () => Hls, onEvent: e.on });
    await p.play();
    instances[0]!.handlers.hlsError!("hlsError", { fatal: true, type: "networkError", details: "manifestLoadError" });
    expect(instances[0]!.destroyed).toBe(true);
    expect(p.video.getAttribute("src")).toBe("https://c/v.mp4");
    expect(e.log.find((x) => x.type === "fallback")).toMatchObject({ from: "hls-js", to: "mp4" });
  });

  it("un error no fatal se ignora", async () => {
    const { Hls, instances } = fakeHls();
    const p = createVideoPlayer(host, source({ durationMs: 90_000 }), { caps: { ...caps, hlsJs: true }, loadHls: async () => Hls });
    await p.play();
    instances[0]!.handlers.hlsError!("hlsError", { fatal: false });
    expect(p.delivery!.kind).toBe("hls-js");
  });

  it("si el cargador de hls.js falla, usa MP4", async () => {
    const p = createVideoPlayer(host, source({ durationMs: 90_000 }), { caps: { ...caps, hlsJs: true }, loadHls: async () => { throw new Error("chunk 404"); } });
    await p.play();
    expect(p.video.getAttribute("src")).toBe("https://c/v.mp4");
  });

  it("sin respaldo MP4, un error del <video> deja el póster y estado error", async () => {
    const e = events();
    const p = createVideoPlayer(host, source({ mp4: undefined, durationMs: 90_000 }), { caps: { ...caps, nativeHls: true }, onEvent: e.on });
    await p.play();
    p.video.dispatchEvent(new Event("error"));
    expect(p.state).toBe("error");
    expect(e.log.some((x) => x.type === "error")).toBe(true);
    expect(p.element.querySelector("img")!.style.opacity).toBe("1");
  });
});

describe("limpieza", () => {
  it("destroy suelta el decodificador, destruye hls.js y quita el DOM", async () => {
    const destroyed = vi.fn();
    class Hls { static Events = { ERROR: "e", MANIFEST_PARSED: "m" }; static isSupported() { return true; } loadSource() {} attachMedia() {} on() {} destroy = destroyed; }
    const p = createVideoPlayer(host, source({ durationMs: 90_000 }), { caps: { ...caps, hlsJs: true }, loadHls: async () => Hls as unknown as HlsCtor });
    await p.play();
    p.video.setAttribute("src", "blob:x");
    p.destroy();
    expect(destroyed).toHaveBeenCalled();
    expect(p.video.getAttribute("src")).toBeNull();
    expect(host.querySelector(".cs-video")).toBeNull();
    expect(await p.play()).toBe("error");
    p.destroy();
  });

  it("setMuted y setCaptions no revientan sin pistas", () => {
    const p = createVideoPlayer(host, source(), { caps });
    p.setMuted(false);
    expect(p.video.muted).toBe(false);
    p.setCaptions(true);
  });
});
