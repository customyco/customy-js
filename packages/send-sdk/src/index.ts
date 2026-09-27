/**
 * @customyai/send-sdk — el cliente de Customy Send.
 *
 * @deprecated Usa `@customyai/send` (`createSend`) y `@customyai/send/inbox`.
 * Este paquete es su adaptador durante un ciclo major: `CustomySend` delega en
 * `createSend` (transporte, reintentos con `Retry-After`, idempotencia y
 * tokens de Access de `@customyai/core`) y conserva la forma de 1.x, incluidos
 * `CustomySendError` con sus códigos y `request`/`requestBinary`.
 *
 *   import { CustomySend } from "@customyai/send-sdk";
 *   const send = new CustomySend("cs_live_…");
 *   const { id } = await send.emails.send({ from: "Acme <hola@acme.com>", to: "ana@x.com", subject: "Hola", html: "<p>…</p>" });
 */
import { createTransport, type Transport } from "@customyai/core";
import { createSend, SEND_API_VERSION, type CustomySend as SendClient } from "@customyai/send";
import type {
  ApprovalEvent,
  BrandKit,
  BrandKitInput,
  CancelNotificationResult,
  ContentCard,
  ContentCardInput,
  ContentCardStats,
  ContentCardStatus,
  ContentCardTestResult,
  ConversionInput,
  InAppMessage,
  InAppMessageInput,
  InAppStats,
  InAppTemplate,
  InAppTemplateInput,
  InAppTestResult,
  InboxAction,
  InboxCounts,
  InboxPage,
  InboxStatus,
  Notification,
  NotificationCategory,
  NotificationCategoryInput,
  NotificationSettings,
  NotificationSettingsInput,
  NotificationStats,
  PreferencesInput,
  PushCredential,
  PushDevice,
  RegisterDeviceInput,
  SendNotificationInput,
  Subscriber,
  SubscriberInput,
  SubscriberPreferences,
  SubscriberToken,
  TemplatePreview,
  TemplatePreviewInput,
} from "./engage-types";
import { warnDeprecated } from "./deprecation";
import { CustomySendError, legacyCall } from "./errors";

export { CustomySendError } from "./errors";
export { actionCategoryId, SEND_API_VERSION, verifyWebhook, WebhookVerificationError, type ActionCategoryInput, type WebhookEvent } from "@customyai/send";

/**
 * Quién actúa, cuando un servicio llama en nombre de una persona (cabecera
 * `x-customy-actor`): quien aprueba no puede ser quien creó.
 */
export type ActorOptions = { actor?: string };
export type * from "./engage-types";
export type { Address, AddressList, ApiKey, Domain, Email, EmailEvent, EmailStatus, InboundAddress, InboundAttachment, InboundEmail, List, Suppression, Webhook } from "@customyai/send";

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

import type { AddressList, ApiKey, Domain, Email, EmailEvent, EmailStatus, InboundEmail, List, Suppression, Webhook } from "@customyai/send";

export type CustomySendOptions = {
  /** Por defecto https://send-api.customy.ai */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Reintentos ante 429/5xx/red (respetan `retry-after`). Por defecto 2. */
  maxRetries?: number;
};

type Json = Record<string, unknown> | unknown[];

/**
 * Credencial de Send: una llave `cs_live_…`/`cs_test_…`, o una función que
 * devuelve un token de máquina de Customy Access con audiencia `customy-send`.
 */
export type CustomySendCredential = string | (() => Promise<string>);

const DEFAULT_BASE_URL = "https://send-api.customy.ai";
const clients = new WeakMap<object, { send: SendClient; transport: Transport }>();

function inner(owner: object): { send: SendClient; transport: Transport } {
  const found = clients.get(owner);
  if (!found) throw new Error("CustomySend: client not initialised");
  return found;
}

/** @deprecated Usa `createSend` de `@customyai/send`. */
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
    warnDeprecated("@customyai/send-sdk", "use createSend from @customyai/send (and @customyai/send/inbox in apps).");
    this.credential = credential;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    const connection = {
      baseUrl: this.baseUrl,
      accessToken: this.bearer.bind(this),
      fetch: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      retry: { maxRetries: this.maxRetries },
      allowLoopbackHttp: true,
    };
    clients.set(this, {
      send: createSend(connection),
      transport: createTransport({ ...connection, service: "send", headers: { "customy-version": SEND_API_VERSION } }),
    });
  }

  private async bearer(): Promise<string> {
    return typeof this.credential === "function" ? this.credential() : this.credential;
  }

  /** Una petición cualquiera a la API de Send. Un `POST` solo se repite con `idempotency-key`. */
  async request<T>(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<T> {
    return legacyCall(async () => (await inner(this).transport.request<T>(method.toUpperCase() as "GET", path, { body, headers })).data);
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
    send: (input: SendEmailInput, options: { idempotencyKey?: string } = {}): Promise<Email> => legacyCall(() => inner(this).send.emails.send(input, options)),
    /** Hasta 100 correos en una llamada; cada uno se acepta o rechaza por separado. */
    batch: (inputs: SendEmailInput[]): Promise<{ data: Array<{ id: string } | { error: { name: string; message: string } }> }> => legacyCall(() => inner(this).send.emails.batch(inputs)),
    get: (id: string, options: { body?: boolean } = {}): Promise<Email> => legacyCall(() => inner(this).send.emails.get(id, options)),
    list: (params: { limit?: number; cursor?: string; status?: EmailStatus; to?: string; from?: string } = {}): Promise<List<Email>> => legacyCall(() => inner(this).send.emails.list(params)),
    events: (id: string): Promise<List<EmailEvent>> => legacyCall(() => inner(this).send.emails.events(id)),
    cancel: (id: string): Promise<Email> => legacyCall(() => inner(this).send.emails.cancel(id)),
    reschedule: (id: string, scheduledAt: string): Promise<Email> => legacyCall(() => inner(this).send.emails.reschedule(id, scheduledAt)),
    /** Correo recibido (Inbound) en los dominios con `domains.setReceiving(id, true)`. */
    receiving: {
      list: (params: { limit?: number; cursor?: string; domain_id?: string; search?: string } = {}): Promise<List<InboundEmail>> => legacyCall(() => inner(this).send.emails.receiving.list(params)),
      get: (id: string): Promise<InboundEmail> => legacyCall(() => inner(this).send.emails.receiving.get(id)),
      /** El adjunto `index` como bytes, con su content-type. */
      attachment: (id: string, index: number): Promise<{ content: Uint8Array; contentType: string; filename: string | null }> =>
        legacyCall(() => inner(this).send.emails.receiving.attachment(id, index)),
      /** El mensaje original (.eml). */
      raw: (id: string): Promise<Uint8Array> => legacyCall(() => inner(this).send.emails.receiving.raw(id)),
      remove: (id: string): Promise<{ id: string; deleted: boolean }> => legacyCall(() => inner(this).send.emails.receiving.remove(id)),
    },
  };

  readonly domains = {
    create: (name: string, options: { region?: string; pool?: string } = {}): Promise<Domain> => legacyCall(() => inner(this).send.domains.create(name, options)),
    list: (): Promise<List<Domain>> => legacyCall(() => inner(this).send.domains.list()),
    get: (id: string): Promise<Domain> => legacyCall(() => inner(this).send.domains.get(id)),
    verify: (id: string): Promise<Domain> => legacyCall(() => inner(this).send.domains.verify(id)),
    /** Rotación de DKIM: publica el TXT `DKIM_NEXT` que devuelve y llama a `verify`. */
    rotateDkim: (id: string): Promise<Domain> => legacyCall(() => inner(this).send.domains.rotateDkim(id)),
    update: (id: string, patch: { open_tracking?: boolean; click_tracking?: boolean; sending_paused?: boolean; pause_reason?: string; rate_limit_per_second?: number | null; pool?: string }): Promise<Domain> =>
      legacyCall(() => inner(this).send.domains.update(id, patch)),
    remove: (id: string): Promise<{ deleted: boolean }> => legacyCall(() => inner(this).send.domains.remove(id)),
    setReceiving: (id: string, enabled: boolean): Promise<Domain> => legacyCall(() => inner(this).send.domains.setReceiving(id, enabled)),
  };

  readonly apiKeys = {
    /** `mode: "test"` crea una llave `cs_test_…`: sandbox, nada sale del servicio. */
    create: (input: { name: string; permission?: "full" | "sending"; mode?: "live" | "test"; domain_id?: string | null }): Promise<ApiKey & { token: string }> => legacyCall(() => inner(this).send.apiKeys.create(input)),
    list: (): Promise<List<ApiKey>> => legacyCall(() => inner(this).send.apiKeys.list()),
    revoke: (id: string): Promise<{ id: string }> => legacyCall(() => inner(this).send.apiKeys.revoke(id)),
  };

  readonly webhooks = {
    create: (input: { url: string; events?: string[]; description?: string }): Promise<Webhook & { secret: string }> => legacyCall(() => inner(this).send.webhooks.create(input)),
    list: (): Promise<List<Webhook>> => legacyCall(() => inner(this).send.webhooks.list()),
    update: (id: string, patch: { url?: string; events?: string[]; description?: string; status?: "active" | "disabled" }): Promise<Webhook> => legacyCall(() => inner(this).send.webhooks.update(id, patch)),
    remove: (id: string): Promise<{ deleted: boolean }> => legacyCall(() => inner(this).send.webhooks.remove(id)),
    deliveries: (id: string): Promise<List<{ id: string; event_type: string; status: string; attempts: number; response_status: number | null; last_error: string | null; created_at: string }>> =>
      legacyCall(() => inner(this).send.webhooks.deliveries(id)),
  };

  readonly suppressions = {
    list: (): Promise<List<Suppression>> => legacyCall(() => inner(this).send.suppressions.list()),
    add: (email: string, note?: string): Promise<Suppression> => legacyCall(() => inner(this).send.suppressions.add(email, note)),
    remove: (email: string): Promise<{ deleted: boolean }> => legacyCall(() => inner(this).send.suppressions.remove(email)),
  };
  private query(params: Record<string, string | number | boolean | null | undefined>): string {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
    return q.toString() ? `?${q}` : "";
  }

  /** Customy Engage: una notificación a una o muchas personas (push + bandeja). */
  readonly notifications = {
    /** Se acepta (202) y se entrega en segundo plano; la misma `idempotencyKey` devuelve la misma notificación. */
    send: (input: SendNotificationInput, options: { idempotencyKey?: string } = {}): Promise<Notification> => legacyCall(() => inner(this).send.notifications.send(input, options)),
    get: (id: string): Promise<Notification> => legacyCall(() => inner(this).send.notifications.get(id)),
    stats: (params: { from?: string; to?: string; category?: string; source_product?: string } = {}): Promise<NotificationStats> => legacyCall(() => inner(this).send.notifications.stats(params)),
    conversion: (id: string, body: ConversionInput): Promise<{ object: "conversion"; accepted: boolean }> => legacyCall(() => inner(this).send.notifications.conversion(id, body)),
    cancel: (id: string, options: { recall?: boolean } = {}): Promise<CancelNotificationResult> => legacyCall(() => inner(this).send.notifications.cancel(id, options)),
    categories: {
      list: (): Promise<List<NotificationCategory>> => legacyCall(() => inner(this).send.notifications.categories.list()),
      get: (id: string): Promise<NotificationCategory> => legacyCall(() => inner(this).send.notifications.categories.get(id)),
      put: (id: string, input: NotificationCategoryInput): Promise<NotificationCategory> => legacyCall(() => inner(this).send.notifications.categories.put(id, input)),
      remove: (id: string): Promise<{ object: "notification_category"; id: string; deleted: boolean }> => legacyCall(() => inner(this).send.notifications.categories.remove(id)),
    },
    settings: {
      get: (): Promise<NotificationSettings> => legacyCall(() => inner(this).send.notifications.settings.get()),
      put: (input: NotificationSettingsInput): Promise<NotificationSettings> => legacyCall(() => inner(this).send.notifications.settings.put(input)),
    },
  };

  readonly subscribers = {
    get: (id: string): Promise<Subscriber> => legacyCall(() => inner(this).send.subscribers.get(id)),
    put: (id: string, input: SubscriberInput): Promise<Subscriber> => legacyCall(() => inner(this).send.subscribers.put(id, input)),
    preferences: {
      get: (id: string): Promise<SubscriberPreferences> => legacyCall(() => inner(this).send.subscribers.preferences.get(id)),
      put: (id: string, input: PreferencesInput): Promise<SubscriberPreferences> => legacyCall(() => inner(this).send.subscribers.preferences.put(id, input)),
    },
  };

  readonly push = {
    devices: {
      register: (input: RegisterDeviceInput & { subscriber: string }): Promise<PushDevice> => legacyCall(() => inner(this).send.push.devices.register(input)),
      list: (subscriber: string): Promise<List<PushDevice>> => legacyCall(() => inner(this).send.push.devices.list(subscriber)),
      remove: (target: { token?: string; subscriber?: string; id?: string }): Promise<{ object: "push_device_removal"; removed: number }> => legacyCall(() => inner(this).send.push.devices.remove(target)),
    },
    credentials: {
      putFcm: (input: { service_account: string | Record<string, unknown>; rate_per_minute?: number }): Promise<PushCredential> => legacyCall(() => inner(this).send.push.credentials.putFcm(input)),
      putApns: (input: { team_id: string; key_id: string; bundle_id: string; private_key: string }): Promise<PushCredential> => legacyCall(() => inner(this).send.push.credentials.putApns(input)),
      list: (): Promise<List<PushCredential>> => legacyCall(() => inner(this).send.push.credentials.list()),
      remove: (provider: "fcm" | "apns"): Promise<{ object: "push_credential"; provider: string; deleted: boolean }> => legacyCall(() => inner(this).send.push.credentials.remove(provider)),
    },
  };

  readonly inbox = {
    list: (subscriber: string, params: { cursor?: string; status?: InboxStatus; limit?: number } = {}): Promise<InboxPage> => legacyCall(() => inner(this).send.inbox.list(subscriber, params)),
    mark: (input: { subscriber: string; action: InboxAction; ids?: string[]; all?: boolean }): Promise<InboxCounts & { object: "inbox_counts" }> => legacyCall(() => inner(this).send.inbox.mark(input)),
    /** Token de suscriptor (`sst_…`) para la app de esa persona (`@customyai/send/inbox`). */
    createToken: (subscriber: string, options: { ttl?: number } = {}): Promise<SubscriberToken> => legacyCall(() => inner(this).send.inbox.createToken(subscriber, options)),
  };

  readonly inApp = {
    create: (input: InAppMessageInput, options: { idempotencyKey?: string } & ActorOptions = {}): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.create(input, options)),
    list: (params: { status?: InAppMessage["status"]; cursor?: string; limit?: number } = {}): Promise<List<InAppMessage>> => legacyCall(() => inner(this).send.inApp.list(params)),
    get: (id: string): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.get(id)),
    update: (id: string, patch: Partial<InAppMessageInput>, options?: ActorOptions): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.update(id, patch, options)),
    archive: (id: string): Promise<{ object: "in_app_message"; id: string; archived: boolean }> => legacyCall(() => inner(this).send.inApp.archive(id)),
    /** A revisión (`in_review`). */
    submit: (id: string, options?: ActorOptions): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.submit(id, options)),
    /** Aprobado por alguien distinto de quien lo creó (403 `approval_same_actor`). */
    approve: (id: string, options?: ActorOptions): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.approve(id, options)),
    /** Vuelve a borrador con el motivo. */
    reject: (id: string, reason?: string, options?: ActorOptions): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.reject(id, reason, options)),
    /** 409 `approval_required` si la cuenta exige aprobación y no está aprobado. */
    activate: (id: string, options?: ActorOptions): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.activate(id, options)),
    pause: (id: string, options?: ActorOptions): Promise<InAppMessage> => legacyCall(() => inner(this).send.inApp.pause(id, options)),
    /** Esa persona lo ve en su próxima lectura durante 24 h, aunque no le toque. */
    test: (id: string, input: { subscriber: string; variant_id?: string }): Promise<InAppTestResult> => legacyCall(() => inner(this).send.inApp.test(id, input)),
    stats: (id: string): Promise<InAppStats> => legacyCall(() => inner(this).send.inApp.stats(id)),
    /** Historial de publicación (quién envió, aprobó, rechazó, activó o pausó). */
    approvals: (id: string): Promise<List<ApprovalEvent>> => legacyCall(() => inner(this).send.inApp.approvals(id)),
    templates: {
      list: (): Promise<List<InAppTemplate>> => legacyCall(() => inner(this).send.inApp.templates.list()),
      get: (id: string): Promise<InAppTemplate> => legacyCall(() => inner(this).send.inApp.templates.get(id)),
      create: (input: InAppTemplateInput): Promise<InAppTemplate> => legacyCall(() => inner(this).send.inApp.templates.create(input)),
      update: (id: string, patch: Partial<InAppTemplateInput>): Promise<InAppTemplate> => legacyCall(() => inner(this).send.inApp.templates.update(id, patch)),
      remove: (id: string): Promise<{ object: "in_app_template"; id: string; deleted: boolean }> => legacyCall(() => inner(this).send.inApp.templates.remove(id)),
    },
  };

  /** Kits de marca que Send mezcla en el estilo de los mensajes (`content.brand_kit_id`). */
  readonly brandKits = {
    list: (): Promise<List<BrandKit>> => legacyCall(() => inner(this).send.brandKits.list()),
    get: (id: string): Promise<BrandKit> => legacyCall(() => inner(this).send.brandKits.get(id)),
    create: (input: BrandKitInput): Promise<BrandKit> => legacyCall(() => inner(this).send.brandKits.create(input)),
    update: (id: string, patch: Partial<BrandKitInput>): Promise<BrandKit> => legacyCall(() => inner(this).send.brandKits.update(id, patch)),
    remove: (id: string): Promise<{ object: "brand_kit"; id: string; deleted: boolean }> => legacyCall(() => inner(this).send.brandKits.remove(id)),
  };

  /** Tarjetas de contenido: un feed persistente en la app, con el mismo flujo de aprobación que los mensajes in-app. */
  readonly contentCards = {
    create: (input: ContentCardInput, options: { idempotencyKey?: string } & ActorOptions = {}): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.create(input, options)),
    list: (params: { status?: ContentCardStatus; cursor?: string; limit?: number } = {}): Promise<List<ContentCard>> => legacyCall(() => inner(this).send.contentCards.list(params)),
    get: (id: string): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.get(id)),
    update: (id: string, patch: Partial<ContentCardInput>, options?: ActorOptions): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.update(id, patch, options)),
    remove: (id: string): Promise<{ object: "content_card"; id: string; deleted?: boolean; archived?: boolean }> => legacyCall(() => inner(this).send.contentCards.remove(id)),
    submit: (id: string, options?: ActorOptions): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.submit(id, options)),
    approve: (id: string, options?: ActorOptions): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.approve(id, options)),
    reject: (id: string, reason?: string, options?: ActorOptions): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.reject(id, reason, options)),
    activate: (id: string, options?: ActorOptions): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.activate(id, options)),
    pause: (id: string, options?: ActorOptions): Promise<ContentCard> => legacyCall(() => inner(this).send.contentCards.pause(id, options)),
    test: (id: string, input: { subscriber: string; variant_id?: string }): Promise<ContentCardTestResult> => legacyCall(() => inner(this).send.contentCards.test(id, input)),
    stats: (id: string): Promise<ContentCardStats> => legacyCall(() => inner(this).send.contentCards.stats(id)),
    approvals: (id: string): Promise<List<ApprovalEvent>> => legacyCall(() => inner(this).send.contentCards.approvals(id)),
  };

  /** Personalización (`{{ first_name }}`, filtros `default`, `upcase`…). */
  readonly templates = {
    /** Un texto o un contenido in-app renderizado para una persona o unos atributos, sin mandar nada. */
    preview: (input: TemplatePreviewInput): Promise<TemplatePreview> => legacyCall(() => inner(this).send.templates.preview(input)),
  };
}
