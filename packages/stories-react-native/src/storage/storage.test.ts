import { describe, expect, it, vi } from "vitest";
import { createSeenTracker } from "@customyai/stories-render";
import { createAsyncStorageStore, createMemoryStore, createMmkvStore, withKeyPrefix } from "./index";

describe("almacenamiento por interfaz", () => {
  it("AsyncStorage es un adaptador: un fallo de disco no rompe, se lee como vacío", async () => {
    const calls: string[] = [];
    const store = createAsyncStorageStore({
      getItem: async (k) => (calls.push(`get ${k}`), k === "bad" ? Promise.reject(new Error("io")) : "v"),
      setItem: async (k) => (calls.push(`set ${k}`), k === "bad" ? Promise.reject(new Error("full")) : undefined),
      removeItem: async (k) => void calls.push(`rm ${k}`),
    });
    expect(await store.get("a")).toBe("v");
    expect(await store.get("bad")).toBeNull();
    await expect(store.set("bad", "x")).resolves.toBeUndefined();
    await store.remove("a");
    expect(calls).toEqual(["get a", "get bad", "set bad", "rm a"]);
  });

  it("MMKV: `remove` (v4) o `delete` (v3)", () => {
    const data = new Map<string, string>();
    const v3 = { getString: (k: string) => data.get(k), set: (k: string, v: string) => void data.set(k, v), delete: vi.fn((k: string) => data.delete(k)) };
    const s3 = createMmkvStore(v3);
    s3.set("k", "1");
    expect(s3.get("k")).toBe("1");
    s3.remove("k");
    expect(v3.delete).toHaveBeenCalledWith("k");
    expect(s3.get("k")).toBeNull();
    const remove = vi.fn();
    createMmkvStore({ getString: () => undefined, set: () => undefined, remove }).remove("z");
    expect(remove).toHaveBeenCalledWith("z");
  });

  it("el estado «visto» persiste en el almacén inyectado y se recupera", async () => {
    const backing = new Map<string, string>();
    const store = createAsyncStorageStore({ getItem: async (k) => backing.get(k) ?? null, setItem: async (k, v) => void backing.set(k, v), removeItem: async (k) => void backing.delete(k) });
    const group = { id: "g1", reeligibility_cooldown_hours: 0, pages: [{ id: "p1" }, { id: "p2" }] } as never;
    const a = createSeenTracker(store);
    await a.ready;
    a.markPageSeen("g1", "p1");
    a.markPageSeen("g1", "p2");
    await new Promise((r) => setTimeout(r, 0));
    expect(a.status(group)).toBe("seen");
    const b = createSeenTracker(store);
    await b.ready;
    expect(b.status(group)).toBe("seen");
  });

  it("prefijo de claves y memoria", async () => {
    const mem = createMemoryStore();
    const a = withKeyPrefix(mem, "u1:");
    await a.set("seen", "x");
    expect(mem.dump()).toEqual({ "u1:seen": "x" });
    expect(await withKeyPrefix(mem, "u2:").get("seen")).toBeNull();
  });
});
