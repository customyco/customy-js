import { readJson, type KeyValueStore } from "../store";
import type { WidgetProgress } from "../types";

/**
 * Lo que esta persona ya hizo con un widget y NO se deshace: ítems de un checklist completados y productos ya
 * deslizados. Se persiste aquí para que una respuesta de placement en caché (más vieja que el último clic) nunca
 * «desmarque» nada; al repintar se une con el `progress` que entrega el servidor (gana lo más completo).
 */
export type WidgetProgressStore = {
  ready: Promise<void>;
  get(widgetId: string, server?: WidgetProgress): WidgetProgress;
  complete(widgetId: string, itemId: string, at?: string): boolean;
  swipe(widgetId: string, key: string): boolean;
  dismiss(widgetId: string): void;
  subscribe(listener: () => void): () => void;
  reset(): void;
};

type Data = Record<string, { c?: Record<string, string>; s?: string[]; d?: 1 }>;

export function createWidgetProgressStore(store: KeyValueStore | undefined, options: { namespace?: string; now?: () => number } = {}): WidgetProgressStore {
  const key = `${options.namespace ?? "customy-stories"}:wprogress`;
  const now = options.now ?? Date.now;
  let data: Data = {};
  const listeners = new Set<() => void>();
  const save = (): void => {
    listeners.forEach((l) => l());
    if (store) void Promise.resolve(store.set(key, JSON.stringify(data))).catch(() => undefined);
  };
  const ready = store
    ? readJson<Data>(store, key, {}).then((p) => {
        for (const [id, v] of Object.entries(p)) {
          const mine = (data[id] ??= {});
          mine.c = { ...(v.c ?? {}), ...(mine.c ?? {}) };
          mine.s = [...new Set([...(v.s ?? []), ...(mine.s ?? [])])];
          if (v.d) mine.d = 1;
        }
      })
    : Promise.resolve();
  const slot = (id: string) => (data[id] ??= {});
  return {
    ready,
    get(id, server) {
      const mine = data[id];
      return {
        completed: { ...(mine?.c ?? {}), ...(server?.completed ?? {}) },
        dismissed: Boolean(server?.dismissed || mine?.d),
        swiped: [...new Set([...(server?.swiped ?? []), ...(mine?.s ?? [])])],
      };
    },
    complete(id, itemId, at) {
      const c = (slot(id).c ??= {});
      if (c[itemId]) return false; // el primero gana: nunca se deshace ni se reescribe
      c[itemId] = at ?? new Date(now()).toISOString();
      save();
      return true;
    },
    swipe(id, k) {
      const s = (slot(id).s ??= []);
      if (s.includes(k)) return false;
      s.push(k);
      save();
      return true;
    },
    dismiss(id) {
      if (slot(id).d) return;
      slot(id).d = 1;
      save();
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    reset() {
      data = {};
      if (store) void Promise.resolve(store.remove(key)).catch(() => undefined);
    },
  };
}
