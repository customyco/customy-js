import { applyTheme } from "../dom/util";
import type { ComponentAction, DeliveredInline, InlineAnchor, InlineCard } from "../types";
import { renderProductActions, WIDGET_PRODUCT_COMPONENT_IDS, type WidgetProductHooks } from "./product-actions";
import { createAnchorRegistry, defaultOpenLink, el, findAnchor, linkNode, onVisible, resolveUi, safeColor, widgetElementId, widgetEmitter, widgetRoot, icon, type AnchorRegistry, type WidgetControllerBase, type WidgetHandle } from "./common";
import { inlineMessages } from "./messages";

/**
 * Inline: tarjetas insertadas por posición dentro de la propia pantalla de la app, junto a un elemento que la app
 * marcó con `data-customy-anchor="<id>"` (o registró con `createAnchorRegistry`) o en una posición de una lista.
 * Nunca un selector CSS: el id lo elige la app. Si el ancla aún no existe (la vista carga después) se espera con un
 * `MutationObserver`; si desaparece, la tarjeta se retira y vuelve cuando el ancla regrese. Sigue la cola de entrega:
 * la elección de qué tarjeta va a qué ancla (una por ancla) la hace `selectDelivery`.
 */
export type InlineOptions = WidgetControllerBase & WidgetProductHooks & {
  entry: DeliveredInline;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
  /** Dónde buscar el ancla (por defecto, todo el documento). */
  root?: ParentNode;
  anchors?: AnchorRegistry;
  openLink?: (action: ComponentAction, ctx: { widgetId: string; cardId: string; elementId: string }) => void;
};

export { createAnchorRegistry };

/** Hijo `index` de la lista `list` (0 = primero); si hay menos hijos, al final. Pura: sirve a quien pinta con su propia UI. */
export function insertionPoint(anchor: InlineAnchor, host: HTMLElement): { parent: Node; before: Node | null } | { replace: HTMLElement } | null {
  if (anchor.type === "index") {
    const kids = Array.from(host.children).filter((c) => !c.hasAttribute("data-widget-kind"));
    return { parent: host, before: kids[anchor.index] ?? null };
  }
  switch (anchor.position) {
    case "before": return host.parentNode ? { parent: host.parentNode, before: host } : null;
    case "after": return host.parentNode ? { parent: host.parentNode, before: host.nextSibling } : null;
    case "inside_start": return { parent: host, before: host.firstChild };
    case "inside_end": return { parent: host, before: null };
    case "replace": return { replace: host };
  }
}

export function mountInline(_container: HTMLElement | null, options: InlineOptions): WidgetHandle {
  const { doc, win, rtl } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const cards = entry.items ?? [];
  const m = inlineMessages(options.locale, options.messages);
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const open = (a: ComponentAction, cardId: string, elementId: string): void => (options.openLink ?? ((x) => defaultOpenLink(x, win, options.allowedSchemes)))(a, { widgetId: entry.id, cardId, elementId });
  const bg = safeColor(cfg.background);
  const cleanup: Array<() => void> = [];
  const productViewed = new Set<string>();

  const root = widgetRoot(doc, "inline", entry.id, m.inline, { dir: rtl ? "rtl" : "ltr", "data-aspect": cfg.aspect, style: { "--cs-radius": `${cfg.corner_radius}px`, ...(bg ? { "--cs-w-bg": bg } : {}) } });
  applyTheme(root, options.theme);
  for (const c of cards) root.append(renderCard(c));
  if (cfg.dismissible) {
    const x = el(doc, "button", { type: "button", class: "cs-ctl cs-inline__dismiss", "aria-label": m.dismiss }, icon(doc, "close"));
    x.addEventListener("click", () => {
      emit({ type: "dismiss", reason: "user" });
      destroy();
    });
    root.append(x);
  }

  function renderCard(c: InlineCard): HTMLElement {
    const card = el(doc, "article", { class: "cs-inline__card", "data-card-id": c.id });
    if (c.image) card.append(el(doc, "img", { src: c.image.url, alt: c.image.alt, loading: "lazy", decoding: "async" }));
    if (c.title || c.body || c.cta) {
      const text = el(doc, "div", { class: "cs-inline__text" });
      if (c.title) text.append(el(doc, "h3", { class: "cs-inline__title" }, c.title));
      if (c.body) text.append(el(doc, "p", { class: "cs-inline__body" }, c.body));
      if (c.cta) {
        const cta = c.cta;
        const node = linkNode(doc, "button", cta.action, { class: "cs-widget__cta" }, () => {
          emit({ type: "click", elementId: widgetElementId(entry.id, c.id, cta.element_id), itemId: c.id });
          open(cta.action, c.id, cta.element_id);
        });
        node.append(cta.label);
        text.append(node);
      }
      card.append(text);
    }
    const shop = renderProductActions(doc, win, { widgetId: entry.id, itemId: c.id, componentId: WIDGET_PRODUCT_COMPONENT_IDS.inline, products: c.products, emit, m, hooks: options, visibleOn: card, cleanup, viewed: productViewed });
    if (shop) card.append(shop);
    return card;
  }

  // ─── Colocación y espera del ancla ────────────────────────────────────────
  const anchorId = cfg.anchor.type === "element" ? cfg.anchor.element_id : cfg.anchor.list_id;
  let replaced: HTMLElement | null = null;
  let stopVisible: (() => void) | null = null;
  let impressed = false;
  let dead = false;
  const scope: ParentNode = options.root ?? doc;

  const unplace = (): void => {
    stopVisible?.();
    stopVisible = null;
    if (replaced) replaced.hidden = false;
    replaced = null;
    root.remove();
  };
  const place = (): void => {
    if (dead) return;
    const host = findAnchor(doc, anchorId, options.anchors);
    const here = root.isConnected;
    if (!host || (options.root && !options.root.contains(host))) {
      if (here) unplace();
      return;
    }
    const where = insertionPoint(cfg.anchor, host);
    if (!where) return;
    if ("replace" in where) {
      if (replaced === where.replace && here) return;
      where.replace.hidden = true;
      replaced = where.replace;
      where.replace.after(root);
    } else {
      // Ya está donde toca: no se mueve (evita un bucle con el propio observador).
      if (here && root.parentNode === where.parent && (where.before === root || where.before === root.nextSibling)) return;
      where.parent.insertBefore(root, where.before === root ? root.nextSibling : where.before);
    }
    if (!impressed && !stopVisible) stopVisible = onVisible(win, root, () => ((impressed = true), emit({ type: "impression" })));
  };

  place();
  const Observer = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
  const mo = Observer ? new Observer(() => place()) : null;
  mo?.observe(scope instanceof Document ? scope.documentElement : (scope as unknown as Node), { childList: true, subtree: true, attributes: true, attributeFilter: ["data-customy-anchor"] });

  function destroy(): void {
    dead = true;
    cleanup.forEach((f) => f());
    mo?.disconnect();
    unplace();
  }
  return { element: root, destroy };
}
