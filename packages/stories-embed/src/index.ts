/**
 * @customyai/stories-embed (ESM): `import { createStoriesEmbed } from "@customyai/stories-embed"`.
 * Los módulos pesados se cargan con `import()`: el bundler/navegador los reparte en trozos.
 */
import { createEmbed, type CustomyStoriesApi, type InitOptions } from "./embed";

export { createEmbed, EMBED_CSS, type CustomyStoriesApi, type EmbedEvent, type EmbedHandle, type InitOptions, type TokenSource } from "./embed";
export * from "./protocol";
export { isAllowedUrl, DEFAULT_SCHEMES, NEVER_SCHEMES, type UrlCheck, type UrlPolicy } from "./url-policy";
export { createBridge, detectTransport, type Bridge, type Transport, type TransportName } from "./bridge";
export type { ModuleLoaders, ModuleMap, ModuleName } from "./modules";

/** Instancia sobre la ventana actual con carga diferida por `import()`. */
export function createStoriesEmbed(win: Window & typeof globalThis = window as Window & typeof globalThis): CustomyStoriesApi {
  return createEmbed({
    win,
    loaders: {
      components: () => import("./modules/components"),
      lottie: () => import("./modules/lottie"),
      game: () => import("./modules/game"),
      video: () => import("./modules/video"),
      live: () => import("./modules/live"),
      ads: () => import("./modules/ads"),
    },
  });
}

export const init = (options: InitOptions): ReturnType<CustomyStoriesApi["init"]> => createStoriesEmbed().init(options);
