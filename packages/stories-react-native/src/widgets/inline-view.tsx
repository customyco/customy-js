import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { DeliveredInline, InlineCard } from "../core";
import { mediaUri } from "../media";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { safeColor, useImpressionOnLayout, widgetElementId, widgetEmitter, type WidgetEvent } from "./common";
import type { WidgetMessages } from "./messages";
import { ProductActions, WIDGET_PRODUCT_COMPONENT_IDS } from "./product-actions";
import { useWidgetEnv } from "./env";

const RATIO = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1, "2:1": 2 } as const;

export type InlineViewProps = {
  entry: DeliveredInline;
  onEvent?: (e: WidgetEvent) => void;
  /** La persona la descartó (ya se emitió `dismiss`). */
  onDismiss?: () => void;
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/**
 * Inline: 1 a 3 tarjetas (imagen, título, texto, CTA) con fondo, radio y proporción de la campaña; descartable por
 * defecto. Es lo que `<StoriesAnchor>` y `useInlineList` insertan; también se puede usar suelto.
 * Impresión = la primera vez que tiene tamaño (en una lista virtualizada, cuando entra a montarse).
 */
export function InlineView({ entry, onEvent, onDismiss, messages, testID }: InlineViewProps) {
  const env = useWidgetEnv({ messages });
  const { ctx, theme, m, rtl } = env;
  const cfg = entry.config;
  const emit = widgetEmitter(entry.id, entry.variant_id, onEvent);
  const [hidden, setHidden] = useState(false);
  const viewed = useRef(new Set<string>()).current;
  const onLayout = useImpressionOnLayout(() => emit({ type: "impression" }));
  if (hidden) return null;
  const bg = safeColor(cfg.background);
  const ratio = cfg.aspect === "auto" ? undefined : RATIO[cfg.aspect];

  const card = (c: InlineCard) => (
    <View key={c.id} testID={`cs-inline-card-${c.id}`} style={styles.card}>
      {c.image ? <Image source={{ uri: mediaUri(ctx.mediaCache, c.image.url) }} resizeMode="cover" style={[styles.image, ratio ? { aspectRatio: ratio } : styles.imageAuto]} accessible accessibilityRole="image" accessibilityLabel={c.image.alt} /> : null}
      {c.title || c.body || c.cta || c.products?.length ? (
        <View style={styles.text}>
          {c.title ? (
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
              {c.title}
            </Text>
          ) : null}
          {c.body ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.body, { color: theme.mutedForeground }]}>
              {c.body}
            </Text>
          ) : null}
          {c.cta ? (
            <ActionButton
              theme={theme}
              testID={`cs-inline-cta-${c.id}`}
              label={c.cta.label}
              role={c.cta.action.type === "url" ? "link" : "button"}
              onPress={() => {
                const elementId = widgetElementId(entry.id, c.id, c.cta!.element_id);
                emit({ type: "click", elementId, itemId: c.id });
                env.open(c.cta!.action, { widgetId: entry.id, itemId: c.id, elementId });
              }}
            />
          ) : null}
          {c.products?.length ? <ProductActions widgetId={entry.id} itemId={c.id} componentId={WIDGET_PRODUCT_COMPONENT_IDS.inline} products={c.products} emit={emit} m={m} viewed={viewed} /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View testID={testID ?? `cs-inline-${entry.id}`} onLayout={onLayout} style={[styles.root, { direction: rtl ? "rtl" : "ltr", borderRadius: cfg.corner_radius, backgroundColor: bg ?? theme.surface, borderColor: theme.border }]}>
      {(entry.items ?? []).map(card)}
      {cfg.dismissible ? (
        <Pressable
          testID={`cs-inline-dismiss-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={m.dismiss}
          hitSlop={4}
          onPress={() => {
            emit({ type: "dismiss", reason: "user" });
            setHidden(true);
            onDismiss?.();
          }}
          style={[styles.dismiss, rtl ? styles.left : styles.right, { backgroundColor: theme.viewerScrim }]}
        >
          <Text style={{ color: theme.viewerForeground, fontSize: 16, fontWeight: "700" }} {...HIDDEN_FROM_AT}>
            ✕
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  card: { gap: 0 },
  image: { width: "100%" },
  imageAuto: { height: 160 },
  text: { padding: 12, gap: 6 },
  title: { fontSize: 17, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 21 },
  dismiss: { position: "absolute", top: 6, width: MIN_TOUCH - 8, height: MIN_TOUCH - 8, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  right: { right: 6 },
  left: { left: 6 },
});
