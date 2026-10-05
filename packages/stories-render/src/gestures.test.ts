import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGestureRecognizer, type GestureIntent } from "./gestures";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const W = 300;
function setup(rtl = false) {
  const intents: GestureIntent[] = [];
  const g = createGestureRecognizer({ rtl, onIntent: (i) => intents.push(i) });
  const tapAt = (x: number) => {
    g.pointerDown({ x, y: 100, width: W });
    g.pointerUp({ x, y: 100 });
  };
  const drag = (from: [number, number], to: [number, number]) => {
    g.pointerDown({ x: from[0], y: from[1], width: W });
    g.pointerMove({ x: to[0], y: to[1] });
    g.pointerUp({ x: to[0], y: to[1] });
  };
  return { intents, g, tapAt, drag };
}

describe("gestos", () => {
  it("toque en tercios: izquierdo = anterior, derecho = siguiente, centro = nada", () => {
    const { intents, tapAt } = setup();
    tapAt(20);
    tapAt(280);
    tapAt(150);
    expect(intents).toEqual([
      { type: "tap", zone: "left", direction: "prev" },
      { type: "tap", zone: "right", direction: "next" },
      { type: "tap", zone: "center", direction: null },
    ]);
  });
  it("RTL espeja los tercios", () => {
    const { intents, tapAt } = setup(true);
    tapAt(20);
    tapAt(280);
    expect(intents.map((i) => (i.type === "tap" ? i.direction : null))).toEqual(["next", "prev"]);
  });
  it("mantener ≥ 200 ms pausa y al soltar no avanza", () => {
    const { intents, g } = setup();
    g.pointerDown({ x: 280, y: 100, width: W });
    vi.advanceTimersByTime(199);
    expect(intents).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(intents).toEqual([{ type: "hold-start" }]);
    g.pointerUp({ x: 280, y: 100 });
    expect(intents).toEqual([{ type: "hold-start" }, { type: "hold-end" }]);
  });
  it("soltar antes de 200 ms es un toque, no una pausa", () => {
    const { intents, g } = setup();
    g.pointerDown({ x: 280, y: 100, width: W });
    vi.advanceTimersByTime(150);
    g.pointerUp({ x: 280, y: 100 });
    vi.advanceTimersByTime(500);
    expect(intents).toEqual([{ type: "tap", zone: "right", direction: "next" }]);
  });
  it("swipe horizontal entre grupos (dedo a la izquierda = siguiente) y RTL al revés", () => {
    const a = setup();
    a.drag([250, 300], [80, 310]);
    a.drag([80, 300], [250, 310]);
    expect(a.intents).toEqual([
      { type: "swipe-group", direction: "next" },
      { type: "swipe-group", direction: "prev" },
    ]);
    const r = setup(true);
    r.drag([250, 300], [80, 310]);
    expect(r.intents).toEqual([{ type: "swipe-group", direction: "prev" }]);
  });
  it("abajo cierra y arriba abre el enlace", () => {
    const { intents, drag } = setup();
    drag([150, 100], [150, 300]);
    drag([150, 400], [150, 200]);
    expect(intents).toEqual([{ type: "swipe-down" }, { type: "swipe-up" }]);
  });
  it("un arrastre corto no es swipe ni toque, y moverse cancela la pausa", () => {
    const { intents, g } = setup();
    g.pointerDown({ x: 100, y: 100, width: W });
    g.pointerMove({ x: 125, y: 100 });
    vi.advanceTimersByTime(400);
    g.pointerUp({ x: 125, y: 100 });
    expect(intents).toEqual([]);
  });
  it("cancelar durante la pausa la termina", () => {
    const { intents, g } = setup();
    g.pointerDown({ x: 100, y: 100, width: W });
    vi.advanceTimersByTime(250);
    g.pointerCancel();
    expect(intents).toEqual([{ type: "hold-start" }, { type: "hold-end" }]);
  });
});
