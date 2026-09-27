/**
 * Cliente de recogida de Customy Data (`/v1/collect/*`) sobre `@customyai/core`.
 *
 * El alcance (organización, proyecto, entorno, fuente) sale de la credencial:
 * el write key de la fuente o el token de máquina de la app. Ni el cuerpo ni
 * las cabeceras lo eligen: un evento con campos de tenant se rechaza aquí.
 */
import {
    CustomySdkError,
    connectProduct,
    createIdempotencyKey,
    type CustomySdkErrorOptions,
    type ProductClientOptions,
} from "@customyai/core";

export const DATA_DEFAULT_BASE_URL = "https://data.customy.ai";
export const DATA_AUDIENCE = "customy-data";
/** El único scope que necesita una app para enviar eventos. */
export const DATA_COLLECT_SCOPE = "data:collect";
const LIBRARY = "@customyai/data";

/** Mapa evento → propiedades. `customy apps codegen` lo genera (`CustomyEventProperties`). */
export type EventMap = Record<string, Record<string, unknown>>;

export type CustomerDataEventType = "track" | "identify" | "group" | "page" | "screen" | "alias";

/** A quién se refiere un evento: al menos uno de los tres. */
export type EventIdentity = Readonly<{
    userId?: string;
    anonymousId?: string;
    groupId?: string;
    context?: Record<string, unknown>;
    /** Propósitos consentidos, p. ej. `{ analytics: true }`. */
    consent?: Record<string, unknown>;
    /** Id del mensaje (deduplicación); por defecto uno nuevo. */
    messageId?: string;
    timestamp?: string | Date;
    /** Versión del schema del evento declarado. */
    schemaVersion?: string;
}>;

export type CustomerDataEvent = {
    messageId?: string;
    type: CustomerDataEventType;
    event?: string;
    userId?: string;
    anonymousId?: string;
    groupId?: string;
    timestamp?: string | Date;
    schemaVersion?: string;
    properties?: Record<string, unknown>;
    traits?: Record<string, unknown>;
    context?: Record<string, unknown>;
    consent?: Record<string, unknown>;
};

/** Evento listo para enviar: con id, fecha ISO y la biblioteca en `context`. */
export type NormalizedEvent = CustomerDataEvent & { messageId: string; timestamp: string };

export type EventOutcome = { accepted: boolean; deduplicated: boolean; quarantined?: boolean; eventId?: string; quarantineId?: string } & Record<string, unknown>;

export type BatchOutcome = {
    accepted: number;
    deduplicated: number;
    quarantined: number;
    results: EventOutcome[];
};

export type DataOptions = ProductClientOptions & Readonly<{
    /** Write key de la fuente: para navegador y apps sin identidad de servidor. */
    writeKey?: string;
    /** Eventos por lote en `flush` (1–1000, por defecto 100). */
    maxBatchSize?: number;
    /** Eventos en cola como máximo (por defecto 10 000). */
    maxQueueSize?: number;
    /** Claves cuyo valor se sustituye por `[REDACTED]` en todo el evento. */
    redactFields?: readonly string[];
    /** Último filtro antes de enviar; `null` descarta el evento. */
    beforeSend?: (event: NormalizedEvent) => NormalizedEvent | null;
    onError?: (error: Error, events: NormalizedEvent[]) => void;
    now?: () => Date;
    idFactory?: () => string;
}>;

/**
 * Error de Customy Data: un `CustomySdkError` con `service: "data"`. `code` es el
 * de la API (`DATA_EXTERNAL_EVENT_INVALID`…), `DATA_EVENT_QUARANTINED` si el
 * evento quedó en cuarentena, o uno del SDK (`SDK_EVENT_INVALID`,
 * `SDK_TENANT_FIELDS_FORBIDDEN`, `SDK_QUEUE_FULL`…).
 */
export class CustomyDataError extends CustomySdkError {
    constructor(options: CustomySdkErrorOptions) {
        super({ ...options, service: "data" });
        this.name = "CustomyDataError";
    }
}

const API_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

function toDataError(error: unknown): unknown {
    if (!(error instanceof CustomySdkError) || error instanceof CustomyDataError) return error;
    const body = error.body && typeof error.body === "object" ? error.body as Record<string, unknown> : undefined;
    const code = body?.quarantined === true ? "DATA_EVENT_QUARANTINED"
        : typeof body?.code === "string" && API_CODE.test(body.code) ? body.code
            : error.code.startsWith("SDK_") ? error.code : `HTTP_${error.status}`;
    return new CustomyDataError({
        code, status: error.status, message: error.message, requestId: error.requestId,
        retryAfterMs: error.retryAfterMs, body: error.body, cause: error.cause ?? error,
    });
}

const fail = (code: string, message: string) => new CustomyDataError({ code, message });
const EVENT_TYPES = new Set<CustomerDataEventType>(["track", "identify", "group", "page", "screen", "alias"]);
const TENANT_FIELDS = ["tenantId", "organizationId", "projectId", "environmentId"] as const;

function rejectTenantFields(event: object): void {
    const forbidden = TENANT_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(event, key));
    if (forbidden.length > 0) throw fail("SDK_TENANT_FIELDS_FORBIDDEN", `The scope comes from the credential; remove ${forbidden.join(", ")}`);
}

function validate(event: CustomerDataEvent): void {
    if (!EVENT_TYPES.has(event.type)) throw fail("SDK_EVENT_INVALID", "type must be track, identify, group, page, screen or alias");
    if (!event.userId && !event.anonymousId && !event.groupId) throw fail("SDK_EVENT_INVALID", "userId, anonymousId or groupId is required");
    if (event.type === "track" && !event.event) throw fail("SDK_EVENT_INVALID", "track needs an event name");
}

function redact(value: unknown, fields: ReadonlySet<string>): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((entry) => redact(entry, fields));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fields.has(key) ? "[REDACTED]" : redact(entry, fields)]));
    }
    return value;
}

function isoDate(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw fail("SDK_EVENT_INVALID", "timestamp is not a date");
    return date.toISOString();
}

type Outcome = "accepted" | "deduplicated" | "quarantined";

function outcomeOf(value: unknown): Outcome | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const hasId = (id: unknown) => typeof id === "string" && id.trim().length > 0;
    if (record.quarantined === true) return record.accepted === false && record.deduplicated === false && hasId(record.quarantineId) ? "quarantined" : undefined;
    if (record.quarantined !== undefined && record.quarantined !== false) return undefined;
    if (!hasId(record.eventId)) return undefined;
    if (record.accepted === true && record.deduplicated === false) return "accepted";
    if (record.accepted === false && record.deduplicated === true) return "deduplicated";
    return undefined;
}

/**
 * Un 2xx no basta para dar por entregados los eventos: una respuesta que no
 * acusa cada uno se trata como fallo y `flush` los devuelve a la cola.
 */
function acknowledged(path: "event" | "batch", value: unknown, expected: number, status: number): void {
    const reject = (): never => { throw new CustomyDataError({ code: "SDK_ACKNOWLEDGEMENT_INVALID", status, message: "Customy Data returned an invalid acknowledgement" }); };
    if (path === "event") {
        const outcome = outcomeOf(value);
        if (outcome !== "accepted" && outcome !== "deduplicated") reject();
        return;
    }
    const record = value as Record<string, unknown> | null;
    if (!record || typeof record !== "object" || !Array.isArray(record.results) || record.results.length !== expected) return reject();
    const counts = { accepted: 0, deduplicated: 0, quarantined: 0 };
    for (const result of record.results) {
        const outcome = outcomeOf(result);
        if (!outcome) return reject();
        counts[outcome] += 1;
    }
    for (const key of ["accepted", "deduplicated", "quarantined"] as const) {
        if (!Number.isSafeInteger(record[key]) || record[key] !== counts[key]) reject();
    }
}

export type CustomyData<Events extends EventMap = EventMap> = ReturnType<typeof buildData<Events>>;

/**
 * ```ts
 * import type { CustomyEventProperties } from "./customy.generated";
 * const data = createData<CustomyEventProperties>({ platform, machineTokens });
 * await data.track("lesson.completed", { lessonId: "l1", minutes: 12 }, { userId: "u1" });
 * ```
 * En navegador: `createData({ writeKey })` y `enqueue` + `flush`.
 */
export function createData<Events extends EventMap = EventMap>(options: DataOptions): CustomyData<Events> {
    return buildData<Events>(options);
}

function buildData<Events extends EventMap>(options: DataOptions) {
    const hasToken = options.accessToken !== undefined || options.machineTokens !== undefined;
    if (options.writeKey !== undefined && hasToken) throw fail("SDK_CREDENTIALS_AMBIGUOUS", "Pass either writeKey or an Access credential, not both");
    if (options.writeKey !== undefined && !/^\S{8,512}$/.test(options.writeKey)) throw fail("SDK_CREDENTIALS_REQUIRED", "writeKey is invalid");
    const { transport, baseUrl } = connectProduct(
        options.writeKey ? { ...options, headers: { ...options.headers, "x-write-key": options.writeKey } } : options,
        { key: "data", audience: DATA_AUDIENCE, defaultBaseUrl: DATA_DEFAULT_BASE_URL, defaultScopes: [DATA_COLLECT_SCOPE], credentialOptional: options.writeKey !== undefined },
    );
    const maxBatchSize = Math.min(1_000, Math.max(1, Math.trunc(options.maxBatchSize ?? 100)));
    const maxQueueSize = Math.max(1, Math.trunc(options.maxQueueSize ?? 10_000));
    const redactFields = new Set(options.redactFields ?? []);
    const now = options.now ?? (() => new Date());
    const newId = options.idFactory ?? createIdempotencyKey;
    let queue: NormalizedEvent[] = [];
    let inFlight = 0;
    let flushing = false;

    function normalize(input: CustomerDataEvent): NormalizedEvent {
        rejectTenantFields(input);
        let event: NormalizedEvent = {
            ...input,
            messageId: input.messageId ?? newId(),
            timestamp: isoDate(input.timestamp ?? now()),
            schemaVersion: input.schemaVersion ?? "1.0",
            properties: input.properties ?? {},
            traits: input.traits ?? {},
            context: { ...input.context, library: { name: LIBRARY } },
            consent: input.consent ?? {},
        };
        validate(event);
        event = redact(event, redactFields) as NormalizedEvent;
        if (options.beforeSend) {
            const candidate = options.beforeSend(JSON.parse(JSON.stringify(event)) as NormalizedEvent);
            if (!candidate) throw fail("SDK_EVENT_BLOCKED", "Event blocked by beforeSend");
            rejectTenantFields(candidate);
            event = redact(candidate, redactFields) as NormalizedEvent;
            validate(event);
        }
        return event;
    }

    async function post<T>(path: "event" | "batch", body: unknown, key: string, expected: number): Promise<T> {
        try {
            // El `messageId` deduplica en Data: repetir el envío es seguro.
            const response = await transport.request<T>("POST", `/v1/collect/${path}`, { body, idempotencyKey: key });
            acknowledged(path, response.data, expected, response.status);
            return response.data;
        } catch (error) {
            throw toDataError(error);
        }
    }

    // Asíncrona: un evento inválido es un rechazo, no una excepción síncrona.
    const send = async (input: CustomerDataEvent): Promise<EventOutcome> => {
        const event = normalize(input);
        return post<EventOutcome>("event", event, event.messageId, 1);
    };

    function enqueue(input: CustomerDataEvent): number {
        if (queue.length + inFlight >= maxQueueSize) throw fail("SDK_QUEUE_FULL", "The event queue is full");
        const event = normalize(input);
        // `beforeSend` pudo encolar a su vez.
        if (queue.length + inFlight >= maxQueueSize) throw fail("SDK_QUEUE_FULL", "The event queue is full");
        queue.push(event);
        return queue.length;
    }

    async function flush(): Promise<BatchOutcome> {
        if (flushing) throw fail("SDK_FLUSH_IN_PROGRESS", "A flush is already in progress");
        const total: BatchOutcome = { accepted: 0, deduplicated: 0, quarantined: 0, results: [] };
        if (queue.length === 0) return total;
        flushing = true;
        const pending = queue;
        inFlight = pending.length;
        queue = [];
        let sent = 0;
        try {
            for (; sent < pending.length; sent += maxBatchSize) {
                const batch = pending.slice(sent, sent + maxBatchSize);
                const key = `batch-${batch[0]!.messageId}-${batch.length}`;
                const response = await post<BatchOutcome>("batch", { batch }, key.length <= 255 ? key : createIdempotencyKey(), batch.length);
                total.accepted += response.accepted;
                total.deduplicated += response.deduplicated;
                total.quarantined += response.quarantined;
                total.results.push(...response.results);
            }
            return total;
        } catch (error) {
            // Lo no confirmado vuelve a la cabeza de la cola, en orden.
            const unsent = pending.slice(sent);
            queue = [...unsent, ...queue];
            const normalized = error instanceof Error ? error : new Error(String(error));
            options.onError?.(normalized, unsent);
            throw normalized;
        } finally {
            flushing = false;
            inFlight = 0;
        }
    }

    const identityOf = (identity: EventIdentity) => identity;

    return {
        baseUrl,
        /** Un evento declarado, con sus propiedades tipadas. */
        track<Name extends keyof Events & string>(event: Name, properties: Events[Name], identity: EventIdentity): Promise<EventOutcome> {
            return send({ type: "track", event, properties, ...identityOf(identity) });
        },
        identify: (traits: Record<string, unknown>, identity: EventIdentity) => send({ type: "identify", traits, ...identityOf(identity) }),
        group: (traits: Record<string, unknown>, identity: EventIdentity & { groupId: string }) => send({ type: "group", traits, ...identityOf(identity) }),
        page: (properties: Record<string, unknown>, identity: EventIdentity) => send({ type: "page", properties, ...identityOf(identity) }),
        screen: (properties: Record<string, unknown>, identity: EventIdentity) => send({ type: "screen", properties, ...identityOf(identity) }),
        alias: (userId: string, previousId: string, extra: Pick<EventIdentity, "context" | "consent"> = {}) =>
            send({ type: "alias", userId, anonymousId: previousId, properties: { previousId }, ...extra }),
        /** Cualquier evento ya formado. */
        send,
        /** Encola un evento declarado; se envía con `flush`. Devuelve el tamaño de la cola. */
        enqueueTrack<Name extends keyof Events & string>(event: Name, properties: Events[Name], identity: EventIdentity): number {
            return enqueue({ type: "track", event, properties, ...identityOf(identity) });
        },
        enqueue,
        /** Envía la cola en lotes; si un lote falla, lo no confirmado vuelve a la cola. */
        flush,
        /** Eventos esperando `flush`. */
        get queued(): number {
            return queue.length;
        },
    };
}
