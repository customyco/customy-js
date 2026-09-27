/**
 * Mensajes in-app en HTML: la única salida del documento es el puente
 * `window.customy`. Todas las apps lo pintan igual:
 *
 * - Web: `<iframe sandbox="allow-scripts" srcdoc={buildHtmlDocument(html)}>`
 *   (sin `allow-same-origin`, `allow-top-navigation` ni
 *   `allow-popups-to-escape-sandbox`); escucha `message` y pasa `event.data`
 *   a `parseBridgeMessage`, solo si `event.source` es ese iframe.
 * - React Native: `react-native-webview` con `source={{ html: buildHtmlDocument(html) }}`,
 *   `originWhitelist={["*"]}` (con `["about:blank"]` la propia WebView llama a
 *   `Linking.openURL` en toda navegación fuera de la lista ANTES del handler: el
 *   HTML abriría enlaces sin un toque), `onShouldStartLoadWithRequest` → `false`
 *   para todo salvo el `about:blank` inicial, `incognito`, sin cookies, sin
 *   ventanas nuevas; `onMessage={(e) => parseBridgeMessage(e.nativeEvent.data)}`.
 *
 * El HTML nunca recibe el token de la bandeja, las cookies ni el almacenamiento
 * de la app; la app valida cada mensaje e ignora lo demás.
 */
import type { SurveyAnswers } from "../engage-types";

/** CSP que se inyecta al principio del documento: sin red, sin marcos, sin formularios. */
export const HTML_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'";

/**
 * El código de `window.customy` (ES5, sin dependencias): `close()`,
 * `click(buttonId, url?)`, `openUrl(url)`, `requestPushPermission()`,
 * `submitSurvey(surveyId, answers)`, `logEvent(name, props?)`, `resize(height)`.
 * Cada llamada envía un JSON `{ customy: 1, type, … }` por
 * `window.ReactNativeWebView.postMessage` o, si no existe, `window.parent.postMessage(…, "*")`.
 */
export const BRIDGE_SCRIPT = `(function () {
  "use strict";
  var w = window;
  if (w.customy && w.customy.version === 1) return;
  function post(type, fields) {
    var message = { customy: 1, type: type };
    if (fields) for (var key in fields) if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined) message[key] = fields[key];
    var data = JSON.stringify(message);
    var rn = w.ReactNativeWebView;
    if (rn && typeof rn.postMessage === "function") rn.postMessage(data);
    else if (w.parent && typeof w.parent.postMessage === "function") w.parent.postMessage(data, "*");
  }
  var api = {
    version: 1,
    close: function () { post("close"); },
    click: function (buttonId, url) { post("click", { button_id: String(buttonId), url: url == null ? undefined : String(url) }); },
    openUrl: function (url) { post("open_url", { url: String(url) }); },
    requestPushPermission: function () { post("request_push_permission"); },
    submitSurvey: function (surveyId, answers) { post("survey", { survey_id: String(surveyId), answers: answers }); },
    logEvent: function (name, properties) { post("event", { name: String(name), properties: properties == null ? undefined : properties }); },
    resize: function (height) { post("resize", { height: Number(height) }); }
  };
  if (Object.freeze) Object.freeze(api);
  try { Object.defineProperty(w, "customy", { value: api, configurable: false, writable: false, enumerable: true }); }
  catch (e) { w.customy = api; }
  // El alto del contenido (la caja de <body> más sus márgenes), nunca el scrollHeight del
  // documento: ese es al menos el de la vista, así que el mensaje solo podría crecer.
  var d = w.document, last = 0;
  function report() {
    var b = d && d.body;
    if (!b || !b.getBoundingClientRect) return;
    var cs = w.getComputedStyle ? w.getComputedStyle(b) : null;
    var h = Math.ceil(b.getBoundingClientRect().height + (cs ? (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0) : 0));
    if (h > 0 && Math.abs(h - last) > 1) { last = h; api.resize(h); }
  }
  function watch() {
    report();
    // Imágenes y fuentes tardías cambian el alto: se vuelve a medir (el umbral de 1 px frena los bucles).
    try { new w.ResizeObserver(report).observe(d.body); } catch (e) {}
  }
  if (d) {
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", watch);
    else watch();
    w.addEventListener("load", report);
  }
})();`;

/** Márgenes seguros del dispositivo, en px (notch, barra de estado, indicador de inicio, barra de navegación). */
export type SafeAreaInsets = { top: number; bottom: number; left: number; right: number };

/**
 * Lo que el anfitrión sabe del hueco donde pinta el HTML (§9): se inyecta como
 * variables CSS en `:root` antes del código del autor:
 * `--customy-safe-top|-bottom|-left|-right` (px) y `--customy-viewport-height` (px).
 */
export type HtmlDocumentOptions = { safeArea?: Partial<SafeAreaInsets>; viewportHeight?: number };

const px = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? `${Math.round(value * 100) / 100}px` : "0px");

/** El `<style>` con las variables de `HtmlDocumentOptions` (vacío sin opciones). */
export function safeAreaStyle(options: HtmlDocumentOptions = {}): string {
  const s = options.safeArea ?? {};
  const vars = [`--customy-safe-top:${px(s.top)}`, `--customy-safe-bottom:${px(s.bottom)}`, `--customy-safe-left:${px(s.left)}`, `--customy-safe-right:${px(s.right)}`];
  if (typeof options.viewportHeight === "number" && Number.isFinite(options.viewportHeight) && options.viewportHeight > 0) vars.push(`--customy-viewport-height:${px(options.viewportHeight)}`);
  return `<style>:root{${vars.join(";")}}</style>`;
}

/** Diseños en los que un HTML puede ir (§9); el `tooltip` no admite HTML. */
export const HTML_LAYOUTS = ["modal", "fullscreen", "banner", "card", "slideup"] as const;
/** La función que declara una app que pinta HTML en todos esos diseños (`capabilities.features`). */
export const HTML_LAYOUTS_FEATURE = "html_layouts";

/**
 * El alto con el que se pinta un HTML que no es de pantalla completa (§9): el
 * que pidió `resize`, con tope en el 40 % de la pantalla para banner y slideup
 * y el 80 % para tarjeta y modal. En `fullscreen` (y en el `html` de siempre sin
 * `resize`) ocupa lo que el anfitrión decida: devuelve `null`.
 */
export function clampHtmlHeight(layout: string, requested: number | null | undefined, screenHeight: number): number | null {
  if (layout === "fullscreen" || typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) return null;
  const cap = layout === "banner" || layout === "slideup" ? 0.4 : 0.8;
  return Math.max(1, Math.min(Math.round(requested), Math.floor(screenHeight * cap)));
}

export type BridgeMessage =
  | { customy: 1; type: "close" }
  /** Pulsó un botón: la app lo registra como clic con esa acción y, si hay `url`, navega (ruta de la app) o la abre fuera (https). */
  | { customy: 1; type: "click"; button_id: string; url?: string }
  | { customy: 1; type: "open_url"; url: string }
  | { customy: 1; type: "request_push_permission" }
  | { customy: 1; type: "survey"; survey_id: string; answers: SurveyAnswers }
  | { customy: 1; type: "event"; name: string; properties?: Record<string, unknown> }
  /** Alto en px (0…10000) para los diseños que no ocupan toda la pantalla. */
  | { customy: 1; type: "resize"; height: number };
export type BridgeMessageType = BridgeMessage["type"];

/** Límites compartidos con `logEvent`. */
export const EVENT_NAME_MAX = 60;
export const EVENT_PROPERTIES_MAX_BYTES = 2048;
const ID_MAX = 120;
const URL_MAX = 2048;

/** Bytes UTF-8 de un texto (sin `TextEncoder`: sirve en cualquier motor JS). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Bytes del JSON de un valor, o `null` si no se puede serializar. */
export function jsonBytes(value: unknown): number | null {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? utf8Length(json) : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

const shortId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= ID_MAX;

/** Ruta de la app (`/facturas/42`, no `//otro`) o URL `https://`. Nada más (ni `javascript:`, ni `http:`, ni `data:`). */
export function isSafeBridgeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > URL_MAX) return false;
  // Sin espacios, controles ni barras invertidas (los navegadores las leen como `/`).
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  // https con host y sin usuario (`https://app.com@otro.com` engaña a la vista).
  return /^https:\/\/[^/?#@]+(?:[/?#]|$)/i.test(value);
}

function validAnswers(value: unknown): value is SurveyAnswers {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return true;
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => typeof item === "string");
  return false;
}

/**
 * Valida un mensaje del puente (el `data` de `postMessage`, texto JSON u
 * objeto) y devuelve una copia tipada solo con sus campos, o `null` si no es
 * válido: la app nunca actúa sobre otra cosa.
 */
export function parseBridgeMessage(input: unknown): BridgeMessage | null {
  let data: unknown = input;
  if (typeof input === "string") {
    if (input.length > 16_384) return null;
    try {
      data = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!isPlainObject(data) || data.customy !== 1 || typeof data.type !== "string") return null;
  switch (data.type) {
    case "close":
      return { customy: 1, type: "close" };
    case "request_push_permission":
      return { customy: 1, type: "request_push_permission" };
    case "click": {
      if (!shortId(data.button_id)) return null;
      if (data.url === undefined || data.url === null) return { customy: 1, type: "click", button_id: data.button_id };
      return isSafeBridgeUrl(data.url) ? { customy: 1, type: "click", button_id: data.button_id, url: data.url } : null;
    }
    case "open_url":
      return isSafeBridgeUrl(data.url) ? { customy: 1, type: "open_url", url: data.url } : null;
    case "survey": {
      if (!shortId(data.survey_id) || !validAnswers(data.answers)) return null;
      const bytes = jsonBytes(data.answers);
      if (bytes === null || bytes > EVENT_PROPERTIES_MAX_BYTES) return null;
      return { customy: 1, type: "survey", survey_id: data.survey_id, answers: Array.isArray(data.answers) ? [...data.answers] : data.answers };
    }
    case "event": {
      if (typeof data.name !== "string" || data.name.length === 0 || data.name.length > EVENT_NAME_MAX) return null;
      if (data.properties === undefined || data.properties === null) return { customy: 1, type: "event", name: data.name };
      if (!isPlainObject(data.properties)) return null;
      const bytes = jsonBytes(data.properties);
      if (bytes === null || bytes > EVENT_PROPERTIES_MAX_BYTES) return null;
      return { customy: 1, type: "event", name: data.name, properties: data.properties };
    }
    case "resize": {
      const height = data.height;
      if (typeof height !== "number" || !Number.isFinite(height) || height < 0 || height > 10_000) return null;
      return { customy: 1, type: "resize", height };
    }
    default:
      return null;
  }
}

/**
 * El documento que se pinta: la CSP (`HTML_CSP`), las variables de márgenes
 * seguros (`safeAreaStyle`, si se pasan opciones) y el puente al principio de
 * `<head>`; sin `<head>`, se crea uno tras `<html>` o tras el `<!doctype>`, y
 * si no hay nada de eso, se antepone.
 */
export function buildHtmlDocument(html: string, options?: HtmlDocumentOptions): string {
  const inject = `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}">${options ? safeAreaStyle(options) : ""}<script>${BRIDGE_SCRIPT}</script>`;
  const source = String(html ?? "");
  const insertAfter = (match: RegExpExecArray | null, text: string) =>
    match ? source.slice(0, match.index + match[0].length) + text + source.slice(match.index + match[0].length) : null;
  return (
    insertAfter(/<head(?:\s[^>]*)?>/i.exec(source), inject) ??
    insertAfter(/<html(?:\s[^>]*)?>/i.exec(source), `<head>${inject}</head>`) ??
    insertAfter(/^\s*<!doctype[^>]*>/i.exec(source), inject) ??
    inject + source
  );
}
