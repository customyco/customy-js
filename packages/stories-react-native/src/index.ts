/**
 * @customyai/stories-react-native — Customy Stories y Banners para React Native.
 *
 * Reutiliza el núcleo puro de `@customyai/stories-render` (máquina de estados, orden, visto, precarga, gestos,
 * layout, animación, a11y, cliente de placements y eventos) y aporta la interfaz nativa: `<StoryBar/>`,
 * `<StoryViewer/>`, `<Banner/>`, `StoriesProvider` y `usePlacement`. Reanimated y Gesture Handler son peers.
 * Vídeo, caché de medios, almacenamiento y Lottie se inyectan; los componentes de la Ola 2 son un módulo opcional.
 */
export { StoriesProvider, useStoriesClient, useStoriesContext, type LinkContext, type StoriesContextValue, type StoriesProviderProps, type WidgetCallbacks } from "./context";
export { usePlacement, type UsePlacementOptions, type UsePlacementState } from "./placement";
export { StoryBar, Banner, StoryViewer, type BannerProps, type StoryBarProps, type StoryViewerProps } from "./bound";
export { StoryBarView, type StoryBarViewProps } from "./story-bar";
export { StoryViewerView, type StoryViewerViewProps } from "./viewer";
export { BannerView, type BannerViewProps } from "./banner";
export { createNativeStoriesClient } from "./native-client";
export { resolveTheme, pickScheme, type ColorScheme, type StoriesTheme, type StoriesThemeInput } from "./theme";
export { createDefaultMediaCache, composeAssetLoader, type DefaultMediaCacheOptions, type MediaCache } from "./media";
export { isSafeAction, openActionDefault } from "./links";
export { buildSequence, mergeBarStyle, DEFAULT_BAR_STYLE } from "./sequence";
export { motionAt, toMotionSpecs, cubicBezier, type Motion, type MotionSpec } from "./motion";
export { fallbackInsets, type Insets } from "./insets";
export { useReducedMotion, useScreenReader } from "./hooks";
export { Interactive, useClaimTouch } from "./viewer/gestures";
export { useViewerState, useViewerSelector } from "./viewer/use-viewer";
export type { StoryComponentProps, ComponentRenderers, PageAction, PageActionsProvider } from "./component-api";
// Sin pintar nada: `session_id`, conversiones, exposición propia y pausa por superficie (`pause("widget")`).
export { useStoriesActions, useSurfacePause, useIsSurfacePaused } from "./actions";
export type { LottieAdapter, StoryLottieProps, StoryVideoProps, VideoPlayerAdapter, KeyValueStore } from "./adapters";
// Modo headless y núcleo compartido: `createStoryViewer`, `createBannerController`, `toHeadlessPayload`, tipos…
export * from "./core";
