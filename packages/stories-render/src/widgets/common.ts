import { defaultOpenLink, el, icon, prefersReducedMotion, resolveUi, type Attrs, type UiOptions } from "../dom/util";
import type { Clock } from "../clock";
import type { ComponentAction, ProductRef, WidgetKind } from "../types";
import { resolveWidgetMessages, type WidgetMessages } from "./messages";

/**
 * Lo común a los widgets de la Ola 3: el evento que emite cada controlador, el nombre de clic por defecto y las
 * anclas estables de la app (`data-customy-anchor="home.header"`; nunca un selector CSS).
 */
export type WidgetEvent = { widgetId: string; variantId?: string } & (
  | { type: "impression" }
  | { type: "view"; itemId?: string }
  | { type: "click"; elementId: string; itemId?: string }
  | { type: "next"; via: "tap" | "swipe" | "auto" | "keyboard"; itemId?: string }
  | { type: "prev"; via: "tap" | "swipe" | "keyboard"; itemId?: string }
  | { type: "playback"; itemId: string; action: "play" | "pause" | "mute" | "unmute" }
  | { type: "watch_length"; itemId: string; ms: number }
  | { type: "share"; itemId: string; target?: string }
  | { type: "swipe"; direction: "left" | "right"; via: "gesture" | "button" | "keyboard"; product: ProductRef; position?: number }
  | { type: "product"; name: "product_viewed" | "add_to_cart" | "wishlist_added"; product: ProductRef; quantity?: number; itemId?: string; componentId?: string }
  | { type: "checklist_item"; itemId: string; via: "event" | "click" | "condition" | "manual" }
  | { type: "tour_step"; stepId: string; step: "shown" | "next" | "prev" | "skip" | "done" }
  | { type: "dismiss"; reason: "user" | "auto" | "expired" | "app" }
  | { type: "complete" }
);
type Distribute<T> = T extends unknown ? Omit<T, "widgetId" | "variantId"> : never;
export type WidgetEventInput = Distribute<WidgetEvent>;

export type WidgetControllerBase = {
  clock?: Clock;
  reducedMotion?: boolean;
  locale?: string;
  messages?: Partial<WidgetMessages>;
  onEvent?: (event: WidgetEvent) => void;
  /** Esquemas propios de la app que un `deep_link` puede abrir (ver `isSafeDeepLink`). */
  allowedSchemes?: readonly string[];
};

/** Emisor con el contexto de la campaña ya puesto. */
export function widgetEmitter(widgetId: string, variantId: string | undefined, onEvent: ((e: WidgetEvent) => void) | undefined) {
  return (e: WidgetEventInput): void => onEvent?.({ widgetId, ...(variantId ? { variantId } : {}), ...e } as WidgetEvent);
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,254}$/;
/** Nombre de clic por defecto de un elemento sin `element_id` propio: `widget.<campaña>.<elemento>`. */
export function widgetElementId(widgetId: string, itemId: string, explicit?: string): string {
  if (explicit && NAME.test(explicit)) return explicit;
  const id = `widget.${widgetId}.${itemId}`;
  return NAME.test(id) ? id : id.slice(0, 255);
}

/** El orden en que los widgets describen su tipo en el DOM (`data-widget-kind`). */
export const widgetRoot = (doc: Document, kind: WidgetKind, id: string, label: string, extra: Attrs = {}) =>
  el(doc, "section", { class: `cs-widget cs-${kind.replace("_", "-")} cs-root`, role: "region", "aria-label": label, "data-widget-kind": kind, "data-widget-id": id, ...extra });

// ─── Anclas estables ────────────────────────────────────────────────────────

export const ANCHOR_ATTR = "data-customy-anchor";

export type AnchorRegistry = {
  register(id: string, element: HTMLElement): () => void;
  resolve(id: string): HTMLElement | null;
};

/** Para quien no puede poner atributos en sus vistas (RN Web, componentes de terceros): la app registra el elemento. */
export function createAnchorRegistry(): AnchorRegistry {
  const map = new Map<string, HTMLElement>();
  return {
    register(id, element) {
      map.set(id, element);
      return () => void (map.get(id) === element && map.delete(id));
    },
    resolve: (id) => {
      const node = map.get(id);
      return node && node.isConnected !== false ? node : null;
    },
  };
}

/**
 * El elemento que la app registró con ese id: primero el registro, luego `data-customy-anchor`. Se compara el valor
 * del atributo (no se arma un selector con él): un id raro no puede romper la consulta ni inyectar nada.
 */
export function findAnchor(doc: Document, id: string, registry?: AnchorRegistry): HTMLElement | null {
  const registered = registry?.resolve(id);
  if (registered) return registered;
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>(`[${ANCHOR_ATTR}]`))) if (node.getAttribute(ANCHOR_ATTR) === id) return node;
  return null;
}

export type WidgetUiOptions = UiOptions & { messages?: never };
export { defaultOpenLink, el, icon, prefersReducedMotion, resolveUi, resolveWidgetMessages };
export type { ComponentAction };

/** Enlace de una acción para `<a href>`. */
export const actionHref = (a: ComponentAction | undefined): string | undefined => (a ? (a.type === "url" ? a.url : a.uri) : undefined);

/** Hace de un nodo un elemento «clicable» con el enlace real si existe (clic central y «copiar enlace» funcionan). */
export function linkNode(doc: Document, tag: "a" | "button" | "div", action: ComponentAction | undefined, attrs: Record<string, string | null | undefined> & { class: string }, onActivate: (e: Event) => void): HTMLElement {
  const href = actionHref(action);
  const node = href ? el(doc, "a", { ...attrs, href }) : el(doc, tag === "a" ? "div" : tag, tag === "button" ? { ...attrs, type: "button" } : attrs);
  node.addEventListener("click", (e) => {
    if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
    e.preventDefault();
    onActivate(e);
  });
  return node;
}

// ─── Valores de la campaña que acaban en CSS ────────────────────────────────

/** Colores admitidos: hex, `hsl()`/`rgb()` o `var(--token)`. Cualquier otra cosa (`;`, `url(`, `expression`) se ignora. */
export function safeColor(value: string | undefined): string | undefined {
  return value && /^(#[0-9a-fA-F]{3,8}|(?:hsla?|rgba?)\([0-9a-zA-Z.,%\s/-]{1,60}\)|var\(--[a-zA-Z0-9-]{1,40}\))$/.test(value) ? value : undefined;
}
/** `url("…")` solo para https o rutas absolutas del sitio, con las comillas y paréntesis escapados. */
export function safeCssUrl(value: string | undefined): string | undefined {
  if (!value || !/^(https:\/\/|\/(?!\/))/.test(value)) return undefined;
  return `url("${value.replace(/["\\()\s]/g, (c) => encodeURIComponent(c))}")`;
}

/** Ejecuta `fn` una vez cuando el nodo se ve (≥ 50 %); sin `IntersectionObserver`, al instante. Devuelve su cancelación. */
export function onVisible(win: Window & typeof globalThis, node: Element, fn: () => void): () => void {
  if (typeof win.IntersectionObserver !== "function") {
    fn();
    return () => undefined;
  }
  const io = new win.IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
      io.disconnect();
      fn();
    }
  }, { threshold: [0.5] });
  io.observe(node);
  return () => io.disconnect();
}

/** Contrato común de lo que devuelve cada `mountX`. */
export type WidgetHandle = { element: HTMLElement; destroy(): void };

const WIDGET_ICONS: Record<string, string> = {
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  thumb_up: '<path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 3l-.5 3H19a2 2 0 012 2.3l-1 6A2 2 0 0118 20H7"/>',
  thumb_down: '<path d="M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2-3l-.5-3H19a2 2 0 002-2.3l-1-6A2 2 0 0018 4H7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
};
/** Iconos propios de los widgets (decorativos); los comunes vienen de `icon` de `./dom`. */
export function widgetIcon(doc: Document, name: string, size = 18): HTMLSpanElement {
  const path = WIDGET_ICONS[name];
  if (!path) return icon(doc, name, size);
  const span = doc.createElement("span");
  span.className = "cs-ctl__glyph";
  span.setAttribute("aria-hidden", "true");
  span.style.display = "inline-grid";
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" focusable="false">${path}</svg>`;
  return span;
}
