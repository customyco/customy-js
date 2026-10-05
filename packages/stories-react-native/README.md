# @customyai/stories-react-native

Customy **Stories y Banners** para React Native (iOS y Android): `<StoryBar/>`, `<StoryViewer/>`, `<Banner/>`, `StoriesProvider`, `usePlacement` y modo *headless*. Consume la respuesta de `GET /client/placements/:id` (contrato de Stories, versión 1) y publica los eventos en `POST /client/events`.

> Estado: **Ola 2 + widgets de las Olas 3 y 4** (Video Feed, Swipe Cards, Canvas, Inline, Checklist/Tour, Game y UGC; ver [Widgets, Game y UGC](#widgets-game-y-ugc-olas-3-y-4)). Mismas superficies que `@customyai/stories-render` en la web (widgets `story_bar` y `banner`), con los componentes de la Ola 1 en el visor y los de la Ola 2 en un módulo opcional. **No se ha probado en un dispositivo ni en un simulador**: ver [Qué falta para probar en dispositivo](#qué-falta-para-probar-en-dispositivo).

## Qué reutiliza y qué aporta

El comportamiento NO se reimplementa: viene de `@customyai/stories-render` (dependencia, no copia).

| Del núcleo (`@customyai/stories-render`) | De este paquete |
|---|---|
| Máquina de estados de la página y del visor (`createStoryViewer`), banner (`createBannerController`) | Pintado nativo: Reanimated, Gesture Handler, `Modal`, `FlatList`, `Pressable` |
| Orden de la barra, nudge, visto (`createSeenTracker`), precarga con cancelación (`createPreloader`) | Cargador de medios (`Image.prefetch` + `fetch`) inyectable |
| Reconocedor de gestos (`createGestureRecognizer`), layout 1080×1920, zona segura, animaciones, a11y | Traducción de toques crudos a coordenadas; animaciones como función del tiempo de la página |
| Cliente de placements, eventos idempotentes, entrega (frecuencia, kill, `min_sdk`, pausa por superficie) | `StoriesProvider`, `usePlacement`, componentes ligados al cliente |
| Textos es/en y etiquetas de accesibilidad (`groupAriaLabel`…) | Accesibilidad nativa (`accessibilityRole`, regiones vivas, acciones, `AccessibilityInfo`) |

## Install and minimal use (English)

```sh
npm install @customyai/stories-react-native react-native-reanimated react-native-gesture-handler
```

```tsx
import { StoriesProvider, StoryBar } from "@customyai/stories-react-native";

export function Home({ client }) {
  return (
    <StoriesProvider client={client}>
      <StoryBar placementId="home_top" />
    </StoriesProvider>
  );
}
```

`client` comes from `createStoriesClient` in `@customyai/stories-render/client` (token minted by your backend). Peers: `react >=18`, `react-native >=0.79`, `react-native-gesture-handler ^2.20`, `react-native-reanimated ^3.16 || ^4`. Video, media cache, storage and Lottie are injected by the app. The rest of this document is in Spanish.

## Instalación

```sh
pnpm add @customyai/stories-react-native react-native-reanimated react-native-gesture-handler
# opcionales (cada una se inyecta; el paquete no las fija):
pnpm add react-native-safe-area-context            # zona segura REAL (muy recomendado)
pnpm add react-native-video                        # vídeo → ./video
pnpm add lottie-react-native                       # capas lottie → ./lottie
pnpm add @react-native-async-storage/async-storage # «visto» persistente → ./storage
pnpm add livekit-client @livekit/react-native      # transmisión en vivo → ./live + ./live-livekit (solo si usas Live)
```

Peers: `react >=18`, `react-native >=0.79`, `react-native-gesture-handler ^2.20`, `react-native-reanimated ^3.16 || ^4`. Reanimated necesita su plugin de Babel (`react-native-worklets/plugin` en la v4; `react-native-reanimated/plugin` en la v3) y la raíz de Gesture Handler: el visor ya lleva su propia `GestureHandlerRootView` dentro del `Modal` (Android lo exige), así que no hace falta más. `react-native >=0.79` porque las subrutas (`/components`, `/video`…) usan `exports` y Metro lo resuelve por defecto desde esa versión.

## Uso

```tsx
import { StoriesProvider, StoryBar, Banner, createNativeStoriesClient } from "@customyai/stories-react-native";
import { createAsyncStorageStore } from "@customyai/stories-react-native/storage";
import { components } from "@customyai/stories-react-native/components"; // Ola 2 (opcional)
import { createReactNativeVideoAdapter } from "@customyai/stories-react-native/video"; // vídeo (opcional)

const client = createNativeStoriesClient({
  token: () => miBackend.tokenDeSuscriptor(), // sst_… emitido por TU backend; nunca una clave de servidor
  locale: "es",
  appVersion: "1.4.0", // para `min_sdk`
  store: createAsyncStorageStore(AsyncStorage),
});

<StoriesProvider client={client} locale="es" theme={tokens} insets={useSafeAreaInsets()} video={video} components={components}>
  <StoryBar placementId="home_top" />
  <Banner placementId="home_top" />
</StoriesProvider>;
```

Se ocultan solos con `kill`, `min_sdk` mayor o sin contenido elegible. `<StoryViewer placementId open onClose/>` abre el visor controlado. Hay un ejemplo completo en [`example/`](./example) (se comprueba con `tsc`, no se compila nativo).

### Sin cliente: tus datos, nuestra interfaz

`StoriesProvider` sin `client` solo da interfaz: `<StoryBarView groups style seen viewer/>`, `<StoryViewerView groups open …/>` y `<BannerView banner …/>` pintan los datos que les pases (misma forma que el contrato).

### Modo headless

```tsx
const { headless, delivery, result } = usePlacement("home_top"); // JSON plano: páginas, capas, componentes, duraciones ya resueltas
// sin React: await client.headless("home_top")  ·  toHeadlessPayload(respuestaCruda)
```

Pinta con tu UI y usa el núcleo para el comportamiento: `createStoryViewer`, `createBannerController`, `orderGroups`, `createSeenTracker`, `createPreloader`… (todo se re-exporta desde este paquete). Ver `example/Headless.tsx`.

## `StoriesProvider`

| Prop | Para qué |
|---|---|
| `client` | Placements, eventos y reglas de entrega. Opcional (ver arriba). |
| `theme`, `colorScheme` | Tokens de tema (sueltos o `{ light, dark }`); `auto` sigue al sistema. |
| `insets` | Zona segura **real** (`useSafeAreaInsets()`); sin ella, una estimación (ver Decisiones). |
| `rtl`, `reducedMotion`, `locale`, `messages` | Dirección, movimiento reducido (por defecto el del sistema), idioma y textos propios. |
| `video`, `lottie`, `mediaCache` | Reproductor, Lottie y caché de medios inyectables. |
| `components`, `resolveProducts`, `openForm`, `onAddToCart`, `onWishlist`, `onAddToCalendar`, `onReminder`, `copyText`, `shareUrl` | Módulo de la Ola 2 y los ganchos con los que la app decide carrito, formularios, calendario, recordatorios y portapapeles. |
| `openLink` | Abre enlaces y *deep links*. Por defecto `Linking.openURL`; solo `https` (sin credenciales) para `url` y, para `deep_link`, lista blanca `https`, `mailto`, `tel`, `sms` más los esquemas que declares en `allowedSchemes` (`["myapp"]`; `tg`/`whatsapp` solo si los declaras); `javascript:`, `data:`, `file:`, `blob:`, `content:`, `intent:`, `http:`… no se abren nunca. |
| `onWidgetReady`, `onVisibilityChange`, `onActionClicked` | Avisos de ciclo de vida (plan §6.6). `onActionClicked` se llama **antes** de abrir. |

## Comportamiento

- **Visor** (`Modal` a pantalla completa): tap por tercios (izquierda = anterior, derecha = siguiente; espejado en RTL), **mantener = pausa** y oculta la interfaz, swipe horizontal = entre grupos, **swipe abajo cierra**, **swipe arriba o el botón abren el enlace** (clic con nombre + `onActionClicked`), barra de progreso, compartir (`Share`), botón «atrás» de Android cierra. El reconocimiento es el del núcleo; un gesto manual de Gesture Handler (`Gesture.Manual`) entrega los toques, así que `Pressable` y `ScrollView` siguen funcionando y todo toque que **empieza** en un componente es suyo (`Interactive`), no de la historia.
- **Precarga**: página actual, siguiente y primera del grupo siguiente; al moverse se **cancelan** las descargas que ya no están en el plan, y al cerrar todas. Los vídeos calientan con el `preload` del reproductor o con una petición `Range` de 256 KiB. Un vídeo que no carga degrada al póster y a temporizador: la página nunca se queda colgada.
- **Lienzo**: coordenadas 0–1 sobre 1080×1920 escaladas al visor 9:16 (letterbox centrado); capas `video | image | text | shape | lottie | sticker`; los componentes se mantienen dentro de la zona segura de la campaña **ampliada con la del dispositivo**. El texto del lienzo no escala con la fuente del sistema (escala con el visor, como una imagen); los componentes sí, con tope ×1,3.
- **Animaciones** (`in`, `emphasis`, `out`): función pura del progreso de la página (`motionAt`) evaluada en el hilo de UI con Reanimated. Pausar la página las congela y `out` queda anclada al final. Con «reducir movimiento» no hay ninguna.
- **Vídeo**: adaptador inyectable (`VideoPlayerAdapter`). Oficial para `react-native-video` en `./video` (recibe el componente `Video`: no importa la librería). Sin adaptador, póster + temporizador y sin botones de vídeo. Silencio y subtítulos son botones con estado; el reloj de la historia es el del vídeo principal (el de fondo o, si no hay, el primero de las capas).
- **Estado «visto»**: `store` del cliente (`KeyValueStore`). Por defecto memoria; `./storage` trae adaptadores **estructurales** para AsyncStorage y MMKV (no importan la librería), `withKeyPrefix` y `createMemoryStore`. Un fallo de disco no rompe la historia.
- **Entrega** (del cliente): frecuencia por persona con tope por defecto, un banner por placement, un overlay a la vez, grupo de control = impresión sin render, calendario y caducidad, **kill** por placement/superficie y `min_sdk` con aviso. **Pausa por superficie**: `client.surfaces.pause("story", "checkout")` **difiere** (la barra desaparece y vuelve al reanudar); un visor ya abierto no se cierra: se pausa solo y sigue al reanudar. Segundo plano (`AppState`) también pausa visor y autoplay del banner.
- **Eventos**: `event_id` desde que nace, lote idempotente (misma `idempotency-key` y mismos ids en cada reintento), cola persistida en `store` (salvo las respuestas de texto libre de `question`: viajan solo desde memoria en el primer intento y, si no hay red, se descartan; nunca se escriben en `store`), 4xx se descartan, red/429/5xx se reintentan. Consentimiento por propósito: sin `consent` solo salen `none` y `analytics`. Las pruebas validan cada evento contra el esquema del contrato.
- **Banner**: `4:3 | 16:9 | 1:1 | 2:1`; barra o puntos; autoplay **siempre pausable** con un botón visible (WCAG 2.2.2) y en pausa con «reducir movimiento»; descartable; **sin autocierre** salvo `auto_close_ms` (WCAG 2.2.1); swipe espejado en RTL.

## Accesibilidad

- **Barra**: cada grupo es un botón con la etiqueta del núcleo «título, nueva|vista|a medias, fijada, en vivo, patrocinado, n de total»; contenedor `accessibilityRole="list"`; al cerrar el visor, el foco vuelve al grupo que se abrió.
- **Visor**: `accessibilityViewIsModal`; **botón de pausa siempre visible** (WCAG 2.2.2) con rol y etiqueta que cambia (Pausar/Reanudar); progreso con `accessibilityRole="progressbar"` y valor «Página n de total»; región `accessibilityLiveRegion="polite"` (TalkBack) y `announceForAccessibility` (VoiceOver) al cambiar de página y en cada aviso; con un lector de pantalla activo aparecen botones **anterior/siguiente** (no hay tercios que pulsar); iOS: `onMagicTap` pausa y `onAccessibilityEscape` cierra; capas con `alt` (o ocultas si son decorativas); la hoja «Patrocinado» es modal.
- **Movimiento**: `AccessibilityInfo.isReduceMotionEnabled` (en vivo) → el visor y el autoplay del banner empiezan en pausa y no hay animaciones.
- **Componentes**: ≥ 48 dp de alto táctil, el resultado del quiz se dice con texto (nunca solo color), el deslizador es `adjustable` con acciones incrementar/decrementar (confirma tras una pausa), la cuenta atrás es un `timer` sin región viva (no se lee cada segundo).
- **Privacidad**: comentarios (`question`) apagados por defecto; respuestas anónimas por defecto; el propósito de consentimiento viaja en cada evento.

## Widgets, Game y UGC (Olas 3 y 4)

Misma semántica que el renderer web: el estado lo llevan los **controladores puros** de `@customyai/stories-render` (`createSwipeDeck`, `createChecklist`, `createTour`/`popoverPosition`, `createGameController`/`createGameApi`, `masonryColumns`, `visibleFeedItems`, `createUgcClient`…), que aquí solo se pintan con vistas nativas. Los widgets se entregan en `widgets[]` del placement; **uno por tipo** (inline: uno por ancla), el grupo de control registra impresión sin pintar, y la frecuencia, el descarte y el progreso (un ítem completado no se desmarca) los lleva el cliente (`client.bindWidget`).

```tsx
import { StoriesCanvas, StoriesSwipeCards, StoriesChecklist, StoriesAnchor, notifyChecklistEvent } from "@customyai/stories-react-native/widgets";
import { StoriesVideoFeed } from "@customyai/stories-react-native/video-feed";
import { StoriesGame, GameDialog } from "@customyai/stories-react-native/game";
import { UgcComposer, UgcMine, ugcPageActions, createUgcClient } from "@customyai/stories-react-native/ugc";

<StoriesCanvas placementId="home_canvas" />
<StoriesSwipeCards placementId="home_cards" />
<StoriesVideoFeed placementId="home_feed" />
<StoriesGame placementId="home_game" apiOptions={{ token: () => subscriberToken() }} deviceId={installId} />
```

| Widget | Notas |
|---|---|
| **Video Feed** | Carrusel o grid de miniaturas y visor vertical a pantalla completa. Precarga en ventana `{before, after}` con el reproductor inyectable (`./video`). Botón de pausa **siempre visible** (WCAG 2.2.2), mudo por defecto, `mode: tap` para que nada arranque solo, **reduce motion ⇒ inicia en pausa**; pausa también con `pause("widget")` y en segundo plano. CTA (hasta 3), compartir y `repost` por enlace (se abre con `Linking`; Customy no extrae el medio). Eventos `playback`, `watch_length`, `share`. |
| **Swipe Cards** | Gesto (Gesture Handler + Reanimated) **y** botones siempre (WCAG 2.5.1) **y** `accessibilityActions` (`like`/`nope` con las etiquetas de la campaña). `remember_swipes` por progreso. Eventos `swipe` y `product_viewed`/`add_to_cart`/`wishlist_added` con `component_id: "cards"`. |
| **Canvas** | Masonry de `masonryColumns`, `alt` obligatorio, acción por pieza (≥ 48 pt). |
| **Inline** | Ancla por **nombre registrado en la app**, nunca un selector: envuelve la vista con `<StoriesAnchor id="home.header">` y el widget se inserta `before/after/inside_start/inside_end/replace`; en listas, `useInlineList("feed", data)` intercala la tarjeta en el `index` pedido. Anclas distintas conviven; descartable. |
| **Checklist** | `ordered` (los siguientes bloqueados y leídos así), `dismissible` con confirmación, progreso barra/pasos/ninguno (`progressbar` accesible, región viva). Completa por clic, a mano o por evento de la app: `notifyChecklistEvent("profile_saved")`. La condición sobre la persona la evalúa el servidor al entregar. |
| **Tour** | Globo/hotspot/spotlight junto al ancla registrada (medida con `measureInWindow`, posición de `popoverPosition`, RTL), `skippable` siempre, paso por botón o por pulsar el ancla. Un tour terminado o saltado no vuelve. |
| **Game** | `GameView` (o `GameDialog` si el juego vive en una historia: componente `game` + `openGame`). Ruleta, rasca y gana, tarjeta de premio, memoria y tres iguales: **el servidor decide** (`POST play`; la animación solo presenta el resultado y el tablero sale de `board_seed`). `attempt_id` por intento: tras un fallo de red se reintenta con el **mismo** (replay, no cuenta dos veces). Bases versionadas, edad y consentimiento como casillas reales; errores del servidor con texto propio. Cada mecánica tiene alternativa sin gesto («Revelar»/«Saltar»); **reduce motion ⇒ resultado directo**; el resultado, el código copiable y los errores se anuncian (región viva + `announceForAccessibility`). |
| **UGC** | `UgcComposer` (medio lo elige la app con `pickMedia`/`uploadMedia`, pie con contador, descripción, nombre opcional, términos versionados), `UgcMine` (estado, motivo, reclamar, borrar, exportar) y `ugcPageActions` para el visor: en páginas con la marca `ugc.reportable` pone «⋯» y una hoja para **reportar con motivo o dejar de ver a la persona**. Se conecta con `<StoriesProvider pageActions={ugcPageActions({ client })}>`. |

**Eventos y conversiones.** Los widgets emiten por el canal `widget`; cada evento lleva `session_id` (`useStoriesActions().sessionId`, la misma sesión que historias y banners). `useStoriesActions()` expone también `reportConversion` (compra como señal no monetaria, idempotente por pedido; `value`/`currency`/`lineValue` están obsoletos y se ignoran: los ingresos los reporta tu backend con llave API en `POST /api/stories/conversions`) y `reportExposure` (`view`/`product_viewed`/`holdout` para interfaces propias). `onAddToCart` y `onWishlist` del provider reciben `{ storyId, slideId?, componentId? }` (en el visor, la historia/página/componente; en Swipe Cards, la campaña y `"cards"`).

**Kill y pausa.** `kill.widget` de la respuesta vacía el widget y desaparece lo ya pintado (no se descarta nada guardado). `useSurfacePause().pause("widget")` **difiere** lo nuevo (vuelve al reanudar) y detiene lo que suena; `useIsSurfacePaused("widget")` para tu propia UI. `onWidgetReady`/`onVisibilityChange` también cubren los widgets (`surface: "widget"`).

**Accesibilidad y tema.** Roles/etiquetas/estados nativos, regiones vivas, `accessibilityActions`, objetivos ≥ 48 pt (≥ 44 exigido), `maxFontSizeMultiplier`, RTL. Los colores salen de los tokens de `theme` (se añadieron tokens para superficies de widget, premio y resalte del tour); solo `default-theme.ts` tiene literales.


## Módulos opcionales

| Import | Qué trae |
|---|---|
| `@customyai/stories-react-native` | Todo lo anterior + el núcleo y el cliente re-exportados |
| `…/components` | **Ola 2**: quiz, emoji_reaction, emoji_slider, rating, question, share, timestamp, call, whatsapp, map, add_to_calendar, form, gif, product_tag, product_cards, cart, wishlist. Se inyecta con `components={components}`; sin él se omiten sin romper la página. Reutiliza las utilidades puras y los textos de `@customyai/stories-render/components` (precio, fecha relativa, `.ics`, destinos). |
| `…/video` | `createReactNativeVideoAdapter(Video)` |
| `…/lottie` | `createLottieAdapter(LottieView)` |
| `…/storage` | `createAsyncStorageStore`, `createMmkvStore`, `withKeyPrefix`, `createMemoryStore` |
| `…/widgets` | **Ola 3**: `StoriesCanvas`, `StoriesSwipeCards`, `StoriesChecklist` (checklist y tour), `StoriesWidget kind="inline"` / `InlineHost`, anclas (`StoriesAnchor`, `createAnchorRegistry`, `useInlineList`), `notifyChecklistEvent` y los controladores puros re-exportados |
| `…/video-feed` | **Ola 3**: `StoriesVideoFeed` / `VideoFeedView` (carrusel/grid + visor vertical) |
| `…/game` | **Ola 4**: `StoriesGame`, `GameView`, `GameDialog` (5 mecánicas) |
| `…/ugc` | **Ola 4**: `UgcComposer`, `UgcMine`, `ugcPageActions`, `createUgcClient` |
| `…/live` | **Ola 4**: `LiveView`, `useLive` (headless), `createLiveClient`, `createLiveCore` y los textos es/en/pt. **No** depende de LiveKit: el transporte se inyecta (ver «Live» abajo) |
| `…/live-livekit` | **Ola 4**: `createLiveKitTransport({ livekit, reactNative })`, adaptador opcional para `@livekit/react-native` (módulos pasados por la app; no es dependencia de este paquete) |

Los ganchos de la app (carrito, formulario, calendario…) son decisiones suyas: `form` y `add_to_calendar` **no se pintan** si la app no entrega el gancho; `cart`/`wishlist` registran el evento y avisan a la app (el carrito lo decide su backend).

## Live (transmisión en vivo)

Módulo opcional `…/live`; plan en `docs/CUSTOMY_STORIES_LIVE_2026-10-03.md`. Mismo comportamiento que `./widgets/live` de la web porque **corre la misma máquina de estados** (`createLiveCore` del renderer: el controlador sin DOM con el transporte inyectado) y el mismo cliente de `/client/live/*` de Send; aquí solo está la interfaz nativa y el enganche a React Native.

```tsx
import { Room, RoomEvent } from "livekit-client";
import { VideoView, AudioSession, registerGlobals } from "@livekit/react-native";
import { LiveView, createLiveClient } from "@customyai/stories-react-native/live";
import { createLiveKitTransport } from "@customyai/stories-react-native/live-livekit";

registerGlobals(); // una vez, al arrancar la app
const live = createLiveClient({ token: () => subscriberToken() });

// group.live_session viene en el grupo del placement; el badge «en vivo» de la barra sigue a `group.live`.
<LiveView
  live={group.live_session!}
  groupId={group.id}
  client={live}
  openTransport={() => createLiveKitTransport({ livekit: { Room, RoomEvent }, reactNative: { VideoView, AudioSession } })}
  productInfo={(ref) => lookup(ref)}          // nombre, precio y foto: los resuelve la app contra Commerce
  onRefetch={() => refresh()}                 // al terminar: pedir el placement (ahí llega la repetición)
/>
```

- **Ciclo**: `scheduled` (título y cuenta atrás, sin conectarse a nada) → `live` («Ver en vivo» pide el token de espectador de 5 min a Send y solo entonces se crea el transporte) → `ended`/`replay`. La repetición es el reproductor del proveedor (`video`) con botón visible y subtítulos, o el póster con un enlace. El token nunca incluye una llave de LiveKit.
- **Reconexión**: caída ⇒ «Reconectando…», espera 1-2-4-8-15 s y **token nuevo** en cada intento; agotados, «Reintentar». Si el servidor dice que ya no está en vivo, no reintenta y **cae a repetición** (`onEnded` + `onRefetch`).
- **Pausa visible** (WCAG 2.2.2) con estado, que baja la suscripción a las pistas y avisa al servidor; segundo plano (`AppState`) pausa el medio sin tocar la pausa de la persona. `client.surfaces.pause("live")` (también `"story"`, `"widget"` o `"all"`) pausa lo que suena, no deja entrar y reanuda solo lo que pausó la superficie. `killed` (kill de la app) o el kill switch del servidor (`live_kill_switch`, en `join` o en el sondeo) sueltan la sala y dejan «no disponible».
- **Comercio**: destacados (`ProductRef`) hidratados por la app; `product_viewed` al aparecer y `product_click`/`add_to_cart`/`wishlist_added` con el contexto `{ storyId: grupo, componentId: "live-<id>" }` (el de `storyCartAttributes`): llegan a `onAddToCart`/`onWishlist` del provider y a `onProduct`, y a Send por lote idempotente (`event_id`).
- **Chat y reacciones**: apagados salvo que el live traiga `chat_mode` (`filtered`/`premoderated`) o `reactions`; llegan por **sondeo** (5 s); etiqueta anónima del servidor; texto siempre como texto; reportar con motivo, bloquear, borrar el propio; avisos de «en revisión»/filtro. `isMinor` los quita siempre (el servidor ya los rechaza para cuentas con menores). Reacciones: con «reducir movimiento» no hay reacción flotante.
- **Subtítulos**: si la sala publica transcripción, botón CC con estado; el botón existe siempre y no muestra nada hasta que lleguen segmentos finales.
- **Accesibilidad**: región con nombre, estado en palabras en una región viva y anunciado a VoiceOver/TalkBack («EN VIVO», «La transmisión terminó»), objetivos ≥ 48 pt, casilla del aviso como `checkbox`, RTL. **Tema**: solo tokens (`live`, `liveForeground`, `surface`…).
- **Headless**: `useLive(options)` devuelve estado, instantánea, mensajes, subtítulos, destacados y acciones (`join`, `pause`, `leave`, `send`, `react`, `product`…) para pintar tu propia interfaz; `openTransport` puede devolver cualquier `NativeLiveTransport` (HLS, otro SFU).

Qué no hace: grabar ni publicar (el anfitrión emite desde el Workspace), HLS (el servidor hoy solo ofrece WebRTC), push del chat por canal de datos (sondeo de 5 s).

## Presupuesto de tamaño

`pnpm size` mide min+gzip con esbuild; `react`, `react-native`, Reanimated y Gesture Handler quedan fuera (los pone la app). Topes en `size-budget.json` (medido +12 %): **propio** = solo este paquete; **con núcleo** = lo que de verdad paga la app, sumando la parte usada de `@customyai/stories-render`.

| Import | Propio (gzip) | Con núcleo (gzip) |
|---|---|---|
| `.` | 15,9 KB | 29,7 KB |
| `./components` | 5,4 KB | 9,4 KB |
| `./video` | 0,6 KB | 0,6 KB |
| `./lottie` | 0,3 KB | 0,3 KB |
| `./storage` | 0,3 KB | 0,3 KB |
| `./widgets` | 12,4 KB | 14,0 KB |
| `./video-feed` | 9,0 KB | 9,4 KB |
| `./game` | 10,4 KB | 12,7 KB |
| `./ugc` | 4,1 KB | 8,5 KB |
| `./live` | 6,3 KB | 11,6 KB |
| `./live-livekit` | 0,8 KB | 0,8 KB |

El entrypoint `.` creció ~0,6 KB (sesión, `useStoriesActions`, `pageActions` y la hoja del visor, `openGame`); su tope subió de 15,9 a 17,8 KB (propio). Cada widget nuevo vive en su subruta: quien no la importa no la paga. `./video-feed` y `./game` van separados de `./widgets` por peso (reproductor/precarga y mecánicas/animaciones).

Metro no hace *tree-shaking*: lo que importas es lo que viaja. Por eso la Ola 2, el vídeo, Lottie y el almacenamiento van en subrutas aparte, y los adaptadores reciben el componente de la app en lugar de importar su librería. «Con núcleo» de `./components` incluye hoy el módulo `dom/components` del renderer (sus utilidades puras comparten fichero con los pintores de DOM; separarlas lo bajaría a ~5 KB, pendiente en el renderer).

## Decisiones y límites

- **Colores**: ningún componente lleva colores propios: salen de `theme` (tokens por props, sueltos o `{ light, dark }`). Los colores que **vienen de la campaña** (fondo de un texto, relleno de una forma, color de un botón, anillo) son datos y se aplican tal cual. Si la app no pasa `theme`, se usan neutros grises de `src/default-theme.ts`, el único fichero con literales de color (avisado con `eslint-disable` y motivo).
- **Zona segura**: lo correcto es pasar `insets` (`react-native-safe-area-context`). Si no se pasan, **estimación**: Android = altura de la barra de estado; iOS = por la forma de la pantalla (muesca/isla si es muy alargada). No hay API de núcleo que dé el valor real en iOS.
- **Iconos**: dibujados con vistas (pausa, play, cerrar, flechas); sin librería de iconos ni SVG.
- **Un `Modal` por visor**, con transición de página por `FadeIn` de Reanimated; arrastrar para cerrar con efecto visual y el cubo entre grupos **no** están (el gesto es discreto: cierra/cambia al soltar).
- **`usePlacement` y el cliente ligado** se reimplementan aquí porque los de `@customyai/stories-render/client/react` arrastran los componentes DOM; la lógica de entrega sí es la del núcleo. Pendiente: extraer los hooks sin DOM al renderer para compartirlos.
- **RTL**: la dirección sale de `I18nManager` (o de `rtl`); fija el `direction` del visor, la barra y el banner, espeja tercios y swipes. Las coordenadas del lienzo NO se espejan (es contenido, como en la web).
- **Pausa de superficie con banner**: un banner visible desaparece al pausar `banner` (como en la web); con historias, un visor abierto sigue.
- Reutiliza un `messagesFor` exportado desde `@customyai/stories-render/components` (cambio de una palabra, aparte).

## Pruebas

```sh
pnpm --filter @customyai/stories-react-native test       # Vitest, sin runtime nativo
pnpm --filter @customyai/stories-react-native typecheck  # src, pruebas y ejemplo
pnpm --filter @customyai/stories-react-native lint
pnpm --filter @customyai/stories-react-native size
```

Vitest (el que usa el repo en sus SDK) sobre jsdom. `react-native`, Reanimated y Gesture Handler se sustituyen por dobles ligeros en `test/mocks`: pintan elementos DOM con las props de accesibilidad como atributos y dejan **disparar toques crudos** (`touches.tap/swipe`, `pan.end`). Se prueba: gestos por tercios y RTL, mantener/soltar, swipes, claim de toques, precarga y cancelación (con `AbortSignal`), pausa por segundo plano y por superficie, vídeo con adaptador (principal/secundario, error → póster), capas y zona segura, tokens de tema, accesibilidad (roles, etiquetas, regiones vivas, acciones), banner (autoplay, reduced motion, descarte, swipe), barra (orden, visto, nudge), los 4 + 17 componentes con sus eventos, cada widget de las Olas 3 y 4 (eventos válidos contra el contrato con `session_id`, alternativa accesible, reduce motion, kill/pausa, control sin pintar, Game con replay/errores/5 mecánicas, UGC enviar/reportar/bloquear), el cliente de extremo a extremo (eventos válidos contra el contrato, frecuencia, kill, `min_sdk`, control, visto persistente) y el modo headless.

## Qué falta para probar en dispositivo

No se compiló nativo (sin Xcode, Gradle, pods, emuladores ni simulador). Con las pruebas y `tsc` verdes, falta confirmar en un iPhone y un Android reales (o simuladores) con una app Expo/bare que tenga Reanimated + Gesture Handler:

1. **Reanimated/worklets**: plugin de Babel activo; `motionAt` y `cubicBezier` llevan `"worklet"`; comprobar que corren en el hilo de UI y que la barra de progreso (valor compartido movido desde JS con `requestAnimationFrame`) va a 60 fps con vídeo.
2. **Gesture Handler**: `Gesture.Manual` junto a `Pressable`/`ScrollView` dentro de un `Modal` (orden de `onTouchStart` y `onTouchesDown` en las dos plataformas), swipes que empiezan en el borde (gesto «atrás» de iOS) y la tecla «atrás» de Android.
3. **VoiceOver y TalkBack**: orden de lectura, el anuncio al cambiar de página (región viva en Android, `announceForAccessibility` en iOS), foco al cerrar, `onMagicTap`/`onAccessibilityEscape`, acciones incrementar/decrementar del deslizador y del banner.
4. **Zona segura**: `insets` reales con muesca/isla y con Android *edge-to-edge* (`statusBarTranslucent`), y comprobar la estimación de reserva.
5. **Vídeo real**: `react-native-video` con HLS, póster, subtítulos, *buffering* y el pool de precarga; el rendimiento de memoria al precargar siguiente página y grupo.
6. **Lottie real** y `Image.prefetch` (caché del sistema); `Range` en el CDN de vídeo.
7. **RTL** forzado (`I18nManager.forceRTL`): origen del desplazamiento del `FlatList` horizontal de la barra.
8. **Teclado** con `question` (el campo dentro del `Modal`), y `Intl.RelativeTimeFormat` en Hermes.
9. **Widgets nuevos**: anclas medidas con `measureInWindow` bajo scroll y en listas virtualizadas (Inline/Tour), gesto del Swipe junto a `ScrollView`, visor vertical del Video Feed con HLS real y su precarga, canvas de rasca (toques sobre la capa) y animaciones de las 5 mecánicas a 60 fps, `announceForAccessibility` en Game/Checklist, hoja de «⋯» del visor y selector de medios de UGC con la subida real (Storage aún no la expone).
10. **Live real**: una sala de LiveKit de staging con `@livekit/react-native` (vídeo y audio del anfitrión, `registerGlobals`, sesión de audio en iOS/Android y el modo silencioso del iPhone), la reconexión con red móvil que cambia, el segundo plano (¿sigue sonando? hoy se pausa), la pausa que baja la suscripción, VoiceOver/TalkBack sobre la región de estado y el chat con teclado. No se probó contra ningún LiveKit: solo transporte simulado.
11. **Metro** con `exports` (RN ≥ 0.79) y una compilación de producción para confirmar el tamaño medido.
