import { createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { actionCategoryId, createSend, CustomySendError, SEND_API_VERSION, SEND_SCOPES, verifyWebhook } from "./index";
import { CustomySendError as InboxSendError } from "./inbox/index";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
type Reply = Response | Error | ((call: Call) => Response);

const ISSUER = "https://access.fixture.invalid";
const BASE = "https://send.fixture.invalid";

function scripted(replies: Reply[]) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: typeof init?.body === "string" ? init.body : undefined };
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error("sin respuesta preparada");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const token = (value: string) => json(200, { access_token: value, token_type: "Bearer", expires_in: 300 });
const fast = { baseDelayMs: 1, maxDelayMs: 1 };

describe("@customyai/send", () => {
  it("exige una credencial y no admite dos", () => {
    expect(() => createSend({ baseUrl: BASE })).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_REQUIRED" }));
    const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret" });
    expect(() => createSend({ baseUrl: BASE, accessToken: "cs_test_x", machineTokens })).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_AMBIGUOUS" }));
  });

  it("traduce el sobre de Send a CustomySendError con su código", async () => {
    const { fetch } = scripted([json(422, { statusCode: 422, name: "domain_not_verified", message: "verify the domain first" }, { "x-request-id": "req_1" })]);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch });
    const error = await send.emails.send({ from: "a@acme.test", to: "b@acme.test", subject: "Hola", text: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomySendError);
    expect(error).toBeInstanceOf(CustomySdkError);
    expect(error).toMatchObject({ code: "domain_not_verified", status: 422, service: "send", requestId: "req_1", message: "verify the domain first" });
  });

  it("reintenta un envío ante 503 con Retry-After y la misma clave de idempotencia", async () => {
    const { fetch, calls } = scripted([
      json(503, { statusCode: 503, name: "unavailable", message: "later" }, { "retry-after": "0" }),
      json(200, { id: "eml_1", status: "queued" }),
    ]);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch, retry: fast });
    const email = await send.emails.send({ templateId: "welcome", to: "ana@acme.test", variables: { name: "Ana" } });
    expect(email.id).toBe("eml_1");
    expect(calls).toHaveLength(2);
    const key = calls[0]!.headers["idempotency-key"];
    expect(key).toBeTruthy();
    expect(calls[1]!.headers["idempotency-key"]).toBe(key);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ to: "ana@acme.test", variables: { name: "Ana" }, template_id: "welcome" });
  });

  it("no repite un POST sin clave ni un 429 de cuota con Retry-After largo", async () => {
    const domains = scripted([json(502, { statusCode: 502, name: "bad_gateway", message: "x" })]);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch: domains.fetch, retry: fast });
    await expect(send.domains.create("acme.test")).rejects.toMatchObject({ code: "bad_gateway", status: 502 });
    expect(domains.calls).toHaveLength(1);

    const quota = scripted([json(429, { statusCode: 429, name: "daily_quota_exceeded", message: "tomorrow" }, { "retry-after": "3600" })]);
    const limited = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch: quota.fetch, retry: fast });
    await expect(limited.emails.send({ from: "a@acme.test", to: "b@acme.test", subject: "s", text: "t" }, { idempotencyKey: "welcome-1" }))
      .rejects.toMatchObject({ code: "daily_quota_exceeded", retryAfterMs: 3_600_000 });
    expect(quota.calls).toHaveLength(1);
    expect(quota.calls[0]!.headers["idempotency-key"]).toBe("welcome-1");
  });

  it("con machineTokens pide un token de audiencia customy-send y los scopes indicados, y renueva ante 401", async () => {
    const { fetch, calls } = scripted([
      token("tok-1"),
      json(401, { statusCode: 401, name: "unauthorized", message: "expired" }),
      token("tok-2"),
      json(200, { data: [] }),
    ]);
    const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch });
    const send = createSend({ baseUrl: BASE, machineTokens, scopes: ["send:templates:read"], fetch });
    await expect(send.templates.list()).resolves.toEqual({ data: [] });
    const tokenRequest = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.url).toBe(`${ISSUER}/oauth/token`);
    expect(tokenRequest.get("audience")).toBe("customy-send");
    expect(tokenRequest.get("scope")).toBe("send:templates:read");
    expect(calls[1]!.headers.authorization).toBe("Bearer tok-1");
    expect(calls[3]!.headers.authorization).toBe("Bearer tok-2");
  });

  it("toma URL y audiencia del discovery", async () => {
    const { fetch, calls } = scripted([token("tok"), json(200, { id: "tpl_1" })]);
    const platform = { issuer: ISSUER, jwksUri: `${ISSUER}/jwks`, tokenEndpoint: `${ISSUER}/oauth/token`, grantTypesSupported: [], products: { send: { baseUrl: "https://send-stg.fixture.invalid", audience: "customy-send-stg" } } };
    const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch, platform });
    const send = createSend({ platform, machineTokens, fetch });
    await send.templates.get("welcome");
    expect(new URLSearchParams(calls[0]!.body).get("audience")).toBe("customy-send-stg");
    expect(calls[1]!.url).toBe("https://send-stg.fixture.invalid/api/templates/welcome");
  });

  it("verifica webhooks firmados y rechaza los alterados", async () => {
    const secret = `whsec_${btoa("fixture-secret-bytes")}`;
    const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-27T12:00:00Z", data: { id: "eml_1" } });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("fixture-secret-bytes"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const ts = 1_790_000_000;
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`msg_1.${ts}.${body}`)));
    const signature = `v1,${btoa(String.fromCharCode(...mac))}`;
    const headers = { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": signature };
    const event = await verifyWebhook(body, headers, secret, { now: () => ts * 1000 });
    expect(event.type).toBe("email.delivered");
    await expect(verifyWebhook(body.replace("eml_1", "eml_2"), headers, secret, { now: () => ts * 1000 })).rejects.toThrow("firma");
  });
  it("cancela, gestiona categorías, ajustes y personas (push P0)", async () => {
    const { fetch, calls } = scripted([
      json(200, { object: "notification", id: "ntf_1", canceled_jobs: 1, canceled_devices: 0, recalled_devices: 2, inbox_removed: 1 }),
      json(200, { object: "notification_category", id: "billing" }),
      json(200, { object: "notification_settings", frequency_caps: [] }),
      json(200, { object: "subscriber_preferences", subscriber: "u 1", categories: {} }),
    ]);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch });
    await send.notifications.cancel("ntf_1", { recall: true });
    await send.notifications.categories.put("billing", { name: "Facturas", transactional: true });
    await send.notifications.settings.put({ frequency_caps: [{ per: "day", max: 3 }] });
    await send.subscribers.preferences.put("u 1", { categories: { billing: { push: false } } });
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "POST /api/notifications/ntf_1/cancel",
      "PUT /api/notifications/categories/billing",
      "PUT /api/notifications/settings",
      "PUT /api/subscribers/u%201/preferences",
    ]);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ recall: true });
  });

  it("manda Customy-Version en cada petición (una cabecera propia la sustituye)", async () => {
    const { fetch, calls } = scripted([json(200, { data: [] }), json(200, { data: [] })]);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch });
    await send.inApp.list();
    expect(SEND_API_VERSION).toBe("2026-09-27");
    expect(calls[0]!.headers["customy-version"]).toBe("2026-09-27");
    const pinned = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch, headers: { "Customy-Version": "2026-10-01" } });
    await pinned.inApp.list();
    expect(calls[1]!.headers["customy-version"]).toBe("2026-10-01");
    expect(SEND_SCOPES).toEqual(expect.arrayContaining(["send:content_cards:read", "send:content_cards:manage", "send:in_app:manage"]));
  });

  it("in-app v2: aprobación, prueba, estadísticas, plantillas, kits de marca, tarjetas y vista previa", async () => {
    const replies = Array.from({ length: 35 }, () => (call: Call) => json(200, { object: "ok", echo: call.url }));
    const { fetch, calls } = scripted(replies);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch });
    await send.inApp.create({ name: "Primer", layout: "slideup", content: { blocks: [{ type: "heading", text: "Hola {{ first_name }}" }, { type: "survey", id: "nps", question: "¿Nos recomiendas?", kind: "rating", scale: 10 }] }, audience: { filters: [{ field: "attributes.plan", op: "eq", value: "pro" }] }, trigger_filters: [{ property: "total", op: "gte", value: 50 }], delay_seconds: 3, variants: [{ id: "a", weight: 50, content: { title: "A" } }], control_pct: 10, conversion: { event: "purchase", window_hours: 48 } }, { actor: "usr_ana", idempotencyKey: "iam-1" });
    await send.inApp.update("iam_1", { priority: 3 }, { actor: "usr_ana" });
    await send.inApp.submit("iam_1", { actor: "usr_ana" });
    await send.inApp.approve("iam_1", { actor: "usr_bea" });
    await send.inApp.reject("iam_1", "copy", { actor: "usr_bea" });
    await send.inApp.activate("iam_1");
    await send.inApp.pause("iam_1");
    await send.inApp.test("iam_1", { subscriber: "user_1", variant_id: "a" });
    await send.inApp.stats("iam_1");
    await send.inApp.templates.list();
    await send.inApp.templates.get("tpl_welcome");
    await send.inApp.templates.create({ name: "Mía", layout: "modal", content: { title: "x" }, tags: ["promo"] });
    await send.inApp.templates.update("tpl_1", { name: "Otra" });
    await send.inApp.templates.remove("tpl_1");
    await send.brandKits.list();
    await send.brandKits.get("bk_1");
    await send.brandKits.create({ name: "Bonu", colors: { background: "#ffffff", text: "#111111", accent: "#00aa55", muted: "#888888" }, radius: 12, default: true });
    await send.brandKits.update("bk_1", { radius: 8 });
    await send.brandKits.remove("bk_1");
    await send.contentCards.create({ name: "Promo", kind: "captioned", title: "2x1", pinned: true }, { actor: "usr_ana" });
    await send.contentCards.list({ status: "in_review", limit: 5 });
    await send.contentCards.get("cc_1");
    await send.contentCards.update("cc_1", { title: "3x2" });
    await send.contentCards.remove("cc_1");
    await send.contentCards.submit("cc_1");
    await send.contentCards.approve("cc_1", { actor: "usr_bea" });
    await send.contentCards.reject("cc_1");
    await send.contentCards.activate("cc_1");
    await send.contentCards.pause("cc_1");
    await send.contentCards.test("cc_1", { subscriber: "user_1" });
    await send.contentCards.stats("cc_1");
    await send.templates.preview({ text: "Hola {{ first_name | default: \"amiga\" }}", subscriber: "user_1", locale: "es" });
    await send.subscribers.put("user_1", { attributes: { first_name: "Ana", plan: null } });
    await send.inApp.approvals("iam_1");
    await send.contentCards.approvals("cc_1");
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}${new URL(call.url).search}`)).toEqual([
      "POST /api/in-app/messages",
      "PATCH /api/in-app/messages/iam_1",
      "POST /api/in-app/messages/iam_1/submit",
      "POST /api/in-app/messages/iam_1/approve",
      "POST /api/in-app/messages/iam_1/reject",
      "POST /api/in-app/messages/iam_1/activate",
      "POST /api/in-app/messages/iam_1/pause",
      "POST /api/in-app/messages/iam_1/test",
      "GET /api/in-app/messages/iam_1/stats",
      "GET /api/in-app/templates",
      "GET /api/in-app/templates/tpl_welcome",
      "POST /api/in-app/templates",
      "PATCH /api/in-app/templates/tpl_1",
      "DELETE /api/in-app/templates/tpl_1",
      "GET /api/brand-kits",
      "GET /api/brand-kits/bk_1",
      "POST /api/brand-kits",
      "PATCH /api/brand-kits/bk_1",
      "DELETE /api/brand-kits/bk_1",
      "POST /api/content-cards",
      "GET /api/content-cards?status=in_review&limit=5",
      "GET /api/content-cards/cc_1",
      "PATCH /api/content-cards/cc_1",
      "DELETE /api/content-cards/cc_1",
      "POST /api/content-cards/cc_1/submit",
      "POST /api/content-cards/cc_1/approve",
      "POST /api/content-cards/cc_1/reject",
      "POST /api/content-cards/cc_1/activate",
      "POST /api/content-cards/cc_1/pause",
      "POST /api/content-cards/cc_1/test",
      "GET /api/content-cards/cc_1/stats",
      "POST /api/templates/preview",
      "PUT /api/subscribers/user_1",
      "GET /api/in-app/messages/iam_1/approvals",
      "GET /api/content-cards/cc_1/approvals",
    ]);
    const actor = (i: number) => calls[i]!.headers["x-customy-actor"];
    expect([actor(0), actor(1), actor(2), actor(3), actor(4), actor(5)]).toEqual(["usr_ana", "usr_ana", "usr_ana", "usr_bea", "usr_bea", undefined]);
    expect(calls[0]!.headers["idempotency-key"]).toBe("iam-1");
    expect(calls[19]!.headers["idempotency-key"]).toBeTruthy();
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ layout: "slideup", delay_seconds: 3, control_pct: 10, trigger_filters: [{ property: "total", op: "gte", value: 50 }] });
    expect(JSON.parse(calls[4]!.body!)).toEqual({ reason: "copy" });
    expect(JSON.parse(calls[26]!.body!)).toEqual({});
    expect(JSON.parse(calls[7]!.body!)).toEqual({ subscriber: "user_1", variant_id: "a" });
    expect(JSON.parse(calls[31]!.body!)).toEqual({ text: "Hola {{ first_name | default: \"amiga\" }}", subscriber: "user_1", locale: "es" });
    expect(JSON.parse(calls[32]!.body!)).toEqual({ attributes: { first_name: "Ana", plan: null } });
    expect(calls.every((call) => call.headers["customy-version"] === "2026-09-27")).toBe(true);
  });

  it("actividad de prueba y buscar a una persona por atributo", async () => {
    const replies = Array.from({ length: 4 }, () => (call: Call) => json(200, { object: "list", data: [], has_more: false, echo: call.url }));
    const { fetch, calls } = scripted(replies);
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch });
    await send.inApp.testEvents("iam_1", { limit: 20 });
    await send.contentCards.testEvents("cc_1");
    const found = await send.subscribers.find({ attribute: "email", value: "ana@example.com" });
    expect(found.data).toEqual([]);
    await send.subscribers.find({ attribute: "plan", value: "pro", limit: 5 });
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}${new URL(call.url).search}`)).toEqual([
      "GET /api/in-app/messages/iam_1/test-events?limit=20",
      "GET /api/content-cards/cc_1/test-events",
      "GET /api/subscribers?attribute=email&value=ana%40example.com",
      "GET /api/subscribers?attribute=plan&value=pro&limit=5",
    ]);
  });

  it("una sola clase de error entre el servidor y la bandeja, y la categoría de iOS de Send", () => {
    expect(InboxSendError).toBe(CustomySendError);
    expect(actionCategoryId([{ id: "view" }, { id: "mark_paid", auth_required: true }])).toBe(actionCategoryId([{ id: "mark_paid", auth_required: true }, { id: "view" }]));
    expect(actionCategoryId([{ id: "view" }])).toMatch(/^cy_[0-9a-f]{8}$/);
  });
});

describe("plazo por llamada", () => {
  it("emails.send acepta timeoutMs y corta aunque el cliente espere más", async () => {
    const fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof globalThis.fetch;
    const send = createSend({ baseUrl: BASE, accessToken: "cs_test_x", fetch, timeoutMs: 60_000, retry: false });
    await expect(send.emails.send({ to: "ana@example.com", subject: "s", html: "<p>x</p>", from: "a@example.com" }, { timeoutMs: 5 })).rejects.toMatchObject({ code: "SDK_TIMEOUT" });
  });
});
