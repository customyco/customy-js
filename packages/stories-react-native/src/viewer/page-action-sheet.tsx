import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Messages } from "../core";
import type { StoriesTheme } from "../theme";
import { ActionButton, MAX_FONT_SCALE } from "../ui";

/** Hoja modal de una acción por página (p. ej. reportar una historia de la comunidad). Modal para los lectores de pantalla. */
export function PageActionSheet({ title, theme, m, onClose, children }: { title: string; theme: StoriesTheme; m: Messages; onClose: () => void; children?: ReactNode }) {
  return (
    <View style={styles.root} accessibilityViewIsModal testID="cs-page-action-sheet">
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.viewerScrim }]} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel={title}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
            {title}
          </Text>
          {children}
        </ScrollView>
        <ActionButton theme={theme} label={m.close} onPress={onClose} testID="cs-page-action-close" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  panel: { maxHeight: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
});
