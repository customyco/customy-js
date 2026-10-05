import { REFERENCE_HEIGHT, REFERENCE_WIDTH, type SafeZone, type StoryComponent, type StoryLayer } from "./types";

/** Visor real: el ANCHO manda; el alto sale de 9:16 (1080×1920). */
export type Viewport = { width: number; height: number; scale: number };
export type Box = { left: number; top: number; width: number; height: number };

export function viewportFromWidth(width: number): Viewport {
  const w = Math.max(1, width);
  const scale = w / REFERENCE_WIDTH;
  return { width: w, height: scale * REFERENCE_HEIGHT, scale };
}

/** Visor que cabe en `maxWidth × maxHeight` conservando 9:16 (para escritorio). */
export function viewportFit(maxWidth: number, maxHeight: number): Viewport {
  const byHeight = (maxHeight * REFERENCE_WIDTH) / REFERENCE_HEIGHT;
  return viewportFromWidth(Math.min(maxWidth, byHeight));
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Coordenadas relativas 0–1 → píxeles del visor. */
export function relativeBox(r: { x: number; y: number; w: number; h: number }, vp: Viewport): Box {
  return { left: clamp01(r.x) * vp.width, top: clamp01(r.y) * vp.height, width: clamp01(r.w) * vp.width, height: clamp01(r.h) * vp.height };
}

/** La zona segura (px de referencia) a píxeles del visor. */
export function safeInsets(safe: SafeZone, vp: Viewport): { top: number; bottom: number } {
  return { top: safe.top_px * vp.scale, bottom: safe.bottom_px * vp.scale };
}

export function layerBox(layer: Pick<StoryLayer, "x" | "y" | "w" | "h">, vp: Viewport): Box {
  return relativeBox(layer, vp);
}

/**
 * Caja de un componente interactivo: se mantiene DENTRO de la zona segura (no se tapa con la
 * UI de la propia historia: barra de progreso arriba, respuesta/CTA abajo). Las capas decorativas
 * no se recolocan; los componentes sí. Si la zona segura no cabe el componente, se centra en ella.
 */
export function componentBox(c: Pick<StoryComponent, "x" | "y" | "w" | "h">, vp: Viewport, safe: SafeZone): Box {
  const box = relativeBox(c, vp);
  const inset = safeInsets(safe, vp);
  const minTop = inset.top;
  const maxBottom = vp.height - inset.bottom;
  if (box.height >= maxBottom - minTop) return { ...box, top: minTop + (maxBottom - minTop - box.height) / 2 };
  const top = Math.min(Math.max(box.top, minTop), maxBottom - box.height);
  return { ...box, top };
}

/** Tamaño de fuente en px: `font_size` es relativo al ALTO del lienzo. */
export function fontPx(fontSize: number, vp: Viewport): number {
  return Math.max(1, Math.round(fontSize * vp.height * 100) / 100);
}

/** Orden de apilado estable: `z` y luego el orden en el documento. */
export function sortByZ<T extends { z: number }>(items: readonly T[]): T[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => a.item.z - b.item.z || a.i - b.i).map((x) => x.item);
}

/** `inset-inline` en RTL: devuelve la caja con el eje horizontal espejado. */
export function mirrorBox(box: Box, vp: Viewport): Box {
  return { ...box, left: vp.width - box.left - box.width };
}
