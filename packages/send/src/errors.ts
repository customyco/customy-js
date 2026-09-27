import { CustomySdkError, parseRetryAfter, readErrorEnvelope, type CustomySdkErrorOptions } from "@customyai/core";

/**
 * Error de Customy Send. Es un `CustomySdkError` (mismo `code`, `status`,
 * `requestId`, `retryAfterMs`, `body`) con `service: "send"`; `code` es el de
 * la API (`validation_error`, `daily_quota_exceeded`, `domain_not_verified`,
 * `template_variable_missing`…) o uno del SDK (`SDK_*`).
 */
export class CustomySendError extends CustomySdkError {
    constructor(options: CustomySdkErrorOptions) {
        super({ ...options, service: "send" });
        this.name = "CustomySendError";
    }
}

const SEND_CODE = /^[a-z][a-z0-9_]{0,63}$/;

/** Traduce un fallo del transporte al error de Send (su sobre es `{ statusCode, name, message }`). */
export function toSendError(error: unknown): unknown {
    if (!(error instanceof CustomySdkError) || error instanceof CustomySendError) return error;
    const body = error.body && typeof error.body === "object" ? error.body as { name?: unknown; message?: unknown } : undefined;
    const apiCode = typeof body?.name === "string" && SEND_CODE.test(body.name) ? body.name : undefined;
    return new CustomySendError({
        code: apiCode ?? error.code,
        status: error.status,
        message: apiCode && typeof body?.message === "string" ? body.message : error.message,
        requestId: error.requestId,
        retryAfterMs: error.retryAfterMs,
        body: error.body,
        cause: error.cause ?? error,
    });
}

export async function sendCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        throw toSendError(error);
    }
}

/**
 * Error de una respuesta no 2xx leída con `fetch` directo (el cliente de la
 * bandeja): `code` es el `name` de Send (`{ statusCode, name, message }`), el
 * del sobre neutro o `HTTP_<estado>`.
 */
export async function errorFromResponse(response: Response): Promise<CustomySendError> {
    const text = await response.text().catch(() => "");
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { message: text.slice(0, 300) };
    }
    const record = body && typeof body === "object" ? body as { name?: unknown; message?: unknown } : undefined;
    const envelope = readErrorEnvelope(body);
    const apiCode = typeof record?.name === "string" && SEND_CODE.test(record.name) ? record.name : undefined;
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
    return new CustomySendError({
        code: apiCode ?? envelope.code ?? `HTTP_${response.status}`,
        status: response.status,
        message: (typeof record?.message === "string" ? record.message : envelope.message) ?? (response.statusText || undefined),
        requestId: envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
        ...(retryAfterMs !== null && retryAfterMs > 0 ? { retryAfterMs } : {}),
        body,
    });
}
