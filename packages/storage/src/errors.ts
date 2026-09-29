import { CustomySdkError, isRetryableStatus, type CustomySdkErrorOptions } from "@customyai/core";

export type CustomyStorageErrorOptions = CustomySdkErrorOptions & Readonly<{ retryable?: boolean }>;

/**
 * Error de Customy Storage. Es un `CustomySdkError` (mismo `code`, `status`,
 * `requestId`, `retryAfterMs`, `body`) con `service: "storage"`; `code` es el
 * de la API (`FILE_SCAN_PENDING`, `STORAGE_ITEM_NOT_FOUND`,
 * `STORAGE_SCOPE_REQUIRED`, `STORAGE_QUOTA_EXCEEDED`…) o uno del SDK (`SDK_*`).
 *
 * `retryable` dice si repetir la misma operación más tarde puede salir bien:
 * lo decide Storage cuando lo manda (un archivo aún en el antivirus, 423
 * `FILE_SCAN_PENDING`, sí; uno en cuarentena, no) y si no, el estado
 * (red, 408, 429 y 5xx).
 */
export class CustomyStorageError extends CustomySdkError {
    readonly retryable: boolean;

    constructor(options: CustomyStorageErrorOptions) {
        const { retryable, ...rest } = options;
        super({ ...rest, service: "storage" });
        this.name = "CustomyStorageError";
        const status = options.status ?? 0;
        this.retryable = retryable ?? (status === 0 || isRetryableStatus(status));
    }
}

/** Traduce un fallo del transporte al error de Storage (su sobre es `{ error, message, retryable? }`). */
export function toStorageError(error: unknown): unknown {
    if (error instanceof CustomyStorageError || !(error instanceof CustomySdkError)) return error;
    const body = error.body && typeof error.body === "object" ? error.body as { retryable?: unknown } : undefined;
    const final = error.code === "SDK_ABORTED" || error.code.startsWith("SDK_CREDENTIALS") || error.code === "SDK_RESPONSE_INVALID";
    return new CustomyStorageError({
        code: error.code,
        status: error.status,
        message: error.message,
        requestId: error.requestId,
        retryAfterMs: error.retryAfterMs,
        body: error.body,
        cause: error.cause ?? error,
        ...(typeof body?.retryable === "boolean" ? { retryable: body.retryable } : final ? { retryable: false } : {}),
    });
}

export async function storageCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        throw toStorageError(error);
    }
}
