/**
 * CustomyLinks — cliente HTTP tipado de la API pública de Customy Links.
 *
 *   const links = new CustomyLinks({ apiKey: "cl_live_…" });
 *   const link = await links.links.create({ destinationUrl: "https://…" });
 *   await links.track.sale({ externalId: "user_1", amount: 49.9, currency: "USD" });
 *
 * Sin dependencias: sólo `fetch`. Reintenta 429/5xx y fallos de red con
 * espera exponencial (2 reintentos por defecto) y respeta `Retry-After`.
 */
import type {
  AnalyticsParams,
  Conversion,
  CustomyLinksConfig,
  Domain,
  Group,
  Link,
  LinkAnalytics,
  LinkCreate,
  LinkWritable,
  ListLinksParams,
  Page,
  ServiceStatus,
  Tag,
  TrackLead,
  TrackSale,
  UtmPreset,
  Webhook,
  WebhookCreate,
  WebhookUpdate,
} from "./types";

export const DEFAULT_BASE_URL = "https://links.customy.ai";

export class CustomyLinksError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CustomyLinksError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class CustomyLinks {
  private readonly baseUrl: string;
  private readonly apiKey: string | (() => Promise<string>);
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;

  constructor(config: CustomyLinksConfig) {
    if (!config?.apiKey) throw new Error("CustomyLinks: apiKey is required (cl_live_…, cl_test_… or an Access token provider)");
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.maxRetries = config.maxRetries ?? 2;
    if (!this.fetchFn) throw new Error("CustomyLinks: no fetch available; pass one in config.fetch");
  }

  // ── Enlaces ─────────────────────────────────────────────────────────────
  readonly links = {
    list: (params: ListLinksParams = {}) => this.request<Page<Link>>("GET", "/api/links", { query: params }),
    get: (id: string) => this.request<Link>("GET", `/api/links/${enc(id)}`),
    create: (input: LinkCreate) => this.request<Link>("POST", "/api/links", { body: input }),
    update: (id: string, patch: LinkWritable) => this.request<Link>("PATCH", `/api/links/${enc(id)}`, { body: patch }),
    archive: (id: string) => this.request<Link>("POST", `/api/links/${enc(id)}/archive`),
    delete: (id: string) => this.request<void>("DELETE", `/api/links/${enc(id)}`),
    duplicate: (id: string) => this.request<Link>("POST", `/api/links/${enc(id)}/duplicate`),
    analytics: (id: string, params: AnalyticsParams = {}) => this.request<LinkAnalytics>("GET", `/api/links/${enc(id)}/analytics`, { query: params }),
    conversions: (id: string) => this.request<{ items: Conversion[] }>("GET", `/api/links/${enc(id)}/conversions`).then((r) => r.items),
    suggestSlug: (domain?: string) => this.request<{ slug: string; domain: string }>("GET", "/api/links/slug/suggest", { query: { domain } }),
    bulkCreate: (links: LinkCreate[]) => this.request<{ created: number; failed: number; results: Array<{ index: number; ok: boolean; link?: Link; error?: string; code?: string }> }>("POST", "/api/links/bulk", { body: { links } }),
    bulkUpdate: (input: { ids: string[]; status?: "active" | "archived"; groupId?: string | null; addTagIds?: string[]; removeTagIds?: string[]; expiresAt?: string | null }) =>
      this.request<{ requested: number; updated: number; missing: number }>("PATCH", "/api/links/bulk", { body: input }),
    bulkArchive: (ids: string[]) => this.request<{ requested: number; deleted: number }>("DELETE", "/api/links/bulk", { body: { ids } }),
    importCsv: (csv: string, options: { domain?: string; groupId?: string } = {}) =>
      this.request<{ created: number; failed: number; truncated: boolean; results: Array<{ line: number; ok: boolean; slug?: string; error?: string; code?: string }> }>("POST", "/api/links/import", { body: { csv, ...options } }),
    /** El CSV crudo de clicks de un enlace. */
    exportCsv: (id: string, days = 30) => this.requestText("GET", `/api/links/${enc(id)}/analytics/export.csv`, { query: { days } }),
  };

  // ── Analítica del workspace ─────────────────────────────────────────────
  readonly analytics = {
    summary: (days = 30) => this.request<Record<string, unknown>>("GET", "/api/analytics/summary", { query: { days } }),
    exportCsv: (days = 30) => this.requestText("GET", "/api/analytics/export.csv", { query: { days } }),
  };

  // ── Conversiones ────────────────────────────────────────────────────────
  readonly track = {
    lead: (input: TrackLead) => this.request<Conversion>("POST", "/api/track/lead", { body: input }),
    sale: (input: TrackSale) => this.request<Conversion>("POST", "/api/track/sale", { body: input }),
  };

  // ── Dominios ────────────────────────────────────────────────────────────
  readonly domains = {
    list: () => this.request<{ items: Domain[] }>("GET", "/api/domains").then((r) => r.items),
    add: (domain: string) => this.request<Domain>("POST", "/api/domains", { body: { domain } }),
    verify: (id: string) => this.request<Domain>("POST", `/api/domains/${enc(id)}/verify`),
    setDefault: (id: string) => this.request<Domain>("POST", `/api/domains/${enc(id)}/default`),
    remove: (id: string) => this.request<void>("DELETE", `/api/domains/${enc(id)}`),
  };

  // ── Webhooks ────────────────────────────────────────────────────────────
  readonly webhooks = {
    list: () => this.request<{ items: Webhook[]; events: string[] }>("GET", "/api/webhooks"),
    get: (id: string) => this.request<Webhook>("GET", `/api/webhooks/${enc(id)}`),
    create: (input: WebhookCreate) => this.request<Webhook>("POST", "/api/webhooks", { body: input }),
    update: (id: string, patch: WebhookUpdate) => this.request<Webhook>("PATCH", `/api/webhooks/${enc(id)}`, { body: patch }),
    rotateSecret: (id: string) => this.request<Webhook>("POST", `/api/webhooks/${enc(id)}/rotate-secret`),
    test: (id: string) => this.request<{ queued: boolean }>("POST", `/api/webhooks/${enc(id)}/test`),
    remove: (id: string) => this.request<void>("DELETE", `/api/webhooks/${enc(id)}`),
    deliveries: (id: string) => this.request<{ items: Array<Record<string, unknown>> }>("GET", `/api/webhooks/${enc(id)}/deliveries`).then((r) => r.items),
    retryDelivery: (id: string, deliveryId: string) => this.request<{ queued: boolean }>("POST", `/api/webhooks/${enc(id)}/deliveries/${enc(deliveryId)}/retry`),
  };

  // ── Organización ────────────────────────────────────────────────────────
  readonly utmPresets = {
    list: () => this.request<{ items: UtmPreset[] }>("GET", "/api/utm-presets").then((r) => r.items),
    create: (input: Omit<UtmPreset, "id">) => this.request<UtmPreset>("POST", "/api/utm-presets", { body: input }),
    update: (id: string, patch: Partial<Omit<UtmPreset, "id">>) => this.request<UtmPreset>("PATCH", `/api/utm-presets/${enc(id)}`, { body: patch }),
    remove: (id: string) => this.request<void>("DELETE", `/api/utm-presets/${enc(id)}`),
  };
  readonly tags = {
    list: () => this.request<{ items: Tag[] }>("GET", "/api/tags").then((r) => r.items),
    create: (input: { name: string; color?: string | null }) => this.request<Tag>("POST", "/api/tags", { body: input }),
    remove: (id: string) => this.request<void>("DELETE", `/api/tags/${enc(id)}`),
  };
  readonly groups = {
    list: () => this.request<{ items: Group[] }>("GET", "/api/groups").then((r) => r.items),
    create: (input: { name: string; description?: string | null }) => this.request<Group>("POST", "/api/groups", { body: input }),
    remove: (id: string) => this.request<void>("DELETE", `/api/groups/${enc(id)}`),
  };

  /** Estado público del servicio (no requiere llave). */
  status = () => this.request<ServiceStatus>("GET", "/status.json", { auth: false });

  // ── Transporte ──────────────────────────────────────────────────────────
  private async request<T>(method: string, path: string, options: { query?: Query; body?: unknown; auth?: boolean } = {}): Promise<T> {
    const res = await this.send(method, path, options);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async requestText(method: string, path: string, options: { query?: Query } = {}): Promise<string> {
    const res = await this.send(method, path, options);
    return res.text();
  }

  private async send(method: string, path: string, options: { query?: Query; body?: unknown; auth?: boolean }): Promise<Response> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { accept: "application/json", "user-agent": "customyai-links-sdk/0.1.0" };
    if (options.auth !== false) headers.authorization = `Bearer ${typeof this.apiKey === "function" ? await this.apiKey() : this.apiKey}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response | null = null;
      let networkError: unknown = null;
      try {
        res = await this.fetchFn(url.toString(), { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal });
      } catch (err) {
        networkError = err;
      } finally {
        clearTimeout(timer);
      }
      const retryable = networkError !== null || (res !== null && (res.status === 429 || res.status >= 500));
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = res ? Number(res.headers.get("retry-after")) : NaN;
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 300 * 2 ** attempt;
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (networkError !== null || res === null) {
        throw new CustomyLinksError(0, "NETWORK_ERROR", networkError instanceof Error ? networkError.message : "network error");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; message?: string; details?: unknown };
        throw new CustomyLinksError(res.status, body.code ?? `HTTP_${res.status}`, body.message ?? body.error ?? `HTTP ${res.status}`, body.details);
      }
      return res;
    }
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** La URL corta de un enlace, tal como la ve el visitante. */
export function shortUrlOf(link: Pick<Link, "domain" | "slug">): string {
  return `https://${link.domain}/${link.slug}`;
}
