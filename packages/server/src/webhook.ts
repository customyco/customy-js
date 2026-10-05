/**
 * Verificación de los webhooks que Customy Access envía a tu servidor.
 *
 * Cabecera `Customy-Signature: t=<unix>,v1=<hex>[,v1=<hex>]` (estilo Stripe):
 * `v1 = HMAC-SHA256(secret, "<t>.<cuerpo crudo>")`. Durante una rotación del
 * secreto llegan dos `v1` (el actual y el anterior): vale cualquiera. La marca
 * `t` entra en la firma, así que un atacante no puede cambiarla; la ventana de
 * tolerancia (300 s por omisión) corta la repetición de capturas antiguas.
 *
 * `rawBody` debe ser el cuerpo CRUDO (no re-serializado). Web Crypto: node,
 * edge y Deno. Con `secret` en lista se prueban todos (rotación en el receptor).
 */
import { CustomySdkError } from "@customyai/core";

export const WEBHOOK_SIGNATURE_HEADER = "customy-signature";
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
    let out = "";
    for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
    return out;
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function parseHeader(header: string): { t: number; v1: string[] } | null {
    let t: number | null = null;
    const v1: string[] = [];
    for (const part of header.split(",")) {
        const eq = part.indexOf("=");
        if (eq <= 0) continue;
        const key = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (key === "t" && /^\d{1,12}$/.test(value)) t = Number(value);
        else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) v1.push(value);
    }
    return t !== null && v1.length > 0 ? { t, v1 } : null;
}

/**
 * `true` solo si la cabecera trae `t` dentro de la tolerancia y algún `v1`
 * coincide con el HMAC de `"<t>.<rawBody>"` para alguno de los secretos.
 * Nunca lanza por una cabecera mal formada (devuelve `false`).
 */
export async function verifyWebhookSignature(
    rawBody: string,
    header: string | null | undefined,
    secret: string | readonly string[],
    toleranceSec: number = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    now: () => number = Date.now,
): Promise<boolean> {
    const secrets = (Array.isArray(secret) ? secret : [secret]).filter((s): s is string => typeof s === "string" && s.length > 0);
    if (typeof rawBody !== "string" || typeof header !== "string" || header.length > 2048 || secrets.length === 0) return false;
    const parsed = parseHeader(header);
    if (!parsed) return false;
    if (!Number.isFinite(toleranceSec) || toleranceSec < 0 || Math.abs(now() / 1000 - parsed.t) > toleranceSec) return false;
    const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
    if (!subtle) throw new CustomySdkError({ code: "SDK_CRYPTO_UNAVAILABLE", message: "Web Crypto is not available" });
    const message = encoder.encode(`${parsed.t}.${rawBody}`);
    let matched = false;
    for (const candidate of secrets) {
        const key = await subtle.importKey("raw", encoder.encode(candidate), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const expected = toHex(new Uint8Array(await subtle.sign("HMAC", key, message)));
        for (const provided of parsed.v1) if (constantTimeEqual(provided, expected)) matched = true;
    }
    return matched;
}
