# @customyai/stories-render

Renderer de **Customy Stories y Banners**: núcleo *headless* (sin DOM) + componentes web y React ligeros + cliente de placements/eventos/entrega. Consume la respuesta de `GET /client/placements/:id` (contrato de Stories, versión 1) y publica los eventos en `POST /client/events`.

> Estado: **Ola 1**. Widgets `story_bar` y `banner`; componentes `button`/`swipe_up`, `poll`, `countdown` (recordatorio opt-in) y `promo_code`; capas `video | image | text | shape | lottie | sticker`. Los componentes reservados (Olas 2–3) se omiten sin romper la página.

## Install and minimal use (English)

```sh
npm install @customyai/stories-render
# optional peers: react >=18 (for ./react and ./client/react), lottie-web >=5.12 (for ./lottie)
```

```ts
import "@customyai/stories-render/styles.css";
import { createStoriesClient } from "@customyai/stories-render/client";
import { mountStoryBar } from "@customyai/stories-render/dom";

const client = createStoriesClient({
  baseUrl: "https://send-api.customy.ai", // https only (http only toward localhost)
  token: () => fetch("/api/stories-token").then((r) => r.text()), // subscriber token minted by YOUR backend
  platform: "web",
  locale: "en",
  store: { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k) },
});
const { delivery } = await client.deliver("home_top");
const bar = delivery.storyBars[0];
if (bar) mountStoryBar(document.querySelector("#stories")!, { ...client.bindStoryBar("home_top", bar), locale: "en" });
```

The rest of this document is in Spanish; every entry point is typed and the API surface is tracked in `api-report/`. Subpath table, React usage, headless mode and limits follow below.

## Instalación

```sh
npm install @customyai/stories-render
```

Peers opcionales: `react >=18` (`./react`, `./client/react`) y `lottie-web >=5.12` (`./lottie`). El uso mínimo está arriba (en inglés) y en las secciones «Web», «React» y «Headless».

## Subrutas

| Import | Qué trae | gzip* |
|---|---|---|
| `@customyai/stories-render` | Núcleo puro: máquina de página, visor, banner, orden, visto, precarga, gestos, layout, animaciones | 7,9 KB |
| `@customyai/stories-render/dom` | `mountStoryBar`, `openStoryViewer`, `mountBanner` (vanilla, `<dialog>`) | 14,3 KB |
| `@customyai/stories-render/react` | `<StoryBar/>`, `<Banner/>`, `<StoryViewer/>` sobre `./dom` | 14,7 KB |
| `@customyai/stories-render/client` | Cliente: placements (ETag/ttl/kill/`min_sdk`), eventos idempotentes, entrega, headless | 7,1 KB |
| `@customyai/stories-render/client/react` | `StoriesProvider`, `usePlacement`, `<StoryBar/>`, `<Banner/>`, `<StoryViewer/>` ligados al cliente | 16,0 KB |
| `@customyai/stories-render/components` | **Ola 2**, opcional: quiz, emoji_reaction, rating, emoji_slider, question, share, timestamp, call/whatsapp/map, form, add_to_calendar, gif, product_tag/cards, cart, wishlist | 5,2 KB |
| `@customyai/stories-render/video` | **Ola 2**, opcional: reproductor por capacidad (HLS nativo / hls.js diferido / MP4 < 30 s), póster + BlurHash, autoplay `muted playsinline` con botón de play si se rechaza, precarga en ventana (actual, siguiente, anterior) | 4,7 KB + `hls.js` (de la app) |
| `@customyai/stories-render/lottie` | Fábrica opcional sobre `lottie-web` (peer opcional) | 0,2 KB + `lottie-web` |
| `@customyai/stories-render/widgets/<tipo>` | **Ola 3**, opcional, uno por widget (`canvas`, y los que se vayan sumando: `inline`, `swipe-cards`, `checklist`, `video-feed`): `mountCanvas(container, { entry, onEvent })`, más las partes puras (`masonryColumns`) | 3,3 KB (comparte textos y ayudas con los demás) |
| `@customyai/stories-render/widgets/react` | `createReactWidget(mountCanvas)` → componente de React para cualquier `mountX` de los widgets | 0,3 KB |
| `@customyai/stories-render/widgets.css` | Estilos de los widgets de la Ola 3 (se importa junto a `styles.css`) | — |
| `@customyai/stories-render/ugc` | **Ola 4**, opcional: historias de la comunidad (UGC con moderación): `createUgcClient` (enviar, «mis historias», reclamar, borrar, reportar, bloquear, exportar), `ugcPageActions` (el «⋯» del visor: reportar / no ver más a esta persona), `mountUgcComposer`, `mountUgcMine`; textos es/en/pt | 7,2 KB |
| `@customyai/stories-render/ugc.css` | Estilos de lo anterior (se importa junto a `styles.css`) | — |
| `@customyai/stories-render/widgets/game` | **Ola 4**, opcional: Game Center — `mountGame` (ruleta, rasca y gana, tarjeta de premio, memoria, tres iguales), `createGameController` (el cliente PIDE `play`, el servidor decide), `createGameApi`, `openGameDialog` (para el componente `game`); textos es/en/pt | 9,2 KB |
| `@customyai/stories-render/widgets/ads` | **Ola 4**, opcional y sin DOM: anuncios en historias — `createAdsController` (pide `GET /client/placements/:id/ads`, intercala los anuncios con tope por sesión, plazo y colapso del hueco), `fromViewerEvent` (los eventos de un anuncio van a `/client/ads/events`, NUNCA a los de historias, y cada uno lleva el `receipt` de entrega firmado del candidato o del hueco; sin recibo no se envía), `interleave`/`adPositions`, `validateNativeCreative`, la interfaz `AdProvider` (programático: apagado por defecto, exige consentimiento `third_party`, sin GPC ni menores) y `createExampleWebAdapter` (inactivo); textos es/en/pt | 3,1 KB |
| `@customyai/stories-render/game.css` | Estilos de lo anterior (se importa junto a `styles.css` y `widgets.css`) | — |
| `@customyai/stories-render/styles.css` | Estilos (tokens `hsl(var(--…))`) | 3,7 KB |

\* min+gzip por entrada medida con esbuild (`pnpm size`); `react` y `lottie-web` quedan fuera. Cada entrada incluye el núcleo que usa, así que **no se suman**: una app web con React descarga ~16 KB + 3,7 KB de CSS. Presupuestos en `size-budget.json`.

**Componentes de la Ola 2** (módulo opcional, como Lottie): `openStoryViewer({ components })` con `import { components } from "@customyai/stories-render/components"`, o `loadComponents: () => import(...).then(m => m.components)`. Sin él, los componentes nuevos se omiten sin romper la página. Opciones: `openForm(formId, ctx)` (Forms por id; sin ella el `form` no se pinta), `resolveProducts(refs)` (precio y stock en vivo; sin ella solo la referencia), `onAddToCart` / `onWishlist` (el carrito lo decide la app; el visor registra `add_to_cart` / `wishlist_added`). Ramificación: una página o componente con `visibility` (AND/OR sobre respuestas de poll/quiz del mismo grupo) se salta o se oculta con la misma lógica que el servidor (`evaluateVisibility`). `mode: "nudge"` se coloca tras `position` grupos normales (máx. 4 por disturbance); `mode: "sponsored"` pinta la etiqueta arriba y una hoja de transparencia (`role=dialog`, `aria-modal`, foco atrapado, Esc cierra solo la hoja). La pregunta abierta (`question`) está apagada por defecto (`enabled`) y nunca alimenta la ramificación.

**Vídeo (`./video`, opcional).** Consume lo que deja el pipeline de Storage (`GET /v2/items/:id/video` → `story`): `createVideoPlayer(el, { hls, mp4, poster, blurhash, durationMs, captions }, { loadHls: () => import("hls.js").then(m => m.default) })`. Elige entrega por capacidad (`chooseDelivery`: en web, clips < 30 s van por el MP4 progresivo; Safari/WebViews, HLS nativo; el resto, hls.js cargado **solo** al reproducir) y cae a MP4 ante un error fatal. El hueco conserva la proporción y pinta BlurHash → póster → vídeo; `play()` captura el rechazo del navegador (`NotAllowedError`) y enseña un botón de play sobre el póster. `createVideoWindow` + `prefetchFirstSegment` precargan la página siguiente y la anterior (maestra, playlist del escalón inicial, `init.mp4` y primer segmento; o los primeros 256 KB del MP4) y cancelan al saltar. Colores por variables `--cs-video-bg`, `--cs-video-play-bg`, `--cs-video-play-fg`. `hls.js` no es dependencia del paquete.

**Widgets de la Ola 3.** El cliente los entrega igual que un banner: `const { delivery } = await client.deliver("home")` trae `delivery.widgets.{canvas, swipe_cards, video_feed, checklist, inline[]}` (uno por tipo; `inline` uno por ancla) y `client.bindWidget(placementId, kind, entry)` devuelve `{ progress, onEvent }` listos para pasar al `mountX`: cada evento va a la cola (canal `widget`), la frecuencia se anota, un ítem de checklist completado o un producto deslizado se recuerdan en local y **nunca se deshacen** (aunque el placement en caché sea más viejo), y un descarte del usuario no vuelve. Un checklist no gasta frecuencia (sigue hasta completarse o descartarse); un tour sí. `kill.widget` apaga la superficie y `client.surfaces.pause("widget")` la difiere. El modo headless entrega `kind: "widget"` con `widget_kind`, `config`, `entries` y `progress` tal cual.

**Game Center (Ola 4, `./widgets/game`).** `mountGame(host, { entry, api })` con `api = createGameApi({ gameId, token })`. El cliente nunca decide: `play` manda un `attempt_id` (el mismo en un reintento tras perder la red) y el servidor contesta qué premio y qué código; la ruleta, el rasca, la carta, el memory y el «tres iguales» solo ANIMAN ese resultado, y saltarlo («Saltar animación», «Revelar premio», reduce motion) no lo cambia. Las bases (con su versión y enlace), la edad mínima y el consentimiento son casillas reales: sin ellas no se envía nada. Todo tiene botón y teclado, y el resultado se anuncia en una región `aria-live`. Un juego puesto en una página de historia es el componente `game` (referencia por id): pasa `openGame: (id) => openGameDialog({ gameId: id, api: createGameApi({ gameId: id, token }) })` al visor y se abre en un `<dialog>`. Con `audience_may_include_minors` el servidor solo entrega juegos declarados de entretenimiento (sin premios de valor ni datos).

**Historias de la comunidad (Ola 4, `./ugc`).** Un grupo con `community` en la respuesta del placement es una comunidad: `mountUgcComposer(host, { groupId, community, client, uploadMedia })` ofrece «comparte tu historia» con los términos versionados (`community.terms_version`; si cambian, el servidor responde `terms_outdated` y hay que aceptar de nuevo). El renderer **no sube bytes**: `uploadMedia(file)` es de la app (Storage u otro) y devuelve la referencia ya escaneada. Lo enviado siempre queda en revisión: lo publica una persona del equipo. Las páginas publicadas llegan después de las del grupo con `page.ugc`; pasa `pageActions: ugcPageActions({ client })` a `openStoryViewer` y esas páginas muestran el «⋯» (reportar con motivo y no ver más a esa persona; Apple 1.2 y DSA). `mountUgcMine` enseña el estado y el **motivo** de cada decisión, deja reclamar una vez (la resuelve otra persona), borrar y descargar los propios datos. Con `audience_may_include_minors` el servidor no entrega comunidad ni acepta envíos.

Para no pagar el visor en la carga inicial, importa `./dom` o `./client/react` con `import()` dinámico y deja que lo cargue la primera vista. Las capas Lottie se descargan **solo** si pasas `loadLottie` (módulo opcional).

## Web (sin framework)

```ts
import "@customyai/stories-render/styles.css";
import { createStoriesClient } from "@customyai/stories-render/client";
import { mountStoryBar, mountBanner } from "@customyai/stories-render/dom";

const client = createStoriesClient({
  baseUrl: "https://send-api.customy.ai", // https obligatorio (http solo hacia localhost, 127.0.0.1 o 10.0.2.2): `createStoriesClient` lanza `StoriesError("invalid")`
  token: () => fetch("/api/stories-token").then((r) => r.text()), // token de suscriptor (sst_…) de tu backend
  platform: "web",
  locale: "es",
  store: { // almacenamiento INYECTADO (caché, visto, frecuencia, cola de eventos)
    get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k),
  },
});

const { delivery } = await client.deliver("home_top"); // aplica kill, min_sdk y las reglas de entrega
const bar = delivery.storyBars[0];
if (bar) mountStoryBar(document.querySelector("#stories")!, { ...client.bindStoryBar("home_top", bar), locale: "es" });
if (delivery.banner) mountBanner(document.querySelector("#banner")!, { ...client.bindBanner("home_top", delivery.banner), locale: "es" });

addEventListener("pagehide", () => void client.flush());
```

`bindStoryBar`/`bindBanner` cablean eventos (`impression`, `view`, `next`, `click`, `close`…), frecuencia, descartes y la compuerta «un overlay a la vez». Sin el cliente puedes usar los componentes con tus propios datos: `mountStoryBar(el, { groups, style, seen, viewer: { onEvent } })`.

## React

```tsx
import "@customyai/stories-render/styles.css";
import { createStoriesClient } from "@customyai/stories-render/client";
import { StoriesProvider, StoryBar, Banner, usePlacement } from "@customyai/stories-render/client/react";

const client = createStoriesClient({ token, platform: "web", locale: "es", store });

export function Home() {
  return (
    <StoriesProvider client={client}>
      <StoryBar placementId="home_top" locale="es" />
      <Banner placementId="home_top" locale="es" />
    </StoriesProvider>
  );
}
```

Se ocultan solos con `kill`, `min_sdk` mayor o sin contenido elegible. `<StoryViewer placementId open onClose/>` abre el visor controlado.

## Headless

```ts
const payload = await client.headless("home_top"); // JSON plano: páginas, capas, componentes, duraciones ya resueltas
// o, con la respuesta cruda: import { toHeadlessPayload } from "@customyai/stories-render/client"
```

```tsx
const { delivery, headless, result } = usePlacement("home_top"); // pinta con tu propia UI
```

Si pintas tú, usa el núcleo para el comportamiento: `createStoryViewer({ groups, seen, onEvent })` (estado `getState()/subscribe()`), `createBannerController`, `orderGroups`, `createSeenTracker(store)`, `createPreloader`, `createGestureRecognizer`.

## Ingresos (atribución)

El SDK **nunca habla con Commerce** ni lleva una credencial de servicio: todo pasa por Send con el token de suscriptor.

- `add_to_cart`, `wishlist_added`, vistas y la impresión del grupo de control **ya viajan solos** como eventos del visor (cada uno con `session_id`, el seudónimo aleatorio del arranque, que permite la atribución indirecta). Send los traduce y los reenvía a Commerce.
- `onAddToCart(product, quantity, context)` y `onWishlist(product, context)` reciben `context = { storyId, slideId, componentId }`. Escríbelo en los atributos del carrito de tu tienda con `storyCartAttributes(context, utm)` (mismos nombres que usa el conector de Shopify) y léelo al cerrar el pedido con `readStoryContext(attributes)`.
- La **compra** no existe entre los eventos del SDK: la reporta la tienda al cerrar el pedido, `await client.reportConversion({ orderId, context, utm, products })`. Es una señal **no monetaria**: el servidor descarta `value`, `currency` y `line_value` (obsoletos en el SDK, ignorados); los ingresos los reporta el backend de la tienda con llave API (scope `stories:convert`) en `POST /api/stories/conversions`. Es idempotente por pedido y lanza (503) si el puente está apagado, para que la app reintente el mismo pedido. Sin `context`, la compra cuenta como orgánica.
- En modo headless, `client.reportExposure({ kind: "view" | "product_viewed" | "holdout", placementId, storyId, ... })` registra lo que tu UI mostró.

Detalle, huecos y qué falta en staging: `docs/CUSTOMY_STORY_REVENUE_RESULTS_2026-10-02.md`.

## Comportamiento

- **Página**: `loading → ready → playing ⇄ paused → completed`. Imagen = temporizador (7 s por defecto; `duration_ms` 1–60 s); vídeo = reloj del medio (15 s por defecto) con póster y caída a temporizador si falla. Pausa por **motivos** (`user`, `hold`, `hidden`, `buffering`, `surface`…): solo avanza si no queda ninguno.
- **Visor**: tap en tercios (izq. = anterior, der. = siguiente; espejado en RTL), mantener ≥ 200 ms = pausa y oculta la UI, swipe horizontal = entre grupos, swipe abajo = cerrar, swipe arriba o CTA = abrir el enlace, barra de progreso, compartir (`navigator.share` o `shareUrl`).
- **Lienzo**: coordenadas 0–1 sobre 1080×1920 escaladas por ancho; los componentes se mantienen dentro de la zona segura (250 px arriba / 340 abajo por defecto); animaciones declarativas (`in`, `emphasis`, `out`) que desaparecen con `prefers-reduced-motion`.
- **Story Bar**: `classic` y `energized`; portada `circle | square | rounded | portrait`; anillo visto/no visto; orden `manual | unseen_first | seen_last | recent` + fijados primero; badge «en vivo»; LTR/RTL; claro/oscuro (`theme: "light" | "dark" | "auto"` o tus tokens).
- **Banner**: `4:3 | 16:9 | 1:1 | 2:1`; carrusel con barra o puntos; autoplay **pausable** (botón, hover, foco, pestaña oculta); descartable; **sin autocierre** salvo `auto_close_ms`; `logClick(nombre)` con el charset del contrato.
- **Entrega** (`createStoriesClient`): frecuencia por persona con tope por defecto (5 por 7 días); un banner por placement (prioridad, luego id); un overlay a la vez (`client.overlays`); pausa por superficie que **difiere sin descartar** (`client.surfaces.pause("banner", "checkout")`); kill por superficie que **vacía** la lista; grupo de control = impresión con `rendered: false` sin pintar.
- **Placements**: `If-None-Match`/304, caché que respeta `ttl` y se persiste en `store` (sirve sin red), reintentos con `Retry-After`, `min_sdk` con **aviso** (`onNotice`, `result.status === "unsupported"`), calendario de grupos y caducidad de banners.
- **Eventos**: `event_id` desde que nace; lote idempotente (misma `idempotency-key` y mismos ids en cada reintento), cola persistida, hasta 100 por lote; los 4xx se descartan, la red/429/5xx se reintentan. **Consentimiento por propósito**: sin `consent` solo salen `none` y `analytics`.

## Accesibilidad

Botón de pausa visible; con `prefers-reduced-motion` el visor y el autoplay del banner **empiezan en pausa** y no hay animaciones; subtítulos (`<track kind="captions">`) con botón; `alt` por capa (o `aria-hidden` si es decorativa); región `aria-live` al cambiar de página; teclado `←`/`→` (espejado en RTL), `Espacio` (pausa), `Esc` (cierra); `<dialog>` modal con foco atrapado y devuelto a quien lo abrió; cada grupo de la barra es un `<button>` con etiqueta «título, nueva|vista|a medias, fijada, en vivo, n de total»; barra de progreso con `role="progressbar"`; banner como región con `aria-roledescription="carousel"`.

## Decisiones y límites

- Los tipos de `src/types.ts` son **estructurales** (el contrato es privado); `contract-compat.test.ts` comprueba en compilación que la salida de zod del contrato les cabe y que `toHeadlessPayload` es equivalente al del contrato.
- La animación `out` se ancla al **final** de la página (`delay_ms` = margen antes del final); el contrato no lo fija.
- `poll`: el contrato no entrega recuento, así que tras votar se muestra la elección y un agradecimiento (no resultados).
- Empate de banners: prioridad y luego `id` (el contrato no entrega fecha de creación).
- Los colores de la UI salen de tokens (`styles.css`); los colores que vienen de la campaña (hex) se aplican como datos.
