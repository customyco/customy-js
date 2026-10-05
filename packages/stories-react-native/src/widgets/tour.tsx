import { useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject } from "react";
import { AccessibilityInfo, BackHandler, Pressable, StyleSheet, Text, View, findNodeHandle, useWindowDimensions } from "react-native";
import { createTour, popoverPosition, type TourController } from "@customyai/stories-render/widgets/tour";
import { systemClock, type DeliveredChecklist, type TourPresentation, type TourStep } from "../core";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { useAnchorRegistry, useAnchorVersion, type AnchorRegistry, type Rect } from "./anchors";
import { LiveRegion, widgetEmitter, type WidgetEvent } from "./common";
import { fmt, type WidgetMessages } from "./messages";
import { useWidgetEnv } from "./env";

export type TourViewProps = {
  entry: DeliveredChecklist;
  onEvent?: (e: WidgetEvent) => void;
  controllerRef?: MutableRefObject<TourController | null>;
  registry?: AnchorRegistry;
  messages?: Partial<WidgetMessages>;
  /** Cada cuánto se vuelve a medir el ancla (ms): sigue al elemento si la pantalla se desplaza. Por defecto 400. */
  remeasureMs?: number;
  testID?: string;
};

const RING = 6;
const DOT = MIN_TOUCH;
const DEFAULT_POP = { width: 280, height: 150 };
const same = (a: Rect | null, b: Rect | null): boolean => (a === null || b === null ? a === b : a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/**
 * Tour (`config.mode: "tour"`): recorrido de 3 a 7 pasos con globo, hotspot o spotlight sobre elementos de la propia app,
 * anclados por NOMBRE (`<StoriesAnchor id>` / `useAnchor`, medidos con `measureInWindow`; nunca un selector). El globo se
 * coloca con `popoverPosition` (la misma función pura del renderer web, con RTL). Se omite SIEMPRE: botón «Omitir recorrido»,
 * botón atrás de Android y el gesto de escape de VoiceOver; no avanza solo (WCAG 2.2.2). No es modal: la app sigue usable
 * (un paso `next_on: "anchor_click"` avanza al tocar el ancla). Si el ancla no está, el paso se muestra centrado en vez de
 * perderse. Cada paso se anuncia y el foco de accesibilidad pasa a su título. Ponlo sobre la pantalla (hijo directo de su raíz).
 */
export function TourView({ entry, onEvent, controllerRef, registry, messages, remeasureMs = 400, testID }: TourViewProps) {
  const env = useWidgetEnv({ messages });
  const { ctx, theme, m, rtl, notice, say } = env;
  const clock = ctx.clock ?? systemClock;
  const fallback = useAnchorRegistry();
  const reg = registry ?? fallback;
  const win = useWindowDimensions();
  const emit = widgetEmitter(entry.id, entry.variant_id, onEvent);
  const latest = useRef(onEvent);
  latest.current = onEvent;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const ctl = useMemo(() => createTour({ entry, onEvent: (e) => latest.current?.(e) }), [entry.id, entry.updated_at]);
  if (controllerRef) controllerRef.current = ctl;

  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [pop, setPop] = useState(DEFAULT_POP);
  const [rect, setRect] = useState<Rect | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const root = useRef<View>(null);
  const title = useRef<Text>(null);

  useEffect(() => ctl.subscribe(rerender), [ctl]);
  useEffect(() => void emit({ type: "impression" }), [entry.id]);

  const step = ctl.step;
  const version = useAnchorVersion(reg);

  // «Omitir» con el botón atrás de Android (el Esc del navegador).
  useEffect(() => {
    if (ctl.finished) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      ctl.skip();
      return true;
    });
    return () => sub.remove();
  }, [ctl, step?.id]);

  // Origen del overlay en la ventana (las anclas se miden en coordenadas de ventana).
  const measureOrigin = (): void => root.current?.measureInWindow((x, y) => setOrigin((o) => (o.x === x && o.y === y ? o : { x, y })));

  // El ancla del paso: se mide al llegar, al cambiar la ventana o el registro, y se vuelve a medir por si la pantalla se mueve.
  useEffect(() => {
    if (!step) return;
    let alive = true;
    let timer: ReturnType<typeof clock.setTimeout> | null = null;
    const loop = (): void => {
      void reg.measure(step.anchor).then((r) => {
        if (!alive) return;
        setRect((prev) => (same(prev, r) ? prev : r));
        timer = clock.setTimeout(loop, remeasureMs);
      });
    };
    loop();
    return () => {
      alive = false;
      if (timer !== null) clock.clearTimeout(timer);
    };
  }, [reg, step?.id, step?.anchor, version, win.width, win.height, remeasureMs, clock]);

  // `next_on: "anchor_click"`: tocar el ancla avanza.
  useEffect(() => {
    if (!step || step.next_on !== "anchor_click") return;
    return reg.onTouched(step.anchor, () => ctl.next("anchor"));
  }, [reg, ctl, step?.id, step?.anchor, step?.next_on]);

  // Cada paso se anuncia y el foco va a su título (un hotspot espera a que se despliegue).
  const presentation = (s: TourStep): TourPresentation => s.presentation ?? entry.config.tour.presentation;
  const stepText = step ? fmt(m.stepOf, { n: ctl.index + 1, total: ctl.steps.length }) : "";
  useEffect(() => {
    if (!step) return;
    say(`${stepText}: ${step.title}`);
    if (presentation(step) !== "hotspot") {
      const handle = title.current ? findNodeHandle(title.current) : null;
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [step?.id]);

  if (!step || ctl.finished) return null;
  const pres = presentation(step);
  const last = ctl.index === ctl.steps.length - 1;
  const isRevealed = pres !== "hotspot" || revealed[step.id] === true;
  const view = { width: win.width, height: win.height };
  // Coordenadas locales al overlay.
  const local = rect ? { top: rect.y - origin.y, left: rect.x - origin.x, width: rect.width, height: rect.height } : null;
  const at = local ? popoverPosition(local, pop, view, step.placement, rtl) : { top: Math.max(8, (view.height - pop.height) / 2), left: Math.max(8, (view.width - pop.width) / 2), side: "center" as const };
  const hole = local ? { top: local.top - RING, left: local.left - RING, width: local.width + RING * 2, height: local.height + RING * 2 } : null;

  return (
    <View ref={root} testID={testID ?? `cs-tour-${entry.id}`} pointerEvents="box-none" onLayout={measureOrigin} style={[StyleSheet.absoluteFill, { direction: rtl ? "rtl" : "ltr" }]}>
      {hole && pres === "spotlight" ? (
        <View pointerEvents="none" testID="cs-tour-dim" style={StyleSheet.absoluteFill} {...HIDDEN_FROM_AT}>
          <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, hole.top), backgroundColor: theme.spotlightScrim }]} />
          <View style={[styles.dim, { top: hole.top + hole.height, left: 0, right: 0, bottom: 0, backgroundColor: theme.spotlightScrim }]} />
          <View style={[styles.dim, { top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height, backgroundColor: theme.spotlightScrim }]} />
          <View style={[styles.dim, { top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height, backgroundColor: theme.spotlightScrim }]} />
        </View>
      ) : null}
      {hole && pres !== "tooltip" ? <View pointerEvents="none" testID="cs-tour-ring" style={[styles.ring, hole, { borderColor: theme.tourHighlight }]} {...HIDDEN_FROM_AT} /> : null}
      {local && pres === "hotspot" && !isRevealed ? (
        <Pressable
          testID="cs-tour-dot"
          accessibilityRole="button"
          accessibilityLabel={fmt(m.showStep, { title: step.title })}
          onPress={() => setRevealed((r) => ({ ...r, [step.id]: true }))}
          style={[styles.dot, { top: local.top + local.height / 2 - DOT / 2, left: local.left + local.width / 2 - DOT / 2, backgroundColor: theme.tourHighlight }]}
        />
      ) : null}
      {isRevealed ? (
        <View
          testID="cs-tour-pop"
          accessibilityLabel={m.tour}
          onAccessibilityEscape={() => ctl.skip()}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) setPop((p) => (p.width === width && p.height === height ? p : { width, height }));
          }}
          style={[styles.pop, { top: at.top, left: at.left, maxWidth: Math.max(160, view.width - 16), backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 12 }}>
            {stepText}
          </Text>
          <Text ref={title} testID="cs-tour-title" accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
            {step.title}
          </Text>
          {step.body ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
              {step.body}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <ActionButton theme={theme} filled={false} testID="cs-tour-skip" label={m.skip} onPress={() => ctl.skip()} />
            {ctl.index > 0 ? <ActionButton theme={theme} filled={false} testID="cs-tour-back" label={m.back} onPress={() => ctl.prev()} /> : null}
            <ActionButton theme={theme} testID="cs-tour-next" label={last ? m.finish : m.next} onPress={() => ctl.next("button")} />
          </View>
        </View>
      ) : null}
      <LiveRegion text={notice} testID="cs-tour-live" />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute" },
  ring: { position: "absolute", borderWidth: 3, borderRadius: 12 },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, opacity: 0.9 },
  pop: { position: "absolute", minWidth: 200, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  title: { fontSize: 17, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 6 },
});
