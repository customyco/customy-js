/**
 * Transporte HTTP común de los SDK de Customy, sobre el `fetch` estándar: sirve
 * igual en node, edge y navegador. Resuelve lo que ningún SDK de producto debe
 * reimplementar: URL segura, credencial por petición, límite de tiempo por
 * intento, reintentos con `Retry-After`, idempotencia, límite de tamaño de la
 * respuesta y el error tipado.
 */
import { CustomySdkError, readErrorEnvelope } from "./errors";
import { createIdempotencyKey, IDEMPOTENCY_HEADER, isValidIdempotencyKey } from "./idempotency";
import { backoffDelay, DEFAULT_RETRY_POLICY, isIdempotentMethod, isRetryableStatus, parseRetryAfter, sleep as defaultSleep, type RetryPolicy } from "./retry";
import { buildUrl, normalizeBaseUrl, type Query } from "./url";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

/**
 * Proveedor de tokens: devuelve uno vigente por petición. Si expone
 * `invalidate`, un 401 lo invalida y la petición se repite una vez con un
 * token nuevo (p. ej. tras una rotación de claves).
 */
export type AccessTokenProvider = {
    (): string | Promise<string>;
    invalidate?: () => void;
};

export type TransportOptions = Readonly<{
    baseUrl: string;
    /** Nombre del servicio para los errores (`send`, `data`…). */
    service?: string;
    /** Token fijo o proveedor de tokens (Bearer). */
    accessToken?: string | AccessTokenProvider;
    headers?: Readonly<Record<string, string>>;
    fetch?: typeof fetch;
    /** Límite por intento, en ms (por defecto 30 s). */
    timeoutMs?: number;
    /** Política de reintentos; `false` los desactiva. */
    retry?: RetryPolicy | false;
    /** Genera `Idempotency-Key` para POST/PATCH que no la traen, y así se pueden reintentar. */
    autoIdempotencyKey?: boolean;
    /** Tamaño máximo de una respuesta (por defecto 4 MiB). */
    maxResponseBytes?: number;
    /** Permite `http://` hacia loopback (desarrollo y tests). */
    allowLoopbackHttp?: boolean;
    /** Inyectables para tests. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    random?: () => number;
    now?: () => number;
}>;

export type RequestBody = unknown;

export type RequestOptions = Readonly<{
    query?: Query;
    body?: RequestBody;
    headers?: Readonly<Record<string, string>>;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxBytes?: number;
    /** Clave propia, o `true` para generar una (reutilizada en todos los intentos). */
    idempotencyKey?: string | boolean;
    retry?: RetryPolicy | false;
}>;

export type TransportResponse<T> = Readonly<{
    data: T;
    status: number;
    headers: Headers;
    requestId?: string;
    /** Intentos hechos (1 si no hubo reintentos). */
    attempts: number;
}>;

export type Transport = Readonly<{
    baseUrl: string;
    service?: string;
    request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<TransportResponse<T>>;
    get<T = unknown>(path: string, options?: Omit<RequestOptions, "body">): Promise<T>;
    post<T = unknown>(path: string, body?: RequestBody, options?: Omit<RequestOptions, "body">): Promise<T>;
    put<T = unknown>(path: string, body?: RequestBody, options?: Omit<RequestOptions, "body">): Promise<T>;
    patch<T = unknown>(path: string, body?: RequestBody, options?: Omit<RequestOptions, "body">): Promise<T>;
    delete<T = unknown>(path: string, options?: Omit<RequestOptions, "body">): Promise<T>;
}>;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

function isRawBody(body: unknown): body is BodyInit {
    return typeof body === "string"
        || body instanceof ArrayBuffer
        || ArrayBuffer.isView(body)
        || (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams)
        || (typeof FormData !== "undefined" && body instanceof FormData)
        || (typeof Blob !== "undefined" && body instanceof Blob);
}

async function readBody(response: Response, maxBytes: number): Promise<unknown> {
    if (response.status === 204 || response.status === 205) return null;
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error("SDK_RESPONSE_TOO_LARGE");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("SDK_RESPONSE_TOO_LARGE");
    if (buffer.byteLength === 0) return null;
    const text = new TextDecoder().decode(buffer);
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json") || /^[\s]*[[{"]/.test(text)) {
        try { return JSON.parse(text); } catch { /* texto plano */ }
    }
    return text;
}

function linkSignals(outer: AbortSignal | undefined, inner: AbortController): () => void {
    if (!outer) return () => {};
    if (outer.aborted) { inner.abort(outer.reason); return () => {}; }
    const onAbort = () => inner.abort(outer.reason);
    outer.addEventListener("abort", onAbort, { once: true });
    return () => outer.removeEventListener("abort", onAbort);
}

export function createTransport(options: TransportOptions): Transport {
    const service = options.service;
    const baseUrl = normalizeBaseUrl(options.baseUrl, { allowLoopbackHttp: options.allowLoopbackHttp, service });
    const resolvedFetch = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!resolvedFetch) throw new CustomySdkError({ code: "SDK_FETCH_REQUIRED", service, message: "No fetch implementation available" });
    const fetchImpl: typeof fetch = resolvedFetch;
    const wait = options.sleep ?? defaultSleep;
    const random = options.random ?? Math.random;
    const now = options.now ?? Date.now;

    async function authorization(): Promise<string | undefined> {
        const source = options.accessToken;
        if (source === undefined) return undefined;
        let token: string;
        try { token = typeof source === "string" ? source : await source(); }
        catch (error) {
            if (error instanceof CustomySdkError) throw error;
            throw new CustomySdkError({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE", status: 401, service, cause: error });
        }
        if (typeof token !== "string" || token.length === 0) throw new CustomySdkError({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE", status: 401, service });
        return `Bearer ${token}`;
    }

    async function request<T>(method: HttpMethod, path: string, requestOptions: RequestOptions = {}): Promise<TransportResponse<T>> {
        const url = buildUrl(baseUrl, path, requestOptions.query, service);
        const policy = requestOptions.retry === false || options.retry === false
            ? { ...DEFAULT_RETRY_POLICY, maxRetries: 0 }
            : { ...DEFAULT_RETRY_POLICY, ...options.retry, ...requestOptions.retry };
        const maxBytes = requestOptions.maxBytes ?? options.maxResponseBytes ?? DEFAULT_MAX_BYTES;
        const timeoutMs = requestOptions.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

        const headers: Record<string, string> = { accept: "application/json" };
        for (const [name, value] of Object.entries({ ...options.headers, ...requestOptions.headers })) headers[name.toLowerCase()] = value;

        let idempotencyKey = typeof requestOptions.idempotencyKey === "string" ? requestOptions.idempotencyKey : headers[IDEMPOTENCY_HEADER];
        const wantsKey = requestOptions.idempotencyKey === true
            || (requestOptions.idempotencyKey === undefined && options.autoIdempotencyKey === true && (method === "POST" || method === "PATCH"));
        if (idempotencyKey === undefined && wantsKey) idempotencyKey = createIdempotencyKey();
        if (idempotencyKey !== undefined) {
            if (!isValidIdempotencyKey(idempotencyKey)) throw new CustomySdkError({ code: "SDK_IDEMPOTENCY_KEY_INVALID", service });
            headers[IDEMPOTENCY_HEADER] = idempotencyKey;
        }
        const safeToRepeat = isIdempotentMethod(method) || idempotencyKey !== undefined;

        let payload: BodyInit | undefined;
        if (requestOptions.body !== undefined && requestOptions.body !== null) {
            if (isRawBody(requestOptions.body)) payload = requestOptions.body;
            else {
                payload = JSON.stringify(requestOptions.body);
                headers["content-type"] ??= "application/json";
            }
        }

        let retried401 = false;
        for (let attempt = 0; ; attempt += 1) {
            if (requestOptions.signal?.aborted) throw new CustomySdkError({ code: "SDK_ABORTED", service, cause: requestOptions.signal.reason });
            const attemptHeaders = { ...headers };
            if (attemptHeaders.authorization === undefined) {
                const value = await authorization();
                if (value) attemptHeaders.authorization = value;
            }
            const controller = new AbortController();
            const unlink = linkSignals(requestOptions.signal, controller);
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            let failure!: CustomySdkError;
            let retryAfterMs: number | null = null;
            try {
                let response: Response;
                try {
                    response = await fetchImpl(url.toString(), { method, headers: attemptHeaders, body: payload, signal: controller.signal });
                } catch (error) {
                    if (requestOptions.signal?.aborted) throw new CustomySdkError({ code: "SDK_ABORTED", service, cause: error });
                    throw timedOut
                        ? new CustomySdkError({ code: "SDK_TIMEOUT", status: 408, service, cause: error })
                        : new CustomySdkError({ code: "SDK_NETWORK_ERROR", status: 0, service, cause: error });
                }
                let body: unknown;
                try { body = await readBody(response, maxBytes); }
                catch (error) {
                    if (error instanceof Error && error.message === "SDK_RESPONSE_TOO_LARGE") throw new CustomySdkError({ code: "SDK_RESPONSE_TOO_LARGE", status: response.status, service });
                    if (requestOptions.signal?.aborted) throw new CustomySdkError({ code: "SDK_ABORTED", service, cause: error });
                    throw timedOut
                        ? new CustomySdkError({ code: "SDK_TIMEOUT", status: 408, service, cause: error })
                        : new CustomySdkError({ code: "SDK_RESPONSE_READ_FAILED", status: response.status, service, cause: error });
                }
                const envelope = readErrorEnvelope(body);
                const requestId = response.headers.get("x-request-id") ?? envelope.requestId ?? undefined;
                if (response.ok) return { data: body as T, status: response.status, headers: response.headers, requestId, attempts: attempt + 1 };

                retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now());
                failure = new CustomySdkError({
                    code: envelope.code ?? `HTTP_${response.status}`,
                    status: response.status,
                    message: envelope.message,
                    service,
                    requestId,
                    retryAfterMs: retryAfterMs ?? undefined,
                    body,
                });
                const provider = typeof options.accessToken === "function" ? options.accessToken : undefined;
                if (response.status === 401 && !retried401 && provider?.invalidate && headers.authorization === undefined) {
                    retried401 = true;
                    provider.invalidate();
                    attempt -= 1;
                    continue;
                }
                if (!isRetryableStatus(response.status)) throw failure;
            } catch (error) {
                if (!(error instanceof CustomySdkError)) throw error;
                if (error.code === "SDK_ABORTED" || error.code === "SDK_RESPONSE_TOO_LARGE" || error.code === "SDK_ACCESS_TOKEN_UNAVAILABLE") throw error;
                if (error.status !== 0 && error.status !== 408 && !isRetryableStatus(error.status)) throw error;
                failure = error;
            } finally {
                clearTimeout(timer);
                unlink();
            }

            if (!safeToRepeat || attempt >= policy.maxRetries) throw failure;
            if (retryAfterMs !== null && retryAfterMs > policy.maxRetryAfterMs) throw failure;
            const delay = retryAfterMs ?? backoffDelay(attempt, policy, random);
            try { await wait(delay, requestOptions.signal); }
            catch (error) { throw new CustomySdkError({ code: "SDK_ABORTED", service, cause: error }); }
        }
    }

    const data = async <T>(method: HttpMethod, path: string, requestOptions?: RequestOptions) => (await request<T>(method, path, requestOptions)).data;
    return {
        baseUrl,
        service,
        request,
        get: (path, requestOptions) => data("GET", path, requestOptions),
        post: (path, body, requestOptions) => data("POST", path, { ...requestOptions, body }),
        put: (path, body, requestOptions) => data("PUT", path, { ...requestOptions, body }),
        patch: (path, body, requestOptions) => data("PATCH", path, { ...requestOptions, body }),
        delete: (path, requestOptions) => data("DELETE", path, requestOptions),
    };
}
