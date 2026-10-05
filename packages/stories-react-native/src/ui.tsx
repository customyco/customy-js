import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityRole, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import type { StoriesTheme } from "./theme";

/** Alto táctil mínimo (HIG 44 pt, Material 48 dp): el mayor. */
export const MIN_TOUCH = 48;
/** El tamaño del sistema se respeta, con tope: un lienzo 9:16 no crece sin límite. */
export const MAX_FONT_SCALE = 1.3;
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;

export function Card({ theme, children, style, testID }: { theme: StoriesTheme; children?: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View testID={testID} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

export function Question({ theme, children, id }: { theme: StoriesTheme; children: string; id?: string }) {
  return (
    <Text nativeID={id} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.question, { color: theme.surfaceForeground }]}>
      {children}
    </Text>
  );
}

export type ActionButtonProps = {
  theme: StoriesTheme;
  label: string;
  /** Lo que lee el lector de pantalla si difiere del texto visible (p. ej. «Añadir al carrito: Gorra»). */
  a11yLabel?: string;
  onPress: () => void;
  role?: AccessibilityRole;
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
  background?: string;
  color?: string;
  /** `true` = relleno de acento; `false` = contorno. */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function ActionButton({ theme, label, a11yLabel, onPress, role = "button", hint, disabled, selected, background, color, filled = true, style, textStyle, testID }: ActionButtonProps) {
  const bg = filled ? (background ?? theme.accent) : undefined;
  const fg = color ?? (filled ? theme.accentForeground : theme.surfaceForeground);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole={role}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      style={({ pressed }) => [styles.button, filled ? { backgroundColor: bg } : { borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth * 2 }, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buttonText, { color: fg }, textStyle]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip(props: Omit<ActionButtonProps, "filled">) {
  return <ActionButton {...props} filled={false} style={[styles.chip, props.style]} textStyle={[styles.chipText, props.textStyle]} />;
}

export const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  question: { fontSize: 16, fontWeight: "600" },
  button: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  chip: { minHeight: 36, paddingHorizontal: 12 },
  chipText: { fontSize: 14, fontWeight: "500" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
});
