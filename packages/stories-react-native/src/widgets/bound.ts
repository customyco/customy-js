import { useMemo, useRef, useSyncExternalStore } from "react";
import type { Delivery, WidgetEvent, WidgetKind, WidgetProgress } from "../core";
import { useStoriesClient, useStoriesContext } from "../context";
import { usePlacement, type UsePlacementOptions } from "../placement";

type OneKind = "video_feed" | "swipe_cards" | "canvas" | "checklist" | "game";
export type BoundWidget = { progress: WidgetProgress; onEvent: (e: WidgetEvent) => void };

/**
 * El widget de UN tipo que toca mostrar en un placement, ya ligado al cliente (`client.bindWidget`): kill por superficie y
 * `min_sdk` (el cliente de placements vacía el widget y aquí desaparece), calendario, frecuencia, descartes, un ganador por
 * tipo y el grupo de control (impresión sin pintar: ya la registró `deliver`) vienen del cliente; aquí no se reimplementa nada.
 *
 * Pausa de superficie (`pause("widget")`): lo NUEVO se difiere (no aparece hasta reanudar) y lo que ya está en pantalla
 * se queda —no se arranca de las manos de la persona—; `paused` avisa para que lo que suena (vídeo) se detenga.
 * Un widget ya pintado tampoco desaparece porque su propia impresión agote la frecuencia.
 */
export function useBoundWidget<K extends OneKind>(kind: K, placementId: string, options: UsePlacementOptions = {}): { entry: NonNullable<Delivery["widgets"][K]> | null; bound: BoundWidget | null; paused: boolean } {
  const client = useStoriesClient();
  const ctx = useStoriesContext();
  const { delivery } = usePlacement(placementId, { ...options, locale: options.locale ?? ctx.locale });
  const current = (delivery?.widgets[kind] ?? null) as NonNullable<Delivery["widgets"][K]> | null;
  const last = useRef(current);
  if (current) last.current = current;
  const kept = last.current;
  const sticky = !current && !!kept && !!delivery && (delivery.held.paused.includes("widget") || delivery.held.frequency.includes(kept.id));
  const entry = current ?? (sticky ? kept : null);
  const bound = useMemo<BoundWidget | null>(() => (entry ? client.bindWidget(placementId, kind as WidgetKind, entry as { id: string; expires_at?: string; progress?: WidgetProgress; config?: { mode?: string } }) : null), [client, placementId, kind, entry]);
  const paused = useSyncExternalStore(client.surfaces.subscribe, () => client.surfaces.isPaused("widget"), () => false);
  return { entry, bound, paused };
}

/** Une el `onEvent` del cliente con el de la app (el del cliente va primero: la cola nunca depende de la app). */
export function joinEvents(bound: BoundWidget | null, mine?: (e: WidgetEvent) => void): (e: WidgetEvent) => void {
  return (e) => {
    bound?.onEvent(e);
    mine?.(e);
  };
}
