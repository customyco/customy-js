import type { BannerUiOptions } from "../dom/banner";
import { assertSecureBaseUrl } from "./base-url";
import type { StoryBarUiOptions } from "../dom/story-bar";
import { createSeenTracker, type SeenTracker } from "../seen";
import type { KeyValueStore } from "../store";
import { createMemoryStore } from "../store";
import type { PlacementResponse, StoryPlatform } from "../types";
import type { ViewerEvent } from "../viewer";
import type { BannerEvent } from "../banner";
import {
  bannerFrequencyKey,
  createDismissStore,
  createFrequencyTracker,
  createOverlayGate,
  createSurfaceControl,
  selectDelivery,
  storyFrequencyKey,
  widgetFrequencyKey,
  type Delivery,
  type DismissStore,
  type FrequencyTracker,
  type OverlayGate,
  type StoryBarDelivery,
  type SurfaceControl,
} from "./delivery";
import { createConversionReporter, type PurchaseInput } from "./conversions";
import { createEventQueue, type EventQueueOptions } from "./events";
import type { ProductRef, WidgetKind, WidgetProgress } from "../types";
import type { WidgetEvent } from "../widgets/common";
import { createWidgetProgressStore, type WidgetProgressStore } from "../widgets/progress";
import { toHeadlessPayload, type StoriesHeadlessPayload } from "./headless";
import { createStoriesRealtime, type StoriesRealtimeOptions } from "./realtime";
import { createPlacementClient, type PlacementClientOptions, type PlacementQuery, type PlacementResult } from "./placements";

export type StoriesClientOptions = Omit<PlacementClientOptions, "store"> & {
  /**
   * Almacenamiento inyectado para todo lo persistente: caché de placements, estado visto,
   * frecuencia, descartes y cola de eventos. Sin él, solo memoria (se pierde al recargar).
   */
  store?: KeyValueStore;
  events?: Partial<Pick<EventQueueOptions, "flushIntervalMs" | "maxBatch" | "maxQueue" | "consent" | "maxRetries">>;
  /** Para compartir el estado visto con otra instancia (p. ej. varios clientes en la página). */
  seen?: SeenTracker;
  overlays?: OverlayGate;
  surfaces?: SurfaceControl;
  /**
   * Tiempo real (apagado por defecto): con `enabled: true` el cliente escucha las señales de Send por Customy Realtime
   * mientras la app está en primer plano y los hooks vuelven a pedir el placement al instante, sin esperar el `ttl`.
   * Sin socket degrada a un sondeo corto (30 s) y revalida al volver a primer plano.
   */
  realtime?: Partial<Omit<StoriesRealtimeOptions, "baseUrl" | "token" | "fetch" | "clock">>;
};

export type DeliverResult = { result: PlacementResult; delivery: Delivery };

/**
 * Cliente de Stories/Banners: placements (ETag, ttl, kill, min_sdk), eventos en lote idempotente,
 * reglas de entrega (frecuencia, un banner por placement, un overlay a la vez, pausa por
 * superficie) y cableado listo para los componentes web y React.
 */
export function createStoriesClient(options: StoriesClientOptions) {
  assertSecureBaseUrl(options.baseUrl);
  const store = options.store ?? createMemoryStore();
  const common = { namespace: options.namespace, clock: options.clock };
  const placements = createPlacementClient({ ...options, store });
  const events = createEventQueue({
    baseUrl: options.baseUrl,
    token: options.token,
    fetch: options.fetch,
    platform: options.platform,
    locale: options.locale,
    store,
    ...common,
    ...options.events,
    sleep: options.sleep,
    onError: options.onError,
  });
  const conversions = createConversionReporter({ baseUrl: options.baseUrl, token: options.token, fetch: options.fetch, platform: options.platform, clock: options.clock, sessionId: events.sessionId, sleep: options.sleep });
  const seen = options.seen ?? createSeenTracker(store, common);
  const frequency: FrequencyTracker = createFrequencyTracker(store, common);
  const dismissals: DismissStore = createDismissStore(store, common);
  const overlays = options.overlays ?? createOverlayGate();
  const surfaces = options.surfaces ?? createSurfaceControl();
  const progress: WidgetProgressStore = createWidgetProgressStore(store, { namespace: options.namespace, now: options.clock ? () => options.clock!.now() : undefined });
  const realtime = createStoriesRealtime({
    ...options.realtime,
    enabled: options.realtime?.enabled === true,
    baseUrl: options.baseUrl ?? "https://send-api.customy.ai",
    token: options.token,
    fetch: options.fetch,
    clock: options.clock,
    onError: options.realtime?.onError ?? options.onError,
  });
  const ready = Promise.all([seen.ready, frequency.ready, dismissals.ready, progress.ready]).then(() => undefined);

  const select = (result: Pick<PlacementResult, "placementId" | "widgets">): Delivery => selectDelivery(result, { frequency, dismissed: dismissals, surfaces, progress });

  const api = {
    events,
    seen,
    frequency,
    dismissals,
    /** Ítems de checklist completados y productos deslizados: no se deshacen. */
    progress,
    overlays,
    surfaces,
    ready,
    /** Señales en tiempo real: `watch(placementId, cb)` avisa cuando hay que revalidar (ver la opción `realtime`). */
    realtime,
    /** El placement, con kill por superficie, `min_sdk`, calendario y caducidad ya aplicados. */
    placement: (id: string, query: PlacementQuery & { force?: boolean } = {}): Promise<PlacementResult> => placements.placement(id, query),
    /** Selección según las reglas de entrega con el estado actual (frecuencia, descartes, pausas). */
    select,
    /** Placement + selección; registra la impresión SIN render de los grupos de control. */
    async deliver(id: string, query: PlacementQuery & { force?: boolean } = {}): Promise<DeliverResult> {
      const [result] = await Promise.all([placements.placement(id, query), ready]);
      const delivery = select(result);
      api.trackControl(delivery);
      return { result, delivery };
    },
    /** Control: impresión con `rendered: false`; nada se pinta. Una vez por campaña y sesión. */
    trackControl(delivery: Delivery): void {
      for (const g of delivery.control.stories) events.trackControl({ placementId: delivery.placementId, channel: "story", campaignId: g.id, variantId: g.variant_id });
      for (const b of delivery.control.banners) events.trackControl({ placementId: delivery.placementId, channel: "banner", campaignId: b.id, variantId: b.variant_id });
      for (const w of delivery.control.widgets) events.trackControl({ placementId: delivery.placementId, channel: "widget", campaignId: w.id, variantId: w.variant_id });
    },
    /** Modo headless: el payload JSON de lo que toca mostrar (con kill/min_sdk/calendario aplicados). */
    async headless(id: string, query: PlacementQuery & { force?: boolean } = {}): Promise<StoriesHeadlessPayload> {
      const result = await placements.placement(id, query);
      const res: PlacementResponse = result.response ?? { placement_id: id, etag: result.etag ?? "", ttl: 0, min_sdk: result.minSdk, kill: result.killed, widgets: [] };
      return toHeadlessPayload({ ...res, widgets: result.widgets });
    },
    /** Opciones listas para `mountStoryBar` / `<StoryBar>` de `./dom` y `./react`. */
    bindStoryBar(placementId: string, bar: StoryBarDelivery): Pick<StoryBarUiOptions, "groups" | "style" | "seen" | "onRender" | "canOpen" | "viewer"> {
      let release: (() => void) | null = null;
      const counted = new Set<string>();
      return {
        groups: bar.groups,
        style: bar.style,
        seen,
        canOpen: () => {
          if (surfaces.isPaused("story")) return false;
          release = overlays.tryAcquire("story-viewer");
          return release !== null;
        },
        onRender: (ordered) => {
          for (const g of ordered) {
            events.once(`impression:${placementId}:${g.id}`, () => void events.track({ placementId, channel: "story", campaignId: g.id, variantId: g.variant_id }, { type: "impression", rendered: true }));
          }
        },
        viewer: {
          onEvent: (e: ViewerEvent) => {
            if (e.type === "view" && !counted.has(e.groupId)) {
              counted.add(e.groupId);
              frequency.record(storyFrequencyKey(placementId, e.groupId));
              // Un `nudge` no se pinta en la barra: su impresión es la primera vez que se ve (el resto ya la registró `onRender`, misma clave).
              events.once(`impression:${placementId}:${e.groupId}`, () => void events.track({ placementId, channel: "story", campaignId: e.groupId, variantId: e.variantId }, { type: "impression", rendered: true }));
            }
            events.fromViewer({ placementId }, e);
          },
          onClose: () => {
            counted.clear();
            release?.();
            release = null;
            void events.flush();
          },
        },
      };
    },
    /** Opciones listas para `mountBanner` / `<Banner>`. */
    bindBanner(placementId: string, banner: NonNullable<Delivery["banner"]>): Pick<BannerUiOptions, "banner" | "onEvent" | "onDismiss"> {
      return {
        banner,
        onEvent: (e: BannerEvent) => {
          if (e.type === "impression") frequency.record(bannerFrequencyKey(placementId, banner.id));
          events.fromBanner({ placementId }, e);
        },
        onDismiss: (reason) => {
          if (reason === "user") dismissals.dismiss(banner.id, banner.expires_at ? Date.parse(banner.expires_at) : 0);
          void events.flush();
        },
      };
    },
    /**
     * Cableado de un widget de la Ola 3 (`./canvas`, `./swipe-cards`, `./checklist`, `./inline`, `./video-feed`): cada
     * evento va a la cola con su campaña, lo hecho se anota (frecuencia, progreso que no se deshace, descartes) y el
     * descarte del usuario no vuelve. `kind` solo distingue la regla de frecuencia (el checklist no la gasta).
     */
    bindWidget(placementId: string, kind: WidgetKind, entry: { id: string; expires_at?: string; progress?: WidgetProgress; config?: { mode?: string } }): { progress: WidgetProgress; onEvent: (e: WidgetEvent) => void } {
      const mark = (e: WidgetEvent): void => {
        if (e.type === "impression" && !(kind === "checklist" && entry.config?.mode !== "tour")) frequency.record(widgetFrequencyKey(placementId, entry.id));
        else if (e.type === "checklist_item") progress.complete(entry.id, e.itemId);
        else if (e.type === "swipe") progress.swipe(entry.id, `${e.product.connector}:${e.product.external_id}${e.product.variant_id ? `#${e.product.variant_id}` : ""}`);
        else if ((e.type === "dismiss" && e.reason === "user") || (e.type === "complete" && kind === "checklist" && entry.config?.mode === "tour")) {
          progress.dismiss(entry.id);
          dismissals.dismiss(entry.id, entry.expires_at ? Date.parse(entry.expires_at) : 0);
        }
      };
      const onEvent = (e: WidgetEvent): void => {
        mark(e);
        events.fromWidget({ placementId }, e);
        if (e.type === "dismiss" || e.type === "complete") void events.flush();
      };
      return { progress: progress.get(entry.id, entry.progress), onEvent };
    },
    /**
     * Ingresos: la compra que cierra la tienda. Va a Send con el token de suscriptor (Send la entrega a Commerce con su
     * llave de servicio; la app nunca tiene una credencial de Commerce). Señal no monetaria (los importes no viajan: los ingresos los reporta el backend del cliente con llave API en
     * `POST /api/stories/conversions`). Idempotente por pedido; lanza si Send no la
     * acepta, para que la app la reintente con el mismo pedido. `add_to_cart` y `wishlist_added` ya viajan solos como
     * eventos del visor: aquí solo falta `purchase`, que el SDK no puede ver. Sin consentimiento de analítica no sale.
     */
    async reportConversion(input: PurchaseInput): Promise<{ eventId: string } | null> {
      if (options.events?.consent && !options.events.consent()) return null;
      return conversions.reportPurchase(input);
    },
    /**
     * Para interfaces propias (modo headless): registra lo que la persona vio. `view` = vio la historia/página,
     * `product_viewed` = vio un producto etiquetado (con su componente) y `holdout` = el grupo de control, que registra
     * la impresión sin pintar. Commerce las convierte en exposiciones para la atribución. Devuelve el `event_id` o
     * `null` si el consentimiento lo impide.
     */
    reportExposure(input: { kind: "view" | "product_viewed" | "holdout"; placementId: string; storyId: string; slideId?: string; componentId?: string; product?: ProductRef; variantId?: string }): string | null {
      const ctx = { placementId: input.placementId, channel: "story" as const, campaignId: input.storyId, variantId: input.variantId };
      if (input.kind === "holdout") return events.trackControl(ctx);
      if (input.kind === "product_viewed") {
        if (!input.componentId || !input.product) return null;
        return events.track(ctx, { type: "product_viewed", component_id: input.componentId, product: input.product, ...(input.slideId ? { pageId: input.slideId } : {}) });
      }
      return events.track(ctx, { type: "view", ...(input.slideId ? { pageId: input.slideId } : {}) });
    },
    /**
     * Headless: el producto de un elemento de un widget (Swipe Cards, Video Feed, Canvas, Inline) que la persona vio, guardó o
     * añadió al carrito con una interfaz propia. Es lo que emiten solos los widgets del renderer: `widgetId` es el id de la
     * campaña, `itemId` el elemento (tarjeta, vídeo, pieza) y `componentId` el fijo del widget (`cards`, `feed`, `canvas`,
     * `inline`; Swipe Cards no lleva `itemId`). Devuelve el `event_id` o `null` si el consentimiento lo impide.
     */
    reportWidgetProduct(input: { name: "product_viewed" | "add_to_cart" | "wishlist_added"; placementId: string; widgetId: string; componentId: "cards" | "feed" | "canvas" | "inline"; itemId?: string; product: ProductRef; quantity?: number; variantId?: string }): string | null {
      return events.fromWidget({ placementId: input.placementId }, { widgetId: input.widgetId, ...(input.variantId ? { variantId: input.variantId } : {}), type: "product", name: input.name, product: input.product, componentId: input.componentId, ...(input.itemId ? { itemId: input.itemId } : {}), ...(input.quantity ? { quantity: input.quantity } : {}) });
    },
    flush: (): Promise<void> => events.flush(),
    /** Cierra: envía lo pendiente y para los temporizadores. */
    close: (): Promise<void> => {
      realtime.close();
      return events.close();
    },
    /** Cierre de sesión: olvida caché, frecuencia y descartes, y reinicia lo visto. */
    async reset(): Promise<void> {
      await placements.clear();
      frequency.reset();
      progress.reset();
      seen.reset();
    },
    platform: options.platform as StoryPlatform | undefined,
  };
  return api;
}
export type StoriesClient = ReturnType<typeof createStoriesClient>;
