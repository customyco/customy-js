/**
 * Ciclo de vida de usuarios de una Connected Application hacia Customy Events.
 *
 * Emite `application.user.registered | activity | identity_updated | deleted`
 * (contrato genérico de `packages/contracts/src/registry.ts`) con la llave de
 * ingesta propia de la app (`x-internal-key`). Events solo acepta el sobre
 * exacto de su inquilino: `source` = clave de la app, `tenantId` =
 * `org:proyecto:entorno`, `eventId` UUID, `idempotencyKey` con prefijo
 * `<clave>:` y `partitionKey` = id del usuario en la app.
 *
 * Claves deterministas: la misma operación produce la misma `idempotencyKey`
 * y el mismo `eventId` (UUID derivado por SHA-256), así un reintento —aunque
 * sea desde otro proceso— se deduplica en Events y en CRM. Los 5xx, 408, 429
 * y fallos de red se reintentan con backoff; 400/401/422 no.
 *
 * Base legal del bloque de identidad: relación de servicio. Nada de esto
 * autoriza marketing.
 */
import { CustomySdkError, createTransport, type RetryPolicy, type Transport } from "@customyai/core";
import { ConnectedApplicationUserIdentitySchema, type ConnectedApplicationUserIdentity } from "./vendor/people";
import { validateInput } from "./people";

export const APPLICATION_USER_EVENT_TYPES = [
    "application.user.registered",
    "application.user.activity",
    "application.user.identity_updated",
    "application.user.deleted",
] as const;
export type ApplicationUserEventType = (typeof APPLICATION_USER_EVENT_TYPES)[number];

/** URL de Customy Events por entorno. */
export const EVENTS_URLS = {
    staging: "https://events.staging.customy.ai",
    production: "https://events.customy.ai",
} as const;

export type ConnectedAppEnvironment = keyof typeof EVENTS_URLS;

export type ConnectedAppOptions = Readonly<{
    /** Clave de la app conectada (`bonu`): 3–40, minúsculas, dígitos y guiones. */
    applicationKey: string;
    /** Llave de ingesta propia de la app (Events la guarda como `EVENTS_<CLAVE>_INGEST_KEY`). Secreto: solo servidor. */
    ingestKey: string;
    organizationId: string;
    projectId: string;
    environment: ConnectedAppEnvironment;
    /** Ambiente de Access de la app (el de sus usuarios finales). */
    accessEnvironmentId: string;
    /** Por defecto, el oficial del entorno (`EVENTS_URLS`). */
    eventsUrl?: string;
    fetch?: typeof fetch;
    /** Límite por intento, en ms (por defecto 10 000). */
    timeoutMs?: number;
    /** Reintentos ante 5xx/408/429/red; `false` los desactiva. */
    retry?: RetryPolicy | false;
    allowLoopbackHttp?: boolean;
    allowPrivateHttp?: boolean;
    /** Reloj (tests). */
    now?: () => Date;
}>;

/** Datos comunes a todo evento: `occurredAt` por defecto es ahora; `idempotencyKey` se deriva si no se da. */
type EventBase = Readonly<{
    /** Id del usuario en la app (UUID, seudónimo: nunca el email). */
    userId: string;
    occurredAt?: Date | string;
    /** Clave propia; si no empieza por `<clave>:`, se le antepone. */
    idempotencyKey?: string;
}>;

export type UserRegisteredInput = EventBase & Readonly<{ identity?: ConnectedApplicationUserIdentity }>;
export type UserActivityInput = EventBase & Readonly<{
    /** Tipo de actividad declarado en el manifiesto (`expense_logged`): `^[a-z][a-z0-9_]{0,63}$`. */
    kind: string;
    /** Recurso que la origina: hace la actividad idempotente (`<clave>:<kind>:<resourceId>:<userId>`). */
    resourceId?: string;
}>;
export type UserIdentityUpdatedInput = EventBase & Readonly<{ identity: ConnectedApplicationUserIdentity }>;
export type UserDeletedInput = EventBase & Readonly<{
    /** `true`: supresión (derecho al olvido); CRM guarda solo una lápida de supresión. */
    erasure: boolean;
}>;

export type ApplicationUserPayload = Readonly<{
    schemaVersion: 1;
    applicationKey: string;
    applicationUserId: string;
    accessEnvironmentId: string;
    kind?: string;
    identity?: ConnectedApplicationUserIdentity;
    erasure?: boolean;
}>;

/** Sobre exacto que acepta `POST /v1/events/ingest` con la llave de la app. */
export type ApplicationUserEventEnvelope = Readonly<{
    type: ApplicationUserEventType;
    version: "v1";
    source: string;
    tenantId: string;
    organizationId: string;
    projectId: string;
    environment: ConnectedAppEnvironment;
    partitionKey: string;
    eventId: string;
    idempotencyKey: string;
    occurredAt: string;
    payload: ApplicationUserPayload;
}>;

/** Acuse de Events. */
export type IngestReceipt = Readonly<{
    accepted: boolean;
    deduplicated: boolean;
    eventId: string;
    idempotencyKey: string;
    channel?: string;
    type?: string;
    version?: string;
}>;

export type BatchItem =
    | Readonly<{ type: "registered"; input: UserRegisteredInput }>
    | Readonly<{ type: "activity"; input: UserActivityInput }>
    | Readonly<{ type: "identity_updated"; input: UserIdentityUpdatedInput }>
    | Readonly<{ type: "deleted"; input: UserDeletedInput }>;

export type BatchResult = ReadonlyArray<
    | Readonly<{ index: number; ok: true; receipt: IngestReceipt }>
    | Readonly<{ index: number; ok: false; error: CustomySdkError }>
>;

const APPLICATION_KEY = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_IDEMPOTENCY_KEY = 512;

const invalid = (path: string, message: string) =>
    new CustomySdkError({ code: "SDK_INPUT_INVALID", service: "events", message: `Invalid input: ${path} ${message}`, body: { issues: [{ path, code: "custom", message }] } });

/**
 * UUID determinista (versión 8, RFC 9562) a partir de un texto: los 16
 * primeros bytes de su SHA-256 con los bits de versión y variante.
 */
export async function deterministicUuid(value: string): Promise<string> {
    const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
    if (!subtle) throw new CustomySdkError({ code: "SDK_CRYPTO_UNAVAILABLE", service: "events", message: "Web Crypto (crypto.subtle) is required" });
    const bytes = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(value))).slice(0, 16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x80;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toIso(value: Date | string | undefined, now: () => Date): string {
    const date = value === undefined ? now() : value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw invalid("occurredAt", "must be a valid date");
    return date.toISOString();
}

export type CustomyConnectedApp = ReturnType<typeof createConnectedApp>;

/**
 * Emisor del ciclo de vida de usuarios de una app conectada.
 *
 * ```ts
 * const app = createConnectedApp({ applicationKey: "bonu", ingestKey, organizationId, projectId, environment: "staging", accessEnvironmentId });
 * await app.userRegistered({ userId, identity: { email: "ana@example.com", emailVerified: true } });
 * await app.activity({ userId, kind: "expense_logged", resourceId: expenseId });
 * ```
 */
export function createConnectedApp(options: ConnectedAppOptions) {
    if (!options || typeof options.applicationKey !== "string" || !APPLICATION_KEY.test(options.applicationKey)) throw invalid("applicationKey", "must match ^[a-z][a-z0-9-]{1,38}[a-z0-9]$");
    if (typeof options.ingestKey !== "string" || options.ingestKey.length < 32) throw invalid("ingestKey", "must be the app's ingest key (32+ chars)");
    for (const field of ["organizationId", "projectId", "accessEnvironmentId"] as const) {
        if (typeof options[field] !== "string" || options[field].length === 0) throw invalid(field, "is required");
    }
    if (options.environment !== "staging" && options.environment !== "production") throw invalid("environment", "must be staging or production");

    const { applicationKey, organizationId, projectId, environment, accessEnvironmentId } = options;
    const now = options.now ?? (() => new Date());
    const transport: Transport = createTransport({
        baseUrl: options.eventsUrl ?? EVENTS_URLS[environment],
        service: "events",
        headers: { "x-internal-key": options.ingestKey },
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? 10_000,
        retry: options.retry,
        allowLoopbackHttp: options.allowLoopbackHttp,
        allowPrivateHttp: options.allowPrivateHttp,
    });

    const keyFor = (explicit: string | undefined, derived: string) => {
        const key = explicit === undefined ? derived : explicit.startsWith(`${applicationKey}:`) ? explicit : `${applicationKey}:${explicit}`;
        if (key.length > MAX_IDEMPOTENCY_KEY || !/^[\x21-\x7e]+$/.test(key)) throw invalid("idempotencyKey", `must be visible ASCII, at most ${MAX_IDEMPOTENCY_KEY} chars`);
        return key;
    };

    async function envelope(type: ApplicationUserEventType, base: EventBase, derivedKey: (occurredAt: string) => string, extra: Partial<ApplicationUserPayload>): Promise<ApplicationUserEventEnvelope> {
        if (!base || typeof base.userId !== "string" || !UUID.test(base.userId)) throw invalid("userId", "must be the app user's UUID");
        const occurredAt = toIso(base.occurredAt, now);
        const idempotencyKey = keyFor(base.idempotencyKey, derivedKey(occurredAt));
        return {
            type,
            version: "v1",
            source: applicationKey,
            tenantId: `${organizationId}:${projectId}:${environment}`,
            organizationId,
            projectId,
            environment,
            partitionKey: base.userId,
            eventId: await deterministicUuid(`${type}\n${idempotencyKey}`),
            idempotencyKey,
            occurredAt,
            payload: { schemaVersion: 1, applicationKey, applicationUserId: base.userId, accessEnvironmentId, ...extra },
        };
    }

    const identityOf = (identity: unknown) => validateInput(ConnectedApplicationUserIdentitySchema, identity, "events");

    const build = {
        registered: (input: UserRegisteredInput) =>
            envelope("application.user.registered", input, () => `${applicationKey}:user:registered:${input.userId}`, input.identity === undefined ? {} : { identity: identityOf(input.identity) }),
        activity: (input: UserActivityInput) => {
            if (typeof input?.kind !== "string" || !KIND.test(input.kind)) throw invalid("kind", "must match ^[a-z][a-z0-9_]{0,63}$");
            if (input.resourceId !== undefined && (typeof input.resourceId !== "string" || input.resourceId.length === 0 || input.resourceId.length > 200)) throw invalid("resourceId", "must be a non-empty string (max 200)");
            return envelope(
                "application.user.activity",
                input,
                (occurredAt) => (input.resourceId ? `${applicationKey}:${input.kind}:${input.resourceId}:${input.userId}` : `${applicationKey}:activity:${input.kind}:${input.userId}:${occurredAt}`),
                { kind: input.kind },
            );
        },
        identityUpdated: (input: UserIdentityUpdatedInput) =>
            envelope("application.user.identity_updated", input, (occurredAt) => `${applicationKey}:user:identity_updated:${input.userId}:${occurredAt}`, { identity: identityOf(input?.identity) }),
        deleted: (input: UserDeletedInput) => {
            if (typeof input?.erasure !== "boolean") throw invalid("erasure", "must be a boolean");
            return envelope("application.user.deleted", input, () => `${applicationKey}:user:deleted:${input.userId}`, { erasure: input.erasure });
        },
    };

    async function send(event: ApplicationUserEventEnvelope, signal?: AbortSignal): Promise<IngestReceipt> {
        // La cabecera habilita los reintentos del transporte; Events deduplica por la clave del sobre.
        const header = event.idempotencyKey.length <= 255 ? event.idempotencyKey : event.eventId;
        const receipt = await transport.post<IngestReceipt>("/v1/events/ingest", event, { idempotencyKey: header, signal });
        if (!receipt || receipt.idempotencyKey !== event.idempotencyKey) {
            throw new CustomySdkError({ code: "SDK_ACKNOWLEDGEMENT_INVALID", service: "events", message: "Events acknowledged a different idempotency key", body: receipt });
        }
        return receipt;
    }

    type Call = Readonly<{ signal?: AbortSignal }>;

    return {
        applicationKey,
        baseUrl: transport.baseUrl,
        /** Alta de un usuario (una vez por usuario), con identidad opcional para CRM. */
        userRegistered: async (input: UserRegisteredInput, call: Call = {}) => send(await build.registered(input), call.signal),
        /** Actividad significativa, sin datos personales. */
        activity: async (input: UserActivityInput, call: Call = {}) => send(await build.activity(input), call.signal),
        /** Cambio de email, teléfono, nombre, idioma… */
        identityUpdated: async (input: UserIdentityUpdatedInput, call: Call = {}) => send(await build.identityUpdated(input), call.signal),
        /** Baja de la cuenta; `erasure: true` pide supresión. */
        deleted: async (input: UserDeletedInput, call: Call = {}) => send(await build.deleted(input), call.signal),
        /**
         * Envía varios eventos, en orden y con concurrencia limitada (por defecto 4).
         * Nunca lanza por un evento: cada resultado dice si entró o su error.
         */
        batch: async (items: readonly BatchItem[], opts: Readonly<{ concurrency?: number; signal?: AbortSignal }> = {}): Promise<BatchResult> => {
            const results: Array<BatchResult[number]> = new Array(items.length);
            let next = 0;
            const worker = async () => {
                while (next < items.length) {
                    const index = next++;
                    const item = items[index]!;
                    try {
                        const event = item.type === "registered" ? await build.registered(item.input)
                            : item.type === "activity" ? await build.activity(item.input)
                            : item.type === "identity_updated" ? await build.identityUpdated(item.input)
                            : await build.deleted(item.input);
                        results[index] = { index, ok: true, receipt: await send(event, opts.signal) };
                    } catch (error) {
                        results[index] = { index, ok: false, error: error instanceof CustomySdkError ? error : new CustomySdkError({ code: "SDK_EVENT_FAILED", service: "events", cause: error }) };
                    }
                }
            };
            const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 16, items.length || 1));
            await Promise.all(Array.from({ length: concurrency }, worker));
            return results;
        },
        /** Construye el sobre sin enviarlo (outbox propio, auditoría, tests). */
        envelopes: build,
        /** Envía un sobre ya construido (p. ej. desde un outbox). */
        send: (event: ApplicationUserEventEnvelope, call: Call = {}) => send(event, call.signal),
    };
}
