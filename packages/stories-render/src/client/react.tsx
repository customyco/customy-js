/**
 * @customyai/stories-render/client/react — hooks y componentes ligados a un `StoriesClient`.
 *
 *   const client = createStoriesClient({ token, platform: "web", locale: "es", store });
 *   <StoriesProvider client={client}>
 *     <StoryBar placementId="home_top" />
 *     <Banner placementId="home_banner" />
 *   </StoriesProvider>
 *
 * Headless: `usePlacement(id)` devuelve `result`, `delivery` y `headless` para pintar con tu UI.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Banner as BannerView, StoryBar as StoryBarView, StoryViewer as StoryViewerView, type BannerProps, type StoryBarProps, type StoryViewerProps } from "../react/index";
import { toHeadlessPayload, type StoriesHeadlessPayload } from "./headless";
import type { Delivery } from "./delivery";
import type { PlacementQuery, PlacementResult } from "./placements";
import type { StoriesClient } from "./stories-client";
import type { StoryGroup } from "../types";

const Ctx = createContext<StoriesClient | null>(null);

export function StoriesProvider({ client, children }: { client: StoriesClient; children?: ReactNode }) {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useStoriesClient(): StoriesClient {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStoriesClient: falta <StoriesProvider client={…}> más arriba");
  return c;
}

export type UsePlacementOptions = PlacementQuery & {
  /** `false` = no pedir ahora (p. ej. antes del consentimiento). Por defecto true. */
  enabled?: boolean;
};

export type UsePlacementState = {
  status: "idle" | "loading" | "ready" | "error";
  result: PlacementResult | null;
  /** Lo que toca mostrar según las reglas de entrega (frecuencia, descartes, pausa por superficie). */
  delivery: Delivery | null;
  /** El mismo contenido en JSON plano, para pintar con tu UI. */
  headless: StoriesHeadlessPayload | null;
  error: unknown;
  refresh: () => void;
};

/**
 * Pide el placement, aplica kill/`min_sdk` y las reglas de entrega, registra el grupo de control
 * (impresión sin render) y se recalcula cuando una superficie se pausa o se reanuda.
 */
export function usePlacement(placementId: string, options: UsePlacementOptions = {}): UsePlacementState {
  const client = useStoriesClient();
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<{ status: UsePlacementState["status"]; result: PlacementResult | null; error: unknown }>({ status: enabled ? "loading" : "idle", result: null, error: null });
  const [tick, setTick] = useState(0);
  const paused = useSyncExternalStore(
    client.surfaces.subscribe,
    () => `${client.surfaces.isPaused("story")}|${client.surfaces.isPaused("banner")}`,
    () => "false|false",
  );

  const { locale, appVersion, platform } = options;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((s) => ({ ...s, status: s.result ? "ready" : "loading" }));
    client
      .deliver(placementId, { locale, appVersion, platform, force: tick > 0 })
      .then(({ result }) => alive && setState({ status: "ready", result, error: null }))
      .catch((error: unknown) => alive && setState((s) => ({ status: "error", result: s.result, error })));
    return () => {
      alive = false;
    };
  }, [client, placementId, enabled, locale, appVersion, platform, tick]);

  // Tiempo real (opción `realtime` del cliente): la señal de Send fuerza una nueva lectura sin esperar el ttl.
  useEffect(() => {
    if (!enabled) return;
    return client.realtime.watch(placementId, () => setTick((t) => t + 1));
  }, [client, placementId, enabled]);

  const delivery = useMemo(
    () => (state.result ? client.select(state.result) : null),
    // `paused` fuerza el recálculo al pausar/reanudar una superficie (lo pausado se difiere, no se pierde).
    [client, state.result, paused],
  );
  const headless = useMemo(() => {
    const r = state.result;
    if (!r?.response) return null;
    return toHeadlessPayload({ ...r.response, widgets: r.widgets });
  }, [state.result]);

  return { ...state, delivery, headless, refresh: () => setTick((t) => t + 1) };
}

type Query = UsePlacementOptions & { className?: string };

export type BoundStoryBarProps = { placementId: string } & Query & Partial<Omit<StoryBarProps, "groups" | "className">>;

/** Barra de historias del placement: se oculta sola si hay kill, `min_sdk` mayor o nada que mostrar. */
export function StoryBar({ placementId, locale, appVersion, platform, enabled, className, ...rest }: BoundStoryBarProps) {
  const client = useStoriesClient();
  const { delivery } = usePlacement(placementId, { locale, appVersion, platform, enabled });
  const bar = delivery?.storyBars[0];
  // Las opciones ligadas se calculan una vez por entrega (la barra se re-monta si cambia `seen`).
  const bound = useMemo(() => (bar ? client.bindStoryBar(placementId, bar) : null), [client, placementId, bar]);
  if (!bar || !bound || bar.groups.length === 0) return null;
  const mine = bound.viewer ?? {};
  return <StoryBarView {...rest} className={className} locale={locale} groups={bound.groups} style={{ ...bound.style, ...rest.style }} seen={bound.seen} canOpen={bound.canOpen} onRender={bound.onRender} viewer={{ ...rest.viewer, ...mine, onEvent: (e) => { mine.onEvent?.(e); rest.viewer?.onEvent?.(e); }, onClose: (r) => { mine.onClose?.(r); rest.viewer?.onClose?.(r); } }} />;
}

export type BoundBannerProps = { placementId: string } & Query & Partial<Omit<BannerProps, "banner" | "className">>;

/** UN banner por placement: el de mayor prioridad que pase frecuencia y descartes. */
export function Banner({ placementId, locale, appVersion, platform, enabled, className, ...rest }: BoundBannerProps) {
  const client = useStoriesClient();
  const { delivery } = usePlacement(placementId, { locale, appVersion, platform, enabled });
  const banner = delivery?.banner ?? null;
  const bound = useMemo(() => (banner ? client.bindBanner(placementId, banner) : null), [client, placementId, banner]);
  if (!banner || !bound) return null;
  return (
    <BannerView
      {...rest}
      className={className}
      locale={locale}
      banner={bound.banner}
      onEvent={(e) => {
        bound.onEvent?.(e);
        rest.onEvent?.(e);
      }}
      onDismiss={(r) => {
        bound.onDismiss?.(r);
        rest.onDismiss?.(r);
      }}
    />
  );
}

export type BoundStoryViewerProps = { placementId: string; open: boolean } & UsePlacementOptions & Partial<Omit<StoryViewerProps, "groups" | "open">>;

/** Visor controlado: abre sobre los grupos del placement (un overlay a la vez). */
export function StoryViewer({ placementId, open, locale, appVersion, platform, enabled, ...rest }: BoundStoryViewerProps) {
  const client = useStoriesClient();
  const { delivery } = usePlacement(placementId, { locale, appVersion, platform, enabled });
  const groups: StoryGroup[] = delivery?.storyBars[0]?.groups ?? [];
  const bound = useMemo(() => (delivery?.storyBars[0] ? client.bindStoryBar(placementId, delivery.storyBars[0]) : null), [client, placementId, delivery]);
  const release = useRef<(() => void) | null>(null);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!open || groups.length === 0) {
      setGranted(false);
      return;
    }
    const r = client.overlays.tryAcquire("story-viewer");
    if (!r) {
      setGranted(false);
      return;
    }
    release.current = r;
    setGranted(true);
    return () => {
      r();
      release.current = null;
      setGranted(false);
    };
  }, [client, open, groups.length]);

  const mine = bound?.viewer ?? {};
  return (
    <StoryViewerView
      {...rest}
      locale={locale}
      groups={groups}
      seen={client.seen}
      open={open && granted}
      onEvent={(e) => {
        mine.onEvent?.(e);
        rest.onEvent?.(e);
      }}
      onClose={(r) => {
        mine.onClose?.(r);
        rest.onClose?.(r);
      }}
    />
  );
}
