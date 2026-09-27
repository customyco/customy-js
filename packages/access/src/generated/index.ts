/**
 * @customyai/access/generated — toda operación pública de Customy Access por
 * su `operationId`, 1:1 con el contrato OpenAPI, sobre el transporte de
 * `@customyai/core`. La fachada (`@customyai/access`) cubre lo habitual; esto
 * cubre el resto.
 *
 * ```ts
 * const api = createAccessApi({ accessToken: process.env.CUSTOMY_ACCESS_API_KEY });
 * const users = await api.call("getEnvEnvIdUsers", { path: { envId } });
 * ```
 */
import { connectProduct, type Query } from "@customyai/core";
import { ACCESS_AUDIENCE, ACCESS_DEFAULT_BASE_URL, type AccessOptions } from "../options";
import { accessCall } from "../errors";
import { ACCESS_OPERATIONS, type AccessOperationId } from "./operations";

export { ACCESS_OPERATIONS, type AccessOperationId } from "./operations";

type Operations = typeof ACCESS_OPERATIONS;

/** Nombres de los `{parámetros}` de una ruta. */
export type PathParamNames<Path extends string> = Path extends `${string}{${infer Name}}${infer Rest}` ? Name | PathParamNames<Rest> : never;

/** Parámetros de ruta de una operación (`{ envId: "…" }`). */
export type AccessOperationPathParams<Id extends AccessOperationId> = { [Name in PathParamNames<Operations[Id]["path"]>]: string | number };

export type AccessOperationRequest<Id extends AccessOperationId> = Readonly<{
    query?: Query;
    body?: unknown;
    headers?: Readonly<Record<string, string>>;
    /**
     * `Idempotency-Key` de un `POST`/`PATCH`: con ella el transporte también lo
     * reintenta. Pásala solo si esa operación la reconoce; sin ella, un `POST`
     * nunca se repite solo.
     */
    idempotencyKey?: string | boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
}> & ([PathParamNames<Operations[Id]["path"]>] extends [never]
    ? { path?: undefined }
    : { path: AccessOperationPathParams<Id> });

type RequestArgs<Id extends AccessOperationId> = [PathParamNames<Operations[Id]["path"]>] extends [never]
    ? [request?: AccessOperationRequest<Id>]
    : [request: AccessOperationRequest<Id>];

export type AccessOperationInfo = Readonly<{ method: string; path: string; query: readonly string[] }>;

/** Rellena una ruta con sus parámetros; falta uno ⇒ error, nunca `{envId}` literal. */
export function expandPath(template: string, params: Readonly<Record<string, string | number>> = {}): string {
    return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined || value === null || String(value).length === 0) throw new TypeError(`missing path parameter ${name}`);
        return encodeURIComponent(String(value));
    });
}

export type CustomyAccessApi = Readonly<{
    baseUrl: string;
    /** Llama a una operación por su `operationId`. */
    call<T = unknown, Id extends AccessOperationId = AccessOperationId>(operationId: Id, ...args: RequestArgs<Id>): Promise<T>;
    /** Método, ruta y parámetros de query de una operación. */
    operation(operationId: AccessOperationId): AccessOperationInfo;
}>;

export function createAccessApi(options: AccessOptions): CustomyAccessApi {
    const { transport, baseUrl } = connectProduct(options, { key: "access", audience: ACCESS_AUDIENCE, defaultBaseUrl: ACCESS_DEFAULT_BASE_URL });
    const operation = (operationId: AccessOperationId): AccessOperationInfo => {
        const entry = ACCESS_OPERATIONS[operationId] as { method: string; path: string; query?: readonly string[] } | undefined;
        if (!entry) throw new TypeError(`unknown Customy Access operation ${String(operationId)}`);
        return { method: entry.method, path: entry.path, query: entry.query ?? [] };
    };
    return {
        baseUrl,
        operation,
        call<T, Id extends AccessOperationId>(operationId: Id, ...args: RequestArgs<Id>): Promise<T> {
            const info = operation(operationId);
            const request = (args[0] ?? {}) as AccessOperationRequest<Id> & { path?: Record<string, string | number> };
            return accessCall(async () => {
                const path = expandPath(info.path, request.path);
                const response = await transport.request<T>(info.method as "GET", path, {
                    query: request.query,
                    body: request.body,
                    headers: request.headers,
                    idempotencyKey: request.idempotencyKey,
                    signal: request.signal,
                    timeoutMs: request.timeoutMs,
                });
                return response.data;
            });
        },
    };
}
