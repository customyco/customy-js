import { CustomySdkError, type CustomySdkErrorOptions } from "@customyai/core";

/**
 * Error de Customy Access: un `CustomySdkError` con `service: "access"`. `code`
 * es el de la API (`SCOPE_REQUIRED`, `ENVIRONMENT_FORBIDDEN`, `USER_NOT_FOUND`…),
 * `HTTP_<estado>` si la respuesta no trae uno, o uno del SDK (`SDK_*`).
 */
export class CustomyAccessError extends CustomySdkError {
    constructor(options: CustomySdkErrorOptions) {
        super({ ...options, service: "access" });
        this.name = "CustomyAccessError";
    }
}

const CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

export function toAccessError(error: unknown): unknown {
    if (!(error instanceof CustomySdkError) || error instanceof CustomyAccessError) return error;
    return new CustomyAccessError({
        // Algunas rutas responden `{ error: "texto legible" }`: eso no es un código.
        code: CODE.test(error.code) ? error.code : `HTTP_${error.status}`,
        status: error.status,
        message: error.message,
        requestId: error.requestId,
        retryAfterMs: error.retryAfterMs,
        body: error.body,
        cause: error.cause ?? error,
    });
}

export async function accessCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        throw toAccessError(error);
    }
}
