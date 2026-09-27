/**
 * Política de reintentos. Se repite solo lo que es seguro repetir: errores de
 * red, 408, 425, 429 y 5xx transitorios; y un método no idempotente solo si la
 * petición lleva `Idempotency-Key`. La espera respeta `Retry-After`.
 */
export type RetryPolicy = Readonly<{
    /** Reintentos tras el primer intento (por defecto 2; 0 los desactiva). */
    maxRetries?: number;
    /** Base del backoff exponencial con jitter completo (por defecto 300 ms). */
    baseDelayMs?: number;
    /** Tope de una espera calculada por backoff (por defecto 8 s). */
    maxDelayMs?: number;
    /**
     * Tope de una espera pedida por `Retry-After` (por defecto 60 s). Si el
     * servidor pide más, no se reintenta: el error sale con `retryAfterMs`.
     */
    maxRetryAfterMs?: number;
}>;

export const DEFAULT_RETRY_POLICY: Required<RetryPolicy> = Object.freeze({
    maxRetries: 2,
    baseDelayMs: 300,
    maxDelayMs: 8_000,
    maxRetryAfterMs: 60_000,
});

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

export function isRetryableStatus(status: number): boolean {
    return RETRYABLE_STATUS.has(status);
}

export function isIdempotentMethod(method: string): boolean {
    return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/**
 * `Retry-After` en milisegundos: segundos enteros (`120`) o fecha HTTP. `null`
 * si falta o no se entiende; nunca negativo.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
    if (/^\d+\.\d+$/.test(trimmed)) return Math.ceil(Number(trimmed) * 1000);
    const date = Date.parse(trimmed);
    if (Number.isNaN(date)) return null;
    return Math.max(0, date - now);
}

/** Espera del intento `attempt` (0 = primer reintento): backoff exponencial con jitter completo. */
export function backoffDelay(attempt: number, policy: RetryPolicy = {}, random: () => number = Math.random): number {
    const base = policy.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs;
    const max = policy.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;
    const ceiling = Math.min(max, base * 2 ** attempt);
    return Math.floor(random() * ceiling);
}

/** Espera cancelable. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(signal.reason); return; }
        const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
        function onAbort() { clearTimeout(timer); reject(signal!.reason); }
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
