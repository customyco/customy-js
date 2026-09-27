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
    conversionsPath?: string;
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
    /**
     * Exige que cada instantánea venga firmada por el emisor de Access y que su
     * contenido coincida con lo firmado; si no, se rechaza y se conserva la
     * anterior. Así un CDN o una caché intermedia pueden servirla sin poder
     * alterarla. `true` usa `${baseUrl}/oauth/jwks.json`.
     */
    verifySignature?: boolean | { jwksUrl: string };
    /**
     * Lee la instantánea pública por CDN en vez de por la API (necesita
     * `publishableKey`): `latest.json` para sondear (5 s en el borde) y la URL
     * inmutable de cada versión cuando realtime la anuncia. `true` usa
     * `baseUrl`; `{ baseUrl }`, otro origen. Combínalo con `verifySignature`.
     */
    cdn?: boolean | { baseUrl: string };
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

export type CustomyFlagConversion = {
    id: string;
    flagKey: string;
    contextKey: string;
    treatment: string;
    metric: string;
    value: number;
    occurredAt: string;
};

export type CustomyFlagConversionOptions = {
    /** Importe o cantidad de la conversión (0 por defecto). */
    value?: number;
    /** Nombre de la métrica, p. ej. `purchase` (por defecto `conversion`). */
    metric?: string;
    /** Identificador propio para que un reintento cuente una sola vez; si falta, se genera. */
    id?: string;
};

export class CustomyFlagsClient {
    private readonly fetchImpl: typeof fetch;
    private readonly baseUrl: string;
    private readonly snapshotPath: string;
    private readonly impressionsPath: string;
    private readonly conversionsPath: string;
    private readonly conversions: CustomyFlagConversion[] = [];
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
    private readonly jwksUrl?: string;
    private readonly cdnRoot?: string;
    private jwks?: Promise<Array<Record<string, unknown>>>;

    constructor(config: CustomyFlagsClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.snapshotPath = config.snapshotPath ?? "/api/v1/flags/snapshot";
        this.impressionsPath = config.impressionsPath ?? "/api/v1/flags/impressions";
        this.conversionsPath = config.conversionsPath ?? "/api/v1/flags/conversions";
        this.realtimeTicketPath = config.realtimeTicketPath ?? "/api/v1/flags/realtime-ticket";
        this.impressionsMode = config.impressionsMode ?? "optimized";
        if (config.cdn) {
            if (!config.publishableKey) throw new Error("Customy flags: cdn requires a publishableKey");
            const origin = typeof config.cdn === "object" ? config.cdn.baseUrl : config.baseUrl;
            this.cdnRoot = `${origin.replace(/\/$/, "")}/api/v1/flags/cdn/${encodeURIComponent(config.publishableKey)}`;
        }
        if (config.verifySignature) {
            this.jwksUrl = typeof config.verifySignature === "object" ? config.verifySignature.jwksUrl : `${config.baseUrl.replace(/\/$/, "")}/oauth/jwks.json`;
        }
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

    /** Trae la versión publicada. Con `cdn`, `version` pide la URL inmutable de esa versión (la que anuncia realtime). */
    async refresh(version?: number): Promise<CustomyFlagsSnapshot> {
        let response: Response;
        if (this.cdnRoot) {
            // Sin cabeceras propias: petición simple (sin preflight) y la revalidación la hace la caché HTTP.
            response = await this.fetchImpl(`${this.cdnRoot}/${version ?? "latest"}.json`, { method: "GET" });
        } else {
            const headers = { ...this.headers };
            if (this.etag) headers["If-None-Match"] = this.etag;
            response = await this.fetchImpl(`${this.baseUrl}${this.snapshotPath}`, { method: "GET", headers });
        }

        if (response.status === 304 && this.snapshot) return this.snapshot;
        if (!response.ok) {
            if (this.snapshot) return this.snapshot;
            throw new Error(`Customy flags snapshot fetch failed: ${response.status}`);
        }

        const snapshot = await response.json() as CustomyFlagsSnapshot;
        // Una caché nunca hace retroceder: una versión más vieja que la vigente se ignora.
        if (this.snapshot && snapshot.version < this.snapshot.version) return this.snapshot;
        if (this.jwksUrl && !await this.verify(snapshot)) {
            if (this.snapshot) return this.snapshot;
            throw new Error("Customy flags snapshot signature invalid");
        }
        this.snapshot = snapshot;
        this.etag = response.headers.get("etag") ?? snapshot.etag;
        return snapshot;
    }

    /** ¿La firma es del emisor y cubre exactamente este entorno, versión y contenido? */
    private async verify(snapshot: CustomyFlagsSnapshot): Promise<boolean> {
        const subtle = globalThis.crypto?.subtle;
        const parts = snapshot.signature?.split(".");
        if (!subtle || parts?.length !== 3) return false;
        try {
            const header = JSON.parse(decodeBase64UrlText(parts[0]!)) as { alg?: string; kid?: string };
            const claims = JSON.parse(decodeBase64UrlText(parts[1]!)) as Record<string, unknown>;
            if (header.alg !== "RS256" || claims.typ !== "flags_snapshot" || claims.environment_id !== snapshot.environmentId
                || claims.version !== snapshot.version) return false;
            let jwk = (await this.loadJwks()).find((key) => key.kid === header.kid);
            if (!jwk) {
                this.jwks = undefined; // clave rotada: se relee una vez
                jwk = (await this.loadJwks()).find((key) => key.kid === header.kid);
            }
            if (!jwk) return false;
            const key = await subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e } as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
            const signed = await subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
            if (!signed) return false;
            const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ flags: snapshot.flags, segments: snapshot.segments ?? [] })));
            return claims.content_sha256 === encodeBase64Url(new Uint8Array(digest));
        } catch {
            return false;
        }
    }

    private loadJwks(): Promise<Array<Record<string, unknown>>> {
        this.jwks ??= this.fetchImpl(this.jwksUrl!, { method: "GET" })
            .then(async (response) => response.ok ? ((await response.json()) as { keys?: Array<Record<string, unknown>> }).keys ?? [] : [])
            .catch(() => []);
        return this.jwks;
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
        const apply = (version?: number) => this.refresh(version).then((snapshot) => options.onUpdate?.(snapshot)).catch(report);
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
                    void apply(typeof message.version === "number" ? message.version : undefined);
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

    /**
     * Registra una conversión atribuida al tratamiento que este flag sirve a
     * `context` ahora mismo (la evaluación es determinista: el mismo que vio en
     * su exposición mientras las reglas no cambien). Con ella, Analytics mide
     * el experimento del flag por brazo. Devuelve `false` si el flag no está en
     * la instantánea y no hay tratamiento al que atribuirla.
     */
    trackConversion(flagKey: string, context: EvalContext, options: CustomyFlagConversionOptions = {}): boolean {
        const detail = this.getTreatment(flagKey, context, { track: false });
        if (detail.reason === "error") return false;
        const value = options.value ?? 0;
        if (!Number.isFinite(value) || value < 0) throw new Error("Customy flags conversion value must be a non-negative number");
        this.conversions.push({
            id: options.id ?? conversionId(),
            flagKey,
            contextKey: context.key,
            treatment: detail.treatment,
            metric: options.metric ?? "conversion",
            value,
            occurredAt: new Date().toISOString(),
        });
        if (this.conversions.length >= this.maxBatchSize) {
            void this.flush();
        }
        return true;
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

    /** Envía impresiones y conversiones pendientes; lo que falla vuelve a la cola. Devuelve cuántas salieron. */
    async flush(): Promise<number> {
        const impressions = this.impressions.splice(0, this.maxBatchSize);
        const conversions = this.conversions.splice(0, this.maxBatchSize);
        const sdk = { name: this.sdkName, version: this.sdkVersion };
        const [sentImpressions, sentConversions] = await Promise.allSettled([
            impressions.length ? this.post(this.impressionsPath, { impressions, sdk }) : Promise.resolve(),
            conversions.length ? this.post(this.conversionsPath, { conversions, sdk }) : Promise.resolve(),
        ]);
        if (sentImpressions.status === "rejected") this.impressions.unshift(...impressions);
        if (sentConversions.status === "rejected") this.conversions.unshift(...conversions);
        const failed = [sentImpressions, sentConversions].find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failed) throw failed.reason;
        return impressions.length + conversions.length;
    }

    private async post(path: string, body: unknown): Promise<void> {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method: "POST", headers: this.headers, body: JSON.stringify(body) });
        if (!response.ok) {
            const kind = path === this.conversionsPath ? "conversions" : "impressions";
            throw new Error(`Customy flags ${kind} flush failed: ${response.status}`);
        }
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

function conversionId(): string {
    const random = globalThis.crypto?.randomUUID?.();
    return `conv-${random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`}`;
}

/** El mismo JSON canónico que firma Access: claves ordenadas, sin `undefined`, arrays en su orden. */
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().filter((field) => record[field] !== undefined)
            .map((field) => `${JSON.stringify(field)}:${canonicalJson(record[field])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

function decodeBase64Url(input: string): ArrayBuffer {
    const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "="));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer as ArrayBuffer;
}

function decodeBase64UrlText(input: string): string {
    return new TextDecoder().decode(decodeBase64Url(input));
}

function encodeBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
