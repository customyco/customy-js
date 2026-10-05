import { useRef } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { masonryColumns } from "@customyai/stories-render/widgets/canvas";
import type { DeliveredCanvas } from "../core";
import { mediaUri } from "../media";
import { ActionButton, MAX_FONT_SCALE } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { safeColor, useImpressionOnLayout, widgetElementId, widgetEmitter, type WidgetEvent } from "./common";
import { fmt, type WidgetMessages } from "./messages";
import { ProductActions, WIDGET_PRODUCT_COMPONENT_IDS } from "./product-actions";
import { useWidgetEnv } from "./env";

export type CanvasViewProps = {
  entry: DeliveredCanvas;
  onEvent?: (e: WidgetEvent) => void;
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/**
 * Canvas: mosaico de miniaturas clicables (reparto en columnas de `masonryColumns`, el mismo del renderer web), una acción
 * por pieza, con título, fondo, relleno, separación y radio de la campaña. El `alt` de cada imagen es obligatorio en el
 * contrato y es lo que lee el lector de pantalla (con título, el título). Cada pieza mide ≥ 48 pt de alto.
 */
export function CanvasView({ entry, onEvent, messages, testID }: CanvasViewProps) {
  const env = useWidgetEnv({ messages });
  const { ctx, theme, m, rtl } = env;
  const cfg = entry.config;
  const emit = widgetEmitter(entry.id, entry.variant_id, onEvent);
  const onLayout = useImpressionOnLayout(() => emit({ type: "impression" }));
  const bg = safeColor(cfg.background.color);
  const bgImage = cfg.background.image_url && /^https:\/\//.test(cfg.background.image_url) ? cfg.background.image_url : undefined;
  const cols = masonryColumns(entry.items ?? [], cfg.columns);
  const title = cfg.title || m.canvasLabel;
  const viewed = useRef(new Set<string>()).current;

  return (
    <View testID={testID ?? `cs-canvas-${entry.id}`} onLayout={onLayout} style={[styles.root, { direction: rtl ? "rtl" : "ltr", padding: cfg.padding, gap: cfg.gap, borderRadius: cfg.corner_radius, backgroundColor: bg ?? theme.surface }]}>
      {bgImage ? <Image source={{ uri: mediaUri(ctx.mediaCache, bgImage) }} resizeMode="cover" style={StyleSheet.absoluteFill} {...HIDDEN_FROM_AT} /> : null}
      {cfg.title ? (
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
          {cfg.title}
        </Text>
      ) : null}
      <View accessibilityLabel={title} style={[styles.grid, { gap: cfg.gap }]}>
        {cols.map((col, ci) => (
          <View key={ci} style={[styles.col, { gap: cfg.gap }]}>
            {col.map((t) => {
              const w = t.image.width, h = t.image.height;
              const ratio = w && h && w > 0 && h > 0 ? w / h : 1;
              const elementId = widgetElementId(entry.id, t.id, t.element_id);
              return (
                <View key={t.id} style={styles.cell}>
                <Pressable
                  testID={`cs-canvas-tile-${t.id}`}
                  accessibilityRole={t.action.type === "url" ? "link" : "imagebutton"}
                  accessibilityLabel={t.title ? fmt(m.tileLabel, { title: t.title }) : t.image.alt}
                  onPress={() => {
                    emit({ type: "click", elementId, itemId: t.id });
                    env.open(t.action, { widgetId: entry.id, itemId: t.id, elementId });
                  }}
                  style={[styles.tile, { borderRadius: cfg.corner_radius, backgroundColor: theme.border }]}
                >
                  <Image source={{ uri: mediaUri(ctx.mediaCache, t.image.url) }} resizeMode="cover" style={{ width: "100%", aspectRatio: Math.min(3, Math.max(0.33, ratio)) }} {...HIDDEN_FROM_AT} />
                  {t.title ? (
                    <View style={[styles.caption, { backgroundColor: theme.viewerScrim }]} {...HIDDEN_FROM_AT}>
                      <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.viewerForeground, fontSize: 13, fontWeight: "600" }}>
                        {t.title}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
                {t.products?.length ? <ProductActions widgetId={entry.id} itemId={t.id} componentId={WIDGET_PRODUCT_COMPONENT_IDS.canvas} products={t.products} emit={emit} m={m} viewed={viewed} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      {cfg.cta ? (
        <ActionButton
          theme={theme}
          testID="cs-canvas-cta"
          label={cfg.cta.label}
          role={cfg.cta.action.type === "url" ? "link" : "button"}
          onPress={() => {
            const elementId = cfg.cta!.element_id;
            emit({ type: "click", elementId });
            env.open(cfg.cta!.action, { widgetId: entry.id, itemId: "cta", elementId });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
  title: { fontSize: 20, fontWeight: "700" },
  grid: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1 },
  cell: { gap: 6 },
  tile: { minHeight: 48, overflow: "hidden" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 6 },
});
