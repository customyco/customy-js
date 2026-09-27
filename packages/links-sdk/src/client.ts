/**
 * CustomyLinks — cliente de la API pública de Customy Links.
 *
 * @deprecated Usa `createLinks` de `@customyai/links`. Esta clase es su
 * adaptador durante un ciclo major: el transporte, los reintentos con
 * `Retry-After` y los tokens de Access son los de `@customyai/core`; aquí se
 * conserva la forma de 0.x (incluido `CustomyLinksError` con `details`).
 *
 *   const links = new CustomyLinks({ apiKey: "cl_live_…" });
 *   const link = await links.links.create({ destinationUrl: "https://…" });
 */
import { CustomySdkError } from "@customyai/core";
import { createLinks, type CustomyLinks as LinksClient } from "@customyai/links";
import { warnDeprecated } from "./deprecation";
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

export { shortUrlOf } from "@customyai/links";

export const DEFAULT_BASE_URL = "https://links.customy.ai";

/** @deprecated `@customyai/links` lanza su `CustomyLinksError` (un `CustomySdkError`); aquí se traduce a esta forma. */
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

/** Códigos de siempre: `NETWORK_ERROR` sin respuesta (o por tiempo), el `code` de la API o `HTTP_<estado>`. */
function toLegacyLinksError(error: unknown): unknown {
  if (error instanceof CustomyLinksError || !(error instanceof CustomySdkError)) return error;
  const network = error.code === "SDK_NETWORK_ERROR" || error.code === "SDK_TIMEOUT";
  const body = error.body && typeof error.body === "object" ? error.body as { details?: unknown } : undefined;
  const legacy = new CustomyLinksError(network ? 0 : error.status, network ? "NETWORK_ERROR" : error.code, error.message, body?.details);
  (legacy as { cause?: unknown }).cause = error;
  return legacy;
}

const clients = new WeakMap<object, LinksClient>();
/** Cliente sin credencial para `/status.json`: 0.x nunca enviaba la llave a la página de estado. */
const publicClients = new WeakMap<object, LinksClient>();

/** @deprecated Usa `createLinks` de `@customyai/links`. */
export class CustomyLinks {
  private readonly baseUrl: string;
  private readonly apiKey: string | (() => Promise<string>);
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;

  constructor(config: CustomyLinksConfig) {
    if (!config?.apiKey) throw new Error("CustomyLinks: apiKey is required (cl_live_…, cl_test_… or an Access token provider)");
    warnDeprecated("@customyai/links-sdk", "use createLinks from @customyai/links.");
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.maxRetries = config.maxRetries ?? 2;
    if (!this.fetchFn) throw new Error("CustomyLinks: no fetch available; pass one in config.fetch");
    const apiKey = this.apiKey;
    const connection = { baseUrl: this.baseUrl, fetch: this.fetchFn, timeoutMs: this.timeoutMs, retry: { maxRetries: this.maxRetries }, allowLoopbackHttp: true };
    clients.set(this, createLinks({ ...connection, accessToken: typeof apiKey === "function" ? () => apiKey() : apiKey }));
    publicClients.set(this, createLinks(connection));
  }

  // ── Enlaces ─────────────────────────────────────────────────────────────
  readonly links = {
    list: (params: ListLinksParams = {}) => this.request<Page<Link>>((c) => c.links.list(params)),
    get: (id: string) => this.request<Link>((c) => c.links.get(id)),
    create: (input: LinkCreate) => this.request<Link>((c) => c.links.create(input)),
    update: (id: string, patch: LinkWritable) => this.request<Link>((c) => c.links.update(id, patch)),
    archive: (id: string) => this.request<Link>((c) => c.links.archive(id)),
    delete: (id: string) => this.request<void>(async (c) => { await c.links.delete(id); }),
    duplicate: (id: string) => this.request<Link>((c) => c.links.duplicate(id)),
    analytics: (id: string, params: AnalyticsParams = {}) => this.request<LinkAnalytics>((c) => c.links.analytics(id, params)),
    conversions: (id: string) => this.request<Conversion[]>((c) => c.links.conversions(id)),
    suggestSlug: (domain?: string) => this.request<{ slug: string; domain: string }>((c) => c.links.suggestSlug(domain)),
    bulkCreate: (links: LinkCreate[]) => this.request<{ created: number; failed: number; results: Array<{ index: number; ok: boolean; link?: Link; error?: string; code?: string }> }>((c) => c.links.bulkCreate(links)),
    bulkUpdate: (input: { ids: string[]; status?: "active" | "archived"; groupId?: string | null; addTagIds?: string[]; removeTagIds?: string[]; expiresAt?: string | null }) =>
      this.request<{ requested: number; updated: number; missing: number }>((c) => c.links.bulkUpdate(input)),
    bulkArchive: (ids: string[]) => this.request<{ requested: number; deleted: number }>((c) => c.links.bulkArchive(ids)),
    importCsv: (csv: string, options: { domain?: string; groupId?: string } = {}) =>
      this.request<{ created: number; failed: number; truncated: boolean; results: Array<{ line: number; ok: boolean; slug?: string; error?: string; code?: string }> }>((c) => c.links.importCsv(csv, options)),
    /** El CSV crudo de clicks de un enlace. */
    exportCsv: (id: string, days = 30) => this.requestText((c) => c.links.exportCsv(id, days)),
  };

  // ── Analítica del workspace ─────────────────────────────────────────────
  readonly analytics = {
    summary: (days = 30) => this.request<Record<string, unknown>>((c) => c.analytics.summary(days)),
    exportCsv: (days = 30) => this.requestText((c) => c.analytics.exportCsv(days)),
  };

  // ── Conversiones ────────────────────────────────────────────────────────
  readonly track = {
    lead: (input: TrackLead) => this.request<Conversion>((c) => c.track.lead(input)),
    sale: (input: TrackSale) => this.request<Conversion>((c) => c.track.sale(input)),
  };

  // ── Dominios ────────────────────────────────────────────────────────────
  readonly domains = {
    list: () => this.request<Domain[]>((c) => c.domains.list()),
    add: (domain: string) => this.request<Domain>((c) => c.domains.add(domain)),
    verify: (id: string) => this.request<Domain>((c) => c.domains.verify(id)),
    setDefault: (id: string) => this.request<Domain>((c) => c.domains.setDefault(id)),
    remove: (id: string) => this.request<void>(async (c) => { await c.domains.remove(id); }),
  };

  // ── Webhooks ────────────────────────────────────────────────────────────
  readonly webhooks = {
    list: () => this.request<{ items: Webhook[]; events: string[] }>((c) => c.webhooks.list()),
    get: (id: string) => this.request<Webhook>((c) => c.webhooks.get(id)),
    create: (input: WebhookCreate) => this.request<Webhook>((c) => c.webhooks.create(input)),
    update: (id: string, patch: WebhookUpdate) => this.request<Webhook>((c) => c.webhooks.update(id, patch)),
    rotateSecret: (id: string) => this.request<Webhook>((c) => c.webhooks.rotateSecret(id)),
    test: (id: string) => this.request<{ queued: boolean }>((c) => c.webhooks.test(id)),
    remove: (id: string) => this.request<void>(async (c) => { await c.webhooks.remove(id); }),
    deliveries: (id: string) => this.request<Record<string, unknown>[]>((c) => c.webhooks.deliveries(id)),
    retryDelivery: (id: string, deliveryId: string) => this.request<{ queued: boolean }>((c) => c.webhooks.retryDelivery(id, deliveryId)),
  };

  // ── Organización ────────────────────────────────────────────────────────
  readonly utmPresets = {
    list: () => this.request<UtmPreset[]>((c) => c.utmPresets.list()),
    create: (input: Omit<UtmPreset, "id">) => this.request<UtmPreset>((c) => c.utmPresets.create(input)),
    update: (id: string, patch: Partial<Omit<UtmPreset, "id">>) => this.request<UtmPreset>((c) => c.utmPresets.update(id, patch)),
    remove: (id: string) => this.request<void>(async (c) => { await c.utmPresets.remove(id); }),
  };
  readonly tags = {
    list: () => this.request<Tag[]>((c) => c.tags.list()),
    create: (input: { name: string; color?: string | null }) => this.request<Tag>((c) => c.tags.create(input)),
    remove: (id: string) => this.request<void>(async (c) => { await c.tags.remove(id); }),
  };
  readonly groups = {
    list: () => this.request<Group[]>((c) => c.groups.list()),
    create: (input: { name: string; description?: string | null }) => this.request<Group>((c) => c.groups.create(input)),
    remove: (id: string) => this.request<void>(async (c) => { await c.groups.remove(id); }),
  };

  /** Estado público del servicio (no requiere llave). */
  status = () => this.request<ServiceStatus>(() => publicClients.get(this)!.status());

  // ── Transporte: el de `@customyai/links`, con los errores de siempre ────
  /** Traduce los errores a `CustomyLinksError`. Los métodos sin cuerpo (204) esperan la llamada y resuelven `undefined`, como en 0.x (`@customyai/links` da `null`). */
  private async request<T>(operation: (client: LinksClient) => Promise<T>): Promise<T> {
    try {
      return await operation(this.send());
    } catch (error) {
      throw toLegacyLinksError(error);
    }
  }

  private async requestText(operation: (client: LinksClient) => Promise<string>): Promise<string> {
    return this.request(operation);
  }

  private send(): LinksClient {
    const client = clients.get(this);
    if (!client) throw new Error("CustomyLinks: client not initialised");
    return client;
  }
}
