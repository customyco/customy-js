/**
 * Tipos públicos del SDK de Customy Links. Reflejan el documento OpenAPI
 * que sirve el servicio en `/openapi.json`; si algo cambia allí, cambia aquí.
 */

export type RedirectCode = 301 | 302 | 307 | 308;

export type Link = {
  id: string;
  slug: string;
  domain: string;
  domainId: string | null;
  destinationUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  status: "active" | "archived" | "expired";
  redirectCode: RedirectCode;
  startsAt: string | null;
  expiresAt: string | null;
  expirationUrl: string | null;
  clickLimit: number | null;
  clickLimitUrl: string | null;
  hasPassword: boolean;
  hasTargetingRules: boolean;
  deepLinkConfig: { ios?: string | null; android?: string | null; fallbackUrl?: string | null } | null;
  retargetingPixels: Array<{ provider: string; pixelId?: string | null }> | null;
  utmPresetId: string | null;
  conversionTracking: boolean;
  abVariants: Array<{ id: string; url: string; weight: number }> | null;
  abTestEndsAt: string | null;
  groupId: string | null;
  tagIds?: string[];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  totalClicks: number;
  uniqueClicks: number;
  lastClickAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkWritable = {
  destinationUrl?: string;
  slug?: string;
  domain?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  redirectCode?: RedirectCode;
  startsAt?: string | null;
  expiresAt?: string | null;
  expirationUrl?: string | null;
  clickLimit?: number | null;
  password?: string | null;
  conversionTracking?: boolean;
  abVariants?: Array<{ id?: string; url: string; weight?: number }> | null;
  abTestEndsAt?: string | null;
  groupId?: string | null;
  tagIds?: string[];
  utmPresetId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  deepLinkConfig?: { ios?: string | null; android?: string | null; fallbackUrl?: string | null } | null;
};

export type LinkCreate = LinkWritable & { destinationUrl: string };

export type ListLinksParams = {
  search?: string;
  status?: "active" | "archived" | "expired";
  groupId?: string;
  tagId?: string;
  /** Desde 1. */
  page?: number;
  /** Máximo 100. */
  limit?: number;
};

export type Page<T> = { items: T[]; total: number; page: number; limit: number };

export type Breakdown = { key: string; count: number };
export type TimeseriesPoint = { date: string; clicks: number; unique: number };

export type LinkAnalytics = {
  window: { days: number; interval: "hour" | "day" };
  totalClicks: number;
  uniqueClicks: number;
  botClicks: number;
  previous: { totalClicks: number; uniqueClicks: number };
  timeseries: TimeseriesPoint[];
  byDevice: Breakdown[];
  byBrowser: Breakdown[];
  byOs: Breakdown[];
  byCountry: Breakdown[];
  byCity: Breakdown[];
  byReferrer: Breakdown[];
  bySource: Breakdown[];
  byUtmSource: Breakdown[];
  byUtmMedium: Breakdown[];
  byUtmCampaign: Breakdown[];
  byQueryParam: Breakdown[];
  byBotReason: Breakdown[];
  conversions: { leads: number; sales: number; revenueCents: number; currency: string; leadRate: number; saleRate: number };
  variants: Array<{ variantId: string; clicks: number; unique: number; leads: number; sales: number; revenueCents: number }>;
};

export type AnalyticsParams = { days?: number; interval?: "hour" | "day" };

export type Conversion = {
  id: string;
  linkId: string;
  clickId: string | null;
  variantId: string | null;
  eventType: "lead" | "sale";
  eventName: string | null;
  externalId: string | null;
  amountCents: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
};

export type TrackLead = {
  clickId?: string;
  externalId?: string;
  eventName?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
};

export type TrackSale = TrackLead & {
  /** Importe en la unidad mayor (12.99), no en céntimos. */
  amount: number;
  currency?: string;
};

export type Domain = {
  id: string;
  domain: string;
  isDefault: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckError: string | null;
};

export type WebhookEventType =
  | "link.created"
  | "link.updated"
  | "link.archived"
  | "link.clicked"
  | "link.click_limit_reached"
  | "link.expired"
  | "conversion.lead"
  | "conversion.sale"
  | "domain.verified";

export type Webhook = {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  linkIds: string[];
  status: "active" | "disabled";
  failuresInRow: number;
  lastDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Sólo al crear y al rotar. */
  secret?: string;
};

export type WebhookCreate = { url: string; events: WebhookEventType[]; description?: string | null; linkIds?: string[] };
export type WebhookUpdate = Partial<WebhookCreate> & { status?: "active" | "disabled" };

export type WebhookEvent<T = Record<string, unknown>> = {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  data: T;
};

export type UtmPreset = {
  id: string;
  name: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
};

export type Tag = { id: string; name: string; color: string | null };
export type Group = { id: string; name: string; description: string | null };

export type ServiceStatus = {
  status: "operational" | "degraded" | "down" | "unknown";
  updatedAt: string;
  sloTarget: number;
  uptime: { "24h": number | null; "7d": number | null; "30d": number | null; "90d": number | null };
  latency: { p50Ms: number | null; p95Ms: number | null; dbMs: number | null };
  components: { redirects: string; api: string; database: string; cache: string };
  incidents: Array<{ startedAt: string; endedAt: string | null; minutes: number }>;
};

export type CustomyLinksConfig = {
  /**
   * `cl_live_…` o `cl_test_…`, o una función que devuelve un token de máquina
   * de Customy Access con audiencia `customy-links` (la identidad única de la
   * app: `createMachineTokenProvider` de `@customyai/customy-access/server`).
   */
  apiKey: string | (() => Promise<string>);
  /** Por defecto `https://links.customy.ai`. */
  baseUrl?: string;
  /** ms; 15 000 por defecto. */
  timeoutMs?: number;
  /** Para inyectar un fetch propio (pruebas, proxies). */
  fetch?: typeof fetch;
  /** Reintentos ante 429/5xx/red; 2 por defecto, con espera exponencial. */
  maxRetries?: number;
};
