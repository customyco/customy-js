/**
 * Claves de idempotencia. Una operación con efecto (un `POST` que crea algo)
 * solo se puede reintentar sin duplicarla si el servidor reconoce el reintento:
 * la misma `Idempotency-Key` viaja en todos los intentos de la misma operación.
 */
export const IDEMPOTENCY_HEADER = "idempotency-key";

/** Longitud y alfabeto aceptados: los de los servicios de Customy (1–255, ASCII visible). */
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

export function isValidIdempotencyKey(key: string): boolean {
    return typeof key === "string" && KEY_PATTERN.test(key);
}

/** Clave nueva (UUID v4) con la Web Crypto del entorno: node, edge y navegador. */
export function createIdempotencyKey(): string {
    const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (!cryptoApi?.getRandomValues) throw new Error("SDK_CRYPTO_UNAVAILABLE");
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
