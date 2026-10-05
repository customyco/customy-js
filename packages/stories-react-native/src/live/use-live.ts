import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";
import {
  createLiveCore,
  type LiveCoreOptions,
  type LiveError,
  type LiveMarker,
  type LiveProductEvent,
  type LiveReaction,
  type LiveReportReason,
  type LiveState,
  type LiveStateSnapshot,
  type LiveTransport,
} from "@customyai/stories-render/widgets/live";
import type { PausableSurface, SurfaceControl } from "@customyai/stories-render/client";
import type { Clock, ProductRef } from "../core";

/**
 * El transporte de medios de una app React Native: lo que el controlador sin DOM necesita (`LiveTransport`) más lo único que
 * es nativo: pintar el vídeo. `@customyai/stories-react-native/live-livekit` trae el de `@livekit/react-native`; la app puede
 * escribir otro (HLS, otro SFU). El paquete NO depende de ningún cliente de LiveKit.
 */
export type NativeLiveTransport = LiveTransport & {
  /** El vídeo del anfitrión ya listo para montar (p. ej. `<VideoView>`); `null` mientras no hay pista. */
  renderVideo?: () => ReactNode;
  /** Avisa de que `renderVideo()` cambió (llegó o se fue una pista). Devuelve la baja. */
  subscribe?: (listener: () => void) => () => void;
  /** Silencia o no el audio del live (sin tocar la suscripción). */
  setMuted?: (muted: boolean) => void;
};

export type UseLiveOptions = {
  live: LiveMarker;
  /** El grupo de historias al que pertenece: es el `storyId` del contexto de comercio. */
  groupId: string;
  client: LiveCoreOptions["client"];
  /** Crea el transporte al pulsar «Ver en vivo» (una vez por conexión). Nada se carga antes. */
  openTransport: () => Promise<NativeLiveTransport> | NativeLiveTransport;
  /** Pausa de superficie (`client.surfaces`): con `pause("live")`, `pause("widget")`… no se conecta y lo que suena se pausa. */
  surfaces?: SurfaceControl;
  /** Kill switch aplicado por la app (el del servidor llega como `live_kill_switch` y también deja el live no disponible). */
  killed?: boolean;
  /** Cuentas que pueden ser de menores: sin chat ni reacciones, pase lo que pase en el servidor. */
  isMinor?: boolean;
  clock?: Clock;
  pollMs?: number;
  heartbeatMs?: number;
  onProduct?: (e: LiveProductEvent) => void;
  onEnded?: (state: "ended" | "replay") => void;
  onState?: (state: LiveState, detail?: { error?: LiveError }) => void;
  /** Pedir el placement de nuevo (la repetición llega ahí). */
  onRefetch?: () => void;
};

const SURFACES: PausableSurface[] = ["live", "story", "widget"];
const noop = (): void => undefined;

/**
 * El Live sin interfaz (modo headless): la máquina de estados del renderer (`createLiveCore`) ligada a React Native — segundo plano
 * (`AppState`), pausa de superficie, kill switch, menores, subtítulos, productos destacados y chat por sondeo. `LiveView` solo pinta esto.
 */
export function useLive(options: UseLiveOptions) {
  const opts = useRef(options);
  opts.current = options;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const extra = useRef({ captions: "", error: undefined as LiveError | undefined, shownFeatured: "", muted: false, showCaptions: false });
  const transportRef = useRef<NativeLiveTransport | null>(null);
  const hiddenRef = useRef(false);
  const visibilityListeners = useRef(new Set<() => void>());
  const pausedBySurface = useRef(false);
  const offVideo = useRef<(() => void) | null>(null);

  const controller = useMemo(
    () => {
      const o = opts.current;
      const c = createLiveCore({
        live: o.live,
        groupId: o.groupId,
        client: o.client,
        clock: o.clock,
        pollMs: o.pollMs,
        heartbeatMs: o.heartbeatMs,
        isHidden: () => hiddenRef.current,
        onVisibility: (cb) => {
          visibilityListeners.current.add(cb);
          return () => void visibilityListeners.current.delete(cb);
        },
        openTransport: async () => {
          const t = await opts.current.openTransport();
          transportRef.current = t;
          offVideo.current?.();
          offVideo.current = t.subscribe?.(rerender) ?? null;
          if (extra.current.muted) t.setMuted?.(true);
          return t;
        },
        onCaption: (text) => {
          extra.current.captions = text;
          rerender();
        },
        onProduct: (e) => opts.current.onProduct?.(e),
        onEnded: (to) => {
          opts.current.onEnded?.(to);
          opts.current.onRefetch?.();
        },
        onState: (s, d) => {
          extra.current.error = d?.error;
          opts.current.onState?.(s, d);
          rerender();
        },
        onSnapshot: (s) => {
          const key = s.featured.map((p) => `${p.connector}:${p.external_id}#${p.variant_id ?? ""}`).join("|");
          if (key !== extra.current.shownFeatured) {
            extra.current.shownFeatured = key;
            for (const p of s.featured) c.product("product_viewed", p);
          }
          rerender();
        },
      });
      return c;
    },
    // Un controlador por live y por cliente: cambiar callbacks no reinicia la conexión.
    [options.live.session_id, options.client],
  );

  // Segundo plano: igual que la pestaña oculta en la web (se pausa el medio sin tocar la pausa de la persona).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: string) => {
      hiddenRef.current = s !== "active";
      for (const l of [...visibilityListeners.current]) l();
    });
    return () => sub.remove();
  }, []);

  // Pausa de superficie: lo que suena se pausa y no se vuelve a conectar hasta reanudar; lo que la persona pausó se respeta.
  const surfacePaused = useSyncExternalStore(
    options.surfaces?.subscribe ?? ((): (() => void) => noop),
    () => !!options.surfaces && (SURFACES.some((s) => options.surfaces!.isPaused(s))),
    () => false,
  );
  useEffect(() => {
    if (surfacePaused) {
      if (!controller.paused && (controller.state === "playing" || controller.state === "waiting_host")) {
        pausedBySurface.current = true;
        controller.pause();
      }
    } else if (pausedBySurface.current) {
      pausedBySurface.current = false;
      controller.resume();
    }
  }, [surfacePaused, controller, controller.state]);

  useEffect(() => {
    if (options.killed) void controller.kill();
  }, [options.killed, controller]);

  useEffect(
    () => () => {
      offVideo.current?.();
      void controller.destroy();
    },
    [controller],
  );

  const state = controller.state;
  const snapshot: LiveStateSnapshot | null = controller.snapshot;
  const mode = snapshot?.chat.mode ?? options.live.chat_mode;
  const live = state === "playing" || state === "paused" || state === "waiting_host" || state === "reconnecting";
  const featured: ProductRef[] = live ? (snapshot?.featured ?? options.live.featured) : [];

  return {
    controller,
    state,
    error: extra.current.error,
    snapshot,
    messages: controller.messages,
    captions: extra.current.captions,
    paused: controller.paused,
    surfacePaused,
    noticeAccepted: controller.noticeAccepted,
    hasVideo: controller.hasVideo,
    featured,
    chatEnabled: !options.isMinor && live && (mode === "filtered" || mode === "premoderated"),
    reactionsEnabled: !options.isMinor && live && (options.live.reactions || mode === "reactions") && (snapshot ? snapshot.state === "live" : true),
    renderVideo: (): ReactNode => transportRef.current?.renderVideo?.() ?? null,
    join: useCallback(async () => {
      if (opts.current.surfaces && SURFACES.some((s) => opts.current.surfaces!.isPaused(s))) return;
      await controller.join();
    }, [controller]),
    acceptNotice: useCallback(() => {
      controller.acceptNotice();
      rerender();
    }, [controller]),
    pause: useCallback(() => {
      pausedBySurface.current = false;
      controller.pause();
    }, [controller]),
    resume: useCallback(() => controller.resume(), [controller]),
    leave: useCallback(() => controller.leave(), [controller]),
    setMuted: useCallback((muted: boolean) => {
      extra.current.muted = muted;
      transportRef.current?.setMuted?.(muted);
      rerender();
    }, []),
    muted: extra.current.muted,
    /** Los subtítulos de la sala solo se ven si la persona los activa. */
    captionsVisible: extra.current.showCaptions,
    setCaptionsVisible: useCallback((on: boolean) => {
      extra.current.showCaptions = on;
      rerender();
    }, []),
    product: controller.product,
    send: controller.send,
    deleteMine: useCallback(async (id: string) => { const r = await controller.deleteMine(id); rerender(); return r; }, [controller]),
    report: useCallback((id: string, reason: LiveReportReason) => controller.report(id, reason), [controller]),
    block: useCallback(async (id: string) => { const r = await controller.block(id); rerender(); return r; }, [controller]),
    react: useCallback((r: LiveReaction) => controller.react(r), [controller]),
  };
}
export type LiveHandle = ReturnType<typeof useLive>;
