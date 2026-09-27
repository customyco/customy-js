import { createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { actionCategoryId, createSend, CustomySendError, verifyWebhook } from "./index";
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

  it("una sola clase de error entre el servidor y la bandeja, y la categoría de iOS de Send", () => {
    expect(InboxSendError).toBe(CustomySendError);
    expect(actionCategoryId([{ id: "view" }, { id: "mark_paid", auth_required: true }])).toBe(actionCategoryId([{ id: "mark_paid", auth_required: true }, { id: "view" }]));
    expect(actionCategoryId([{ id: "view" }])).toMatch(/^cy_[0-9a-f]{8}$/);
  });
});
