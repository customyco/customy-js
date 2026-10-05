import { describe, expect, it } from "vitest";
import { orderGroups } from "./order";
import { group } from "./test-fixtures";

const ids = (gs: { id: string }[]) => gs.map((g) => g.id);

describe("orden de la barra", () => {
  const gs = [group("a", ["p"], { order: 3 }), group("b", ["p"], { order: 1 }), group("c", ["p"], { order: 2, pinned: true }), group("d", ["p"], { order: 0 })];
  const none = () => false;

  it("manual respeta el orden y los fijados van primero", () => {
    expect(ids(orderGroups(gs, { order: "manual", pinnedFirst: true, isSeen: none }))).toEqual(["c", "d", "b", "a"]);
  });
  it("sin pinnedFirst el fijado no salta", () => {
    expect(ids(orderGroups(gs, { order: "manual", pinnedFirst: false, isSeen: none }))).toEqual(["d", "b", "c", "a"]);
  });
  it("no vistos primero: los vistos van detrás conservando el orden manual", () => {
    const seen = new Set(["d", "b"]);
    expect(ids(orderGroups(gs, { order: "unseen_first", pinnedFirst: true, isSeen: (g) => seen.has(g.id) }))).toEqual(["c", "a", "d", "b"]);
  });
  it("seen_last ordena los vistos por antigüedad", () => {
    const at: Record<string, number> = { d: 200, b: 100 };
    const out = orderGroups(gs, { order: "seen_last", pinnedFirst: false, isSeen: (g) => g.id in at, seenAt: (g) => at[g.id] ?? 0 });
    expect(ids(out)).toEqual(["c", "a", "b", "d"]);
  });
  it("un fijado ya visto sigue primero", () => {
    expect(ids(orderGroups(gs, { order: "unseen_first", pinnedFirst: true, isSeen: (g) => g.id === "c" }))[0]).toBe("c");
  });
  it("recent: el de inicio más reciente primero", () => {
    const r = [group("x", ["p"], { schedule: { start_at: "2026-01-01T00:00:00Z" } }), group("y", ["p"], { schedule: { start_at: "2026-06-01T00:00:00Z" } })];
    expect(ids(orderGroups(r, { order: "recent", pinnedFirst: false, isSeen: none }))).toEqual(["y", "x"]);
  });
  it("desempata por id y no muta la entrada", () => {
    const eq = [group("z", ["p"]), group("m", ["p"])];
    expect(ids(orderGroups(eq, { order: "manual", pinnedFirst: true, isSeen: none }))).toEqual(["m", "z"]);
    expect(ids(eq)).toEqual(["z", "m"]);
  });
});
