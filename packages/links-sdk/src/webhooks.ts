/**
 * Verificación de webhooks de Customy Links (esquema Svix):
 *
 *   webhook-id, webhook-timestamp, webhook-signature: "v1,<base64 HMAC-SHA256>"
 *   firmado sobre "{id}.{timestamp}.{body}" con el secreto `whsec_<base64>`.
 *
 * Con WebCrypto para que funcione igual en Node 18+, Workers, Deno y Bun.
 */
import type { WebhookEvent } from "./types";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

type HeaderBag = Record<string, string | string[] | undefined> | Headers;

function header(headers: HeaderBag, name: string): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) ?? undefined;
  const bag = headers as Record<string, string | string[] | undefined>;
  const raw = bag[name] ?? bag[name.toLowerCase()] ?? bag[name.toUpperCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") return btoa(String.fromCharCode(...bytes));
  return Buffer.from(bytes).toString("base64");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(secret: string, id: string, timestampSeconds: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestampSeconds}.${body}`));
  return `v1,${bytesToBase64(new Uint8Array(mac))}`;
}

/**
 * Verifica y devuelve el evento parseado, o lanza `WebhookVerificationError`.
 * `body` debe ser el cuerpo **crudo** de la petición (no re-serializado).
 */
export async function verifyWebhook<T = Record<string, unknown>>(
  body: string,
  headers: HeaderBag,
  secret: string,
  options: { toleranceSeconds?: number; now?: Date } = {},
): Promise<WebhookEvent<T>> {
  const id = header(headers, "webhook-id");
  const ts = Number(header(headers, "webhook-timestamp"));
  const signature = header(headers, "webhook-signature");
  if (!id || !Number.isFinite(ts) || !signature) throw new WebhookVerificationError("missing webhook-id, webhook-timestamp or webhook-signature");
  const now = options.now ?? new Date();
  const tolerance = options.toleranceSeconds ?? 300;
  if (Math.abs(now.getTime() / 1000 - ts) > tolerance) throw new WebhookVerificationError("timestamp outside tolerance");
  const expected = await signPayload(secret, id, ts, body);
  const ok = signature.split(/\s+/).some((candidate) => timingSafeEqualStr(candidate, expected));
  if (!ok) throw new WebhookVerificationError("signature mismatch");
  return JSON.parse(body) as WebhookEvent<T>;
}
