/**
 * Política de URL del embed: lista BLANCA de esquemas. Todo lo que el contenido de una campaña pida abrir
 * (botones, banners, deep links) pasa por aquí antes de cruzar el puente, y el anfitrión nativo debe volver a
 * comprobarlo (defensa en profundidad: ver README).
 */

/** Esquemas que se permiten sin configurar nada. `http` queda fuera: solo `https`. */
export const DEFAULT_SCHEMES: readonly string[] = ["https", "mailto", "tel", "sms"];

/** Aunque la app los liste en `allowedSchemes`, jamás se aceptan: ejecutan código o leen ficheros locales. */
export const NEVER_SCHEMES: readonly string[] = ["javascript", "data", "file", "blob", "vbscript", "about", "intent", "content", "filesystem", "ws", "wss", "ftp", "http"];

export type UrlPolicy = {
  /** Esquemas propios de la app (`myapp`), además de los de `DEFAULT_SCHEMES`. */
  extraSchemes?: readonly string[];
  /** Solo en desarrollo: permite `http:` hacia localhost. */
  allowLocalHttp?: boolean;
};

export type UrlCheck = { ok: true; url: string; scheme: string } | { ok: false; reason: string };

const MAX_URL = 2048;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Devuelve la URL NORMALIZADA (`new URL(x).href`) si pasa; esa es la que debe abrirse, no la cadena original
 * (el parser de URL quita tabuladores y saltos de línea, de modo que `java\tscript:` se detecta como `javascript:`).
 */
export function isAllowedUrl(raw: unknown, policy: UrlPolicy = {}): UrlCheck {
  if (typeof raw !== "string") return { ok: false, reason: "no es texto" };
  if (raw.length === 0 || raw.length > MAX_URL) return { ok: false, reason: "longitud no válida" };
  if (CONTROL_RE.test(raw.trim())) return { ok: false, reason: "caracteres de control" };
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "no es una URL absoluta" };
  }
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (scheme === "http" && policy.allowLocalHttp && local) return { ok: true, url: u.href, scheme };
  if (NEVER_SCHEMES.includes(scheme)) return { ok: false, reason: `esquema prohibido: ${scheme}` };
  const allowed = [...DEFAULT_SCHEMES, ...(policy.extraSchemes ?? [])];
  if (!allowed.includes(scheme)) return { ok: false, reason: `esquema no permitido: ${scheme}` };
  if (u.username || u.password) return { ok: false, reason: "credenciales en la URL" };
  if (scheme === "https" && !u.hostname) return { ok: false, reason: "sin host" };
  return { ok: true, url: u.href, scheme };
}
