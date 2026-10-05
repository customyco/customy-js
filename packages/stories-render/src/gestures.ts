import { systemClock, type Clock, type TimerHandle } from "./clock";

export type GestureIntent =
  | { type: "tap"; zone: "left" | "center" | "right"; direction: "prev" | "next" | null }
  | { type: "hold-start" }
  | { type: "hold-end" }
  /** Swipe horizontal: `next`/`prev` YA es entre grupos y respeta RTL. */
  | { type: "swipe-group"; direction: "next" | "prev" }
  | { type: "swipe-down" }
  | { type: "swipe-up" };

export type GestureOptions = {
  /** Mantener pulsado para pausar. Por defecto 200 ms. */
  holdMs?: number;
  /** Desplazamiento máximo (px) para seguir siendo un toque. Por defecto 10. */
  slopPx?: number;
  /** Desplazamiento mínimo (px) de un swipe. Por defecto 48. */
  swipeMinPx?: number;
  /** Escritorio y lectura de derecha a izquierda: el borde «anterior» es el derecho. */
  rtl?: boolean;
  clock?: Clock;
  onIntent: (intent: GestureIntent) => void;
};

/**
 * Reconocedor de gestos puro (sin DOM): recibe coordenadas ya medidas. Toque en el tercio
 * izquierdo/derecho = anterior/siguiente (espejado en RTL); mantener ≥ 200 ms = pausa
 * (`hold-start`/`hold-end`, sin avanzar al soltar); swipe horizontal = entre grupos; abajo =
 * cerrar; arriba = abrir el enlace.
 */
export function createGestureRecognizer(options: GestureOptions) {
  const holdMs = options.holdMs ?? 200;
  const slop = options.slopPx ?? 10;
  const swipeMin = options.swipeMinPx ?? 48;
  const clock = options.clock ?? systemClock;
  let down: { x: number; y: number; width: number } | null = null;
  let holdTimer: TimerHandle | null = null;
  let holding = false;
  let moved = false;

  const clearHold = (): void => {
    if (holdTimer !== null) clock.clearTimeout(holdTimer);
    holdTimer = null;
  };

  return {
    /** `width` = ancho del visor, para los tercios. */
    pointerDown(p: { x: number; y: number; width: number }): void {
      down = { x: p.x, y: p.y, width: p.width };
      holding = false;
      moved = false;
      clearHold();
      holdTimer = clock.setTimeout(() => {
        holdTimer = null;
        if (!down || moved) return;
        holding = true;
        options.onIntent({ type: "hold-start" });
      }, holdMs);
    },
    pointerMove(p: { x: number; y: number }): void {
      if (!down || holding) return;
      if (Math.hypot(p.x - down.x, p.y - down.y) > slop) {
        moved = true;
        clearHold();
      }
    },
    pointerUp(p: { x: number; y: number }): void {
      if (!down) return;
      const start = down;
      down = null;
      clearHold();
      if (holding) {
        holding = false;
        options.onIntent({ type: "hold-end" });
        return;
      }
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= slop && !moved) {
        const third = start.width / 3;
        const zone = p.x < third ? "left" : p.x > third * 2 ? "right" : "center";
        // El tercio izquierdo es «anterior» en LTR y el derecho en RTL.
        const leftIsPrev = !options.rtl;
        const direction = zone === "center" ? null : (zone === "left") === leftIsPrev ? "prev" : "next";
        options.onIntent({ type: "tap", zone, direction });
        return;
      }
      if (dist < swipeMin) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Dedo hacia la izquierda = siguiente en LTR; en RTL al revés.
        const toLeft = dx < 0;
        options.onIntent({ type: "swipe-group", direction: toLeft !== !!options.rtl ? "next" : "prev" });
      } else if (dy > 0) options.onIntent({ type: "swipe-down" });
      else options.onIntent({ type: "swipe-up" });
    },
    pointerCancel(): void {
      clearHold();
      const wasHolding = holding;
      down = null;
      holding = false;
      if (wasHolding) options.onIntent({ type: "hold-end" });
    },
    destroy(): void {
      clearHold();
      down = null;
    },
  };
}
