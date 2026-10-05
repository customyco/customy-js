/**
 * URL de contenido remoto (campañas, repeticiones, pósters, subtítulos, términos): SOLO `https`, con host y SIN credenciales
 * (`user:pass@host` disfraza el destino real). Devuelve la URL normalizada o `undefined`; quien la usa omite el elemento.
 * Nunca se confía en que el servidor ya la validó: un `href`/`src` con `javascript:` o `data:` es una vía de XSS.
 */
export function safeHttpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(raw.trim())) return undefined;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return undefined;
  return u.href;
}
