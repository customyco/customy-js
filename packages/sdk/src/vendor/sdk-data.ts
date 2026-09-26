export const CUSTOMY_DATA_SDK_VERSION = "0.3.1" as const;

export interface EventContractEntry {
    type: string;
    version: string;
    channel: string;
    owner: string;
    description: string;
    identityFields: string[];
    status: "active" | "deprecated" | "retired";
    localAudit: boolean;
    replicateToAudit: boolean;
    payloadSchema?: unknown;
}

export interface DataSdkTenant {
    tenantId?: string;
    organizationId: string;
    projectId?: string;
    environment: string;
}

export interface DataSdkConfig {
    ingestUrl: string;
    source: string;
    tenant: DataSdkTenant;
    internalKey?: string;
    fetchImpl?: typeof fetch;
    maxRetries?: number;
    retryBaseMs?: number;
    timeoutMs?: number;
    now?: () => Date;
    idFactory?: () => string;
    onError?: (error: Error, event: DataSdkEventInput) => void;
}

export interface DataSdkEventInput {
    type: string;
    payload?: Record<string, unknown>;
    version?: string;
    source?: string;
    tenant?: Partial<DataSdkTenant>;
    partitionKey?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string | Date;
    eventId?: string;
}

export type DataSdkCallOptions = Omit<DataSdkEventInput, "type" | "payload">;

export interface WebhookSourceInput {
    provider: string;
    eventName: string;
    payload: Record<string, unknown>;
    receivedAt?: string | Date;
    externalId?: string;
    metadata?: Record<string, unknown>;
    type?: string;
}

export interface DataSdkIngestResponse {
    ok: boolean;
    status?: "accepted" | "deduplicated" | "rejected";
    eventId?: string;
    channel?: string;
    idempotencyKey?: string;
    hints?: number;
    registered?: boolean;
    contract?: EventContractEntry;
    code?: string;
    message?: string;
    details?: unknown;
}

export class DataSdkError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly response?: unknown,
    ) {
        super(message);
        this.name = "DataSdkError";
    }
}

export class CustomyDataClient {
    private readonly fetchImpl: typeof fetch;
    private readonly maxRetries: number;
    private readonly retryBaseMs: number;
    private readonly timeoutMs: number;
    private readonly now: () => Date;
    private readonly idFactory: () => string;

    constructor(private readonly config: DataSdkConfig) {
        const fetchImpl = config.fetchImpl ?? globalThis.fetch;
        if (!fetchImpl) throw new Error("fetch is required. Pass fetchImpl in non-browser runtimes.");
        this.fetchImpl = fetchImpl;
        this.maxRetries = config.maxRetries ?? 3;
        this.retryBaseMs = config.retryBaseMs ?? 250;
        this.timeoutMs = config.timeoutMs ?? 10_000;
        this.now = config.now ?? (() => new Date());
        this.idFactory = config.idFactory ?? randomId;
    }

    async track(event: DataSdkEventInput): Promise<DataSdkIngestResponse>;
    async track(name: string, properties?: Record<string, unknown>, options?: DataSdkCallOptions): Promise<DataSdkIngestResponse>;
    async track(input: string | DataSdkEventInput, properties: Record<string, unknown> = {}, options: DataSdkCallOptions = {}): Promise<DataSdkIngestResponse> {
        if (typeof input !== "string") return this.emit(input);
        return this.emit({
            ...options,
            type: "data.track.recorded",
            payload: { name: input, properties },
        });
    }

    async identify(payload: Record<string, unknown>, options: DataSdkCallOptions = {}): Promise<DataSdkIngestResponse> {
        return this.emit({
            ...options,
            type: "data.identity.identified",
            payload,
        });
    }

    async page(payload: Record<string, unknown>, options: DataSdkCallOptions = {}): Promise<DataSdkIngestResponse> {
        return this.emit({
            ...options,
            type: "data.page.viewed",
            payload,
        });
    }

    async screen(payload: Record<string, unknown>, options: DataSdkCallOptions = {}): Promise<DataSdkIngestResponse> {
        return this.emit({
            ...options,
            type: "data.screen.viewed",
            payload,
        });
    }

    async group(payload: Record<string, unknown>, options: DataSdkCallOptions = {}): Promise<DataSdkIngestResponse> {
        return this.emit({
            ...options,
            type: "data.group.assigned",
            payload,
        });
    }

    async alias(payload: Record<string, unknown>, options: DataSdkCallOptions = {}): Promise<DataSdkIngestResponse> {
        return this.emit({
            ...options,
            type: "data.alias.created",
            payload,
        });
    }

    async fromWebhook(input: WebhookSourceInput): Promise<DataSdkIngestResponse> {
        const occurredAt = input.receivedAt ?? this.now();
        return this.emit({
            type: input.type ?? `${input.provider}.${input.eventName}`,
            source: `webhook:${input.provider}`,
            payload: input.payload,
            occurredAt,
            idempotencyKey: input.externalId ? stableHash(`${input.provider}|${input.eventName}|${input.externalId}`) : undefined,
            metadata: {
                ...(input.metadata ?? {}),
                webhookProvider: input.provider,
                webhookEventName: input.eventName,
            },
        });
    }

    async emit(event: DataSdkEventInput): Promise<DataSdkIngestResponse> {
        const body = this.buildEnvelope(event);
        try {
            return await this.sendWithRetry(body);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            this.config.onError?.(normalized, event);
            throw normalized;
        }
    }

    emitLater(event: DataSdkEventInput): void {
        void this.emit(event).catch(() => undefined);
    }

    buildEnvelope(event: DataSdkEventInput): Record<string, unknown> {
        const tenant = { ...this.config.tenant, ...(event.tenant ?? {}) };
        const occurredAt = normalizeDate(event.occurredAt ?? this.now());
        const payload = event.payload ?? {};
        const source = event.source ?? this.config.source;
        const idempotencyKey = event.idempotencyKey ?? stableHash([tenant.organizationId, tenant.projectId ?? "", tenant.environment, source, event.type, event.partitionKey ?? "", JSON.stringify(payload)].join("|"));

        return {
            type: event.type,
            source,
            tenantId: tenant.tenantId ?? tenant.organizationId,
            organizationId: tenant.organizationId,
            projectId: tenant.projectId,
            environment: tenant.environment,
            version: event.version ?? "v1",
            partitionKey: event.partitionKey,
            idempotencyKey,
            payload,
            metadata: {
                ...(event.metadata ?? {}),
                library: {
                    name: "./sdk-data",
                    version: CUSTOMY_DATA_SDK_VERSION,
                },
            },
            occurredAt,
            eventId: event.eventId ?? this.idFactory(),
        };
    }

    private async sendWithRetry(body: Record<string, unknown>): Promise<DataSdkIngestResponse> {
        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            try {
                return await this.sendOnce(body);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (!isRetryableError(lastError) || attempt >= this.maxRetries) break;
                await sleep(this.retryBaseMs * Math.pow(2, attempt));
            }
        }
        throw lastError ?? new Error("Unknown ingest failure");
    }

    private async sendOnce(body: Record<string, unknown>): Promise<DataSdkIngestResponse> {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
        const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
        try {
            const response = await this.fetchImpl(this.config.ingestUrl, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(this.config.internalKey ? { "x-internal-key": this.config.internalKey } : {}),
                },
                body: JSON.stringify(body),
                signal: controller?.signal,
            });
            const text = await response.text();
            const parsed = text ? safeJson(text) : {};
            if (!response.ok) {
                throw new DataSdkError(`Customy Data ingest failed with HTTP ${response.status}`, response.status, parsed);
            }
            return parsed as DataSdkIngestResponse;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
}

export function createDataClient(config: DataSdkConfig): CustomyDataClient {
    return new CustomyDataClient(config);
}

export type CustomerDataEventType = "track" | "identify" | "group" | "page" | "screen" | "alias";

export interface CustomerDataEvent {
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
}

export interface CustomerDataClientConfig {
    collectUrl: string;
    /** Write key de la fuente (navegador y apps sin identidad de servidor). */
    writeKey?: string;
    /**
     * En servidor, en lugar del write key: un token de máquina de Customy Access
     * con audiencia `customy-data` y scope `data:collect` (la identidad única de
     * la app; `createMachineTokenProvider` de `@customyai/customy-access/server`).
     * Data resuelve la fuente de la app a partir de los claims firmados.
     */
    accessToken?: () => Promise<string>;
    fetchImpl?: typeof fetch;
    maxRetries?: number;
    retryBaseMs?: number;
    timeoutMs?: number;
    maxBatchSize?: number;
    maxQueueSize?: number;
    redactFields?: string[];
    beforeSend?: (event: CustomerDataEvent) => CustomerDataEvent | null;
    now?: () => Date;
    idFactory?: () => string;
    onError?: (error: Error, events: CustomerDataEvent[]) => void;
}

export interface CustomerDataBatchResponse {
    accepted: number;
    deduplicated: number;
    quarantined: number;
    results: Array<Record<string, unknown>>;
}

/**
 * Public/browser-safe customer data client. Tenant scope is derived from the
 * source write key by customy-data; callers cannot select organization,
 * project or environment in the payload.
 */
export class CustomyCustomerDataClient {
    private readonly fetchImpl: typeof fetch;
    private readonly maxRetries: number;
    private readonly retryBaseMs: number;
    private readonly timeoutMs: number;
    private readonly maxBatchSize: number;
    private readonly maxQueueSize: number;
    private readonly redactFields: Set<string>;
    private readonly now: () => Date;
    private readonly idFactory: () => string;
    private queue: CustomerDataEvent[] = [];
    private flushing = false;
    private inFlightCount = 0;

    constructor(private readonly config: CustomerDataClientConfig) {
        if (!config.collectUrl || (!config.writeKey && !config.accessToken)) {
            throw new Error("collectUrl and writeKey (or accessToken) are required");
        }
        const fetchImpl = config.fetchImpl ?? globalThis.fetch;
        if (!fetchImpl) throw new Error("fetch is required. Pass fetchImpl in non-browser runtimes.");
        this.fetchImpl = fetchImpl;
        this.maxRetries = config.maxRetries ?? 3;
        this.retryBaseMs = config.retryBaseMs ?? 250;
        this.timeoutMs = config.timeoutMs ?? 10_000;
        this.maxBatchSize = Math.min(1_000, Math.max(1, config.maxBatchSize ?? 100));
        this.maxQueueSize = Math.max(1, config.maxQueueSize ?? 10_000);
        this.redactFields = new Set(config.redactFields ?? []);
        this.now = config.now ?? (() => new Date());
        this.idFactory = config.idFactory ?? randomId;
    }

    event(input: CustomerDataEvent): CustomerDataEvent {
        rejectCustomerDataTenantFields(input);
        let normalized: CustomerDataEvent = {
            ...input,
            messageId: input.messageId ?? this.idFactory(),
            timestamp: normalizeDate(input.timestamp ?? this.now()),
            schemaVersion: input.schemaVersion ?? "1.0",
            properties: input.properties ?? {},
            traits: input.traits ?? {},
            context: {
                ...input.context,
                library: {
                    name: "./sdk-data",
                    version: CUSTOMY_DATA_SDK_VERSION,
                },
            },
            consent: input.consent ?? {},
        };
        validateCustomerDataEvent(normalized);
        normalized = redactCustomerDataEvent(normalized, this.redactFields);
        if (this.config.beforeSend) {
            const candidate = this.config.beforeSend(cloneCustomerDataEvent(normalized));
            if (!candidate) throw new Error("Event blocked by beforeSend");
            rejectCustomerDataTenantFields(candidate);
            normalized = redactCustomerDataEvent(candidate, this.redactFields);
            validateCustomerDataEvent(normalized);
        }
        return normalized;
    }

    enqueue(input: CustomerDataEvent): number {
        if (this.queue.length + this.inFlightCount >= this.maxQueueSize) {
            throw new Error("Customer data queue is full");
        }
        const normalized = this.event(input);
        // Recheck after the hook: a nested enqueue may have filled the queue.
        if (this.queue.length + this.inFlightCount >= this.maxQueueSize) {
            throw new Error("Customer data queue is full");
        }
        this.queue.push(normalized);
        return this.queue.length;
    }

    async send(input: CustomerDataEvent): Promise<Record<string, unknown>> {
        return this.request("event", this.event(input)) as Promise<Record<string, unknown>>;
    }

    async track(event: string, properties: Record<string, unknown>, identity: Pick<CustomerDataEvent, "userId" | "anonymousId" | "groupId" | "context" | "consent">) {
        return this.send({ type: "track", event, properties, ...identity });
    }

    async identify(traits: Record<string, unknown>, identity: Pick<CustomerDataEvent, "userId" | "anonymousId" | "context" | "consent">) {
        return this.send({ type: "identify", traits, ...identity });
    }

    async group(traits: Record<string, unknown>, identity: Pick<CustomerDataEvent, "groupId" | "userId" | "anonymousId" | "context" | "consent">) {
        return this.send({ type: "group", traits, ...identity });
    }

    async page(properties: Record<string, unknown>, identity: Pick<CustomerDataEvent, "userId" | "anonymousId" | "context" | "consent">) {
        return this.send({ type: "page", properties, ...identity });
    }

    async screen(properties: Record<string, unknown>, identity: Pick<CustomerDataEvent, "userId" | "anonymousId" | "context" | "consent">) {
        return this.send({ type: "screen", properties, ...identity });
    }

    async alias(userId: string, previousId: string, options: Pick<CustomerDataEvent, "context" | "consent"> = {}) {
        return this.send({
            type: "alias",
            userId,
            anonymousId: previousId,
            properties: { previousId },
            ...options,
        });
    }

    async flush(): Promise<CustomerDataBatchResponse> {
        if (this.flushing) throw new Error("A customer data flush is already in progress");
        if (this.queue.length === 0) {
            return {
                accepted: 0,
                deduplicated: 0,
                quarantined: 0,
                results: [],
            };
        }
        this.flushing = true;
        const pending = this.queue;
        this.inFlightCount = pending.length;
        this.queue = [];
        const aggregate: CustomerDataBatchResponse = {
            accepted: 0,
            deduplicated: 0,
            quarantined: 0,
            results: [],
        };
        try {
            for (let offset = 0; offset < pending.length; offset += this.maxBatchSize) {
                const batch = pending.slice(offset, offset + this.maxBatchSize);
                const response = (await this.request("batch", {
                    batch,
                })) as CustomerDataBatchResponse;
                aggregate.accepted += Number(response.accepted ?? 0);
                aggregate.deduplicated += Number(response.deduplicated ?? 0);
                aggregate.quarantined += Number(response.quarantined ?? 0);
                aggregate.results.push(...(response.results ?? []));
            }
            this.flushing = false;
            this.inFlightCount = 0;
            return aggregate;
        } catch (error) {
            this.queue = [...pending, ...this.queue];
            this.flushing = false;
            this.inFlightCount = 0;
            const normalized = error instanceof Error ? error : new Error(String(error));
            this.config.onError?.(normalized, pending);
            throw normalized;
        }
    }

    private async request(path: "event" | "batch", body: unknown): Promise<unknown> {
        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
            const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
            try {
                const response = await this.fetchImpl(`${this.config.collectUrl.replace(/\/$/, "")}/v1/collect/${path}`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        ...(this.config.accessToken
                            ? { authorization: `Bearer ${await this.config.accessToken()}` }
                            : { "x-write-key": this.config.writeKey as string }),
                    },
                    body: JSON.stringify(body),
                    signal: controller?.signal,
                });
                const text = await response.text();
                const parsed = text ? safeJson(text) : {};
                if (!response.ok) {
                    throw new DataSdkError(`Customy customer data collection failed with HTTP ${response.status}`, response.status, parsed);
                }
                validateCustomerDataAcknowledgement(path, parsed,
                    path === "batch" ? (body as { batch: CustomerDataEvent[] }).batch.length : 1,
                    response.status);
                return parsed;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (!isRetryableError(lastError) || attempt >= this.maxRetries) throw lastError;
                await sleep(this.retryBaseMs * Math.pow(2, attempt));
            } finally {
                if (timer) clearTimeout(timer);
            }
        }
        throw lastError ?? new Error("Unknown customer data collection failure");
    }
}

export function createCustomerDataClient(config: CustomerDataClientConfig) {
    return new CustomyCustomerDataClient(config);
}

type CollectionOutcome = "accepted" | "deduplicated" | "quarantined";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectionOutcome(value: unknown): CollectionOutcome | undefined {
    if (!isRecord(value)) return undefined;
    const hasId = (id: unknown) => typeof id === "string" && id.trim().length > 0;
    if (value.quarantined === true) {
        return value.accepted === false && value.deduplicated === false && hasId(value.quarantineId)
            ? "quarantined" : undefined;
    }
    if (value.quarantined !== undefined && value.quarantined !== false) return undefined;
    if (!hasId(value.eventId)) return undefined;
    if (value.accepted === true && value.deduplicated === false) return "accepted";
    if (value.accepted === false && value.deduplicated === true) return "deduplicated";
    return undefined;
}

/** An HTTP success alone cannot acknowledge queued events. Keep malformed or
 * incomplete replies as failures so flush restores the original message IDs. */
function validateCustomerDataAcknowledgement(path: "event" | "batch", value: unknown, expectedCount: number, status: number): void {
    const reject = (): never => {
        // Do not retain a proxy's arbitrary response content in callbacks/logs.
        throw new DataSdkError("Customy customer data collection returned an invalid acknowledgement", status);
    };
    if (path === "event") {
        const outcome = collectionOutcome(value);
        if (outcome !== "accepted" && outcome !== "deduplicated") reject();
        return;
    }
    if (!isRecord(value) || !Array.isArray(value.results) || value.results.length !== expectedCount) return reject();
    const counts = { accepted: 0, deduplicated: 0, quarantined: 0 };
    for (const result of value.results) {
        const outcome = collectionOutcome(result);
        if (!outcome) return reject();
        counts[outcome] += 1;
    }
    for (const key of ["accepted", "deduplicated", "quarantined"] as const) {
        if (!Number.isSafeInteger(value[key]) || value[key] !== counts[key]) reject();
    }
}

const CUSTOMER_DATA_EVENT_TYPES = new Set<CustomerDataEventType>([
    "track",
    "identify",
    "group",
    "page",
    "screen",
    "alias",
]);

const FORBIDDEN_CUSTOMER_DATA_TENANT_FIELDS = [
    "tenantId",
    "organizationId",
    "projectId",
    "environmentId",
] as const;

function validateCustomerDataEvent(event: CustomerDataEvent): void {
    if (!CUSTOMER_DATA_EVENT_TYPES.has(event.type)) {
        throw new Error("Type must be track, identify, group, page, screen or alias");
    }
    if (!event.userId && !event.anonymousId && !event.groupId) {
        throw new Error("At least one userId, anonymousId or groupId is required");
    }
    if (event.type === "track" && !event.event) {
        throw new Error("Track calls require an event name");
    }
}

function rejectCustomerDataTenantFields(event: CustomerDataEvent): void {
    const payload = event as CustomerDataEvent & Record<string, unknown>;
    const forbidden = FORBIDDEN_CUSTOMER_DATA_TENANT_FIELDS.filter((key) =>
        Object.prototype.hasOwnProperty.call(payload, key),
    );
    if (forbidden.length > 0) {
        throw new Error(
            `Tenant scope is derived from the write key; forbidden fields: ${forbidden.join(", ")}`,
        );
    }
}

function cloneCustomerDataEvent(event: CustomerDataEvent): CustomerDataEvent {
    return JSON.parse(JSON.stringify(event)) as CustomerDataEvent;
}

function redactCustomerDataEvent(
    event: CustomerDataEvent,
    fields: Set<string>,
): CustomerDataEvent {
    return redactCustomerDataValue(event, fields) as CustomerDataEvent;
}

function redactCustomerDataValue(value: unknown, fields: Set<string>): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value.map((entry) => redactCustomerDataValue(entry, fields));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                fields.has(key)
                    ? "[REDACTED]"
                    : redactCustomerDataValue(entry, fields),
            ]),
        );
    }
    return value;
}

function normalizeDate(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isRetryableError(error: Error): boolean {
    if (error instanceof DataSdkError) {
        return !error.statusCode || error.statusCode >= 500 || error.statusCode === 429;
    }
    return true;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomId(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
        return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    }
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function stableHash(input: string): string {
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
    }
    return `idem_${(hash >>> 0).toString(36)}`;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}
