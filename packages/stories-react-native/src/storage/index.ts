/**
 * @customyai/stories-react-native/storage — adaptadores del `KeyValueStore` del núcleo. NO importan ninguna
 * librería: la app pasa la suya (estructural), así que AsyncStorage, MMKV o SecureStore son opcionales y el
 * paquete no los fija como dependencia.
 *
 *   import AsyncStorage from "@react-native-async-storage/async-storage";
 *   const store = createAsyncStorageStore(AsyncStorage);
 */
import type { KeyValueStore } from "@customyai/stories-render";

/** `@react-native-async-storage/async-storage` (v1 y v2/v3). */
export type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Un fallo de disco no rompe la historia: se lee como «sin dato» y se escribe en silencio. */
export function createAsyncStorageStore(storage: AsyncStorageLike): KeyValueStore {
  return {
    get: async (key) => {
      try {
        return await storage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        await storage.setItem(key, value);
      } catch {
        /* sin espacio o sin permiso: el recuerdo vive en memoria */
      }
    },
    remove: async (key) => {
      try {
        await storage.removeItem(key);
      } catch {
        /* igual */
      }
    },
  };
}

/** `react-native-mmkv` (síncrono). `remove` en v3 es `delete`; en v4 `remove`: se acepta cualquiera. */
export type MmkvLike = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete?(key: string): unknown;
  remove?(key: string): unknown;
};

export function createMmkvStore(mmkv: MmkvLike): KeyValueStore {
  return {
    get: (key) => mmkv.getString(key) ?? null,
    set: (key, value) => void mmkv.set(key, value),
    remove: (key) => void (mmkv.remove ? mmkv.remove(key) : mmkv.delete?.(key)),
  };
}

/** Prefija todas las claves (varias apps o usuarios en un mismo almacén). */
export function withKeyPrefix(store: KeyValueStore, prefix: string): KeyValueStore {
  return { get: (k) => store.get(`${prefix}${k}`), set: (k, v) => store.set(`${prefix}${k}`, v), remove: (k) => store.remove(`${prefix}${k}`) };
}

export { createMemoryStore, type KeyValueStore } from "@customyai/stories-render";
