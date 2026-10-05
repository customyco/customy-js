import { systemClock, type Clock } from "./clock";
import { readJson, type KeyValueStore } from "./store";
import type { StoryGroup } from "./types";

/** Lo que se recuerda de un grupo. */
export type SeenRecord = {
  /** Ids de las páginas vistas. */
  pages: string[];
  /** Última página vista (para reanudar). */
  last?: string;
  /** Cuándo se vio por última vez (ms epoch). */
  at: number;
};

export type SeenStatus = "unseen" | "partial" | "seen";

type Persisted = { v: 1; groups: Record<string, SeenRecord> };

const MAX_GROUPS = 300;

export type SeenTracker = {
  /** Resuelve cuando se leyó el almacenamiento. */
  ready: Promise<void>;
  record(groupId: string): SeenRecord | undefined;
  /** `seen` = todas las páginas ACTUALES del grupo vistas y fuera del enfriamiento de reelegibilidad. */
  status(group: Pick<StoryGroup, "id" | "pages" | "reeligibility_cooldown_hours">): SeenStatus;
  isSeen(group: Pick<StoryGroup, "id" | "pages" | "reeligibility_cooldown_hours">): boolean;
  /** Índice por el que empezar: la primera página sin ver (0 si está vista o es nueva). */
  startIndex(group: Pick<StoryGroup, "id" | "pages" | "reeligibility_cooldown_hours">): number;
  markPageSeen(groupId: string, pageId: string): void;
  /** Cuándo se vio por última vez (para `seen_last`); 0 si nunca. */
  seenAt(groupId: string): number;
  reset(groupId?: string): void;
  subscribe(listener: () => void): () => void;
};

/**
 * Estado «visto» persistido en un `KeyValueStore` inyectado. Una sola clave JSON por espacio
 * de nombres (`<ns>:seen`), con tope de grupos recordados (los más antiguos salen primero).
 * Las escrituras se serializan: dos marcas seguidas no se pisan.
 */
export function createSeenTracker(store: KeyValueStore, options: { namespace?: string; clock?: Pick<Clock, "now"> } = {}): SeenTracker {
  const key = `${options.namespace ?? "customy-stories"}:seen`;
  const clock = options.clock ?? systemClock;
  let groups: Record<string, SeenRecord> = {};
  const listeners = new Set<() => void>();
  let writing: Promise<void> = Promise.resolve();

  const ready = readJson<Persisted>(store, key, { v: 1, groups: {} }).then((p) => {
    // Lo marcado antes de terminar la lectura prevalece sobre lo leído.
    groups = { ...(p.groups ?? {}), ...groups };
    listeners.forEach((l) => l());
  });

  const persist = (): void => {
    const entries = Object.entries(groups).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_GROUPS);
    groups = Object.fromEntries(entries);
    const payload = JSON.stringify({ v: 1, groups } satisfies Persisted);
    writing = writing.then(async () => {
      try {
        await store.set(key, payload);
      } catch {
        /* sin almacenamiento: el recuerdo vive en memoria */
      }
    });
  };

  const status: SeenTracker["status"] = (group) => {
    const rec = groups[group.id];
    if (!rec || rec.pages.length === 0) return "unseen";
    const cooldownMs = (group.reeligibility_cooldown_hours ?? 0) * 3_600_000;
    const pages = group.pages ?? [];
    const all = pages.length > 0 && pages.every((p) => rec.pages.includes(p.id));
    if (!all) return "partial";
    if (cooldownMs > 0 && clock.now() - rec.at >= cooldownMs) return "unseen";
    return "seen";
  };

  return {
    ready,
    record: (id) => groups[id],
    status,
    isSeen: (group) => status(group) === "seen",
    startIndex(group) {
      if (status(group) !== "partial") return 0;
      const rec = groups[group.id];
      const idx = (group.pages ?? []).findIndex((p) => !rec?.pages.includes(p.id));
      return Math.max(0, idx);
    },
    markPageSeen(groupId, pageId) {
      const prev = groups[groupId];
      const pages = prev?.pages.includes(pageId) ? prev.pages : [...(prev?.pages ?? []), pageId];
      groups = { ...groups, [groupId]: { pages, last: pageId, at: clock.now() } };
      persist();
      listeners.forEach((l) => l());
    },
    seenAt: (id) => groups[id]?.at ?? 0,
    reset(groupId) {
      if (groupId) {
        const { [groupId]: _removed, ...rest } = groups;
        groups = rest;
      } else groups = {};
      persist();
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
