import { CustomySdkError } from "@customyai/core";

/**
 * El error de la API de Customy Send, compartido por el cliente de servidor
 * (`@customyai/send-sdk`) y el de las apps (`@customyai/send-sdk/inbox`).
 *
 * @deprecated `@customyai/send` lanza `CustomySendError` (un `CustomySdkError`
 * de `@customyai/core`). Este paquete traduce esos errores a esta forma para no
 * romper a quien ya lo usa.
 */
export class CustomySendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs: number | null;
  readonly body: unknown;
  constructor(status: number, code: string, message: string, body: unknown, retryAfterMs: number | null = null) {
    super(message);
    this.name = "CustomySendError";
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Un error de `@customyai/send` (o de `@customyai/core`) con la forma de
 * siempre: los códigos de la API no cambian (`validation_error`,
 * `daily_quota_exceeded`…); los del SDK vuelven a los de 1.x (`network_error`
 * sin respuesta o por tiempo, `http_<estado>` cuando la API no da nombre) y
 * `retryAfterMs` es `null` sin `Retry-After`.
 */
export function toLegacySendError(error: unknown): unknown {
  if (error instanceof CustomySendError || !(error instanceof CustomySdkError)) return error;
  const network = error.code === "SDK_NETWORK_ERROR" || error.code === "SDK_TIMEOUT";
  const code = network ? "network_error" : /^HTTP_\d{3}$/.test(error.code) ? error.code.toLowerCase() : error.code;
  const legacy = new CustomySendError(network ? 0 : error.status, code, error.message, error.body ?? null, error.retryAfterMs ?? null);
  (legacy as { cause?: unknown }).cause = error;
  return legacy;
}

/** Ejecuta una llamada de `@customyai/send` y traduce su error. */
export async function legacyCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toLegacySendError(error);
  }
}
