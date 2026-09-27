/**
 * Consumo de una app en Customy Billing con su identidad de Customy Access
 * (`POST /v1/apps/usage`). El token de máquina, con audiencia `customy-billing`
 * y scope `billing:usage:report`, fija la organización y la app: el cuerpo solo
 * lleva el meter, la cantidad y una clave de idempotencia por evento.
 */
export type AppUsageEvent = {
    /** Meter declarado por la app, p. ej. `coach.runs`. */
    meter: string;
    quantity: number;
    /** Única por evento: reintentar con la misma clave no suma dos veces. */
    idempotencyKey: string;
    occurredAt?: string | Date;
};

export type AppUsageResult = {
    accepted: number;
    events: Array<{ meter: string; idempotencyKey: string; id: string; deduplicated: boolean }>;
};

export type AppUsageClientConfig = {
    /** URL de Billing del entorno (discovery: `products.billing.base_url`). */
    baseUrl: string;
    /** Proveedor de tokens de Access (`createMachineTokenProvider` de `@customyai/customy-access/server`). */
    accessToken: () => Promise<string>;
    fetch?: typeof fetch;
    timeoutMs?: number;
};

export class AppUsageError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
        super(message);
        this.name = "AppUsageError";
    }
}

export class AppUsageClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly config: AppUsageClientConfig) {
        if (!config?.baseUrl || typeof config.accessToken !== "function") throw new Error("AppUsageClient: baseUrl and accessToken are required");
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.fetchImpl = config.fetch ?? globalThis.fetch;
        this.timeoutMs = config.timeoutMs ?? 10_000;
    }

    /** Reporta hasta 100 eventos de consumo en una llamada. */
    async report(events: AppUsageEvent[]): Promise<AppUsageResult> {
        if (events.length === 0 || events.length > 100) throw new Error("AppUsageClient: between 1 and 100 events per call");
        const response = await this.fetchImpl(`${this.baseUrl}/v1/apps/usage`, {
            method: "POST",
            headers: { authorization: `Bearer ${await this.config.accessToken()}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
                events: events.map((event) => ({
                    meter: event.meter,
                    quantity: event.quantity,
                    idempotencyKey: event.idempotencyKey,
                    ...(event.occurredAt ? { occurredAt: new Date(event.occurredAt).toISOString() } : {}),
                })),
            }),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) throw new AppUsageError(response.status, String(body.error ?? `HTTP_${response.status}`), String(body.message ?? "Usage report failed"));
        return body as unknown as AppUsageResult;
    }
}
