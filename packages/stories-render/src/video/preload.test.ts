import { describe, expect, it, vi } from "vitest";
import { MP4_WARM_BYTES, createVideoWindow, planWindow, prefetchFirstSegment, type FetchLike } from "./preload";
import type { Capabilities, VideoSource } from "./types";

const caps: Capabilities = { nativeHls: false, mse: true, hlsJs: true, saveData: false };
const MASTER = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=360x640,CODECS="avc1.64001e"\n360p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=720x1280,CODECS="avc1.64001f"\n720p/index.m3u8\n`;
const MEDIA = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\nseg_00000.m4s\n#EXTINF:2.0,\nseg_00001.m4s\n#EXT-X-ENDLIST\n';
const fakeFetch = (calls: { url: string; headers?: Record<string, string> }[], fail = new Set<string>()): FetchLike => async (url, init) => {
  calls.push({ url, headers: init?.headers });
  return { ok: !fail.has(url), text: async () => (url.endsWith("master.m3u8") ? MASTER : MEDIA), arrayBuffer: async () => new ArrayBuffer(4) };
};
const hlsSource: VideoSource = { poster: "p", hls: "https://c/v/1/t/hls/master.m3u8", durationMs: 60_000 };

describe("planWindow", () => {
  it("actual, siguiente y anterior", () => {
    expect(planWindow(5, 2)).toEqual([{ index: 2, role: "current" }, { index: 3, role: "next" }, { index: 1, role: "prev" }]);
  });
  it("bordes y vacío", () => {
    expect(planWindow(3, 0).map((p) => p.role)).toEqual(["current", "next"]);
    expect(planWindow(3, 2).map((p) => p.role)).toEqual(["current", "prev"]);
    expect(planWindow(0, 0)).toEqual([]);
    expect(planWindow(3, 9)).toEqual([]);
  });
});

describe("prefetchFirstSegment", () => {
  it("HLS: maestra → playlist del escalón inicial → init + primer segmento (y nada más)", async () => {
    const calls: { url: string }[] = [];
    const urls = await prefetchFirstSegment(hlsSource, new AbortController().signal, { fetch: fakeFetch(calls), caps: { ...caps, viewportHeightPx: 640 } });
    expect(urls).toEqual([
      "https://c/v/1/t/hls/master.m3u8",
      "https://c/v/1/t/hls/360p/index.m3u8",
      "https://c/v/1/t/hls/360p/init.mp4",
      "https://c/v/1/t/hls/360p/seg_00000.m4s",
    ]);
    expect(urls.some((u) => u.includes("seg_00001"))).toBe(false);
  });
  it("MP4: sólo los primeros bytes por Range", async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    await prefetchFirstSegment({ poster: "p", mp4: "https://c/v.mp4", durationMs: 9000 }, new AbortController().signal, { fetch: fakeFetch(calls), caps });
    expect(calls).toEqual([{ url: "https://c/v.mp4", headers: { Range: `bytes=0-${MP4_WARM_BYTES - 1}` } }]);
  });
  it("un fallo de red se traga (la precarga es una mejora)", async () => {
    const calls: { url: string }[] = [];
    await expect(prefetchFirstSegment(hlsSource, new AbortController().signal, { fetch: fakeFetch(calls, new Set(["https://c/v/1/t/hls/master.m3u8"])), caps })).resolves.toEqual(["https://c/v/1/t/hls/master.m3u8"]);
  });
  it("una señal ya abortada no pide nada", async () => {
    const c = new AbortController(); c.abort();
    const calls: { url: string }[] = [];
    expect(await prefetchFirstSegment(hlsSource, c.signal, { fetch: fakeFetch(calls), caps })).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("sin fetch ni entrega reproducible no hace nada", async () => {
    expect(await prefetchFirstSegment({ poster: "p" }, new AbortController().signal, { fetch: fakeFetch([]), caps })).toEqual([]);
  });
});

describe("createVideoWindow", () => {
  const items = ["a", "b", "c", "d", "e"];
  const make = () => {
    const signals = new Map<string, AbortSignal>();
    const warm = vi.fn((item: string, _role: string, signal: AbortSignal) => { signals.set(item, signal); return new Promise<void>(() => undefined); });
    return { warm, signals, win: createVideoWindow<string>({ keyOf: (s) => s, warm }) };
  };
  it("calienta siguiente y anterior, no la actual", () => {
    const { warm, win } = make();
    win.update(items, 2);
    expect(warm.mock.calls.map((c) => [c[0], c[1]])).toEqual([["d", "next"], ["b", "prev"]]);
    expect(win.resident().sort()).toEqual(["b", "d"]);
  });
  it("avanzar conserva el calentamiento en curso del que pasa a actual y cancela el que sale", () => {
    const { warm, signals, win } = make();
    win.update(items, 2);
    win.update(items, 3);
    expect(signals.get("d")!.aborted).toBe(false);
    expect(signals.get("b")!.aborted).toBe(true);
    expect(warm.mock.calls.map((c) => c[0])).toEqual(["d", "b", "e", "c"]);
  });
  it("saltar lejos cancela todo lo pendiente", () => {
    const { signals, win } = make();
    win.update(items, 2);
    win.update(items, 0);
    expect(signals.get("d")!.aborted).toBe(true);
    // «b» sigue en la ventana (siguiente de «a»): su calentamiento NO se cancela.
    expect(signals.get("b")!.aborted).toBe(false);
  });
  it("no relanza lo que ya está en ventana y cancelAll vacía", () => {
    const { warm, signals, win } = make();
    win.update(items, 2);
    win.update(items, 2);
    expect(warm).toHaveBeenCalledTimes(2);
    win.cancelAll();
    expect(win.resident()).toEqual([]);
    expect([...signals.values()].every((s) => s.aborted)).toBe(true);
  });
});
