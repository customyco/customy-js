import { isRtlLocale, type Messages } from "../messages";
import type { Clock } from "../clock";
import type { ComponentAction } from "../types";
import type { AssetLoader } from "../preload";

/** Opciones comunes a los componentes web. */
export type UiOptions = {
  locale?: string;
  /** Por defecto, según el idioma (`ar`, `he`, `fa`…). */
  rtl?: boolean;
  theme?: "light" | "dark" | "auto";
  messages?: Partial<Messages>;
  /** Por defecto, `prefers-reduced-motion` del navegador. */
  reducedMotion?: boolean;
  clock?: Clock;
  /** Documento donde pintar (iframes, pruebas). Por defecto el global. */
  doc?: Document;
  /** Esquemas propios de la app (`myapp`) que un `deep_link` puede abrir, además de https, mailto, tel y sms. `tg`, `whatsapp`… solo si los declara. */
  allowedSchemes?: readonly string[];
};

/** Esquemas de `deep_link` que se abren sin configurar nada (lista BLANCA; la misma que `DEFAULT_SCHEMES` del embed). */
export const DEEP_LINK_DEFAULT_SCHEMES: readonly string[] = ["https", "mailto", "tel", "sms"];
/** Aunque la app los declare, jamás se abren (la misma lista que `NEVER_SCHEMES` del embed). */
export const DEEP_LINK_NEVER_SCHEMES: readonly string[] = ["javascript", "data", "file", "blob", "vbscript", "about", "intent", "content", "filesystem", "ws", "wss", "ftp", "http"];

/** ¿Puede abrirse este `deep_link`? Lista blanca de esquemas + los que declare la app; nunca los de `DEEP_LINK_NEVER_SCHEMES`. */
export function isSafeDeepLink(uri: unknown, extraSchemes: readonly string[] = []): boolean {
  // eslint-disable-next-line no-control-regex
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 2048 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(uri.trim())) return false;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(uri.trim());
  if (!m) return false;
  const scheme = m[1]!.toLowerCase();
  if (DEEP_LINK_NEVER_SCHEMES.includes(scheme)) return false;
  return DEEP_LINK_DEFAULT_SCHEMES.includes(scheme) || extraSchemes.some((x) => x.toLowerCase() === scheme);
}

export type Attrs = Record<string, string | number | boolean | null | undefined | Record<string, string>>;

/** Constructor de elementos: atributos, `style` como objeto y hijos (texto o nodos). */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v as unknown as Record<string, string>)) {
        if (prop.startsWith("--")) node.style.setProperty(prop, val);
        else (node.style as unknown as Record<string, string>)[prop] = val;
      }
    } else if (k === "class") node.className = String(v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(typeof c === "string" ? doc.createTextNode(c) : c);
  return node;
}

export function prefersReducedMotion(win: Window | undefined = typeof window === "undefined" ? undefined : window): boolean {
  return !!win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function resolveUi(options: UiOptions): { doc: Document; win: Window & typeof globalThis; rtl: boolean; reducedMotion: boolean } {
  const doc = options.doc ?? document;
  const win = (doc.defaultView ?? window) as Window & typeof globalThis;
  return { doc, win, rtl: options.rtl ?? isRtlLocale(options.locale), reducedMotion: options.reducedMotion ?? prefersReducedMotion(win) };
}

/** Iconos de trazo (heredan `currentColor`): sin dependencias ni colores en el código. */
const ICONS: Record<string, string> = {
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  share: '<path d="M12 15V4m0 0L8 8m4-4l4 4M5 12v7h14v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  "volume-off": '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6m0-6l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 10a2 2 0 100 4m7-4a2 2 0 100 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  up: '<path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  prev: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  next: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  more: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** SVG decorativo (`aria-hidden`): el significado va en el `aria-label` del botón que lo contiene. */
export function icon(doc: Document, name: keyof typeof ICONS | string, size = 18): HTMLSpanElement {
  const span = doc.createElement("span");
  span.className = "cs-ctl__glyph";
  span.setAttribute("aria-hidden", "true");
  span.style.display = "inline-grid";
  // Cadenas estáticas de este archivo: nunca datos de la campaña.
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" focusable="false">${ICONS[name] ?? ""}</svg>`;
  return span;
}

/** Abre un enlace de la campaña: URL https o ruta en pestaña nueva sin `opener`; deep link por navegación solo si su esquema está en la lista blanca (`isSafeDeepLink`). */
export function defaultOpenLink(action: ComponentAction, win: Window = window, allowedSchemes: readonly string[] = []): void {
  if (action.type === "deep_link") {
    if (isSafeDeepLink(action.uri, allowedSchemes)) win.location.href = action.uri.trim();
    return;
  }
  // `//host` y `/\host` son rutas «relativas» solo en apariencia: el navegador las lee como otro origen.
  if (/^\/[/\\]/.test(action.url)) return;
  if (action.url.startsWith("/")) win.location.assign(action.url);
  else if (/^https:\/\/[^\s/]+/.test(action.url)) win.open(action.url, "_blank", "noopener,noreferrer");
}

/** Cargador de activos del navegador: imágenes con `decode`, vídeo hasta sus metadatos, el resto con `fetch`. */
export function browserAssetLoader(win: Window & typeof globalThis = window as Window & typeof globalThis): AssetLoader {
  return (asset, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      const fail = (why: string): void => reject(new Error(why));
      if (asset.kind === "image") {
        const img = new win.Image();
        signal.addEventListener("abort", () => {
          img.src = "";
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
        img.onload = () => resolve();
        img.onerror = () => fail(`image ${asset.url}`);
        img.decoding = "async";
        img.src = asset.url;
      } else if (asset.kind === "video") {
        const v = win.document.createElement("video");
        v.preload = "metadata";
        signal.addEventListener("abort", () => {
          v.removeAttribute("src");
          v.load();
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
        v.onloadedmetadata = () => resolve();
        v.onerror = () => fail(`video ${asset.url}`);
        v.src = asset.url;
      } else {
        win
          .fetch(asset.url, { signal, credentials: "omit" })
          .then((r) => (r.ok ? resolve() : fail(`${asset.kind} ${asset.url} ${r.status}`)))
          .catch((e: unknown) => reject(e));
      }
    });
}

/** Un `requestAnimationFrame` con salida para entornos sin él. */
export function frameLoop(win: Window, tick: () => void): () => void {
  let stopped = false;
  let handle = 0;
  const raf = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : null;
  const loop = (): void => {
    if (stopped) return;
    tick();
    handle = raf ? raf(loop) : (win.setTimeout(loop, 80) as unknown as number);
  };
  loop();
  return () => {
    stopped = true;
    if (raf) win.cancelAnimationFrame?.(handle);
    else win.clearTimeout(handle);
  };
}

export function applyTheme(node: HTMLElement, theme: UiOptions["theme"]): void {
  node.classList.add("cs-root");
  if (theme) node.setAttribute("data-cs-theme", theme);
}
