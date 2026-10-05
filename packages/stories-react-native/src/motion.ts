import type { AnimationPhase, ResolvedAnimation } from "./core";

/**
 * Animaciones declarativas de una capa como función PURA del tiempo de la página: el visor mueve un solo valor
 * (el progreso de la página) y cada capa lo evalúa. Así pausar la página congela las animaciones, la animación
 * `out` queda anclada al final de verdad y todo se prueba sin Reanimated. Mismas curvas y distancias que los
 * `@keyframes` del renderer web (`styles.css`).
 */
export type MotionSpec = {
  phase: AnimationPhase;
  kind: ResolvedAnimation["kind"];
  delayMs: number;
  durationMs: number;
  /** Curva cúbica `[x1, y1, x2, y2]`; `null` = lineal. */
  bezier: readonly [number, number, number, number] | null;
};

export type Motion = { opacity: number; translateX: number; translateY: number; scale: number };
export const REST: Motion = { opacity: 1, translateX: 0, translateY: 0, scale: 1 };

const BEZIER = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/;

export function toMotionSpecs(list: readonly ResolvedAnimation[]): MotionSpec[] {
  return list.map((a) => {
    const m = BEZIER.exec(a.easing);
    return {
      phase: a.phase,
      kind: a.kind,
      delayMs: a.delayMs,
      durationMs: Math.max(1, a.durationMs),
      bezier: m ? ([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const) : null,
    };
  });
}

const SLIDE = 24;
const SCALE_FROM = 0.7;

/** Curva cúbica CSS: resuelve x(t) = progreso con Newton y, si no converge, bisección. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - x;
    if (Math.abs(err) < 1e-5) return ((ay * t + by) * t + cy) * t;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 24; i++) {
    const v = sampleX(t);
    if (Math.abs(v - x) < 1e-5) break;
    if (v < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return ((ay * t + by) * t + cy) * t;
}

/** Interpolación lineal entre puntos `[t, valor]` (la forma de los keyframes con porcentajes). */
function piecewise(points: readonly (readonly [number, number])[], p: number): number {
  "worklet";
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (p <= b[0]) return a[1] + ((b[1] - a[1]) * (p - a[0])) / (b[0] - a[0] || 1);
  }
  return points[points.length - 1]![1];
}

const SHAKE = [[0, 0], [0.2, -6], [0.4, 6], [0.6, -6], [0.8, 6], [1, 0]] as const;
const BOUNCE = [[0, 0], [0.3, -14], [0.6, 0], [0.8, -5], [1, 0]] as const;

/** El estado de la capa `t` ms después de empezar la página. */
export function motionAt(specs: readonly MotionSpec[], t: number): Motion {
  "worklet";
  let opacity = 1;
  let tx = 0;
  let ty = 0;
  let scale = 1;
  for (const s of specs) {
    const raw = (t - s.delayMs) / s.durationMs;
    const clamped = Math.min(1, Math.max(0, raw));
    const e = s.bezier ? cubicBezier(s.bezier[0], s.bezier[1], s.bezier[2], s.bezier[3], clamped) : clamped;
    if (s.phase === "in") {
      // Hasta que empieza se ve el estado inicial (`fill: backwards`).
      const rest = 1 - e;
      opacity *= e;
      if (s.kind === "slide_up") ty += SLIDE * rest;
      else if (s.kind === "slide_down") ty -= SLIDE * rest;
      else if (s.kind === "slide_left") tx += SLIDE * rest;
      else if (s.kind === "slide_right") tx -= SLIDE * rest;
      else if (s.kind === "scale") scale *= SCALE_FROM + (1 - SCALE_FROM) * e;
    } else if (s.phase === "out") {
      // Antes de empezar no hace nada; al acabar se queda oculta (`fill: forwards`).
      if (raw < 0) continue;
      opacity *= 1 - e;
      if (s.kind === "slide_up") ty -= SLIDE * e;
      else if (s.kind === "slide_down") ty += SLIDE * e;
      else if (s.kind === "slide_left") tx -= SLIDE * e;
      else if (s.kind === "slide_right") tx += SLIDE * e;
      else if (s.kind === "scale") scale *= 1 - (1 - SCALE_FROM) * e;
    } else {
      if (raw < 0 || raw > 1) continue;
      if (s.kind === "pulse") scale *= 1 + 0.08 * (1 - Math.abs(2 * e - 1));
      else if (s.kind === "shake") tx += piecewise(SHAKE, e);
      else if (s.kind === "bounce") ty += piecewise(BOUNCE, e);
    }
  }
  return { opacity, translateX: tx, translateY: ty, scale };
}
