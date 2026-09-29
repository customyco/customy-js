/**
 * Cliente de servidor de Customy Send sobre `@customyai/core`: transporte,
 * reintentos con `Retry-After`, idempotencia y tokens de Access vienen del
 * core; aquí solo está el contrato de Send.
 */
import { connectProduct, resolveBearer, type ProductClientOptions, type Query, type RequestOptions, type Transport } from "@customyai/core";
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
  StoryConversion,
  StoryConversionInput,
  InAppMessage,
  InAppMessageInput,
  InAppStats,
  InAppTemplate,
  InAppTemplateInput,
  InAppTestResult,
  EngagementTestEvent,
  SubscriberMatch,
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
  NotificationPlan,
  NotificationPlanInput,
  NotificationEstimate,
  InAppEstimate,
  InAppEstimateInput,
  InAppPlan,
  InAppPlanInput,
} from "./engage-types";
import { CustomySendError, sendCall } from "./errors";
import type {
  ApiKey,
  Domain,
  Email,
  EmailEvent,
  EmailStatus,
  InboundEmail,
  List,
  RenderedTemplate,
  SendEmailInput,
  Suppression,
  Template,
  TemplateInput,
  Webhook,
} from "./types";

export const SEND_DEFAULT_BASE_URL = "https://send-api.customy.ai";
export const SEND_AUDIENCE = "customy-send";

/**
 * Scopes de Access para Send (`send:<alcance>`), los mismos alcances que las
 * llaves. Pide solo los que la app usa: `scopes: ["send:emails:send"]`.
 */
export const SEND_SCOPES = [
  "send:emails:send", "send:emails:read", "send:emails:manage",
  "send:inbound:read", "send:inbound:manage",
  "send:domains:read", "send:domains:manage",
  "send:templates:read", "send:templates:manage",
  "send:api_keys:read", "send:api_keys:manage",
  "send:webhooks:read", "send:webhooks:manage",
  "send:suppressions:read", "send:suppressions:manage",
  "send:stats:read",
  "send:push:send", "send:push:read", "send:push:manage",
  "send:notifications:send", "send:notifications:read", "send:notifications:manage",
  "send:subscribers:read", "send:subscribers:manage",
  "send:inbox:read", "send:inbox:manage",
  "send:in_app:read", "send:in_app:manage",
  "send:content_cards:read", "send:content_cards:manage",
  "send:stories:convert",
] as const;
export type SendScope = (typeof SEND_SCOPES)[number];

/**
 * Versión de la API que habla este SDK (cabecera `Customy-Version`). Send no
 * cambia la forma de una fecha ya publicada: las rupturas salen con otra fecha.
 */
export const SEND_API_VERSION = "2026-09-27";

export type SendOptions = ProductClientOptions;

/** Opciones de una operación que crea algo: la misma clave hace el reintento seguro. */
export type IdempotentOptions = Readonly<{ idempotencyKey?: string; signal?: AbortSignal; timeoutMs?: number }>;

/**
 * Quién actúa, cuando la llamada la hace un servicio en nombre de una persona
 * (cabecera `x-customy-actor`): Send exige que quien aprueba no sea quien creó.
 */
export type ActorOptions = Readonly<{ actor?: string }>;

export type Attachment = { content: Uint8Array; contentType: string; filename: string | null };

const enc = encodeURIComponent;

function emailToWire(input: SendEmailInput): Record<string, unknown> {
  const { replyTo, scheduledAt, trackOpens, trackClicks, templateId, ...rest } = input;
  return {
    ...rest,
    ...(replyTo !== undefined ? { reply_to: replyTo } : {}),
    ...(scheduledAt !== undefined ? { scheduled_at: scheduledAt } : {}),
    ...(trackOpens !== undefined ? { track_opens: trackOpens } : {}),
    ...(trackClicks !== undefined ? { track_clicks: trackClicks } : {}),
    ...(templateId !== undefined ? { template_id: templateId } : {}),
  };
}

export type CustomySend = ReturnType<typeof createSend>;

/**
 * ```ts
 * const send = createSend({ machineTokens, platform, scopes: ["send:emails:send"] });
 * await send.emails.send({ templateId: "welcome", to: "ana@example.com", variables: { name: "Ana" } });
 * ```
 */
export function createSend(options: SendOptions) {
  // `Customy-Version` en cada petición; una cabecera propia con el mismo nombre la sustituye.
  const connection = connectProduct(
    { ...options, headers: { "customy-version": SEND_API_VERSION, ...options.headers } },
    { key: "send", audience: SEND_AUDIENCE, defaultBaseUrl: SEND_DEFAULT_BASE_URL },
  );
  const http: Transport = connection.transport;

  const call = <T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, request: RequestOptions = {}) =>
    sendCall(async () => (await http.request<T>(method, path, request)).data);
  const created = <T>(path: string, body: unknown, request: IdempotentOptions & ActorOptions = {}) =>
    call<T>("POST", path, { body, idempotencyKey: request.idempotencyKey ?? true, signal: request.signal, timeoutMs: request.timeoutMs, ...actorHeader(request) });
  const q = (params: object): Query => params as Query;
  const actorHeader = (request: ActorOptions = {}): { headers?: Record<string, string> } => (request.actor ? { headers: { "x-customy-actor": request.actor } } : {});
  /** Flujo de publicación (`submit → approve → activate`) de mensajes in-app y tarjetas. */
  const lifecycle = <T, Test, Stats>(base: string) => ({
    /** A revisión (`in_review`). */
    submit: (id: string, request?: ActorOptions) => call<T>("POST", `${base}/${enc(id)}/submit`, actorHeader(request)),
    /** Aprobado (`approved`): por alguien distinto de quien lo creó (403 `approval_same_actor`). */
    approve: (id: string, request?: ActorOptions) => call<T>("POST", `${base}/${enc(id)}/approve`, actorHeader(request)),
    /** Vuelve a borrador con el motivo. */
    reject: (id: string, reason?: string, request?: ActorOptions) =>
      call<T>("POST", `${base}/${enc(id)}/reject`, { body: reason !== undefined ? { reason } : {}, ...actorHeader(request) }),
    /** Activo; si la cuenta exige aprobación y no está aprobado, 409 `approval_required`. */
    activate: (id: string, request?: ActorOptions) => call<T>("POST", `${base}/${enc(id)}/activate`, actorHeader(request)),
    pause: (id: string, request?: ActorOptions) => call<T>("POST", `${base}/${enc(id)}/pause`, actorHeader(request)),
    /** Envío de prueba: esa persona lo ve en su próxima lectura durante 24 h (marcado `test`). */
    test: (id: string, input: { subscriber: string; variant_id?: string }) => call<Test>("POST", `${base}/${enc(id)}/test`, { body: input }),
    /** Impresiones, clics por botón, conversiones, variantes, grupo de control y encuestas (y `test`, lo de quien prueba). */
    stats: (id: string) => call<Stats>("GET", `${base}/${enc(id)}/stats`),
    /** Los últimos eventos de quien prueba (`limit` ≤ 200, 50 por defecto), del más reciente. */
    testEvents: (id: string, params: { limit?: number } = {}) => call<List<EngagementTestEvent>>("GET", `${base}/${enc(id)}/test-events`, { query: q(params) }),
    /** Historial de publicación: quién lo envió, aprobó, rechazó (con motivo), activó o pausó. */
    approvals: (id: string) => call<List<ApprovalEvent>>("GET", `${base}/${enc(id)}/approvals`),
  });

  /** Bytes (adjuntos, .eml): sin reintentos, el cuerpo puede ser grande. */
  async function binary(path: string): Promise<Attachment> {
    const url = `${connection.baseUrl}${path}`;
    let response: Response;
    try {
      response = await connection.fetch(url, { method: "GET", headers: { authorization: `Bearer ${await resolveBearer(connection.credential, "send")}`, "customy-version": SEND_API_VERSION } });
    } catch (error) {
      if (error instanceof CustomySendError) throw error;
      throw new CustomySendError({ code: "SDK_NETWORK_ERROR", status: 0, cause: error });
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { name?: unknown; message?: unknown } | null;
      throw new CustomySendError({
        code: typeof body?.name === "string" ? body.name : `HTTP_${response.status}`,
        status: response.status,
        message: typeof body?.message === "string" ? body.message : undefined,
        requestId: response.headers.get("x-request-id") ?? undefined,
        body,
      });
    }
    const filename = /filename="([^"]*)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? null;
    return { content: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "application/octet-stream", filename };
  }

  return {
    baseUrl: connection.baseUrl,

    emails: {
      /**
       * Un correo. Sin `idempotencyKey` el SDK genera una: los reintentos ante
       * red o 5xx nunca lo mandan dos veces.
       */
      send: (input: SendEmailInput, request?: IdempotentOptions) => created<Email>("/api/emails", emailToWire(input), request),
      /** Hasta 100 correos; cada uno se acepta o rechaza por separado. */
      batch: (inputs: SendEmailInput[], request?: IdempotentOptions) =>
        created<{ data: Array<{ id: string } | { error: { name: string; message: string } }> }>("/api/emails/batch", inputs.map(emailToWire), request),
      get: (id: string, params: { body?: boolean } = {}) => call<Email>("GET", `/api/emails/${enc(id)}`, { query: { body: params.body ? 1 : undefined } }),
      list: (params: { limit?: number; cursor?: string; status?: EmailStatus; to?: string; from?: string } = {}) => call<List<Email>>("GET", "/api/emails", { query: q(params) }),
      events: (id: string) => call<List<EmailEvent>>("GET", `/api/emails/${enc(id)}/events`),
      cancel: (id: string) => call<Email>("POST", `/api/emails/${enc(id)}/cancel`),
      reschedule: (id: string, scheduledAt: string) => call<Email>("PATCH", `/api/emails/${enc(id)}`, { body: { scheduled_at: scheduledAt } }),
      /** Correo recibido en los dominios con recepción. */
      receiving: {
        list: (params: { limit?: number; cursor?: string; domain_id?: string; search?: string } = {}) => call<List<InboundEmail>>("GET", "/api/emails/receiving", { query: q(params) }),
        get: (id: string) => call<InboundEmail>("GET", `/api/emails/receiving/${enc(id)}`),
        attachment: (id: string, index: number) => binary(`/api/emails/receiving/${enc(id)}/attachments/${Math.trunc(index)}`),
        /** El mensaje original (.eml). */
        raw: async (id: string) => (await binary(`/api/emails/receiving/${enc(id)}/raw`)).content,
        remove: (id: string) => call<{ id: string; deleted: boolean }>("DELETE", `/api/emails/receiving/${enc(id)}`),
      },
    },

    /** Plantillas con `{{variables}}`: se mandan con `emails.send({ templateId, variables })`. */
    templates: {
      create: (input: TemplateInput & { name: string; subject: string }) => call<Template>("POST", "/api/templates", { body: input }),
      list: (params: { include_archived?: boolean } = {}) => call<List<Template>>("GET", "/api/templates", { query: q(params) }),
      /** Por id o slug, con HTML y texto. */
      get: (id: string) => call<Template>("GET", `/api/templates/${enc(id)}`),
      /** Cada edición sube `version`. */
      update: (id: string, patch: TemplateInput) => call<Template>("PATCH", `/api/templates/${enc(id)}`, { body: patch }),
      remove: (id: string) => call<{ id: string; deleted: boolean }>("DELETE", `/api/templates/${enc(id)}`),
      /** Vista previa con estas variables, sin mandar nada. */
      render: (id: string, variables: Record<string, unknown> = {}) => call<RenderedTemplate>("POST", `/api/templates/${enc(id)}/render`, { body: { variables } }),
      /**
       * Personalización (`{{ first_name }}`, `{{ attributes.plan | default: "free" }}`) de un texto o de un
       * contenido in-app para una persona o unos atributos, sin mandar nada.
       */
      preview: (input: TemplatePreviewInput) => call<TemplatePreview>("POST", "/api/templates/preview", { body: input }),
    },

    domains: {
      create: (name: string, params: { region?: string; pool?: string } = {}) => call<Domain>("POST", "/api/domains", { body: { name, ...params } }),
      list: () => call<List<Domain>>("GET", "/api/domains"),
      get: (id: string) => call<Domain>("GET", `/api/domains/${enc(id)}`),
      verify: (id: string) => call<Domain>("POST", `/api/domains/${enc(id)}/verify`),
      rotateDkim: (id: string) => call<Domain>("POST", `/api/domains/${enc(id)}/dkim/rotate`),
      update: (id: string, patch: { open_tracking?: boolean; click_tracking?: boolean; sending_paused?: boolean; pause_reason?: string; rate_limit_per_second?: number | null; pool?: string }) =>
        call<Domain>("PATCH", `/api/domains/${enc(id)}`, { body: patch }),
      remove: (id: string) => call<{ deleted: boolean }>("DELETE", `/api/domains/${enc(id)}`),
      setReceiving: (id: string, enabled: boolean) => call<Domain>("POST", `/api/domains/${enc(id)}/receiving`, { body: { enabled } }),
    },

    apiKeys: {
      create: (input: { name: string; permission?: "full" | "sending"; mode?: "live" | "test"; domain_id?: string | null }) => call<ApiKey & { token: string }>("POST", "/api/api-keys", { body: input }),
      list: () => call<List<ApiKey>>("GET", "/api/api-keys"),
      revoke: (id: string) => call<{ id: string }>("DELETE", `/api/api-keys/${enc(id)}`),
    },

    webhooks: {
      create: (input: { url: string; events?: string[]; description?: string }) => call<Webhook & { secret: string }>("POST", "/api/webhooks", { body: input }),
      list: () => call<List<Webhook>>("GET", "/api/webhooks"),
      update: (id: string, patch: { url?: string; events?: string[]; description?: string; status?: "active" | "disabled" }) => call<Webhook>("PATCH", `/api/webhooks/${enc(id)}`, { body: patch }),
      remove: (id: string) => call<{ deleted: boolean }>("DELETE", `/api/webhooks/${enc(id)}`),
      deliveries: (id: string) =>
        call<List<{ id: string; event_type: string; status: string; attempts: number; response_status: number | null; last_error: string | null; created_at: string }>>("GET", `/api/webhooks/${enc(id)}/deliveries`),
    },

    suppressions: {
      list: () => call<List<Suppression>>("GET", "/api/suppressions"),
      add: (email: string, note?: string) => call<Suppression>("POST", "/api/suppressions", { body: { email, ...(note ? { note } : {}) } }),
      remove: (email: string) => call<{ deleted: boolean }>("DELETE", `/api/suppressions/${enc(email)}`),
    },

    /** Una notificación a una o muchas personas (push + bandeja). */
    notifications: {
      /** Se acepta (202) y se entrega en segundo plano; la misma clave devuelve la misma notificación. */
      send: (input: SendNotificationInput, request?: IdempotentOptions) => created<Notification>("/api/notifications", input, request),
      /** Qué pasaría (reglas, cuándo sale, alcance, opciones) sin enviar nada; su `plan_hash` va en `delivery.decision`. */
      plan: (input: NotificationPlanInput) => call<NotificationPlan>("POST", "/api/notifications/plan", { body: input }),
      /** El alcance: personas, dispositivos por plataforma, solo bandeja, excluidas, retenidas y topadas ahora. */
      estimate: (input: NotificationPlanInput) => call<NotificationEstimate>("POST", "/api/notifications/estimate", { body: input }),
      get: (id: string) => call<Notification>("GET", `/api/notifications/${enc(id)}`),
      stats: (params: { from?: string; to?: string; category?: string; source_product?: string } = {}) => call<NotificationStats>("GET", "/api/notifications/stats", { query: q(params) }),
      /** Conversión atribuida a la notificación (idempotente por `id`). */
      conversion: (id: string, body: ConversionInput) => call<{ object: "conversion"; accepted: boolean }>("POST", `/api/notifications/${enc(id)}/conversions`, { body }),
      /** Cancela lo pendiente o programado; con `recall: true` también lo retira de los dispositivos y las bandejas. */
      cancel: (id: string, options: { recall?: boolean } = {}) => call<CancelNotificationResult>("POST", `/api/notifications/${enc(id)}/cancel`, { body: options }),
      /** El catálogo de temas: canal de Android, nivel por defecto, canales por defecto, tope, transaccional. */
      categories: {
        list: () => call<List<NotificationCategory>>("GET", "/api/notifications/categories"),
        get: (id: string) => call<NotificationCategory>("GET", `/api/notifications/categories/${enc(id)}`),
        /** Crea o reemplaza (`id`: minúsculas, números, `_ . -`). */
        put: (id: string, input: NotificationCategoryInput) => call<NotificationCategory>("PUT", `/api/notifications/categories/${enc(id)}`, { body: input }),
        remove: (id: string) => call<{ object: "notification_category"; id: string; deleted: boolean }>("DELETE", `/api/notifications/categories/${enc(id)}`),
      },
      /** Topes de frecuencia, horas de silencio por defecto y presupuesto por proveedor de la cuenta. */
      settings: {
        get: () => call<NotificationSettings>("GET", "/api/notifications/settings"),
        put: (input: NotificationSettingsInput) => call<NotificationSettings>("PUT", "/api/notifications/settings", { body: input }),
      },
    },

    /**
     * Customy Stories desde tu servidor. Hoy una sola llamada: reportar la compra con su importe, que es lo único que suma ingresos a una story
     * (la app del usuario no puede: su señal de compra no lleva importe). Pide el alcance `stories:convert` (`send:stories:convert` en un token de máquina).
     */
    stories: {
      /** La compra cerrada, con importe en unidad menor y moneda; idempotente por `event_id`. 503 `commerce_unavailable` si el puente con Commerce está apagado: reintenta. */
      conversion: (input: StoryConversionInput, request?: IdempotentOptions) => created<StoryConversion>("/api/stories/conversions", input, request),
    },

    /** Las personas: zona horaria, idioma, horas de silencio y preferencias por tema y canal. */
    subscribers: {
      get: (id: string) => call<Subscriber>("GET", `/api/subscribers/${enc(id)}`),
      /** Personas con ese atributo exacto (`email` sin distinguir mayúsculas; ≤ 20), con sus dispositivos. */
      find: (params: { attribute: string; value: string; limit?: number }) => call<List<SubscriberMatch>>("GET", "/api/subscribers", { query: q(params) }),
      /** Solo cambia lo que viene; `null` borra. */
      put: (id: string, input: SubscriberInput) => call<Subscriber>("PUT", `/api/subscribers/${enc(id)}`, { body: input }),
      preferences: {
        get: (id: string) => call<SubscriberPreferences>("GET", `/api/subscribers/${enc(id)}/preferences`),
        /** Las categorías que vienen se mezclan por canal; el resto queda igual. */
        put: (id: string, input: PreferencesInput) => call<SubscriberPreferences>("PUT", `/api/subscribers/${enc(id)}/preferences`, { body: input }),
      },
    },

    push: {
      devices: {
        register: (input: RegisterDeviceInput & { subscriber: string }) => call<PushDevice>("POST", "/api/push/devices", { body: input }),
        list: (subscriber: string) => call<List<PushDevice>>("GET", "/api/push/devices", { query: { subscriber } }),
        remove: (target: { token?: string; subscriber?: string; id?: string }) =>
          call<{ object: "push_device_removal"; removed: number }>("DELETE", "/api/push/devices", { query: q(target) }),
      },
      credentials: {
        putFcm: (input: { service_account: string | Record<string, unknown>; rate_per_minute?: number }) => call<PushCredential>("PUT", "/api/push/credentials/fcm", { body: input }),
        putApns: (input: { team_id: string; key_id: string; bundle_id: string; private_key: string }) => call<PushCredential>("PUT", "/api/push/credentials/apns", { body: input }),
        list: () => call<List<PushCredential>>("GET", "/api/push/credentials"),
        remove: (provider: "fcm" | "apns") => call<{ object: "push_credential"; provider: string; deleted: boolean }>("DELETE", `/api/push/credentials/${provider}`),
      },
    },

    /** La bandeja in-app de cada persona, desde el servidor de la app. */
    inbox: {
      list: (subscriber: string, params: { cursor?: string; status?: InboxStatus; limit?: number } = {}) => call<InboxPage>("GET", "/api/inbox", { query: q({ subscriber, ...params }) }),
      mark: (input: { subscriber: string; action: InboxAction; ids?: string[]; all?: boolean }) => call<InboxCounts & { object: "inbox_counts" }>("POST", "/api/inbox/mark", { body: input }),
      /** Token de suscriptor (`sst_…`) para la app de esa persona; emítelo tras autenticarla. */
      createToken: (subscriber: string, params: { ttl?: number } = {}) => call<SubscriberToken>("POST", "/api/inbox/tokens", { body: { subscriber, ...params } }),
    },

    /** Mensajes dentro de la app (modal, banner, pantalla completa, tarjeta, slideup, tooltip, HTML). */
    inApp: {
      create: (input: InAppMessageInput, request?: IdempotentOptions & ActorOptions) => created<InAppMessage>("/api/in-app/messages", input, request),
      list: (params: { status?: InAppMessage["status"]; cursor?: string; limit?: number } = {}) => call<List<InAppMessage>>("GET", "/api/in-app/messages", { query: q(params) }),
      get: (id: string) => call<InAppMessage>("GET", `/api/in-app/messages/${enc(id)}`),
      update: (id: string, patch: Partial<InAppMessageInput>, request?: ActorOptions) => call<InAppMessage>("PATCH", `/api/in-app/messages/${enc(id)}`, { body: patch, ...actorHeader(request) }),
      archive: (id: string) => call<{ object: "in_app_message"; id: string; archived: boolean }>("DELETE", `/api/in-app/messages/${enc(id)}`),
      /** Cuántas personas alcanza una audiencia, por plataforma. */
      estimate: (input: InAppEstimateInput) => call<InAppEstimate>("POST", "/api/in-app/estimate", { body: input }),
      /** Plan de un mensaje o tarjeta: interruptores, aprobación, programación y alcance (no cambia nada). */
      plan: (input: InAppPlanInput) => call<InAppPlan>("POST", "/api/in-app/plan", { body: input }),
      ...lifecycle<InAppMessage, InAppTestResult, InAppStats>("/api/in-app/messages"),
      /** Plantillas: las de Send (`builtin`, solo lectura) y las de la cuenta. */
      templates: {
        list: () => call<List<InAppTemplate>>("GET", "/api/in-app/templates"),
        get: (id: string) => call<InAppTemplate>("GET", `/api/in-app/templates/${enc(id)}`),
        create: (input: InAppTemplateInput) => call<InAppTemplate>("POST", "/api/in-app/templates", { body: input }),
        update: (id: string, patch: Partial<InAppTemplateInput>) => call<InAppTemplate>("PATCH", `/api/in-app/templates/${enc(id)}`, { body: patch }),
        remove: (id: string) => call<{ object: "in_app_template"; id: string; deleted: boolean }>("DELETE", `/api/in-app/templates/${enc(id)}`),
      },
    },

    /** Kits de marca: colores, radio, fuente y logo que Send mezcla en el estilo de los mensajes. */
    brandKits: {
      list: () => call<List<BrandKit>>("GET", "/api/brand-kits"),
      get: (id: string) => call<BrandKit>("GET", `/api/brand-kits/${enc(id)}`),
      create: (input: BrandKitInput) => call<BrandKit>("POST", "/api/brand-kits", { body: input }),
      update: (id: string, patch: Partial<BrandKitInput>) => call<BrandKit>("PATCH", `/api/brand-kits/${enc(id)}`, { body: patch }),
      remove: (id: string) => call<{ object: "brand_kit"; id: string; deleted: boolean }>("DELETE", `/api/brand-kits/${enc(id)}`),
    },

    /** Tarjetas de contenido: un feed persistente dentro de la app (no son notificaciones). */
    contentCards: {
      create: (input: ContentCardInput, request?: IdempotentOptions & ActorOptions) => created<ContentCard>("/api/content-cards", input, request),
      list: (params: { status?: ContentCardStatus; cursor?: string; limit?: number } = {}) => call<List<ContentCard>>("GET", "/api/content-cards", { query: q(params) }),
      get: (id: string) => call<ContentCard>("GET", `/api/content-cards/${enc(id)}`),
      update: (id: string, patch: Partial<ContentCardInput>, request?: ActorOptions) => call<ContentCard>("PATCH", `/api/content-cards/${enc(id)}`, { body: patch, ...actorHeader(request) }),
      remove: (id: string) => call<{ object: "content_card"; id: string; deleted?: boolean; archived?: boolean }>("DELETE", `/api/content-cards/${enc(id)}`),
      ...lifecycle<ContentCard, ContentCardTestResult, ContentCardStats>("/api/content-cards"),
    },
  };
}
