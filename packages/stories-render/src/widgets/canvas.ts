import { applyTheme } from "../dom/util";
import type { ComponentAction, DeliveredCanvas, CanvasTile } from "../types";
import { defaultOpenLink, el, linkNode, onVisible, resolveUi, safeColor, safeCssUrl, widgetElementId, widgetEmitter, widgetRoot, type WidgetControllerBase, type WidgetHandle } from "./common";
import { renderProductActions, WIDGET_PRODUCT_COMPONENT_IDS, type WidgetProductHooks } from "./product-actions";
import { canvasMessages, fmt } from "./messages";

/**
 * Canvas: mosaico estilo Pinterest de miniaturas clicables, una acción por pieza, con fondo, relleno y radio.
 * `mountCanvas` pinta; `masonryColumns` es la parte pura (reparto en columnas) para quien pinta con su propia UI.
 */
export type CanvasOptions = WidgetControllerBase & WidgetProductHooks & {
  entry: DeliveredCanvas;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
  openLink?: (action: ComponentAction, ctx: { widgetId: string; tileId: string; elementId: string }) => void;
};

/** Reparto en columnas por altura acumulada (la pieza va a la columna más baja; a igualdad, la primera): el orden de lectura se conserva por filas. */
export function masonryColumns(tiles: readonly CanvasTile[], columns: number): CanvasTile[][] {
  const n = Math.max(1, Math.min(6, Math.floor(columns) || 1));
  const cols: CanvasTile[][] = Array.from({ length: n }, () => []);
  const heights = new Array<number>(n).fill(0);
  for (const t of tiles) {
    const w = t.image.width, h = t.image.height;
    const ratio = w && h && w > 0 && h > 0 ? h / w : 1;
    let at = 0;
    for (let i = 1; i < n; i++) if (heights[i]! < heights[at]! - 1e-9) at = i;
    cols[at]!.push(t);
    heights[at]! += Math.min(3, Math.max(0.33, ratio));
  }
  return cols;
}

export function mountCanvas(container: HTMLElement, options: CanvasOptions): WidgetHandle {
  const { doc, win, rtl } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const tiles = entry.items ?? [];
  const m = canvasMessages(options.locale, options.messages);
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const open = (a: ComponentAction, tileId: string, elementId: string): void => (options.openLink ?? ((x) => defaultOpenLink(x, win, options.allowedSchemes)))(a, { widgetId: entry.id, tileId, elementId });
  const cleanup: Array<() => void> = [];
  const productViewed = new Set<string>();
  const bg = safeColor(cfg.background.color);
  const bgImg = safeCssUrl(cfg.background.image_url);

  const root = widgetRoot(doc, "canvas", entry.id, cfg.title || m.canvasLabel, {
    dir: rtl ? "rtl" : "ltr",
    style: { "--cs-w-gap": `${cfg.gap}px`, "--cs-w-pad": `${cfg.padding}px`, "--cs-radius": `${cfg.corner_radius}px`, ...(bg ? { "--cs-w-bg": bg } : {}), ...(bgImg ? { "--cs-w-bg-image": bgImg } : {}) },
  });
  applyTheme(root, options.theme);
  if (cfg.title) root.append(el(doc, "h2", { class: "cs-canvas__title" }, cfg.title));
  const grid = el(doc, "div", { class: "cs-canvas__grid", style: { "--cs-w-cols": String(Math.min(6, Math.max(1, cfg.columns))) } });
  for (const col of masonryColumns(tiles, cfg.columns)) {
    const colEl = el(doc, "ul", { class: "cs-canvas__col", role: "list" });
    for (const t of col) {
      const elementId = widgetElementId(entry.id, t.id, t.element_id);
      const img = el(doc, "img", { src: t.image.url, alt: t.image.alt, loading: "lazy", decoding: "async", ...(t.image.width && t.image.height ? { width: t.image.width, height: t.image.height } : {}) });
      const node = linkNode(doc, "button", t.action, { class: "cs-canvas__tile", "aria-label": t.title ? fmt(m.tileLabel, { title: t.title }) : null, "data-tile-id": t.id }, () => {
        emit({ type: "click", elementId, itemId: t.id });
        open(t.action, t.id, elementId);
      }) as HTMLElement;
      node.append(img);
      if (t.title) node.append(el(doc, "span", { class: "cs-canvas__caption" }, t.title));
      const shop = renderProductActions(doc, win, { widgetId: entry.id, itemId: t.id, componentId: WIDGET_PRODUCT_COMPONENT_IDS.canvas, products: t.products, emit, m, hooks: options, visibleOn: node, cleanup, viewed: productViewed });
      colEl.append(el(doc, "li", { class: "cs-canvas__item" }, node, ...(shop ? [shop] : [])));
    }
    grid.append(colEl);
  }
  root.append(grid);
  if (cfg.cta) {
    const cta = cfg.cta;
    const node = linkNode(doc, "button", cta.action, { class: "cs-widget__cta" }, () => {
      emit({ type: "click", elementId: cta.element_id });
      open(cta.action, "cta", cta.element_id);
    });
    node.append(cta.label);
    root.append(node);
  }
  container.append(root);
  const stop = onVisible(win, root, () => emit({ type: "impression" }));
  return {
    element: root,
    destroy() {
      stop();
      cleanup.forEach((f) => f());
      root.remove();
    },
  };
}
