import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AccessibilityInfo, FlatList, Image, Pressable, StyleSheet, Text, View, findNodeHandle, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { groupAriaLabel, resolveMessages, type CloseReason, type CoverShape, type CoverSize, type Messages, type SeenStatus, type SeenTracker, type StoryBarStyle, type StoryGroup, type ViewerEvent } from "./core";
import { useStoriesContext } from "./context";
import { mediaUri } from "./media";
import { buildSequence, mergeBarStyle } from "./sequence";
import type { StoriesTheme } from "./theme";
import { MAX_FONT_SCALE } from "./ui";
import { StoryViewerView } from "./viewer";
import { HIDDEN_FROM_AT } from "./viewer/layers";

const SIZE: Record<CoverSize, number> = { small: 56, medium: 72, large: 84 };
const RING = 3;
const GAP = 3;

function shapeRadius(shape: CoverShape, size: number): { ring: number; cover: number; height: number } {
  switch (shape) {
    case "circle":
      return { ring: size, cover: size, height: size };
    case "square":
      return { ring: 4 + RING, cover: 4, height: size };
    case "rounded":
      return { ring: 18, cover: 15, height: size };
    case "portrait":
      return { ring: 14, cover: 11, height: Math.round(size * 1.45) };
  }
}

type ItemProps = {
  group: StoryGroup;
  status: SeenStatus;
  index: number;
  total: number;
  style: StoryBarStyle;
  theme: StoriesTheme;
  m: Messages;
  reducedMotion: boolean;
  coverUri: string;
  onPress: (g: StoryGroup) => void;
  register: (id: string, ref: View | null) => void;
};

const BarItem = memo(function BarItem({ group, status, index, total, style, theme, m, reducedMotion, coverUri, onPress, register }: ItemProps) {
  const size = SIZE[style.size];
  const shape = shapeRadius(style.cover_shape, size);
  const ringOn = style.ring.enabled;
  const unseenColor = style.ring.unseen_color ?? theme.ringUnseen;
  const seenColor = style.ring.seen_color ?? theme.ringSeen;
  const color = status === "seen" ? seenColor : unseenColor;
  const pad = ringOn ? RING : 0;
  const outerW = size + (ringOn ? (RING + GAP) * 2 : 0);
  const outerH = shape.height + (ringOn ? (RING + GAP) * 2 : 0);
  const pulse = style.variant === "energized" && status !== "seen" && !reducedMotion;
  const k = useSharedValue(1);
  useEffect(() => {
    if (!pulse) {
      k.value = 1;
      return;
    }
    // «Energizada»: el anillo no visto respira. Sin movimiento con «reducir movimiento».
    k.value = withRepeat(withSequence(withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1);
  }, [pulse, k]);
  const ringAnim = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));

  const ref = useRef<View>(null);
  useEffect(() => {
    register(group.id, ref.current);
    return () => register(group.id, null);
  }, [group.id, register]);

  const label = groupAriaLabel(group, status, { n: index + 1, total }, m);
  return (
    <Pressable
      ref={ref}
      testID={`cs-item-${group.id}`}
      onPress={() => onPress(group)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.item, { width: outerW + 8 }]}
    >
      <Animated.View
        style={[
          { width: outerW, height: outerH, alignItems: "center", justifyContent: "center", borderRadius: shape.ring + (ringOn ? RING + GAP : 0) },
          ringOn ? { borderWidth: pad, borderColor: color, borderRadius: shape.ring + RING + GAP } : null,
          ringAnim,
        ]}
        {...HIDDEN_FROM_AT}
      >
        <Image source={{ uri: coverUri }} style={{ width: size, height: shape.height, borderRadius: shape.cover, backgroundColor: theme.border }} resizeMode="cover" {...HIDDEN_FROM_AT} />
      </Animated.View>
      {style.pinned_first && group.pinned ? (
        <View style={[styles.pin, { backgroundColor: theme.surface, borderColor: theme.border }]} {...HIDDEN_FROM_AT}>
          <Text style={styles.pinGlyph}>📌</Text>
        </View>
      ) : null}
      {group.live && style.live_badge.enabled ? (
        <View style={[styles.live, { backgroundColor: theme.live, borderColor: theme.surface, bottom: style.show_title ? 22 : 2 }]} {...HIDDEN_FROM_AT}>
          <Text style={[styles.liveText, { color: theme.liveForeground }]}>{style.live_badge.label || m.live.toUpperCase()}</Text>
        </View>
      ) : null}
      {style.show_title ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground, maxWidth: outerW + 4 }]} {...HIDDEN_FROM_AT}>
          {group.title}
        </Text>
      ) : null}
      {group.sponsor ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.spons, { color: theme.mutedForeground, backgroundColor: theme.surface }]} {...HIDDEN_FROM_AT}>
          {group.sponsor.label}
        </Text>
      ) : null}
    </Pressable>
  );
});

export type StoryBarViewProps = {
  groups: readonly StoryGroup[];
  style?: Partial<StoryBarStyle>;
  seen?: SeenTracker;
  /** Id del placement, solo para `onWidgetReady`. */
  placementId?: string;
  /** Se pintó la lista (ya ordenada y sin control): sirve para registrar impresiones. */
  onRender?: (ordered: StoryGroup[]) => void;
  onOpen?: (group: StoryGroup) => void;
  /** Otra superficie manda (un overlay a la vez, pausa de superficie): devuelve `false` y no se abre. */
  canOpen?: () => boolean;
  viewer?: { onEvent?: (e: ViewerEvent) => void; onClose?: (reason: CloseReason) => void };
  /**
   * Oculta la lista pero mantiene el visor si está abierto: la pausa de superficie DIFIERE lo nuevo, no cierra lo que
   * la persona ya está viendo (el visor se pausa solo).
   */
  hidden?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Story Bar: `classic` o `energized`; portada círculo | cuadrado | redondeada | vertical; anillo visto/no visto;
 * orden (fijados y no vistos primero); «en vivo»; LTR/RTL; claro/oscuro por tokens. Cada grupo es un botón con la
 * etiqueta completa para VoiceOver/TalkBack (título, estado, fijada, en vivo, posición) y al cerrar el visor el
 * foco vuelve a su grupo.
 */
export function StoryBarView({ groups, style: styleIn, seen, placementId, onRender, onOpen, canOpen, viewer, hidden, containerStyle, testID }: StoryBarViewProps) {
  const ctx = useStoriesContext();
  const { theme, rtl, reducedMotion } = ctx;
  const m = useMemo(() => resolveMessages(ctx.locale, ctx.messages), [ctx.locale, ctx.messages]);
  const style = useMemo(() => mergeBarStyle(styleIn), [styleIn]);
  const tracker = seen ?? ctx.client?.seen;
  // Lo visto cambia el anillo al instante; el ORDEN solo se recalcula al cerrar el visor (no se mueve bajo el dedo).
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [orderEpoch, reorder] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let alive = true;
    void tracker?.ready.then(() => alive && reorder());
    const off = tracker?.subscribe(bump);
    return () => {
      alive = false;
      off?.();
    };
  }, [tracker]);

  // `orderEpoch` fuerza el recálculo del orden.
  const { ordered, sequence } = useMemo(() => buildSequence(groups, style, tracker), [groups, style, tracker, orderEpoch]);
  const [openId, setOpenId] = useState<string | null>(null);
  const refs = useRef(new Map<string, View>());
  const register = useCallback((id: string, ref: View | null) => void (ref ? refs.current.set(id, ref) : refs.current.delete(id)), []);

  const onRenderRef = useRef(onRender);
  onRenderRef.current = onRender;
  const { onWidgetReady } = ctx;
  useEffect(() => {
    if (ordered.length === 0) return;
    onRenderRef.current?.(ordered);
    onWidgetReady?.({ placementId, surface: "story" });
  }, [ordered, onWidgetReady, placementId]);

  const press = useCallback(
    (g: StoryGroup) => {
      if (openId || canOpen?.() === false) return;
      onOpen?.(g);
      setOpenId(g.id);
    },
    [openId, canOpen, onOpen],
  );

  const close = useCallback(
    (reason: CloseReason) => {
      const id = openId;
      setOpenId(null);
      reorder();
      viewer?.onClose?.(reason);
      // El foco vuelve al grupo que se abrió (lectores de pantalla).
      setTimeout(() => {
        const node = id ? refs.current.get(id) : undefined;
        const handle = node ? findNodeHandle(node) : null;
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }, 100);
    },
    [openId, viewer],
  );

  if (ordered.length === 0) return null;
  if (hidden && openId === null) return null;
  const itemWidth = SIZE[style.size] + (style.ring.enabled ? (RING + GAP) * 2 : 0) + 8;
  return (
    <View testID={testID ?? "cs-story-bar"} accessibilityRole="list" accessibilityLabel={m.storyBar} style={[{ direction: rtl ? "rtl" : "ltr" }, hidden ? { height: 0, overflow: "hidden" } : null, containerStyle]}>
      <FlatList
        horizontal
        data={ordered}
        keyExtractor={(g) => g.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        getItemLayout={(_, i) => ({ length: itemWidth, offset: itemWidth * i, index: i })}
        initialNumToRender={8}
        windowSize={5}
        extraData={`${style.variant}|${reducedMotion}`}
        renderItem={({ item, index }) => (
          <BarItem
            group={item}
            status={tracker?.status(item) ?? "unseen"}
            index={index}
            total={ordered.length}
            style={style}
            theme={theme}
            m={m}
            reducedMotion={reducedMotion}
            coverUri={mediaUri(ctx.mediaCache, item.cover.url, "image")}
            onPress={press}
            register={register}
          />
        )}
      />
      <StoryViewerView groups={sequence} open={openId !== null} startGroupId={openId ?? undefined} seen={tracker} onEvent={viewer?.onEvent} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 8, paddingVertical: 8 },
  item: { alignItems: "center", paddingHorizontal: 4 },
  title: { marginTop: 4, fontSize: 12, textAlign: "center" },
  pin: { position: "absolute", top: 0, right: 8, borderRadius: 999, borderWidth: 1, padding: 2 },
  pinGlyph: { fontSize: 9 },
  live: { position: "absolute", alignSelf: "center", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 2 },
  liveText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  spons: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, marginTop: 2, overflow: "hidden" },
});
