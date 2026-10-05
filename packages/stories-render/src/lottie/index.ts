/**
 * @customyai/stories-render/lottie — módulo OPCIONAL de Lottie sobre `lottie-web` (peer opcional).
 * Importa la variante `lottie_light` (sin el motor de expresiones, que usa `eval`/`new Function`): una animación venida de la
 * campaña no puede ejecutar código por esa vía. Las animaciones con expresiones AE se ven sin ellas (valores estáticos).
 * Se carga bajo demanda: `loadLottie: () => import("@customyai/stories-render/lottie").then(m => m.lottieFactory())`.
 * Quien no use capas Lottie no descarga ni un byte de esto.
 */
import type { LottieFactory } from "../dom/lottie-types";

export type { LottieFactory, LottieInstance, LottieLoader } from "../dom/lottie-types";

type LottieWeb = {
  loadAnimation(config: { container: HTMLElement; renderer: "svg"; loop: boolean; autoplay: boolean; path: string; rendererSettings?: Record<string, unknown> }): { play(): void; pause(): void; destroy(): void };
};

/** Fábrica sobre `lottie-web` (build ligero, render SVG). `lottie-web` (variante ligera) se importa aquí, no antes. */
export async function lottieFactory(): Promise<LottieFactory> {
  const mod = (await import("lottie-web/build/player/lottie_light")) as unknown as { default?: LottieWeb } & LottieWeb;
  const lottie = mod.default ?? mod;
  return (container, url, options) => lottie.loadAnimation({ container, renderer: "svg", loop: options.loop, autoplay: options.autoplay, path: url, rendererSettings: { preserveAspectRatio: "xMidYMid slice" } });
}
