/**
 * Cliente de administración de Customy Access para un runtime de servidor (Next, node, edge).
 *
 * El BFF de una app (Workspace, Bonu, Codifly) habla con Access en nombre de una persona o de la app:
 * reenvía la cookie de sesión (o un bearer), el contexto del entorno (`x-env-id`, llave publicable…)
 * y espera estados HTTP, no excepciones. Este cliente da eso con la URL resuelta por el discovery, un
 * límite de tiempo, `cache: "no-store"`, sin reintentos (una lectura de autorización no se repite sola)
 * y el error tipado `CustomySdkError` para lo que no es una respuesta (red, tiempo, token).
 *
 * ```ts
 * const admin = createAccessAdmin({ platform, cookie: request.headers.get("cookie") ?? "", scope: { environmentId, publishableKey } });
 * const session = await admin.session();            // null si no hay sesión
 * const members = await admin.directory.members({ environmentId, search: "ana" });
 * ```
 *
 * No reintenta, no cachea y no decide quién puede qué: Access sigue siendo la autoridad.
 */
import {
    buildUrl,
    CustomySdkError,
    normalizeBaseUrl,
    readErrorEnvelope,
    resolveBearer,
    type AccessTokenProvider,
    type CallOptions,
    type CustomyPlatformConfiguration,
    type HttpMethod,
    type Query,
} from "@customyai/core";
import { createAccessCommercial, type AccessCommercial } from "./commercial";
import { ACCESS_DEFAULT_BASE_URL } from "./options";

const SERVICE = "access";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

/** Contexto de entorno que Access lee de las cabeceras `x-*` (todo opcional). */
export type AccessAdminScope = Readonly<{
    /** Llave publicable del entorno (`x-publishable-key`). */
    publishableKey?: string;
    environmentId?: string;
    /** Id o slug de la organización (`x-org-id` y `x-organization-id`). */
    organizationId?: string;
    /** Slug de la organización (`x-org-slug`). */
    organizationSlug?: string;
    projectId?: string;
    /** Usuario sobre el que se pregunta (`x-user-id`); Access lo contrasta con la sesión. */
    userId?: string;
    /** Host público que vio el navegador (`x-forwarded-host`). */
    forwardedHost?: string;
}>;

/** Las cabeceras de un contexto, tal como las lee Access. */
export function accessScopeHeaders(scope: AccessAdminScope | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!scope) return headers;
    const set = (value: string | undefined, ...names: string[]) => { if (value && value.trim()) for (const name of names) headers[name] = value; };
    set(scope.forwardedHost, "x-forwarded-host");
    set(scope.publishableKey, "x-publishable-key");
    set(scope.environmentId, "x-env-id", "x-environment-id");
    set(scope.organizationId, "x-org-id", "x-organization-id");
    set(scope.organizationSlug, "x-org-slug");
    set(scope.projectId, "x-project-id");
    set(scope.userId, "x-user-id", "x-customy-user-id");
    return headers;
}

export type AccessAdminOptions = Readonly<{
    /** URL de Access. Por defecto, la del discovery (`platform`). */
    baseUrl?: string;
    /** Discovery del entorno (`discoverPlatform` / `discoverApplication().platform`). */
    platform?: CustomyPlatformConfiguration;
    /** Bearer fijo o proveedor (token de máquina, token de usuario). */
    accessToken?: string | AccessTokenProvider;
    /** Cookie de sesión que se reenvía a Access, o quién la da por petición. */
    cookie?: string | (() => string | Promise<string>);
    /** Contexto por defecto de todas las llamadas. */
    scope?: AccessAdminScope;
    /** Cabeceras fijas (mandan sobre las del contexto). */
    headers?: Readonly<Record<string, string>>;
    fetch?: typeof fetch;
    /** Límite por llamada, en ms (por defecto 8 s). */
    timeoutMs?: number;
    /** `cache` de fetch (por defecto `"no-store"`: son datos de autorización). */
    cache?: RequestCache;
    /** `redirect` de fetch; `"error"` para llamadas privadas que nunca deben seguir una redirección. */
    redirect?: RequestRedirect;
    allowLoopbackHttp?: boolean;
    allowPrivateHttp?: boolean;
    /** Tamaño máximo de una respuesta leída como JSON (por defecto 4 MiB). */
    maxResponseBytes?: number;
}>;

/** Opciones de una llamada: sobrescriben las del cliente. */
export type AccessAdminCallOptions = CallOptions & Readonly<{
    query?: Query;
    body?: unknown;
    /** Cabeceras de esta llamada (mandan sobre cliente y contexto). */
    headers?: Readonly<Record<string, string>>;
    scope?: AccessAdminScope;
    cookie?: string;
    accessToken?: string | AccessTokenProvider;
    idempotencyKey?: string;
    redirect?: RequestRedirect;
    maxBytes?: number;
}>;

/** Respuesta de `request()`: el estado HTTP no lanza; el cuerpo es el JSON leído (o el texto si no lo era). */
export type AccessAdminResponse<T = unknown> = Readonly<{
    ok: boolean;
    status: number;
    headers: Headers;
    requestId?: string;
    body: T;
}>;

/** Sesión de Better Auth que Access devuelve en `get-session`, con los roles y capacidades de la app. */
export type AccessSessionPayload = Readonly<{
    user?: Readonly<{ id: string; email?: string | null; name?: string | null; image?: string | null } & Record<string, unknown>>;
    session?: Readonly<Record<string, unknown>>;
    roles?: readonly unknown[];
    capabilities?: Readonly<Record<string, unknown>>;
    activeRole?: unknown;
    organizationId?: string | null;
    projectId?: string | null;
    environmentId?: string | null;
}> & Readonly<Record<string, unknown>>;

/** Instantánea de `/api/v1/me`: plan, módulos visibles, uso y, en apps por manifiesto, el bloque `application`. */
export type AccessAdminMe = Readonly<{
    environmentId: string;
    user: Readonly<{ id: string }> | null;
    subscription?: unknown;
    entitlements?: unknown;
    modules?: unknown;
    usage?: unknown;
    application?: unknown;
    navModuleAllowlist?: unknown;
}> & Readonly<Record<string, unknown>>;

export type AccessDirectoryMember = Readonly<{
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    team: string | null;
    type: "user" | "managed";
    status: "active" | "inactive";
}> & Readonly<Record<string, unknown>>;

export type AccessGovernanceToken = Readonly<{ governance_token: string; expires_in: number }>;

export type AccessAdmin = Readonly<{
    /** URL de Access normalizada. */
    baseUrl: string;
    /** `fetch` con la URL, credencial, contexto, límite de tiempo y `cache` del cliente; devuelve la `Response` tal cual (sin leerla). */
    fetch(method: HttpMethod, path: string, options?: AccessAdminCallOptions): Promise<Response>;
    /** Como `fetch`, pero lee el cuerpo (JSON o texto) y no lanza por un estado HTTP. */
    request<T = unknown>(method: HttpMethod, path: string, options?: AccessAdminCallOptions): Promise<AccessAdminResponse<T>>;
    /** Como `request`, pero un estado que no es 2xx lanza `CustomySdkError` (con el `code` del sobre de error de Access). */
    json<T = unknown>(method: HttpMethod, path: string, options?: AccessAdminCallOptions): Promise<T>;
    /** `GET /api/auth/get-session`: la sesión de la cookie con roles, capacidades y rol activo; `null` si no hay sesión. */
    session(options?: AccessAdminCallOptions): Promise<AccessSessionPayload | null>;
    /** `POST /api/auth/device/session`: la sesión de un programa emparejado por su llave de dispositivo. */
    deviceSession(token: string, options?: AccessAdminCallOptions): Promise<AccessSessionPayload | null>;
    /** `GET /api/v1/me`: plan, módulos visibles, uso y bloque `application` del usuario del contexto. */
    me(options?: AccessAdminCallOptions): Promise<AccessAdminMe>;
    provisioning: Readonly<{
        /** `GET /api/workspace/provisioning/status`: aprovisionamiento (autoridad de plataforma) del entorno de workspace. */
        status<T = unknown>(input: { workspaceEnvironmentId: string }, options?: AccessAdminCallOptions): Promise<T>;
    }>;
    directory: Readonly<{
        /** `GET /api/v1/directory/members`: proyección mínima de las personas del entorno. */
        members(input: { environmentId: string; search?: string; limit?: number | string }, options?: AccessAdminCallOptions): Promise<{ items: AccessDirectoryMember[] } & Record<string, unknown>>;
    }>;
    workspace: Readonly<{
        theme<T = unknown>(options?: AccessAdminCallOptions): Promise<T>;
        layout<T = unknown>(role: string, options?: AccessAdminCallOptions): Promise<T>;
        featureFlags<T = unknown>(options?: AccessAdminCallOptions): Promise<T>;
        experiments<T = unknown>(options?: AccessAdminCallOptions): Promise<T>;
    }>;
    /** Planes de agencia, relación comercial por vínculo y `explain` de derechos (fase 1). Ver `src/commercial.ts`. */
    commercial: AccessCommercial;
    governance: Readonly<{
        /** `POST /v1/governance/token`: el token de gobierno de una sesión para un organización/proyecto/entorno. */
        token(input: { sessionToken: string; organizationId?: string; environmentId?: string; projectId?: string }, options?: AccessAdminCallOptions): Promise<AccessGovernanceToken>;
    }>;
}>;

function fail(code: string, cause: unknown, status = 0): CustomySdkError {
    return new CustomySdkError({ code, status, service: SERVICE, cause });
}

function combineSignals(timeoutMs: number, outer: AbortSignal | undefined): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    if (!outer) return timeout;
    if (typeof AbortSignal.any === "function") return AbortSignal.any([timeout, outer]);
    const controller = new AbortController();
    const abort = (signal: AbortSignal) => () => controller.abort(signal.reason);
    if (timeout.aborted) controller.abort(timeout.reason);
    else timeout.addEventListener("abort", abort(timeout), { once: true });
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", abort(outer), { once: true });
    return controller.signal;
}

async function readBody(response: Response, maxBytes: number): Promise<unknown> {
    if (response.status === 204 || response.status === 205) return null;
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw new CustomySdkError({ code: "SDK_RESPONSE_TOO_LARGE", status: response.status, service: SERVICE });
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new CustomySdkError({ code: "SDK_RESPONSE_TOO_LARGE", status: response.status, service: SERVICE });
    const text = new TextDecoder().decode(buffer);
    if (text.trim().length === 0) return null;
    try { return JSON.parse(text); } catch { return text; }
}

/** Crea el cliente de administración de Access de una petición (o de la app entera, con `accessToken`). */
export function createAccessAdmin(options: AccessAdminOptions = {}): AccessAdmin {
    const base = options.baseUrl ?? options.platform?.products.access?.baseUrl ?? options.platform?.issuer ?? ACCESS_DEFAULT_BASE_URL;
    const baseUrl = normalizeBaseUrl(base, { allowLoopbackHttp: options.allowLoopbackHttp, allowPrivateHttp: options.allowPrivateHttp, service: SERVICE });
    const timeoutDefault = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = (): typeof fetch => {
        if (options.fetch) return options.fetch;
        if (typeof globalThis.fetch !== "function") throw new CustomySdkError({ code: "SDK_FETCH_REQUIRED", service: SERVICE, message: "No fetch implementation available" });
        return globalThis.fetch;
    };

    async function rawFetch(method: HttpMethod, path: string, call: AccessAdminCallOptions = {}): Promise<Response> {
        const url = buildUrl(baseUrl, path, call.query, SERVICE);
        const headers: Record<string, string> = { accept: "application/json" };
        const put = (source: Readonly<Record<string, string>> | undefined) => { if (source) for (const [name, value] of Object.entries(source)) headers[name.toLowerCase()] = value; };
        put(accessScopeHeaders(options.scope));
        put(accessScopeHeaders(call.scope));
        put(options.headers);
        put(call.headers);
        const cookie = call.cookie ?? (typeof options.cookie === "function" ? await options.cookie() : options.cookie);
        if (cookie && headers.cookie === undefined) headers.cookie = cookie;
        if (call.idempotencyKey) headers["idempotency-key"] = call.idempotencyKey;
        const credential = call.accessToken ?? options.accessToken;
        if (credential !== undefined && headers.authorization === undefined) headers.authorization = `Bearer ${await resolveBearer(credential, SERVICE)}`;
        let body: BodyInit | undefined;
        if (call.body !== undefined && call.body !== null) {
            if (typeof call.body === "string" || call.body instanceof ArrayBuffer || ArrayBuffer.isView(call.body) || (typeof URLSearchParams !== "undefined" && call.body instanceof URLSearchParams)) body = call.body as BodyInit;
            else { body = JSON.stringify(call.body); headers["content-type"] ??= "application/json"; }
        }
        const signal = combineSignals(call.timeoutMs ?? timeoutDefault, call.signal);
        const redirect = call.redirect ?? options.redirect;
        try {
            return await fetchImpl()(url.toString(), {
                method,
                headers,
                ...(body !== undefined ? { body } : {}),
                cache: options.cache ?? "no-store",
                ...(redirect ? { redirect } : {}),
                signal,
            });
        } catch (error) {
            if (error instanceof CustomySdkError) throw error;
            if (call.signal?.aborted) throw fail("SDK_ABORTED", error);
            if (signal.aborted || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))) throw fail("SDK_TIMEOUT", error, 408);
            throw fail("SDK_NETWORK_ERROR", error);
        }
    }

    async function request<T>(method: HttpMethod, path: string, call: AccessAdminCallOptions = {}): Promise<AccessAdminResponse<T>> {
        const response = await rawFetch(method, path, call);
        let body: unknown;
        try { body = await readBody(response, call.maxBytes ?? options.maxResponseBytes ?? DEFAULT_MAX_BYTES); }
        catch (error) {
            if (error instanceof CustomySdkError) throw error;
            throw fail("SDK_RESPONSE_READ_FAILED", error, response.status);
        }
        const envelope = readErrorEnvelope(body);
        return {
            ok: response.ok,
            status: response.status,
            headers: response.headers,
            requestId: response.headers.get("x-request-id") ?? envelope.requestId ?? undefined,
            body: body as T,
        };
    }

    async function json<T>(method: HttpMethod, path: string, call: AccessAdminCallOptions = {}): Promise<T> {
        const response = await request<unknown>(method, path, call);
        if (response.ok) return response.body as T;
        const envelope = readErrorEnvelope(response.body);
        throw new CustomySdkError({
            code: envelope.code ?? `HTTP_${response.status}`,
            status: response.status,
            message: envelope.message,
            service: SERVICE,
            requestId: response.requestId,
            body: response.body,
        });
    }

    const get = <T>(path: string, call?: AccessAdminCallOptions) => json<T>("GET", path, call);

    return {
        baseUrl,
        fetch: rawFetch,
        request,
        json,
        session: (call) => get<AccessSessionPayload | null>("/api/auth/get-session", call),
        deviceSession: (token, call) => json<AccessSessionPayload | null>("POST", "/api/auth/device/session", { ...call, body: { token } }),
        me: (call) => get<AccessAdminMe>("/api/v1/me", call),
        provisioning: {
            status: <T>(input: { workspaceEnvironmentId: string }, call?: AccessAdminCallOptions) =>
                get<T>("/api/workspace/provisioning/status", { ...call, query: { ...call?.query, workspaceEnvironmentId: input.workspaceEnvironmentId } }),
        },
        directory: {
            members: (input, call) => get("/api/v1/directory/members", {
                ...call,
                query: { ...call?.query, environmentId: input.environmentId, ...(input.search ? { search: input.search } : {}), ...(input.limit !== undefined && input.limit !== "" ? { limit: String(input.limit) } : {}) },
            }),
        },
        workspace: {
            theme: <T>(call?: AccessAdminCallOptions) => get<T>("/api/access/v1/ui/theme", call),
            layout: <T>(role: string, call?: AccessAdminCallOptions) => get<T>("/api/access/v1/ui/layout", { ...call, query: { ...call?.query, role } }),
            featureFlags: <T>(call?: AccessAdminCallOptions) => get<T>("/api/access/v1/workspace/feature-flags", call),
            experiments: <T>(call?: AccessAdminCallOptions) => get<T>("/api/access/v1/workspace/experiments", call),
        },
        commercial: createAccessCommercial(
            <T>(method: "GET" | "POST" | "PUT", path: string, call?: AccessAdminCallOptions) => json<T>(method, path, call),
            () => options.scope?.environmentId,
            (message) => fail("SDK_ENVIRONMENT_REQUIRED", new Error(message)),
        ),
        governance: {
            token: (input, call) => json<AccessGovernanceToken>("POST", "/v1/governance/token", {
                ...call,
                body: {
                    session_token: input.sessionToken,
                    organization_id: input.organizationId,
                    environment_id: input.environmentId,
                    project_id: input.projectId,
                },
            }),
        },
    };
}
