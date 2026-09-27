/**
 * Conexión de un SDK de producto: URL del servicio y credencial, igual en todos.
 *
 * Tres formas de credencial, de más a menos recomendada:
 *  - `machineTokens` (+ `platform`): la identidad única de la app en Customy
 *    Access. Se piden tokens con la audiencia del producto y los scopes
 *    indicados (o los mínimos del producto), cacheados y renovados solos.
 *  - `accessToken` como proveedor (`() => Promise<string>`), p. ej. un
 *    `createMachineTokenProvider` ya configurado.
 *  - `accessToken` como texto: una llave del producto o un token ya emitido.
 */
import type { CustomyPlatformConfiguration } from "./discovery";
import { CustomySdkError } from "./errors";
import type { MachineTokens } from "./machine-token";
import type { RetryPolicy } from "./retry";
import { createTransport, type AccessTokenProvider, type Transport } from "./transport";

export type ProductClientOptions = Readonly<{
    /** URL del servicio. Por defecto, la del discovery (`platform`) o la pública del producto. */
    baseUrl?: string;
    /** Llave del producto, token de Access o proveedor de tokens. */
    accessToken?: string | AccessTokenProvider;
    /** Tokens de máquina de la app (`createMachineTokens`). */
    machineTokens?: MachineTokens;
    /** Discovery del entorno (`discoverPlatform`): URL y audiencia del producto. */
    platform?: CustomyPlatformConfiguration;
    /** Scopes pedidos con `machineTokens`. Por defecto, los mínimos del producto. */
    scopes?: readonly string[];
    fetch?: typeof fetch;
    /** Límite por intento, en ms. */
    timeoutMs?: number;
    /** Política de reintentos; `false` los desactiva. */
    retry?: RetryPolicy | false;
    headers?: Readonly<Record<string, string>>;
    /** Permite `http://` hacia loopback (desarrollo y tests). */
    allowLoopbackHttp?: boolean;
}>;

export type ProductDescriptor = Readonly<{
    /** Clave del producto en el discovery; es también el `service` de los errores. */
    key: string;
    /** Audiencia por defecto si el discovery no la da (`customy-<clave>`). */
    audience: string;
    /** URL pública por defecto si no se pasa `baseUrl` ni `platform`. */
    defaultBaseUrl?: string;
    /** Scopes con `machineTokens` si no se piden otros; sin ellos, los de la credencial. */
    defaultScopes?: readonly string[];
    /** Credencial opcional (servicios con rutas públicas). */
    credentialOptional?: boolean;
}>;

export type ProductConnection = Readonly<{
    transport: Transport;
    /** URL base normalizada del servicio. */
    baseUrl: string;
    /** Credencial resuelta: texto o proveedor; `undefined` si es opcional y no se dio. */
    credential?: string | AccessTokenProvider;
    fetch: typeof fetch;
}>;

/** Resuelve URL y credencial de un producto y crea su transporte. */
export function connectProduct(options: ProductClientOptions, product: ProductDescriptor): ProductConnection {
    const service = product.key;
    if (options.accessToken !== undefined && options.machineTokens !== undefined) {
        throw new CustomySdkError({ code: "SDK_CREDENTIALS_AMBIGUOUS", service, message: "Pass either accessToken or machineTokens, not both" });
    }
    const discovered = options.platform?.products[product.key];
    let credential: string | AccessTokenProvider | undefined;
    if (options.machineTokens) credential = options.machineTokens.forAudience(discovered?.audience ?? product.audience, options.scopes ?? product.defaultScopes);
    else if (typeof options.accessToken === "function" || (typeof options.accessToken === "string" && options.accessToken.length > 0)) credential = options.accessToken;
    else if (!product.credentialOptional) throw new CustomySdkError({ code: "SDK_CREDENTIALS_REQUIRED", service, message: `Customy ${service} needs accessToken or machineTokens` });
    const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    const transport = createTransport({
        baseUrl: options.baseUrl ?? discovered?.baseUrl ?? product.defaultBaseUrl ?? "",
        service,
        accessToken: credential,
        headers: options.headers,
        fetch: fetchImpl,
        timeoutMs: options.timeoutMs,
        retry: options.retry,
        allowLoopbackHttp: options.allowLoopbackHttp,
    });
    return { transport, baseUrl: transport.baseUrl, credential, fetch: fetchImpl as typeof fetch };
}

/** El token vigente de una credencial (texto o proveedor), con el error tipado si falta. */
export async function resolveBearer(credential: string | AccessTokenProvider | undefined, service?: string): Promise<string> {
    let value: unknown;
    try { value = typeof credential === "function" ? await credential() : credential; }
    catch (error) {
        if (error instanceof CustomySdkError) throw error;
        throw new CustomySdkError({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE", status: 401, service, cause: error });
    }
    if (typeof value !== "string" || value.length === 0) throw new CustomySdkError({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE", status: 401, service });
    return value;
}
