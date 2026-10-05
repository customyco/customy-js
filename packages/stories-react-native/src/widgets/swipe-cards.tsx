import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { createSwipeDeck, swipeKey, type SwipeDeck, type SwipeDirection, type SwipeVia } from "@customyai/stories-render/widgets/swipe-cards";
import { systemClock, type DeliveredSwipeCards, type ResolvedProduct, type SwipeCard, type WidgetProgress } from "../core";
import { mediaUri } from "../media";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { LiveRegion, safeColor, useImpressionOnLayout, widgetElementId, widgetEmitter, type WidgetEvent } from "./common";
import { fmt, type WidgetMessages } from "./messages";
import { useWidgetEnv } from "./env";

/** Cuánto hay que arrastrar (pt) para que un gesto cuente como decisión: el mismo umbral que el renderer web. */
export const SWIPE_THRESHOLD = 80;
const FLY_MS = 200;
const RATIO = { "3:4": 3 / 4, "4:5": 4 / 5, "1:1": 1 } as const;
// Decorativos (los lee el lector de pantalla por la etiqueta del botón, no por el glifo).
const GLYPH = { heart: "♥", check: "✓", thumb_up: "👍", star: "★", x: "✕", thumb_down: "👎", skip: "⏭" } as const;

export type SwipeCardsViewProps = {
  entry: DeliveredSwipeCards;
  /** Lo ya deslizado (de `client.bindWidget(...).progress`): con `remember_swipes` no vuelve al mazo. */
  progress?: WidgetProgress;
  onEvent?: (e: WidgetEvent) => void;
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/**
 * Swipe Cards: tarjetas de producto estilo Tinder (derecha = me gusta, izquierda = descartar), hasta 100. El mazo, las
 * decisiones y los eventos son los de `createSwipeDeck` (el mismo controlador del renderer web); aquí solo se pintan con
 * gesto (Gesture Handler + Reanimated). El gesto NUNCA es el único camino (WCAG 2.5.1): los dos botones están siempre
 * a la vista (≥ 48 pt) y la tarjeta de arriba ofrece las acciones de accesibilidad «me gusta» y «descartar»
 * (VoiceOver: rotor de acciones; TalkBack: menú de acciones). Con «reducir movimiento» no hay vuelo de la tarjeta.
 * Eventos: `swipe` y, según `swipe_right`, `product` (`wishlist_added` / `add_to_cart` con `component_id: "cards"`).
 * `onWishlist`/`onAddToCart` del `StoriesProvider` reciben `{ storyId: <campaña>, componentId: "cards" }`.
 */
export function SwipeCardsView({ entry, progress, onEvent, messages, testID }: SwipeCardsViewProps) {
  const env = useWidgetEnv({ messages });
  const { ctx, theme, m, rtl, reducedMotion, notice, say } = env;
  const cfg = entry.config;
  const clock = ctx.clock ?? systemClock;
  const win = useWindowDimensions();
  const emit = widgetEmitter(entry.id, entry.variant_id, onEvent);
  const deckRef = useRef<SwipeDeck | null>(null);
  // Tras el primer pintado la tarjeta de arriba se «vio»: `product_viewed` una vez por producto (como en la web; el mazo repite tras cada deslizamiento).
  const onLayout = useImpressionOnLayout(() => {
    emit({ type: "impression" });
    deckRef.current?.seeTop();
  });
  const [resolved, setResolved] = useState<ReadonlyMap<string, ResolvedProduct>>(() => new Map());
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const latest = useRef({ onEvent, ctx });
  latest.current = { onEvent, ctx };
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const deck = useMemo(() => {
    const commerce = { storyId: entry.id, componentId: "cards" };
    return createSwipeDeck({
      entry,
      progress,
      onEvent: (e) => latest.current.onEvent?.(e),
      onWishlist: (ref) => latest.current.ctx.onWishlist?.(ref, commerce),
      onAddToCart: (ref) => latest.current.ctx.onAddToCart?.(ref, 1, commerce),
      onOpen: (ref) => {
        const url = resolvedRef.current.get(swipeKey(ref))?.url;
        if (!url) return;
        const elementId = widgetElementId(entry.id, `open_${ref.external_id}`.slice(0, 40));
        latest.current.ctx.open(url.startsWith("http") || url.startsWith("/") ? { type: "url", url } : { type: "deep_link", uri: url }, { surface: "widget", widgetId: entry.id, itemId: ref.external_id, elementId });
      },
    });
    // El mazo se arma una vez por campaña/versión: lo deslizado no se reordena en mitad de la sesión.
  }, [entry.id, entry.updated_at]);
  deckRef.current = deck;
  useEffect(() => deck.subscribe(rerender), [deck]);

  const { resolveProducts } = ctx;
  useEffect(() => {
    if (!resolveProducts || deck.total === 0) return;
    let dead = false;
    resolveProducts(deck.remaining.map((c) => c.product)).then(
      (list) => !dead && setResolved(new Map(list.map((r) => [swipeKey(r.ref), r]))),
      () => undefined,
    );
    return () => {
      dead = true;
    };
  }, [resolveProducts, deck]);

  const x = useSharedValue(0);
  const busy = useRef(false);
  // Se lee por el ref: `decide` no se recrea cada vez que llegan los precios.
  const titleOf = (c: SwipeCard): string => resolvedRef.current.get(swipeKey(c.product))?.title ?? c.headline ?? c.product.external_id;

  const decide = useCallback(
    (direction: SwipeDirection, via: SwipeVia): void => {
      if (busy.current || deck.done) return;
      const card = deck.top!;
      const finish = (): void => {
        busy.current = false;
        deck.swipe(direction, via);
        x.value = 0;
        say(fmt(direction === "right" ? m.liked : m.skipped, { title: titleOf(card) }));
      };
      if (reducedMotion) return finish();
      busy.current = true;
      x.value = withTiming((direction === "right" ? 1.2 : -1.2) * win.width, { duration: FLY_MS });
      clock.setTimeout(finish, FLY_MS);
    },
    [deck, reducedMotion, win.width, clock, m, say, x],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-12, 12])
        .failOffsetY([-24, 24])
        .onUpdate((e) => {
          if (!busy.current) x.value = e.translationX;
        })
        .onEnd((e) => {
          if (busy.current) return;
          if (Math.abs(e.translationX) >= SWIPE_THRESHOLD) decide(e.translationX > 0 ? "right" : "left", "gesture");
          else x.value = reducedMotion ? 0 : withTiming(0, { duration: 150 });
        })
        .onFinalize((_e, success) => {
          if (!success && !busy.current) x.value = 0;
        }),
    [decide, reducedMotion, x],
  );
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { rotate: `${x.value / 20}deg` }] }));
  const likeStamp = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, x.value / SWIPE_THRESHOLD)) }));
  const nopeStamp = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -x.value / SWIPE_THRESHOLD)) }));

  const likeColor = safeColor(cfg.feedback.like.color) ?? theme.positive;
  const nopeColor = safeColor(cfg.feedback.nope.color) ?? theme.negative;
  const rem = deck.remaining;
  const depthMax = cfg.layout === "stack" ? Math.min(3, rem.length) : Math.min(1, rem.length);
  const n = deck.total - rem.length + 1;

  const renderCard = (c: SwipeCard, depth: number) => {
    const r = resolved.get(swipeKey(c.product));
    const label = [fmt(m.cardOf, { n, total: deck.total }), titleOf(c), cfg.show_price && r?.price ? (r.price.formatted ?? `${r.price.amount} ${r.price.currency}`) : "", r && !r.available ? m.unavailableProduct : "", c.badge ?? ""].filter(Boolean).join(". ");
    const body = (
      <>
        {r?.image_url ? <Image source={{ uri: mediaUri(ctx.mediaCache, r.image_url) }} resizeMode="cover" style={StyleSheet.absoluteFill} {...HIDDEN_FROM_AT} /> : null}
        <View style={[styles.cardBody, { backgroundColor: theme.viewerScrim }]} {...HIDDEN_FROM_AT}>
          {c.badge ? (
            <Text style={[styles.badge, { color: theme.accentForeground, backgroundColor: theme.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {c.badge}
            </Text>
          ) : null}
          <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.cardTitle, { color: theme.viewerForeground }]}>
            {titleOf(c)}
          </Text>
          {c.headline && r ? (
            <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.viewerForeground, fontSize: 14 }}>
              {c.headline}
            </Text>
          ) : null}
          {cfg.show_price && r?.price ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.price, { color: theme.viewerForeground }]}>
              {r.price.formatted ?? `${r.price.amount} ${r.price.currency}`}
            </Text>
          ) : null}
          {r && !r.available ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.viewerForeground, fontSize: 13 }}>
              {m.unavailableProduct}
            </Text>
          ) : null}
        </View>
      </>
    );
    const frame = [styles.card, { borderRadius: cfg.corner_radius, backgroundColor: theme.surface, borderColor: theme.border, aspectRatio: RATIO[cfg.aspect] }];
    if (depth > 0) {
      return (
        <View key={swipeKey(c.product)} pointerEvents="none" style={[frame, styles.behind, { transform: [{ scale: 1 - depth * 0.05 }, { translateY: depth * 10 }] }]} {...HIDDEN_FROM_AT}>
          {body}
        </View>
      );
    }
    return (
      <GestureDetector key={swipeKey(c.product)} gesture={pan}>
        <Animated.View
          testID="cs-swipe-top"
          accessible
          accessibilityLabel={label}
          accessibilityHint={m.cardsHelp}
          accessibilityActions={[
            { name: "like", label: cfg.feedback.like.label },
            { name: "nope", label: cfg.feedback.nope.label },
          ]}
          onAccessibilityAction={(e: { nativeEvent: { actionName: string } }) => {
            if (e.nativeEvent.actionName === "like") decide("right", "keyboard");
            else if (e.nativeEvent.actionName === "nope") decide("left", "keyboard");
          }}
          style={[frame, styles.top, topStyle]}
        >
          {body}
          {cfg.feedback.show_stamps ? (
            <>
              <Animated.View style={[styles.stamp, styles.stampLike, { borderColor: likeColor }, likeStamp]} {...HIDDEN_FROM_AT}>
                <Text style={[styles.stampText, { color: likeColor }]}>{cfg.feedback.like.label}</Text>
              </Animated.View>
              <Animated.View style={[styles.stamp, styles.stampNope, { borderColor: nopeColor }, nopeStamp]} {...HIDDEN_FROM_AT}>
                <Text style={[styles.stampText, { color: nopeColor }]}>{cfg.feedback.nope.label}</Text>
              </Animated.View>
            </>
          ) : null}
        </Animated.View>
      </GestureDetector>
    );
  };

  const end = deck.done;
  return (
    <View testID={testID ?? `cs-swipe-${entry.id}`} onLayout={onLayout} style={[styles.root, { direction: rtl ? "rtl" : "ltr" }]}>
      {end ? (
        <View testID="cs-swipe-end" style={[styles.end, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: cfg.corner_radius }]}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.cardTitle, { color: theme.surfaceForeground }]}>
            {cfg.end.title || m.endTitle}
          </Text>
          {cfg.end.message ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 15 }}>
              {cfg.end.message}
            </Text>
          ) : null}
          {cfg.end.show_liked && deck.liked.length > 0 ? (
            <View accessibilityLabel={m.likedList}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "600", fontSize: 15 }}>
                {m.likedList}
              </Text>
              {deck.liked.map((c) => (
                <Text key={swipeKey(c.product)} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 15 }}>
                  {`• ${titleOf(c)}`}
                </Text>
              ))}
            </View>
          ) : null}
          {cfg.end.cta ? (
            <ActionButton
              theme={theme}
              testID="cs-swipe-cta"
              label={cfg.end.cta.label}
              role={cfg.end.cta.action.type === "url" ? "link" : "button"}
              onPress={() => {
                const elementId = cfg.end.cta!.element_id;
                emit({ type: "click", elementId });
                env.open(cfg.end.cta!.action, { widgetId: entry.id, itemId: "end", elementId });
              }}
            />
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.stage}>{Array.from({ length: depthMax }, (_, i) => depthMax - 1 - i).map((d) => renderCard(rem[d]!, d))}</View>
          {/* Siempre a la vista: el gesto no es el único camino. Posición física (izquierda = descartar) como el gesto. */}
          <View style={styles.actions}>
            <Pressable testID="cs-swipe-nope" accessibilityRole="button" accessibilityLabel={cfg.feedback.nope.label} onPress={() => decide("left", "button")} style={[styles.btn, { borderColor: nopeColor, backgroundColor: theme.surface }]}>
              <Text style={[styles.glyph, { color: nopeColor }]} {...HIDDEN_FROM_AT}>
                {GLYPH[cfg.feedback.nope.icon]}
              </Text>
            </Pressable>
            <Pressable testID="cs-swipe-like" accessibilityRole="button" accessibilityLabel={cfg.feedback.like.label} onPress={() => decide("right", "button")} style={[styles.btn, { borderColor: likeColor, backgroundColor: theme.surface }]}>
              <Text style={[styles.glyph, { color: likeColor }]} {...HIDDEN_FROM_AT}>
                {GLYPH[cfg.feedback.like.icon]}
              </Text>
            </Pressable>
          </View>
        </>
      )}
      <LiveRegion text={notice} testID="cs-swipe-live" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", gap: 16 },
  stage: { width: "100%", alignItems: "center" },
  card: { width: "100%", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, justifyContent: "flex-end" },
  top: {},
  behind: { position: "absolute", top: 0 },
  cardBody: { padding: 14, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  price: { fontSize: 16, fontWeight: "600" },
  badge: { alignSelf: "flex-start", fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  stamp: { position: "absolute", top: 18, borderWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  stampLike: { left: 16, transform: [{ rotate: "-12deg" }] },
  stampNope: { right: 16, transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 18, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "center", gap: 32, direction: "ltr" },
  btn: { width: MIN_TOUCH + 8, height: MIN_TOUCH + 8, borderRadius: (MIN_TOUCH + 8) / 2, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  glyph: { fontSize: 26, fontWeight: "700" },
  end: { padding: 20, gap: 10, borderWidth: StyleSheet.hairlineWidth },
});
