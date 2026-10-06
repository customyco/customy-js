/**
 * @customyai/core — la base común de los SDK de Customy.
 *
 * Transporte `fetch`, error tipado, reintentos con `Retry-After`, idempotencia,
 * paginación, discovery del entorno y tokens de máquina. Sin dependencias ni
 * APIs propias de un runtime: funciona en node, edge y navegador.
 */
export { CustomySdkError, isCustomySdkError, readErrorEnvelope, type CustomySdkErrorOptions } from "./errors";
export { normalizeIssuer, normalizeBaseUrl, buildUrl, isPrivateHost, type BaseUrlOptions, type Query, type QueryValue } from "./url";
export {
    DEFAULT_RETRY_POLICY,
    backoffDelay,
    isIdempotentMethod,
    isRetryableStatus,
    parseRetryAfter,
    sleep,
    type RetryPolicy,
} from "./retry";
export { IDEMPOTENCY_HEADER, createIdempotencyKey, isValidIdempotencyKey } from "./idempotency";
export {
    callOptions,
    createTransport,
    type AccessTokenProvider,
    type CallOptions,
    type HttpMethod,
    type RequestBody,
    type RequestOptions,
    type Transport,
    type TransportOptions,
    type TransportResponse,
} from "./transport";
export { collect, paginate, paginatePages, type Page, type PageFetcher, type PaginateOptions } from "./pagination";
export {
    discoverPlatform,
    parsePlatformConfiguration,
    type CustomyPlatformConfiguration,
    type CustomyProductEndpoint,
    type DiscoverOptions,
} from "./discovery";
export {
    ACCESS_APPLICATION_PATH,
    clearApplicationCache,
    discoverApplication,
    parseApplicationScope,
    type CustomyApplication,
    type DiscoverApplicationOptions,
} from "./application";
export {
    createMachineTokenProvider,
    createMachineTokens,
    type MachineTokenProvider,
    type MachineTokenProviderOptions,
    type MachineTokens,
    type MachineTokensOptions,
} from "./machine-token";
export {
    connectProduct,
    resolveBearer,
    type ProductClientOptions,
    type ProductConnection,
    type ProductDescriptor,
} from "./product";
