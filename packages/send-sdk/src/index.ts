/**
 * @customyai/send-sdk — el cliente de Customy Send.
 *
 *   import { CustomySend } from "@customyai/send-sdk";
 *   const send = new CustomySend("cs_live_…");
 *   const { id } = await send.emails.send({ from: "Acme <hola@acme.com>", to: "ana@x.com", subject: "Hola", html: "<p>…</p>" });
 *
 * Misma forma que Resend a propósito (`emails.send`, `emails.batch`,
 * `domains`, `apiKeys`, `webhooks`), para que cambiar de proveedor sea
 * cambiar el import. Sin dependencias: `fetch` global (Node 18+, Deno, Bun,
 * navegadores no —la llave es secreta—). Los errores de la API llegan como
 * `CustomySendError` con `status`, `code` (`validation_error`,
 * `daily_quota_exceeded`, `domain_not_verified`…) y `retryAfterMs` en los 429.
 */

export type Address = string | { email: string; name?: string };
export type AddressList = Address | Address[];

export type SendEmailInput = {
  from: string;
  to: AddressList;
  cc?: AddressList;
  bcc?: AddressList;
  replyTo?: AddressList;
  subject: string;
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

export type CustomySendOptions = {
  /** Por defecto https://send-api.customy.ai */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Reintentos ante 429/5xx/red (respetan `retry-after`). Por defecto 2. */
  maxRetries?: number;
};

export class CustomySendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs: number | null;
  readonly body: unknown;
  constructor(status: number, code: string, message: string, body: unknown, retryAfterMs: number | null = null) {
    super(message);
    this.name = "CustomySendError";
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

type Json = Record<string, unknown> | unknown[];

function toWire(input: SendEmailInput): Record<string, unknown> {
  const { replyTo, scheduledAt, trackOpens, trackClicks, ...rest } = input;
  return {
    ...rest,
    ...(replyTo !== undefined ? { reply_to: replyTo } : {}),
    ...(scheduledAt !== undefined ? { scheduled_at: scheduledAt } : {}),
    ...(trackOpens !== undefined ? { track_opens: trackOpens } : {}),
    ...(trackClicks !== undefined ? { track_clicks: trackClicks } : {}),
  };
}

/**
 * Credencial de Send: una llave `cs_live_…`/`cs_test_…`, o una función que
 * devuelve un token de máquina de Customy Access con audiencia `customy-send`
 * (p. ej. `createMachineTokenProvider` de `@customyai/customy-access/server`):
 * la identidad única de la app para todo el ecosistema.
 */
export type CustomySendCredential = string | (() => Promise<string>);

export class CustomySend {
  private readonly credential: CustomySendCredential;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(credential: CustomySendCredential, options: CustomySendOptions = {}) {
    if (typeof credential !== "function" && (!credential || !/^cs_(live|test)_/.test(credential))) {
      throw new Error("CustomySend: hace falta una llave cs_live_… o cs_test_…, o un proveedor de tokens de Customy Access");
    }
    this.credential = credential;
    this.baseUrl = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private async bearer(): Promise<string> {
    return typeof this.credential === "function" ? this.credential() : this.credential;
  }

  async request<T>(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<T> {
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: { authorization: `Bearer ${await this.bearer()}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt < this.maxRetries) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
          continue;
        }
        throw new CustomySendError(0, "network_error", (error as Error).message, null);
      }
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }
      const text = await res.text();
      let parsed: { name?: string; message?: string; statusCode?: number } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        parsed = { message: text.slice(0, 300) };
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
      // Sólo se reintenta lo que puede salir bien la segunda vez: ritmo y caídas.
      const retriable = res.status === 429 ? parsed.name === "rate_limit_exceeded" : res.status >= 500;
      // Un POST sin Idempotency-Key no se repite: podría mandar el correo dos veces.
      const safeToRepeat = method !== "POST" || Boolean(headers["idempotency-key"]);
      if (retriable && safeToRepeat && attempt < this.maxRetries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, retryAfterMs ?? 250 * 2 ** attempt));
        continue;
      }
      throw new CustomySendError(res.status, parsed.name ?? `http_${res.status}`, parsed.message ?? res.statusText, parsed, retryAfterMs);
    }
  }

  /** Un GET que devuelve bytes (adjuntos, .eml). Sin reintentos: es idempotente pero el cuerpo puede ser grande. */
  async requestBinary(path: string): Promise<{ content: Uint8Array; contentType: string; filename: string | null }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, { method: "GET", headers: { authorization: `Bearer ${await this.bearer()}` }, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new CustomySendError(0, "network_error", (error as Error).message, null);
    }
    if (!res.ok) {
      const text = await res.text();
      let parsed: { name?: string; message?: string } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        parsed = { message: text.slice(0, 300) };
      }
      throw new CustomySendError(res.status, parsed.name ?? `http_${res.status}`, parsed.message ?? res.statusText, parsed);
    }
    const filename = /filename="([^"]*)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? null;
    return { content: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream", filename };
  }

  readonly emails = {
    /** Un correo. Pasa `idempotencyKey` para poder reintentar sin duplicar. */
    send: (input: SendEmailInput, options: { idempotencyKey?: string } = {}): Promise<Email> =>
      this.request("POST", "/api/emails", toWire(input), options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    /** Hasta 100 correos en una llamada; cada uno se acepta o rechaza por separado. */
    batch: (inputs: SendEmailInput[]): Promise<{ data: Array<{ id: string } | { error: { name: string; message: string } }> }> =>
      this.request("POST", "/api/emails/batch", inputs.map(toWire)),
    get: (id: string, options: { body?: boolean } = {}): Promise<Email> => this.request("GET", `/api/emails/${encodeURIComponent(id)}${options.body ? "?body=1" : ""}`),
    list: (params: { limit?: number; cursor?: string; status?: EmailStatus; to?: string; from?: string } = {}): Promise<List<Email>> => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return this.request("GET", `/api/emails${q.toString() ? `?${q}` : ""}`);
    },
    events: (id: string): Promise<List<EmailEvent>> => this.request("GET", `/api/emails/${encodeURIComponent(id)}/events`),
    cancel: (id: string): Promise<Email> => this.request("POST", `/api/emails/${encodeURIComponent(id)}/cancel`),
    reschedule: (id: string, scheduledAt: string): Promise<Email> => this.request("PATCH", `/api/emails/${encodeURIComponent(id)}`, { scheduled_at: scheduledAt }),
    /** Correo recibido (Inbound) en los dominios con `domains.setReceiving(id, true)`. */
    receiving: {
      list: (params: { limit?: number; cursor?: string; domain_id?: string; search?: string } = {}): Promise<List<InboundEmail>> => {
        const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
        return this.request("GET", `/api/emails/receiving${q.toString() ? `?${q}` : ""}`);
      },
      get: (id: string): Promise<InboundEmail> => this.request("GET", `/api/emails/receiving/${encodeURIComponent(id)}`),
      /** El adjunto `index` como bytes, con su content-type. */
      attachment: (id: string, index: number): Promise<{ content: Uint8Array; contentType: string; filename: string | null }> =>
        this.requestBinary(`/api/emails/receiving/${encodeURIComponent(id)}/attachments/${index}`),
      /** El mensaje original (.eml). */
      raw: (id: string): Promise<Uint8Array> => this.requestBinary(`/api/emails/receiving/${encodeURIComponent(id)}/raw`).then((r) => r.content),
      remove: (id: string): Promise<{ id: string; deleted: boolean }> => this.request("DELETE", `/api/emails/receiving/${encodeURIComponent(id)}`),
    },
  };

  readonly domains = {
    /** `pool`: `shared` (por defecto) o `ses`; un dominio en `ses` no pide DNS extra (SES verifica el mismo TXT DKIM). */
    create: (name: string, options: { region?: string; pool?: string } = {}): Promise<Domain> => this.request("POST", "/api/domains", { name, ...options }),
    list: (): Promise<List<Domain>> => this.request("GET", "/api/domains"),
    get: (id: string): Promise<Domain> => this.request("GET", `/api/domains/${encodeURIComponent(id)}`),
    verify: (id: string): Promise<Domain> => this.request("POST", `/api/domains/${encodeURIComponent(id)}/verify`),
    /** Rotación de DKIM: publica el TXT `DKIM_NEXT` que devuelve y llama a `verify`. */
    rotateDkim: (id: string): Promise<Domain> => this.request("POST", `/api/domains/${encodeURIComponent(id)}/dkim/rotate`),
    update: (id: string, patch: { open_tracking?: boolean; click_tracking?: boolean; sending_paused?: boolean; pause_reason?: string; rate_limit_per_second?: number | null; pool?: string }): Promise<Domain> =>
      this.request("PATCH", `/api/domains/${encodeURIComponent(id)}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.request("DELETE", `/api/domains/${encodeURIComponent(id)}`),
    /** Recibir correo en el dominio: publica el MX `INBOUND_MX` que devuelve; cada mensaje llega como webhook `email.received` y en `emails.receiving`. */
    setReceiving: (id: string, enabled: boolean): Promise<Domain> => this.request("POST", `/api/domains/${encodeURIComponent(id)}/receiving`, { enabled }),
  };

  readonly apiKeys = {
    /** `mode: "test"` crea una llave `cs_test_…`: sandbox, nada sale al MTA. */
    create: (input: { name: string; permission?: "full" | "sending"; mode?: "live" | "test"; domain_id?: string | null }): Promise<ApiKey & { token: string }> => this.request("POST", "/api/api-keys", input),
    list: (): Promise<List<ApiKey>> => this.request("GET", "/api/api-keys"),
    revoke: (id: string): Promise<{ id: string }> => this.request("DELETE", `/api/api-keys/${encodeURIComponent(id)}`),
  };

  readonly webhooks = {
    create: (input: { url: string; events?: string[]; description?: string }): Promise<Webhook & { secret: string }> => this.request("POST", "/api/webhooks", input),
    list: (): Promise<List<Webhook>> => this.request("GET", "/api/webhooks"),
    update: (id: string, patch: { url?: string; events?: string[]; description?: string; status?: "active" | "disabled" }): Promise<Webhook> => this.request("PATCH", `/api/webhooks/${encodeURIComponent(id)}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.request("DELETE", `/api/webhooks/${encodeURIComponent(id)}`),
    deliveries: (id: string): Promise<List<{ id: string; event_type: string; status: string; attempts: number; response_status: number | null; last_error: string | null; created_at: string }>> =>
      this.request("GET", `/api/webhooks/${encodeURIComponent(id)}/deliveries`),
  };

  readonly suppressions = {
    list: (): Promise<List<Suppression>> => this.request("GET", "/api/suppressions"),
    add: (email: string, note?: string): Promise<Suppression> => this.request("POST", "/api/suppressions", { email, ...(note ? { note } : {}) }),
    remove: (email: string): Promise<{ deleted: boolean }> => this.request("DELETE", `/api/suppressions/${encodeURIComponent(email)}`),
  };
}

// ── Verificación de webhooks en el lado del cliente ─────────────────────
//
// Mismo esquema que Svix/Resend: `webhook-id`, `webhook-timestamp` y
// `webhook-signature` («v1,<base64 HMAC-SHA256(secret, "{id}.{ts}.{body}")>»)
// con el secreto `whsec_…` que se enseñó al crear el webhook.

export type WebhookEvent<T = Record<string, unknown>> = { type: string; created_at: string; data: T };

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

async function hmacBase64(secret: string, message: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Verifica y devuelve el evento. `body` tiene que ser el cuerpo CRUDO de la
 * petición (no re-serializado): la firma es sobre los bytes exactos.
 */
export async function verifyWebhook<T = Record<string, unknown>>(
  body: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  options: { toleranceSeconds?: number; now?: () => number } = {},
): Promise<WebhookEvent<T>> {
  const pick = (name: string) => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  const id = pick("webhook-id");
  const ts = Number(pick("webhook-timestamp"));
  const signature = pick("webhook-signature");
  if (!id || !Number.isFinite(ts) || !signature) throw new WebhookVerificationError("faltan las cabeceras webhook-id, webhook-timestamp o webhook-signature");
  const now = (options.now ?? Date.now)() / 1000;
  if (Math.abs(now - ts) > (options.toleranceSeconds ?? 300)) throw new WebhookVerificationError("la marca de tiempo del webhook está fuera de la ventana");
  const expected = `v1,${await hmacBase64(secret, `${id}.${ts}.${body}`)}`;
  if (!signature.split(/\s+/).some((candidate) => constantTimeEqual(candidate, expected))) throw new WebhookVerificationError("la firma del webhook no coincide");
  return JSON.parse(body) as WebhookEvent<T>;
}
