import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { DeliveredInline, WidgetEvent } from "../core";
import { InlineView } from "./inline-view";

/**
 * Anclas por NOMBRE. La app elige un id estable para un elemento de su pantalla («home.header», «cart.button») y el
 * widget lo busca por ese nombre; nunca un selector ni una ruta de vistas. Un ancla se declara de dos maneras:
 *   - `<StoriesAnchor id="home.header">…</StoriesAnchor>`: envuelve el contenido. Además es el lugar donde se insertan las
 *     tarjetas de un widget Inline (`before | after | inside_start | inside_end | replace`).
 *   - `<View {...useAnchor("cart.button")}>`: registra una vista que ya existe (sin envoltorio extra).
 * Un widget Inline por posición de lista (`list_id` + `index`) se inserta con `useInlineList`.
 * El registro es único por app (`defaultAnchorRegistry`); `<AnchorRegistryProvider>` da uno aparte (pruebas, varias
 * raíces). Si el ancla no existe aún (la pantalla carga después) el widget espera; si se desmonta, se retira y vuelve con ella.
 */

export type Rect = { x: number; y: number; width: number; height: number };
/** Lo único que se pide de una vista: medirse en la ventana (lo tiene toda vista nativa). */
export type AnchorNode = { measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void };

/** Una tarjeta de Inline lista para pintar, ligada al cliente (sus eventos van a la cola). */
export type InlineEntry = { widget: DeliveredInline; onEvent: (e: WidgetEvent) => void };

export type AnchorRegistry = {
  register(id: string, node: AnchorNode): () => void;
  has(id: string): boolean;
  /** Posición y tamaño del ancla en la ventana, o `null` si no está (o no se pudo medir). */
  measure(id: string): Promise<Rect | null>;
  /** Un toque dentro del ancla (para pasos de tour `next_on: "anchor_click"`). */
  touched(id: string): void;
  onTouched(id: string, listener: () => void): () => void;
  /** Inline: quién entrega qué (una fuente por `owner`, p. ej. el placement). */
  setInline(owner: string, entries: readonly InlineEntry[]): void;
  inlineAt(target: string): InlineEntry[];
  /** La app avisa de un evento suyo (`complete_on: { type: "event" }` de un checklist). */
  notify(event: string): void;
  onNotify(listener: (event: string) => void): () => void;
  subscribe(listener: () => void): () => void;
  version(): number;
};

/** Clave de destino de un Inline: `element:<id>` o `list:<id>`. */
export const inlineTarget = (a: DeliveredInline["config"]["anchor"]): string => (a.type === "element" ? `element:${a.element_id}` : `list:${a.list_id}`);

export function createAnchorRegistry(): AnchorRegistry {
  const nodes = new Map<string, AnchorNode>();
  const inline = new Map<string, readonly InlineEntry[]>();
  const listeners = new Set<() => void>();
  const touchListeners = new Map<string, Set<() => void>>();
  const notifyListeners = new Set<(e: string) => void>();
  let version = 0;
  const bump = (): void => {
    version += 1;
    listeners.forEach((l) => l());
  };
  return {
    register(id, node) {
      if (nodes.get(id) !== node) {
        nodes.set(id, node);
        bump();
      }
      return () => {
        // Solo se baja a sí mismo: si otra vista ya tomó el nombre, se queda.
        if (nodes.get(id) === node) {
          nodes.delete(id);
          bump();
        }
      };
    },
    has: (id) => nodes.has(id),
    measure(id) {
      const node = nodes.get(id);
      if (!node) return Promise.resolve(null);
      return new Promise<Rect | null>((resolve) => {
        let settled = false;
        const done = (r: Rect | null): void => {
          if (!settled) {
            settled = true;
            resolve(r);
          }
        };
        try {
          node.measureInWindow((x, y, width, height) => done(Number.isFinite(x) && Number.isFinite(y) && (width > 0 || height > 0) ? { x, y, width, height } : null));
        } catch {
          done(null);
        }
      });
    },
    touched: (id) => touchListeners.get(id)?.forEach((l) => l()),
    onTouched(id, listener) {
      const set = touchListeners.get(id) ?? touchListeners.set(id, new Set()).get(id)!;
      set.add(listener);
      return () => void set.delete(listener);
    },
    setInline(owner, entries) {
      if (entries.length === 0) inline.delete(owner);
      else inline.set(owner, entries);
      bump();
    },
    inlineAt(target) {
      const out: InlineEntry[] = [];
      for (const list of inline.values()) for (const e of list) if (inlineTarget(e.widget.config.anchor) === target) out.push(e);
      return out;
    },
    notify: (event) => notifyListeners.forEach((l) => l(event)),
    onNotify(listener) {
      notifyListeners.add(listener);
      return () => void notifyListeners.delete(listener);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => version,
  };
}

/** El registro único de la app (sin proveedor). */
export const defaultAnchorRegistry: AnchorRegistry = createAnchorRegistry();

const RegistryContext = createContext<AnchorRegistry>(defaultAnchorRegistry);
export const AnchorRegistryProvider = RegistryContext.Provider;
export const useAnchorRegistry = (): AnchorRegistry => useContext(RegistryContext);

/** Re-renderiza cuando cambia algo del registro (anclas que llegan o se van, tarjetas que cambian). */
export function useAnchorVersion(registry: AnchorRegistry): number {
  return useSyncExternalStore(registry.subscribe, registry.version, registry.version);
}

/**
 * Registra una vista existente con un nombre: `<View {...useAnchor("home.cart")}>`. Devuelve `ref`, `collapsable: false`
 * (Android no debe aplanar la vista o no se puede medir) y `onTouchEnd` (avisa de un toque dentro, para `anchor_click`).
 */
export function useAnchor(id: string, registry?: AnchorRegistry) {
  const fallback = useAnchorRegistry();
  const reg = registry ?? fallback;
  const off = useRef<(() => void) | null>(null);
  const ref = useCallback(
    (node: AnchorNode | null) => {
      off.current?.();
      off.current = node ? reg.register(id, node) : null;
    },
    [reg, id],
  );
  useEffect(() => () => off.current?.(), []);
  const onTouchEnd = useCallback(() => reg.touched(id), [reg, id]);
  return { ref, collapsable: false as const, onTouchEnd };
}

export type StoriesAnchorProps = {
  id: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  registry?: AnchorRegistry;
  /** Pinta una tarjeta de Inline; por defecto `InlineView`. */
  renderInline?: (entry: InlineEntry) => ReactNode;
  testID?: string;
};

/**
 * Envoltorio con nombre. Registra la vista (los tours la miden) e inserta, según `position`, las tarjetas del widget
 * Inline que apuntan a este nombre: antes, después, al principio o al final de dentro, o EN LUGAR del contenido
 * (que sigue montado, solo oculto, para no perder su estado).
 */
export function StoriesAnchor({ id, children, style, registry, renderInline = renderInlineDefault, testID }: StoriesAnchorProps) {
  const fallback = useAnchorRegistry();
  const reg = registry ?? fallback;
  const anchor = useAnchor(id, reg);
  useAnchorVersion(reg);
  const entries = reg.inlineAt(`element:${id}`);
  const at = (pos: string): ReactNode[] => entries.filter((e) => e.widget.config.anchor.type === "element" && e.widget.config.anchor.position === pos).map((e) => renderInline(e));
  const replaced = entries.some((e) => e.widget.config.anchor.type === "element" && e.widget.config.anchor.position === "replace");
  return (
    <>
      {at("before")}
      <View {...anchor} testID={testID ?? `cs-anchor-${id}`} style={replaced ? [style, HIDDEN] : style}>
        {at("inside_start")}
        {children}
        {at("inside_end")}
      </View>
      {at("replace")}
      {at("after")}
    </>
  );
}
const HIDDEN: ViewStyle = { display: "none" };
const renderInlineDefault = (entry: InlineEntry): ReactNode => <InlineView key={entry.widget.id} entry={entry.widget} onEvent={entry.onEvent} />;

// ─── Listas ─────────────────────────────────────────────────────────────────

const SLOT = Symbol.for("customy.stories.inline-slot");
/** Una tarjeta de Inline dentro de los datos de una lista. */
export type InlineSlot = { readonly [SLOT]: true; readonly key: string; readonly entry: InlineEntry };
export const isInlineSlot = (x: unknown): x is InlineSlot => typeof x === "object" && x !== null && SLOT in x;

/** Inserta en `data` las tarjetas de Inline de `list:<listId>`: antes del elemento original `index` (o al final si hay menos). Pura. */
export function insertInlineSlots<T>(data: readonly T[], entries: readonly InlineEntry[]): Array<T | InlineSlot> {
  const slotOf = (e: InlineEntry): InlineSlot => ({ [SLOT]: true, key: `cs-inline-${e.widget.id}`, entry: e });
  const byIndex = new Map<number, InlineSlot[]>();
  for (const e of entries) {
    const a = e.widget.config.anchor;
    if (a.type !== "index") continue;
    const at = Math.min(Math.max(0, Math.floor(a.index)), data.length);
    (byIndex.get(at) ?? byIndex.set(at, []).get(at)!).push(slotOf(e));
  }
  const out: Array<T | InlineSlot> = [];
  data.forEach((item, i) => {
    out.push(...(byIndex.get(i) ?? []), item);
  });
  out.push(...(byIndex.get(data.length) ?? []));
  return out;
}

/**
 * `data` de una `FlatList`/`SectionList` con las tarjetas de Inline de la lista `listId` ya colocadas; en `renderItem`,
 * `isInlineSlot(item) ? <InlineListItem slot={item} /> : …`. Sin tarjetas devuelve `data` tal cual (misma referencia).
 */
export function useInlineList<T>(listId: string, data: readonly T[], registry?: AnchorRegistry): ReadonlyArray<T | InlineSlot> {
  const fallback = useAnchorRegistry();
  const reg = registry ?? fallback;
  const version = useAnchorVersion(reg);
  return useMemo(() => {
    const entries = reg.inlineAt(`list:${listId}`);
    return entries.length === 0 ? data : insertInlineSlots(data, entries);
    // `version` = algo cambió en el registro.
  }, [reg, listId, data, version]);
}

/** La tarjeta de Inline de un hueco de lista (`renderItem`). */
export function InlineListItem({ slot }: { slot: InlineSlot }) {
  return <InlineView entry={slot.entry.widget} onEvent={slot.entry.onEvent} />;
}
