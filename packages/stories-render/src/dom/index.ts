/**
 * @customyai/stories-render/dom — componentes web (sin framework). Importa también los estilos:
 * `import "@customyai/stories-render/styles.css"`.
 */
export { openStoryViewer, type PageAction, type PageActionsProvider, type StoryViewerHandle, type StoryViewerUiOptions } from "./viewer";
export { mountStoryBar, DEFAULT_BAR_STYLE, type StoryBarHandle, type StoryBarUiOptions } from "./story-bar";
export { mountBanner, type BannerHandle, type BannerUiOptions } from "./banner";
export { browserAssetLoader, defaultOpenLink, isSafeDeepLink, prefersReducedMotion, type UiOptions } from "./util";
export type { LottieFactory, LottieInstance, LottieLoader } from "./lottie-types";
export type { ComponentCtx, ComponentRegistry, ComponentRenderer, ComponentsLoader } from "./component-api";
