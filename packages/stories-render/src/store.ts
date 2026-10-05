/**
 * Almacenamiento inyectado (nada de `localStorage` directo): quien integra pasa `localStorage`,
 * `AsyncStorage`, IndexedDB, una cookie o la memoria. Puede ser síncrono o asíncrono.
 */
export interface KeyValueStore {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

/** Memoria del proceso: valor por defecto y soporte de pruebas. */
export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/** Adaptador de `Storage` (p. ej. `window.localStorage`, que le pasa la APP, no esta librería). */
export function storeFromWebStorage(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): KeyValueStore {
  return {
    get: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch {
        /* cuota o modo privado: se pierde el recuerdo, no la historia */
      }
    },
    remove: (key) => {
      try {
        storage.removeItem(key);
      } catch {
        /* igual */
      }
    },
  };
}

/** JSON en una sola clave, con lectura tolerante (un valor corrupto vale como vacío). */
export async function readJson<T>(store: KeyValueStore, key: string, fallback: T): Promise<T> {
  try {
    const raw = await store.get(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
