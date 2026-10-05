import { memo, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { fmt, type Messages, type StoryGroup } from "../core";
import type { StoriesTheme } from "../theme";
import { MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "./layers";

/** Iconos dibujados con vistas: el paquete no depende de ninguna librería de iconos ni de SVG. */
export type IconName = "pause" | "play" | "close" | "chevron-prev" | "chevron-next";

export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  const bar = { backgroundColor: color, borderRadius: size / 10 };
  switch (name) {
    case "pause":
      return (
        <View style={[styles.row, { width: size, height: size, gap: size / 4 }]} {...HIDDEN_FROM_AT}>
          <View style={[bar, { width: size / 3, height: size }]} />
          <View style={[bar, { width: size / 3, height: size }]} />
        </View>
      );
    case "play":
      return <View {...HIDDEN_FROM_AT} style={{ width: 0, height: 0, borderTopWidth: size / 2, borderBottomWidth: size / 2, borderLeftWidth: size * 0.85, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: color }} />;
    case "close":
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} {...HIDDEN_FROM_AT}>
          <View style={[bar, styles.cross, { width: size * 1.2, height: size / 8, transform: [{ rotate: "45deg" }] }]} />
          <View style={[bar, styles.cross, { width: size * 1.2, height: size / 8, transform: [{ rotate: "-45deg" }] }]} />
        </View>
      );
    case "chevron-prev":
    case "chevron-next":
      return (
        <View
          {...HIDDEN_FROM_AT}
          style={{ width: size * 0.6, height: size * 0.6, borderTopWidth: size / 8, borderLeftWidth: size / 8, borderColor: color, transform: [{ rotate: name === "chevron-prev" ? "-45deg" : "135deg" }] }}
        />
      );
  }
}

export function ChromeButton({ label, onPress, children, selected, testID }: { label: string; onPress: () => void; children: ReactNode; selected?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }} hitSlop={4} style={styles.button}>
      {children}
    </Pressable>
  );
}

function Segment({ state, progress, theme }: { state: "past" | "current" | "future"; progress: SharedValue<number>; theme: StoriesTheme }) {
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(progress.value * 1000) / 10}%` }));
  return (
    <View style={[styles.segment, { backgroundColor: theme.progressTrack }]}>
      {state === "current" ? <Animated.View style={[styles.fill, { backgroundColor: theme.progressFill }, fillStyle]} /> : state === "past" ? <View style={[styles.fill, { width: "100%", backgroundColor: theme.progressFill }]} /> : null}
    </View>
  );
}

/** Barra de progreso de la página: una pista por página VISIBLE (la ramificación puede quitar o añadir). */
export const ProgressBar = memo(function ProgressBar({ count, index, progress, theme, m }: { count: number; index: number; progress: SharedValue<number>; theme: StoriesTheme; m: Messages }) {
  return (
    <View
      testID="cs-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={m.progress}
      accessibilityValue={{ min: 1, max: Math.max(1, count), now: index + 1, text: fmt(m.pageOf, { n: index + 1, total: count }) }}
      style={styles.progress}
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment key={i} state={i < index ? "past" : i === index ? "current" : "future"} progress={progress} theme={theme} />
      ))}
    </View>
  );
});

export function GroupBadge({ group, theme, sponsorLabel }: { group: Pick<StoryGroup, "title" | "cover">; theme: StoriesTheme; sponsorLabel?: string }) {
  return (
    <View style={styles.who} accessible accessibilityRole="header" accessibilityLabel={[group.title, sponsorLabel].filter(Boolean).join(", ")}>
      <Image source={{ uri: group.cover.url }} style={[styles.avatar, { backgroundColor: theme.viewerScrim }]} {...HIDDEN_FROM_AT} />
      <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.viewerForeground, textShadowColor: theme.viewerScrim as string }]}>
        {group.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  cross: { position: "absolute" },
  button: { minWidth: MIN_TOUCH - 4, minHeight: MIN_TOUCH - 4, alignItems: "center", justifyContent: "center" },
  progress: { flexDirection: "row", gap: 4, height: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden", alignSelf: "center" },
  fill: { height: "100%" },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  title: { flexShrink: 1, fontSize: 14, fontWeight: "600", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
});
