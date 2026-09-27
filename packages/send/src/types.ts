/**
 * Tipos del contrato HTTP de Customy Send (`/api/*`), con los nombres de campo
 * de la API.
 */

export type Address = string | { email: string; name?: string };
export type AddressList = Address | Address[];

type SendEmailFields = {
  to: AddressList;
  cc?: AddressList;
  bcc?: AddressList;
  replyTo?: AddressList;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content?: string; path?: string; contentType?: string; contentId?: string }>;
  tags?: Array<{ name: string; value: string }>;
  metadata?: Record<string, string | number | boolean>;
  /** ISO 8601 o relativo («in 1 hour», «tomorrow 9am»). */
  scheduledAt?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
};

/**
 * Un correo. Con `templateId` (id o slug), asunto, cuerpo y remitente salen de
 * la plantilla salvo que se indiquen; sus `{{variables}}`, de `variables`.
 */
export type SendEmailInput =
  | (SendEmailFields & { from: string; subject: string; templateId?: undefined; variables?: undefined })
  | (SendEmailFields & { templateId: string; variables?: Record<string, unknown>; from?: string; subject?: string });

export type EmailStatus = "queued" | "scheduled" | "sending" | "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "failed" | "canceled";

export type Email = {
  id: string;
  status: EmailStatus;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  reply_to: string[];
  subject: string;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  last_event: string | null;
  tags: Array<{ name: string; value: string }>;
  metadata: Record<string, string | number | boolean>;
  recipients?: Array<{ address: string; kind: "to" | "cc" | "bcc"; status: string; smtp_code: string | null; smtp_message: string | null }>;
  html?: string | null;
  text?: string | null;
};

export type EmailEvent = { id: string; type: string; occurred_at: string; recipient_id: string | null; data: Record<string, unknown> };

export type Domain = {
  id: string;
  name: string;
  status: "pending" | "verified" | "failed" | "disabled";
  region: string;
  pool: string;
  /** Desbordamiento a SES cuando el pool compartido toca su tope del día: `verified` = identidad lista. */
  overflow_status?: "none" | "pending" | "verified" | "failed";
  created_at: string;
  verified_at: string | null;
  open_tracking: boolean;
  click_tracking: boolean;
  sending_paused: boolean;
  pause_reason: string | null;
  warmup_completed: boolean;
  rate_limit_per_second: number | null;
  /** Recepción de correo (Inbound): `receiving_status` pasa a `verified` cuando el MX `INBOUND_MX` apunta a Customy. */
  receiving_enabled: boolean;
  receiving_status: "pending" | "verified" | "failed";
  records: Array<{ record: string; type: string; name: string; value: string; priority?: number; status: string; required: boolean }>;
};

export type InboundAddress = { email: string; name: string | null };
export type InboundAttachment = { index: number; filename: string | null; content_type: string; size: number; content_id: string | null; disposition: string };
/** Un correo recibido en un dominio con recepción. `text`, `html` y `headers` sólo vienen en `receiving.get`. */
export type InboundEmail = {
  id: string;
  domain_id: string;
  message_id: string | null;
  from: InboundAddress;
  to: InboundAddress[];
  cc: InboundAddress[];
  reply_to: InboundAddress[];
  subject: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  attachments: InboundAttachment[];
  size_bytes: number;
  received_at: string;
  created_at: string;
};

export type ApiKey = { id: string; name: string; permission: "full" | "sending"; mode: "live" | "test"; domain_id: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null };
export type Webhook = { id: string; url: string; description: string | null; events: string[]; status: "active" | "disabled"; created_at: string; last_delivered_at: string | null; failures_in_row: number };
export type Suppression = { id: string; address: string; reason: string; source_email_id: string | null; note: string | null; created_at: string };
export type List<T> = { data: T[]; has_more?: boolean; next_cursor?: string | null };

export type TemplateVariable = { name: string; default?: string | null; required?: boolean; description?: string | null };
export type Template = {
  id: string;
  name: string;
  /** Único por cuenta; vale como `templateId` al mandar. */
  slug: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  has_html?: boolean;
  has_text?: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  variables: TemplateVariable[];
  variables_used?: string[];
  status: "active" | "archived";
  version: number;
  created_at: string;
  updated_at: string;
};
export type TemplateInput = {
  name?: string;
  slug?: string | null;
  /** Con variables `{{nombre}}`. */
  subject?: string;
  /** `{{x}}` se escapa; `{{{x}}}` va en crudo. */
  html?: string | null;
  text?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  reply_to?: string | null;
  variables?: TemplateVariable[];
  status?: "active" | "archived";
};
export type RenderedTemplate = { template_id: string; version: number; subject: string; html: string | null; text: string | null; from: string | null; reply_to: string | null };
