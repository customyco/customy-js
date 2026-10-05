import { describe, expect, it } from "vitest";
import { resolveAnimations, type LayerAnimation } from "./core";
import { cubicBezier, motionAt, toMotionSpecs } from "./motion";

const anim = (over: Partial<LayerAnimation>): LayerAnimation => ({ phase: "in", kind: "fade", delay_ms: 0, duration_ms: 1000, easing: "linear", ...over });
const specs = (list: LayerAnimation[], durationMs = 7000) => toMotionSpecs(resolveAnimations(list, { reducedMotion: false, pageDurationMs: durationMs }));

describe("curvas", () => {
  it("cubic-bezier cumple los extremos y es monótona", () => {
    for (const [a, b, c, d] of [[0.4, 0, 0.2, 1], [0, 0, 0.2, 1], [0.4, 0, 1, 1]] as [number, number, number, number][]) {
      expect(cubicBezier(a, b, c, d, 0)).toBe(0);
      expect(cubicBezier(a, b, c, d, 1)).toBe(1);
      let prev = 0;
      for (let x = 0.05; x < 1; x += 0.05) {
        const y = cubicBezier(a, b, c, d, x);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = y;
      }
    }
    // ease_out arranca rápido; ease_in, lento
    expect(cubicBezier(0, 0, 0.2, 1, 0.2)).toBeGreaterThan(0.2);
    expect(cubicBezier(0.4, 0, 1, 1, 0.2)).toBeLessThan(0.2);
  });

  it("la cadena de easing del renderer se convierte a números", () => {
    expect(specs([anim({ easing: "linear" })])[0]!.bezier).toBeNull();
    expect(specs([anim({ easing: "ease_in_out" })])[0]!.bezier).toEqual([0.4, 0, 0.2, 1]);
  });
});

describe("animaciones declarativas como función del tiempo", () => {
  it("entrada `fade` con retardo: invisible antes, completa al acabar", () => {
    const s = specs([anim({ delay_ms: 500, duration_ms: 1000 })]);
    expect(motionAt(s, 0).opacity).toBe(0);
    expect(motionAt(s, 500).opacity).toBe(0);
    expect(motionAt(s, 1000).opacity).toBeCloseTo(0.5);
    expect(motionAt(s, 1500).opacity).toBe(1);
    expect(motionAt(s, 6000).opacity).toBe(1);
  });

  it("slide_up viene de 24 px más abajo; scale, de 0,7", () => {
    const up = specs([anim({ kind: "slide_up" })]);
    expect(motionAt(up, 0)).toMatchObject({ opacity: 0, translateY: 24 });
    expect(motionAt(up, 1000)).toMatchObject({ opacity: 1, translateY: 0 });
    expect(motionAt(specs([anim({ kind: "scale" })]), 0).scale).toBeCloseTo(0.7);
    expect(motionAt(specs([anim({ kind: "slide_right" })]), 0).translateX).toBe(-24);
  });

  it("la salida está anclada al FINAL de la página y no hace nada antes", () => {
    const s = specs([anim({ phase: "out", duration_ms: 1000, delay_ms: 0 })], 7000);
    expect(motionAt(s, 0).opacity).toBe(1);
    expect(motionAt(s, 5999).opacity).toBe(1);
    expect(motionAt(s, 6500).opacity).toBeCloseTo(0.5);
    expect(motionAt(s, 7000).opacity).toBe(0);
  });

  it("énfasis: pulse sube y baja, shake oscila y se recoge, y fuera de su ventana no actúa", () => {
    const pulse = specs([anim({ phase: "emphasis", kind: "pulse", delay_ms: 0, duration_ms: 1000 })]);
    expect(motionAt(pulse, 500).scale).toBeCloseTo(1.08);
    expect(motionAt(pulse, 0).scale).toBe(1);
    expect(motionAt(pulse, 3000).scale).toBe(1);
    const shake = specs([anim({ phase: "emphasis", kind: "shake", delay_ms: 0, duration_ms: 1000 })]);
    expect(motionAt(shake, 200).translateX).toBeCloseTo(-6);
    expect(motionAt(shake, 400).translateX).toBeCloseTo(6);
    expect(motionAt(shake, 1000).translateX).toBeCloseTo(0);
    const bounce = specs([anim({ phase: "emphasis", kind: "bounce", delay_ms: 0, duration_ms: 1000 })]);
    expect(motionAt(bounce, 300).translateY).toBeCloseTo(-14);
  });

  it("el énfasis empieza al acabar la entrada", () => {
    const s = specs([anim({ kind: "fade", duration_ms: 1000 }), anim({ phase: "emphasis", kind: "pulse", delay_ms: 0, duration_ms: 1000 })]);
    expect(motionAt(s, 500).scale).toBeCloseTo(1); // aún en la entrada
    expect(motionAt(s, 1500).scale).toBeCloseTo(1.08); // 1000 ms de entrada + mitad del énfasis
  });

  it("con «reducir movimiento» no hay animaciones: la capa es estática y completa", () => {
    const list = resolveAnimations([anim({}), anim({ phase: "emphasis", kind: "pulse" })], { reducedMotion: true, pageDurationMs: 7000 });
    expect(toMotionSpecs(list)).toEqual([]);
    expect(motionAt([], 0)).toEqual({ opacity: 1, translateX: 0, translateY: 0, scale: 1 });
  });
});
