/**
 * @customyai/stories-react-native/video-feed — Video Feed nativo: carrusel o cuadrícula de miniaturas que abre un visor
 * vertical a pantalla completa (vídeo, carpeta de imágenes o «repost» de una red). Módulo OPCIONAL y aparte de `./widgets`
 * porque trae el visor y la precarga. El reproductor es el `VideoPlayerAdapter` del `StoriesProvider` (ver `./video`).
 *
 *   <StoriesProvider client={client} video={createReactNativeVideoAdapter(Video)}>
 *     <StoriesVideoFeed placementId="home_videos" />
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import { FlatList, Image, Modal, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { toPlayerSource } from "@customyai/stories-render/widgets/video-feed";
import { systemClock, type DeliveredVideoFeed, type VideoFeedItem } from "../core";
import { useStoriesContext } from "../context";
import { useAppActive } from "../hooks";
import { composeAssetLoader, mediaUri } from "../media";
import type { StoryVideoProps } from "../adapters";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { ChromeButton, Icon } from "../viewer/chrome";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { joinEvents, useBoundWidget } from "../widgets/bound";
import { LiveRegion, useImpressionOnLayout, useWidgetEnvWith, useWidgetLifecycle, widgetElementId, widgetEmitter, type WidgetEvent } from "../widgets/common";
import { fmt, resolveFeedMessages, type WidgetMessages } from "../widgets/messages";
import { ProductActions, WIDGET_PRODUCT_COMPONENT_IDS } from "../widgets/product-actions";
import type { UsePlacementOptions } from "../placement";
import { createVideoFeedController, hasVideoMedia, type FeedController, type FeedState } from "./controller";

export { createVideoFeedController, hasVideoMedia, planFeedWindow, type FeedController, type FeedState, type FeedWindowRole } from "./controller";
export { visibleFeedItems, toPlayerSource } from "@customyai/stories-render/widgets/video-feed";

const NETWORKS: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", drive: "Google Drive", dropbox: "Dropbox" };
const RATIO = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1 } as const;
const GAP = 10;
const noop = (): void => undefined;

const posterOf = (i: VideoFeedItem): { url: string; alt: string } => (i.type === "video" ? { url: i.video.poster, alt: i.alt } : i.type === "images" ? i.images[0]! : i.poster);
const titleOf = (i: VideoFeedItem): string => i.title ?? posterOf(i).alt;
/** El medio que se reproduce: HLS si hay (adaptativo) y, si no, MP4. */
const mediaOf = (i: VideoFeedItem): { uri: string; source: ReturnType<typeof toPlayerSource> } | null => {
  const wire = i.type === "video" ? i.video : i.type === "repost" && i.mode === "background" ? i.media : undefined;
  const uri = wire?.hls ?? wire?.mp4;
  return wire && uri ? { uri, source: toPlayerSource(wire, posterOf(i).alt) } : null;
};

export type VideoFeedViewProps = {
  entry: DeliveredVideoFeed;
  onEvent?: (e: WidgetEvent) => void;
  /** Detiene el medio sin tocar la elección de la persona (pausa de superficie `widget`, un checkout propio…). */
  suspended?: boolean;
  /** Compartir propio (por defecto, el menú del sistema con el enlace del elemento). */
  onShare?: (data: { url?: string; title?: string; itemId: string }) => void | Promise<void>;
  controllerRef?: MutableRefObject<FeedController | null>;
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/**
 * Video Feed: tarjetas (carrusel o cuadrícula) que abren un visor vertical a pantalla completa. Lógica y eventos en
 * `createVideoFeedController` (misma semántica que el visor web: `view`, `next`/`prev`, `playback`, `watch_length`, `share`,
 * `click`). Accesibilidad: botón de pausa SIEMPRE visible (WCAG 2.2.2); anterior/siguiente además del desplazamiento
 * (WCAG 2.5.1); mudo por defecto; con «reducir movimiento» o `mode: tap` nada arranca solo; cada elemento se anuncia;
 * cerrar con el botón, el atrás de Android o el gesto de escape de VoiceOver. Precarga en ventana `{ before, after }`
 * (la de la campaña) con el `preload` del reproductor y la caché de medios, cancelando lo que sale de la ventana.
 * Repost: se redirige a la red (`Linking`) con el enlace que el cliente aportó; este módulo nunca descarga ni raspa nada.
 * Con el visor abierto toma la compuerta «un overlay a la vez» del cliente (es un `Modal` nativo).
 */
export function VideoFeedView({ entry, onEvent, suspended, onShare, controllerRef, messages, testID }: VideoFeedViewProps) {
  const env = useWidgetEnvWith(resolveFeedMessages, { messages });
  const { ctx, theme, m, rtl, reducedMotion, notice, say } = env;
  const cfg = entry.config;
  const win = useWindowDimensions();
  const latest = useRef({ onEvent, onShare });
  latest.current = { onEvent, onShare };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const hasPlayer = !!ctx.video;
  // Vistas de producto ya contadas en este montaje: el visor se abre y se cierra sin repetirlas.
  const viewed = useRef(new Set<string>()).current;
  const emitProduct = useMemo(() => widgetEmitter(entry.id, entry.variant_id, (e) => latest.current.onEvent?.(e)), [entry.id, entry.variant_id]);

  const ctl = useMemo(
    () => createVideoFeedController({ entry, clock: ctx.clock, reducedMotion, hasPlayer, onEvent: (e) => latest.current.onEvent?.(e) }),
    // Se arma una vez por campaña y versión (y si cambia «reducir movimiento» o el reproductor).
    [entry.id, entry.updated_at, reducedMotion, hasPlayer],
  );
  if (controllerRef) controllerRef.current = ctl;
  const state = useSyncExternalStore(ctl.subscribe, ctl.getState, ctl.getState);
  const onLayout = useImpressionOnLayout(() => ctl.impression());

  // Segundo plano o pausa externa: el medio se detiene; la elección de la persona se conserva.
  const [active, setActive] = useState(true);
  useAppActive(setActive);
  useEffect(() => ctl.setSuspended(!!suspended || !active), [ctl, suspended, active]);

  // Un overlay a la vez.
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!state.open && release.current) {
      release.current();
      release.current = null;
      ctxRef.current.onVisibilityChange?.({ surface: "widget", visible: false });
    }
  }, [state.open]);
  useEffect(
    () => () => {
      ctl.destroy();
      release.current?.();
      release.current = null;
    },
    [ctl],
  );

  const start = useRef(0);
  const list = useRef<FlatList<VideoFeedItem>>(null);
  const openViewer = useCallback(
    (index: number) => {
      if (ctl.getState().open) return;
      const client = ctxRef.current.client;
      if (client) {
        const r = client.overlays.tryAcquire("video-feed");
        if (!r) return;
        release.current = r;
      }
      start.current = index;
      ctl.open(index);
      ctxRef.current.onVisibilityChange?.({ surface: "widget", visible: true });
    },
    [ctl],
  );

  // Precarga en ventana: lo que entra se calienta, lo que sale se cancela.
  const warm = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const live = warm.current;
    if (!state.open || state.current === null) {
      for (const c of live.values()) c.abort();
      live.clear();
      return;
    }
    const plan = ctl.window();
    const want = new Set(plan.map((p) => ctl.items[p.index]!.id));
    for (const [id, c] of live) {
      if (want.has(id)) continue;
      c.abort();
      live.delete(id);
    }
    const load = composeAssetLoader(ctxRef.current.mediaCache, ctxRef.current.video);
    for (const p of plan) {
      const it = ctl.items[p.index]!;
      if (p.role === "current" || live.has(it.id)) continue;
      const c = new AbortController();
      live.set(it.id, c);
      void load({ kind: "image", url: posterOf(it).url, critical: false }, c.signal).catch(noop);
      const media = mediaOf(it);
      if (media) void load({ kind: "video", url: media.uri, poster: posterOf(it).url, critical: false }, c.signal).catch(noop);
    }
  }, [ctl, state.open, state.current]);
  useEffect(() => () => void warm.current.forEach((c) => c.abort()), []);

  // Cada elemento se anuncia.
  useEffect(() => {
    if (!state.open || state.current === null) return;
    const it = ctl.items[state.current]!;
    say(fmt(it.type === "images" ? m.imageOf : m.videoOf, { n: state.current + 1, total: ctl.items.length }));
  }, [ctl, state.open, state.current, say, m]);

  const goTo = (index: number, via: "tap" | "swipe" | "keyboard"): void => {
    const i = Math.max(0, Math.min(ctl.items.length - 1, index));
    if (via !== "swipe") list.current?.scrollToIndex({ index: i, animated: !reducedMotion });
    ctl.goTo(i, via);
  };

  const share = async (item: VideoFeedItem): Promise<void> => {
    const url = item.share.url ?? (item.type === "repost" ? item.url : undefined);
    const data = { ...(url ? { url } : {}), ...(item.title ? { title: item.title } : {}), itemId: item.id };
    try {
      if (latest.current.onShare) {
        await latest.current.onShare(data);
        ctl.shared(item.id, "app");
      } else {
        const r = await Share.share({ ...(item.title ? { title: item.title } : {}), message: url ?? item.title ?? "", ...(url ? { url } : {}) });
        if ((r as { action?: string }).action !== "dismissedAction") ctl.shared(item.id, "native");
      }
    } catch {
      /* cancelado o sin menú: no se informa un éxito falso */
    }
  };

  const openAction = (item: VideoFeedItem, action: Parameters<typeof env.open>[0], elementId: string): void => {
    ctl.click(item.id, elementId);
    env.open(action, { widgetId: entry.id, itemId: item.id, elementId });
  };

  const items = ctl.items;
  if (items.length === 0) return null;
  const cur = state.current === null ? null : items[state.current] ?? null;
  const curMedia = cur ? hasVideoMedia(cur) && hasPlayer : false;
  const cardW = cfg.layout === "grid" ? undefined : Math.min(220, Math.max(120, win.width * 0.4));
  const effPaused = ctl.isPaused();
  const canShare = !!cur?.share.enabled && cfg.share.enabled && (!!latest.current.onShare || !!(cur.share.url ?? (cur.type === "repost" ? cur.url : undefined)));

  return (
    <View testID={testID ?? `cs-feed-${entry.id}`} onLayout={onLayout} style={{ direction: rtl ? "rtl" : "ltr" }}>
      <FlatList
        key={`${cfg.layout}-${cfg.columns}`}
        testID="cs-feed-cards"
        data={items}
        keyExtractor={(i) => i.id}
        horizontal={cfg.layout !== "grid"}
        numColumns={cfg.layout === "grid" ? Math.max(1, cfg.columns) : 1}
        columnWrapperStyle={cfg.layout === "grid" && cfg.columns > 1 ? { gap: GAP } : undefined}
        ItemSeparatorComponent={() => <View style={{ width: cfg.layout === "grid" ? 0 : GAP, height: cfg.layout === "grid" ? GAP : 0 }} />}
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={m.videoFeed}
        renderItem={({ item, index }) => (
          <Pressable
            testID={`cs-feed-card-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={fmt(m.openVideo, { title: titleOf(item) })}
            accessibilityHint={m.videoFeed}
            onPress={() => {
              ctl.click(item.id, widgetElementId(entry.id, item.id));
              openViewer(index);
            }}
            style={[styles.card, cardW ? { width: cardW } : styles.cardGrid, { aspectRatio: RATIO[cfg.aspect], borderRadius: cfg.corner_radius, backgroundColor: theme.border }]}
          >
            <Image source={{ uri: mediaUri(ctx.mediaCache, posterOf(item).url) }} resizeMode="cover" style={StyleSheet.absoluteFill} {...HIDDEN_FROM_AT} />
            {item.type === "images" ? null : (
              <View style={styles.playBadge} {...HIDDEN_FROM_AT}>
                <View style={[styles.playBg, { backgroundColor: theme.viewerScrim }]}>
                  <Icon name="play" size={18} color={theme.viewerForeground as string} />
                </View>
              </View>
            )}
            {cfg.show_title && item.title ? (
              <View style={[styles.caption, { backgroundColor: theme.viewerScrim }]} {...HIDDEN_FROM_AT}>
                <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.viewerForeground, fontSize: 13, fontWeight: "600" }}>
                  {item.title}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />

      <Modal visible={state.open} animationType={reducedMotion ? "none" : "fade"} statusBarTranslucent onRequestClose={() => ctl.close()}>
        <View testID="cs-feed-viewer" accessibilityViewIsModal accessibilityLabel={m.videoFeed} onAccessibilityEscape={() => ctl.close()} style={[styles.viewer, { backgroundColor: theme.viewerBackground, direction: rtl ? "rtl" : "ltr" }]}>
          <FlatList
            ref={list}
            testID="cs-feed-pager"
            data={items}
            extraData={state}
            keyExtractor={(i) => i.id}
            pagingEnabled
            snapToInterval={win.height}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            initialScrollIndex={start.current}
            getItemLayout={(_, index) => ({ length: win.height, offset: win.height * index, index })}
            windowSize={3}
            onMomentumScrollEnd={(e) => goTo(Math.round(e.nativeEvent.contentOffset.y / win.height), "swipe")}
            renderItem={({ item, index }) => (
              <Slide
                item={item}
                index={index}
                total={items.length}
                height={win.height}
                width={win.width}
                active={state.current === index}
                state={state}
                paused={effPaused}
                autoplay={ctl.autoplay}
                m={m}
                onAction={(action, elementId) => openAction(item, action, elementId)}
                entryId={entry.id}
                emit={emitProduct}
                viewed={viewed}
              />
            )}
          />
          <View pointerEvents="box-none" style={styles.top}>
            <View style={styles.controls}>
              <ChromeButton testID="cs-feed-pause" label={state.paused ? m.playVideo : m.pauseVideo} selected={state.paused} onPress={() => ctl.togglePause()}>
                <Icon name={state.paused ? "play" : "pause"} color={theme.viewerForeground as string} />
              </ChromeButton>
              {curMedia ? (
                <ChromeButton testID="cs-feed-mute" label={state.muted ? m.unmuteVideo : m.muteVideo} selected={!state.muted} onPress={() => ctl.toggleMute()}>
                  <Text style={[styles.glyph, { color: theme.viewerForeground }]} {...HIDDEN_FROM_AT}>
                    {state.muted ? "🔇" : "🔊"}
                  </Text>
                </ChromeButton>
              ) : null}
              {canShare && cur ? (
                <ChromeButton testID="cs-feed-share" label={m.share} onPress={() => void share(cur)}>
                  <Text style={[styles.glyph, { color: theme.viewerForeground }]} {...HIDDEN_FROM_AT}>
                    ↗
                  </Text>
                </ChromeButton>
              ) : null}
              <ChromeButton testID="cs-feed-close" label={m.closeViewer} onPress={() => ctl.close()}>
                <Icon name="close" color={theme.viewerForeground as string} />
              </ChromeButton>
            </View>
          </View>
          <View pointerEvents="box-none" style={styles.nav}>
            <ChromeButton testID="cs-feed-prev" label={m.previousVideo} onPress={() => goTo((state.current ?? 0) - 1, "tap")}>
              <View style={styles.turn}>
                <Icon name="chevron-prev" color={theme.viewerForeground as string} />
              </View>
            </ChromeButton>
            <ChromeButton testID="cs-feed-next" label={m.nextVideo} onPress={() => goTo((state.current ?? 0) + 1, "tap")}>
              <View style={styles.turn}>
                <Icon name="chevron-next" color={theme.viewerForeground as string} />
              </View>
            </ChromeButton>
          </View>
          <LiveRegion text={notice} testID="cs-feed-live" />
        </View>
      </Modal>
    </View>
  );
}

/** Un elemento del visor: póster, el reproductor (solo el activo) o el pase de imágenes, y su texto y acciones. */
function Slide({ item, index, total, height, width, active, state, paused, autoplay, m, onAction, entryId, emit, viewed }: { item: VideoFeedItem; index: number; total: number; height: number; width: number; active: boolean; state: FeedState; paused: boolean; autoplay: boolean; m: WidgetMessages; onAction: (action: Parameters<ReturnType<typeof useWidgetEnvWith>["open"]>[0], elementId: string) => void; entryId: string; emit: ReturnType<typeof widgetEmitter>; viewed: Set<string> }) {
  const ctx = useStoriesContext();
  const { theme } = ctx;
  const clock = ctx.clock ?? systemClock;
  const Adapter = ctx.video?.Component;
  const media = mediaOf(item);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const poster = posterOf(item);
  const slides = item.type === "images" && item.images.length > 1 ? item.images : null;

  // Pase de imágenes: avanza solo con autoplay, sin pausa y con movimiento permitido (en pausa o con reduce motion se queda).
  useEffect(() => {
    if (!active || !slides || item.type !== "images") return;
    if (!autoplay || paused || ctx.reducedMotion) return;
    const t = clock.setTimeout(() => setFrame((f) => (f + 1) % slides.length), item.slide_ms);
    return () => clock.clearTimeout(t);
  }, [active, slides, autoplay, paused, ctx.reducedMotion, frame, item, clock]);
  useEffect(() => {
    if (!active) setFrame(0);
  }, [active]);

  const label = `${fmt(item.type === "images" ? m.imageOf : m.videoOf, { n: index + 1, total })}. ${slides ? slides[frame]!.alt : poster.alt}`;
  const shown = slides ? slides[frame]! : poster;
  const playerProps: StoryVideoProps | null =
    active && Adapter && media && !failed
      ? {
          uri: mediaUri(ctx.mediaCache, media.uri, "video"),
          posterUri: poster.url,
          muted: state.muted,
          loop: true,
          paused,
          resizeMode: "cover",
          captions: media.source.captions ?? [],
          captionsEnabled: true,
          primary: false,
          onProgress: noop,
          onEnd: noop,
          onBuffering: noop,
          onError: () => setFailed(true),
          onReady: noop,
          style: StyleSheet.absoluteFill,
          accessibilityLabel: label,
          testID: `cs-feed-player-${item.id}`,
        }
      : null;

  return (
    <View testID={`cs-feed-slide-${item.id}`} style={{ width, height, backgroundColor: theme.viewerBackground }}>
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={StyleSheet.absoluteFill}>
        <Image source={{ uri: mediaUri(ctx.mediaCache, shown.url) }} resizeMode="cover" style={StyleSheet.absoluteFill} {...HIDDEN_FROM_AT} />
        {playerProps && Adapter ? <Adapter {...playerProps} /> : null}
      </View>
      <View pointerEvents="box-none" style={[styles.info, { backgroundColor: theme.viewerScrim }]}>
        {item.title ? (
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.viewerForeground }]}>
            {item.title}
          </Text>
        ) : null}
        {item.caption ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.viewerForeground, fontSize: 14 }}>
            {item.caption}
          </Text>
        ) : null}
        {item.type === "repost" ? (
          <ActionButton
            theme={theme}
            testID={`cs-feed-repost-${item.id}`}
            role="link"
            label={fmt(m.viewOnNetwork, { network: NETWORKS[item.network] ?? item.network })}
            onPress={() => onAction({ type: "url", url: item.url }, widgetElementId(entryId, `${item.id}.repost`.slice(0, 80)))}
          />
        ) : null}
        {item.products?.length ? <ProductActions widgetId={entryId} itemId={item.id} componentId={WIDGET_PRODUCT_COMPONENT_IDS.video_feed} products={item.products} emit={emit} m={m} viewed={viewed} visible={active} /> : null}
        {item.ctas.map((c) => (
          <ActionButton key={c.id} theme={theme} testID={`cs-feed-cta-${c.id}`} role={c.action.type === "url" ? "link" : "button"} label={c.label} onPress={() => onAction(c.action, c.element_id)} />
        ))}
      </View>
    </View>
  );
}

export type StoriesVideoFeedProps = UsePlacementOptions & {
  placementId: string;
  onEvent?: (e: WidgetEvent) => void;
  onShare?: VideoFeedViewProps["onShare"];
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/** Video Feed de un placement (kill, `min_sdk`, frecuencia, control y pausa de superficie `widget` los resuelve el cliente). */
export function StoriesVideoFeed({ placementId, onEvent, onShare, messages, testID, ...query }: StoriesVideoFeedProps) {
  const { entry, bound, paused } = useBoundWidget("video_feed", placementId, query);
  useWidgetLifecycle(placementId, !!entry);
  if (!entry || !bound) return null;
  return <VideoFeedView key={entry.id} entry={entry} suspended={paused} onEvent={joinEvents(bound, onEvent)} onShare={onShare} messages={messages} testID={testID} />;
}

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  cardGrid: { flex: 1 },
  playBadge: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  playBg: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingStart: 3 },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 6 },
  viewer: { flex: 1 },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: 40, paddingHorizontal: 12 },
  controls: { flexDirection: "row", justifyContent: "flex-end", gap: 2 },
  nav: { position: "absolute", right: 8, top: "42%", gap: 8 },
  turn: { transform: [{ rotate: "90deg" }] },
  glyph: { fontSize: 18, fontWeight: "600" },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, gap: 8, minHeight: MIN_TOUCH },
  title: { fontSize: 18, fontWeight: "700" },
});
