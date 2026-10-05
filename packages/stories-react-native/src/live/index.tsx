/**
 * @customyai/stories-react-native/live — transmisión en vivo (Live, Ola 4) en nativo. Módulo OPCIONAL: el núcleo no lo paga y NO
 * depende de ningún cliente de LiveKit. La app inyecta el transporte (`openTransport`): `@customyai/stories-react-native/live-livekit`
 * trae el de `@livekit/react-native`, y solo se crea al pulsar «Ver en vivo». Reutiliza el cliente de `/client/live/*`, la máquina de
 * estados y los textos del renderer web (`@customyai/stories-render/widgets/live`): la misma semántica (token de espectador de 5 min por
 * Send, reconexión con espera creciente y token nuevo, caída a repetición, latido de visionado, sondeo, comercio con el mismo contexto).
 *
 *   const live = createLiveClient({ token: () => subscriberToken() });
 *   <LiveView live={group.live_session!} groupId={group.id} client={live} openTransport={() => createLiveKitTransport({ livekit, reactNative })} />
 *
 * Sin interfaz propia: `useLive(options)` (modo headless). Chat y reacciones apagados salvo que el live los traiga; con `isMinor` nunca.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LIVE_REACTIONS, LIVE_REPORT_REASONS, fmt, liveErrorText, resolveLiveMessages, startsText, type LiveMarker, type LiveMessages, type LiveProductEvent, type LiveReaction, type LiveReportReason, type LiveState } from "@customyai/stories-render/widgets/live";
import type { ProductRef, StoryCommerceContext } from "../core";
import { useStoriesContext } from "../context";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { LiveRegion, useAnnouncer } from "../widgets/common";
import { useLive, type LiveHandle, type UseLiveOptions } from "./use-live";

export { createLiveClient, createLiveCore, LiveError, LIVE_REACTIONS, LIVE_REPORT_REASONS, liveCommerceContext, liveComponentId, liveErrorText, resolveLiveMessages, startsText } from "@customyai/stories-render/widgets/live";
export type { LiveClient, LiveClientOptions, LiveCoreOptions, LiveChatMessage, LiveErrorCode, LiveJoin, LiveMarker, LiveMessages, LiveProductEvent, LiveReaction, LiveReportReason, LiveState, LiveStateSnapshot, LiveTransport, LiveTransportHandlers } from "@customyai/stories-render/widgets/live";
export { useLive, type LiveHandle, type NativeLiveTransport, type UseLiveOptions } from "./use-live";

export type LiveProductInfo = { title: string; price?: string; image?: string };

export type LiveViewProps = Omit<UseLiveOptions, "onProduct" | "surfaces"> & {
  /** Nombre, precio y foto de un producto (los resuelve la app contra Commerce); sin esto se muestra su id. */
  productInfo?: (ref: ProductRef) => LiveProductInfo | null;
  /** El evento de comercio con su contexto (además de `onAddToCart`/`onWishlist` del proveedor). */
  onProduct?: (e: LiveProductEvent) => void;
  messages?: Partial<LiveMessages>;
  testID?: string;
};

const REACTION_GLYPH: Record<LiveReaction, string> = { heart: "❤", fire: "🔥", clap: "👏", laugh: "😂", wow: "😮" };
const PLAYING_LIKE: LiveState[] = ["playing", "paused", "waiting_host", "reconnecting"];

/** El contexto de comercio como lo entiende el proveedor (`onAddToCart(ref, qty, context)`). */
const toCommerce = (e: LiveProductEvent): StoryCommerceContext => ({ storyId: e.context.storyId, componentId: e.context.componentId });

/**
 * El Live pintado: insignia, escenario, estado en palabras (región viva + anuncio a VoiceOver/TalkBack), pausa SIEMPRE visible
 * (WCAG 2.2.2), silencio, subtítulos si la sala los publica, productos destacados, chat con moderación (reportar, bloquear, borrar el
 * propio) y reacciones. Programado: cuenta atrás sin conectarse a nada. Repetición: el reproductor del proveedor (`video`) o el póster.
 */
export function LiveView({ productInfo, onProduct, messages, testID = "cs-live", ...options }: LiveViewProps) {
  const ctx = useStoriesContext();
  const { theme, rtl, reducedMotion } = ctx;
  const m = useMemo(() => resolveLiveMessages(ctx.locale, messages), [ctx.locale, messages]);
  const { notice, say } = useAnnouncer();
  const latest = useRef({ ctx, onProduct });
  latest.current = { ctx, onProduct };
  const h = useLive({
    ...options,
    clock: options.clock ?? ctx.clock,
    surfaces: ctx.client?.surfaces,
    onProduct: (e) => {
      const c = latest.current;
      if (e.name === "add_to_cart") c.ctx.onAddToCart?.(e.product, e.quantity ?? 1, toCommerce(e));
      else if (e.name === "wishlist_added") c.ctx.onWishlist?.(e.product, toCommerce(e));
      c.onProduct?.(e);
    },
  });
  const { state } = h;
  const live = options.live;

  // Estado en palabras: lo que oye quien usa lector de pantalla («en vivo», «terminó»…).
  const statusText = (s: LiveState): string =>
    s === "connecting" ? m.connecting
    : s === "waiting_host" ? m.waitingHost
    : s === "reconnecting" ? m.reconnecting
    : s === "paused" ? m.paused
    : s === "ended" ? m.ended
    : s === "replay" ? m.endedReplay
    : s === "full" ? m.full
    : s === "unavailable" ? m.unavailable
    : s === "error" ? liveErrorText(h.error, m)
    : s === "needs_notice" ? m.noticeCheck
    : "";
  const spoken = useRef("");
  useEffect(() => {
    const text = state === "playing" ? m.liveBadge : statusText(state);
    if (text && spoken.current !== text) say(text);
    spoken.current = text;
  }, [state, h.error]);

  const badgeKind = state === "ended" || state === "unavailable" ? "ended" : state === "replay" || live.state === "replay" ? "replay" : live.state === "scheduled" && state === "idle" ? "soon" : "live";
  const badgeText = badgeKind === "replay" ? m.replayBadge : badgeKind === "soon" ? m.soonBadge : badgeKind === "ended" ? m.ended : m.liveBadge;
  const badgeBg = badgeKind === "live" ? theme.live : theme.mutedForeground;

  const header = (
    <View style={[styles.head, rtl && styles.rtlRow]}>
      <View testID={`${testID}-badge`} accessible accessibilityLabel={badgeText} style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.badgeText, { color: theme.liveForeground }]}>
          {badgeText}
        </Text>
      </View>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
        {live.title}
      </Text>
    </View>
  );
  const region = { accessibilityLabel: fmt(m.region, { title: live.title }) };

  // ── Repetición ──
  if (live.state === "replay" && live.replay) return <ReplayBlock testID={testID} header={header} live={live} m={m} notice={notice} />;
  // ── Aún no empieza ──
  if (live.state === "scheduled") return <ScheduledBlock testID={testID} header={header} live={live} m={m} notice={notice} />;

  const playingLike = PLAYING_LIKE.includes(state);
  const wait = state === "idle" || state === "needs_notice";
  const showStatus = statusText(state);
  const needsNotice = !!live.notice;

  return (
    <View testID={testID} {...region} style={[styles.root, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {header}
      <View testID={`${testID}-stage`} style={[styles.stage, { backgroundColor: theme.viewerBackground }]}>
        {playingLike ? h.renderVideo() : null}
        {playingLike && h.captions && h.captionsVisible ? (
          <Text testID={`${testID}-captions`} accessibilityLabel={m.captionsRegion} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.captions, { color: theme.viewerForeground, backgroundColor: theme.viewerScrim }]}>
            {h.captions}
          </Text>
        ) : null}
        {state === "paused" ? (
          <Text testID={`${testID}-paused`} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.pausedLabel, { color: theme.viewerForeground, backgroundColor: theme.viewerScrim }]}>
            {m.paused}
          </Text>
        ) : null}
      </View>
      <Text testID={`${testID}-status`} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.status, { color: theme.mutedForeground }]}>
        {showStatus}
      </Text>
      <LiveRegion testID={`${testID}-announce`} text={notice} />

      {wait ? <Gate testID={testID} h={h} live={live} m={m} needsNotice={needsNotice} /> : null}
      {playingLike ? <Controls testID={testID} h={h} m={m} /> : null}
      {state === "error" || state === "full" ? <ActionButton testID={`${testID}-retry`} theme={theme} label={m.retry} onPress={() => void h.join()} /> : null}

      {playingLike ? <Audience testID={testID} h={h} m={m} /> : null}
      {h.featured.length ? <ProductRail testID={testID} featured={h.featured} info={productInfo} m={m} onAct={(n, p, q) => h.product(n, p, q)} /> : null}
      {h.reactionsEnabled ? <Reactions testID={testID} h={h} m={m} reducedMotion={reducedMotion} /> : null}
      {h.chatEnabled ? <Chat testID={testID} h={h} m={m} /> : null}
    </View>
  );
}

function Gate({ testID, h, live, m, needsNotice }: { testID: string; h: LiveHandle; live: LiveMarker; m: LiveMessages; needsNotice: boolean }) {
  const { theme, open } = useStoriesContext();
  const [checked, setChecked] = useState(h.noticeAccepted && needsNotice);
  const blocked = needsNotice && !checked;
  useEffect(() => {
    if (h.state === "needs_notice") setChecked(false);
  }, [h.state]);
  return (
    <View style={styles.gate}>
      {needsNotice && live.notice ? (
        <>
          <Pressable
            testID={`${testID}-notice-check`}
            accessibilityRole="checkbox"
            accessibilityLabel={m.noticeCheck}
            accessibilityState={{ checked }}
            onPress={() => {
              const next = !checked;
              setChecked(next);
              if (next) h.acceptNotice();
            }}
            style={styles.checkRow}
          >
            <View style={[styles.box, { borderColor: theme.border, backgroundColor: checked ? theme.accent : "transparent" }]} {...HIDDEN_FROM_AT}>
              {checked ? <Text style={{ color: theme.accentForeground, fontWeight: "700" }}>✓</Text> : null}
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.checkText, { color: theme.surfaceForeground }]}>
              {m.noticeCheck}
            </Text>
          </Pressable>
          <ActionButton testID={`${testID}-notice-link`} theme={theme} filled={false} label={m.noticeLink} role="link" onPress={() => open({ type: "url", url: live.notice!.url }, { surface: "story", groupId: undefined })} />
          {live.replay === null ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 12 }}>
              {m.recordingNotice}
            </Text>
          ) : null}
        </>
      ) : null}
      <ActionButton testID={`${testID}-watch`} theme={theme} label={m.watch} disabled={blocked || h.surfacePaused} onPress={() => void h.join()} />
    </View>
  );
}

function Controls({ testID, h, m }: { testID: string; h: LiveHandle; m: LiveMessages }) {
  const { theme } = useStoriesContext();
  const paused = h.state === "paused";
  const cc = h.captionsVisible;
  return (
    <View accessibilityRole="toolbar" accessibilityLabel={m.region.replace("{title}", "")} style={styles.controls}>
      <ActionButton testID={`${testID}-pause`} theme={theme} filled={false} label={paused ? m.resume : m.pause} selected={paused} onPress={() => (paused ? h.resume() : h.pause())} />
      <ActionButton testID={`${testID}-mute`} theme={theme} filled={false} label={h.muted ? m.unmute : m.mute} selected={h.muted} onPress={() => h.setMuted(!h.muted)} />
      <ActionButton
        testID={`${testID}-cc`}
        theme={theme}
        filled={false}
        label={cc ? m.captionsOff : m.captionsOn}
        selected={cc}
        onPress={() => h.setCaptionsVisible(!cc)}
      />
      <ActionButton testID={`${testID}-leave`} theme={theme} filled={false} label={m.leave} onPress={() => void h.leave()} />
    </View>
  );
}

function Audience({ testID, h, m }: { testID: string; h: LiveHandle; m: LiveMessages }) {
  const { theme } = useStoriesContext();
  const n = h.snapshot?.audience_hint;
  if (!n) return null;
  return (
    <Text testID={`${testID}-audience`} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 12 }}>
      {fmt(m.audience, { n })}
    </Text>
  );
}

function ProductRail({ testID, featured, info, m, onAct }: { testID: string; featured: ProductRef[]; info?: LiveViewProps["productInfo"]; m: LiveMessages; onAct: (name: LiveProductEvent["name"], p: ProductRef, qty?: number) => void }) {
  const { theme } = useStoriesContext();
  return (
    <View testID={`${testID}-products`} accessibilityLabel={m.featured} style={styles.rail}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "700" }}>
        {m.featured}
      </Text>
      {featured.map((ref, i) => {
        const p = info?.(ref) ?? { title: ref.external_id };
        return (
          <View key={`${ref.connector}:${ref.external_id}#${ref.variant_id ?? ""}`} testID={`${testID}-product-${i}`} style={[styles.product, { borderColor: theme.border }]}>
            {p.image ? <Image source={{ uri: p.image }} style={styles.productImg} {...HIDDEN_FROM_AT} /> : null}
            <View style={styles.productBody}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "600" }}>
                {p.title}
              </Text>
              {p.price ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground }}>
                  {p.price}
                </Text>
              ) : null}
              <View style={styles.row}>
                <ActionButton testID={`${testID}-product-${i}-view`} theme={theme} filled={false} label={m.view} hint={p.title} onPress={() => onAct("product_click", ref)} />
                <ActionButton testID={`${testID}-product-${i}-cart`} theme={theme} label={m.addToCart} hint={p.title} onPress={() => onAct("add_to_cart", ref, 1)} />
                <ActionButton testID={`${testID}-product-${i}-wish`} theme={theme} filled={false} label={m.wishlist} hint={p.title} onPress={() => onAct("wishlist_added", ref)} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Reactions({ testID, h, m, reducedMotion }: { testID: string; h: LiveHandle; m: LiveMessages; reducedMotion: boolean }) {
  const { theme } = useStoriesContext();
  const [floating, setFloating] = useState<LiveReaction | null>(null);
  const [problem, setProblem] = useState("");
  const counts = h.snapshot?.reactions ?? {};
  return (
    <View testID={`${testID}-reactions`} accessibilityRole="toolbar" accessibilityLabel={m.reactionsRegion} style={styles.row}>
      {LIVE_REACTIONS.map((r) => (
        <Pressable
          key={r}
          testID={`${testID}-react-${r}`}
          accessibilityRole="button"
          accessibilityLabel={m.reactionNames[r]}
          onPress={() =>
            h.react(r).then(
              (sent) => {
                // La reacción flotante solo existe sin «reducir movimiento».
                if (sent && !reducedMotion) setFloating(r);
              },
              (e) => setProblem(liveErrorText(e, m)),
            )
          }
          style={[styles.react, { borderColor: theme.border }]}
        >
          <Text style={styles.glyph} {...HIDDEN_FROM_AT}>
            {REACTION_GLYPH[r]}
          </Text>
          {counts[r] ? (
            <Text style={{ color: theme.mutedForeground, fontSize: 12 }} {...HIDDEN_FROM_AT}>
              {counts[r]}
            </Text>
          ) : null}
        </Pressable>
      ))}
      {floating ? (
        <Text testID={`${testID}-float`} style={styles.glyph} {...HIDDEN_FROM_AT}>
          {REACTION_GLYPH[floating]}
        </Text>
      ) : null}
      {problem ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.negative }}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

function Chat({ testID, h, m }: { testID: string; h: LiveHandle; m: LiveMessages }) {
  const { theme } = useStoriesContext();
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState<LiveReportReason>("spam");
  const fail = (e: unknown): void => setStatus(liveErrorText(e, m));
  const send = (): void => {
    const t = text;
    if (!t.trim()) return;
    setText("");
    setStatus("");
    h.send(t).then((r) => setStatus(r.status === "pending" ? m.chatPending : ""), (e) => { setText(t); fail(e); });
  };
  return (
    <View testID={`${testID}-chat`} accessibilityLabel={m.chatTitle} style={styles.chat}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "700" }}>
        {m.chatTitle}
      </Text>
      <ScrollView testID={`${testID}-log`} accessibilityLiveRegion="polite" style={styles.log}>
        {h.messages.map((msg) => (
          <View key={msg.id} testID={`${testID}-msg-${msg.id}`}>
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, flexShrink: 1 }}>
                <Text style={{ fontWeight: "700" }}>{msg.mine ? m.chatMine : msg.label}</Text> {msg.text}
              </Text>
              <Pressable testID={`${testID}-msg-${msg.id}-opts`} accessibilityRole="button" accessibilityLabel={m.chatOptions} accessibilityState={{ expanded: open === msg.id }} onPress={() => setOpen(open === msg.id ? null : msg.id)} style={styles.opts}>
                <Text style={{ color: theme.mutedForeground }} {...HIDDEN_FROM_AT}>
                  ⋯
                </Text>
              </Pressable>
            </View>
            {open === msg.id ? (
              msg.mine ? (
                <ActionButton testID={`${testID}-msg-${msg.id}-delete`} theme={theme} filled={false} label={m.deleteMine} onPress={() => h.deleteMine(msg.id).then(() => setOpen(null), fail)} />
              ) : (
                <View accessibilityRole="radiogroup" accessibilityLabel={m.report}>
                  <View style={styles.reasons}>
                    {LIVE_REPORT_REASONS.map((r) => (
                      <ActionButton key={r} testID={`${testID}-reason-${r}`} theme={theme} filled={false} role="radio" selected={reason === r} label={m.reportReasons[r]} onPress={() => setReason(r)} />
                    ))}
                  </View>
                  <ActionButton testID={`${testID}-msg-${msg.id}-report`} theme={theme} label={m.reportSend} onPress={() => h.report(msg.id, reason).then(() => { setStatus(m.reportThanks); setOpen(null); }, fail)} />
                  <ActionButton testID={`${testID}-msg-${msg.id}-block`} theme={theme} filled={false} label={m.block} onPress={() => h.block(msg.id).then(() => { setStatus(m.blockedThanks); setOpen(null); }, fail)} />
                </View>
              )
            ) : null}
          </View>
        ))}
      </ScrollView>
      <Text testID={`${testID}-chatstatus`} accessibilityLiveRegion="polite" style={{ color: theme.mutedForeground, fontSize: 12 }}>
        {status}
      </Text>
      <View style={styles.row}>
        <TextInput
          testID={`${testID}-chat-input`}
          accessibilityLabel={m.chatInput}
          placeholder={m.chatInput}
          placeholderTextColor={theme.mutedForeground}
          value={text}
          onChangeText={setText}
          maxLength={200}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.input, { color: theme.surfaceForeground, borderColor: theme.border }]}
        />
        <ActionButton testID={`${testID}-chat-send`} theme={theme} label={m.chatSend} onPress={send} />
      </View>
    </View>
  );
}

function ReplayBlock({ testID, header, live, m, notice }: { testID: string; header: ReactElement; live: LiveMarker; m: LiveMessages; notice: string }) {
  const { theme, video, open } = useStoriesContext();
  const [playing, setPlaying] = useState(false);
  const [cc, setCc] = useState(false);
  const r = live.replay!;
  const Video = video?.Component;
  return (
    <View testID={testID} accessibilityLabel={fmt(m.region, { title: live.title })} style={[styles.root, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {header}
      <View testID={`${testID}-stage`} style={[styles.stage, { backgroundColor: theme.viewerBackground }]}>
        {Video ? (
          <Video
            testID={`${testID}-replay`}
            uri={r.url}
            posterUri={r.poster}
            muted={false}
            loop={false}
            paused={!playing}
            resizeMode="contain"
            captions={r.captions_url ? [{ lang: "und", label: m.captionsRegion, url: r.captions_url }] : []}
            captionsEnabled={cc}
            primary={false}
            onProgress={() => undefined}
            onEnd={() => setPlaying(false)}
            onBuffering={() => undefined}
            onError={() => setPlaying(false)}
            onReady={() => undefined}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={live.title}
          />
        ) : (
          <Image source={{ uri: r.poster }} style={StyleSheet.absoluteFill} resizeMode="contain" {...HIDDEN_FROM_AT} />
        )}
      </View>
      <View style={styles.controls}>
        {Video ? (
          <>
            <ActionButton testID={`${testID}-replay-toggle`} theme={theme} label={playing ? m.pause : m.watchReplay} selected={playing} onPress={() => setPlaying(!playing)} />
            {r.captions_url ? <ActionButton testID={`${testID}-cc`} theme={theme} filled={false} label={cc ? m.captionsOff : m.captionsOn} selected={cc} onPress={() => setCc(!cc)} /> : null}
          </>
        ) : (
          <ActionButton testID={`${testID}-replay-open`} theme={theme} label={m.watchReplay} role="link" onPress={() => open({ type: "url", url: r.url }, { surface: "story" })} />
        )}
      </View>
      {live.notice ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {m.recordingNotice}
        </Text>
      ) : null}
      <LiveRegion testID={`${testID}-announce`} text={notice} />
    </View>
  );
}

function ScheduledBlock({ testID, header, live, m, notice }: { testID: string; header: ReactElement; live: LiveMarker; m: LiveMessages; notice: string }) {
  const ctx = useStoriesContext();
  const clock = ctx.clock;
  const now = () => (clock ? clock.now() : Date.now());
  const [text, setText] = useState(() => startsText(live.scheduled_at, now(), m, ctx.locale));
  useEffect(() => {
    // Cada 30 s, con el reloj del proveedor: nada se conecta mientras tanto.
    const tick = (): void => setText(startsText(live.scheduled_at, now(), m, ctx.locale));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [live.scheduled_at, m, ctx.locale]);
  return (
    <View testID={testID} accessibilityLabel={fmt(m.region, { title: live.title })} style={[styles.root, { backgroundColor: ctx.theme.surface, borderColor: ctx.theme.border }]}>
      {header}
      <Text testID={`${testID}-when`} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: ctx.theme.mutedForeground }}>
        {text}
      </Text>
      <LiveRegion testID={`${testID}-announce`} text={notice} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  rtlRow: { flexDirection: "row-reverse" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  stage: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, overflow: "hidden", justifyContent: "flex-end", alignItems: "center" },
  captions: { margin: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 15, textAlign: "center" },
  pausedLabel: { position: "absolute", top: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, fontSize: 14, fontWeight: "700" },
  status: { fontSize: 14, minHeight: 20 },
  gate: { gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: MIN_TOUCH },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkText: { flexShrink: 1, fontSize: 15 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rail: { gap: 8 },
  product: { flexDirection: "row", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 8 },
  productImg: { width: 64, height: 64, borderRadius: 8 },
  productBody: { flex: 1, gap: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  react: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, paddingHorizontal: 8 },
  glyph: { fontSize: 20 },
  chat: { gap: 6 },
  log: { maxHeight: 180 },
  opts: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  input: { flex: 1, minHeight: MIN_TOUCH, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
});
