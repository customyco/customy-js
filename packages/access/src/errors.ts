import { CustomySdkError, type CustomySdkErrorOptions } from "@customyai/core";

/**
 * Error de Customy Access: un `CustomySdkError` con `service: "access"`. `code`
 * es el de la API (`SCOPE_REQUIRED`, `ENVIRONMENT_FORBIDDEN`, `USER_NOT_FOUND`…),
 * `HTTP_<estado>` si la respuesta no trae uno, o uno del SDK (`SDK_*`).
 */
export class CustomyAccessError extends CustomySdkError {
    /** Scope que faltaba, si el fallo es de scope (`SCOPE_REQUIRED`, token sin ese scope). */
    readonly requiredScope?: string;

    constructor(options: CustomySdkErrorOptions & Readonly<{ requiredScope?: string }>) {
        const { requiredScope, ...rest } = options;
        super({ ...rest, service: "access" });
        this.name = "CustomyAccessError";
        if (requiredScope !== undefined) this.requiredScope = requiredScope;
    }
}

const SCOPE_CODES = new Set(["SCOPE_REQUIRED", "INSUFFICIENT_SCOPE", "insufficient_scope", "SDK_MACHINE_TOKEN_INVALID_SCOPE"]);

/**
 * Un fallo de scope de un método de la fachada, con un mensaje que nombra el
 * método, el scope que falta y dónde declararlo. Cualquier otro error pasa igual.
 */
export function withRequiredScope(error: unknown, method: string, scope: string): unknown {
    if (!(error instanceof CustomyAccessError) || !SCOPE_CODES.has(error.code)) return error;
    return new CustomyAccessError({
        code: error.code,
        status: error.status,
        message: `Customy Access ${method} needs the "${scope}" scope. Declare it for customy-access in customy.app.json (or on the API key), and do not narrow it away with \`scopes\`.${error.message ? ` Access said: ${error.message}` : ""}`,
        requestId: error.requestId,
        retryAfterMs: error.retryAfterMs,
        body: error.body,
        cause: error,
        requiredScope: scope,
    });
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
