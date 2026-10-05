/**
 * Contexto de historia que viaja con el carrito (plan §5.6): qué historia, página y componente puso el producto en
 * el carrito, y las UTM de la visita. El renderer lo entrega a `onAddToCart`/`onWishlist`; la app lo escribe en los
 * atributos del carrito de su tienda y, al cerrar la compra, lo lee de vuelta para `reportConversion`.
 * Los nombres son los que escribe el conector de Shopify en Commerce (`customy_story_id`, …; los de línea con `_`),
 * así una compra de Shopify lleva el mismo contexto aunque la app arme el carrito por su cuenta.
 */

export type StoryCommerceContext = { storyId: string; slideId?: string; componentId?: string };

const UTM = /^utm_[a-z_]{1,30}$/;
const clip = (v: string) => v.slice(0, 255);

/** Atributos de carrito (y de línea, ocultos con `_`) para el contexto y las UTM. Nada se inventa: lo vacío se omite. */
export function storyCartAttributes(context: StoryCommerceContext, utm: Record<string, string> = {}): { cart: Record<string, string>; line: Record<string, string> } {
  const base: Array<[string, string | undefined]> = [["story_id", context.storyId], ["slide_id", context.slideId], ["component_id", context.componentId]];
  const cart: Record<string, string> = {};
  const line: Record<string, string> = {};
  for (const [k, v] of base) {
    if (!v) continue;
    cart[`customy_${k}`] = clip(v);
    line[`_customy_${k}`] = clip(v);
  }
  for (const [k, v] of Object.entries(utm)) if (UTM.test(k) && v) cart[k] = clip(v);
  return { cart, line };
}

/** Lo inverso: del conjunto de atributos de un pedido (de carrito o de línea) al contexto y las UTM. `null` sin historia. */
export function readStoryContext(attributes: Record<string, string | undefined>): { context: StoryCommerceContext; utm: Record<string, string> } | null {
  const pick = (k: string) => attributes[`customy_${k}`] || attributes[`_customy_${k}`] || undefined;
  const storyId = pick("story_id");
  if (!storyId) return null;
  const slideId = pick("slide_id");
  const componentId = pick("component_id");
  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributes)) if (UTM.test(k) && v) utm[k] = clip(v);
  return { context: { storyId, ...(slideId ? { slideId } : {}), ...(componentId ? { componentId } : {}) }, utm };
}
