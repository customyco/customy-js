/**
 * @customyai/customy-access/flags — flags de Customy Access evaluadas en local.
 *
 * @deprecated Usa `createFlagsClient` de `@customyai/access/flags`. Este módulo
 * es su adaptador: la lectura de la instantánea (API o CDN), la firma, la
 * evaluación, las impresiones, las conversiones y el tiempo real son los de
 * `@customyai/access/flags`. Aquí se conserva la configuración de 0.x
 * (`bearerToken`, cabeceras de ámbito y rutas propias).
 */
import {
    CustomyFlagsClient as AccessFlagsClient,
    type CustomyFlagsSnapshot as AccessFlagsSnapshot,
    type EvalContext,
    type EvaluationDetail,
    type FlagDefinition,
    type SegmentDefinition,
} from "@customyai/access/flags";
import { warnDeprecated } from "./deprecation";

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
     * anterior. `true` usa `${baseUrl}/oauth/jwks.json`.
     */
    verifySignature?: boolean | { jwksUrl: string };
    /**
     * Lee la instantánea pública por CDN en vez de por la API (necesita
     * `publishableKey`). `true` usa `baseUrl`; `{ baseUrl }`, otro origen.
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

const DEFAULT_PATHS = {
    snapshotPath: "/api/v1/flags/snapshot",
    impressionsPath: "/api/v1/flags/impressions",
    conversionsPath: "/api/v1/flags/conversions",
    realtimeTicketPath: "/api/v1/flags/realtime-ticket",
} as const;

/**
 * El `fetch` que ve el cliente nuevo: las rutas propias de 0.x sustituyen a
 * las por defecto y las peticiones a la API (nunca al CDN ni al JWKS) llevan
 * las cabeceras de ámbito de 0.x (`X-Org-Id`, `X-Project-Id`, `X-Env-Id`).
 */
function legacyFetch(config: CustomyFlagsClientConfig): typeof fetch {
    const base = config.baseUrl.replace(/\/$/, "");
    const scope: Record<string, string> = {};
    if (config.organizationId) scope["x-org-id"] = config.organizationId;
    if (config.projectId) scope["x-project-id"] = config.projectId;
    if (config.environmentId) {
        scope["x-env-id"] = config.environmentId;
        scope["x-environment-id"] = config.environmentId;
    }
    return (input, init) => {
        const fetchImpl = config.fetch ?? globalThis.fetch;
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const api = (Object.keys(DEFAULT_PATHS) as Array<keyof typeof DEFAULT_PATHS>).find((key) => url.split("?")[0] === `${base}${DEFAULT_PATHS[key]}`);
        if (!api) return fetchImpl(input, init);
        const target = `${base}${config[api] ?? DEFAULT_PATHS[api]}${url.includes("?") ? url.slice(url.indexOf("?")) : ""}`;
        const headers = new Headers(init?.headers ?? (typeof input === "object" && !(input instanceof URL) ? input.headers : undefined));
        for (const [name, value] of Object.entries(scope)) headers.set(name, value);
        return fetchImpl(target, { ...init, headers });
    };
}

/** @deprecated Usa `CustomyFlagsClient` de `@customyai/access/flags`. */
export class CustomyFlagsClient {
    private readonly inner: AccessFlagsClient;

    constructor(config: CustomyFlagsClientConfig) {
        warnDeprecated("@customyai/customy-access/flags", "use createFlagsClient from @customyai/access/flags.");
        this.inner = new AccessFlagsClient({
            baseUrl: config.baseUrl,
            ...(config.publishableKey ? { publishableKey: config.publishableKey } : {}),
            ...(!config.publishableKey && config.bearerToken !== undefined ? { accessToken: config.bearerToken } : {}),
            fetch: legacyFetch(config),
            snapshot: config.snapshot as AccessFlagsSnapshot | undefined,
            flushIntervalMs: config.flushIntervalMs,
            maxBatchSize: config.maxBatchSize,
            impressionsMode: config.impressionsMode,
            verifySignature: config.verifySignature,
            cdn: config.cdn,
            allowLoopbackHttp: true,
        });
    }

    ready(): Promise<CustomyFlagsSnapshot> {
        return this.inner.ready();
    }

    refresh(version?: number): Promise<CustomyFlagsSnapshot> {
        return this.inner.refresh(version);
    }

    getTreatment(flagKey: string, context: EvalContext, options?: CustomyFlagEvaluationOptions): EvaluationDetail {
        return this.inner.getTreatment(flagKey, context, options);
    }

    getBooleanValue(flagKey: string, defaultValue: boolean, context: EvalContext, options?: CustomyFlagEvaluationOptions): boolean {
        return this.inner.getBooleanValue(flagKey, defaultValue, context, options);
    }

    getStringValue(flagKey: string, defaultValue: string, context: EvalContext, options?: CustomyFlagEvaluationOptions): string {
        return this.inner.getStringValue(flagKey, defaultValue, context, options);
    }

    getNumberValue(flagKey: string, defaultValue: number, context: EvalContext, options?: CustomyFlagEvaluationOptions): number {
        return this.inner.getNumberValue(flagKey, defaultValue, context, options);
    }

    getObjectValue<T = unknown>(flagKey: string, defaultValue: T, context: EvalContext, options?: CustomyFlagEvaluationOptions): T {
        return this.inner.getObjectValue(flagKey, defaultValue, context, options);
    }

    startPolling(intervalMs?: number): void {
        this.inner.startPolling(intervalMs);
    }

    stopPolling(): void {
        this.inner.stopPolling();
    }

    subscribe(options: CustomyFlagsSubscribeOptions): () => void {
        return this.inner.subscribe(options);
    }

    track(detail: EvaluationDetail, context: EvalContext): void {
        this.inner.track(detail, context);
    }

    trackConversion(flagKey: string, context: EvalContext, options?: CustomyFlagConversionOptions): boolean {
        return this.inner.trackConversion(flagKey, context, options);
    }

    startAutoFlush(): void {
        this.inner.startAutoFlush();
    }

    stopAutoFlush(): void {
        this.inner.stopAutoFlush();
    }

    flush(): Promise<number> {
        return this.inner.flush();
    }
}

export function createFlagsClient(config: CustomyFlagsClientConfig): CustomyFlagsClient {
    return new CustomyFlagsClient(config);
}
