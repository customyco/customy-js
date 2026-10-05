/**
 * Protocolo del puente nativo de @customyai/stories-embed (versión 1).
 *
 * Todo mensaje es un objeto JSON con sobre `{ source, v, type, ... }`. Es la ÚNICA superficie entre la página
 * embebida y la app anfitriona: nunca se ejecuta JS que venga en un mensaje, solo se lee un conjunto cerrado de
 * tipos y campos. Sin DOM: lo comparten el embed, las pruebas y la especificación de los wrappers nativos.
 *
 *   página → anfitrión  `source: "customy-stories"`       ready · resize · open_url · close · event ·
 *                                                          request_permission · share · request_token · error
 *   anfitrión → página  `source: "customy-stories-host"`  init · token · pause · resume · destroy · set_theme ·
 *                                                          set_locale · permission_result · open · close_viewer · visibility
 */
import { isAllowedUrl, type UrlPolicy } from "./url-policy";

export const PROTOCOL_VERSION = 1;
export const PAGE_SOURCE = "customy-stories";
export const HOST_SOURCE = "customy-stories-host";
/** Tope de bytes de un mensaje entrante (JSON). Más grande se rechaza sin parsear. */
export const MAX_INBOUND_BYTES = 16 * 1024;
/** Tope de bytes de un mensaje saliente (los eventos se recortan antes). */
export const MAX_OUTBOUND_BYTES = 32 * 1024;

export type Theme = "light" | "dark" | "auto";
export type Platform = "ios" | "android" | "web";
export type Display = "bar" | "banner" | "viewer";
export type PermissionName = "notifications" | "calendar" | "camera" | "microphone" | "photos";
export type ResizeMode = "inline" | "fullscreen";

export type InitConfig = {
  placementId: string;
  locale?: string;
  theme?: Theme;
  platform?: Platform;
  appVersion?: string;
  baseUrl?: string;
  display?: Display;
  /** Esquemas de deep link propios de la app (`myapp`); se suman a los https/mailto/tel/sms por defecto. */
  allowedSchemes?: string[];
};

export type PageMessage =
  | { type: "ready"; sdk: string; protocol: number; capabilities: string[]; awaitingInit: boolean }
  | { type: "resize"; height: number; mode: ResizeMode }
  | { type: "open_url"; url: string; kind: "url" | "deep_link"; elementId?: string }
  | { type: "close"; reason: string }
  | { type: "event"; name: string; data: Record<string, unknown> }
  | { type: "request_permission"; permission: PermissionName; data: Record<string, unknown> }
  | { type: "share"; url?: string; title?: string }
  | { type: "request_token"; requestId: string; forceRefresh: boolean }
  | { type: "error"; code: string; message: string };

export type HostCommand =
  | { type: "init"; config: InitConfig }
  | { type: "token"; requestId: string; token?: string; error?: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "destroy" }
  | { type: "set_theme"; theme: Theme }
  | { type: "set_locale"; locale: string }
  | { type: "permission_result"; permission: PermissionName; granted: boolean }
  | { type: "open"; groupId?: string }
  | { type: "close_viewer" }
  | { type: "visibility"; visible: boolean };

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

const fail = <T>(reason: string): Parsed<T> => ({ ok: false, reason });
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const PLACEMENT_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const LOCALE_RE = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8}){0,3}$/;
const VERSION_RE = /^[0-9A-Za-z._+-]{1,40}$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]{1,31}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
/** Tokens de suscriptor de Send. Una llave de servicio (`sk_…`, `x-internal-key`…) jamás entra en una página. */
export const SUBSCRIBER_TOKEN_RE = /^sst_[A-Za-z0-9_.-]{8,512}$/;
const THEMES: readonly Theme[] = ["light", "dark", "auto"];
const PLATFORMS: readonly Platform[] = ["ios", "android", "web"];
const DISPLAYS: readonly Display[] = ["bar", "banner", "viewer"];
const PERMISSIONS: readonly PermissionName[] = ["notifications", "calendar", "camera", "microphone", "photos"];

export const isTheme = (x: unknown): x is Theme => THEMES.includes(x as Theme);
export const isPlatform = (x: unknown): x is Platform => PLATFORMS.includes(x as Platform);
export const isDisplay = (x: unknown): x is Display => DISPLAYS.includes(x as Display);
export const isPlacementId = (x: unknown): x is string => typeof x === "string" && PLACEMENT_RE.test(x);
export const isLocale = (x: unknown): x is string => typeof x === "string" && LOCALE_RE.test(x);

/** `https` siempre; `http` solo hacia loopback o `10.0.2.2` (el anfitrión visto desde el emulador de Android; desarrollo). Sin credenciales en la URL. */
export function isSafeBaseUrl(x: unknown): x is string {
  if (typeof x !== "string" || x.length > 512) return false;
  try {
    const u = new URL(x);
    if (u.username || u.password || u.hash || u.search) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname === "10.0.2.2");
  } catch {
    return false;
  }
}

/** Valida y normaliza la configuración de `init` (de la API JS o del comando `init` del anfitrión). */
export function parseInitConfig(raw: unknown): Parsed<InitConfig> {
  if (!isObj(raw)) return fail("config debe ser un objeto");
  const out: InitConfig = { placementId: "" };
  if (!isPlacementId(raw.placementId)) return fail("placementId inválido");
  out.placementId = raw.placementId;
  if (raw.locale !== undefined) {
    if (!isLocale(raw.locale)) return fail("locale inválido");
    out.locale = raw.locale;
  }
  if (raw.theme !== undefined) {
    if (!isTheme(raw.theme)) return fail("theme inválido");
    out.theme = raw.theme;
  }
  if (raw.platform !== undefined) {
    if (!isPlatform(raw.platform)) return fail("platform inválida");
    out.platform = raw.platform;
  }
  if (raw.appVersion !== undefined) {
    if (typeof raw.appVersion !== "string" || !VERSION_RE.test(raw.appVersion)) return fail("appVersion inválida");
    out.appVersion = raw.appVersion;
  }
  if (raw.baseUrl !== undefined) {
    if (!isSafeBaseUrl(raw.baseUrl)) return fail("baseUrl debe ser https (http solo en localhost) sin credenciales");
    out.baseUrl = raw.baseUrl;
  }
  if (raw.display !== undefined) {
    if (!isDisplay(raw.display)) return fail("display inválido");
    out.display = raw.display;
  }
  if (raw.allowedSchemes !== undefined) {
    if (!Array.isArray(raw.allowedSchemes) || raw.allowedSchemes.length > 16 || !raw.allowedSchemes.every((s) => typeof s === "string" && SCHEME_RE.test(s))) return fail("allowedSchemes inválido");
    out.allowedSchemes = [...raw.allowedSchemes] as string[];
  }
  return { ok: true, value: out };
}

/** Parsea un comando del anfitrión: texto JSON u objeto ya construido. Nada fuera de la lista cerrada pasa. */
export function parseHostCommand(raw: unknown): Parsed<HostCommand> {
  let msg: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > MAX_INBOUND_BYTES) return fail("mensaje demasiado grande");
    try {
      msg = JSON.parse(raw);
    } catch {
      return fail("JSON inválido");
    }
  }
  if (!isObj(msg)) return fail("el mensaje debe ser un objeto");
  if (msg.source !== HOST_SOURCE) return fail("origen del mensaje no reconocido");
  if (msg.v !== PROTOCOL_VERSION) return fail(`versión de protocolo no soportada (${String(msg.v)})`);
  switch (msg.type) {
    case "init": {
      const cfg = parseInitConfig(msg.config);
      return cfg.ok ? { ok: true, value: { type: "init", config: cfg.value } } : cfg;
    }
    case "token": {
      if (typeof msg.requestId !== "string" || !ID_RE.test(msg.requestId)) return fail("requestId inválido");
      if (msg.token !== undefined) {
        if (typeof msg.token !== "string" || !SUBSCRIBER_TOKEN_RE.test(msg.token)) return fail("token no es un token de suscriptor (sst_…)");
        return { ok: true, value: { type: "token", requestId: msg.requestId, token: msg.token } };
      }
      return { ok: true, value: { type: "token", requestId: msg.requestId, error: typeof msg.error === "string" ? msg.error.slice(0, 200) : "token no disponible" } };
    }
    case "pause":
    case "resume":
    case "destroy":
    case "close_viewer":
      return { ok: true, value: { type: msg.type } };
    case "set_theme":
      return isTheme(msg.theme) ? { ok: true, value: { type: "set_theme", theme: msg.theme } } : fail("theme inválido");
    case "set_locale":
      return isLocale(msg.locale) ? { ok: true, value: { type: "set_locale", locale: msg.locale } } : fail("locale inválido");
    case "permission_result":
      if (!PERMISSIONS.includes(msg.permission as PermissionName) || typeof msg.granted !== "boolean") return fail("permission_result inválido");
      return { ok: true, value: { type: "permission_result", permission: msg.permission as PermissionName, granted: msg.granted } };
    case "open":
      if (msg.groupId !== undefined && (typeof msg.groupId !== "string" || !ID_RE.test(msg.groupId))) return fail("groupId inválido");
      return { ok: true, value: { type: "open", ...(typeof msg.groupId === "string" ? { groupId: msg.groupId } : {}) } };
    case "visibility":
      return typeof msg.visible === "boolean" ? { ok: true, value: { type: "visibility", visible: msg.visible } } : fail("visible inválido");
    default:
      return fail(`tipo de comando desconocido: ${String(msg.type).slice(0, 40)}`);
  }
}

const SECRET_KEY_RE = /token|secret|authorization|password|passwd|api[_-]?key|cookie|credential/i;
const MAX_DEPTH = 4;
const MAX_KEYS = 32;
const MAX_STRING = 512;

/** Datos de un evento aptos para cruzar el puente: JSON plano acotado, sin claves que parezcan credenciales. */
export function sanitizeData(value: unknown, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isObj(value)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(value)) {
    if (n >= MAX_KEYS) break;
    if (SECRET_KEY_RE.test(k) || k === "__proto__" || k === "constructor" || k === "prototype") continue;
    const clean = sanitizeValue(v, depth + 1);
    if (clean !== undefined) {
      out[k.slice(0, 64)] = clean;
      n++;
    }
  }
  return out;
}

function sanitizeValue(v: unknown, depth: number): unknown {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return v.length > MAX_STRING ? v.slice(0, MAX_STRING) : v;
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(v)) return v.slice(0, 16).map((x) => sanitizeValue(x, depth + 1)).filter((x) => x !== undefined);
  if (isObj(v)) return sanitizeData(v, depth);
  return undefined;
}

/** Valida un mensaje saliente ANTES de enviarlo: lo que no cumple se descarta (y se registra como error local). */
export function validateOutbound(msg: PageMessage, policy: UrlPolicy): Parsed<PageMessage> {
  switch (msg.type) {
    case "open_url": {
      const r = isAllowedUrl(msg.url, policy);
      if (!r.ok) return fail(`url no permitida: ${r.reason}`);
      return { ok: true, value: { ...msg, url: r.url } };
    }
    case "resize":
      if (!Number.isFinite(msg.height) || msg.height < 0 || msg.height > 100_000) return fail("altura inválida");
      return { ok: true, value: { ...msg, height: Math.ceil(msg.height) } };
    case "event":
      if (!/^[a-z0-9_.:-]{1,64}$/i.test(msg.name)) return fail("nombre de evento inválido");
      return { ok: true, value: { ...msg, data: sanitizeData(msg.data) } };
    case "request_permission":
      return { ok: true, value: { ...msg, data: sanitizeData(msg.data) } };
    case "share": {
      if (msg.url === undefined) return { ok: true, value: msg };
      // Compartir: solo https/mailto/tel/sms, nunca el esquema propio de la app.
      const r = isAllowedUrl(msg.url, { ...policy, extraSchemes: [] });
      if (!r.ok) return fail(`url de compartir no permitida: ${r.reason}`);
      return { ok: true, value: { ...msg, url: r.url, ...(msg.title ? { title: msg.title.slice(0, 200) } : {}) } };
    }
    default:
      return { ok: true, value: msg };
  }
}

const PERMISSION_SET = PERMISSIONS;
// eslint-disable-next-line no-control-regex
const FREE_TEXT_RE = /^[^\u0000-\u001f\u007f]{1,200}$/;

/**
 * Lado ANFITRIÓN (React Native, iframe, tests y la especificación de los wrappers nativos): parsea un mensaje que llega
 * de la página con la misma rigidez que `parseHostCommand` aplica en sentido contrario. Todo `open_url` se vuelve a
 * validar aquí con la política de la app; los campos que no están en el protocolo se descartan.
 */
export function parsePageMessage(raw: unknown, policy: UrlPolicy = {}): Parsed<PageMessage> {
  let msg: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > MAX_OUTBOUND_BYTES) return fail("mensaje demasiado grande");
    try {
      msg = JSON.parse(raw);
    } catch {
      return fail("JSON inválido");
    }
  }
  if (!isObj(msg)) return fail("el mensaje debe ser un objeto");
  if (msg.source !== PAGE_SOURCE) return fail("origen del mensaje no reconocido");
  if (msg.v !== PROTOCOL_VERSION) return fail(`versión de protocolo no soportada (${String(msg.v)})`);
  const str = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;
  switch (msg.type) {
    case "ready": {
      if (!str(msg.sdk, 64) || !Number.isInteger(msg.protocol) || typeof msg.awaitingInit !== "boolean") return fail("ready inválido");
      if (!Array.isArray(msg.capabilities) || msg.capabilities.length > 32 || !msg.capabilities.every((c) => str(c, 32))) return fail("capabilities inválido");
      return { ok: true, value: { type: "ready", sdk: msg.sdk, protocol: msg.protocol as number, capabilities: [...(msg.capabilities as string[])], awaitingInit: msg.awaitingInit } };
    }
    case "resize": {
      if (typeof msg.height !== "number" || !Number.isFinite(msg.height) || msg.height < 0 || msg.height > 100_000) return fail("altura inválida");
      if (msg.mode !== "inline" && msg.mode !== "fullscreen") return fail("mode inválido");
      return { ok: true, value: { type: "resize", height: msg.height, mode: msg.mode } };
    }
    case "open_url": {
      const check = isAllowedUrl(msg.url, policy);
      if (!check.ok) return fail(`url no permitida: ${check.reason}`);
      if (msg.kind !== "url" && msg.kind !== "deep_link") return fail("kind inválido");
      if (msg.elementId !== undefined && !(typeof msg.elementId === "string" && FREE_TEXT_RE.test(msg.elementId))) return fail("elementId inválido");
      return { ok: true, value: { type: "open_url", url: check.url, kind: msg.kind, ...(typeof msg.elementId === "string" ? { elementId: msg.elementId } : {}) } };
    }
    case "close":
      return str(msg.reason, 64) ? { ok: true, value: { type: "close", reason: msg.reason } } : fail("reason inválido");
    case "event":
      if (typeof msg.name !== "string" || !/^[a-z0-9_.:-]{1,64}$/i.test(msg.name) || !isObj(msg.data)) return fail("event inválido");
      return { ok: true, value: { type: "event", name: msg.name, data: sanitizeData(msg.data) } };
    case "request_permission":
      if (!PERMISSION_SET.includes(msg.permission as PermissionName) || !isObj(msg.data)) return fail("request_permission inválido");
      return { ok: true, value: { type: "request_permission", permission: msg.permission as PermissionName, data: sanitizeData(msg.data) } };
    case "share": {
      if (msg.title !== undefined && !str(msg.title, 200)) return fail("title inválido");
      if (msg.url !== undefined) {
        const check = isAllowedUrl(msg.url, { ...policy, extraSchemes: [] });
        if (!check.ok) return fail(`url de compartir no permitida: ${check.reason}`);
        return { ok: true, value: { type: "share", url: check.url, ...(typeof msg.title === "string" ? { title: msg.title } : {}) } };
      }
      return { ok: true, value: { type: "share", ...(typeof msg.title === "string" ? { title: msg.title } : {}) } };
    }
    case "request_token":
      if (typeof msg.requestId !== "string" || !ID_RE.test(msg.requestId) || typeof msg.forceRefresh !== "boolean") return fail("request_token inválido");
      return { ok: true, value: { type: "request_token", requestId: msg.requestId, forceRefresh: msg.forceRefresh } };
    case "error":
      return str(msg.code, 64) && str(msg.message, 500) ? { ok: true, value: { type: "error", code: msg.code, message: msg.message } } : fail("error inválido");
    default:
      return fail(`tipo de mensaje desconocido: ${String(msg.type).slice(0, 40)}`);
  }
}

export function encodePageMessage(msg: PageMessage): string {
  return JSON.stringify({ source: PAGE_SOURCE, v: PROTOCOL_VERSION, ...msg });
}
