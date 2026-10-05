import { Image } from "react-native";
import type { AssetLoader, PreloadAsset } from "@customyai/stories-render";
import type { VideoPlayerAdapter } from "./adapters";

/**
 * Caché de medios inyectable. `load` precarga un medio (cancelable); `resolve` puede devolver la ruta de un
 * fichero ya guardado (expo-file-system, react-native-fs, el caché de expo-image/FastImage…) para pintar
 * desde disco en lugar de la red. La implementación por defecto usa solo APIs de React Native.
 */
export type MediaCache = {
  load: AssetLoader;
  resolve?: (url: string, kind: PreloadAsset["kind"]) => string | undefined;
};

export type DefaultMediaCacheOptions = {
  /** Bytes que se piden de cada vídeo para calentar la conexión y el caché HTTP del sistema. Por defecto 256 KiB. */
  videoWarmBytes?: number;
  fetch?: typeof fetch;
};

const aborted = (): Error => Object.assign(new Error("aborted"), { name: "AbortError" });

/** Rechaza si `signal` se aborta antes de que `work` acabe (`Image.prefetch` no se puede cancelar de verdad). */
function cancellable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(aborted());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** Imágenes con `Image.prefetch`; vídeo, subtítulos y Lottie con `fetch` (el vídeo, solo sus primeros bytes). */
export function createDefaultMediaCache(options: DefaultMediaCacheOptions = {}): MediaCache {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const warm = Math.max(1024, options.videoWarmBytes ?? 256 * 1024);
  return {
    async load(asset, signal) {
      if (asset.kind === "image") {
        const ok = await cancellable(Image.prefetch(asset.url), signal);
        if (!ok) throw new Error(`prefetch failed: ${asset.url}`);
        return;
      }
      const headers = asset.kind === "video" ? { Range: `bytes=0-${warm - 1}` } : undefined;
      const res = await doFetch(asset.url, { signal, ...(headers ? { headers } : {}) });
      // 200 y 206 son buenos; el cuerpo no se lee, solo se calienta la conexión y el caché del sistema.
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${asset.url}`);
    },
  };
}

/** El cargador que usa el visor: la caché de la app y, para vídeo, el `preload` del reproductor si lo trae. */
export function composeAssetLoader(cache: MediaCache, video?: VideoPlayerAdapter): AssetLoader {
  return (asset, signal) => {
    if (asset.kind === "video" && video?.preload) return cancellable(video.preload(asset.url, signal), signal);
    return cache.load(asset, signal);
  };
}

/** Ruta que se pinta: la de la caché si la tiene, o la URL original. */
export const mediaUri = (cache: MediaCache | undefined, url: string, kind: PreloadAsset["kind"] = "image"): string => cache?.resolve?.(url, kind) ?? url;
