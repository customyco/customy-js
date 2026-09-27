/**
 * Verificación de los webhooks de Customy Send en el servidor de la app.
 *
 * Esquema `webhook-id`, `webhook-timestamp` y `webhook-signature`
 * («v1,<base64 HMAC-SHA256(secret, "{id}.{ts}.{body}")>») con el secreto
 * `whsec_…` que se enseñó al crear el webhook. Web Crypto: node, edge y Deno.
 */

export type WebhookEvent<T = Record<string, unknown>> = { type: string; created_at: string; data: T };

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

async function hmacBase64(secret: string, message: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Verifica y devuelve el evento. `body` tiene que ser el cuerpo CRUDO de la
 * petición (no re-serializado): la firma es sobre los bytes exactos.
 */
export async function verifyWebhook<T = Record<string, unknown>>(
  body: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  options: { toleranceSeconds?: number; now?: () => number } = {},
): Promise<WebhookEvent<T>> {
  const pick = (name: string) => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  const id = pick("webhook-id");
  const ts = Number(pick("webhook-timestamp"));
  const signature = pick("webhook-signature");
  if (!id || !Number.isFinite(ts) || !signature) throw new WebhookVerificationError("faltan las cabeceras webhook-id, webhook-timestamp o webhook-signature");
  const now = (options.now ?? Date.now)() / 1000;
  if (Math.abs(now - ts) > (options.toleranceSeconds ?? 300)) throw new WebhookVerificationError("la marca de tiempo del webhook está fuera de la ventana");
  const expected = `v1,${await hmacBase64(secret, `${id}.${ts}.${body}`)}`;
  if (!signature.split(/\s+/).some((candidate) => constantTimeEqual(candidate, expected))) throw new WebhookVerificationError("la firma del webhook no coincide");
  return JSON.parse(body) as WebhookEvent<T>;
}
