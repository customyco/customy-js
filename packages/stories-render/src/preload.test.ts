import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreloader, pageAssets, planPreload, type PreloadAsset } from "./preload";
import { group, page, textLayer } from "./test-fixtures";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("activos de una página", () => {
  it("fondo, capas y póster del vídeo, sin duplicados", () => {
    const p = page("p", {
      background: { type: "video", url: "https://c/v.mp4", poster: "https://c/p.jpg", fit: "fill", muted: true, has_speech: false, captions: [{ lang: "es", url: "https://c/s.vtt" }], decorative: true },
    });
    p.canvas.layers = [
      { ...textLayer("t") },
      { type: "image", id: "i", x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, z: 0, animations: [], decorative: true, url: "https://c/p.jpg", fit: "fill" },
      { type: "lottie", id: "l", x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, z: 0, animations: [], decorative: true, url: "https://c/a.json", loop: true },
    ];
    const assets = pageAssets(p);
    expect(assets.map((a) => `${a.kind}:${a.url}`)).toEqual(["image:https://c/p.jpg", "video:https://c/v.mp4", "caption:https://c/s.vtt", "lottie:https://c/a.json"]);
    expect(assets[0]?.critical).toBe(true);
    expect(assets[1]).toMatchObject({ poster: "https://c/p.jpg", critical: false });
  });
});

describe("plan de precarga", () => {
  const gs = [group("a", ["1", "2", "3"]), group("b", ["x", "y"]), group("c", ["z"])];
  it("la siguiente página y la primera del siguiente grupo", () => {
    expect(planPreload(gs, 0, 0)).toEqual([
      { groupIndex: 0, pageIndex: 1 },
      { groupIndex: 1, pageIndex: 0 },
    ]);
  });
  it("en la última página, solo el grupo siguiente; en el último grupo, nada", () => {
    expect(planPreload(gs, 0, 2)).toEqual([{ groupIndex: 1, pageIndex: 0 }]);
    expect(planPreload(gs, 2, 0)).toEqual([]);
  });
});

describe("precargador", () => {
  const img = (url: string): PreloadAsset => ({ url, kind: "image", critical: true });
  const vid = (url: string): PreloadAsset => ({ url, kind: "video", poster: "https://c/p.jpg", critical: false });

  it("reintenta con espera creciente y acaba bien", async () => {
    let n = 0;
    const load = vi.fn(async () => {
      if (++n < 3) throw new Error("red");
    });
    const pre = createPreloader({ load, retries: 2, backoffMs: [300, 900] });
    const h = pre.request("g/p", [img("https://c/a.jpg")]);
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(900);
    await expect(h.promise).resolves.toMatchObject({ ok: true, failed: [], posterFallback: false });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("un vídeo que no carga degrada a póster y la página sigue siendo válida", async () => {
    const load = vi.fn(async (a: PreloadAsset) => {
      if (a.kind === "video") throw new Error("404");
    });
    const pre = createPreloader({ load, retries: 1, backoffMs: [10] });
    const h = pre.request("g/p", [img("https://c/p.jpg"), vid("https://c/v.mp4")]);
    await vi.advanceTimersByTimeAsync(10);
    const res = await h.promise;
    expect(res).toMatchObject({ ok: true, posterFallback: true });
    expect(res.failed.map((f) => f.url)).toEqual(["https://c/v.mp4"]);
  });

  it("un fondo que no carga tras los reintentos es ok:false", async () => {
    const pre = createPreloader({ load: async () => Promise.reject(new Error("x")), retries: 0 });
    await expect(pre.request("k", [img("https://c/a.jpg")]).promise).resolves.toMatchObject({ ok: false });
  });

  it("cancelar aborta la señal y los reintentos pendientes", async () => {
    const signals: AbortSignal[] = [];
    const load = vi.fn(async (_a: PreloadAsset, s: AbortSignal) => {
      signals.push(s);
      throw new Error("lento");
    });
    const pre = createPreloader({ load, retries: 3, backoffMs: [1000] });
    const h = pre.request("k", [img("https://c/a.jpg")]);
    await vi.advanceTimersByTimeAsync(0);
    h.cancel();
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(h.promise).rejects.toThrow();
    expect(pre.has("k")).toBe(false);
  });

  it("pedir lo mismo dos veces comparte el trabajo; cancelExcept respeta lo que se quiere", async () => {
    const load = vi.fn(() => new Promise<void>(() => undefined));
    const pre = createPreloader({ load });
    const a = pre.request("a", [img("https://c/a.jpg")]);
    expect(pre.request("a", [img("https://c/a.jpg")])).toBe(a);
    pre.request("b", [img("https://c/b.jpg")]);
    pre.cancelExcept(["b"]);
    expect(pre.has("a")).toBe(false);
    expect(pre.has("b")).toBe(true);
    pre.cancelAll();
    expect(pre.has("b")).toBe(false);
  });
});
