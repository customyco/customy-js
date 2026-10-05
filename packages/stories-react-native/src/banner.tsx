import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn } from "react-native-reanimated";
import { createBannerController, fmt, type BannerAspect, type BannerController, type BannerEvent, type DeliveredBanner, type DismissReason } from "./core";
import { useStoriesContext } from "./context";
import { useAppActive } from "./hooks";
import { mediaUri } from "./media";
import { Icon, ChromeButton } from "./viewer/chrome";
import { HIDDEN_FROM_AT } from "./viewer/layers";
import { MAX_FONT_SCALE } from "./ui";

const RATIO: Record<BannerAspect, number> = { "4:3": 4 / 3, "16:9": 16 / 9, "1:1": 1, "2:1": 2 };

export type BannerViewProps = {
  banner: DeliveredBanner;
  placementId?: string;
  onEvent?: (e: BannerEvent) => void;
  onDismiss?: (reason: DismissReason) => void;
  /** Un banner del placement puede esconderse desde fuera (p. ej. tras `logClick`). */
  controllerRef?: { current: BannerController | null };
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Banner o carrusel: `4:3 | 16:9 | 1:1 | 2:1`; barra o puntos; autoplay SIEMPRE pausable con un botón visible
 * (WCAG 2.2.2) y en pausa con «reducir movimiento»; descartable; sin autocierre salvo `auto_close_ms` (WCAG 2.2.1);
 * swipe y botones para cambiar de imagen. Los lectores de pantalla lo recorren con «incrementar/decrementar».
 */
export function BannerView({ banner, placementId, onEvent, onDismiss, controllerRef, containerStyle, testID }: BannerViewProps) {
  const ctx = useStoriesContext();
  const { theme, rtl } = ctx;
  const latest = useRef({ onEvent, onDismiss });
  latest.current = { onEvent, onDismiss };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [controller] = useState<BannerController>(() =>
    createBannerController({
      banner,
      clock: ctx.clock,
      reducedMotion: ctx.reducedMotion,
      locale: ctx.locale,
      messages: ctx.messages,
      onEvent: (e) => {
        latest.current.onEvent?.(e);
        if (e.type === "dismiss") latest.current.onDismiss?.(e.reason);
      },
      openLink: (action, c) => ctxRef.current.open(action, { surface: "banner", bannerId: c.bannerId, slideId: c.slideId, elementId: c.elementId }),
    }),
  );
  if (controllerRef) controllerRef.current = controller;
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const m = controller.messages;

  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    controller.show();
    ctxRef.current.onWidgetReady?.({ placementId, surface: "banner" });
    ctxRef.current.onVisibilityChange?.({ surface: "banner", visible: true });
    return () => {
      alive.current = false;
      // StrictMode desmonta y remonta en el mismo commit: solo se destruye si no volvió.
      void Promise.resolve().then(() => {
        if (alive.current) return;
        controller.destroy();
        ctxRef.current.onVisibilityChange?.({ surface: "banner", visible: false });
      });
    };
  }, [controller, placementId]);

  useAppActive((active) => (active ? controller.resume("hidden") : controller.pause("hidden")));
  const surfaces = ctx.client?.surfaces;
  useEffect(() => {
    if (!surfaces) return;
    const sync = (): void => (surfaces.isPaused("banner") ? controller.pause("surface") : controller.resume("surface"));
    sync();
    return surfaces.subscribe(sync);
  }, [surfaces, controller]);

  const swipe = useCallback(
    (dx: number) => {
      if (Math.abs(dx) < 40) return;
      // Dedo hacia la izquierda = siguiente en LTR; en RTL, al revés.
      if (dx < 0 !== rtl) controller.next("swipe");
      else controller.prev("swipe");
    },
    [controller, rtl],
  );
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .onEnd((e) => swipe(e.translationX)),
    [swipe],
  );

  if (state.dismissed || !state.slide) return null;
  const { slide } = state;
  const style = banner.style;
  const multiple = state.slides > 1;
  const canAutoplay = style.autoplay.enabled && style.carousel && multiple;
  const label = [slide.image.alt, slide.title].filter(Boolean).join(". ");

  return (
    <View testID={testID ?? "cs-banner"} accessible={false} accessibilityLabel={m.banner} style={[{ direction: rtl ? "rtl" : "ltr" }, containerStyle]}>
      <GestureDetector gesture={pan}>
        <View style={[styles.frame, { aspectRatio: RATIO[style.aspect], borderRadius: style.corner_radius, backgroundColor: theme.surface }]}>
          <Animated.View key={slide.id} entering={ctx.reducedMotion ? undefined : FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
            <Pressable
              testID="cs-banner-slide"
              onPress={() => controller.activate()}
              accessibilityRole={slide.action ? (slide.action.type === "url" ? "link" : "button") : "image"}
              accessibilityLabel={multiple ? `${label}. ${fmt(m.slideOf, { n: state.index + 1, total: state.slides })}` : label}
              accessibilityActions={multiple ? [{ name: "increment", label: m.next }, { name: "decrement", label: m.previous }] : undefined}
              onAccessibilityAction={(e) => (e.nativeEvent.actionName === "increment" ? controller.next("keyboard") : controller.prev("keyboard"))}
              style={StyleSheet.absoluteFill}
            >
              <Image source={{ uri: mediaUri(ctx.mediaCache, slide.image.url, "image") }} resizeMode="cover" style={StyleSheet.absoluteFill} {...HIDDEN_FROM_AT} />
              {slide.title ? (
                <View style={[styles.caption, { backgroundColor: theme.viewerScrim }]} {...HIDDEN_FROM_AT}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={{ color: theme.viewerForeground, fontSize: 15, fontWeight: "600" }}>
                    {slide.title}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>

          {style.dismissible ? (
            <View style={[styles.corner, rtl ? styles.left : styles.right, { backgroundColor: theme.viewerScrim }]}>
              <ChromeButton testID="cs-banner-dismiss" label={m.dismiss} onPress={() => controller.dismiss("user")}>
                <Icon name="close" size={14} color={theme.viewerForeground as string} />
              </ChromeButton>
            </View>
          ) : null}

          {canAutoplay ? (
            <View style={[styles.corner, styles.bottom, rtl ? styles.right : styles.left, { backgroundColor: theme.viewerScrim }]}>
              <ChromeButton testID="cs-banner-autoplay" label={state.autoplaying ? m.pauseAutoplay : m.playAutoplay} selected={!state.autoplaying} onPress={() => controller.toggleAutoplay()}>
                <Icon name={state.autoplaying ? "pause" : "play"} size={14} color={theme.viewerForeground as string} />
              </ChromeButton>
            </View>
          ) : null}

          {multiple && style.progress !== "none" ? (
            <View pointerEvents="box-none" style={styles.indicators}>
              {Array.from({ length: state.slides }, (_, i) =>
                style.progress === "dots" ? (
                  <Pressable key={i} testID={`cs-banner-dot-${i}`} onPress={() => controller.goTo(i)} accessibilityRole="button" accessibilityLabel={fmt(m.goToSlide, { n: i + 1 })} accessibilityState={{ selected: i === state.index }} hitSlop={8} style={[styles.dot, { backgroundColor: i === state.index ? theme.progressFill : theme.progressTrack }]} />
                ) : (
                  <View key={i} {...HIDDEN_FROM_AT} style={[styles.seg, { backgroundColor: i <= state.index ? theme.progressFill : theme.progressTrack }]} />
                ),
              )}
            </View>
          ) : null}
          <Text testID="cs-banner-live" accessibilityLiveRegion="polite" style={styles.live}>
            {state.announcement}
          </Text>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", overflow: "hidden" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 22 },
  corner: { position: "absolute", top: 8, borderRadius: 999, overflow: "hidden" },
  right: { right: 8 },
  left: { left: 8 },
  bottom: { top: undefined, bottom: 8 },
  indicators: { position: "absolute", left: 0, right: 0, bottom: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  seg: { width: 22, height: 3, borderRadius: 2 },
  live: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
});
