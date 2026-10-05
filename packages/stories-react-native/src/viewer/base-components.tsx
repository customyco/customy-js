import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { countdownParts, type ButtonComponent, type CountdownComponent, type PollComponent, type PromoCodeComponent } from "../core";
import type { StoryComponentProps } from "../component-api";
import { ActionButton, Card, Chip, MAX_FONT_SCALE, Question } from "../ui";
import { useViewerSelector } from "./use-viewer";

/** Los cuatro componentes de la Ola 1: botón / «desliza hacia arriba», encuesta, cuenta atrás y código. */

export function ButtonView({ comp, viewer, theme, m }: StoryComponentProps<ButtonComponent>) {
  if (comp.style === "swipe_up") {
    return (
      <ActionButton
        theme={theme}
        label={comp.label}
        hint={m.learnMore}
        role={comp.action.type === "url" ? "link" : "button"}
        filled={false}
        onPress={() => void viewer.activateButton(comp.id)}
        style={styles.swipe}
        textStyle={{ color: theme.viewerForeground }}
        testID={`cs-button-${comp.id}`}
      />
    );
  }
  return (
    <ActionButton theme={theme} label={comp.label} role={comp.action.type === "url" ? "link" : "button"} background={comp.background} color={comp.color} onPress={() => void viewer.activateButton(comp.id)} testID={`cs-button-${comp.id}`} />
  );
}

export function PollView({ comp, viewer, theme, m, say, answers }: StoryComponentProps<PollComponent>) {
  const qid = `cs-q-${comp.id}`;
  const mine = useViewerSelector(viewer, (s) => s.responses[comp.id]);
  const chosen = mine ?? answers()[comp.id];
  return (
    <Card theme={theme} testID={`cs-poll-${comp.id}`}>
      <Question theme={theme} id={qid}>
        {comp.question}
      </Question>
      {comp.options.map((o) => (
        <ActionButton
          key={o.id}
          theme={theme}
          label={o.label}
          filled={chosen === o.id}
          selected={chosen === o.id}
          disabled={chosen !== undefined}
          onPress={() => {
            if (viewer.answerPoll(comp.id, o.id)) say(m.pollThanks);
          }}
          testID={`cs-poll-${comp.id}-${o.id}`}
        />
      ))}
      {chosen !== undefined ? (
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.status, { color: theme.mutedForeground }]}>
          {m.pollThanks}
        </Text>
      ) : null}
    </Card>
  );
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function CountdownView({ comp, viewer, theme, m, clock, say, onReminder }: StoryComponentProps<CountdownComponent>) {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const t = setInterval(() => setNow(clock.now()), 1000);
    return () => clearInterval(t);
  }, [clock]);
  const reminded = useViewerSelector(viewer, (s) => s.responses[comp.id]) !== undefined;
  const p = countdownParts(comp.ends_at, now);
  const text = p.done ? m.countdownDone : `${p.days > 0 ? `${p.days}d ` : ""}${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  return (
    <View style={[styles.counter, { backgroundColor: theme.viewerScrim }]}>
      {comp.label ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.counterLabel, { color: theme.viewerForeground }]}>
          {comp.label}
        </Text>
      ) : null}
      {/* `timer` + sin región viva: un lector no debe leer cada segundo; se lee al enfocarlo. */}
      <Text accessibilityRole="timer" accessibilityLiveRegion="none" accessibilityLabel={[comp.label, text].filter(Boolean).join(" ")} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.counterTime, { color: theme.viewerForeground }]}>
        {text}
      </Text>
      {comp.reminder.enabled && !p.done ? (
        <Chip
          theme={theme}
          label={reminded ? m.reminderSet : (comp.reminder.label ?? m.reminderOn)}
          disabled={reminded}
          selected={reminded}
          textStyle={{ color: theme.viewerForeground }}
          onPress={() => {
            if (!viewer.optInReminder(comp.id)) return;
            onReminder?.(comp, new Date(Date.parse(comp.ends_at) - comp.reminder.offset_minutes * 60_000).toISOString());
            say(m.reminderSet);
          }}
        />
      ) : null}
    </View>
  );
}

export function PromoView({ comp, viewer, theme, m, say, copyText }: StoryComponentProps<PromoCodeComponent>) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <View accessible accessibilityLabel={comp.label ?? comp.code} style={[styles.promo, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text selectable maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.code, { color: theme.surfaceForeground }]}>
        {comp.code}
      </Text>
      <Chip
        theme={theme}
        label={copied ? m.copied : comp.copy_label || m.copy}
        onPress={() => {
          viewer.copyPromo(comp.id);
          const done = copyText
            ? Promise.resolve(copyText(comp.code)).then(() => true)
            : // Sin portapapeles inyectado: el menú de compartir del sistema también permite copiar.
              Share.share({ message: comp.code }).then(() => true);
          void done.then(
            () => {
              setCopied(true);
              say(m.copied);
            },
            () => undefined,
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  swipe: { alignSelf: "center", borderWidth: 0 },
  status: { fontSize: 14 },
  counter: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", gap: 6 },
  counterLabel: { fontSize: 14, fontWeight: "500" },
  counterTime: { fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  promo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  code: { fontSize: 20, fontWeight: "700", letterSpacing: 1, fontVariant: ["tabular-nums"] },
});
