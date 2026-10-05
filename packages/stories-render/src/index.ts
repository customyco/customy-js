/**
 * @customyai/stories-render — núcleo headless (sin DOM) de Customy Stories y Banners.
 * La interfaz web vive en `./dom`, la de React en `./react` y Lottie (opcional) en `./lottie`.
 */
export * from "./types";
export type { StoryCommerceContext } from "./commerce";
export { systemClock, pageDurationMs, pageHasVideo, type Clock, type TimerHandle } from "./clock";
export { createMemoryStore, storeFromWebStorage, readJson, type KeyValueStore } from "./store";
export { createSeenTracker, type SeenTracker, type SeenRecord, type SeenStatus } from "./seen";
export { orderGroups, placeNudges, isNudge, type OrderOptions } from "./order";
export { evaluateVisibility } from "./visibility";
export { viewportFromWidth, viewportFit, relativeBox, safeInsets, layerBox, componentBox, fontPx, sortByZ, mirrorBox, type Viewport, type Box } from "./layout";
export { resolveAnimations, animationCssValue, easingCss, countdownParts, type ResolvedAnimation } from "./animation";
export { createGestureRecognizer, type GestureIntent, type GestureOptions } from "./gestures";
export { createPagePlayer, type PagePlayer, type PagePlayerOptions, type PageSnapshot, type PageState, type PauseReason } from "./page-player";
export { createPreloader, pageAssets, planPreload, pageKey, type AssetKind, type AssetLoader, type PreloadAsset, type PreloadHandle, type PreloadResult, type Preloader, type PreloaderOptions } from "./preload";
export { createStoryViewer, viewableGroups, type ReportReason, type CloseReason, type StoryViewer, type ViewerEvent, type ViewerGroup, type ViewerOptions, type ViewerState, type ViewerVia } from "./viewer";
export { createBannerController, type BannerController, type BannerEvent, type BannerOptions, type BannerState, type BannerVia, type DismissReason } from "./banner";
export { resolveMessages, fmt, isRtlLocale, type Messages } from "./messages";
export { groupAriaLabel, pageAnnouncement } from "./a11y";
