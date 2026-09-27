/**
 * Error único de los SDK de Customy. Todo fallo —de red, de configuración o
 * una respuesta no 2xx— llega como `CustomySdkError` con un `code` estable que
 * se puede comparar en código; el mensaje es solo para personas.
 */
export type CustomySdkErrorOptions = Readonly<{
    /** Código estable: el del sobre de error del servicio o uno del SDK (`SDK_*`). */
    code: string;
    /** Estado HTTP; 0 si no hubo respuesta (configuración, red). */
    status?: number;
    message?: string;
    /** Servicio que respondió (`send`, `access`…), si se conoce. */
    service?: string;
    /** `requestId` del sobre de error o de la cabecera `x-request-id`. */
    requestId?: string;
    /** Espera que pidió el servidor con `Retry-After`, en milisegundos. */
    retryAfterMs?: number;
    /** Cuerpo de la respuesta, ya leído. */
    body?: unknown;
    cause?: unknown;
}>;

export class CustomySdkError extends Error {
    readonly code: string;
    readonly status: number;
    readonly service?: string;
    readonly requestId?: string;
    readonly retryAfterMs?: number;
    readonly body?: unknown;

    constructor(options: CustomySdkErrorOptions) {
        const status = options.status ?? 0;
        super(options.message ?? `Customy${options.service ? ` ${options.service}` : ""} request failed (${status}): ${options.code}`, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "CustomySdkError";
        this.code = options.code;
        this.status = status;
        if (options.service !== undefined) this.service = options.service;
        if (options.requestId !== undefined) this.requestId = options.requestId;
        if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
        if (options.body !== undefined) this.body = options.body;
    }
}

export function isCustomySdkError(value: unknown): value is CustomySdkError {
    return value instanceof CustomySdkError;
}

/**
 * Extrae `code`, `message` y `requestId` de un cuerpo de error. Acepta el sobre
 * de Customy (`{ error: { code, message, requestId } }`) y las formas planas
 * (`{ code }`, `{ error: "code", message }`).
 */
export function readErrorEnvelope(body: unknown): { code?: string; message?: string; requestId?: string } {
    if (!body || typeof body !== "object") return {};
    const record = body as Record<string, unknown>;
    const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
    const pick = (value: unknown) => (typeof value === "string" && value.length > 0 && value.length <= 200 ? value : undefined);
    return {
        code: pick(nested?.code) ?? pick(record.code) ?? pick(record.error),
        message: pick(nested?.message) ?? pick(record.message),
        requestId: pick(nested?.requestId) ?? pick(record.requestId),
    };
}
