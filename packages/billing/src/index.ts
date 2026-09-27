/**
 * @customyai/billing — el consumo de una app en Customy Billing, con su
 * identidad de Customy Access, sobre `@customyai/core`.
 *
 * El token (audiencia `customy-billing`, scope `billing:usage:report`) fija la
 * organización y la app: el cuerpo solo lleva meter, cantidad y una clave de
 * idempotencia por evento. Los meters son los que la app declara en su
 * `customy.app.json`; con los tipos de `customy apps codegen` quedan tipados:
 *
 * ```ts
 * import type { CustomyMeter } from "./customy.generated";
 * const billing = createBilling<CustomyMeter>({ platform, machineTokens });
 * await billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: `run-${runId}` }]);
 * ```
 */
import { CustomySdkError, connectProduct, type CustomySdkErrorOptions, type ProductClientOptions } from "@customyai/core";

export const BILLING_DEFAULT_BASE_URL = "https://billing.customy.ai";
export const BILLING_AUDIENCE = "customy-billing";
/** El único scope que necesita una app para reportar consumo. */
export const BILLING_USAGE_SCOPE = "billing:usage:report";
/** Eventos por llamada. */
export const MAX_USAGE_EVENTS = 100;

export type UsageEvent<Meter extends string = string> = Readonly<{
    /** Meter declarado por la app, p. ej. `coach.runs`. */
    meter: Meter;
    quantity: number;
    /** Única por evento: reportar dos veces la misma clave no suma dos veces. */
    idempotencyKey: string;
    occurredAt?: string | Date;
}>;

export type UsageReport<Meter extends string = string> = {
    accepted: number;
    events: Array<{ meter: Meter; idempotencyKey: string; id: string; deduplicated: boolean }>;
};

export type BillingOptions = ProductClientOptions;

/**
 * Error de Customy Billing: un `CustomySdkError` con `service: "billing"`;
 * `code` es el de la API (`INSUFFICIENT_SCOPE`, `INVALID_USAGE`, `USAGE_OUTSIDE_WINDOW`…) o `SDK_*`.
 */
export class CustomyBillingError extends CustomySdkError {
    constructor(options: CustomySdkErrorOptions) {
        super({ ...options, service: "billing" });
        this.name = "CustomyBillingError";
    }
}

function toBillingError(error: unknown): unknown {
    if (!(error instanceof CustomySdkError) || error instanceof CustomyBillingError) return error;
    return new CustomyBillingError({
        code: error.code, status: error.status, message: error.message, requestId: error.requestId,
        retryAfterMs: error.retryAfterMs, body: error.body, cause: error.cause ?? error,
    });
}

function invalid(message: string): CustomyBillingError {
    return new CustomyBillingError({ code: "SDK_USAGE_INVALID", message });
}

export type CustomyBilling<Meter extends string = string> = {
    readonly baseUrl: string;
    readonly usage: {
        /** Reporta de 1 a 100 eventos. Se reintenta sin duplicar: cada evento lleva su clave. */
        report(events: ReadonlyArray<UsageEvent<Meter>>, request?: { signal?: AbortSignal }): Promise<UsageReport<Meter>>;
    };
};

export function createBilling<Meter extends string = string>(options: BillingOptions): CustomyBilling<Meter> {
    const { transport, baseUrl } = connectProduct(options, {
        key: "billing", audience: BILLING_AUDIENCE, defaultBaseUrl: BILLING_DEFAULT_BASE_URL, defaultScopes: [BILLING_USAGE_SCOPE],
    });
    return {
        baseUrl,
        usage: {
            async report(events, request = {}) {
                if (!Array.isArray(events) || events.length === 0 || events.length > MAX_USAGE_EVENTS) throw invalid(`between 1 and ${MAX_USAGE_EVENTS} events per call`);
                const keys = new Set<string>();
                const wire = events.map((event) => {
                    if (typeof event.meter !== "string" || event.meter.length === 0) throw invalid("meter is required");
                    if (typeof event.quantity !== "number" || !Number.isFinite(event.quantity) || event.quantity < 0) throw invalid("quantity must be a finite number ≥ 0");
                    if (typeof event.idempotencyKey !== "string" || event.idempotencyKey.length === 0) throw invalid("idempotencyKey is required");
                    if (keys.has(event.idempotencyKey)) throw invalid("idempotencyKey must be unique per event");
                    keys.add(event.idempotencyKey);
                    const occurredAt = event.occurredAt === undefined ? undefined : new Date(event.occurredAt);
                    if (occurredAt && Number.isNaN(occurredAt.getTime())) throw invalid("occurredAt is not a date");
                    return { meter: event.meter, quantity: event.quantity, idempotencyKey: event.idempotencyKey, ...(occurredAt ? { occurredAt: occurredAt.toISOString() } : {}) };
                });
                try {
                    // Cada evento es idempotente por su clave, así que el lote entero se
                    // puede repetir: la clave del lote (derivada de las suyas) habilita el reintento.
                    const response = await transport.request<UsageReport<Meter>>("POST", "/v1/apps/usage", {
                        body: { events: wire },
                        idempotencyKey: `usage-${await digest([...keys].sort().join("\n"))}`,
                        signal: request.signal,
                    });
                    return response.data;
                } catch (error) {
                    throw toBillingError(error);
                }
            },
        },
    };
}

/** SHA-256 en hex de un texto (Web Crypto: node, edge y navegador). */
async function digest(text: string): Promise<string> {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
