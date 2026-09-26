import {
    createSegmentResolver,
    evaluate,
    type EvalContext,
    type EvaluationDetail,
    type FlagDefinition,
    type SegmentDefinition,
} from "@customyai/flags-eval";

export type CustomyFlagsSnapshot = {
    schemaVersion: "2026-06-fme";
    organizationId: string;
    projectId: string;
    environmentId: string;
    version: number;
    etag?: string;
    generatedAt: string;
    flags: FlagDefinition[];
    segments?: SegmentDefinition[];
    signature?: string;
};

export type CustomyFlagsClientConfig = {
    baseUrl: string;
    publishableKey?: string;
    bearerToken?: string;
    organizationId?: string;
    projectId?: string;
    environmentId?: string;
    snapshotPath?: string;
    impressionsPath?: string;
    realtimeTicketPath?: string;
    fetch?: typeof fetch;
    snapshot?: CustomyFlagsSnapshot;
    flushIntervalMs?: number;
    maxBatchSize?: number;
    sdkName?: string;
    sdkVersion?: string;
    /**
     * `optimized` (por defecto): una impresión por flag, clave y tratamiento y
     * hora; el resto de evaluaciones no viaja. `debug`: todas (solo para
     * depurar, nunca en producción con tráfico).
     */
    impressionsMode?: "optimized" | "debug";
};

export type CustomyFlagsSubscribeOptions = {
    /** Origen de customy-realtime, p. ej. `https://realtime.customy.ai`. */
    realtimeUrl: string;
    /** Implementación de WebSocket si el entorno no la trae global (Node < 22). */
    WebSocket?: new (url: string) => CustomyWebSocketLike;
    onError?: (error: Error) => void;
    /** Llamado tras aplicar una versión nueva recibida en vivo. */
    onUpdate?: (snapshot: CustomyFlagsSnapshot) => void;
};

export type CustomyWebSocketLike = {
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    close(): void;
};

export type CustomyFlagEvaluationOptions = {
    track?: boolean;
};

export type CustomyFlagImpression = {
    flagKey: string;
    contextKey: string;
    treatment: string;
    value?: unknown;
    reason: string;
    ruleId?: string;
    bucket?: number;
    occurredAt: string;
    attributes?: Record<string, string | number | boolean | null>;
};

export class CustomyFlagsClient {
    private readonly fetchImpl: typeof fetch;
    private readonly baseUrl: string;
    private readonly snapshotPath: string;
    private readonly impressionsPath: string;
    private readonly headers: Record<string, string>;
    private readonly flushIntervalMs: number;
    private readonly maxBatchSize: number;
    private readonly sdkName: string;
    private readonly sdkVersion: string;
    private snapshot?: CustomyFlagsSnapshot;
    private etag?: string;
    private readonly impressions: CustomyFlagImpression[] = [];
    private flushTimer?: ReturnType<typeof setInterval>;
    private pollTimer?: ReturnType<typeof setInterval>;
    private readonly realtimeTicketPath: string;
    private readonly impressionsMode: "optimized" | "debug";
    private readonly seen = new Map<string, number>();

    constructor(config: CustomyFlagsClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.snapshotPath = config.snapshotPath ?? "/api/v1/flags/snapshot";
        this.impressionsPath = config.impressionsPath ?? "/api/v1/flags/impressions";
        this.realtimeTicketPath = config.realtimeTicketPath ?? "/api/v1/flags/realtime-ticket";
        this.impressionsMode = config.impressionsMode ?? "optimized";
        this.fetchImpl = config.fetch ?? globalThis.fetch;
        this.snapshot = config.snapshot;
        this.etag = config.snapshot?.etag;
        this.flushIntervalMs = config.flushIntervalMs ?? 10_000;
        this.maxBatchSize = config.maxBatchSize ?? 100;
        this.sdkName = config.sdkName ?? "@customyai/customy-access";
        this.sdkVersion = config.sdkVersion ?? "0.6.0";
        this.headers = {
            "Content-Type": "application/json",
        };
        if (config.publishableKey) this.headers["X-Publishable-Key"] = config.publishableKey;
        if (config.bearerToken) this.headers.Authorization = `Bearer ${config.bearerToken}`;
        if (config.organizationId) this.headers["X-Org-Id"] = config.organizationId;
        if (config.projectId) this.headers["X-Project-Id"] = config.projectId;
        if (config.environmentId) {
            this.headers["X-Env-Id"] = config.environmentId;
            this.headers["X-Environment-Id"] = config.environmentId;
        }
    }

    async ready(): Promise<CustomyFlagsSnapshot> {
        if (this.snapshot) return this.snapshot;
        return this.refresh();
    }

    async refresh(): Promise<CustomyFlagsSnapshot> {
        const headers = { ...this.headers };
        if (this.etag) headers["If-None-Match"] = this.etag;

        const response = await this.fetchImpl(`${this.baseUrl}${this.snapshotPath}`, {
            method: "GET",
            headers,
        });

        if (response.status === 304 && this.snapshot) return this.snapshot;
        if (!response.ok) {
            if (this.snapshot) return this.snapshot;
            throw new Error(`Customy flags snapshot fetch failed: ${response.status}`);
        }

        const snapshot = await response.json() as CustomyFlagsSnapshot;
        this.snapshot = snapshot;
        this.etag = response.headers.get("etag") ?? snapshot.etag;
        return snapshot;
    }

    getTreatment(flagKey: string, context: EvalContext, options: CustomyFlagEvaluationOptions = {}): EvaluationDetail {
        const snapshot = this.snapshot;
        const flag = snapshot?.flags.find((item) => item.key === flagKey);
        if (!snapshot || !flag) {
            return {
                flagKey,
                treatment: "control",
                value: undefined,
                reason: "error",
                error: snapshot ? "flag_not_found" : "snapshot_not_loaded",
            };
        }

        const segmentContains = createSegmentResolver(snapshot.segments ?? []);
        const detail = evaluate(flag, context, {
            segmentContains,
            treatmentOf: (dependencyKey) => {
                const dependency = snapshot.flags.find((item) => item.key === dependencyKey);
                return dependency ? evaluate(dependency, context, { segmentContains, treatmentOf: () => undefined }).treatment : undefined;
            },
        });

        if (options.track !== false) {
            this.track(detail, context);
        }
        return detail;
    }

    getBooleanValue(flagKey: string, defaultValue: boolean, context: EvalContext, options?: CustomyFlagEvaluationOptions): boolean {
        const detail = this.getTreatment(flagKey, context, options);
        return typeof detail.value === "boolean" ? detail.value : defaultValue;
    }

    getStringValue(flagKey: string, defaultValue: string, context: EvalContext, options?: CustomyFlagEvaluationOptions): string {
        const detail = this.getTreatment(flagKey, context, options);
        return typeof detail.value === "string" ? detail.value : defaultValue;
    }

    getNumberValue(flagKey: string, defaultValue: number, context: EvalContext, options?: CustomyFlagEvaluationOptions): number {
        const detail = this.getTreatment(flagKey, context, options);
        return typeof detail.value === "number" ? detail.value : defaultValue;
    }

    getObjectValue<T = unknown>(flagKey: string, defaultValue: T, context: EvalContext, options?: CustomyFlagEvaluationOptions): T {
        const detail = this.getTreatment(flagKey, context, options);
        return detail.value !== undefined && typeof detail.value === "object" ? detail.value as T : defaultValue;
    }

    /** Respaldo sin realtime: refresca con ETag (barato, 304 si no cambió). */
    startPolling(intervalMs = 30_000): void {
        if (this.pollTimer) return;
        this.pollTimer = setInterval(() => void this.refresh().catch(() => undefined), Math.max(5_000, intervalMs));
    }

    stopPolling(): void {
        if (!this.pollTimer) return;
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
    }

    /**
     * Escucha las versiones publicadas (y el kill switch) por customy-realtime y
     * refresca la instantánea al momento. Reconecta solo, con un ticket nuevo
     * cada vez (son de un solo uso). Devuelve la función que corta la suscripción.
     */
    subscribe(options: CustomyFlagsSubscribeOptions): () => void {
        const Socket = options.WebSocket ?? (globalThis as { WebSocket?: new (url: string) => CustomyWebSocketLike }).WebSocket;
        if (!Socket) throw new Error("Customy flags: no WebSocket implementation available; pass options.WebSocket");
        const origin = options.realtimeUrl.replace(/\/$/, "").replace(/^http/, "ws");
        let stopped = false;
        let socket: CustomyWebSocketLike | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let attempt = 0;
        const report = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error(String(error)));
        const apply = () => this.refresh().then((snapshot) => options.onUpdate?.(snapshot)).catch(report);
        const reconnect = () => {
            if (stopped || retry) return;
            const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5);
            attempt += 1;
            retry = setTimeout(() => { retry = undefined; void connect(); }, delay);
        };
        const connect = async () => {
            try {
                const response = await this.fetchImpl(`${this.baseUrl}${this.realtimeTicketPath}`, { method: "POST", headers: this.headers, body: "{}" });
                if (!response.ok) throw new Error(`Customy flags realtime ticket failed: ${response.status}`);
                const { ticket, channel } = await response.json() as { ticket: string; channel: string };
                if (stopped) return;
                const opened = new Socket(`${origin}/ws?channels=${encodeURIComponent(channel)}&ticket=${encodeURIComponent(ticket)}`);
                socket = opened;
                // Al (re)conectar se refresca: lo publicado mientras no había socket no se pierde.
                opened.onopen = () => { attempt = 0; void apply(); };
                opened.onmessage = (event) => {
                    let message: { type?: string; version?: number } | undefined;
                    try { message = JSON.parse(String(event.data)); } catch { return; }
                    if (message?.type !== "flags.snapshot.published") return;
                    if (typeof message.version === "number" && this.snapshot && message.version <= this.snapshot.version) return;
                    void apply();
                };
                opened.onerror = () => report(new Error("Customy flags realtime socket error"));
                opened.onclose = () => { if (socket === opened) socket = undefined; reconnect(); };
            } catch (error) {
                report(error);
                reconnect();
            }
        };
        void connect();
        return () => {
            stopped = true;
            if (retry) clearTimeout(retry);
            socket?.close();
            socket = undefined;
        };
    }

    track(detail: EvaluationDetail, context: EvalContext): void {
        if (detail.reason === "error") return;
        if (this.impressionsMode === "optimized") {
            const hour = Math.floor(Date.now() / 3_600_000);
            const seenKey = `${detail.flagKey}\u0000${context.key}\u0000${detail.treatment}`;
            if (this.seen.get(seenKey) === hour) return;
            if (this.seen.size >= 50_000) this.seen.clear();
            this.seen.set(seenKey, hour);
        }
        this.impressions.push({
            flagKey: detail.flagKey,
            contextKey: context.key,
            treatment: detail.treatment,
            value: detail.value,
            reason: detail.reason,
            ruleId: detail.ruleId,
            bucket: detail.bucket,
            occurredAt: new Date().toISOString(),
            attributes: sanitizeAttributes(context.attributes),
        });
        if (this.impressions.length >= this.maxBatchSize) {
            void this.flush();
        }
    }

    startAutoFlush(): void {
        if (this.flushTimer) return;
        this.flushTimer = setInterval(() => void this.flush(), this.flushIntervalMs);
    }

    stopAutoFlush(): void {
        if (!this.flushTimer) return;
        clearInterval(this.flushTimer);
        this.flushTimer = undefined;
    }

    async flush(): Promise<number> {
        if (this.impressions.length === 0) return 0;
        const batch = this.impressions.splice(0, this.maxBatchSize);
        const response = await this.fetchImpl(`${this.baseUrl}${this.impressionsPath}`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
                impressions: batch,
                sdk: { name: this.sdkName, version: this.sdkVersion },
            }),
        });
        if (!response.ok) {
            this.impressions.unshift(...batch);
            throw new Error(`Customy flags impressions flush failed: ${response.status}`);
        }
        return batch.length;
    }
}

export function createFlagsClient(config: CustomyFlagsClientConfig): CustomyFlagsClient {
    return new CustomyFlagsClient(config);
}

function sanitizeAttributes(attributes: EvalContext["attributes"]): CustomyFlagImpression["attributes"] {
    if (!attributes) return undefined;
    const output: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(attributes)) {
        if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            output[key] = value;
        }
    }
    return output;
}
