/**
 * @customyai/provisioning client. One Access API key of ONE environment, a
 * client-credentials JWT cached in memory, and `Customy-Environment` on every
 * request so the server can refuse a key used against the wrong environment.
 */
import {
    CustomySdkError,
    createIdempotencyKey,
    createMachineTokenProvider,
    createTransport,
    backoffDelay,
    paginate,
    sleep as defaultSleep,
    type MachineTokenProvider,
    type Query,
    type RetryPolicy,
    type Transport,
} from "@customyai/core";
import {
    createScrubber,
    CustomyProvisioningError,
    CustomyValidationError,
    REDACTED,
    toProvisioningError,
    type Scrubber,
} from "./errors";
import type {
    AuditEntry,
    AuditExportParams,
    AuditVerifyResult,
    BatchTestUsersInput,
    BatchTestUsersResult,
    CallOptions,
    CleanupInput,
    CleanupResult,
    CleanupTarget,
    DeleteUserInput,
    DeleteUserResult,
    ExpireResult,
    ListAuditParams,
    ListUsersParams,
    Paged,
    PolicyView,
    ProvisionedUser,
    ProvisioningEnvironment,
    PutPolicyInput,
    PutPolicyResult,
    RequestEvent,
    ResponseEvent,
    SigninLinkResult,
    UpsertOptions,
    UpsertUserInput,
    UpsertUserResult,
    Whoami,
} from "./types";

export const PROVISIONING_AUDIENCE = "customy-provisioning";
export const ENVIRONMENT_HEADER = "Customy-Environment";
const BASE = "/v1/provisioning";
const EXTERNAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:.-]{8,128}$/;

export type ProvisioningRetry = RetryPolicy & {
    /** Total attempts including the first (default 3). */
    maxAttempts?: number;
};

/** Client credentials (the normal case) or an already-obtained bearer (curl-like use; not refreshed). */
export type ProvisioningCredentials =
    | {
        clientId: string;
        clientSecret: string;
        /** Scopes requested at the token endpoint (default: all the key grants). */
        scopes?: readonly string[];
        accessToken?: undefined;
    }
    | { accessToken: string; clientId?: undefined; clientSecret?: undefined; scopes?: undefined };

export type ProvisioningOptions = ProvisioningCredentials & {
    /** The environment the caller intends. There is no default: a key is for exactly one. */
    environment: ProvisioningEnvironment;
    /** Origin of Customy Access (the token endpoint and `/v1/provisioning` live there). */
    baseUrl: string;
    fetch?: typeof fetch;
    /** Default 3 attempts; `false` disables retries. Retries only 429, 5xx, network and IDEMPOTENCY_IN_PROGRESS. */
    retry?: ProvisioningRetry | false;
    /** Per attempt, ms (default 30 s). */
    timeoutMs?: number;
    /** Receives a redacted view of every attempt. Never gets the bearer, secrets, passwords or links. */
    onRequest?: (event: RequestEvent) => void;
    onResponse?: (event: ResponseEvent) => void;
    /** Allows `http://` to loopback (tests). The token endpoint itself always needs https. */
    allowLoopbackHttp?: boolean;
    /** Test hooks. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    random?: () => number;
};

export type CustomyProvisioning = {
    readonly environment: ProvisioningEnvironment;
    readonly baseUrl: string;
    readonly users: {
        upsert(externalKey: string, input: UpsertUserInput, options?: UpsertOptions): Promise<UpsertUserResult>;
        get(externalKey: string, options?: CallOptions): Promise<ProvisionedUser>;
        list(params?: ListUsersParams, options?: CallOptions): Promise<Paged<ProvisionedUser>>;
        /** Iterates every match across pages. */
        listAll(params?: Omit<ListUsersParams, "cursor">, options?: CallOptions): AsyncGenerator<ProvisionedUser, void, undefined>;
        delete(externalKey: string, input: DeleteUserInput, options?: CallOptions): Promise<DeleteUserResult>;
        signinLink(externalKey: string, input: { reason: string; ticket?: string }, options?: CallOptions): Promise<SigninLinkResult>;
    };
    readonly testUsers: {
        batch(input: BatchTestUsersInput, options?: CallOptions): Promise<BatchTestUsersResult>;
        cleanup(target: CleanupTarget, input: CleanupInput, options?: CallOptions): Promise<CleanupResult>;
        expire(options?: CallOptions): Promise<ExpireResult>;
    };
    readonly audit: {
        list(params?: ListAuditParams, options?: CallOptions): Promise<Paged<AuditEntry>>;
        listAll(params?: Omit<ListAuditParams, "cursor">, options?: CallOptions): AsyncGenerator<AuditEntry, void, undefined>;
        /** The export body as text (CSV or NDJSON). */
        export(params: AuditExportParams, options?: CallOptions): Promise<string>;
        verify(options?: CallOptions): Promise<AuditVerifyResult>;
    };
    readonly policy: {
        get(options?: CallOptions): Promise<PolicyView>;
        put(input: PutPolicyInput, options?: CallOptions): Promise<PutPolicyResult>;
    };
    whoami(options?: CallOptions): Promise<Whoami>;
};

function invalid(message: string, path?: string): CustomyValidationError {
    return new CustomyValidationError({ code: "VALIDATION", status: 0, message, details: { issues: [{ path: path ?? "", message }] } });
}

function iso(value: string | Date | undefined, path: string): string | undefined {
    if (value === undefined) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw invalid("not a valid date", path);
    return date.toISOString();
}

function etag(version: number | string): string {
    const text = String(version);
    return text.startsWith('"') ? text : `"${text}"`;
}

function checkKey(externalKey: string): string {
    if (typeof externalKey !== "string" || !EXTERNAL_KEY.test(externalKey)) throw invalid("externalKey must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", "externalKey");
    return encodeURIComponent(externalKey);
}

function checkReason(reason: unknown): void {
    if (typeof reason !== "string" || reason.trim().length < 10 || reason.length > 300) throw invalid("reason is required (10-300 characters)", "reason");
}

function numberHeader(headers: Headers, name: string): number | undefined {
    const value = headers.get(name);
    if (value === null || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function isRetryable(error: CustomySdkError): boolean {
    if (error.code === "SDK_ABORTED") return false;
    if (error.status === 429) return true;
    if (error.status === 409) return error.code === "IDEMPOTENCY_IN_PROGRESS";
    if (error.status === 501) return false;
    // 0 = network, 408 = our own SDK_TIMEOUT, 5xx = server.
    return error.status === 0 || error.status === 408 && error.code === "SDK_TIMEOUT" || error.status >= 500;
}

export function createProvisioning(options: ProvisioningOptions): CustomyProvisioning {
    if (options?.environment !== "staging" && options?.environment !== "production") {
        throw invalid('environment must be "staging" or "production" (there is no default)', "environment");
    }
    const bearer = options.accessToken;
    if (!bearer && (!options.clientId || !options.clientSecret)) {
        throw new CustomyProvisioningError({ code: "SDK_CREDENTIALS_REQUIRED", message: "createProvisioning needs clientId and clientSecret (or accessToken)" });
    }
    const environment = options.environment;
    const scrub: Scrubber = createScrubber();
    scrub.add(options.clientSecret);
    scrub.add(bearer);
    const fetchImpl: typeof fetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    let origin: string;
    try { origin = new URL(options.baseUrl).origin; }
    catch { throw new CustomyProvisioningError({ code: "SDK_BASE_URL_INVALID", message: "baseUrl must be the Access origin (an absolute URL)" }); }

    // The token endpoint takes client_id / client_secret in the body (not Basic), and gets the same
    // environment header. Reuses the core provider (cache, 60 s early refresh, single flight, invalidate).
    const clientId = options.clientId ?? "";
    const clientSecret = options.clientSecret ?? "";
    const tokenFetch: typeof fetch = async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.delete("authorization");
        headers.set(ENVIRONMENT_HEADER, environment);
        const form = new URLSearchParams(String(init?.body ?? ""));
        form.set("client_id", clientId);
        form.set("client_secret", clientSecret);
        const response = await fetchImpl(input, { ...init, headers, body: form.toString() });
        return tapToken(response);
    };
    // Learn each issued token so error messages and hooks can scrub it.
    const tapToken = async (response: Response): Promise<Response> => {
        if (!response.ok) return response;
        const text = await response.text();
        try { scrub.add((JSON.parse(text) as { access_token?: string }).access_token); } catch { /* not JSON: the core provider will reject it */ }
        return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
    const tokens: MachineTokenProvider | string = bearer ?? createMachineTokenProvider({
        issuer: origin,
        clientId,
        clientSecret,
        audience: PROVISIONING_AUDIENCE,
        scopes: options.scopes,
        fetch: tokenFetch,
        refreshSkewSeconds: 60,
        timeoutMs: options.timeoutMs,
    });

    const transport: Transport = createTransport({
        baseUrl: origin,
        service: "provisioning",
        accessToken: tokens,
        headers: { [ENVIRONMENT_HEADER]: environment },
        fetch: fetchImpl,
        timeoutMs: options.timeoutMs,
        retry: false, // retries are driven below (they also cover IDEMPOTENCY_IN_PROGRESS)
        allowLoopbackHttp: options.allowLoopbackHttp,
    });

    const retry = options.retry === false ? { maxAttempts: 1 } : (options.retry ?? {});
    const maxAttempts = Math.max(1, retry.maxAttempts ?? 3);
    const maxRetryAfterMs = retry.maxRetryAfterMs ?? 60_000;
    const wait = options.sleep ?? defaultSleep;
    const random = options.random ?? Math.random;

    type Call = {
        method: "GET" | "POST" | "PUT" | "DELETE";
        path: string;
        query?: Query;
        body?: unknown;
        write?: boolean;
        ifMatch?: number | string;
        responseType?: "json" | "text";
        accept?: string;
    } & CallOptions;

    async function call<T>(spec: Call): Promise<T> {
        let key: string | undefined;
        if (spec.write) {
            key = spec.idempotencyKey ?? createIdempotencyKey();
            if (!IDEMPOTENCY_KEY.test(key)) throw invalid("idempotencyKey must be 8-128 characters of [A-Za-z0-9_:.-]", "idempotencyKey");
        }
        const headers: Record<string, string> = {};
        if (spec.ifMatch !== undefined) headers["if-match"] = etag(spec.ifMatch);
        if (spec.accept) headers.accept = spec.accept;
        const url = `${origin}${spec.path}`;

        for (let attempt = 1; ; attempt += 1) {
            const started = Date.now();
            const view: Record<string, string> = { authorization: `Bearer ${REDACTED}`, [ENVIRONMENT_HEADER.toLowerCase()]: environment, ...headers, ...(key ? { "idempotency-key": key } : {}) };
            options.onRequest?.({ method: spec.method, url: scrub.text(withQuery(url, spec.query)), attempt, headers: view, ...(spec.body !== undefined ? { body: scrub.value(spec.body) } : {}) });
            try {
                const response = await transport.request<T>(spec.method, spec.path, {
                    query: spec.query,
                    body: spec.body,
                    headers,
                    idempotencyKey: key,
                    signal: spec.signal,
                    timeoutMs: spec.timeoutMs,
                    responseType: spec.responseType,
                    retry: false,
                });
                options.onResponse?.({
                    method: spec.method, url: scrub.text(withQuery(url, spec.query)), attempt, status: response.status, ok: true, requestId: response.requestId,
                    durationMs: Date.now() - started, headers: safeHeaders(response.headers),
                    body: spec.responseType === "text" ? undefined : scrub.value(response.data),
                    ...rateLimit(response.headers),
                    ...(response.headers.get("idempotency-replayed") === "true" ? { replayed: true } : {}),
                });
                return response.data;
            } catch (raw) {
                const error = raw instanceof CustomySdkError ? raw : null;
                if (!error) throw toProvisioningError(raw, scrub);
                options.onResponse?.({
                    method: spec.method, url: scrub.text(withQuery(url, spec.query)), attempt, status: error.status, ok: false, requestId: error.requestId,
                    durationMs: Date.now() - started, headers: {}, body: scrub.value(error.body),
                });
                const typed = toProvisioningError(error, scrub);
                if (attempt >= maxAttempts || !isRetryable(error)) throw typed;
                if (error.retryAfterMs !== undefined && error.retryAfterMs > maxRetryAfterMs) throw typed;
                const delay = error.retryAfterMs ?? backoffDelay(attempt - 1, retry, random);
                try { await wait(delay, spec.signal); }
                catch (abort) { throw new CustomyProvisioningError({ code: "SDK_ABORTED", message: "request aborted", cause: abort }); }
            }
        }
    }

    const opt = (o?: CallOptions) => ({ signal: o?.signal, timeoutMs: o?.timeoutMs, idempotencyKey: o?.idempotencyKey });

    function listQuery(params: Record<string, unknown>): Query {
        const out: Record<string, string | number> = {};
        for (const [name, value] of Object.entries(params)) {
            if (value === undefined || value === null) continue;
            out[name] = value instanceof Date ? value.toISOString() : (value as string | number);
        }
        return out;
    }

    const listUsers = (params: ListUsersParams = {}, o?: CallOptions) =>
        call<Paged<ProvisionedUser>>({ method: "GET", path: `${BASE}/users`, query: listQuery({ ...params, expiresBefore: iso(params.expiresBefore, "expiresBefore") }), ...opt(o) });
    const listAudit = (params: ListAuditParams = {}, o?: CallOptions) =>
        call<Paged<AuditEntry>>({ method: "GET", path: `${BASE}/audit`, query: auditQuery(params), ...opt(o) });
    const auditQuery = (params: ListAuditParams | AuditExportParams) =>
        listQuery({ ...params, from: iso(params.from, "from"), to: iso(params.to, "to") });

    return {
        environment,
        baseUrl: origin,
        users: {
            async upsert(externalKey, input, o) {
                const segment = checkKey(externalKey);
                checkReason(input.reason);
                if (typeof input.email !== "string" || input.email.length === 0) throw invalid("email is required", "email");
                if (input.password !== undefined && input.password !== "generate") throw invalid('password can only be "generate"', "password");
                const body = { ...input, expiresAt: iso(input.expiresAt, "expiresAt") };
                return call<UpsertUserResult>({ method: "PUT", path: `${BASE}/users/${segment}`, body, write: true, ifMatch: o?.ifMatch, ...opt(o) });
            },
            get: async (externalKey, o) => call<ProvisionedUser>({ method: "GET", path: `${BASE}/users/${checkKey(externalKey)}`, ...opt(o) }),
            list: listUsers,
            listAll: (params, o) => paginate<ProvisionedUser>(async (cursor) => {
                const page = await listUsers({ ...params, cursor }, o);
                return { items: page.data, nextCursor: page.page.nextCursor };
            }, { signal: o?.signal }),
            async delete(externalKey, input, o) {
                const segment = checkKey(externalKey);
                checkReason(input.reason);
                return call<DeleteUserResult>({
                    method: "DELETE", path: `${BASE}/users/${segment}`, body: { reason: input.reason, ...(input.ticket !== undefined ? { ticket: input.ticket } : {}) },
                    write: true, ifMatch: input.ifMatch, ...opt(o),
                });
            },
            async signinLink(externalKey, input, o) {
                const segment = checkKey(externalKey);
                checkReason(input.reason);
                return call<SigninLinkResult>({ method: "POST", path: `${BASE}/users/${segment}:signin-link`, body: input, write: true, ...opt(o) });
            },
        },
        testUsers: {
            async batch(input, o) {
                checkReason(input.reason);
                if (!Number.isInteger(input.count) || input.count < 1 || input.count > 1000) throw invalid("count must be an integer between 1 and 1000", "count");
                if ((input.emailBase === undefined) === (input.emailDomain === undefined)) throw invalid("pass exactly one of emailBase or emailDomain", "emailBase");
                return call<BatchTestUsersResult>({ method: "POST", path: `${BASE}/test-users:batch`, body: { ...input, expiresAt: iso(input.expiresAt, "expiresAt") }, write: true, ...opt(o) });
            },
            async cleanup(target, input, o) {
                checkReason(input.reason);
                const byBatch = typeof target.batch === "string" && target.batch.length > 0;
                if (byBatch === (target.mine === true)) throw invalid("pass exactly one of { batch } or { mine: true }", "batch");
                return call<CleanupResult>({
                    method: "DELETE", path: `${BASE}/test-users`, write: true,
                    query: { ...(byBatch ? { batch: target.batch } : { mine: "true" }), reason: input.reason, ...(input.ticket !== undefined ? { ticket: input.ticket } : {}) },
                    ...opt(o),
                });
            },
            expire: (o) => call<ExpireResult>({ method: "POST", path: `${BASE}/test-users:expire`, body: {}, write: true, ...opt(o) }),
        },
        audit: {
            list: listAudit,
            listAll: (params, o) => paginate<AuditEntry>(async (cursor) => {
                const page = await listAudit({ ...params, cursor }, o);
                return { items: page.data, nextCursor: page.page.nextCursor };
            }, { signal: o?.signal }),
            export: (params, o) => call<string>({
                method: "GET", path: `${BASE}/audit/export`, query: auditQuery(params), responseType: "text",
                accept: params.format === "csv" ? "text/csv" : "application/x-ndjson", ...opt(o),
            }),
            verify: (o) => call<AuditVerifyResult>({ method: "GET", path: `${BASE}/audit/verify`, ...opt(o) }),
        },
        policy: {
            get: (o) => call<PolicyView>({ method: "GET", path: `${BASE}/policy`, ...opt(o) }),
            async put(input, o) {
                checkReason(input.reason);
                return call<PutPolicyResult>({ method: "PUT", path: `${BASE}/policy`, body: input, write: true, ...opt(o) });
            },
        },
        whoami: (o) => call<Whoami>({ method: "GET", path: `${BASE}/whoami`, ...opt(o) }),
    };
}

function withQuery(url: string, query: Query | undefined): string {
    if (!query) return url;
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined && value !== null) search.append(name, String(value));
    const text = search.toString();
    return text ? `${url}?${text}` : url;
}

const SAFE_RESPONSE_HEADERS = ["x-request-id", "etag", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after", "idempotency-replayed", "content-type"];
function safeHeaders(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of SAFE_RESPONSE_HEADERS) { const value = headers.get(name); if (value !== null) out[name] = value; }
    return out;
}

function rateLimit(headers: Headers): { rateLimit?: ResponseEvent["rateLimit"] } {
    const limit = numberHeader(headers, "ratelimit-limit");
    const remaining = numberHeader(headers, "ratelimit-remaining");
    const resetSeconds = numberHeader(headers, "ratelimit-reset");
    if (limit === undefined && remaining === undefined && resetSeconds === undefined) return {};
    return { rateLimit: { ...(limit !== undefined ? { limit } : {}), ...(remaining !== undefined ? { remaining } : {}), ...(resetSeconds !== undefined ? { resetSeconds } : {}) } };
}
