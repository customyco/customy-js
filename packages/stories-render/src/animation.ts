import type { AnimationEasing, AnimationKind, AnimationPhase, LayerAnimation } from "./types";

export type ResolvedAnimation = {
  phase: AnimationPhase;
  kind: Exclude<AnimationKind, "none">;
  /** Nombre del `@keyframes` de `styles.css` (`cs-anim-<kind>`). */
  keyframes: string;
  delayMs: number;
  durationMs: number;
  easing: string;
  /** `backwards` en entradas (oculta antes de empezar), `forwards` en salidas (queda oculto). */
  fillMode: "backwards" | "forwards" | "none";
};

const EASING: Record<AnimationEasing, string> = {
  linear: "linear",
  ease_in: "cubic-bezier(0.4, 0, 1, 1)",
  ease_out: "cubic-bezier(0, 0, 0.2, 1)",
  ease_in_out: "cubic-bezier(0.4, 0, 0.2, 1)",
};

export function easingCss(e: AnimationEasing): string {
  return EASING[e] ?? EASING.ease_out;
}

/**
 * Animaciones declarativas de una capa → temporización concreta.
 *  - `in` empieza en `delay_ms`;
 *  - `emphasis` empieza al terminar la entrada (+ `delay_ms`);
 *  - `out` se ancla al FINAL de la página: acaba `delay_ms` antes del final (decisión del
 *    renderer, el contrato no la fija).
 * Con `prefers-reduced-motion` no hay movimiento: se devuelve `[]` (la capa se ve estática
 * y completa desde el primer instante). Una animación `none` tampoco anima.
 */
export function resolveAnimations(animations: readonly LayerAnimation[], opts: { reducedMotion: boolean; pageDurationMs: number }): ResolvedAnimation[] {
  if (opts.reducedMotion) return [];
  const real = animations.filter((a) => a.kind !== "none");
  const enter = real.find((a) => a.phase === "in");
  const enterEnd = enter ? enter.delay_ms + enter.duration_ms : 0;
  return real.map((a): ResolvedAnimation => {
    let delayMs = a.delay_ms;
    if (a.phase === "emphasis") delayMs = enterEnd + a.delay_ms;
    if (a.phase === "out") delayMs = Math.max(0, opts.pageDurationMs - a.duration_ms - a.delay_ms);
    return {
      phase: a.phase,
      kind: a.kind as ResolvedAnimation["kind"],
      keyframes: `cs-anim-${a.kind.replace(/_/g, "-")}${a.phase === "out" ? "-out" : ""}`,
      delayMs,
      durationMs: a.duration_ms,
      easing: easingCss(a.easing),
      fillMode: a.phase === "in" ? "backwards" : a.phase === "out" ? "forwards" : "none",
    };
  });
}

/** Valor del atributo `animation` de CSS para un conjunto de animaciones (varias separadas por coma). */
export function animationCssValue(list: readonly ResolvedAnimation[]): string {
  return list.map((a) => `${a.keyframes} ${a.durationMs}ms ${a.easing} ${a.delayMs}ms 1 ${a.fillMode}`).join(", ");
}

/** Cuenta atrás: tiempo restante partido en d/h/m/s; negativo = terminada. */
export function countdownParts(endsAtIso: string, nowMs: number): { done: boolean; days: number; hours: number; minutes: number; seconds: number; totalMs: number } {
  const totalMs = Date.parse(endsAtIso) - nowMs;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  const s = Math.floor(totalMs / 1000);
  return { done: false, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, totalMs };
}
