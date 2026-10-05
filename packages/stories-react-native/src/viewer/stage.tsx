import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, useSharedValue } from "react-native-reanimated";
import {
  componentBox,
  evaluateVisibility,
  fmt,
  pageDurationMs,
  sortByZ,
  systemClock,
  viewportFit,
  type AnswerMap,
  type StoryComponent,
  type StoryViewer,
} from "../core";
import type { ComponentRenderers, PageActionsProvider, StoryComponentProps } from "../component-api";
import { useStoriesContext, type LinkContext } from "../context";
import { useDeviceInsets } from "../insets";
import { useScreenReader } from "../hooks";
import { ChromeButton, GroupBadge, Icon, ProgressBar } from "./chrome";
import { ButtonView, CountdownView, PollView, PromoView } from "./base-components";
import { ClaimProvider, Interactive, useViewerGestures } from "./gestures";
import { BackgroundView, HIDDEN_FROM_AT, LayerView, type PageEnv } from "./layers";
import { PageActionSheet } from "./page-action-sheet";
import { SponsorSheet } from "./sponsor-sheet";
import { useViewerState } from "./use-viewer";

const BASE: ComponentRenderers = { button: ButtonView, poll: PollView, countdown: CountdownView, promo_code: PromoView };

/** `true` si el componente no debe pintarse (ramificación, código caducado). */
export function isComponentHidden(c: StoryComponent, answers: AnswerMap, nowMs: number): boolean {
  if (c.visibility && evaluateVisibility(c.visibility, answers) === false) return true;
  return c.type === "promo_code" && !!c.valid_until && Date.parse(c.valid_until) < nowMs;
}

/** Vídeo del que se toma el reloj de la historia: el de fondo o, si no hay, el primero de las capas. */
export function primaryVideoOf(page: { background?: { type: string }; canvas: { layers: readonly { type: string; id: string }[] } }): string | undefined {
  if (page.background?.type === "video") return "bg";
  return page.canvas.layers.find((l) => l.type === "video")?.id;
}

export function ViewerStage({ viewer, pageActions }: { viewer: StoryViewer; pageActions?: PageActionsProvider }) {
  const ctx = useStoriesContext();
  const { theme, rtl, reducedMotion } = ctx;
  const clock = ctx.clock ?? systemClock;
  const state = useViewerState(viewer);
  const win = useWindowDimensions();
  const insets = useDeviceInsets(ctx.insets);
  const screenReader = useScreenReader();
  const vp = useMemo(() => viewportFit(win.width, win.height), [win.width, win.height]);
  const progress = useSharedValue(0);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [actionSheet, setActionSheet] = useState(false);
  const [notice, setNotice] = useState("");
  const { gesture, claim } = useViewerGestures(viewer, { rtl, clock, width: vp.width });
  const m = viewer.messages;

  // El avance de la página, a 60 fps solo mientras corre; en pausa queda congelado (barra y animaciones).
  const playing = state.snapshot.state === "playing";
  useEffect(() => {
    progress.value = viewer.progress();
    if (!playing) return;
    let raf = 0;
    let alive = true;
    const tick = (): void => {
      if (!alive) return;
      progress.value = viewer.progress();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [viewer, progress, playing, state.epoch]);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
  }, []);
  useEffect(() => {
    if (state.announcement) say(state.announcement);
  }, [state.announcement, state.epoch, say]);

  const closeSheet = useCallback(() => {
    setSheet(false);
    viewer.resume("sheet");
  }, [viewer]);
  const openSheet = useCallback(() => {
    setSheet(true);
    viewer.pause("sheet");
  }, [viewer]);
  const closeAction = useCallback(() => {
    setActionSheet(false);
    viewer.resume("sheet");
  }, [viewer]);
  const openAction = useCallback(() => {
    setActionSheet(true);
    viewer.pause("sheet");
  }, [viewer]);
  useEffect(() => () => viewer.resume("sheet"), [viewer]);

  const { group, page } = state;
  const at = useMemo((): LinkContext => ({ surface: "story", groupId: group?.id, pageId: page?.id }), [group?.id, page?.id]);
  const answers = useCallback((): AnswerMap => ({ ...viewer.getState().group?.answers, ...viewer.getState().responses }), [viewer]);

  const env = useMemo<PageEnv | null>(() => {
    if (!page) return null;
    return {
      vp,
      theme,
      rtl,
      reducedMotion,
      pageDurationMs: pageDurationMs(page),
      progress,
      mediaCache: ctx.mediaCache,
      video: ctx.video,
      lottie: ctx.lottie,
      primaryVideo: primaryVideoOf(page),
      playing,
      muted,
      captionsOn,
      onVideoProgress: viewer.mediaTime,
      onVideoEnd: viewer.mediaEnded,
      onVideoBuffering: viewer.mediaBuffering,
      onVideoError: viewer.mediaFailed,
    };
  }, [page, vp, theme, rtl, reducedMotion, progress, ctx.mediaCache, ctx.video, ctx.lottie, playing, muted, captionsOn, viewer]);

  if (!state.open || !group || !page || !env) return null;

  const registry: ComponentRenderers = ctx.components ? { ...ctx.components, ...BASE } : BASE;
  const sponsor = group.mode === "sponsored" ? group.sponsor : undefined;
  const topPad = Math.max(0, insets.top - Math.max(0, (win.height - vp.height) / 2)) + 8;
  const bottomPad = Math.max(0, insets.bottom - Math.max(0, (win.height - vp.height) / 2));
  // La zona segura de la campaña se amplía con la REAL del dispositivo (muesca, barra de gestos).
  const safe = { top_px: Math.max(page.canvas.safe_zone.top_px, (topPad + 36) / vp.scale), bottom_px: Math.max(page.canvas.safe_zone.bottom_px, (bottomPad + 8) / vp.scale) };
  const hasVideo = !!ctx.video && (page.background?.type === "video" || page.canvas.layers.some((l) => l.type === "video"));
  const hasCaptions = hasVideo && ((page.background?.type === "video" && page.background.captions.length > 0) || page.canvas.layers.some((l) => l.type === "video" && l.captions.length > 0));
  const nowMs = clock.now();
  const userPaused = state.userPaused;
  // Acción extra de la página (p. ej. reportar/bloquear en UGC): «⋯» en la cabecera y hoja modal.
  const action = (pageActions ?? ctx.pageActions)?.({ group, page }) ?? null;

  const share = (): void => {
    const url = ctx.shareUrl?.({ groupId: group.id, pageId: page.id });
    viewer.share(url ? "link" : "native");
    void Share.share({ title: group.title, message: url ?? group.title, ...(url ? { url } : {}) }).catch(() => undefined);
  };

  return (
    <ClaimProvider value={claim}>
    <View style={[styles.center, { backgroundColor: theme.viewerBackground, direction: rtl ? "rtl" : "ltr" }]}>
      <GestureDetector gesture={gesture}>
        <View
          testID="cs-stage"
          collapsable={false}
          style={{ width: vp.width, height: vp.height, overflow: "hidden", backgroundColor: theme.viewerBackground }}
          accessibilityViewIsModal
          accessibilityLabel={fmt(m.viewer, { title: group.title })}
          onMagicTap={() => viewer.togglePause()}
          onAccessibilityEscape={() => viewer.close("user")}
        >
          <Animated.View key={state.epoch} entering={reducedMotion ? undefined : FadeIn.duration(120)} style={StyleSheet.absoluteFill} {...(sheet ? { importantForAccessibility: "no-hide-descendants" as const, accessibilityElementsHidden: true } : null)}>
            <BackgroundView bg={page.background} env={env} />
            {sortByZ(page.canvas.layers).map((layer) => (
              <LayerView key={layer.id} layer={layer} env={env} />
            ))}
            {sortByZ(page.canvas.components).map((comp) => {
              const Draw = registry[comp.type] as ComponentType<StoryComponentProps> | undefined;
              if (!Draw || isComponentHidden(comp, { ...group.answers, ...state.responses }, nowMs)) return null;
              const b = componentBox(comp, vp, safe);
              const props: StoryComponentProps = {
                comp,
                viewer,
                theme,
                vp,
                m,
                locale: ctx.locale,
                rtl,
                reducedMotion,
                clock,
                say,
                answers,
                open: (action, elementId) => ctx.open(action, { ...at, elementId }),
                resolveProducts: ctx.resolveProducts,
                onAddToCart: ctx.onAddToCart,
                onWishlist: ctx.onWishlist,
                onAddToCalendar: ctx.onAddToCalendar,
                onReminder: ctx.onReminder,
                copyText: ctx.copyText,
                ...(ctx.openGame ? { openGame: (id: string, elementId?: string) => ctx.openGame?.(id, { ...at, elementId }) } : {}),
                ...(ctx.openForm ? { openForm: (id: string, elementId?: string) => ctx.openForm?.(id, { ...at, elementId }) } : {}),
              };
              return (
                <Interactive key={comp.id} style={{ position: "absolute", left: b.left, top: b.top, width: b.width, minHeight: b.height }}>
                  <Draw {...props} />
                </Interactive>
              );
            })}
          </Animated.View>

          {state.snapshot.state === "loading" ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
              <ActivityIndicator color={theme.viewerForeground as string} accessibilityLabel={m.loading} />
            </View>
          ) : null}

          {/* Mantener pulsado oculta la interfaz; el botón de pausa es SIEMPRE visible por lo demás (WCAG 2.2.2). */}
          <View pointerEvents={state.uiHidden ? "none" : "box-none"} style={[styles.chrome, { paddingTop: topPad, opacity: state.uiHidden ? 0 : 1 }]}>
            <Interactive>
              <ProgressBar count={state.visibleCount} index={state.visibleIndex} progress={progress} theme={theme} m={m} />
              <View style={styles.header}>
                <GroupBadge group={group} theme={theme} sponsorLabel={sponsor?.label} />
                <ChromeButton testID="cs-pause" label={userPaused ? m.play : m.pause} selected={userPaused} onPress={() => viewer.togglePause()}>
                  <Icon name={userPaused ? "play" : "pause"} color={theme.viewerForeground as string} />
                </ChromeButton>
                {hasVideo ? (
                  <ChromeButton testID="cs-mute" label={muted ? m.unmute : m.mute} selected={!muted} onPress={() => setMuted((v) => !v)}>
                    <Text style={[styles.glyph, { color: theme.viewerForeground }]} {...HIDDEN_FROM_AT}>
                      {muted ? "🔇" : "🔊"}
                    </Text>
                  </ChromeButton>
                ) : null}
                {hasCaptions ? (
                  <ChromeButton testID="cs-captions" label={captionsOn ? m.captionsOff : m.captionsOn} selected={captionsOn} onPress={() => setCaptionsOn((v) => !v)}>
                    <Text style={[styles.glyph, styles.cc, { color: theme.viewerForeground, borderColor: theme.viewerForeground }]} {...HIDDEN_FROM_AT}>
                      CC
                    </Text>
                  </ChromeButton>
                ) : null}
                {action ? (
                  <ChromeButton testID="cs-more" label={action.label} onPress={openAction}>
                    <Text style={[styles.glyph, { color: theme.viewerForeground }]} {...HIDDEN_FROM_AT}>
                      ⋯
                    </Text>
                  </ChromeButton>
                ) : null}
                <ChromeButton testID="cs-share" label={m.share} onPress={share}>
                  <Text style={[styles.glyph, { color: theme.viewerForeground }]} {...HIDDEN_FROM_AT}>
                    ↗
                  </Text>
                </ChromeButton>
                <ChromeButton testID="cs-close" label={m.close} onPress={() => viewer.close("user")}>
                  <Icon name="close" color={theme.viewerForeground as string} />
                </ChromeButton>
              </View>
              {sponsor ? (
                <Pressable testID="cs-sponsor" onPress={openSheet} accessibilityRole="button" accessibilityLabel={`${sponsor.label}: ${sponsor.name}. ${m.sponsorInfo}`} style={[styles.sponsor, { backgroundColor: theme.viewerScrim }]}>
                  <Text style={{ color: theme.viewerForeground, fontSize: 12 }} {...HIDDEN_FROM_AT}>
                    <Text style={styles.bold}>{sponsor.label}</Text>
                    {` · ${sponsor.name}`}
                  </Text>
                </Pressable>
              ) : null}
            </Interactive>
          </View>

          {/* Con lector de pantalla no hay «tercios»: botones de anterior/siguiente a la vista. */}
          {screenReader ? (
            <View pointerEvents="box-none" style={[styles.nav, { paddingBottom: bottomPad + 8 }]}>
              <Interactive style={styles.navRow}>
                <ChromeButton testID="cs-prev" label={m.previous} onPress={() => viewer.prev("keyboard")}>
                  <Icon name="chevron-prev" color={theme.viewerForeground as string} />
                </ChromeButton>
                <ChromeButton testID="cs-next" label={m.next} onPress={() => viewer.next("keyboard")}>
                  <Icon name="chevron-next" color={theme.viewerForeground as string} />
                </ChromeButton>
              </Interactive>
            </View>
          ) : null}

          {/* Región viva (TalkBack) con el cambio de página y los avisos; en iOS se anuncia además por `announceForAccessibility`. */}
          <Text testID="cs-live" accessibilityLiveRegion="polite" style={styles.live}>
            {notice}
          </Text>

          {action && actionSheet ? (
            <PageActionSheet title={action.title ?? action.label} theme={theme} m={m} onClose={closeAction}>
              {action.render({ close: closeAction, say })}
            </PageActionSheet>
          ) : null}

          {sponsor && sheet ? <SponsorSheet sponsor={sponsor} theme={theme} m={m} onClose={closeSheet} onOpenUrl={(url) => ctx.open({ type: "url", url }, { ...at, elementId: "sponsor.transparency" })} /> : null}
        </View>
      </GestureDetector>
    </View>
    </ClaimProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  chrome: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 6 },
  glyph: { fontSize: 18, fontWeight: "600" },
  cc: { fontSize: 11, borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 3, overflow: "hidden" },
  sponsor: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, minHeight: 28, justifyContent: "center" },
  bold: { fontWeight: "700" },
  nav: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  navRow: { flexDirection: "row", justifyContent: "space-between" },
  live: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
});
