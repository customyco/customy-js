/**
 * Puente nativo: detecta el canal del anfitrión, envía mensajes validados y entrega solo comandos válidos.
 *
 * Canales (la app define uno; el nombre de cada uno es parte del protocolo v1):
 *   ios      `window.webkit.messageHandlers.customyStories.postMessage(texto)`   (WKScriptMessageHandler)
 *   android  `window.CustomyStoriesAndroid.postMessage(texto)`                  (addJavascriptInterface, un solo método)
 *   rn       `window.ReactNativeWebView.postMessage(texto)`                     (react-native-webview)
 *   flutter  `window.CustomyStoriesFlutter.postMessage(texto)`                  (JavaScriptChannel de webview_flutter)
 *   parent   `window.parent.postMessage(objeto, parentOrigin)`                  (iframe; exige `parentOrigin`, nunca "*")
 *   custom   función `post(texto)` que inyecta quien integra (p. ej. un `.jslib` de Unity WebGL)
 * Hacia la página, el anfitrión llama `window.CustomyStories.receive(texto)` (un nombre fijo, sin `eval` de
 * contenido) o, en iframe, `postMessage` con origen comprobado.
 */
import { MAX_OUTBOUND_BYTES, encodePageMessage, parseHostCommand, validateOutbound, type HostCommand, type PageMessage } from "./protocol";
import type { UrlPolicy } from "./url-policy";

export type TransportName = "ios" | "android" | "rn" | "flutter" | "parent" | "custom";
export type Transport = { name: TransportName; post(json: string): void };

export type BridgeOptions = {
  win: Window & typeof globalThis;
  /** Origen EXACTO de la página que hospeda el iframe (`https://app.ejemplo.com`). Sin él no hay canal `parent`. */
  parentOrigin?: string;
  custom?: (json: string) => void;
  policy: () => UrlPolicy;
  onCommand: (cmd: HostCommand) => void;
  /** Mensajes rechazados (entrantes mal formados, salientes no permitidos): para registro local, nunca se reenvían. */
  onReject?: (direction: "in" | "out", reason: string) => void;
};

type AnyWin = Window & {
  webkit?: { messageHandlers?: { customyStories?: { postMessage(m: unknown): void } } };
  CustomyStoriesAndroid?: { postMessage(m: string): void };
  ReactNativeWebView?: { postMessage(m: string): void };
  CustomyStoriesFlutter?: { postMessage(m: string): void };
};

export function detectTransport(win: Window, parentOrigin?: string, custom?: (json: string) => void): Transport | null {
  const w = win as AnyWin;
  if (custom) return { name: "custom", post: custom };
  const ios = w.webkit?.messageHandlers?.customyStories;
  if (ios) return { name: "ios", post: (j) => ios.postMessage(j) };
  const android = w.CustomyStoriesAndroid;
  if (android) return { name: "android", post: (j) => android.postMessage(j) };
  const rn = w.ReactNativeWebView;
  if (rn) return { name: "rn", post: (j) => rn.postMessage(j) };
  const flutter = w.CustomyStoriesFlutter;
  if (flutter) return { name: "flutter", post: (j) => flutter.postMessage(j) };
  if (parentOrigin && win.parent && win.parent !== win) {
    return { name: "parent", post: (j) => win.parent.postMessage(JSON.parse(j), parentOrigin) };
  }
  return null;
}

export type Bridge = {
  readonly transport: Transport | null;
  /** `true` si el mensaje salió; `false` si no hay canal o no pasó la validación. */
  send(msg: PageMessage): boolean;
  /** Punto de entrada de los comandos del anfitrión (texto JSON u objeto). Devuelve si se aceptó. */
  receive(raw: unknown): boolean;
  destroy(): void;
};

export function createBridge(options: BridgeOptions): Bridge {
  const { win } = options;
  const transport = detectTransport(win, options.parentOrigin, options.custom);
  let listening = false;

  const receive = (raw: unknown): boolean => {
    const parsed = parseHostCommand(raw);
    if (!parsed.ok) {
      options.onReject?.("in", parsed.reason);
      return false;
    }
    options.onCommand(parsed.value);
    return true;
  };

  // Canal de iframe: origen y emisor comprobados; cualquier otra ventana se ignora en silencio.
  const onMessage = (e: MessageEvent): void => {
    if (e.origin !== options.parentOrigin || e.source !== win.parent) return;
    receive(e.data);
  };
  if (transport?.name === "parent") {
    win.addEventListener("message", onMessage);
    listening = true;
  }

  return {
    transport,
    send(msg) {
      if (!transport) return false;
      const checked = validateOutbound(msg, options.policy());
      if (!checked.ok) {
        options.onReject?.("out", checked.reason);
        return false;
      }
      const json = encodePageMessage(checked.value);
      if (json.length > MAX_OUTBOUND_BYTES) {
        options.onReject?.("out", "mensaje demasiado grande");
        return false;
      }
      try {
        transport.post(json);
        return true;
      } catch (err) {
        options.onReject?.("out", err instanceof Error ? err.message : "el canal falló");
        return false;
      }
    },
    receive,
    destroy() {
      if (listening) win.removeEventListener("message", onMessage);
      listening = false;
    },
  };
}
