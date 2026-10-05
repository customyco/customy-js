/**
 * @customyai/stories-render/client — cliente de placements, eventos y reglas de entrega.
 * Sin DOM ni React: sirve en el navegador, React Native y servidor (modo headless).
 */
export { createStoriesClient, type DeliverResult, type StoriesClient, type StoriesClientOptions } from "./stories-client";
export { storyCartAttributes, readStoryContext, type StoryCommerceContext } from "../commerce";
export { createConversionReporter, purchaseBody, type ConversionReporter, type ConversionReporterOptions, type PurchaseInput } from "./conversions";
export { createPlacementClient, processPlacement, assertPlacementResponse, type PlacementClient, type PlacementClientOptions, type PlacementQuery, type PlacementResult, type PlacementStatus } from "./placements";
export { createEventQueue, randomEventId, MAX_EVENTS_PER_BATCH, type Consent, type ConsentPurpose, type EventContext, type EventQueue, type EventQueueOptions, type WireEvent } from "./events";
export {
  bannerFrequencyKey,
  compareBanners,
  createDismissStore,
  createFrequencyTracker,
  createOverlayGate,
  createSurfaceControl,
  DEFAULT_FREQUENCY,
  selectDelivery,
  storyFrequencyKey,
  widgetFrequencyKey,
  type Delivery,
  type DeliveryContext,
  type DismissStore,
  type FrequencyTracker,
  type OverlayGate,
  type StoryBarDelivery,
  type SurfaceControl,
  type PausableSurface,
} from "./delivery";
export { toHeadlessPayload, type HeadlessItem, type StoriesHeadlessPayload } from "./headless";
export { StoriesError, type StoriesErrorCode } from "./errors";
export { compareVersions, STORIES_SDK_ID, STORIES_SDK_VERSION } from "./version";
export { createWidgetProgressStore, type WidgetProgressStore } from "../widgets/progress";
export type { WidgetEvent, WidgetEventInput } from "../widgets/common";
export { createStoriesRealtime, backoffDelay, documentForeground, STORY_SIGNAL_TYPES, type ForegroundSource, type RealtimeStatus, type StoriesRealtime, type StoriesRealtimeOptions, type WebSocketCtor, type WebSocketLike } from "./realtime";
