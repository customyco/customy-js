import { describe, expect, it } from "vitest";
import { createCustomy } from "@customyai/customy-sdk/server";
import { createFakeCustomy, type FakeAppManifest } from "./index";

const manifest: FakeAppManifest = {
  key: "habit-app",
  products: [
    { product: "customy-data", scopes: ["data:collect"] },
    { product: "customy-send", scopes: ["send:emails:send"] },
    { product: "customy-billing", scopes: ["billing:usage:report"] },
  ],
  events: [{
    name: "habit.completed", type: "track", purposes: ["analytics"],
    properties: { type: "object", required: ["streak"], additionalProperties: false, properties: { streak: { type: "integer" } } },
  }],
  capabilities: [
    { lookupKey: "habit-app.coach.weekly", type: "boolean" },
    { lookupKey: "habit-app.coach.runs", type: "metered" },
  ],
  plans: [
    { code: "free", capabilities: { "habit-app.coach.runs": 5 } },
    { code: "pro", capabilities: { "habit-app.coach.weekly": true, "habit-app.coach.runs": 200 } },
  ],
  meters: [{ code: "habit-app.coach_runs" }],
};

async function setup() {
  const fake = createFakeCustomy({ manifest });
  const customy = await createCustomy({ ...fake.credentials, fetch: fake.fetch });
  return { fake, customy };
}

describe("createFakeCustomy", () => {
  it("publica en el discovery solo los productos del manifiesto", async () => {
    const { customy } = await setup();
    expect(Object.keys(customy.platform.products).sort()).toEqual(["billing", "data", "send"]);
    expect(() => customy.product("links")).toThrow("SDK_PRODUCT_NOT_DISCOVERED");
  });

  it("registra correos con idempotencia", async () => {
    const { fake, customy } = await setup();
    const input = { from: "Habit <hola@habit.test>", to: "ana@habit.test", subject: "Tu semana", html: "<p>…</p>" };
    const first = await customy.send.emails.send(input, { idempotencyKey: "weekly-ana-2026-39" });
    const again = await customy.send.emails.send(input, { idempotencyKey: "weekly-ana-2026-39" });
    expect(again.id).toBe(first.id);
    expect(first.to).toEqual(["ana@habit.test"]);
    expect(fake.emails).toHaveLength(1);
    expect(fake.emails[0]?.body.subject).toBe("Tu semana");
  });

  it("rechaza un correo sin cuerpo como Send", async () => {
    const { customy } = await setup();
    await expect(customy.send.emails.send({ from: "a@habit.test", to: "b@habit.test", subject: "x" }))
      .rejects.toMatchObject({ status: 422, code: "validation_error" });
  });

  it("registra consumo de meters declarados y deduplica por clave", async () => {
    const { fake, customy } = await setup();
    const event = { meter: "habit-app.coach_runs", quantity: 1, idempotencyKey: "coach-run-0001" };
    expect((await customy.billing.report([event])).events[0]?.deduplicated).toBe(false);
    expect((await customy.billing.report([event])).events[0]?.deduplicated).toBe(true);
    expect(fake.usage).toEqual([expect.objectContaining({ meter: "habit-app.coach_runs", quantity: 1 })]);
  });

  it("un meter fuera del manifiesto falla", async () => {
    const { customy } = await setup();
    await expect(customy.billing.report([{ meter: "habit-app.other", quantity: 1, idempotencyKey: "other-run-0001" }]))
      .rejects.toMatchObject({ status: 400, code: "METER_NOT_DECLARED" });
  });

  it("valida eventos contra su schema y su consentimiento", async () => {
    const { fake, customy } = await setup();
    const post = (event: Record<string, unknown>) => customy.product("data").post("/v1/collect/event", event);
    const base = { type: "track", event: "habit.completed", userId: "u1", consent: { analytics: true } };

    await expect(post({ ...base, messageId: "m1", properties: { streak: 3 } })).resolves.toMatchObject({ accepted: true });
    await expect(post({ ...base, messageId: "m1", properties: { streak: 3 } })).resolves.toMatchObject({ deduplicated: true });
    await expect(post({ ...base, properties: { streak: "3" } })).rejects.toMatchObject({ status: 422, code: "DATA_EXTERNAL_SCHEMA_REJECTED" });
    await expect(post({ ...base, properties: { streak: 3, extra: 1 } })).rejects.toMatchObject({ code: "DATA_EXTERNAL_SCHEMA_REJECTED" });
    await expect(post({ ...base, consent: {}, properties: { streak: 3 } })).rejects.toMatchObject({ code: "DATA_EXTERNAL_CONSENT_REQUIRED" });
    await expect(post({ ...base, event: "habit.deleted", properties: {} })).rejects.toMatchObject({ code: "DATA_EXTERNAL_EVENT_NOT_ALLOWED" });
    expect(fake.events).toHaveLength(1);
  });

  it("el cliente de Data del SDK entrega eventos declarados", async () => {
    const { fake, customy } = await setup();
    await customy.data.track("habit.completed", { streak: 1 }, { userId: "u1", consent: { analytics: true } });
    expect(fake.events.map((recorded) => recorded.event.event)).toEqual(["habit.completed"]);
  });

  it("un lote de Data se valida entero antes de escribir nada", async () => {
    const { fake, customy } = await setup();
    const good = { type: "track" as const, event: "habit.completed", userId: "u1", properties: { streak: 1 }, consent: { analytics: true } };
    customy.data.enqueue(good);
    customy.data.enqueue({ ...good, properties: { streak: "x" } });
    await expect(customy.data.flush()).rejects.toThrow();
    expect(fake.events).toHaveLength(0);

    const fresh = await setup();
    fresh.customy.data.enqueue(good);
    fresh.customy.data.enqueue(good);
    await expect(fresh.customy.data.flush()).resolves.toMatchObject({ accepted: 2 });
    expect(fresh.fake.events).toHaveLength(2);
  });

  it("un scope que el manifiesto no declara no se emite", async () => {
    const fake = createFakeCustomy({ manifest });
    const customy = await createCustomy({ ...fake.credentials, fetch: fake.fetch, scopes: { send: ["send:domains:write"] } });
    await expect(customy.token("send")()).rejects.toThrow("invalid_scope");
  });

  it("un token de un producto no vale en otro", async () => {
    const { fake, customy } = await setup();
    const sendToken = await customy.token("send")();
    const response = await fake.fetch(`${fake.baseUrl("billing")}/v1/apps/usage`, {
      method: "POST", headers: { authorization: `Bearer ${sendToken}`, "content-type": "application/json" }, body: "{}",
    });
    expect(response.status).toBe(401);
  });

  it("resuelve las capabilities de cada plan", () => {
    const fake = createFakeCustomy({ manifest });
    expect(fake.planCapabilities("free")).toEqual({ "habit-app.coach.weekly": false, "habit-app.coach.runs": 5 });
    expect(fake.planCapabilities("pro")).toEqual({ "habit-app.coach.weekly": true, "habit-app.coach.runs": 200 });
    expect(() => fake.planCapabilities("team")).toThrow("not declared");
  });

  it("reset vacía lo registrado", async () => {
    const { fake, customy } = await setup();
    await customy.billing.report([{ meter: "habit-app.coach_runs", quantity: 1, idempotencyKey: "coach-run-0002" }]);
    fake.reset();
    expect(fake.usage).toHaveLength(0);
    expect(fake.tokens).toHaveLength(0);
  });
});
