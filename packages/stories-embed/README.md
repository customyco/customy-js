# @customyai/stories-embed

Embed de **Customy Stories** para WebView y sitios sin bundler. Es el renderer web
(`@customyai/stories-render`: barra, banner, visor, cliente y eventos) empaquetado en un bundle
autocontenido —ESM y `<script>` IIFE— más un **puente nativo versionado** con validación estricta.

## Install (English)

```sh
npm install @customyai/stories-embed
```

Bundler-less sites copy `dist/iife/customy-stories-embed.js` and `.css` (exposed as `@customyai/stories-embed/iife` and `/embed.css`) and call `CustomyStories.init({ placementId, token, locale })`; with a bundler use `createStoriesEmbed().init({...})`. The native bridge protocol is versioned (`@customyai/stories-embed/protocol`). The rest of this document is in Spanish.

## Instalación

`npm install @customyai/stories-embed`. Ver «Uso en un sitio» abajo.

No duplica lógica: todo el comportamiento sale del renderer. Este paquete añade (1) la API
`window.CustomyStories`, (2) el puente de mensajes, (3) la política de URL, (4) la carga diferida de
módulos pesados y (5) el empaquetado.

## Uso en un sitio

```html
<link rel="stylesheet" href="/stories/customy-stories-embed.css"> <!-- CSP estricta: sin estilos en línea -->
<div id="customy-stories"></div>
<script src="/stories/customy-stories-embed.js"></script>
<script>
  CustomyStories.init({
    placementId: "home_top",
    // token de suscriptor (sst_…) que entrega TU backend; función = se vuelve a pedir tras un 401
    token: () => fetch("/api/stories-token").then((r) => r.text()),
    locale: "es", theme: "auto", platform: "web",
    injectStyles: false, // la hoja ya está enlazada
    onEvent: (e) => console.log(e.name, e.data),
  });
</script>
```

Con bundler: `import { createStoriesEmbed } from "@customyai/stories-embed"` y
`createStoriesEmbed().init({...})` (los módulos pesados se cargan con `import()`).

### Opciones de `init`

| Opción | Notas |
|---|---|
| `placementId` | obligatorio, `[A-Za-z0-9_.:-]{1,128}` |
| `token` / `clientKey` | `sst_…`, función `(forceRefresh) => Promise<string>` o `"native"` (lo entrega el anfitrión). **Solo tokens de suscriptor**: una llave de servicio (`sk_…`, `x-internal-key`…) se rechaza y no hay forma de pasarla |
| `baseUrl` | por defecto `https://send-api.customy.ai`; solo `https` (o `http` a localhost) sin credenciales |
| `locale`, `theme` (`light\|dark\|auto`), `platform` (`ios\|android\|web`), `appVersion` | |
| `display` | `bar` (barra + banner, por defecto), `banner`, `viewer` (abre el visor directo y pide cerrar el WebView al terminar) |
| `container` | selector o elemento; por defecto `#customy-stories` o `<body>` |
| `allowedSchemes` | esquemas de deep link propios de la app (`["myapp"]`) |
| `nonce` / `injectStyles` | CSP (ver abajo) |
| `parentOrigin` | origen exacto de la página que hospeda el iframe (canal `parent`) |
| `transport` | canal propio `(json) => void` (p. ej. Unity WebGL) |
| `onEvent`, `onError` | callbacks locales; los mismos eventos viajan por el puente |

`init` devuelve un manejador: `refresh()`, `open(groupId?)`, `setTheme()`, `setLocale()`, `pause()`,
`resume()`, `destroy()`. Solo hay una instancia activa por página (un segundo `init` destruye la anterior).

## Protocolo del puente (versión 1)

Todo mensaje es JSON con sobre `{ "source", "v": 1, ... }`. **Nunca se ejecuta JS que venga en un
mensaje**: solo se leen los tipos y campos de las tablas; lo demás se rechaza (y se ignora en silencio
en el canal iframe).

### Página → anfitrión (`source: "customy-stories"`)

| `type` | Campos | Cuándo |
|---|---|---|
| `ready` | `sdk`, `protocol`, `capabilities[]`, `awaitingInit` | la página cargó; con `awaitingInit: true` espera el comando `init` |
| `resize` | `height`, `mode: "inline"\|"fullscreen"` | cambia el alto del contenido; `fullscreen` = se abrió el visor: el anfitrión debe ocupar toda la pantalla |
| `open_url` | `url`, `kind: "url"\|"deep_link"`, `elementId?` | un botón/banner pide abrir un enlace (**ya validado**, ver «Seguridad») |
| `close` | `reason` | el embed pide cerrarse (modo `display: "viewer"` al terminar o si no hay nada que mostrar) |
| `event` | `name`, `data` | `story.view`, `story.click`, `banner.impression`, `link_blocked`, `placement.unavailable`… `data` es JSON plano acotado y sin credenciales |
| `request_permission` | `permission`, `data` | p. ej. `notifications` al activar el recordatorio de una cuenta atrás; se responde con `permission_result` |
| `share` | `url?`, `title?` | el botón compartir (en WebView `navigator.share` se sustituye por este mensaje) |
| `request_token` | `requestId`, `forceRefresh` | con `token: "native"`: la página pide un token de suscriptor |
| `error` | `code`, `message` | fallo de red/token/init |

### Anfitrión → página (`source: "customy-stories-host"`)

La app llama a **una sola función fija**: `window.CustomyStories.receive("<json>")` (en iframe, `postMessage`
con origen comprobado).

| `type` | Campos |
|---|---|
| `init` | `config: { placementId, locale?, theme?, platform?, appVersion?, baseUrl?, display?, allowedSchemes? }` |
| `token` | `requestId`, y `token` (`sst_…`) **o** `error` |
| `pause` / `resume` / `visibility{visible}` | pausa la entrega y el visor abierto con `display: "viewer"` |
| `set_theme{theme}` / `set_locale{locale}` | repinta |
| `open{groupId?}` | abre el visor en ese grupo |
| `close_viewer` | cierra el visor abierto (botón Atrás / descartar la pantalla completa del anfitrión) |
| `permission_result` | `permission`, `granted` |
| `destroy` | desmonta todo |

Flujo de una página alojada (la que usan los wrappers): la página carga con `data-autostart`, envía
`ready{awaitingInit:true}`, el anfitrión responde `init`, la página pide el token con `request_token` y el
anfitrión lo entrega con `token`. **Nada secreto viaja en la URL.**

**Vectores compartidos**: `test/fixtures/protocol-vectors.json` es la única fuente de verdad de URL
permitidas, mensajes de la página, comandos del anfitrión y literales JS. Los leen las pruebas de este
paquete y las de los wrappers (Kotlin, Swift, C#), de modo que las cuatro implementaciones no pueden
divergir en silencio. Para el lado anfitrión en TypeScript (React Native, iframe) se exporta
`parsePageMessage(raw, { extraSchemes })`, con la misma rigidez que `parseHostCommand`.

Canales (nombre fijo por plataforma): iOS `webkit.messageHandlers.customyStories`, Android
`window.CustomyStoriesAndroid.postMessage(String)`, React Native `ReactNativeWebView`, Flutter canal
`CustomyStoriesFlutter`, iframe `parent.postMessage(obj, parentOrigin)` (jamás `"*"`).

Un mensaje entrante se rechaza si: no es JSON/objeto, pesa más de 16 KB, `source` o `v` no coinciden,
el `type` es desconocido, un campo no cumple su formato, o el `token` no tiene la forma `sst_…`.

## Seguridad

- **Credenciales**: la página solo ve el token de suscriptor (corto, por usuario, lo emite tu backend).
  `init` y el comando `token` rechazan cualquier otra cosa. Los datos de eventos descartan claves
  `token|secret|authorization|password|api_key|cookie|credential`.
- **URL**: lista blanca de esquemas `https`, `mailto`, `tel`, `sms` + los de `allowedSchemes`. Nunca se
  aceptan `javascript`, `data`, `file`, `blob`, `intent`, `content`, `vbscript`, `about`, `http`, `ftp`,
  `ws(s)`, aunque la app los declare; tampoco URLs con credenciales, relativas, con caracteres de control o
  de más de 2048 caracteres. Se envía la URL **normalizada**.
- **Defensa en profundidad**: el anfitrión nativo vuelve a validar `open_url` con su propia lista (los
  wrappers de este repo lo hacen). El bloqueo se avisa con el evento `link_blocked`.
- **CSP**: sin `eval` ni `new Function` (Lottie va en su variante ligera, sin motor de expresiones; el
  build falla si aparece alguno). Sin `style=` en línea: el renderer pinta con la API CSSOM. Estilos, por
  orden: `injectStyles: false` + `<link>` a `customy-stories-embed.css` (`style-src 'self'`); hoja
  construible (`adoptedStyleSheets`); `<style nonce>` si pasas `nonce`. CSP de referencia en
  `dist/iife/embed.html`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src https: data:;
  media-src https:; connect-src https:; base-uri 'none'; form-action 'none'`.
- **Almacenamiento**: caché, «visto» y frecuencia en `localStorage` del origen de la página (en los wrappers,
  el WebView usa almacenamiento aislado/no persistente por defecto: ver cada wrapper).

## Módulos de carga diferida

El principal (~36 kB gzip) incluye barra, banner, visor, cliente y puente. El resto son ficheros hermanos
(IIFE) o `import()` (ESM) que solo se descargan al necesitarlos:

| Módulo | Cuándo se carga | ~gzip |
|---|---|---|
| `components` | el visor lo pide (quiz, reacciones, comercio…) | 5 kB |
| `lottie` | una capa Lottie (variante `lottie_light`, sin `eval`) | 49 kB |
| `game` | un componente `game` abre el Game Center | 11 kB |
| `video`, `live`, `ads` | **no están cableados al visor**: se obtienen con `CustomyStories.loadModule("video"\|"live"\|"ads")` para páginas que los usen (live: `livekit-client` lo aporta la página) | 5 / 11 / 3 kB |

Los módulos IIFE se buscan junto al script principal (o en `data-base`) con el `nonce` del script.
`pnpm --filter @customyai/stories-embed size` mide cada entrada contra `size-budget.json`.

## Construir y probar

```bash
pnpm --filter @customyai/stories-embed build   # dist/ (ESM + .d.ts) y dist/iife/ (scripts, css, embed.html)
pnpm --filter @customyai/stories-embed test    # jsdom: protocolo, política de URL, puente, embed, auditoría del bundle
pnpm --filter @customyai/stories-embed size
```

El renderer se resuelve desde su código fuente (`aliases.mjs`): no hace falta construir `stories-render` antes.
Para alojar el WebView, publica `dist/iife/*` en un origen estático propio con HTTPS (`embed.html` es la página
de ejemplo, sin scripts en línea). Customy aún no aloja ese origen: es una decisión pendiente.

## Wrappers y recetas

- Android (Kotlin/Compose): `packages/stories-embed-android`.
- iOS (`WKWebView`): `packages/stories-embed-swift`.
- Unity: `packages/stories-unity`.
- React Native y Flutter: recetas en esos READMEs y abajo.

### Receta React Native (`react-native-webview`)

```tsx
import { WebView } from "react-native-webview";

const ALLOWED = ["https:", "mailto:", "tel:", "sms:"];
export function Stories({ embedUrl, placementId, getToken }: { embedUrl: string; placementId: string; getToken: () => Promise<string> }) {
  const ref = useRef<WebView>(null);
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const send = (cmd: object) => ref.current?.injectJavaScript(`window.CustomyStories&&window.CustomyStories.receive(${JSON.stringify(JSON.stringify({ source: "customy-stories-host", v: 1, ...cmd }))});true;`);
  return (
    <WebView
      ref={ref}
      source={{ uri: embedUrl }}                    // https del origen que aloja dist/iife
      originWhitelist={["https://*"]}               // y solo ese origen en la práctica: ver onShouldStartLoadWithRequest
      onShouldStartLoadWithRequest={(r) => r.url === embedUrl || r.url.startsWith(new URL(embedUrl).origin + "/")}
      javaScriptEnabled domStorageEnabled={false} incognito allowFileAccess={false} allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false}
      style={full ? StyleSheet.absoluteFill : { height }}
      onMessage={async (e) => {
        let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (m?.source !== "customy-stories" || m.v !== 1) return;
        if (m.type === "ready" && m.awaitingInit) send({ type: "init", config: { placementId, platform: Platform.OS === "ios" ? "ios" : "android", locale: "es", allowedSchemes: ["myapp"] } });
        else if (m.type === "request_token") send({ type: "token", requestId: m.requestId, token: await getToken() });
        else if (m.type === "resize") { setFull(m.mode === "fullscreen"); setHeight(m.height); }
        else if (m.type === "open_url") { const u = new URL(m.url); if (ALLOWED.includes(u.protocol) || u.protocol === "myapp:") Linking.openURL(m.url); } // revalidar
        else if (m.type === "share") Share.share({ message: m.url ?? m.title ?? "" });
      }}
    />
  );
}
```

### Receta Flutter (`webview_flutter`)

```dart
final controller = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..setNavigationDelegate(NavigationDelegate(onNavigationRequest: (r) =>
      r.url.startsWith(embedOrigin) ? NavigationDecision.navigate : NavigationDecision.prevent))
  ..addJavaScriptChannel('CustomyStoriesFlutter', onMessageReceived: (m) async {
    final msg = jsonDecode(m.message) as Map<String, dynamic>;
    if (msg['source'] != 'customy-stories' || msg['v'] != 1) return;
    switch (msg['type']) {
      case 'ready': if (msg['awaitingInit'] == true) send({'type': 'init', 'config': {'placementId': placementId, 'platform': 'android'}});
      case 'request_token': send({'type': 'token', 'requestId': msg['requestId'], 'token': await getToken()});
      case 'open_url': final u = Uri.tryParse(msg['url']); if (u != null && {'https', 'mailto', 'tel', 'sms'}.contains(u.scheme)) launchUrl(u, mode: LaunchMode.externalApplication);
      case 'resize': setState(() { full = msg['mode'] == 'fullscreen'; height = (msg['height'] as num).toDouble(); });
    }
  })
  ..loadRequest(Uri.parse(embedUrl));
void send(Map<String, dynamic> cmd) => controller.runJavaScript(
    'window.CustomyStories&&window.CustomyStories.receive(${jsonEncode(jsonEncode({'source': 'customy-stories-host', 'v': 1, ...cmd}))});');
```

Las recetas no están compiladas ni probadas en un dispositivo: son el patrón que siguen los wrappers
nativos de este repo (que sí compilan y tienen pruebas). Verifica la API de tu versión de `react-native-webview` /
`webview_flutter`.

## Límites conocidos (v0.1)

- Con `display: "bar"`, el visor lo abre la barra por dentro y `pause`/`resume` no llegan a su controlador
  (sí detiene la entrega de nuevas superficies y el WebView se pausa solo al ir a segundo plano). Con
  `display: "viewer"` sí se pausa el visor.
- No se ha probado en WebViews reales; las pruebas son jsdom + auditoría del bundle.
- Widgets de la Ola 3 (canvas, checklist, inline…) no se montan en el embed: solo barra, banner, visor y juego.
