/**
 * @customyai/send-sdk/inbox — el cliente de Customy Engage para las apps de las
 * personas (navegador, React Native, escritorio).
 *
 * @deprecated Usa `@customyai/send/inbox`: este módulo es su adaptador. El
 * cliente, el tiempo real, los recibos y las marcas son los de
 * `@customyai/send/inbox`; aquí solo se mantiene la forma de 1.x (sus errores
 * son el `CustomySendError` de este paquete, con los códigos y `retryAfterMs`
 * de siempre).
 */
import {
  createInboxClient as createClient,
  type InboxClientOptions as ClientOptions,
  type InboxState as ClientState,
} from "@customyai/send/inbox";
import type {
  ChannelPreference,
  ClientCapabilities,
  ClientConfig,
  ClientEvent,
  EligibleContentCard,
  EligibleInAppMessage,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxStatus,
  PushDevice,
  RegisterDeviceInput,
  SubscriberPreferences,
  SurveyAnswers,
} from "../engage-types";
import { warnDeprecated } from "../deprecation";
import { CustomySendError, legacyCall, toLegacySendError } from "../errors";

export { CustomySendError } from "../errors";
export {
  actionCategoryId,
  BRIDGE_SCRIPT,
  buildHtmlDocument,
  createInAppPresenter,
  DEFAULT_CAPABILITIES,
  formatBadgeCount,
  HTML_CSP,
  isSafeBridgeUrl,
  matchesFilter,
  matchesFilters,
  parseBridgeMessage,
  subscriberTokenExpiry,
  type ActionCategoryInput,
  type BridgeMessage,
  type BridgeMessageType,
  type FilterCondition,
  type InAppPresenter,
  type InAppPresenterClient,
  type InAppPresenterOptions,
} from "@customyai/send/inbox";
export type {
  ChannelPreference,
  SubscriberPreferences,
  ClientCapabilities,
  ClientConfig,
  ClientEvent,
  ClientEventType,
  ClientFeature,
  ClientKillSwitches,
  ContentCardKind,
  EligibleContentCard,
  EligibleInAppMessage,
  FilterOp,
  InAppBlock,
  InAppBlockAlign,
  InAppBlockType,
  InAppButton,
  InAppButtonAction,
  InAppButtonStyle,
  InAppButtonsBlock,
  InAppDividerBlock,
  InAppHeadingBlock,
  InAppImageBlock,
  InAppLayout,
  InAppSpacerBlock,
  InAppStyle,
  InAppSurveyBlock,
  InAppSurveyKind,
  InAppSurveyOption,
  InAppTextBlock,
  InboxAction,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxStatus,
  PushDevice,
  PushPlatform,
  PushProvider,
  RegisterDeviceInput,
  SurveyAnswers,
  TriggerFilter,
} from "../engage-types";

/** Versión de este paquete en `Customy-Client` (`sdk`). */
const SDK_ID = "send-sdk/1.4.0";

export type InAppTrackInput = { id: string; type: "impression" | "click" | "dismiss"; action?: string; variant_id?: string | null; rendered_as?: string | null };
export type CardTrackInput = { id: string; type: "impression" | "click" | "dismiss"; variant_id?: string | null };
export type SurveyResponseInput = { in_app_id: string; survey_id: string; answers: SurveyAnswers; variant_id?: string | null };
export type InAppMessagesQuery = { trigger?: string; properties?: Record<string, unknown>; appVersion?: string; locale?: string; refresh?: boolean };

/** Lo mínimo de un WebSocket (el del navegador, el de React Native o `ws`). */
export type WebSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};
export type WebSocketConstructor = new (url: string) => WebSocketLike;

export type InboxClientOptions = {
  /** Por defecto https://send-api.customy.ai */
  baseUrl?: string;
  /**
   * Devuelve un token de suscriptor vigente (`sst_…`) pidiéndoselo al backend
   * de la app. Se llama al empezar, poco antes de que caduque y tras un 401.
   */
  token: () => Promise<string>;
  fetch?: typeof fetch;
  /** Por defecto el `WebSocket` global; `null` desactiva el tiempo real (solo sondeo). */
  WebSocket?: WebSocketConstructor | null;
  /** Elementos por página. Por defecto 20 (máximo 100). */
  pageSize?: number;
  /** Idioma de los mensajes in-app (`es`, `en-US`). */
  locale?: string;
  /**
   * Qué es esta app: `ios`, `android` o `web`. Los mensajes in-app dirigidos a otras
   * plataformas no se muestran aquí (uno sin plataformas llega a todas).
   */
  platform?: "ios" | "android" | "web";
  /** Intervalo del sondeo de contadores sin tiempo real. Por defecto 45 s. */
  pollIntervalMs?: number;
  /** Recibos: se envían cada `flushIntervalMs` (3 s) o al juntar `maxBatch` (20, máximo 100). */
  events?: { flushIntervalMs?: number; maxBatch?: number; maxQueue?: number };
  timeoutMs?: number;
  /** Reintentos ante red, 429 y 5xx. Por defecto 2. */
  maxRetries?: number;
  /** Tras tantos fallos seguidos del WebSocket se queda en sondeo. Por defecto 6. */
  maxRealtimeFailures?: number;
  /** Errores de fondo (tiempo real, sondeo, recibos) que no llegan a ninguna promesa. */
  onError?: (error: unknown) => void;
  /**
   * Lo que esta app sabe pintar (`DEFAULT_CAPABILITIES` si lo pinta todo): cada
   * petición lleva `Customy-Client`. Sin esta opción Send la trata como de 1.x.
   */
  capabilities?: ClientCapabilities;
};

export type InboxConnection = "idle" | "connecting" | "realtime" | "polling";

export type InboxState = {
  items: InboxItem[];
  status: InboxStatus;
  hasMore: boolean;
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: CustomySendError | null;
  /** `version` es −1 hasta la primera lectura. */
  counts: InboxCounts;
  connection: InboxConnection;
  inApp: { loaded: boolean; messages: EligibleInAppMessage[] };
  /** Configuración remota (`config()`); `null` hasta leerla. */
  config: ClientConfig | null;
  /** Tarjetas de contenido (`contentCards()`), fijadas primero. */
  cards: { loaded: boolean; items: EligibleContentCard[] };
};

export type InboxChange =
  | { type: "inbox"; counts: InboxCounts; reason?: string }
  | { type: "in_app"; id?: string };

export type InboxClient = ReturnType<typeof createInboxClient>;

export function createInboxClient(options: InboxClientOptions) {
  warnDeprecated("@customyai/send-sdk/inbox", "use @customyai/send/inbox (same client and options).");
  const onError = options?.onError;
  const capabilities = options?.capabilities;
  const client = createClient({
    ...(options as ClientOptions),
    ...(onError ? { onError: (error: unknown) => onError(toLegacySendError(error)) } : {}),
    ...(capabilities ? { capabilities: { ...capabilities, sdk: capabilities.sdk ?? SDK_ID } } : {}),
  });
  /** Un error de validación síncrono con la forma de 1.x. */
  const legacySync = <T>(operation: () => T): T => {
    try {
      return operation();
    } catch (error) {
      throw toLegacySendError(error);
    }
  };
  const track = Object.assign((events: ClientEvent | ClientEvent[]): void => client.track(events), {
    /** `in_app_impression|in_app_click|in_app_dismiss` con botón, variante y cómo se pintó. */
    inApp: (input: InAppTrackInput): void => client.track.inApp(input),
    /** `card_impression|card_click|card_dismiss`; al descartarla sale del feed. */
    card: (input: CardTrackInput): void => client.track.card(input),
  });
  // El estado cambia de referencia en cada actualización: se traduce una vez por referencia.
  let lastSource: ClientState | null = null;
  let lastState: InboxState | null = null;
  const legacyState = (source: ClientState): InboxState => {
    if (source !== lastSource || !lastState) {
      lastSource = source;
      lastState = { ...source, error: source.error ? (toLegacySendError(source.error) as CustomySendError) : null };
    }
    return lastState;
  };

  return {
    /** Estado actual (inmutable: cambia de referencia en cada actualización). */
    getState: (): InboxState => legacyState(client.getState()),
    /** Avisa de cada cambio de estado (para `useSyncExternalStore`). */
    onState(listener: () => void): () => void {
      return client.onState(listener);
    },
    /** Una página. Sin `cursor` sustituye la lista; con `cursor` la amplía. */
    list: (params: { cursor?: string | null; status?: InboxStatus; limit?: number } = {}): Promise<InboxPage> => legacyCall(() => client.list(params)),
    loadMore(): Promise<InboxPage | null> {
      return legacyCall(() => client.loadMore());
    },
    refresh: (): Promise<InboxPage> => legacyCall(() => client.refresh()),
    counts: (): Promise<InboxCounts> => legacyCall(() => client.counts()),
    markSeen: (ids: string[] | "all"): Promise<InboxCounts> => legacyCall(() => client.markSeen(ids)),
    markRead: (ids: string[] | "all"): Promise<InboxCounts> => legacyCall(() => client.markRead(ids)),
    markUnread: (ids: string[]): Promise<InboxCounts> => legacyCall(() => client.markUnread(ids)),
    archive: (ids: string[]): Promise<InboxCounts> => legacyCall(() => client.archive(ids)),
    track,
    opened: (notificationId: string, options: { action?: string; channel?: "apns" | "fcm" | "webpush" | "inbox"; deviceId?: string } = {}): void => client.opened(notificationId, options),
    flush: (): Promise<void> => legacyCall(() => client.flush()),
    /** Los mensajes para un disparador cuyos `trigger_filters` cumplen `properties`, de mayor a menor prioridad. */
    inAppMessages: (query: InAppMessagesQuery = {}): Promise<EligibleInAppMessage[]> => legacyCall(() => client.inAppMessages(query)),
    /** El feed de tarjetas de contenido. */
    contentCards: (params: { locale?: string; appVersion?: string } = {}): Promise<EligibleContentCard[]> => legacyCall(() => client.contentCards(params)),
    /** Configuración remota; `null` si el servidor no la tiene. */
    config: (): Promise<ClientConfig | null> => legacyCall(() => client.config()),
    /** Respuesta a un bloque `survey`. */
    submitSurvey: (input: SurveyResponseInput): void => legacySync(() => client.submitSurvey(input)),
    /** Evento propio (nombre ≤ 60, propiedades ≤ 2 KB; si no, `CustomySendError` `SDK_INVALID_EVENT`). */
    logEvent: (name: string, properties?: Record<string, unknown>): void => legacySync(() => client.logEvent(name, properties)),
    inApp: {
      eligible: (locale?: string, params: { appVersion?: string } = {}): Promise<EligibleInAppMessage[]> => legacyCall(() => client.inApp.eligible(locale, params)),
      forTrigger(trigger: string, properties?: Record<string, unknown>): EligibleInAppMessage | null {
        return client.inApp.forTrigger(trigger, properties);
      },
      impression(id: string): void {
        client.inApp.impression(id);
      },
      click(id: string, action?: string): void {
        client.inApp.click(id, action);
      },
      dismiss(id: string): void {
        client.inApp.dismiss(id);
      },
    },
    devices: {
      register: (input: RegisterDeviceInput): Promise<PushDevice> => legacyCall(() => client.devices.register(input)),
      unregister: (token: string): Promise<{ object: "push_device_removal"; removed: number }> => legacyCall(() => client.devices.unregister(token)),
    },
    preferences: {
      get: (): Promise<SubscriberPreferences> => legacyCall(() => client.preferences.get()),
      set: (categories: Record<string, Partial<ChannelPreference>>): Promise<SubscriberPreferences> => legacyCall(() => client.preferences.set(categories)),
    },
    subscribe: (onChange: (change: InboxChange) => void) => client.subscribe(onChange),
    /** Cierra el tiempo real y los temporizadores y envía los recibos pendientes. */
    async close(): Promise<void> {
      await client.close();
    },
  };
}
