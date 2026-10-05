import { describe, expect, it } from "vitest";
import { chooseDelivery, detectCapabilities, pickStartLevel } from "./select";
import type { Capabilities, VideoSource } from "./types";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({ nativeHls: false, mse: true, hlsJs: true, saveData: false, ...over });
const src = (over: Partial<VideoSource> = {}): VideoSource => ({ poster: "https://c/p.jpg", hls: "https://c/m.m3u8", mp4: "https://c/v.mp4", durationMs: 12_000, ...over });

describe("chooseDelivery", () => {
  it("web + clip < 30 s + MP4 → MP4 (camino rápido) aunque haya HLS", () => {
    expect(chooseDelivery(src(), caps())).toEqual({ kind: "mp4", url: "https://c/v.mp4" });
  });
  it("web + clip largo → hls.js, o HLS nativo en Safari", () => {
    expect(chooseDelivery(src({ durationMs: 45_000 }), caps())).toEqual({ kind: "hls-js", url: "https://c/m.m3u8" });
    expect(chooseDelivery(src({ durationMs: 45_000 }), caps({ nativeHls: true, hlsJs: false, mse: false }))).toEqual({ kind: "hls-native", url: "https://c/m.m3u8" });
  });
  it("duración desconocida no activa el camino rápido", () => {
    expect(chooseDelivery(src({ durationMs: undefined }), caps()).kind).toBe("hls-js");
  });
  it("nativo (WebView de la app) prefiere HLS aunque sea corto", () => {
    expect(chooseDelivery(src(), caps({ nativeHls: true }), "native").kind).toBe("hls-native");
  });
  it("sin forma de reproducir HLS cae a MP4; sin MP4, a póster", () => {
    expect(chooseDelivery(src({ durationMs: 60_000 }), caps({ hlsJs: false })).kind).toBe("mp4");
    expect(chooseDelivery(src({ durationMs: 60_000, mp4: undefined }), caps({ hlsJs: false })).kind).toBe("poster");
    expect(chooseDelivery({ poster: "p" }, caps()).kind).toBe("poster");
  });
  it("ahorro de datos prefiere HLS (puede empezar bajo) si se puede", () => {
    expect(chooseDelivery(src(), caps({ saveData: true })).kind).toBe("hls-js");
    expect(chooseDelivery(src(), caps({ saveData: true, hlsJs: false })).kind).toBe("mp4");
  });
});

describe("pickStartLevel", () => {
  const v = [
    { bandwidth: 1_300_000, width: 360, height: 640 },
    { bandwidth: 2_600_000, width: 540, height: 960 },
    { bandwidth: 5_000_000, width: 720, height: 1280 },
    { bandwidth: 9_000_000, width: 1080, height: 1920 },
  ];
  it("sin información sube al más alto que cabe en pantalla", () => {
    expect(pickStartLevel(v, { saveData: false, viewportHeightPx: 1280 })).toBe(2);
    expect(pickStartLevel(v, { saveData: false })).toBe(3);
  });
  it("respeta el 70 % del ancho de banda estimado", () => {
    expect(pickStartLevel(v, { saveData: false, downlinkMbps: 4 })).toBe(1);
    expect(pickStartLevel(v, { saveData: false, downlinkMbps: 0.5 })).toBe(0);
  });
  it("memoria baja y ahorro de datos topan la resolución", () => {
    expect(pickStartLevel(v, { saveData: false, deviceMemoryGb: 2 })).toBe(1);
    expect(pickStartLevel(v, { saveData: true })).toBe(0);
  });
  it("lista vacía = -1", () => expect(pickStartLevel([], { saveData: false })).toBe(-1));
});

describe("detectCapabilities", () => {
  it("SSR: todo apagado", () => expect(detectCapabilities(undefined)).toMatchObject({ nativeHls: false, mse: false, hlsJs: false }));
});
