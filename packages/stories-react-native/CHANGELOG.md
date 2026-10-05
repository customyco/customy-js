# @customyai/stories-react-native

## 0.2.0

### Minor Changes

- Opción `realtime` del cliente (desactivada por defecto) con `AppState` como fuente de primer plano, y repintado de `<StoryBar/>` ante la señal de Send; reexporta `createStoriesRealtime` y tipos. Sin cambios para quien no lo active.

Opt-in `realtime` client option (off by default) using `AppState` as the foreground source, and `<StoryBar/>` refresh on Send signals; re-exports `createStoriesRealtime` and types. No change for consumers that do not enable it.

## 0.1.0

### Minor Changes

- Primera versión: barra de historias, visor a pantalla completa, banners, provider y hooks (y modo headless) sobre el núcleo de `@customyai/stories-render`; Reanimated y Gesture Handler como pares; vídeo, caché de medios, almacenamiento y Lottie inyectables; módulos opcionales (widgets, video-feed, game, ugc, live).

First release: story bar, full-screen viewer, banners, provider and hooks (plus headless mode) on top of `@customyai/stories-render`; Reanimated and Gesture Handler as peers; injectable video, media cache, storage and Lottie; optional modules (widgets, video-feed, game, ugc, live).
