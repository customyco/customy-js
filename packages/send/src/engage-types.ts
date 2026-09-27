/**
 * Tipos de Customy Engage (notificaciones push, bandeja in-app, mensajes in-app
 * y embudo), con los nombres de campo del contrato HTTP v1. Los comparten el
 * cliente de servidor y el cliente de las apps.
 */

/** Origen de un envío: qué campaña, flujo o paso lo produjo (para el embudo). */
export type NotificationSource = {
  product?: string;
  campaign_id?: string;
  flow_id?: string;
  execution_id?: string;
  step_id?: string;
  variant?: string;
};

export type NotificationChannel = "push" | "inbox";
export type NotificationLane = "transactional" | "default" | "bulk";

/** Cómo interrumpe: `passive` (sin sonido ni pantalla), `active` (normal), `time_sensitive` (atraviesa Concentración), `critical` (solo con permiso de Apple). */
export type InterruptionLevel = "passive" | "active" | "time_sensitive" | "critical";

/** Un botón del push (≤ 3). iOS: categoría `actionCategoryId(...)`; Android: la app lo pinta; web: `actions` (Chrome enseña 2). */
export type NotificationAction = {
  /** a-z, 0-9, `_` y `-` (≤ 40). Vuelve en el recibo `opened` como `action`. */
  id: string;
  label: string;
  /** Ruta de la app o URL https que abre. */
  url?: string;
  /** Abre la app al pulsarlo. */
  foreground?: boolean;
  destructive?: boolean;
  /** Pide desbloquear el teléfono. */
  auth_required?: boolean;
  /** Respuesta con texto. */
  input?: { button: string; placeholder?: string };
};

export type NotificationMedia = { url: string; type: "image" | "gif" | "video" | "audio" };

export type NotificationAndroidOptions = {
  /** Por defecto el canal de la categoría registrada, si no `default`. */
  channel_id?: string;
  /** En la pantalla bloqueada: `private` (oculta el contenido), `public`, `secret` (no aparece). */
  visibility?: "private" | "public" | "secret";
  /** `#rrggbb`. */
  color?: string;
  sticky?: boolean;
};

/** Horas de silencio: `delay` lo manda al terminar, `drop` no lo manda (el push; la bandeja sí). */
export type QuietHours = { start: string; end: string; action?: "delay" | "drop" };

export type NotificationDelivery = {
  /** `subscriber` = la hora de `send_at` en la zona de cada persona; o una zona IANA (`America/Bogota`). */
  timezone?: "subscriber" | (string & {});
  quiet_hours?: QuietHours;
  /** El plan que se vio (`notifications.plan`): obligatorio para audiencias y lanzamientos desde Workspace o el Agente. */
  decision?: DeliveryDecision;
};

/** Qué hacer con quien está en horas de silencio o fuera de su ventana legal. */
export type DeliveryDecisionOption = "respect_quiet_hours" | "send_now_to_available_rest_later" | "schedule_at" | "override_quiet_hours";

export type DeliveryDecision = {
  option: DeliveryDecisionOption;
  /** El `plan_hash` del plan visto; si el plan cambió, `409 plan_changed` con el nuevo. */
  plan_hash: string;
  /** Obligatorio para `override_quiet_hours` (con `lane: "transactional"`). */
  reason?: string;
  /** `schedule_at`: el momento elegido (por defecto el `suggested_at` del plan). */
  send_at?: string;
};

/** A quién (filtros con la gramática de in-app, `AudienceFilter`): todos (Y); `[]` = todas las personas; `segment_id` = una audiencia de Customy Data. */
export type NotificationAudience = { filters: AudienceFilter[]; segment_id?: string };

export type SendNotificationInput = {
  /** El id de usuario de la app, o hasta 1000 (o `audience`, nunca los dos). */
  to?: string | string[];
  /** Una audiencia en vez de `to`: se expande por lotes y exige `delivery.decision` (el plan visto). */
  audience?: NotificationAudience;
  /** Envío de prueba: sale ya (sin horas de silencio, topes, preferencias ni `send_at`) y no cuenta en los números reales. Solo con `to` (≤ 25). */
  test?: boolean;
  /** Por defecto `["push", "inbox"]` (`["push"]` en un push silencioso); push = APNs + FCM + Web Push. */
  channels?: NotificationChannel[];
  /** `transactional` sale primero (sin topes ni preferencias); `bulk` cede el paso y va con prioridad normal. Por defecto `default`. */
  lane?: NotificationLane;
  /** `background` = push silencioso para sincronizar (solo apps; los navegadores se saltan). Por defecto `alert`. */
  type?: "alert" | "background";
  /** Obligatorio salvo en un push `background` sin bandeja. */
  title?: string;
  subtitle?: string;
  body?: string;
  /** Ruta de la app (`/facturas/42`) o URL https. */
  url?: string;
  icon?: string;
  /** Alias de `media: { type: "image" }`. */
  image?: string;
  media?: NotificationMedia;
  category?: string;
  /** Agrupa en la bandeja del sistema; por defecto la categoría. */
  thread_id?: string;
  /** Una notificación con el mismo `tag` sustituye a la anterior en la bandeja de Android. */
  tag?: string;
  /** `true` = reemplaza la anterior con el mismo `tag` en todas partes, también sin conexión. */
  replace?: boolean;
  /** Nombre del sonido, `"default"`, o `null` para silencio. */
  sound?: string | null;
  interruption_level?: InterruptionLevel;
  /** 0…1: cuál destaca en el resumen de iOS. */
  relevance_score?: number;
  actions?: NotificationAction[];
  android?: NotificationAndroidOptions;
  /** ≤ 2 KB. */
  data?: Record<string, unknown>;
  /** Segundos (0…2419200). Por defecto 86400. */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** `"unread"` (por defecto) = los no leídos de la bandeja; un número; o `null` para no tocarlo. */
  badge?: "unread" | number | null;
  /** ISO 8601, ≤ 30 días. */
  send_at?: string;
  delivery?: NotificationDelivery;
  source?: NotificationSource;
};

export type NotificationStatus = "accepted" | "scheduled" | "planned" | "done" | "expired" | "canceled";

/** Embudo por canal: `{ inbox: { seen: 3, read: 1 }, apns: { sent: 2, opened: 1 } }`. */
export type NotificationFunnel = Record<string, Record<string, number>>;

export type Notification = {
  object: "notification";
  id: string;
  status: NotificationStatus;
  lane: NotificationLane;
  channels: string[];
  recipients: number;
  title: string;
  category: string | null;
  source: NotificationSource | null;
  inbox: number;
  devices: number;
  delivered: number;
  failed: number;
  removed: number;
  /** Personas y canales que se saltaron (preferencias, topes, horas de silencio). */
  skipped?: number;
  type?: "alert" | "background";
  send_at?: string | null;
  canceled_at?: string | null;
  created_at: string;
  planned_at: string | null;
  done_at: string | null;
  expires_at: string;
  funnel?: NotificationFunnel;
  /** `true` cuando la misma `Idempotency-Key` ya se había aceptado (no se manda otra vez). */
  replayed?: boolean;
  /** Envío de prueba (fuera de las estadísticas reales). */
  test?: boolean;
  audience?: { filters: AudienceFilter[]; segment_id: string | null; status: "expanding" | "done"; scanned: number; matched: number; batches: number } | null;
  /** Plataformas a las que va (filtros de plataforma de la audiencia); `null` = todas. */
  platforms?: Array<"ios" | "android" | "web"> | null;
  /** La decisión con la que se lanzó. */
  decision?: { option: DeliveryDecisionOption; plan_hash: string | null; reason?: string } | null;
  /** Lo que decidió el planificador, por regla y efecto (`quiet_hours.delay`: 12). */
  decisions?: Record<string, number>;
  /** Solo en `get`: quién espera, por canal, y por qué. */
  delivery_plan?: { push: ChannelDeliveryPlan; inbox: ChannelDeliveryPlan };
};

export type HoldReason = "quiet_hours" | "legal_window" | "local_time" | "send_time";

/** «Se retrasa hasta las 08:00 por horas de silencio»: `held_until` + `reason`. */
export type ChannelDeliveryPlan = {
  status: "held" | "scheduled" | "in_progress" | "done" | "canceled" | "none";
  held: number;
  held_until: string | null;
  next_at: string | null;
  reason: HoldReason | null;
  holds: Array<{ at: string; reason: HoldReason; recipients: number | null }>;
};

export type PlanRuleName = "kill_switch" | "credentials" | "approval" | "test" | "unsubscribed" | "preferences" | "send_time" | "legal_window" | "quiet_hours" | "ttl_expiry" | "frequency_cap" | "provider_budget" | "no_device" | "audience" | "platform_override";

export type PlanRule = {
  rule: PlanRuleName;
  severity: "info" | "warning" | "blocking";
  effect: "none" | "delay" | "drop" | "skip" | "block";
  affected: number;
  /** `quiet_hours.person`, `legal_window.co`, `credentials.apns_missing`, `approval.required`… */
  reason_code: string;
  until?: string;
  windows?: Array<{ start: string; end: string; timezone: string; affected: number }>;
};

export type PlanReach = {
  recipients: number;
  with_push_device: { ios: number; android: number; web: number };
  inbox_only: number;
  no_device: number;
  opted_out_by_preferences: number;
  held_by_quiet_hours_now: number;
  capped_now: number;
  sample: string[];
};

export type PlanOption = {
  id: DeliveryDecisionOption;
  effect: { now: number; later: number; dropped: number; until: string | null };
  suggested_at?: string;
  requires?: string[];
};

/** `notifications.plan`: qué pasaría si se envía ahora (no envía nada). */
export type NotificationPlan = {
  object: "notification_plan";
  plan_hash: string;
  decision: "send_now" | "send_later" | "partial" | "blocked";
  summary: {
    recipients: number;
    reachable: number;
    now: number;
    later: number;
    dropped: number;
    first_at: string | null;
    last_at: string | null;
    held_until: string | null;
    main_reason: string | null;
    test: boolean;
    exact: boolean;
    sampled: number;
    recipients_is_minimum: boolean;
  };
  rules: PlanRule[];
  timeline: Array<{ at: string; recipients: number; channel: "push" | "inbox" }>;
  reach: PlanReach;
  options: PlanOption[];
  recommended: DeliveryDecisionOption;
  generated_at: string;
};

/** El cuerpo de un envío sin exigir el contenido (se planea antes de escribirlo). */
export type NotificationPlanInput = Omit<SendNotificationInput, "title"> & { title?: string };

export type NotificationEstimate = PlanReach & { object: "notification_estimate"; exact: boolean; recipients_is_minimum: boolean; plan_hash: string };

export type InAppEstimateInput = {
  audience?: { filters: AudienceFilter[] } | null;
  platforms?: Array<"ios" | "android" | "web"> | null;
  subscribers?: string[] | null;
  /** Con `layout` (y `content`), `per_platform` dice además qué diseño se pinta en cada plataforma. */
  layout?: InAppLayout;
  content?: Record<string, unknown>;
  platform_overrides?: InAppPlatformOverrides | null;
  variants?: Array<Record<string, unknown>> | null;
};

/** Lo que pinta un cliente: el diseño, cómo se adaptó (`rendered_as`) o por qué no se muestra (`skip`). */
export type PlatformRendering = { layout: InAppLayout | null; rendered_as: string | null; skip: "unsupported_layout" | "unsupported_content" | null };
/** Una plataforma en el plan o la estimación: si se apunta, cuántas personas y qué se pinta allí. */
export type PlatformPlan = {
  /** Está en `platforms` (o `platforms` es null). */
  targeted: boolean;
  eligible: number;
  /** Las claves de `platform_overrides` que se aplican, de la menos a la más específica (`["mobile", "ios"]`; en variantes también `variant.<clave>`). */
  overrides: string[];
  /** In-app: el diseño tras los overrides. */
  layout?: InAppLayout;
  /** Lleva HTML en esa plataforma. */
  html?: boolean;
  /** Lo que pinta un SDK al día (todos los diseños, bloques y features; con los interruptores de apagado). */
  rendered?: PlatformRendering;
  /** Lo que pinta una app que no declara nada (sin `Customy-Client`). */
  legacy?: PlatformRendering;
  /** Tarjetas: el `kind` tras los overrides. */
  kind?: ContentCardKind;
  variants?: Array<{ id: string; layout?: InAppLayout; kind?: ContentCardKind; overrides: string[]; html?: boolean; rendered?: PlatformRendering; legacy?: PlatformRendering }>;
};
export type PerPlatformPlan = { ios: PlatformPlan; android: PlatformPlan; web: PlatformPlan };

export type InAppEstimate = {
  object: "in_app_estimate";
  eligible: number;
  by_platform: { ios: number; android: number; web: number };
  exact: boolean;
  sampled: number;
  /** Por plataforma: elegibilidad y el diseño que se pinta (un Send anterior no lo devuelve). */
  per_platform?: PerPlatformPlan;
};

export type InAppPlanInput = Omit<InAppEstimateInput, "platform_overrides"> & {
  subject?: "in_app" | "content_card";
  /** Un mensaje o tarjeta existente; lo que venga en el cuerpo lo sustituye. */
  id?: string;
  layout?: string;
  content?: Record<string, unknown>;
  starts_at?: string;
  ends_at?: string | null;
  /** In-app: `InAppPlatformOverrides`; tarjetas: `ContentCardPlatformOverrides`. */
  platform_overrides?: InAppPlatformOverrides | ContentCardPlatformOverrides | null;
};

export type InAppPlan = {
  object: "in_app_plan";
  plan_hash: string;
  decision: "send_now" | "send_later" | "blocked";
  summary: { subject: "in_app" | "content_card"; eligible: number; status: string; approval_required: boolean; approved: boolean; starts_at: string | null; ends_at: string | null; exact: boolean; sampled: number };
  rules: PlanRule[];
  timeline: Array<{ at: string; recipients: number; channel: "in_app" | "content_card" }>;
  reach: Omit<InAppEstimate, "object" | "per_platform">;
  /** Por plataforma: si se apunta, cuántas personas y qué diseño se pinta (un Send anterior no lo devuelve). */
  per_platform?: PerPlatformPlan;
  options: PlanOption[];
  recommended: null;
  generated_at: string;
};

export type CancelNotificationResult = Notification & {
  canceled_jobs: number;
  canceled_devices: number;
  recalled_devices: number;
  inbox_removed: number;
};

export type FrequencyCap = { per: "hour" | "day" | "week"; max: number };

export type NotificationCategoryInput = {
  name: string;
  android_channel_id?: string | null;
  default_interruption_level?: InterruptionLevel | null;
  /** Lo que recibe una persona hasta que cambie sus preferencias. Por defecto push y bandeja. */
  default_channels?: NotificationChannel[];
  frequency_cap?: FrequencyCap | null;
  /** Sin preferencias ni topes (códigos, seguridad). */
  transactional?: boolean;
};

export type NotificationCategory = {
  object: "notification_category";
  id: string;
  name: string;
  android_channel_id: string | null;
  default_interruption_level: InterruptionLevel | null;
  default_channels: NotificationChannel[];
  frequency_cap: FrequencyCap | null;
  transactional: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationSettingsInput = {
  frequency_caps?: FrequencyCap[];
  quiet_hours?: QuietHours | null;
  /** Por minuto. */
  provider_budgets?: { apns?: number; fcm?: number; webpush?: number };
  /** `true` (por defecto) = un mensaje in-app o una tarjeta solo se activa aprobado por otra persona. */
  require_approval?: boolean;
  /** Versión de la API fijada para la cuenta (`YYYY-MM-DD`); `null` = la de cada llave. */
  api_version?: string | null;
  /** Configuración remota de las apps (`GET /client/config`); lo que no viene queda igual. */
  client_config?: ClientConfigSettingsInput;
  /** País de la cuenta (ISO 3166-1 alfa-2): el de quien no tiene uno; `CO` activa las ventanas legales. */
  country?: string | null;
  /** Ventanas legales de contacto para mercadeo (Ley 2300 en CO); `null` = activas si el país tiene una. */
  legal_windows?: boolean | null;
};

export type NotificationSettings = {
  object: "notification_settings";
  frequency_caps: FrequencyCap[];
  quiet_hours: QuietHours | null;
  provider_budgets: { apns?: number; fcm?: number; webpush?: number };
  updated_at: string | null;
  require_approval?: boolean;
  api_version?: string | null;
  client_config?: ClientConfigSettings;
  country?: string | null;
  legal_windows?: boolean | null;
  legal_windows_active?: boolean;
  legal_window_presets?: string[];
};

export type ChannelPreference = { push: boolean; inbox: boolean };

/** Atributos planos de una persona para personalizar (`{{ first_name }}`) y segmentar (`attributes.plan`). */
export type SubscriberAttributes = Record<string, string | number | boolean>;

export type SubscriberInput = {
  /** Zona IANA; `null` la borra. */
  timezone?: string | null;
  locale?: string | null;
  quiet_hours?: QuietHours | null;
  /** Se mezclan con los guardados; un valor `null` borra esa clave (≤ 50 claves, ≤ 4 KB). */
  attributes?: Record<string, string | number | boolean | null>;
};

/** Una persona encontrada por atributo (`subscribers.find`), con sus dispositivos (sin token). */
export type SubscriberMatch = Subscriber & { devices: PushDevice[] };

export type Subscriber = {
  object: "subscriber";
  id: string;
  timezone: string | null;
  locale: string | null;
  quiet_hours: QuietHours | null;
  preferences: Record<string, Partial<ChannelPreference>>;
  attributes?: SubscriberAttributes;
  created_at: string | null;
  updated_at: string | null;
};

/** Preferencias efectivas: cada categoría del catálogo (con su nombre) y las guardadas. */
export type SubscriberPreferences = {
  object: "subscriber_preferences";
  subscriber: string;
  categories: Record<string, ChannelPreference & { name?: string; transactional?: boolean }>;
};

export type PreferencesInput = { categories: Record<string, Partial<ChannelPreference>> };

export type NotificationStats = {
  object: "notification_stats";
  from: string;
  to: string;
  data: Array<{ day: string; channel: string; event: string; count: number }>;
  /** Lo que decidió el planificador en el rango, por regla y efecto. */
  decisions?: Record<string, number>;
  /** Los envíos de prueba, aparte (nunca entran en `data`). */
  test?: { notifications: number; data: Array<{ day: string; channel: string; event: string; count: number }> };
};

export type ConversionInput = {
  subscriber: string;
  /** Id propio de la conversión (8…120): repetirla con el mismo id no la cuenta dos veces. */
  id: string;
  event?: string;
  value?: number;
};

export type PushPlatform = "ios" | "android";
export type PushProvider = "apns" | "fcm";

export type PushDevice = {
  object: "push_device";
  id: string;
  subscriber: string;
  platform: PushPlatform;
  provider: PushProvider;
  /** Solo la cola del token: el token completo nunca vuelve. */
  token_hint: string;
  sandbox: boolean;
  app_id: string | null;
  app_version: string | null;
  locale: string | null;
  failures: number;
  last_success_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegisterDeviceInput = {
  platform: PushPlatform;
  /** Por defecto `apns` en iOS y `fcm` en Android. */
  provider?: PushProvider;
  token: string;
  /** APNs de desarrollo. */
  sandbox?: boolean;
  app_id?: string;
  app_version?: string;
  locale?: string;
};

export type PushCredential = {
  object: "push_credential";
  provider: PushProvider;
  project: string | null;
  client_email: string | null;
  team_id: string | null;
  key_id: string | null;
  bundle_id: string | null;
  fingerprint: string;
  rate_per_minute: number | null;
  broken: boolean;
  broken_reason: string | null;
  broken_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InboxItem = {
  object: "inbox_item";
  id: string;
  notification_id: string;
  category: string | null;
  title: string;
  body: string | null;
  url: string | null;
  icon: string | null;
  image: string | null;
  tag: string | null;
  data: Record<string, unknown> | null;
  seen: boolean;
  read: boolean;
  archived: boolean;
  interacted: boolean;
  created_at: string;
};

export type InboxCounts = { unread: number; unseen: number; version: number };
export type InboxStatus = "all" | "unread" | "archived";
export type InboxAction = "seen" | "read" | "unread" | "archived";

export type InboxPage = {
  object: "list";
  data: InboxItem[];
  has_more: boolean;
  next_cursor: string | null;
  counts: InboxCounts;
};

export type SubscriberToken = { object: "subscriber_token"; token: string; subscriber: string; expires_at: string };

export type InAppLayout = "modal" | "banner" | "fullscreen" | "card" | "slideup" | "tooltip" | "html";
export type InAppButtonStyle = "primary" | "secondary" | "link";
/** Acción del sistema de un botón: `request_push_permission` pide el permiso de notificaciones. */
export type InAppButtonAction = "request_push_permission";
export type InAppButton = {
  id: string;
  label: string;
  /** Ruta de la app (`/facturas`) o URL https. */
  url?: string;
  dismiss?: boolean;
  style?: InAppButtonStyle;
  action?: InAppButtonAction | null;
};

/** Colores y forma del mensaje (`#rrggbb`); con `brand_kit_id` Send mezcla el kit al servirlo. */
export type InAppStyle = {
  background?: string;
  text?: string;
  accent?: string;
  /** 0…32. */
  radius?: number;
  /** Opacidad del fondo detrás del mensaje, 0…0.9. */
  overlay?: number;
  [key: string]: unknown;
};

export type InAppBlockAlign = "start" | "center";
export type InAppHeadingBlock = { type: "heading"; text: string; align?: InAppBlockAlign };
export type InAppTextBlock = { type: "text"; text: string; align?: InAppBlockAlign };
/** `aspect` = ancho / alto (1.78 = 16:9). */
export type InAppImageBlock = { type: "image"; url: string; alt?: string; aspect?: number };
export type InAppButtonsBlock = { type: "buttons"; items: InAppButton[] };
export type InAppSpacerBlock = { type: "spacer"; size?: 8 | 16 | 24 | 32 };
export type InAppDividerBlock = { type: "divider" };
export type InAppSurveyKind = "single" | "multi" | "rating" | "text";
export type InAppSurveyOption = { id: string; label: string };
export type InAppSurveyBlock = {
  type: "survey";
  /** Vuelve en `survey_response` como `survey_id`. */
  id: string;
  question: string;
  kind: InAppSurveyKind;
  /** `single` y `multi`. */
  options?: InAppSurveyOption[];
  /** `rating`: el máximo de la escala (5, 10). */
  scale?: number;
  submit_label?: string;
  thanks?: string;
};
/** Un bloque del contenido: con `blocks` la app pinta los bloques en lugar de título, cuerpo, imagen y botones. */
export type InAppBlock = InAppHeadingBlock | InAppTextBlock | InAppImageBlock | InAppButtonsBlock | InAppSpacerBlock | InAppDividerBlock | InAppSurveyBlock;
export type InAppBlockType = InAppBlock["type"];

/** Contenido v1 (título, cuerpo, imagen, botones) para las apps que no pueden pintar el diseño. */
export type InAppFallbackContent = { title?: string; body?: string; image?: string; buttons?: InAppButton[] };

export type InAppLocaleContent = {
  title?: string;
  body?: string;
  image?: string;
  buttons?: InAppButton[];
  blocks?: InAppBlock[];
  html?: string;
};

export type InAppContent = {
  title?: string;
  body?: string;
  image?: string;
  buttons?: InAppButton[];
  style?: InAppStyle;
  locales?: Record<string, InAppLocaleContent>;
  blocks?: InAppBlock[];
  /**
   * HTML (≤ 200 KB) en cualquier diseño salvo `tooltip` (422 `html_not_allowed_in_tooltip`); `html`
   * es el alias de siempre de modal + HTML. Manda sobre `blocks` y título/cuerpo; la app lo aísla
   * (ver `HTML_CSP`, `BRIDGE_SCRIPT` y `buildHtmlDocument` en `./inbox`).
   */
  html?: string;
  /** Solo en `tooltip`: la clave del elemento que registró la app; si no está en pantalla se pinta como `slideup`. */
  anchor?: string;
  /** `slideup` y `banner`. */
  position?: "top" | "bottom";
  brand_kit_id?: string | null;
  fallback?: InAppFallbackContent | null;
};
export type InAppStatus = "draft" | "in_review" | "approved" | "active" | "paused" | "archived";

export type FilterOp = "eq" | "neq" | "in" | "nin" | "gte" | "lte" | "exists" | "not_exists" | "contains";
export type AudienceField = "locale" | "platform" | "app_version" | "timezone" | `attributes.${string}`;
export type AudienceFilter = { field: AudienceField; op: FilterOp; value?: unknown };
/** Todas las condiciones a la vez (Y); `null` = todas las personas. */
export type Audience = { filters: AudienceFilter[] };
/** Condición sobre una propiedad del evento que dispara el mensaje. */
export type TriggerFilter = { property: string; op: FilterOp; value?: unknown };
/** Una variante A/B: reparto fijo por persona según `weight`. */
export type InAppVariant = {
  id: string;
  weight: number;
  layout?: InAppLayout;
  content: InAppContent;
  /** El diseño de la variante por plataforma, aplicado después del del mensaje. */
  platform_overrides?: InAppPlatformOverrides | null;
};

/** `ios`, `android`, `web` y `mobile` (= ios y android, salvo que la específica diga otra cosa). */
export type OverridePlatform = "ios" | "android" | "web" | "mobile";
/** Un idioma dentro de un override: `null` quita el valor de la base en esa plataforma. */
export type InAppLocaleOverride = { title?: string | null; body?: string | null; buttons?: InAppButton[] | null; blocks?: InAppBlock[] | null; html?: string | null };
/**
 * Contenido parcial de un override. Un campo reemplaza al de la base; `null` lo quita en esa
 * plataforma; `style` se mezcla clave a clave; `locales` por idioma (`null` quita el idioma). Un
 * campo traducible (title, body, buttons, blocks, html) puesto arriba lo reemplaza en todos los
 * idiomas, salvo los que el override traduzca en su `locales`.
 */
export type InAppOverrideContent = {
  title?: string | null;
  body?: string | null;
  image?: string | null;
  buttons?: InAppButton[] | null;
  blocks?: InAppBlock[] | null;
  /** Nunca en `tooltip` (422 `html_not_allowed_in_tooltip` en `platform_overrides.<p>.content.html`). */
  html?: string | null;
  fallback?: InAppFallbackContent | null;
  style?: InAppStyle | null;
  position?: "top" | "bottom" | null;
  anchor?: string | null;
  locales?: Record<string, InAppLocaleOverride | null> | null;
};
export type InAppPlatformOverride = { layout?: InAppLayout; content?: InAppOverrideContent };
/**
 * Un mensaje, un diseño por plataforma (2026-09-28). Al pedirlo: base → `mobile` (ios/android) →
 * la plataforma → la variante → los overrides de la variante → lo que la app sabe pintar (§8) y
 * las reglas de HTML (§9). Una plataforma desconocida recibe la base.
 */
export type InAppPlatformOverrides = Partial<Record<OverridePlatform, InAppPlatformOverride>>;
/** Conversión: un evento `custom` con ese nombre dentro de la ventana tras verlo. */
export type ConversionGoal = { event: string; window_hours: number };

/** Quién pidió, aprobó o rechazó la publicación (el sujeto del token o `x-customy-actor`). */
export type ApprovalFields = {
  created_by?: string | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
};

export type InAppMessageInput = {
  name: string;
  layout: InAppLayout;
  content: InAppContent;
  /** `null` = todas las personas. */
  subscribers?: string[] | null;
  /** Personas por condiciones (idioma, plataforma, versión, zona, `attributes.<clave>`), en lugar de `subscribers`. */
  audience?: Audience | null;
  /** `null` (por defecto) = todas; si no, solo en esas apps (`ios`, `android`, `web`). */
  platforms?: Array<"ios" | "android" | "web"> | null;
  /** `session_start` (por defecto), `now` o un evento de la app (`checkout_viewed`). */
  trigger_event?: string;
  /** Condiciones sobre las propiedades del evento. */
  trigger_filters?: TriggerFilter[];
  /** Espera antes de mostrarlo, 0…3600 s. */
  delay_seconds?: number;
  /** −100…100; gana el mayor. */
  priority?: number;
  /** `once` (por defecto), `always` o `every:<segundos>`. */
  frequency?: string;
  starts_at?: string;
  ends_at?: string | null;
  status?: InAppStatus;
  source?: NotificationSource;
  variants?: InAppVariant[] | null;
  /** 0…50: porcentaje que no ve nada (grupo de control de las conversiones). */
  control_pct?: number;
  conversion?: ConversionGoal | null;
  /** Solo procedencia. */
  template_id?: string | null;
  /** Un diseño por plataforma (web, ios, android, mobile); editarlo devuelve el mensaje a borrador como cualquier cambio de contenido. */
  platform_overrides?: InAppPlatformOverrides | null;
};

export type InAppMessage = ApprovalFields & {
  object: "in_app_message";
  id: string;
  name: string;
  layout: InAppLayout;
  content: InAppContent;
  subscribers: string[] | null;
  platforms: Array<"ios" | "android" | "web"> | null;
  trigger_event: string;
  priority: number;
  frequency: string;
  starts_at: string;
  ends_at: string | null;
  status: InAppStatus;
  source: NotificationSource | null;
  created_at: string;
  updated_at: string;
  funnel?: NotificationFunnel;
  /** En la creación: `true` si esta `Idempotency-Key` ya lo había creado (no se duplicó). */
  replayed?: boolean;
  audience?: Audience | null;
  trigger_filters?: TriggerFilter[];
  delay_seconds?: number;
  variants?: InAppVariant[] | null;
  control_pct?: number;
  conversion?: ConversionGoal | null;
  template_id?: string | null;
  platform_overrides?: InAppPlatformOverrides | null;
};

/** Resultado de `test`: esa persona lo ve en su próxima lectura durante 24 h, aunque no le toque. */
export type InAppTestResult = {
  object: "in_app_test";
  id: string;
  subscriber: string;
  variant_id: string | null;
  expires_at: string;
  /** Cuándo se mandó esta prueba (la app muestra primero las pruebas, la más reciente antes). */
  test_sent_at?: string;
  /** Id del push silencioso que hace que la app abierta vuelva a pedir (`customy_refresh`), o null. */
  refresh_push?: string | null;
};
export type ContentCardTestResult = Omit<InAppTestResult, "object"> & { object: "content_card_test" };

/** Lo que hizo quien prueba (sus eventos no cuentan en las métricas reales). */
export type EngagementTestStats = {
  impressions: number;
  clicks: number;
  clicks_by_action: Record<string, number>;
  dismissals: number;
  /** Solo en mensajes in-app: la última respuesta de cada persona que prueba. */
  survey?: Record<string, SurveyStats>;
  users: number;
  /** El último evento de prueba (ISO) o null. */
  last_at: string | null;
  /** Lo mismo por plataforma (`conversions` siempre 0: las pruebas no convierten). Un Send anterior no lo devuelve. */
  by_platform?: EngagementByPlatform<EngagementTestPlatformCounters>;
};
export type EngagementTestPlatformCounters = { impressions: number; clicks: number; clicks_by_action: Record<string, number>; dismissals: number; conversions: number; users: number };
/** Por plataforma; `unknown` = eventos sin plataforma (SDK anteriores y lo previo al desglose). */
export type EngagementByPlatform<T> = { ios: T; android: T; web: T; unknown: T };

/** Un evento de quien prueba, del más reciente al más antiguo (`testEvents`). */
export type EngagementTestEvent = {
  object: "in_app_test_event" | "content_card_test_event";
  id: string;
  type: "impression" | "clicked" | "dismissed" | "converted" | "survey_response" | (string & {});
  subscriber: string | null;
  /** El botón (id) en un clic. */
  action: string | null;
  variant_id: string | null;
  rendered_as: string | null;
  survey_id?: string;
  answers?: string[] | number | string | null;
  occurred_at: string;
};

export type EngagementCounters = {
  impressions: number;
  clicks: number;
  clicks_by_action: Record<string, number>;
  dismissals: number;
  conversions: number;
  /** Conversiones / personas (0 sin personas). */
  conversion_rate: number;
};
export type SurveyStats = { responses: number; distribution: Record<string, number> };
export type EngagementStats = EngagementCounters & {
  by_variant: Record<string, EngagementCounters & { users: number }>;
  /** Impresiones, clics (por botón), cierres y conversiones por plataforma (un Send anterior no lo devuelve). */
  by_platform?: EngagementByPlatform<EngagementCounters & { users: number }>;
  control: { conversions: number; users: number };
  survey: Record<string, SurveyStats>;
  /** Apps que no podían pintarlo y no había alternativa. */
  skipped_unsupported: number;
  /** Personas distintas que lo vieron. */
  users: number;
  /** Los eventos de quien prueba, aparte (un Send anterior no lo devuelve). */
  test?: EngagementTestStats;
};
export type InAppStats = EngagementStats & { object: "in_app_stats"; id: string };
export type ContentCardStats = EngagementStats & { object: "content_card_stats"; id: string };

/** Un paso del flujo de publicación (enviar, aprobar, rechazar, activar, pausar). */
export type ApprovalEvent = {
  object: "approval_event";
  action: string;
  actor: string | null;
  from_status: InAppStatus | null;
  to_status: InAppStatus;
  reason: string | null;
  created_at: string;
};

export type InAppTemplateInput = {
  name: string;
  description?: string | null;
  layout: InAppLayout;
  content: InAppContent;
  thumbnail_url?: string | null;
  tags?: string[];
  platform_overrides?: InAppPlatformOverrides | null;
};
export type InAppTemplate = {
  object: "in_app_template";
  id: string;
  name: string;
  description: string | null;
  layout: InAppLayout;
  content: InAppContent;
  thumbnail_url: string | null;
  tags: string[];
  platform_overrides?: InAppPlatformOverrides | null;
  /** Las de Send: solo lectura. */
  builtin: boolean;
  created_at: string;
  updated_at: string;
};

export type BrandKitColors = { background: string; text: string; accent: string; muted: string };
export type BrandKitInput = {
  name: string;
  colors: BrandKitColors;
  radius?: number;
  font_family?: string | null;
  logo_url?: string | null;
  default?: boolean;
};
export type BrandKit = {
  object: "brand_kit";
  id: string;
  name: string;
  colors: BrandKitColors;
  radius: number;
  font_family: string | null;
  logo_url: string | null;
  default: boolean;
  created_at: string;
  updated_at: string;
};

export type ContentCardKind = "classic" | "captioned" | "banner";
export type ContentCardLocaleContent = { title?: string; body?: string; button_label?: string; url?: string; image?: string };
export type ContentCardVariant = { id: string; weight: number; kind?: ContentCardKind; title?: string; body?: string; image?: string; url?: string; button_label?: string; platform_overrides?: ContentCardPlatformOverrides | null };
/** Una tarjeta por plataforma (el enlace de la web y el deep link de la app, otra imagen…); `null` quita el valor. */
export type ContentCardOverride = {
  kind?: ContentCardKind;
  title?: string | null;
  body?: string | null;
  image?: string | null;
  url?: string | null;
  button_label?: string | null;
  locales?: Record<string, { title?: string | null; body?: string | null; button_label?: string | null; url?: string | null; image?: string | null } | null> | null;
};
export type ContentCardPlatformOverrides = Partial<Record<OverridePlatform, ContentCardOverride>>;
export type ContentCardStatus = InAppStatus;

export type ContentCardInput = {
  name: string;
  kind?: ContentCardKind;
  title: string;
  body?: string | null;
  image?: string | null;
  /** Ruta de la app o URL https. */
  url?: string | null;
  button_label?: string | null;
  /** Fija arriba del feed. */
  pinned?: boolean;
  dismissible?: boolean;
  starts_at?: string;
  ends_at?: string | null;
  platforms?: Array<"ios" | "android" | "web"> | null;
  subscribers?: string[] | null;
  audience?: Audience | null;
  locales?: Record<string, ContentCardLocaleContent>;
  variants?: ContentCardVariant[] | null;
  control_pct?: number;
  conversion?: ConversionGoal | null;
  status?: ContentCardStatus;
  priority?: number;
  platform_overrides?: ContentCardPlatformOverrides | null;
};

export type ContentCard = ApprovalFields & {
  object: "content_card";
  id: string;
  name: string;
  kind: ContentCardKind;
  title: string;
  body: string | null;
  image: string | null;
  url: string | null;
  button_label: string | null;
  pinned: boolean;
  dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
  platforms: Array<"ios" | "android" | "web"> | null;
  subscribers: string[] | null;
  audience: Audience | null;
  locales: Record<string, ContentCardLocaleContent>;
  variants: ContentCardVariant[] | null;
  control_pct: number;
  conversion: ConversionGoal | null;
  status: ContentCardStatus;
  priority: number;
  platform_overrides?: ContentCardPlatformOverrides | null;
  created_at: string;
  updated_at: string;
};

/** Lo que recibe la app de `GET /client/content-cards`: ya en su idioma y con la variante aplicada. */
export type EligibleContentCard = {
  id: string;
  kind: ContentCardKind;
  title: string;
  body: string | null;
  image: string | null;
  url: string | null;
  button_label: string | null;
  pinned: boolean;
  dismissible: boolean;
  priority: number;
  starts_at: string;
  ends_at: string | null;
  variant_id: string | null;
  test: boolean;
  /** Solo en pruebas: cuándo se mandó la última a esta persona (ISO). Mostrar primero, la más reciente antes. */
  test_sent_at?: string | null;
};

/** `POST /api/templates/preview`: `text` o `content` con `{{ variables }}`, para una persona o unos atributos. */
export type TemplatePreviewInput = {
  text?: string;
  content?: Record<string, unknown>;
  subscriber?: string;
  attributes?: Record<string, unknown>;
  locale?: string;
};
export type TemplatePreview = {
  object: "template_preview";
  text?: string;
  content?: Record<string, unknown>;
  /** Las variables que usa. */
  variables: string[];
};

export type ClientKillSwitches = { in_app: boolean; content_cards: boolean; html: boolean; push?: boolean; inbox?: boolean };
/** La parte de los ajustes que llega a las apps. */
export type ClientConfigSettings = {
  poll_seconds: number;
  features: Record<string, boolean>;
  min_sdk: string | null;
  kill: ClientKillSwitches;
};
export type ClientConfigSettingsInput = {
  poll_seconds?: number;
  features?: Record<string, boolean>;
  min_sdk?: string | null;
  kill?: Partial<ClientKillSwitches>;
};
/** `GET /client/config`: configuración remota; un interruptor de `kill` oculta esa función al momento. */
export type ClientConfig = ClientConfigSettings & { object?: "client_config"; api_version: string | null };

/** `html_layouts`: la app pinta `content.html` en modal, fullscreen, banner, card y slideup (§9; opcional). */
export type ClientFeature = "variables" | "content_cards" | "bridge_v1" | "push_primer" | "html_layouts" | (string & {});
/** Lo que la app sabe pintar: viaja en la cabecera `Customy-Client` y Send adapta cada mensaje a ello. */
export type ClientCapabilities = {
  /** `send/<versión>`; lo pone el SDK. */
  sdk?: string;
  app_version?: string;
  platform?: "ios" | "android" | "web";
  layouts?: readonly InAppLayout[];
  blocks?: readonly InAppBlockType[];
  features?: readonly ClientFeature[];
};

/** Lo que recibe la app: el mensaje ya en su idioma, sin la audiencia. */
export type EligibleInAppMessage = {
  id: string;
  layout: InAppLayout;
  trigger_event: string;
  priority: number;
  frequency: string;
  ends_at: string | null;
  content: {
    title?: string;
    body?: string;
    image?: string;
    buttons: InAppButton[];
    style: InAppStyle;
    blocks?: InAppBlock[];
    html?: string;
    anchor?: string;
    position?: "top" | "bottom";
  };
  /** Solo se muestra si las propiedades del evento las cumplen todas (`matchesFilters`). */
  trigger_filters?: TriggerFilter[];
  /** Segundos de espera tras el disparador. */
  delay_seconds?: number;
  variant_id?: string | null;
  /** Envío de prueba: se muestra aunque no le toque. */
  test?: boolean;
  /** Solo en pruebas: cuándo se mandó la última a esta persona (ISO). Mostrar primero, la más reciente antes, sin esperar a la regla de uno por sesión. */
  test_sent_at?: string | null;
  /** Si Send lo adaptó a lo que la app sabe pintar: `slideup`, `modal`, `fallback`, `blocks_dropped`. */
  rendered_as?: string | null;
};

export type ClientEventType =
  | "delivered"
  | "displayed"
  | "opened"
  | "clicked"
  | "dismissed"
  | "impression"
  | "converted"
  | "in_app_impression"
  | "in_app_click"
  | "in_app_dismiss"
  | "card_impression"
  | "card_click"
  | "card_dismiss"
  | "survey_response"
  | "custom";

/** Respuesta de una encuesta: las opciones elegidas, una nota o un texto. */
export type SurveyAnswers = string[] | number | string;

/** Un recibo del cliente para `POST /client/events`. */
export type ClientEvent = {
  /** Id estable (8…80): si el lote se reintenta, el servidor no lo cuenta dos veces. El SDK lo pone si falta. */
  id?: string;
  type: ClientEventType;
  notification_id?: string;
  in_app_id?: string;
  channel?: "inbox" | "apns" | "fcm" | "webpush" | "in_app";
  device_id?: string;
  /** Botón pulsado. */
  action?: string;
  value?: number;
  occurred_at?: string;
  variant_id?: string | null;
  /** Cómo se pintó el mensaje in-app si Send lo adaptó. */
  rendered_as?: string | null;
  /** Dónde pasó (`ios`, `android`, `web`): alimenta `by_platform`. El cliente de `./inbox` lo pone solo si conoce su plataforma. */
  platform?: "ios" | "android" | "web";
  card_id?: string;
  survey_id?: string;
  answers?: SurveyAnswers;
  /** `custom`: nombre (≤ 60) y propiedades (≤ 2 KB). */
  name?: string;
  properties?: Record<string, unknown>;
};
