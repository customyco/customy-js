import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./store";
import { createSeenTracker } from "./seen";
import { group } from "./test-fixtures";

describe("estado visto persistido", () => {
  it("recuerda páginas y se hidrata de un almacenamiento inyectado (también asíncrono)", async () => {
    const mem = createMemoryStore();
    const store = { get: async (k: string) => mem.get(k), set: async (k: string, v: string) => mem.set(k, v), remove: async (k: string) => mem.remove(k) };
    const g = group("g1", ["a", "b", "c"]);
    const t = createSeenTracker(store);
    await t.ready;
    expect(t.status(g)).toBe("unseen");
    t.markPageSeen("g1", "a");
    expect(t.status(g)).toBe("partial");
    expect(t.startIndex(g)).toBe(1);
    t.markPageSeen("g1", "b");
    t.markPageSeen("g1", "c");
    expect(t.status(g)).toBe("seen");
    await new Promise((r) => setTimeout(r, 5));
    const again = createSeenTracker(store);
    await again.ready;
    expect(again.isSeen(g)).toBe(true);
  });

  it("una página nueva en el grupo lo vuelve a «a medias»", async () => {
    const t = createSeenTracker(createMemoryStore());
    await t.ready;
    for (const p of ["a", "b"]) t.markPageSeen("g", p);
    expect(t.isSeen(group("g", ["a", "b"]))).toBe(true);
    const grown = group("g", ["a", "b", "c"]);
    expect(t.status(grown)).toBe("partial");
    expect(t.startIndex(grown)).toBe(2);
  });

  it("la reelegibilidad lo devuelve a no visto tras el enfriamiento", async () => {
    let now = 1_000_000;
    const t = createSeenTracker(createMemoryStore(), { clock: { now: () => now } });
    await t.ready;
    const g = group("g", ["a"], { reeligibility_cooldown_hours: 2 });
    t.markPageSeen("g", "a");
    expect(t.isSeen(g)).toBe(true);
    now += 2 * 3_600_000;
    expect(t.status(g)).toBe("unseen");
  });

  it("un valor corrupto en el almacenamiento no rompe nada", async () => {
    const t = createSeenTracker(createMemoryStore({ "customy-stories:seen": "{no es json" }));
    await t.ready;
    expect(t.status(group("g"))).toBe("unseen");
  });

  it("lo marcado antes de terminar la lectura no se pierde", async () => {
    const slow = { get: () => new Promise<string | null>((r) => setTimeout(() => r(JSON.stringify({ v: 1, groups: { old: { pages: ["x"], at: 1 } } })), 10)), set: () => undefined, remove: () => undefined };
    const t = createSeenTracker(slow);
    t.markPageSeen("new", "p");
    await t.ready;
    expect(t.record("new")).toBeTruthy();
    expect(t.record("old")).toBeTruthy();
  });

  it("espacios de nombres separados", async () => {
    const store = createMemoryStore();
    const a = createSeenTracker(store, { namespace: "a" });
    const b = createSeenTracker(store, { namespace: "b" });
    await Promise.all([a.ready, b.ready]);
    a.markPageSeen("g", "p");
    await new Promise((r) => setTimeout(r, 5));
    expect(Object.keys(store.dump())).toEqual(["a:seen"]);
    expect(b.record("g")).toBeUndefined();
  });
});
