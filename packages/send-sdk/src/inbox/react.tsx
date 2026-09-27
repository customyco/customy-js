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
 *   const { message, trackInApp } = useInAppMessages({ trigger: "session_start" });
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatBadgeCount, type EligibleInAppMessage, type InboxChange, type InboxClient, type InboxState, type InboxStatus } from "./index";

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
  locale?: string;
  /** false = no elegir mensaje ahora (p. ej. durante un flujo crítico). */
  enabled?: boolean;
};

/**
 * El mensaje in-app que toca mostrar para el disparador (el de mayor
 * prioridad). Se mantiene hasta que se pulsa o se cierra; entonces sale el
 * siguiente, si hay. Llama a `trackInApp.impression()` cuando de verdad se ve.
 */
export function useInAppMessages(options: UseInAppMessagesOptions = {}) {
  const client = useInboxClient();
  const trigger = options.trigger ?? "session_start";
  const enabled = options.enabled ?? true;
  const inApp = useSyncExternalStore(client.onState, () => client.getState().inApp, () => client.getState().inApp);
  const [current, setCurrent] = useState<EligibleInAppMessage | null>(null);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client.getState().inApp.loaded) client.inApp.eligible(options.locale).catch(() => undefined);
  }, [client, options.locale]);

  useEffect(() => {
    if (!enabled || current) return;
    const next = client.inApp.forTrigger(trigger);
    if (next) setCurrent(next);
  }, [client, trigger, enabled, current, inApp]);

  // Si el servidor retira un mensaje que aún no se vio (archivado, fuera de fechas), no se muestra.
  useEffect(() => {
    if (current && shownRef.current !== current.id && inApp.loaded && !inApp.messages.some((m) => m.id === current.id)) setCurrent(null);
  }, [current, inApp]);

  const trackInApp = useMemo(
    () => ({
      impression: () => {
        if (!current || shownRef.current === current.id) return;
        shownRef.current = current.id;
        client.inApp.impression(current.id);
      },
      click: (action?: string) => {
        if (!current) return;
        client.inApp.click(current.id, action);
        setCurrent(null);
      },
      dismiss: () => {
        if (!current) return;
        client.inApp.dismiss(current.id);
        setCurrent(null);
      },
    }),
    [client, current],
  );

  return { message: enabled ? current : null, loaded: inApp.loaded, trackInApp };
}
