/**
 * @customyai/stories-react-native/game — Game Center nativo: ruleta, rasca y gana, tarjeta de premio, memoria y «tres
 * iguales». Módulo OPCIONAL y aparte de `./widgets` (mecánicas, animaciones y textos pesan). El SERVIDOR decide siempre:
 * `play` devuelve el resultado ya registrado y lo que se anima es su presentación (`createGameController` +
 * `createGameApi` del renderer web, reutilizados). Un reintento con el mismo `attempt_id` devuelve el mismo resultado.
 *
 *   <StoriesGame placementId="home_game" apiOptions={{ token: () => subscriberToken() }} deviceId={installId} />
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { createGameApi, createGameController, type GameApi, type GameApiOptions, type GameController, type GamePlayResult } from "@customyai/stories-render/widgets/game";
import { systemClock, type GameConfig, type WidgetEvent } from "../core";
import { useStoriesContext } from "../context";
import type { UsePlacementOptions } from "../placement";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { joinEvents, useBoundWidget } from "../widgets/bound";
import { LiveRegion, useAnnouncer, useImpressionOnLayout, useWidgetLifecycle } from "../widgets/common";
import { fmt, resolveGameMessages, type GameMessages } from "./messages";
import { Match3Stage, MemoryStage, PrizeCardStage, ScratchStage, WheelDisc, WheelStage, wheelSize, type StageProps } from "./mechanics";
import { useSharedValue } from "react-native-reanimated";
import { useWindowDimensions } from "react-native";

export { createGameApi, createGameController, GameApiError, seededRandom, memoryBoard, match3Tiles, wheelAngle } from "@customyai/stories-render/widgets/game";
export type { GameApi, GameApiOptions, GameController, GameControllerOptions, GamePhase, GamePlayRequest, GamePlayResult, GameResultPrize, GameSnapshot, GameStateInfo, GameUiError } from "@customyai/stories-render/widgets/game";
export { resolveGameMessages, type GameMessages } from "./messages";

export type GameViewProps = {
  entry: { id: string; config: GameConfig; variant_id?: string };
  /** Habla con Send (`createGameApi`); el SDK no decide nada. */
  api: GameApi;
  /** Identificador de instalación de la app (el servidor guarda un hash para el tope por dispositivo). */
  deviceId?: string;
  country?: string;
  /** Versión del consentimiento que la app muestra (por defecto la de las bases, o `game-1`). */
  consentVersion?: string;
  /** `attempt_id` de cada jugada (idempotencia). Por defecto `crypto.randomUUID` o un id aleatorio. */
  newId?: () => string;
  onEvent?: (e: WidgetEvent) => void;
  /** Con el juego en un diálogo: el botón «Cerrar». */
  onClose?: () => void;
  /** Los textos de las fechas dependen del idioma. */
  formatDate?: (iso: string) => string;
  messages?: Partial<GameMessages>;
  testID?: string;
};

/**
 * Un juego: bases/edad/consentimiento como casillas reales (sin marcarlas no se envía nada), el botón «Jugar», la
 * mecánica y el resultado (premio, código copiable, puntos, fecha de validez). Accesibilidad nativa: cada mecánica tiene
 * su alternativa sin gesto, el resultado y los errores se anuncian (región viva + `announceForAccessibility`), todo ≥ 48 pt,
 * RTL; con «reducir movimiento» no hay animación y el resultado llega directo. Errores del servidor con texto propio
 * (`limit_reached`, `country_blocked`…) y la red caída se reintenta con el MISMO intento: no se pierde la jugada.
 */
export function GameView({ entry, api, deviceId, country, consentVersion, newId, onEvent, onClose, formatDate, messages, testID }: GameViewProps) {
  const ctx = useStoriesContext();
  const { theme, rtl, reducedMotion } = ctx;
  const clock = ctx.clock ?? systemClock;
  const cfg = entry.config;
  const m = useMemo(() => resolveGameMessages(ctx.locale, messages), [ctx.locale, messages]);
  const { notice, say } = useAnnouncer();
  const latest = useRef({ onEvent, m, say });
  latest.current = { onEvent, m, say };
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const win = useWindowDimensions();

  const ctl: GameController = useMemo(
    () =>
      createGameController({
        id: entry.id,
        variantId: entry.variant_id,
        config: cfg,
        api,
        onEvent: (e) => latest.current.onEvent?.(e),
        deviceId,
        country,
        consentVersion,
        newId,
        clock,
        reducedMotion,
        describe: (code, e) => (e && e.code === "network" ? latest.current.m.errNetwork : ((latest.current.m as unknown as Record<string, string>)[`err_${code}`] ?? latest.current.m.errGeneric)),
      }),
    // Un controlador por juego y por api: cambiar el proveedor de «reducir movimiento» a media jugada no la reinicia.
    [entry.id, entry.variant_id, api],
  );
  useEffect(() => {
    const off = ctl.subscribe(rerender);
    void ctl.load();
    return off;
  }, [ctl]);
  const onLayout = useImpressionOnLayout(() => latest.current.onEvent?.({ widgetId: entry.id, ...(entry.variant_id ? { variantId: entry.variant_id } : {}), type: "impression" }));

  // Temporizadores de las mecánicas, con el reloj del proveedor y cancelados al desmontar.
  const timers = useRef(new Set<unknown>());
  const later = useCallback(
    (fn: () => void, ms: number): void => {
      const h = clock.setTimeout(() => {
        timers.current.delete(h);
        fn();
      }, ms);
      timers.current.add(h);
    },
    [clock],
  );
  useEffect(
    () => () => {
      for (const h of timers.current) clock.clearTimeout(h as never);
      timers.current.clear();
    },
    [clock],
  );

  // «Saltar» / «Revelar premio»: lo que la mecánica en curso registró.
  const finish = useRef<(() => void) | null>(null);
  const registerFinish = useCallback((fn: () => void) => void (finish.current = fn), []);
  const s = ctl.snapshot();
  const date = formatDate ?? ((iso: string) => new Date(iso).toLocaleDateString(ctx.locale));

  // Avisos: lo que falta marcar, los errores y el resultado.
  const warn = s.missing ? { terms: m.needTerms, age: m.needAge, consent: m.needConsent }[s.missing] : (s.error?.message ?? "");
  const announced = useRef("");
  useEffect(() => {
    if (warn && s.phase !== "ready" && announced.current !== warn) say(warn);
    announced.current = warn;
  }, [warn, s.phase, say]);
  const r = s.result;
  const headline = r ? (r.outcome === "win" && r.prize ? (cfg.copy.win ?? fmt(m.won, { prize: r.prize.label })) : (cfg.copy.lose ?? m.lost)) : "";
  useEffect(() => {
    if (s.phase === "done" && r) say(r.prize?.code ? `${headline} ${m.codeLabel}: ${r.prize.code}` : headline);
  }, [s.phase, r?.play_id]);

  const copy = async (code: string): Promise<void> => {
    try {
      if (ctx.copyText) await ctx.copyText(code);
      else await Share.share({ message: code });
      say(m.copied);
    } catch {
      /* cancelado: no se informa un éxito falso */
    }
  };

  const stageProps = (): StageProps | null =>
    r ? { cfg, result: r, theme, m, reducedMotion, later, done: () => ctl.reveal(), registerFinish, say } : null;
  const sp = s.phase === "revealing" ? stageProps() : null;
  const Stage = { wheel: WheelStage, scratch: ScratchStage, prize_card: PrizeCardStage, memory: MemoryStage, match3: Match3Stage }[cfg.mechanic];
  const hint = { wheel: m.wheelHint, scratch: m.scratchHint, prize_card: m.flipHint, memory: m.memoryHint, match3: m.match3Hint }[cfg.mechanic];
  const idleRot = useSharedValue(0);

  const check = (key: "terms" | "age" | "consent", label: string, extra?: React.ReactNode) => (
    <View key={key} style={styles.rule}>
      <Pressable testID={`cs-game-check-${key}`} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: s[key] }} onPress={() => ctl.accept({ [key]: !s[key] })} style={styles.checkRow}>
        <View style={[styles.box, { borderColor: s[key] ? theme.accent : theme.border, backgroundColor: s[key] ? theme.accent : theme.surface }]} {...HIDDEN_FROM_AT}>
          {s[key] ? <Text style={{ color: theme.accentForeground, fontWeight: "800" }}>✓</Text> : null}
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.ruleText, { color: theme.surfaceForeground }]} {...HIDDEN_FROM_AT}>
          {label}
        </Text>
      </Pressable>
      {extra}
    </View>
  );

  const bits: string[] = [];
  if (s.playsRemaining !== null && s.phase !== "loading") bits.push(s.playsRemaining > 0 ? fmt(m.playsLeft, { n: s.playsRemaining }) : m.noPlaysLeft);
  if (s.nextPlayAt && (s.playsRemaining ?? 0) <= 0) bits.push(fmt(m.nextPlay, { date: date(s.nextPlayAt) }));
  const showAgain = s.phase === "done" && (s.playsRemaining ?? 0) > 0;
  const showPlay = s.phase === "ready" || s.phase === "playing";

  return (
    <View testID={testID ?? `cs-game-${entry.id}`} onLayout={onLayout} accessibilityLabel={cfg.title} style={[styles.root, { direction: rtl ? "rtl" : "ltr", backgroundColor: theme.surface, borderColor: theme.border }]}>
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
        {onClose ? (
          <Pressable testID="cs-game-close" accessibilityRole="button" accessibilityLabel={m.close} hitSlop={4} onPress={onClose} style={styles.close}>
            <Text style={{ color: theme.mutedForeground, fontSize: 20, fontWeight: "700" }} {...HIDDEN_FROM_AT}>
              ✕
            </Text>
          </Pressable>
        ) : null}
      </View>

      {s.phase === "ready" && (cfg.terms || cfg.min_age > 0 || cfg.identified) ? (
        <View style={styles.rules}>
          {cfg.terms
            ? [
                check(
                  "terms",
                  fmt(m.termsCheck, { version: cfg.terms.version }),
                  <Pressable key="link" testID="cs-game-terms" accessibilityRole="link" accessibilityLabel={m.termsLink} onPress={() => ctx.open({ type: "url", url: cfg.terms!.url }, { surface: "widget", widgetId: entry.id, elementId: "terms" })} style={styles.link}>
                    <Text style={{ color: theme.accent, textDecorationLine: "underline", fontSize: 14 }} {...HIDDEN_FROM_AT}>
                      {m.termsLink}
                    </Text>
                  </Pressable>,
                ),
                cfg.terms.summary ? (
                  <Text key="summary" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13 }}>
                    {cfg.terms.summary}
                  </Text>
                ) : null,
              ]
            : null}
          {cfg.min_age > 0 ? check("age", fmt(m.ageCheck, { age: cfg.min_age })) : null}
          {cfg.identified ? check("consent", m.consentCheck) : null}
        </View>
      ) : null}

      <View style={styles.stage} accessibilityLiveRegion="none">
        {s.phase === "loading" ? (
          <View style={styles.center} accessible accessibilityLabel={m.loading}>
            <ActivityIndicator color={theme.accent as string} />
            <Text style={{ color: theme.mutedForeground }}>{m.loading}</Text>
          </View>
        ) : s.phase === "revealing" && sp ? (
          <Stage key={r!.play_id} {...sp} />
        ) : s.phase === "done" ? null : (
          <View style={styles.center}>
            {cfg.mechanic === "wheel" ? <WheelDisc prizes={cfg.prizes} size={wheelSize(win.width)} rot={idleRot} theme={theme} /> : <Text style={styles.placeholder} {...HIDDEN_FROM_AT}>🎁</Text>}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.hint, { color: theme.mutedForeground }]}>
              {hint}
            </Text>
            {/* La lista de premios posibles, para quien no ve la ruleta. */}
            {cfg.prizes.length > 1 ? (
              <View accessible accessibilityLabel={`${m.prizes}: ${cfg.prizes.map((p) => p.label).join(", ")}`} style={styles.sr}>
                {cfg.prizes.map((p) => (
                  <Text key={p.id}>{p.label}</Text>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>

      {warn ? (
        <Text testID="cs-game-warn" accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.warn, { color: theme.negative }]}>
          {warn}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {showPlay ? <ActionButton theme={theme} testID="cs-game-play" disabled={s.phase === "playing"} label={s.phase === "playing" ? m.loading : cfg.cta_label || m.play} onPress={() => void ctl.play()} /> : null}
        {s.phase === "revealing" ? <ActionButton theme={theme} filled={false} testID="cs-game-skip" label={cfg.mechanic === "wheel" ? m.skip : m.reveal} onPress={() => (finish.current ?? (() => ctl.reveal()))()} /> : null}
        {s.phase === "error" ? <ActionButton theme={theme} filled={false} testID="cs-game-retry" label={m.retry} onPress={() => void ctl.retry()} /> : null}
        {showAgain ? <ActionButton theme={theme} filled={false} testID="cs-game-again" label={m.playAgain} onPress={() => ctl.again()} /> : null}
      </View>

      {s.phase === "done" && r ? <ResultBox r={r} headline={headline} m={m} theme={theme} date={date} onCopy={copy} /> : null}
      {bits.length ? (
        <Text testID="cs-game-info" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13, textAlign: "center" }}>
          {bits.join(" · ")}
        </Text>
      ) : null}
      <LiveRegion text={notice} testID="cs-game-live" />
    </View>
  );
}

function ResultBox({ r, headline, m, theme, date, onCopy }: { r: GamePlayResult; headline: string; m: GameMessages; theme: ReturnType<typeof useStoriesContext>["theme"]; date: (iso: string) => string; onCopy: (code: string) => Promise<void> }) {
  const prize = r.prize;
  return (
    <View testID="cs-game-result" accessible={false} style={[styles.result, { borderColor: r.outcome === "win" ? theme.positive : theme.border }]}>
      <Text testID="cs-game-headline" accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.headline, { color: theme.surfaceForeground }]}>
        {headline}
      </Text>
      {prize?.points ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 16 }}>
          {fmt(m.points, { n: prize.points })}
        </Text>
      ) : null}
      {prize?.code ? (
        <>
          <Text testID="cs-game-code" accessible accessibilityLabel={`${m.codeLabel}: ${prize.code}`} selectable maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.code, { color: theme.surfaceForeground, borderColor: theme.border }]}>
            {prize.code}
          </Text>
          <ActionButton theme={theme} filled={false} testID="cs-game-copy" label={m.copy} onPress={() => void onCopy(prize.code!)} />
          {prize.valid_until ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13 }}>
              {fmt(m.validUntil, { date: date(prize.valid_until) })}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ─── Un juego referenciado desde una página (componente `game`): en un diálogo ───

export type GameDialogProps = Omit<GameViewProps, "entry" | "onClose"> & {
  gameId: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Diálogo (`Modal`) con el juego `gameId`: pide su estado a Send (que trae la configuración pública), lo monta y cierra con
 * el botón, el atrás de Android o el gesto de escape. Es lo que la app abre desde `openGame` del `StoriesProvider`.
 * Si no se puede cargar, lo dice (`err_game_not_found`). OJO: un `Modal` dentro de otro `Modal` (el visor de historias
 * abierto) no está probado en dispositivo; lo seguro es cerrar el visor y abrir el juego después.
 */
export function GameDialog({ gameId, open, onClose, api, messages, ...rest }: GameDialogProps) {
  const ctx = useStoriesContext();
  const m = useMemo(() => resolveGameMessages(ctx.locale, messages), [ctx.locale, messages]);
  const [config, setConfig] = useState<GameConfig | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setConfig(undefined);
    api.state().then(
      (s) => alive && setConfig(s.config ?? null),
      () => alive && setConfig(null),
    );
    return () => {
      alive = false;
    };
  }, [open, api, gameId]);
  if (!open) return null;
  return (
    <Modal visible transparent animationType={ctx.reducedMotion ? "none" : "fade"} statusBarTranslucent onRequestClose={onClose}>
      <View testID="cs-game-dialog" accessibilityViewIsModal onAccessibilityEscape={onClose} style={[styles.dialog, { backgroundColor: ctx.theme.viewerScrim }]}>
        <ScrollView contentContainerStyle={styles.dialogBody}>
          {config === undefined ? (
            <ActivityIndicator accessibilityLabel={m.loading} color={ctx.theme.viewerForeground as string} />
          ) : config === null ? (
            <View style={[styles.root, { backgroundColor: ctx.theme.surface, borderColor: ctx.theme.border }]}>
              <Text accessibilityRole="alert" style={{ color: ctx.theme.surfaceForeground, fontSize: 16 }}>
                {m.err_game_not_found}
              </Text>
              <ActionButton theme={ctx.theme} testID="cs-game-dialog-close" label={m.close} onPress={onClose} />
            </View>
          ) : (
            <GameView {...rest} api={api} messages={messages} entry={{ id: gameId, config }} onClose={onClose} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Ligado al placement ────────────────────────────────────────────────────

export type StoriesGameProps = UsePlacementOptions &
  Pick<GameViewProps, "deviceId" | "country" | "consentVersion" | "newId" | "formatDate" | "messages" | "testID"> & {
    placementId: string;
    /** El cliente de Send de ESE juego (`createGameApi`)… */
    api?: (gameId: string) => GameApi;
    /** …o sus opciones (token de suscriptor, URL base): el SDK crea el cliente con el id del juego entregado. */
    apiOptions?: Omit<GameApiOptions, "gameId">;
    onEvent?: (e: WidgetEvent) => void;
  };

/** El juego de un placement (kill, `min_sdk`, frecuencia, control y pausa de superficie `widget` los resuelve el cliente). La impresión se registra al pintarse. */
export function StoriesGame({ placementId, api, apiOptions, onEvent, ...rest }: StoriesGameProps) {
  const ctx = useStoriesContext();
  const { deviceId, country, consentVersion, newId, formatDate, messages, testID, ...query } = rest;
  const { entry, bound } = useBoundWidget("game", placementId, query);
  useWidgetLifecycle(placementId, !!entry);
  const id = entry?.id;
  const client = useMemo(() => {
    if (!id) return null;
    if (api) return api(id);
    if (apiOptions) return createGameApi({ platform: Platform.OS === "ios" ? "ios" : "android", locale: ctx.locale, ...apiOptions, gameId: id });
    return null;
    // El cliente de un juego se crea una vez por id entregado.
  }, [id, api, apiOptions, ctx.locale]);
  if (!entry || !bound || !client) return null;
  return <GameView key={entry.id} entry={entry} api={client} deviceId={deviceId} country={country} consentVersion={consentVersion} newId={newId} formatDate={formatDate} messages={messages} testID={testID} onEvent={joinEvents(bound, onEvent)} />;
}

const styles = StyleSheet.create({
  root: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 20, fontWeight: "800" },
  close: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  rules: { gap: 6 },
  rule: { gap: 2 },
  checkRow: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: 10 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  ruleText: { flex: 1, fontSize: 14 },
  link: { minHeight: MIN_TOUCH - 8, justifyContent: "center", paddingStart: 34 },
  stage: { minHeight: 120, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", gap: 10 },
  placeholder: { fontSize: 56 },
  hint: { fontSize: 13, textAlign: "center" },
  sr: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  warn: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  actions: { alignItems: "center", gap: 8 },
  result: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 8, alignItems: "center" },
  headline: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  code: { fontSize: 22, fontWeight: "700", letterSpacing: 2, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  dialog: { flex: 1, justifyContent: "center" },
  dialogBody: { padding: 16, flexGrow: 1, justifyContent: "center" },
});
