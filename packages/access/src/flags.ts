/**
 * @customyai/access/flags — feature flags de Customy Access con evaluación
 * local: la instantánea publicada (ETag/304, firmada por el emisor, opcional
 * por CDN) se evalúa en el proceso, sin una petición por flag. Cambios y kill
 * switch en vivo por realtime; impresiones reducidas y conversiones en lotes.
 *
 * ```ts
 * const flags = createFlagsClient({ publishableKey, verifySignature: true });
 * await flags.ready();
 * if (flags.getBooleanValue("checkout.v2", false, { key: userId })) { … }
 * ```
 *
 * Credencial: la clave publicable del entorno (vista pública, apta para
 * navegador) o, en servidor, un token de máquina con `flags:read` (vista
 * completa, con miembros de segmentos).
 */
import { createSegmentResolver, evaluate, type EvalContext, type EvaluationDetail, type FlagDefinition, type SegmentDefinition } from "@customyai/flags-eval";
import { CustomySdkError, createIdempotencyKey, createTransport, readErrorEnvelope, resolveBearer, type AccessTokenProvider, type RetryPolicy, type Transport } from "@customyai/core";
import { CustomyAccessError, toAccessError } from "./errors";
import { ACCESS_DEFAULT_BASE_URL } from "./options";

export type { EvalContext, EvaluationDetail, FlagDefinition, SegmentDefinition } from "@customyai/flags-eval";

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

export type FlagsClientOptions = Readonly<{
    /** Origen de Customy Access (por defecto el público). */
    baseUrl?: string;
    /** Clave publicable del entorno: vista pública, apta para navegador. */
    publishableKey?: string;
    /** Solo servidor: token de máquina con `flags:read` (o su proveedor). */
    accessToken?: string | AccessTokenProvider;
    fetch?: typeof fetch;
    /** Instantánea inicial (p. ej. exportada en el build o de una caché propia). */
    snapshot?: CustomyFlagsSnapshot;
    /** Cada cuánto se envían impresiones y conversiones con `startAutoFlush` (10 s). */
    flushIntervalMs?: number;
    /** Tamaño de lote de impresiones y conversiones (100). */
    maxBatchSize?: number;
    /**
     * `optimized` (por defecto): una impresión por flag, clave, tratamiento y
     * hora. `debug`: todas (solo para depurar).
     */
    impressionsMode?: "optimized" | "debug";
    /**
     * Exige que cada instantánea venga firmada por el emisor y que su contenido
     * coincida con lo firmado; si no, se conserva la anterior. `true` usa el
     * JWKS del emisor (`${baseUrl}/oauth/jwks.json`).
     */
    verifySignature?: boolean | { jwksUrl: string };
    /**
     * Lee la vista pública por CDN (necesita `publishableKey`): `latest.json`
     * para sondear y la URL inmutable de cada versión anunciada por realtime.
     */
    cdn?: boolean | { baseUrl: string };
    retry?: RetryPolicy | false;
    allowLoopbackHttp?: boolean;
}>;

export type FlagsSubscribeOptions = {
    /** Origen de Customy Realtime. */
    realtimeUrl: string;
    /** WebSocket si el entorno no lo trae global. */
    WebSocket?: new (url: string) => WebSocketLike;
    onError?: (error: Error) => void;
    /** Tras aplicar una versión nueva recibida en vivo. */
    onUpdate?: (snapshot: CustomyFlagsSnapshot) => void;
};

export type WebSocketLike = {
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    close(): void;
};

export type FlagEvaluationOptions = { track?: boolean };

export type FlagImpression = {
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

export type FlagConversion = { id: string; flagKey: string; contextKey: string; treatment: string; metric: string; value: number; occurredAt: string };

export type FlagConversionOptions = {
    /** Importe o cantidad (0 por defecto). */
    value?: number;
    /** Métrica, p. ej. `purchase` (por defecto `conversion`). */
    metric?: string;
    /** Id propio para que un reintento cuente una vez; si falta, se genera. */
    id?: string;
};

const SDK = { name: "@customyai/access" } as const;

export class CustomyFlagsClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly transport: Transport;
    private readonly options: FlagsClientOptions;
    private readonly flushIntervalMs: number;
    private readonly maxBatchSize: number;
    private readonly impressionsMode: "optimized" | "debug";
    private readonly impressions: FlagImpression[] = [];
    private readonly conversions: FlagConversion[] = [];
    private readonly seen = new Map<string, number>();
    private readonly jwksUrl?: string;
    private readonly cdnRoot?: string;
    private snapshot?: CustomyFlagsSnapshot;
    private etag?: string;
    private jwks?: Promise<Array<Record<string, unknown>>>;
    private flushTimer?: ReturnType<typeof setInterval>;
    private pollTimer?: ReturnType<typeof setInterval>;

    constructor(options: FlagsClientOptions) {
        if (Boolean(options.publishableKey) === (options.accessToken !== undefined)) {
            throw new CustomyAccessError({ code: options.publishableKey ? "SDK_CREDENTIALS_AMBIGUOUS" : "SDK_CREDENTIALS_REQUIRED", message: "Pass either publishableKey or accessToken" });
        }
        this.options = options;
        const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
        this.transport = createTransport({
            baseUrl: options.baseUrl ?? ACCESS_DEFAULT_BASE_URL,
            service: "access",
            accessToken: options.accessToken,
            headers: options.publishableKey ? { "x-publishable-key": options.publishableKey } : undefined,
            fetch: fetchImpl,
            retry: options.retry,
            allowLoopbackHttp: options.allowLoopbackHttp,
        });
        this.baseUrl = this.transport.baseUrl;
        this.fetchImpl = fetchImpl as typeof fetch;
        this.impressionsMode = options.impressionsMode ?? "optimized";
        this.flushIntervalMs = options.flushIntervalMs ?? 10_000;
        this.maxBatchSize = Math.max(1, Math.min(1_000, options.maxBatchSize ?? 100));
        if (options.cdn) {
            if (!options.publishableKey) throw new CustomyAccessError({ code: "SDK_CREDENTIALS_REQUIRED", message: "cdn requires a publishableKey" });
            const origin = typeof options.cdn === "object" ? options.cdn.baseUrl.replace(/\/$/, "") : this.baseUrl;
            this.cdnRoot = `${origin}/api/v1/flags/cdn/${encodeURIComponent(options.publishableKey)}`;
        }
        if (options.verifySignature) this.jwksUrl = typeof options.verifySignature === "object" ? options.verifySignature.jwksUrl : `${this.baseUrl}/oauth/jwks.json`;
        this.snapshot = options.snapshot;
        this.etag = options.snapshot?.etag;
    }

    /** La instantánea vigente, o la primera que se lea. */
    async ready(): Promise<CustomyFlagsSnapshot> {
        return this.snapshot ?? this.refresh();
    }

    /** Relee la versión publicada (304 si no cambió). Con `cdn`, `version` pide la URL inmutable de esa versión. */
    async refresh(version?: number): Promise<CustomyFlagsSnapshot> {
        let response: Response;
        try {
            if (this.cdnRoot) {
                // Sin cabeceras propias: petición simple y la revalidación la hace la caché HTTP.
                response = await this.fetchImpl(`${this.cdnRoot}/${version ?? "latest"}.json`, { method: "GET" });
            } else {
                const headers: Record<string, string> = { accept: "application/json" };
                if (this.options.publishableKey) headers["x-publishable-key"] = this.options.publishableKey;
                else headers.authorization = `Bearer ${await resolveBearer(this.options.accessToken, "access")}`;
                if (this.etag) headers["if-none-match"] = this.etag;
                response = await this.fetchImpl(`${this.baseUrl}/api/v1/flags/snapshot`, { method: "GET", headers });
            }
        } catch (error) {
            if (this.snapshot) return this.snapshot;
            if (error instanceof CustomySdkError) throw toAccessError(error);
            throw new CustomyAccessError({ code: "SDK_NETWORK_ERROR", cause: error });
        }
        if (response.status === 304 && this.snapshot) return this.snapshot;
        if (!response.ok) {
            if (this.snapshot) return this.snapshot;
            const body = await response.json().catch(() => null);
            const envelope = readErrorEnvelope(body);
            throw new CustomyAccessError({ code: envelope.code ?? `HTTP_${response.status}`, status: response.status, message: envelope.message, requestId: response.headers.get("x-request-id") ?? undefined, body });
        }
        const snapshot = await response.json() as CustomyFlagsSnapshot;
        // Nunca se retrocede: una versión más vieja que la vigente se ignora.
        if (this.snapshot && snapshot.version < this.snapshot.version) return this.snapshot;
        if (this.jwksUrl && !await this.verify(snapshot)) {
            if (this.snapshot) return this.snapshot;
            throw new CustomyAccessError({ code: "SDK_FLAGS_SIGNATURE_INVALID", status: response.status, message: "Flags snapshot signature is invalid" });
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
            if (header.alg !== "RS256" || claims.typ !== "flags_snapshot" || claims.environment_id !== snapshot.environmentId || claims.version !== snapshot.version) return false;
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

    getTreatment(flagKey: string, context: EvalContext, options: FlagEvaluationOptions = {}): EvaluationDetail {
        const snapshot = this.snapshot;
        const flag = snapshot?.flags.find((item) => item.key === flagKey);
        if (!snapshot || !flag) return { flagKey, treatment: "control", value: undefined, reason: "error", error: snapshot ? "flag_not_found" : "snapshot_not_loaded" };
        const segmentContains = createSegmentResolver(snapshot.segments ?? []);
        const detail = evaluate(flag, context, {
            segmentContains,
            treatmentOf: (dependencyKey) => {
                const dependency = snapshot.flags.find((item) => item.key === dependencyKey);
                return dependency ? evaluate(dependency, context, { segmentContains, treatmentOf: () => undefined }).treatment : undefined;
            },
        });
        if (options.track !== false) this.track(detail, context);
        return detail;
    }

    getBooleanValue(flagKey: string, defaultValue: boolean, context: EvalContext, options?: FlagEvaluationOptions): boolean {
        const detail = this.getTreatment(flagKey, context, options);
        return typeof detail.value === "boolean" ? detail.value : defaultValue;
    }

    getStringValue(flagKey: string, defaultValue: string, context: EvalContext, options?: FlagEvaluationOptions): string {
        const detail = this.getTreatment(flagKey, context, options);
        return typeof detail.value === "string" ? detail.value : defaultValue;
    }

    getNumberValue(flagKey: string, defaultValue: number, context: EvalContext, options?: FlagEvaluationOptions): number {
        const detail = this.getTreatment(flagKey, context, options);
        return typeof detail.value === "number" ? detail.value : defaultValue;
    }

    getObjectValue<T = unknown>(flagKey: string, defaultValue: T, context: EvalContext, options?: FlagEvaluationOptions): T {
        const detail = this.getTreatment(flagKey, context, options);
        return detail.value !== undefined && detail.value !== null && typeof detail.value === "object" ? detail.value as T : defaultValue;
    }

    /** Respaldo sin realtime: relee con ETag (304 si no cambió). */
    startPolling(intervalMs = 30_000): void {
        if (this.pollTimer) return;
        this.pollTimer = setInterval(() => void this.refresh().catch(() => undefined), Math.max(5_000, intervalMs));
    }

    stopPolling(): void {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = undefined;
    }

    /**
     * Escucha las versiones publicadas (y el kill switch) por realtime y
     * refresca al momento. Reconecta solo, con un ticket nuevo cada vez.
     * Devuelve la función que corta la suscripción.
     */
    subscribe(options: FlagsSubscribeOptions): () => void {
        const Socket = options.WebSocket ?? (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
        if (!Socket) throw new CustomyAccessError({ code: "SDK_WEBSOCKET_REQUIRED", message: "No WebSocket implementation available; pass options.WebSocket" });
        const origin = options.realtimeUrl.replace(/\/$/, "").replace(/^http/, "ws");
        let stopped = false;
        let socket: WebSocketLike | undefined;
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
                // Un ticket es de un solo uso: sin reintentos del transporte.
                const { ticket, channel } = await this.transport.post<{ ticket: string; channel: string }>("/api/v1/flags/realtime-ticket", {}, { retry: false });
                if (stopped) return;
                const opened = new Socket(`${origin}/ws?channels=${encodeURIComponent(channel)}&ticket=${encodeURIComponent(ticket)}`);
                socket = opened;
                // Al (re)conectar se refresca: lo publicado sin socket no se pierde.
                opened.onopen = () => { attempt = 0; void apply(); };
                opened.onmessage = (event) => {
                    let message: { type?: string; version?: number } | undefined;
                    try { message = JSON.parse(String(event.data)); } catch { return; }
                    if (message?.type !== "flags.snapshot.published") return;
                    if (typeof message.version === "number" && this.snapshot && message.version <= this.snapshot.version) return;
                    void apply(typeof message.version === "number" ? message.version : undefined);
                };
                opened.onerror = () => report(new CustomyAccessError({ code: "SDK_REALTIME_ERROR", message: "Flags realtime socket error" }));
                opened.onclose = () => { if (socket === opened) socket = undefined; reconnect(); };
            } catch (error) {
                report(toAccessError(error));
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
        if (this.impressions.length >= this.maxBatchSize) void this.flush().catch(() => undefined);
    }

    /**
     * Conversión atribuida al tratamiento que el flag sirve a `context` (la
     * evaluación es determinista). `false` si el flag no está en la instantánea.
     */
    trackConversion(flagKey: string, context: EvalContext, options: FlagConversionOptions = {}): boolean {
        const detail = this.getTreatment(flagKey, context, { track: false });
        if (detail.reason === "error") return false;
        const value = options.value ?? 0;
        if (!Number.isFinite(value) || value < 0) throw new CustomyAccessError({ code: "SDK_FLAGS_CONVERSION_INVALID", message: "Conversion value must be a non-negative number" });
        this.conversions.push({
            id: options.id ?? `conv-${createIdempotencyKey()}`,
            flagKey,
            contextKey: context.key,
            treatment: detail.treatment,
            metric: options.metric ?? "conversion",
            value,
            occurredAt: new Date().toISOString(),
        });
        if (this.conversions.length >= this.maxBatchSize) void this.flush().catch(() => undefined);
        return true;
    }

    startAutoFlush(): void {
        if (this.flushTimer) return;
        this.flushTimer = setInterval(() => void this.flush().catch(() => undefined), this.flushIntervalMs);
    }

    stopAutoFlush(): void {
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flushTimer = undefined;
    }

    /** Envía impresiones y conversiones pendientes; lo que falla vuelve a la cola. Devuelve cuántas salieron. */
    async flush(): Promise<number> {
        const impressions = this.impressions.splice(0, this.maxBatchSize);
        const conversions = this.conversions.splice(0, this.maxBatchSize);
        // Access y Events deduplican (exposición por hora, conversión por id): repetir el lote es seguro.
        const post = (path: string, body: unknown) => this.transport.post(path, body, { idempotencyKey: true }).catch((error: unknown) => { throw toAccessError(error); });
        const [sentImpressions, sentConversions] = await Promise.allSettled([
            impressions.length ? post("/api/v1/flags/impressions", { impressions, sdk: SDK }) : Promise.resolve(),
            conversions.length ? post("/api/v1/flags/conversions", { conversions, sdk: SDK }) : Promise.resolve(),
        ]);
        if (sentImpressions.status === "rejected") this.impressions.unshift(...impressions);
        if (sentConversions.status === "rejected") this.conversions.unshift(...conversions);
        const failed = [sentImpressions, sentConversions].find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failed) throw failed.reason;
        return impressions.length + conversions.length;
    }
}

export function createFlagsClient(options: FlagsClientOptions): CustomyFlagsClient {
    return new CustomyFlagsClient(options);
}

function sanitizeAttributes(attributes: EvalContext["attributes"]): FlagImpression["attributes"] {
    if (!attributes) return undefined;
    const output: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(attributes)) {
        if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") output[key] = value;
    }
    return output;
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
