/**
 * @customyai/send-sdk/inbox/react — hooks sin interfaz para la bandeja y los
 * mensajes in-app de Customy Engage. Sin DOM: sirven en React (web) y en React
 * Native; la app pinta con su propio sistema de diseño.
 *
 *   const client = createInboxClient({ token: fetchInboxToken });
 *   <InboxProvider client={client}><App /></InboxProvider>
 *
 *   const { items, loadMore, hasMore, markRead } = useInbox();
 *   const { unread, unreadLabel } = useInboxCounts();   // «99+»
 *   const { message, trackInApp } = useInAppMessages({ trigger: "checkout_viewed", properties: { total: 80 } });
 *   const { cards, track } = useContentCards();
 *   const config = useCustomyConfig();
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createInAppPresenter, formatBadgeCount, type ClientConfig, type InboxChange, type InboxClient, type InboxState, type InboxStatus, type SurveyAnswers } from "./index";

export { formatBadgeCount } from "./index";

const InboxContext = createContext<InboxClient | null>(null);

export type InboxProviderProps = {
  client: InboxClient;
  /** Abre el tiempo real (o el sondeo) mientras el proveedor está montado. Por defecto true. */
  live?: boolean;
  /** Cada cambio en vivo (contadores nuevos, mensajes in-app). */
  onChange?: (change: InboxChange) => void;
  children?: ReactNode;
};

export function InboxProvider({ client, live = true, onChange, children }: InboxProviderProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!live) return;
    return client.subscribe((change) => onChangeRef.current?.(change));
  }, [client, live]);
  return <InboxContext.Provider value={client}>{children}</InboxContext.Provider>;
}

/** El cliente del proveedor más cercano. */
export function useInboxClient(): InboxClient {
  const client = useContext(InboxContext);
  if (!client) throw new Error("useInboxClient: falta <InboxProvider client={…}> más arriba");
  return client;
}

/** El estado completo del cliente, reactivo. */
export function useInboxState(): InboxState {
  const client = useInboxClient();
  return useSyncExternalStore(client.onState, client.getState, client.getState);
}

export type UseInboxOptions = {
  /** `all` (por defecto), `unread` o `archived`. */
  status?: InboxStatus;
  /** Carga la primera página al montar. Por defecto true. */
  autoLoad?: boolean;
};

/** La lista de la bandeja con paginación y marcas optimistas. */
export function useInbox(options: UseInboxOptions = {}) {
  const client = useInboxClient();
  const state = useInboxState();
  const status = options.status ?? "all";
  const autoLoad = options.autoLoad ?? true;
  useEffect(() => {
    const current = client.getState();
    if (!autoLoad || (current.loaded && current.status === status)) return;
    client.list({ status }).catch(() => undefined);
  }, [client, status, autoLoad]);
  const sameStatus = state.status === status;
  return {
    items: sameStatus ? state.items : [],
    loading: state.loading,
    error: state.error,
    hasMore: sameStatus && state.hasMore,
    counts: state.counts,
    loadMore: useCallback(() => client.loadMore(), [client]),
    refresh: useCallback(() => client.list({ status }), [client, status]),
    markSeen: client.markSeen,
    markRead: client.markRead,
    markUnread: client.markUnread,
    archive: client.archive,
    markAllRead: useCallback(() => client.markRead("all"), [client]),
    markAllSeen: useCallback(() => client.markSeen("all"), [client]),
    /** Recibo de apertura de un elemento de la bandeja (embudo). */
    trackOpened: useCallback((notificationId: string, action?: string) => client.track({ type: "opened", notification_id: notificationId, channel: "inbox", ...(action ? { action } : {}) }), [client]),
  };
}

/** Contadores de la insignia: no leídos y no vistos, en vivo. */
export function useInboxCounts(options: { max?: number } = {}) {
  const client = useInboxClient();
  const counts = useSyncExternalStore(client.onState, () => client.getState().counts, () => client.getState().counts);
  useEffect(() => {
    if (client.getState().counts.version < 0) client.counts().catch(() => undefined);
  }, [client]);
  const max = options.max ?? 99;
  return {
    unread: counts.unread,
    unseen: counts.unseen,
    version: counts.version,
    /** «» si 0, «7», «99+». */
    unreadLabel: formatBadgeCount(counts.unread, max),
    unseenLabel: formatBadgeCount(counts.unseen, max),
  };
}

export type UseInAppMessagesOptions = {
  /** `session_start` (por defecto) o un evento de la app (`checkout_viewed`). */
  trigger?: string;
  /** Propiedades del evento: solo salen los mensajes cuyos `trigger_filters` las cumplen. */
  properties?: Record<string, unknown>;
  locale?: string;
  /** Versión de la app (`app_version` en la lectura). */
  appVersion?: string;
  /** false = no elegir mensaje ahora (p. ej. durante un flujo crítico). */
  enabled?: boolean;
};

function stableKey(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/**
 * El mensaje in-app que toca mostrar para el disparador (el de mayor
 * prioridad cuyos `trigger_filters` cumplen `properties`). Con `delay_seconds`
 * aparece tras esa espera (se cancela al desmontar o al cambiar de
 * disparador). Se mantiene hasta que se pulsa o se cierra; entonces sale el
 * siguiente, si hay. Llama a `trackInApp.impression()` cuando de verdad se ve.
 */
export function useInAppMessages(options: UseInAppMessagesOptions = {}) {
  const client = useInboxClient();
  const trigger = options.trigger ?? "session_start";
  const enabled = options.enabled ?? true;
  const propertiesKey = stableKey(options.properties ?? null);
  const loaded = useSyncExternalStore(client.onState, () => client.getState().inApp.loaded, () => client.getState().inApp.loaded);
  const presenter = useMemo(() => createInAppPresenter(client, { trigger, properties: options.properties, enabled }), [client]);
  const message = useSyncExternalStore(presenter.subscribe, presenter.getMessage, presenter.getMessage);

  useEffect(() => {
    if (!client.getState().inApp.loaded) client.inApp.eligible(options.locale, { appVersion: options.appVersion }).catch(() => undefined);
  }, [client, options.locale, options.appVersion]);

  useEffect(() => {
    presenter.update({ trigger, properties: options.properties, enabled });
    // `propertiesKey` en lugar del objeto: un literal nuevo en cada render no reinicia la espera.
  }, [presenter, trigger, propertiesKey, enabled]);

  useEffect(() => () => presenter.close(), [presenter]);

  const trackInApp = useMemo(
    () => ({
      impression: () => presenter.impression(),
      click: (action?: string) => presenter.click(action),
      dismiss: () => presenter.dismiss(),
    }),
    [presenter],
  );

  return {
    message,
    loaded,
    trackInApp,
    /** Respuesta a un bloque `survey` del mensaje en pantalla. */
    submitSurvey: useCallback((surveyId: string, answers: SurveyAnswers) => presenter.submitSurvey(surveyId, answers), [presenter]),
  };
}

export type UseContentCardsOptions = {
  /** Carga el feed al montar si aún no está. Por defecto true. */
  autoLoad?: boolean;
  locale?: string;
  appVersion?: string;
};

/**
 * El feed de tarjetas de contenido (fijadas primero). `track.impression(id)`
 * cuenta una vez por tarjeta mientras el componente vive; `dismiss` la quita.
 */
export function useContentCards(options: UseContentCardsOptions = {}) {
  const client = useInboxClient();
  const cards = useSyncExternalStore(client.onState, () => client.getState().cards, () => client.getState().cards);
  const autoLoad = options.autoLoad ?? true;
  const seenRef = useRef(new Set<string>());
  useEffect(() => {
    if (autoLoad && !client.getState().cards.loaded) client.contentCards({ locale: options.locale, appVersion: options.appVersion }).catch(() => undefined);
  }, [client, autoLoad, options.locale, options.appVersion]);
  const track = useMemo(
    () => ({
      impression: (id: string) => {
        if (seenRef.current.has(id)) return;
        seenRef.current.add(id);
        client.track.card({ id, type: "impression" });
      },
      click: (id: string) => client.track.card({ id, type: "click" }),
      dismiss: (id: string) => client.track.card({ id, type: "dismiss" }),
    }),
    [client],
  );
  return {
    cards: cards.items,
    loaded: cards.loaded,
    refresh: useCallback(() => client.contentCards({ locale: options.locale, appVersion: options.appVersion }), [client, options.locale, options.appVersion]),
    track,
  };
}

/** La configuración remota (`GET /client/config`), reactiva; la lee si aún no está. `null` mientras tanto. */
export function useCustomyConfig(): ClientConfig | null {
  const client = useInboxClient();
  const config = useSyncExternalStore(client.onState, () => client.getState().config, () => client.getState().config);
  useEffect(() => {
    if (!client.getState().config) client.config().catch(() => undefined);
  }, [client]);
  return config;
}
