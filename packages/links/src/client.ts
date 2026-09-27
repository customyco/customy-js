/**
 * Cliente de Customy Links sobre `@customyai/core`: transporte, reintentos con
 * `Retry-After`, idempotencia, paginación y tokens de Access vienen del core;
 * aquí solo está el contrato de Links.
 */
import {
  CustomySdkError,
  connectProduct,
  paginate,
  type CustomySdkErrorOptions,
  type ProductClientOptions,
  type Query,
  type RequestOptions,
} from "@customyai/core";
import type {
  AnalyticsParams,
  Conversion,
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

export const LINKS_DEFAULT_BASE_URL = "https://links.customy.ai";
export const LINKS_AUDIENCE = "customy-links";

/**
 * Scopes de Access para Links: `links:track` (conversiones), `links:read`
 * (leer) y `links:write` (todo). Pide el menor que baste.
 */
export const LINKS_SCOPES = ["links:track", "links:read", "links:write"] as const;
export type LinksScope = (typeof LINKS_SCOPES)[number];

/**
 * Error de Customy Links: un `CustomySdkError` con `service: "links"`; `code` es
 * el de la API (`LINK_NOT_FOUND`, `SLUG_TAKEN`, `INSUFFICIENT_SCOPE`…) o `SDK_*`.
 */
export class CustomyLinksError extends CustomySdkError {
  constructor(options: CustomySdkErrorOptions) {
    super({ ...options, service: "links" });
    this.name = "CustomyLinksError";
  }
}

function toLinksError(error: unknown): unknown {
  if (!(error instanceof CustomySdkError) || error instanceof CustomyLinksError) return error;
  return new CustomyLinksError({
    code: error.code,
    status: error.status,
    message: error.message,
    requestId: error.requestId,
    retryAfterMs: error.retryAfterMs,
    body: error.body,
    cause: error.cause ?? error,
  });
}

export type LinksOptions = ProductClientOptions;

const enc = encodeURIComponent;
type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type CustomyLinks = ReturnType<typeof createLinks>;

/**
 * ```ts
 * const links = createLinks({ platform, machineTokens, scopes: ["links:write"] });
 * const link = await links.links.create({ destinationUrl: "https://example.com" });
 * for await (const item of links.links.iterate({ status: "active" })) { … }
 * ```
 */
export function createLinks(options: LinksOptions) {
  const { transport, baseUrl } = connectProduct(options, { key: "links", audience: LINKS_AUDIENCE, defaultBaseUrl: LINKS_DEFAULT_BASE_URL, credentialOptional: true });

  async function call<T>(method: Method, path: string, request: RequestOptions = {}): Promise<T> {
    if (options.accessToken === undefined && options.machineTokens === undefined && path !== "/status.json") {
      throw new CustomyLinksError({ code: "SDK_CREDENTIALS_REQUIRED", message: "Customy links needs accessToken or machineTokens" });
    }
    try {
      return (await transport.request<T>(method, path, request)).data;
    } catch (error) {
      throw toLinksError(error);
    }
  }
  const q = (params: object): Query => params as Query;
  const text = (path: string, query: Query) => call<unknown>("GET", path, { query, headers: { accept: "text/csv" }, responseType: "text" }).then((body) => (typeof body === "string" ? body : JSON.stringify(body)));
  const listLinks = (params: ListLinksParams = {}) => call<Page<Link>>("GET", "/api/links", { query: q(params) });

  return {
    baseUrl,

    links: {
      list: listLinks,
      /** Recorre todas las páginas (`limit` por página, 100 como máximo). */
      iterate: (params: Omit<ListLinksParams, "page"> = {}, iteration: { signal?: AbortSignal; maxPages?: number } = {}) =>
        paginate<Link>(async (cursor) => {
          const page = await listLinks({ ...params, page: cursor ? Number(cursor) : 1 });
          const more = page.page * page.limit < page.total && page.items.length > 0;
          return { items: page.items, nextCursor: more ? String(page.page + 1) : null };
        }, iteration),
      get: (id: string) => call<Link>("GET", `/api/links/${enc(id)}`),
      /** Un `POST` no se reintenta solo: Links no deduplica por clave de idempotencia. */
      create: (input: LinkCreate) => call<Link>("POST", "/api/links", { body: input }),
      update: (id: string, patch: LinkWritable) => call<Link>("PATCH", `/api/links/${enc(id)}`, { body: patch }),
      archive: (id: string) => call<Link>("POST", `/api/links/${enc(id)}/archive`),
      delete: (id: string) => call<void>("DELETE", `/api/links/${enc(id)}`),
      duplicate: (id: string) => call<Link>("POST", `/api/links/${enc(id)}/duplicate`),
      analytics: (id: string, params: AnalyticsParams = {}) => call<LinkAnalytics>("GET", `/api/links/${enc(id)}/analytics`, { query: q(params) }),
      conversions: (id: string) => call<{ items: Conversion[] }>("GET", `/api/links/${enc(id)}/conversions`).then((r) => r.items),
      suggestSlug: (domain?: string) => call<{ slug: string; domain: string }>("GET", "/api/links/slug/suggest", { query: { domain } }),
      bulkCreate: (links: LinkCreate[]) => call<{ created: number; failed: number; results: Array<{ index: number; ok: boolean; link?: Link; error?: string; code?: string }> }>("POST", "/api/links/bulk", { body: { links } }),
      bulkUpdate: (input: { ids: string[]; status?: "active" | "archived"; groupId?: string | null; addTagIds?: string[]; removeTagIds?: string[]; expiresAt?: string | null }) =>
        call<{ requested: number; updated: number; missing: number }>("PATCH", "/api/links/bulk", { body: input }),
      bulkArchive: (ids: string[]) => call<{ requested: number; deleted: number }>("DELETE", "/api/links/bulk", { body: { ids } }),
      importCsv: (csv: string, params: { domain?: string; groupId?: string } = {}) =>
        call<{ created: number; failed: number; truncated: boolean; results: Array<{ line: number; ok: boolean; slug?: string; error?: string; code?: string }> }>("POST", "/api/links/import", { body: { csv, ...params } }),
      /** El CSV de clicks de un enlace. */
      exportCsv: (id: string, days = 30) => text(`/api/links/${enc(id)}/analytics/export.csv`, { days }),
    },

    analytics: {
      summary: (days = 30) => call<Record<string, unknown>>("GET", "/api/analytics/summary", { query: { days } }),
      exportCsv: (days = 30) => text("/api/analytics/export.csv", { days }),
    },

    /** Conversiones (scope `links:track`). */
    track: {
      lead: (input: TrackLead) => call<Conversion>("POST", "/api/track/lead", { body: input }),
      sale: (input: TrackSale) => call<Conversion>("POST", "/api/track/sale", { body: input }),
    },

    domains: {
      list: () => call<{ items: Domain[] }>("GET", "/api/domains").then((r) => r.items),
      add: (domain: string) => call<Domain>("POST", "/api/domains", { body: { domain } }),
      verify: (id: string) => call<Domain>("POST", `/api/domains/${enc(id)}/verify`),
      setDefault: (id: string) => call<Domain>("POST", `/api/domains/${enc(id)}/default`),
      remove: (id: string) => call<void>("DELETE", `/api/domains/${enc(id)}`),
    },

    webhooks: {
      list: () => call<{ items: Webhook[]; events: string[] }>("GET", "/api/webhooks"),
      get: (id: string) => call<Webhook>("GET", `/api/webhooks/${enc(id)}`),
      create: (input: WebhookCreate) => call<Webhook>("POST", "/api/webhooks", { body: input }),
      update: (id: string, patch: WebhookUpdate) => call<Webhook>("PATCH", `/api/webhooks/${enc(id)}`, { body: patch }),
      rotateSecret: (id: string) => call<Webhook>("POST", `/api/webhooks/${enc(id)}/rotate-secret`),
      test: (id: string) => call<{ queued: boolean }>("POST", `/api/webhooks/${enc(id)}/test`),
      remove: (id: string) => call<void>("DELETE", `/api/webhooks/${enc(id)}`),
      deliveries: (id: string) => call<{ items: Array<Record<string, unknown>> }>("GET", `/api/webhooks/${enc(id)}/deliveries`).then((r) => r.items),
      retryDelivery: (id: string, deliveryId: string) => call<{ queued: boolean }>("POST", `/api/webhooks/${enc(id)}/deliveries/${enc(deliveryId)}/retry`),
    },

    utmPresets: {
      list: () => call<{ items: UtmPreset[] }>("GET", "/api/utm-presets").then((r) => r.items),
      create: (input: Omit<UtmPreset, "id">) => call<UtmPreset>("POST", "/api/utm-presets", { body: input }),
      update: (id: string, patch: Partial<Omit<UtmPreset, "id">>) => call<UtmPreset>("PATCH", `/api/utm-presets/${enc(id)}`, { body: patch }),
      remove: (id: string) => call<void>("DELETE", `/api/utm-presets/${enc(id)}`),
    },
    tags: {
      list: () => call<{ items: Tag[] }>("GET", "/api/tags").then((r) => r.items),
      create: (input: { name: string; color?: string | null }) => call<Tag>("POST", "/api/tags", { body: input }),
      remove: (id: string) => call<void>("DELETE", `/api/tags/${enc(id)}`),
    },
    groups: {
      list: () => call<{ items: Group[] }>("GET", "/api/groups").then((r) => r.items),
      create: (input: { name: string; description?: string | null }) => call<Group>("POST", "/api/groups", { body: input }),
      remove: (id: string) => call<void>("DELETE", `/api/groups/${enc(id)}`),
    },

    /** Estado público del servicio (no necesita credencial). */
    status: () => call<ServiceStatus>("GET", "/status.json"),
  };
}

/** La URL corta de un enlace, tal como la ve el visitante. */
export function shortUrlOf(link: Pick<Link, "domain" | "slug">): string {
  return `https://${link.domain}/${link.slug}`;
}
