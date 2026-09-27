/**
 * Tipos de Customy Engage (notificaciones push, bandeja in-app, mensajes in-app
 * y embudo), con los nombres de campo del contrato HTTP v1. Los comparten el
 * cliente de servidor y el cliente de las apps.
 *
 * @deprecated Son los mismos tipos que exporta `@customyai/send` (este fichero
 * es una copia exacta, solo de tipos, para que las declaraciones de 1.x no
 * cambien de nombre); los valores pasan de uno a otro sin conversión.
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
};

export type SendNotificationInput = {
  /** El id de usuario de la app, o hasta 1000. */
  to: string | string[];
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
};

export type NotificationSettings = {
  object: "notification_settings";
  frequency_caps: FrequencyCap[];
  quiet_hours: QuietHours | null;
  provider_budgets: { apns?: number; fcm?: number; webpush?: number };
  updated_at: string | null;
};

export type ChannelPreference = { push: boolean; inbox: boolean };

export type SubscriberInput = {
  /** Zona IANA; `null` la borra. */
  timezone?: string | null;
  locale?: string | null;
  quiet_hours?: QuietHours | null;
};

export type Subscriber = {
  object: "subscriber";
  id: string;
  timezone: string | null;
  locale: string | null;
  quiet_hours: QuietHours | null;
  preferences: Record<string, Partial<ChannelPreference>>;
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

export type InAppLayout = "modal" | "banner" | "fullscreen" | "card";
export type InAppButton = { id: string; label: string; url?: string; dismiss?: boolean };
export type InAppContent = {
  title?: string;
  body?: string;
  image?: string;
  buttons?: InAppButton[];
  style?: Record<string, unknown>;
  locales?: Record<string, { title?: string; body?: string; buttons?: InAppButton[] }>;
};
export type InAppStatus = "draft" | "active" | "paused" | "archived";

export type InAppMessageInput = {
  name: string;
  layout: InAppLayout;
  content: InAppContent;
  /** `null` = todas las personas. */
  subscribers?: string[] | null;
  /** `null` (por defecto) = todas; si no, solo en esas apps (`ios`, `android`, `web`). */
  platforms?: Array<"ios" | "android" | "web"> | null;
  /** `session_start` (por defecto), `now` o un evento de la app (`checkout_viewed`). */
  trigger_event?: string;
  /** −100…100; gana el mayor. */
  priority?: number;
  /** `once` (por defecto), `always` o `every:<segundos>`. */
  frequency?: string;
  starts_at?: string;
  ends_at?: string | null;
  status?: InAppStatus;
  source?: NotificationSource;
};

export type InAppMessage = {
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
};

/** Lo que recibe la app: el mensaje ya en su idioma, sin la audiencia. */
export type EligibleInAppMessage = {
  id: string;
  layout: InAppLayout;
  trigger_event: string;
  priority: number;
  frequency: string;
  ends_at: string | null;
  content: { title?: string; body?: string; image?: string; buttons: InAppButton[]; style: Record<string, unknown> };
};

export type ClientEventType = "delivered" | "displayed" | "opened" | "clicked" | "dismissed" | "impression" | "converted";

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
};
