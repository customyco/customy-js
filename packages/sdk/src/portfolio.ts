/**
 * Product/service SDK boundary for the Customy portfolio.
 *
 * This layer deliberately owns transport, auth and tenant-safe URL handling
 * only. Domain methods belong in the SDK for the corresponding bounded
 * context once that service publishes its OpenAPI contract.
 */

export const CUSTOMY_PRODUCT_KEYS = [
  "agent", "ads", "analytics", "atlas", "bookings", "campaigns", "commerce", "content", "crm", "data", "design", "domains", "engagement", "flows", "forms", "links", "mission-control", "pages", "payments", "send", "sitesight", "support", "tables", "tasks", "voice", "whatsapp", "work",
] as const;

export const CUSTOMY_PLATFORM_SERVICE_KEYS = [
  "access", "audit", "billing", "events", "integrations", "realtime", "scheduler", "storage",
] as const;

export type CustomyProductKey = (typeof CUSTOMY_PRODUCT_KEYS)[number];
export type CustomyPlatformServiceKey = (typeof CUSTOMY_PLATFORM_SERVICE_KEYS)[number];
export type CustomySdkKey = CustomyProductKey | CustomyPlatformServiceKey;
export type CustomyHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type CustomyQuery = Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>>;
export type CustomySdkRequestOptions = {
  query?: CustomyQuery;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
};
export type CustomySdkConfig = {
  /** Shared fallback URL. Prefer `baseUrls` for multi-service applications. */
  baseUrl?: string;
  baseUrls?: Partial<Record<CustomySdkKey, string>>;
  apiKey?: string;
  bearerToken?: string;
  /**
   * Proveedor de tokens de Customy Access (p. ej. `createMachineTokenProvider`
   * de `@customyai/customy-access/server`); se pide un token vigente por request.
   */
  accessToken?: () => Promise<string>;
  internalKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export class CustomySdkError extends Error {
  constructor(readonly product: CustomySdkKey, readonly status: number, readonly code: string, readonly body?: unknown) {
    super(`Customy ${product} SDK request failed (${status}): ${code}`);
    this.name = "CustomySdkError";
  }
}

function normalizeBaseUrl(value: string | undefined, product: CustomySdkKey, allowLoopbackHttp = false): string {
  if (!value) throw new CustomySdkError(product, 0, "SDK_BASE_URL_REQUIRED");
  let url: URL;
  try { url = new URL(value); } catch { throw new CustomySdkError(product, 0, "SDK_BASE_URL_INVALID"); }
  // Production's private service mesh uses explicit `customy-*` DNS names
  // over HTTP inside the remote network. Keep public origins HTTPS-only while
  // allowing this narrowly bounded internal form; localhost, IP literals and
  // arbitrary HTTP hosts remain invalid.
  const internalHttp = url.protocol === "http:"
    && /^customy-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(url.hostname)
    && (!url.port || /^[0-9]{1,5}$/.test(url.port));
  const loopbackHttp = allowLoopbackHttp && url.protocol === "http:"
    && (url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    && (!url.port || /^[0-9]{1,5}$/.test(url.port));
  if ((!internalHttp && !loopbackHttp && url.protocol !== "https:") || url.username || url.password || url.search || url.hash)
    throw new CustomySdkError(product, 0, "SDK_BASE_URL_INVALID");
  return url.toString().replace(/\/$/, "");
}

function buildUrl(baseUrl: string, path: string, query: CustomyQuery | undefined, product: CustomySdkKey): URL {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) throw new CustomySdkError(product, 0, "SDK_PATH_INVALID");
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
    else url.searchParams.set(key, String(value));
  }
  return url;
}

async function readBody(response: Response, maxBytes: number): Promise<unknown> {
  if (response.status === 204) return null;
  let text: string;
  try { text = await response.text(); }
  catch { throw new Error("SDK_RESPONSE_READ_FAILED"); }
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("SDK_RESPONSE_TOO_LARGE");
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

/** One isolated client for one Customy bounded context. */
export class CustomyProductClient {
  readonly product: CustomySdkKey;
  private readonly configuredBaseUrl?: string;
  private readonly config: CustomySdkConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(product: CustomySdkKey, config: CustomySdkConfig) {
    this.product = product;
    this.config = config;
    this.configuredBaseUrl = config.baseUrls?.[product] ?? config.baseUrl;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new CustomySdkError(product, 0, "SDK_FETCH_REQUIRED");
  }

  get baseUrl(): string {
    return normalizeBaseUrl(this.configuredBaseUrl, this.product, Boolean(this.config.fetch));
  }

  async request<TResponse = unknown>(method: CustomyHttpMethod, path: string, options: CustomySdkRequestOptions = {}): Promise<TResponse> {
    const url = buildUrl(this.baseUrl, path, options.query, this.product);
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.timeoutMs ?? 30_000);
    const headers: Record<string, string> = { accept: "application/json", ...this.config.headers, ...options.headers };
    if (options.body !== undefined) headers["content-type"] ??= "application/json";
    if (this.config.apiKey || this.config.bearerToken) headers.authorization ??= `Bearer ${this.config.bearerToken ?? this.config.apiKey}`;
    if (this.config.internalKey) headers["x-internal-key"] ??= this.config.internalKey;
    try {
      if (this.config.accessToken && !headers.authorization) {
        try { headers.authorization = `Bearer ${await this.config.accessToken()}`; }
        catch { throw new CustomySdkError(this.product, 401, "SDK_ACCESS_TOKEN_UNAVAILABLE"); }
      }
      const response = await this.fetchImpl(url, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store", credentials: "omit", redirect: "error", signal });
      let body: unknown;
      try { body = await readBody(response, options.maxBytes ?? 4 * 1024 * 1024); }
      catch (error) {
        if (error instanceof Error && error.message === "SDK_RESPONSE_TOO_LARGE") throw new CustomySdkError(this.product, 413, "SDK_RESPONSE_TOO_LARGE");
        if (error instanceof Error && error.message === "SDK_RESPONSE_READ_FAILED") throw new CustomySdkError(this.product, 503, "SDK_RESPONSE_READ_FAILED");
        throw new CustomySdkError(this.product, 502, "SDK_RESPONSE_INVALID");
      }
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : `HTTP_${response.status}`;
        throw new CustomySdkError(this.product, response.status, code, body);
      }
      return body as TResponse;
    } catch (error) {
      if (error instanceof CustomySdkError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new CustomySdkError(this.product, 408, "SDK_TIMEOUT");
      throw new CustomySdkError(this.product, 503, "SDK_UNAVAILABLE");
    } finally { clearTimeout(timeout); }
  }

  get<TResponse = unknown>(path: string, options?: Omit<CustomySdkRequestOptions, "body">) { return this.request<TResponse>("GET", path, options); }
  post<TResponse = unknown>(path: string, body?: unknown, options?: Omit<CustomySdkRequestOptions, "body">) { return this.request<TResponse>("POST", path, { ...options, body }); }
  put<TResponse = unknown>(path: string, body?: unknown, options?: Omit<CustomySdkRequestOptions, "body">) { return this.request<TResponse>("PUT", path, { ...options, body }); }
  patch<TResponse = unknown>(path: string, body?: unknown, options?: Omit<CustomySdkRequestOptions, "body">) { return this.request<TResponse>("PATCH", path, { ...options, body }); }
  delete<TResponse = unknown>(path: string, options?: Omit<CustomySdkRequestOptions, "body">) { return this.request<TResponse>("DELETE", path, options); }
}

export type CustomyProductClients = { [K in CustomySdkKey]: CustomyProductClient };

/** One install with isolated clients for every Customy product and platform service. */
export class CustomyPortfolioSdk {
  readonly clients: CustomyProductClients;
  readonly products: { [K in CustomyProductKey]: CustomyProductClient };
  readonly platform: { [K in CustomyPlatformServiceKey]: CustomyProductClient };

  constructor(config: CustomySdkConfig) {
    const keys = [...CUSTOMY_PRODUCT_KEYS, ...CUSTOMY_PLATFORM_SERVICE_KEYS] as CustomySdkKey[];
    this.clients = Object.fromEntries(keys.map((key) => [key, new CustomyProductClient(key, config)])) as CustomyProductClients;
    this.products = Object.fromEntries(CUSTOMY_PRODUCT_KEYS.map((key) => [key, this.clients[key]])) as CustomyPortfolioSdk["products"];
    this.platform = Object.fromEntries(CUSTOMY_PLATFORM_SERVICE_KEYS.map((key) => [key, this.clients[key]])) as CustomyPortfolioSdk["platform"];
  }

  product<K extends CustomyProductKey>(key: K): CustomyProductClient { return this.products[key]; }
  service<K extends CustomyPlatformServiceKey>(key: K): CustomyProductClient { return this.platform[key]; }
}

export const createCustomySdk = (config: CustomySdkConfig): CustomyPortfolioSdk => new CustomyPortfolioSdk(config);
