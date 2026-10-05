import { Image } from "react-native";
import { describe, expect, it, vi } from "vitest";
import type { PreloadAsset } from "./core";
import type { VideoPlayerAdapter } from "./adapters";
import { composeAssetLoader, createDefaultMediaCache, mediaUri } from "./media";

const asset = (kind: PreloadAsset["kind"], url = `https://cdn.test/x.${kind}`): PreloadAsset => ({ kind, url, critical: kind === "image" });
const ok = (status = 200) => new Response(null, { status });

describe("caché de medios por defecto", () => {
  it("imágenes con Image.prefetch; un fallo del prefetch rechaza", async () => {
    const cache = createDefaultMediaCache();
    await cache.load(asset("image"), new AbortController().signal);
    expect(Image.prefetch).toHaveBeenCalledWith("https://cdn.test/x.image");
    vi.mocked(Image.prefetch).mockResolvedValueOnce(false);
    await expect(cache.load(asset("image"), new AbortController().signal)).rejects.toThrow(/prefetch/);
  });

  it("cancelar aborta aunque Image.prefetch no se pueda cancelar", async () => {
    vi.mocked(Image.prefetch).mockReturnValueOnce(new Promise(() => undefined));
    const c = new AbortController();
    const p = createDefaultMediaCache().load(asset("image"), c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    const already = new AbortController();
    already.abort();
    await expect(createDefaultMediaCache().load(asset("image"), already.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("el vídeo solo pide sus primeros bytes y acepta 206; subtítulos y Lottie, completos", async () => {
    const fetch = vi.fn(async () => ok(206));
    const cache = createDefaultMediaCache({ fetch: fetch as never, videoWarmBytes: 64 * 1024 });
    const signal = new AbortController().signal;
    await cache.load(asset("video"), signal);
    expect(fetch).toHaveBeenLastCalledWith("https://cdn.test/x.video", { signal, headers: { Range: "bytes=0-65535" } });
    await cache.load(asset("caption"), signal);
    expect(fetch).toHaveBeenLastCalledWith("https://cdn.test/x.caption", { signal });
    fetch.mockResolvedValueOnce(ok(404));
    await expect(cache.load(asset("lottie"), signal)).rejects.toThrow(/404/);
  });
});

describe("cargador compuesto", () => {
  it("el vídeo pasa por el `preload` del reproductor si lo tiene; lo demás, por la caché", async () => {
    const cache = { load: vi.fn(async () => undefined) };
    const preload = vi.fn(async () => undefined);
    const video = { Component: () => null, preload } as VideoPlayerAdapter;
    const signal = new AbortController().signal;
    const load = composeAssetLoader(cache, video);
    await load(asset("video"), signal);
    await load(asset("image"), signal);
    expect(preload).toHaveBeenCalledTimes(1);
    expect(cache.load).toHaveBeenCalledTimes(1);
    // sin preload en el reproductor: la caché también calienta el vídeo
    await composeAssetLoader(cache, { Component: () => null })(asset("video"), signal);
    expect(cache.load).toHaveBeenCalledTimes(2);
  });

  it("la ruta que se pinta es la de la caché si la tiene", () => {
    expect(mediaUri(undefined, "https://a/x.jpg")).toBe("https://a/x.jpg");
    expect(mediaUri({ load: async () => undefined, resolve: (u) => u.replace("https://a/", "file:///cache/") }, "https://a/x.jpg")).toBe("file:///cache/x.jpg");
    expect(mediaUri({ load: async () => undefined, resolve: () => undefined }, "https://a/x.jpg")).toBe("https://a/x.jpg");
  });
});
