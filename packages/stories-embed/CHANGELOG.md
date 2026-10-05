# @customyai/stories-embed

## 0.2.0

### Minor Changes

- Opción `realtime` (desactivada por defecto): el embed vuelve a pedir el placement cuando Send avisa de un cambio, usando el cliente de `@customyai/stories-render` 0.2.0. El mensaje `ready` anuncia `stories-render/0.2.0`.

New `realtime` option (off by default): the embed refetches the placement when Send signals a change, using the `@customyai/stories-render` 0.2.0 client. The `ready` message announces `stories-render/0.2.0`.

## 0.1.0

### Minor Changes

- Primera versión: bundle autónomo (ESM + IIFE `<script>`) para WebView y sitios sin bundler, con puente de mensajes nativo versionado y validado (iOS, Android, React Native, Flutter, Unity, iframe); los módulos pesados cargan de forma diferida.

First release: self-contained bundle (ESM + IIFE `<script>`) for WebViews and bundler-less sites, with a versioned, strictly validated native message bridge (iOS, Android, React Native, Flutter, Unity, iframe); heavy modules load lazily.
