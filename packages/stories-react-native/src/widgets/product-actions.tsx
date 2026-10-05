import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ProductRef, StoryCommerceContext } from "../core";
import { useStoriesContext } from "../context";
import { ActionButton, MAX_FONT_SCALE } from "../ui";
import type { WidgetEventInput } from "./common";
import { fmt, type WidgetMessages } from "./messages";

/** El componente fijo de cada widget en los eventos de producto (el servidor exige el mismo valor; mismo mapa que `product-actions.ts` del renderer). */
export const WIDGET_PRODUCT_COMPONENT_IDS = { swipe_cards: "cards", video_feed: "feed", canvas: "canvas", inline: "inline" } as const;

const key = (itemId: string, r: ProductRef): string => `${itemId}|${r.connector}:${r.external_id}#${r.variant_id ?? ""}`;
const refKey = (r: ProductRef): string => `${r.connector}:${r.external_id}#${r.variant_id ?? ""}`;
const noop = (): void => undefined;

export type ProductActionsProps = {
  widgetId: string;
  /** El elemento (pieza, vídeo, tarjeta): va como `page_id` del evento. */
  itemId: string;
  componentId: string;
  products: readonly ProductRef[] | undefined;
  emit: (e: WidgetEventInput) => void;
  m: WidgetMessages;
  /** Lo ya visto en este montaje (compartido por todos los elementos): el visor del Video Feed se cierra y abre, y no repite la vista. */
  viewed: Set<string>;
  /** `false` mientras el elemento no se ve (p. ej. otro vídeo del visor): la vista se cuenta al pasar a `true`. */
  visible?: boolean;
};

/**
 * Productos de un elemento de widget (Video Feed, Canvas, Inline): «Añadir al carrito» y «Guardar» por producto (hasta 10),
 * más `product_viewed` una vez por producto y montaje cuando el elemento se ve. Paridad con `renderProductActions`
 * del renderer web y con `WidgetProductActions` de los SDK nativos: cantidad 1; un doble toque es UNA intención (se
 * bloquea 1,2 s mientras dice «Añadido»); guardar es de una sola vez y queda pulsado. Los ganchos son los del
 * `StoriesProvider` (`onAddToCart`/`onWishlist`) con `{ storyId: campaña, slideId: elemento, componentId }`.
 */
export function ProductActions({ widgetId, itemId, componentId, products, emit, m, viewed, visible = true }: ProductActionsProps) {
  const ctx = useStoriesContext();
  const refs = (products ?? []).slice(0, 10);
  const sig = refs.map(refKey).join(",");
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() => new Map());
  const latest = useRef({ ctx, emit });
  latest.current = { ctx, emit };
  const { resolveProducts } = ctx;

  // Los títulos salen de `resolveProducts` (el `productTitle` del web); sin él el botón nombra solo la acción.
  useEffect(() => {
    if (!resolveProducts || !refs.length) return;
    let dead = false;
    resolveProducts(refs as ProductRef[]).then(
      (list) => !dead && setTitles(new Map(list.filter((r) => r.title).map((r) => [refKey(r.ref), r.title]))),
      noop,
    );
    return () => {
      dead = true;
    };
  }, [resolveProducts, sig]);

  useEffect(() => {
    if (!visible) return;
    for (const ref of refs) {
      const k = key(itemId, ref);
      if (viewed.has(k)) continue;
      viewed.add(k);
      latest.current.emit({ type: "product", name: "product_viewed", product: ref, itemId, componentId });
    }
  }, [visible, itemId, sig]);

  if (!refs.length) return null;
  const commerce: StoryCommerceContext = { storyId: widgetId, slideId: itemId, componentId };
  return (
    <View testID={`cs-wp-${itemId}`} accessibilityRole="none" accessibilityLabel={m.productsLabel} style={styles.box}>
      {refs.map((ref) => (
        <ProductRow key={refKey(ref)} ref_={ref} title={titles.get(refKey(ref)) ?? ""} itemId={itemId} componentId={componentId} commerce={commerce} m={m} latest={latest} />
      ))}
    </View>
  );
}

function ProductRow({ ref_, title, itemId, componentId, commerce, m, latest }: { ref_: ProductRef; title: string; itemId: string; componentId: string; commerce: StoryCommerceContext; m: WidgetMessages; latest: { current: { ctx: ReturnType<typeof useStoriesContext>; emit: (e: WidgetEventInput) => void } } }) {
  const { theme } = latest.current.ctx;
  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState(false);
  const adding = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const name = title || ref_.external_id;
  return (
    <View testID={`cs-wp-row-${ref_.external_id}`} style={styles.row}>
      {title ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
          {title}
        </Text>
      ) : null}
      <ActionButton
        theme={theme}
        testID={`cs-wp-add-${ref_.external_id}`}
        label={added ? m.addedToCart : m.addToCart}
        a11yLabel={added ? `${fmt(m.addToCartOf, { title: name })}. ${m.addedToCart}` : fmt(m.addToCartOf, { title: name })}
        onPress={() => {
          // Un doble toque rápido es UNA intención de compra: el segundo espera a que pase la confirmación.
          if (adding.current) return;
          adding.current = true;
          latest.current.emit({ type: "product", name: "add_to_cart", product: ref_, quantity: 1, itemId, componentId });
          latest.current.ctx.onAddToCart?.(ref_, 1, commerce);
          setAdded(true);
          timer.current = setTimeout(() => {
            adding.current = false;
            setAdded(false);
          }, 1200);
        }}
      />
      <ActionButton
        theme={theme}
        filled={false}
        testID={`cs-wp-save-${ref_.external_id}`}
        label={saved ? m.saved : m.save}
        a11yLabel={saved ? `${fmt(m.saveOf, { title: name })}. ${m.saved}` : fmt(m.saveOf, { title: name })}
        selected={saved}
        onPress={() => {
          if (saved) return;
          setSaved(true);
          latest.current.emit({ type: "product", name: "wishlist_added", product: ref_, itemId, componentId });
          latest.current.ctx.onWishlist?.(ref_, commerce);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
});
