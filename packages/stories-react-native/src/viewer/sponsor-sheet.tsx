import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Messages, StorySponsor } from "../core";
import type { StoriesTheme } from "../theme";
import { ActionButton, MAX_FONT_SCALE } from "../ui";

/** Hoja de transparencia de «Patrocinado»: quién anuncia, quién paga y por qué se ve. Modal para los lectores de pantalla. */
export function SponsorSheet({ sponsor, theme, m, onClose, onOpenUrl }: { sponsor: StorySponsor; theme: StoriesTheme; m: Messages; onClose: () => void; onOpenUrl: (url: string) => void }) {
  const t = sponsor.transparency;
  const rows = ([[m.advertiser, t.advertiser ?? sponsor.name], [m.payer, t.payer]] as const).filter((r): r is readonly [string, string] => !!r[1]);
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.viewerScrim }]} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel={m.sponsorSheet}>
        <ScrollView>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
            {m.sponsorSheet}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.text, { color: theme.surfaceForeground }]}>
            {t.text}
          </Text>
          {rows.map(([k, v]) => (
            <Text key={k} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.text, { color: theme.mutedForeground }]}>
              <Text style={styles.bold}>{`${k}: `}</Text>
              {v}
            </Text>
          ))}
        </ScrollView>
        {t.url ? <ActionButton theme={theme} filled={false} role="link" label={m.learnMore} onPress={() => onOpenUrl(t.url!)} /> : null}
        <ActionButton theme={theme} label={m.close} onPress={onClose} testID="cs-sheet-close" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  panel: { maxHeight: "70%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  text: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  bold: { fontWeight: "700" },
});
