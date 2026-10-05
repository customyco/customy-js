/**
 * Reloj inyectable: el núcleo no toca `window` ni `document`. Por defecto usa los
 * temporizadores globales, resueltos EN CADA LLAMADA (así los temporizadores falsos
 * de las pruebas y los de cada entorno funcionan sin configurar nada).
 */
export type TimerHandle = unknown;

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Duración efectiva de una página (ms): la suya, o 7 s con imagen y 15 s con vídeo. */
export function pageDurationMs(page: { duration_ms?: number; background?: { type: string }; canvas?: { layers?: { type: string }[] } }): number {
  if (page.duration_ms) return page.duration_ms;
  const hasVideo = page.background?.type === "video" || page.canvas?.layers?.some((l) => l.type === "video");
  return hasVideo ? 15000 : 7000;
}

/** ¿La página lleva vídeo (de fondo o como capa)? Si sí, su reloj es el del vídeo. */
export function pageHasVideo(page: { background?: { type: string }; canvas?: { layers?: { type: string }[] } }): boolean {
  return page.background?.type === "video" || !!page.canvas?.layers?.some((l) => l.type === "video");
}
