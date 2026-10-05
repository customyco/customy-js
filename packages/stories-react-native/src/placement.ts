import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toHeadlessPayload, type Delivery, type PlacementQuery, type PlacementResult, type StoriesHeadlessPayload } from "./core";
import { useStoriesClient } from "./context";

export type UsePlacementOptions = PlacementQuery & {
  /** `false` = no pedir ahora (p. ej. antes del consentimiento). Por defecto true. */
  enabled?: boolean;
  /**
   * Cualquier cambio de este valor vuelve a pedir el placement saltándose la caché (p. ej. un contador que sube al volver
   * la app a primer plano, o la señal realtime `widgets.changed`). Es lo que retira un widget tras un kill de superficie:
   * el cliente de placements lo entrega vacío y el componente desaparece.
   */
  refreshKey?: string | number;
};

export type UsePlacementState = {
  status: "idle" | "loading" | "ready" | "error";
  result: PlacementResult | null;
  /** Lo que toca mostrar según las reglas de entrega (frecuencia, descartes, pausa por superficie, kill y `min_sdk`). */
  delivery: Delivery | null;
  /** El mismo contenido en JSON plano (modo headless): pinta con tu propia UI y usa el núcleo para el comportamiento. */
  headless: StoriesHeadlessPayload | null;
  error: unknown;
  refresh: () => void;
};

/**
 * Pide el placement, aplica kill/`min_sdk` y las reglas de entrega, registra el grupo de control (impresión sin
 * render) y se recalcula cuando una superficie se pausa o se reanuda (lo pausado se DIFIERE, no se descarta).
 */
export function usePlacement(placementId: string, options: UsePlacementOptions = {}): UsePlacementState {
  const client = useStoriesClient();
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<{ status: UsePlacementState["status"]; result: PlacementResult | null; error: unknown }>({ status: enabled ? "loading" : "idle", result: null, error: null });
  const [tick, setTick] = useState(0);
  const paused = useSyncExternalStore(
    client.surfaces.subscribe,
    () => `${client.surfaces.isPaused("story")}|${client.surfaces.isPaused("banner")}|${client.surfaces.isPaused("widget")}`,
    () => "false|false|false",
  );

  const { locale, appVersion, platform, refreshKey } = options;
  const lastKey = useRef(refreshKey);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const keyChanged = lastKey.current !== refreshKey;
    lastKey.current = refreshKey;
    setState((s) => ({ ...s, status: s.result ? "ready" : "loading" }));
    client
      .deliver(placementId, { locale, appVersion, platform, force: tick > 0 || keyChanged })
      .then(({ result }) => alive && setState({ status: "ready", result, error: null }))
      .catch((error: unknown) => alive && setState((s) => ({ status: "error", result: s.result, error })));
    return () => {
      alive = false;
    };
  }, [client, placementId, enabled, locale, appVersion, platform, tick, refreshKey]);

  // Tiempo real (opción `realtime` del cliente): la señal de Send fuerza una nueva lectura sin esperar el ttl.
  useEffect(() => {
    if (!enabled) return;
    return client.realtime.watch(placementId, () => setTick((t) => t + 1));
  }, [client, placementId, enabled]);

  // `paused` fuerza el recálculo al pausar/reanudar una superficie.
  const delivery = useMemo(() => (state.result ? client.select(state.result) : null), [client, state.result, paused]);
  const headless = useMemo(() => {
    const r = state.result;
    return r?.response ? toHeadlessPayload({ ...r.response, widgets: r.widgets }) : null;
  }, [state.result]);

  return { ...state, delivery, headless, refresh: () => setTick((t) => t + 1) };
}
