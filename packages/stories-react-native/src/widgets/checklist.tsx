import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createChecklist, nextOpen, type ChecklistController } from "@customyai/stories-render/widgets/checklist";
import type { DeliveredChecklist, WidgetProgress } from "../core";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { useAnchorRegistry, type AnchorRegistry } from "./anchors";
import { LiveRegion, useImpressionOnLayout, widgetElementId, widgetEmitter, type WidgetEvent } from "./common";
import { fmt, type WidgetMessages } from "./messages";
import { useWidgetEnv } from "./env";

export type ChecklistViewProps = {
  entry: DeliveredChecklist;
  /** Lo ya completado (servidor, almacén local): solo AÑADE; un ítem completado nunca se desmarca. */
  progress?: WidgetProgress;
  onEvent?: (e: WidgetEvent) => void;
  /** Para completar a mano (`complete(id, "manual")`) o consultar el avance desde fuera. */
  controllerRef?: MutableRefObject<ChecklistController | null>;
  /** De dónde llegan los avisos de la app (`notifyChecklistEvent`); por defecto el registro único de la app. */
  registry?: AnchorRegistry;
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/**
 * Checklist (`config.mode: "checklist"`): pasos de onboarding con progreso (barra, pasos o ninguno), orden opcional
 * («completa en orden»: el servidor también lo exige), descarte con confirmación y mensaje final. Un ítem se completa por
 * evento de la app (`notifyChecklistEvent("added_to_cart")`), por clic, a mano (`controllerRef`) o por condición: esa la
 * evalúa el SERVIDOR y llega en `progress` (el cliente no puede reclamarla). Toda la lógica es la de `createChecklist` del
 * renderer web. Accesible: cada ítem dice si está hecho, pendiente o bloqueado; el avance es un `progressbar`; el
 * resultado se anuncia en una región viva. Para el modo `tour`, ver `TourView`.
 */
export function ChecklistView({ entry, progress, onEvent, controllerRef, registry, messages, testID }: ChecklistViewProps) {
  const env = useWidgetEnv({ messages });
  const { theme, m, rtl, notice, say } = env;
  const cfg = entry.config;
  const reg = useAnchorRegistry();
  const bus = registry ?? reg;
  const emit = widgetEmitter(entry.id, entry.variant_id, onEvent);
  const latest = useRef(onEvent);
  latest.current = onEvent;
  const onLayout = useImpressionOnLayout(() => emit({ type: "impression" }));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [hidden, setHidden] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mRef = useRef(m);
  mRef.current = m;

  const ctl = useMemo(() => createChecklist({ entry, progress, onEvent: (e) => latest.current?.(e) }), [entry.id, entry.updated_at]);
  if (controllerRef) controllerRef.current = ctl;
  useEffect(() => {
    const off = ctl.subscribe(() => {
      rerender();
      const text = fmt(mRef.current.progressOf, { done: ctl.done, total: ctl.total });
      say(ctl.allDone ? `${text}. ${cfg.completion_message ?? mRef.current.allDone}` : text);
    });
    return off;
  }, [ctl, say, cfg.completion_message]);
  // El progreso del servidor llega después (otro dispositivo, una condición): se une, nunca se resta.
  useEffect(() => void ctl.sync(progress), [ctl, progress]);
  // Eventos de la app.
  useEffect(() => bus.onNotify((event) => void ctl.notify(event)), [bus, ctl]);

  const dismiss = useCallback(() => {
    emit({ type: "dismiss", reason: "user" });
    setHidden(true);
  }, [entry.id, entry.variant_id]);

  if (hidden) return null;
  const open = nextOpen(ctl.items, ctl.completed, cfg.ordered);
  const text = fmt(m.progressOf, { done: ctl.done, total: ctl.total });
  const pct = ctl.total ? (ctl.done / ctl.total) * 100 : 0;

  return (
    <View testID={testID ?? `cs-checklist-${entry.id}`} onLayout={onLayout} style={[styles.root, { direction: rtl ? "rtl" : "ltr", backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
            {cfg.title}
          </Text>
          {cfg.description ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
              {cfg.description}
            </Text>
          ) : null}
        </View>
        {cfg.dismissible ? (
          <Pressable testID="cs-check-dismiss" accessibilityRole="button" accessibilityLabel={m.dismiss} hitSlop={4} onPress={() => (cfg.dismiss_confirm ? setConfirming(true) : dismiss())} style={styles.dismiss}>
            <Text style={{ color: theme.mutedForeground, fontSize: 18, fontWeight: "700" }} {...HIDDEN_FROM_AT}>
              ✕
            </Text>
          </Pressable>
        ) : null}
      </View>

      {cfg.progress === "none" ? null : (
        <View testID="cs-check-progress" accessible accessibilityRole="progressbar" accessibilityLabel={m.checklist} accessibilityValue={{ min: 0, max: ctl.total, now: ctl.done, text }} style={styles.progress}>
          {cfg.progress === "bar" ? (
            <View style={[styles.track, { backgroundColor: theme.border }]}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
            </View>
          ) : (
            ctl.items.map((it) => <View key={it.id} style={[styles.step, { backgroundColor: ctl.isDone(it.id) ? theme.accent : theme.border }]} />)
          )}
        </View>
      )}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13 }} {...HIDDEN_FROM_AT}>
        {text}
      </Text>

      <View>
        {ctl.items.map((item) => {
          const done = ctl.isDone(item.id);
          const locked = !done && !open.includes(item.id);
          const elementId = widgetElementId(entry.id, item.id, item.element_id);
          return (
            <Pressable
              key={item.id}
              testID={`cs-check-item-${item.id}`}
              accessibilityRole={item.action?.type === "url" ? "link" : "button"}
              accessibilityLabel={fmt(done ? m.itemDone : locked ? m.itemLocked : m.itemOpen, { title: item.title })}
              accessibilityState={{ disabled: locked, checked: done }}
              onPress={() => {
                if (ctl.isLocked(item.id)) return;
                emit({ type: "click", elementId, itemId: item.id });
                ctl.activate(item.id);
                if (item.action) env.open(item.action, { widgetId: entry.id, itemId: item.id, elementId });
              }}
              style={[styles.item, locked && styles.locked]}
            >
              <View style={[styles.mark, { borderColor: done ? theme.accent : theme.border, backgroundColor: done ? theme.accent : "transparent" }]} {...HIDDEN_FROM_AT}>
                {done ? <Text style={{ color: theme.accentForeground, fontSize: 14, fontWeight: "800" }}>✓</Text> : null}
              </View>
              <View style={styles.itemText} {...HIDDEN_FROM_AT}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.itemTitle, { color: theme.surfaceForeground }, done && styles.struck]}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13 }}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {ctl.allDone ? (
        <Text testID="cs-check-done" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.done, { color: theme.surfaceForeground }]}>
          {cfg.completion_message ?? m.allDone}
        </Text>
      ) : null}

      {confirming ? (
        <View testID="cs-check-confirm" accessibilityRole="alert" accessibilityViewIsModal style={[styles.confirm, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.itemTitle, { color: theme.surfaceForeground }]}>
            {m.dismissTitle}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
            {m.dismissBody}
          </Text>
          <View style={styles.confirmRow}>
            <ActionButton theme={theme} filled={false} testID="cs-check-cancel" label={m.dismissCancel} onPress={() => setConfirming(false)} />
            <ActionButton theme={theme} testID="cs-check-ok" label={m.dismissConfirm} onPress={dismiss} />
          </View>
        </View>
      ) : null}
      <LiveRegion text={notice} testID="cs-check-live" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: "700" },
  dismiss: { minWidth: MIN_TOUCH - 8, minHeight: MIN_TOUCH - 8, alignItems: "center", justifyContent: "center" },
  progress: { flexDirection: "row", gap: 4, minHeight: 8, alignItems: "center" },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%" },
  step: { flex: 1, height: 6, borderRadius: 3 },
  item: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  locked: { opacity: 0.55 },
  mark: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16, fontWeight: "600" },
  struck: { textDecorationLine: "line-through" },
  done: { fontSize: 16, fontWeight: "700" },
  confirm: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  confirmRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
