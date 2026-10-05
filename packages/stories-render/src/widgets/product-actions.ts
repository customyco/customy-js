import type { ProductRef } from "../types";
import type { StoryCommerceContext } from "../commerce";
import { el, onVisible, type WidgetEventInput } from "./common";
import { fmt, type WidgetMessages } from "./messages";

/**
 * Productos de un elemento de widget (Video Feed, Canvas, Inline): «Añadir al carrito» y «Guardar» por producto,
 * más `product_viewed` una vez por producto y sesión de montaje cuando el elemento se ve.
 *
 * El evento lleva el elemento (`itemId` → `page_id`) y el componente fijo del widget; con eso Commerce atribuye
 * `{widgetId, itemId, componentId}` sin que la app arme nada. La app recibe el MISMO contexto en `onAddToCart`/`onWishlist`
 * para escribirlo en los atributos del carrito (`storyCartAttributes`), igual que con las historias.
 */
/** El componente fijo de cada widget en los eventos de producto (el servidor exige el mismo valor; ver `WIDGET_PRODUCT_COMPONENT_IDS` en contratos). */
export const WIDGET_PRODUCT_COMPONENT_IDS = { swipe_cards: "cards", video_feed: "feed", canvas: "canvas", inline: "inline" } as const;

export type WidgetProductHooks = {
  onAddToCart?: (ref: ProductRef, context: StoryCommerceContext & { quantity: number }) => void;
  onWishlist?: (ref: ProductRef, context: StoryCommerceContext) => void;
  /** Título legible de un producto (p. ej. de `resolveProducts`); sin él el botón nombra solo la acción. */
  productTitle?: (ref: ProductRef) => string | undefined;
};

export function renderProductActions(
  doc: Document,
  win: Window & typeof globalThis,
  input: {
    widgetId: string;
    itemId: string;
    componentId: string;
    products: readonly ProductRef[] | undefined;
    emit: (e: WidgetEventInput) => void;
    m: WidgetMessages;
    hooks: WidgetProductHooks;
    /** El nodo cuya visibilidad cuenta como «vio el producto». */
    visibleOn: Element;
    cleanup: Array<() => void>;
    /** Lo ya visto en este montaje (compartido por todos los elementos): el visor del Video Feed se abre y cierra, y no debe repetir la vista. */
    viewed: Set<string>;
  },
): HTMLElement | null {
  const refs = (input.products ?? []).slice(0, 10);
  if (!refs.length) return null;
  const { m, emit, hooks } = input;
  const ctx: StoryCommerceContext = { storyId: input.widgetId, slideId: input.itemId, componentId: input.componentId };
  const box = el(doc, "div", { class: "cs-wp", role: "group", "aria-label": m.productsLabel });
  const viewed = input.viewed;
  input.cleanup.push(
    onVisible(win, input.visibleOn, () => {
      for (const ref of refs) {
        const key = `${input.itemId}|${ref.connector}:${ref.external_id}#${ref.variant_id ?? ""}`;
        if (viewed.has(key)) continue;
        viewed.add(key);
        emit({ type: "product", name: "product_viewed", product: ref, itemId: input.itemId, componentId: input.componentId });
      }
    }),
  );
  for (const ref of refs) {
    const title = hooks.productTitle?.(ref) ?? "";
    const row = el(doc, "div", { class: "cs-wp__row" });
    if (title) row.append(el(doc, "span", { class: "cs-wp__title" }, title));
    const add = el(doc, "button", { type: "button", class: "cs-widget__cta cs-wp__add", "aria-label": fmt(m.addToCartOf, { title: title || ref.external_id }) }, m.addToCart);
    let adding = false;
    add.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // Un doble clic rápido es UNA intención de compra: la segunda pulsación espera a que se pinte la confirmación.
      if (adding) return;
      adding = true;
      emit({ type: "product", name: "add_to_cart", product: ref, quantity: 1, itemId: input.itemId, componentId: input.componentId });
      hooks.onAddToCart?.(ref, { ...ctx, quantity: 1 });
      add.textContent = m.addedToCart;
      win.setTimeout(() => {
        adding = false;
        add.textContent = m.addToCart;
      }, 1200);
    });
    const save = el(doc, "button", { type: "button", class: "cs-widget__cta cs-wp__save", "aria-label": fmt(m.saveOf, { title: title || ref.external_id }), "aria-pressed": "false" }, m.save);
    save.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (save.getAttribute("aria-pressed") === "true") return;
      save.setAttribute("aria-pressed", "true");
      emit({ type: "product", name: "wishlist_added", product: ref, itemId: input.itemId, componentId: input.componentId });
      hooks.onWishlist?.(ref, ctx);
      save.textContent = m.saved;
    });
    row.append(add, save);
    box.append(row);
  }
  return box;
}
