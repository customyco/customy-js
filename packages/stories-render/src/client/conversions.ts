import { systemClock, type Clock } from "../clock";
import type { ProductRef, StoryPlatform } from "../types";
import type { StoryCommerceContext } from "../commerce";
import { errorFromResponse, StoriesError } from "./errors";
import { randomEventId } from "./events";

export type PurchaseInput = {
  /** Idempotencia. Sin él se deriva del pedido (`purchase_<orderId>`): reintentar el mismo pedido no lo cuenta dos veces. */
  eventId?: string;
  orderId?: string;
  /** @deprecated Ignorado: el servidor descarta los importes de `/client/conversions`. Los ingresos los reporta el backend del cliente con llave API en `POST /api/stories/conversions`. */
  value?: string;
  /** @deprecated Ignorado (ver `value`). */
  currency?: string;
  products?: Array<{
    product: ProductRef;
    quantity?: number;
    /** @deprecated Ignorado (ver `value`). */
    lineValue?: string;
  }>;
  /** Contexto de historia que viajó en el carrito (`readStoryContext`). Sin él la compra cuenta como orgánica. */
  context?: StoryCommerceContext;
  utm?: Record<string, string>;
  occurredAt?: Date | number | string;
};

export type ConversionReporterOptions = {
  baseUrl?: string;
  token: (forceRefresh?: boolean) => Promise<string>;
  fetch?: typeof fetch;
  platform?: StoryPlatform;
  clock?: Clock;
  /** Sesión del cliente de eventos (la misma): permite la atribución indirecta. */
  sessionId?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");

/** Cuerpo de `POST /client/conversions` (Send), snake_case. Sin importes: es una señal no monetaria. Pura: fácil de probar. */
export function purchaseBody(input: PurchaseInput, sessionId: string | undefined, nowMs: number): Record<string, unknown> {
  const at = input.occurredAt instanceof Date ? input.occurredAt.getTime() : typeof input.occurredAt === "number" ? input.occurredAt : input.occurredAt ? Date.parse(input.occurredAt) : nowMs;
  const eventId = input.eventId ?? (input.orderId ? `purchase_${safeId(input.orderId)}`.slice(0, 64) : randomEventId());
  return {
    event_id: eventId,
    type: "purchase",
    ...(input.orderId ? { order_id: input.orderId } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
    occurred_at: new Date(Number.isFinite(at) ? at : nowMs).toISOString(),
    products: (input.products ?? []).map((p) => ({ product: p.product, quantity: p.quantity ?? 1 })),
    ...(input.context ? { story_id: input.context.storyId, ...(input.context.slideId ? { slide_id: input.context.slideId } : {}), ...(input.context.componentId ? { component_id: input.context.componentId } : {}) } : {}),
    ...(input.utm && Object.keys(input.utm).length ? { utm: input.utm } : {}),
  };
}

/**
 * Reporta la compra que cierra la tienda a Send (`POST /client/conversions`), que la entrega a Commerce con su llave de
 * servicio: la app solo lleva su token de suscriptor, jamás una credencial de Commerce. Reintenta red, 429, 503 y 5xx;
 * un 4xx de validación lanza `StoriesError` (no mejora reintentando). Devuelve el `event_id` aceptado.
 */
export function createConversionReporter(options: ConversionReporterOptions) {
  const baseUrl = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const clock = options.clock ?? systemClock;
  const maxRetries = options.maxRetries ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => clock.setTimeout(r, ms)));
  return {
    async reportPurchase(input: PurchaseInput): Promise<{ eventId: string }> {
      const body = purchaseBody(input, options.sessionId, clock.now());
      let attempt = 0;
      let refreshed = false;
      for (;;) {
        let token: string;
        try {
          token = await options.token(refreshed);
        } catch (e) {
          throw new StoriesError("token", "no se pudo obtener el token de suscriptor", { cause: e });
        }
        let res: Response;
        try {
          res = await fetchImpl(`${baseUrl}/client/conversions`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json", "idempotency-key": `conv_${String(body.event_id)}` },
            body: JSON.stringify(body),
            keepalive: true,
          });
        } catch (error) {
          if (attempt < maxRetries) {
            attempt += 1;
            await sleep(300 * 2 ** attempt);
            continue;
          }
          throw new StoriesError("network", (error as Error)?.message ?? "network error", { cause: error });
        }
        if (res.ok) return { eventId: String(body.event_id) };
        if (res.status === 401 && !refreshed) {
          refreshed = true;
          await res.text().catch(() => "");
          continue;
        }
        const err = await errorFromResponse(res);
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          attempt += 1;
          await sleep(err.retryAfterMs ?? 300 * 2 ** attempt);
          continue;
        }
        throw err;
      }
    },
  };
}
export type ConversionReporter = ReturnType<typeof createConversionReporter>;
