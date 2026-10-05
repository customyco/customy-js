# @customyai/stories-render

## 0.2.0

### Minor Changes

- Cliente en tiempo real opcional (`realtime`): invalidación de placements por WebSocket con respaldo de sondeo (`poll`) y reintento exponencial (`backoff`); desactivado por defecto, sin cambios para quien no lo active. `STORIES_SDK_VERSION` pasa a 0.2.0.

Opt-in realtime client (`realtime`): placement invalidation over WebSocket with a polling fallback and exponential backoff; off by default, no change for consumers that do not enable it. `STORIES_SDK_VERSION` is now 0.2.0.

## 0.1.0

### Minor Changes

- Primera versión: núcleo headless (máquina de páginas, orden, visto, precarga, gestos, layout), componentes web y React para barra de historias, visor y banners, cliente de placements/eventos/entrega con atribución de ingresos, y módulos opcionales (`./components`, `./lottie`, `./video`, `./widgets/*`, `./ugc`). Textos es/en/pt.

First release: headless core, light web and React components for story bars, viewers and banners, placements/events/delivery client with revenue attribution, and optional modules (components, Lottie, video, widgets, UGC). Strings in es/en/pt.
