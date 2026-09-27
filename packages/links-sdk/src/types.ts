/** Tipos de la API de Customy Links: los de `@customyai/links`, con los mismos nombres. */
export type {
  RedirectCode,
  Link,
  LinkWritable,
  LinkCreate,
  ListLinksParams,
  Page,
  Breakdown,
  TimeseriesPoint,
  LinkAnalytics,
  AnalyticsParams,
  Conversion,
  TrackLead,
  TrackSale,
  Domain,
  WebhookEventType,
  Webhook,
  WebhookCreate,
  WebhookUpdate,
  WebhookEvent,
  UtmPreset,
  Tag,
  Group,
  ServiceStatus,
} from "@customyai/links";

export type CustomyLinksConfig = {
  /**
   * `cl_live_…` o `cl_test_…`, o una función que devuelve un token de máquina
   * de Customy Access con audiencia `customy-links` (la identidad única de la
   * app: `createMachineTokens` de `@customyai/core`).
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
