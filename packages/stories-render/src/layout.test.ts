import { describe, expect, it } from "vitest";
import { componentBox, fontPx, layerBox, relativeBox, safeInsets, sortByZ, viewportFit, viewportFromWidth, mirrorBox } from "./layout";
import { animationCssValue, countdownParts, resolveAnimations } from "./animation";
import type { LayerAnimation } from "./types";

describe("layout 1080×1920 por ancho", () => {
  it("el alto sale de 9:16 y la escala del ancho", () => {
    const vp = viewportFromWidth(540);
    expect(vp).toEqual({ width: 540, height: 960, scale: 0.5 });
    expect(viewportFit(1000, 800)).toMatchObject({ height: 800, width: 450 });
  });
  it("coordenadas 0–1 → px y se acotan", () => {
    const vp = viewportFromWidth(540);
    expect(relativeBox({ x: 0.5, y: 0.25, w: 0.25, h: 0.1 }, vp)).toEqual({ left: 270, top: 240, width: 135, height: 96 });
    expect(layerBox({ x: 2, y: -1, w: 5, h: 5 }, vp)).toEqual({ left: 540, top: 0, width: 540, height: 960 });
  });
  it("la zona segura escala con el ancho (250/340 px de referencia)", () => {
    expect(safeInsets({ top_px: 250, bottom_px: 340 }, viewportFromWidth(540))).toEqual({ top: 125, bottom: 170 });
  });
  it("un componente fuera de la zona segura se recoloca dentro", () => {
    const vp = viewportFromWidth(540);
    const safe = { top_px: 250, bottom_px: 340 };
    expect(componentBox({ x: 0, y: 0, w: 1, h: 0.05 }, vp, safe).top).toBe(125);
    const low = componentBox({ x: 0, y: 0.99, w: 1, h: 0.05 }, vp, safe);
    expect(low.top + low.height).toBeCloseTo(960 - 170, 5);
    expect(componentBox({ x: 0, y: 0.5, w: 1, h: 0.05 }, vp, safe).top).toBe(480);
  });
  it("tamaño de fuente relativo al alto", () => {
    expect(fontPx(0.04, viewportFromWidth(540))).toBe(38.4);
  });
  it("z estable y espejo RTL", () => {
    expect(sortByZ([{ z: 2, n: "a" }, { z: 1, n: "b" }, { z: 2, n: "c" }]).map((x) => x.n)).toEqual(["b", "a", "c"]);
    expect(mirrorBox({ left: 10, top: 0, width: 100, height: 5 }, viewportFromWidth(300)).left).toBe(190);
  });
});

describe("animaciones declarativas", () => {
  const a = (phase: LayerAnimation["phase"], kind: LayerAnimation["kind"], delay_ms: number, duration_ms: number): LayerAnimation => ({ phase, kind, delay_ms, duration_ms, easing: "ease_out" });
  it("in, emphasis tras la entrada y out anclada al final de la página", () => {
    const r = resolveAnimations([a("in", "fade", 200, 400), a("emphasis", "pulse", 100, 600), a("out", "slide_down", 0, 500)], { reducedMotion: false, pageDurationMs: 7000 });
    expect(r.map((x) => [x.phase, x.delayMs])).toEqual([["in", 200], ["emphasis", 700], ["out", 6500]]);
    expect(r[0]).toMatchObject({ keyframes: "cs-anim-fade", fillMode: "backwards" });
    expect(r[2]).toMatchObject({ keyframes: "cs-anim-slide-down-out", fillMode: "forwards" });
    expect(animationCssValue(r)).toContain("cs-anim-fade 400ms");
  });
  it("prefers-reduced-motion elimina todo el movimiento; none no anima", () => {
    expect(resolveAnimations([a("in", "bounce", 0, 400)], { reducedMotion: true, pageDurationMs: 7000 })).toEqual([]);
    expect(resolveAnimations([a("in", "none", 0, 400)], { reducedMotion: false, pageDurationMs: 7000 })).toEqual([]);
  });
});

describe("cuenta atrás", () => {
  it("parte el tiempo y marca el fin", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    expect(countdownParts("2026-10-03T01:02:03Z", now)).toMatchObject({ done: false, days: 1, hours: 1, minutes: 2, seconds: 3 });
    expect(countdownParts("2026-10-01T00:00:00Z", now).done).toBe(true);
    expect(countdownParts("no es fecha", now).done).toBe(true);
  });
});
