import { describe, expect, it, vi } from "vitest";
import { fakeFetch, json } from "../test-fixtures";
import { createConversionReporter, purchaseBody } from "./conversions";

const T = Date.parse("2026-10-02T12:00:00Z");
const clock = { now: () => T, setTimeout: (f: () => void, ms: number) => globalThis.setTimeout(f, ms), clearTimeout: (h: unknown) => globalThis.clearTimeout(h as never) };
const make = (responses: Parameters<typeof fakeFetch>[0], extra: Record<string, unknown> = {}) => {
  const t = fakeFetch(responses);
  const reporter = createConversionReporter({ token: async () => "sst", fetch: t.fn, clock, sessionId: "sess_12345678", sleep: async () => undefined, ...extra });
  return { reporter, calls: t.calls };
};
const purchase = { orderId: "A-1001", context: { storyId: "g1", slideId: "p1", componentId: "cart1" }, utm: { utm_source: "customy_stories" }, products: [{ product: { connector: "shopify", external_id: "42" }, quantity: 2 }] };

describe("reportPurchase", () => {
  it("manda la compra a Send con el token de suscriptor (nunca una credencial de Commerce), idempotente por pedido", async () => {
    const { reporter, calls } = make([json({ accepted: true }, { status: 202 })]);
    expect(await reporter.reportPurchase(purchase)).toEqual({ eventId: "purchase_A-1001" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://send-api.customy.ai/client/conversions");
    expect(calls[0]!.headers.authorization).toBe("Bearer sst");
    expect(calls[0]!.headers["idempotency-key"]).toBe("conv_purchase_A-1001");
    expect(calls[0]!.body).toEqual({
      event_id: "purchase_A-1001", type: "purchase", order_id: "A-1001", session_id: "sess_12345678", occurred_at: "2026-10-02T12:00:00.000Z",
      products: [{ product: { connector: "shopify", external_id: "42" }, quantity: 2 }],
      story_id: "g1", slide_id: "p1", component_id: "cart1", utm: { utm_source: "customy_stories" },
    });
  });

  it("sin pedido ni contexto de historia: id aleatorio y compra sin historia (orgánica)", () => {
    const body = purchaseBody({}, undefined, T);
    expect(String(body.event_id)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body).not.toHaveProperty("story_id");
    expect(body).not.toHaveProperty("session_id");
  });

  it("jamás envía importes: value, currency y line_value se descartan aunque la app los pase (señal no monetaria)", async () => {
    const { reporter, calls } = make([json({ accepted: true }, { status: 202 })]);
    await reporter.reportPurchase({ ...purchase, value: "12.50", currency: "PESOS", products: [{ product: { connector: "shopify", external_id: "42" }, quantity: 1, lineValue: "1000" }] });
    expect(calls).toHaveLength(1);
    const body = calls[0]!.body as Record<string, unknown>;
    for (const k of ["value", "currency"]) expect(body).not.toHaveProperty(k);
    expect(JSON.stringify(body)).not.toContain("line_value");
  });

  it("reintenta 503 (puente apagado) y red con el MISMO event_id; un 4xx de validación lanza sin reintentar; 401 refresca el token", async () => {
    const flaky = make([new Response("", { status: 503 }), new Error("offline"), json({}, { status: 202 })]);
    await flaky.reporter.reportPurchase(purchase);
    expect(flaky.calls).toHaveLength(3);
    expect(new Set(flaky.calls.map((c) => (c.body as { event_id: string }).event_id)).size).toBe(1);

    const refused = make([new Response('{"error":"invalid_conversion"}', { status: 422 }), json({})]);
    await expect(refused.reporter.reportPurchase(purchase)).rejects.toMatchObject({ code: "server", status: 422 });
    expect(refused.calls).toHaveLength(1);

    const tokens: boolean[] = [];
    const t = fakeFetch([new Response("", { status: 401 }), json({}, { status: 202 })]);
    const r = createConversionReporter({ token: async (force) => (tokens.push(Boolean(force)), "sst"), fetch: t.fn, clock, sleep: async () => undefined });
    await r.reportPurchase(purchase);
    expect(tokens).toEqual([false, true]);

    const down = make([new Error("x"), new Error("x")], { maxRetries: 1 });
    await expect(down.reporter.reportPurchase(purchase)).rejects.toMatchObject({ code: "network" });
    void vi;
  });
});
