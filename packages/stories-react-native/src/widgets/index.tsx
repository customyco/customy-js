/**
 * @customyai/stories-react-native/widgets — los widgets ligeros de la Ola 3 en nativo: Canvas, Swipe Cards, Checklist,
 * Tour e Inline, más las anclas por nombre que usan Inline y el Tour. Módulo OPCIONAL (plan §6.6: quien no los usa no
 * paga su peso). El Video Feed y el Game, que pesan más, viven en `./video-feed` y `./game`.
 *
 *   <StoriesProvider client={client} …>
 *     <StoriesWidget kind="canvas" placementId="home_canvas" />
 *     <StoriesWidget kind="checklist" placementId="onboarding" />   // checklist o tour, según su `mode`
 *     <InlineHost placementId="home_inline" />                       // las tarjetas aparecen en sus anclas
 *     <StoriesAnchor id="home.header">…</StoriesAnchor>
 *   </StoriesProvider>
 *
 * Cada uno entrega UN widget por placement y tipo, con las reglas de entrega del cliente (kill, `min_sdk`, calendario,
 * frecuencia, descartes, grupo de control = impresión sin pintar, pausa de superficie `widget` que difiere).
 */
import type { WidgetEvent } from "../core";
import type { UsePlacementOptions } from "../placement";
import { useBoundWidget, joinEvents } from "./bound";
import { useWidgetLifecycle } from "./common";
import { CanvasView, type CanvasViewProps } from "./canvas";
import { ChecklistView, type ChecklistViewProps } from "./checklist";
import { InlineHost, type InlineHostProps } from "./inline";
import { SwipeCardsView, type SwipeCardsViewProps } from "./swipe-cards";
import { TourView, type TourViewProps } from "./tour";
import type { WidgetMessages } from "./messages";
import { defaultAnchorRegistry, type AnchorRegistry } from "./anchors";

export type BoundWidgetProps = UsePlacementOptions & {
  placementId: string;
  /** Los eventos también a la app (el cliente ya los recibe en su cola). */
  onEvent?: (e: WidgetEvent) => void;
  messages?: Partial<WidgetMessages>;
  testID?: string;
};

/** Canvas de un placement. Se oculta solo si hay kill, `min_sdk` mayor, frecuencia agotada o nada que mostrar. */
export function StoriesCanvas({ placementId, onEvent, messages, testID, ...query }: BoundWidgetProps) {
  const { entry, bound } = useBoundWidget("canvas", placementId, query);
  useWidgetLifecycle(placementId, !!entry);
  if (!entry || !bound) return null;
  return <CanvasView key={entry.id} entry={entry} onEvent={joinEvents(bound, onEvent)} messages={messages} testID={testID} />;
}

/** Swipe Cards de un placement; lo ya deslizado (`remember_swipes`) sale del mazo. */
export function StoriesSwipeCards({ placementId, onEvent, messages, testID, ...query }: BoundWidgetProps) {
  const { entry, bound } = useBoundWidget("swipe_cards", placementId, query);
  useWidgetLifecycle(placementId, !!entry);
  if (!entry || !bound) return null;
  return <SwipeCardsView key={entry.id} entry={entry} progress={bound.progress} onEvent={joinEvents(bound, onEvent)} messages={messages} testID={testID} />;
}

/** Checklist o Tour de un placement (según `config.mode`). Un checklist vive hasta completarse o descartarse; un tour, hasta terminarlo u omitirlo. */
export function StoriesChecklist({ placementId, onEvent, messages, testID, controllerRef, registry, ...query }: BoundWidgetProps & Pick<ChecklistViewProps, "registry" | "controllerRef">) {
  const { entry, bound } = useBoundWidget("checklist", placementId, query);
  useWidgetLifecycle(placementId, !!entry);
  if (!entry || !bound) return null;
  const events = joinEvents(bound, onEvent);
  if (entry.config.mode === "tour") return <TourView key={entry.id} entry={entry} onEvent={events} registry={registry} messages={messages} testID={testID} />;
  return <ChecklistView key={entry.id} entry={entry} progress={bound.progress} onEvent={events} registry={registry} controllerRef={controllerRef} messages={messages} testID={testID} />;
}

export type StoriesWidgetProps = (BoundWidgetProps & { kind: "canvas" | "swipe_cards" | "checklist" }) | (InlineHostProps & { kind: "inline" });

/**
 * Un widget por tipo: `kind` elige. `video_feed` y `game` se importan de `./video-feed` y `./game` (pesan más y no
 * entran en este módulo): `<StoriesWidget kind="video_feed" …>` no existe a propósito.
 */
export function StoriesWidget(props: StoriesWidgetProps) {
  if (props.kind === "inline") {
    const { kind: _k, ...rest } = props;
    return <InlineHost {...rest} />;
  }
  const { kind, ...rest } = props;
  if (kind === "canvas") return <StoriesCanvas {...rest} />;
  if (kind === "swipe_cards") return <StoriesSwipeCards {...rest} />;
  return <StoriesChecklist {...rest} />;
}

/**
 * La app avisa de un evento suyo («añadió al carrito», «terminó el perfil»): completa los ítems de los checklist cuyo
 * `complete_on` es `{ type: "event", event }`. Idempotente y en orden (`ordered`). Va al registro único de la app, o al que se pase.
 */
export function notifyChecklistEvent(event: string, registry: AnchorRegistry = defaultAnchorRegistry): void {
  registry.notify(event);
}

export { CanvasView, ChecklistView, InlineHost, SwipeCardsView, TourView };
export type { CanvasViewProps, ChecklistViewProps, InlineHostProps, SwipeCardsViewProps, TourViewProps };
export { InlineView, type InlineViewProps } from "./inline-view";
export { SWIPE_THRESHOLD } from "./swipe-cards";
export {
  AnchorRegistryProvider,
  InlineListItem,
  StoriesAnchor,
  createAnchorRegistry,
  defaultAnchorRegistry,
  insertInlineSlots,
  isInlineSlot,
  useAnchor,
  useAnchorRegistry,
  useInlineList,
  type AnchorNode,
  type AnchorRegistry,
  type InlineEntry,
  type InlineSlot,
  type Rect,
  type StoriesAnchorProps,
} from "./anchors";
export { useBoundWidget, joinEvents, type BoundWidget } from "./bound";
export { resolveWidgetMessages, type WidgetMessages } from "./messages";
export { widgetElementId, widgetEmitter, safeColor, type WidgetEvent, type WidgetEventInput } from "./common";
export { useWidgetEnv } from "./env";
// Controladores puros del núcleo (modo headless / interfaz propia): los mismos que usa el renderer web.
export { createSwipeDeck, swipeKey, type SwipeDeck } from "@customyai/stories-render/widgets/swipe-cards";
export { createChecklist, nextOpen, type ChecklistController } from "@customyai/stories-render/widgets/checklist";
export { createTour, popoverPosition, type TourController } from "@customyai/stories-render/widgets/tour";
export { masonryColumns } from "@customyai/stories-render/widgets/canvas";
