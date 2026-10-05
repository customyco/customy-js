/**
 * Módulos pesados, de carga diferida. Cada formato de salida decide CÓMO se cargan:
 *   ESM   → `import()` (el bundler/navegador reparte los trozos).
 *   IIFE  → un <script> por módulo (`customy-stories-embed.<nombre>.js`) junto al principal; no hay trozos en IIFE.
 * Quien no usa Lottie, juegos, vídeo HLS, directos o anuncios no descarga ni un byte de ellos.
 */

export type ModuleName = "components" | "lottie" | "game" | "video" | "live" | "ads";
export type ModuleMap = {
  components: typeof import("./modules/components");
  lottie: typeof import("./modules/lottie");
  game: typeof import("./modules/game");
  video: typeof import("./modules/video");
  live: typeof import("./modules/live");
  ads: typeof import("./modules/ads");
};
export type ModuleLoaders = { [K in ModuleName]: () => Promise<ModuleMap[K]> };

export const MODULE_NAMES: readonly ModuleName[] = ["components", "lottie", "game", "video", "live", "ads"];
export const REGISTRY_KEY = "__CustomyStoriesModules";

/** Cargador por <script>: lee el registro global que cada módulo IIFE rellena al ejecutarse. */
export function scriptLoaders(win: Window & typeof globalThis, base: string, nonce?: string): ModuleLoaders {
  const cache = new Map<string, Promise<unknown>>();
  const load = <K extends ModuleName>(name: K): Promise<ModuleMap[K]> => {
    const hit = cache.get(name);
    if (hit) return hit as Promise<ModuleMap[K]>;
    const reg = (win as unknown as Record<string, Record<string, unknown> | undefined>)[REGISTRY_KEY];
    if (reg?.[name]) return Promise.resolve(reg[name] as ModuleMap[K]);
    const p = new Promise<ModuleMap[K]>((resolve, reject) => {
      const script = win.document.createElement("script");
      script.src = `${base}customy-stories-embed.${name}.js`;
      script.async = true;
      if (nonce) script.nonce = nonce;
      script.onload = () => {
        const mod = (win as unknown as Record<string, Record<string, unknown> | undefined>)[REGISTRY_KEY]?.[name];
        if (mod) resolve(mod as ModuleMap[K]);
        else reject(new Error(`módulo ${name} cargado pero no registrado`));
      };
      script.onerror = () => {
        cache.delete(name);
        reject(new Error(`no se pudo cargar el módulo ${name}`));
      };
      win.document.head.append(script);
    });
    cache.set(name, p);
    return p;
  };
  return { components: () => load("components"), lottie: () => load("lottie"), game: () => load("game"), video: () => load("video"), live: () => load("live"), ads: () => load("ads") };
}

/** Directorio del <script> principal (con `/` final), para encontrar los módulos IIFE al lado. */
export function scriptBase(doc: Document, explicit?: string): string {
  if (explicit) return explicit.endsWith("/") ? explicit : `${explicit}/`;
  const cur = doc.currentScript as HTMLScriptElement | null;
  const src = cur?.src ?? "";
  return src ? src.slice(0, src.lastIndexOf("/") + 1) : "./";
}
