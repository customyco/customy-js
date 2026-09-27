import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { actionCategoryId, CustomySend, CustomySendError, verifyWebhook } from "./index";

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

describe("CustomySend", () => {
  it("manda con Bearer, traduce camelCase a la API y devuelve el correo", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const send = new CustomySend("cs_live_abc", { baseUrl: "https://send.test/", fetch: fakeFetch((url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ id: "eml_1", status: "queued" }), { status: 201 }); }) });
    const email = await send.emails.send({ from: "Acme <a@acme.com>", to: "u@x.com", subject: "s", text: "t", replyTo: "r@acme.com", scheduledAt: "in 1 hour", trackOpens: false }, { idempotencyKey: "k1" });
    expect(email).toMatchObject({ id: "eml_1" });
    expect(seen[0]!.url).toBe("https://send.test/api/emails");
    const headers = seen[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer cs_live_abc");
    expect(headers["idempotency-key"]).toBe("k1");
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({ from: "Acme <a@acme.com>", to: "u@x.com", subject: "s", text: "t", reply_to: "r@acme.com", scheduled_at: "in 1 hour", track_opens: false });
  });

  it("acepta un proveedor de tokens de Customy Access y lo consulta en cada petición", async () => {
    let issued = 0;
    const seen: string[] = [];
    const send = new CustomySend(async () => `jwt-${++issued}`, { baseUrl: "https://send.test", fetch: fakeFetch((_url, init) => { seen.push((init.headers as Record<string, string>).authorization); return new Response(JSON.stringify({ data: [] }), { status: 200 }); }) });
    await send.request("GET", "/api/templates");
    await send.request("GET", "/api/templates");
    expect(seen).toEqual(["Bearer jwt-1", "Bearer jwt-2"]);
    expect(() => new CustomySend("sk_otro")).toThrow(/cs_live_/);
  });

  it("un error de la API llega con código y estado; un 429 de ritmo se reintenta con retry-after", async () => {
    let calls = 0;
    const send = new CustomySend("cs_test_abc", { baseUrl: "https://send.test", maxRetries: 2, fetch: fakeFetch(() => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "slow down" }), { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) });
    expect(await send.emails.list()).toEqual({ data: [] });
    expect(calls).toBe(2);
    const failing = new CustomySend("cs_test_abc", { baseUrl: "https://send.test", fetch: fakeFetch(() => new Response(JSON.stringify({ statusCode: 422, name: "domain_not_verified", message: "verify acme.com first" }), { status: 422 })) });
    await expect(failing.emails.send({ from: "a@acme.com", to: "u@x.com", subject: "s", text: "t" })).rejects.toMatchObject({ name: "CustomySendError", status: 422, code: "domain_not_verified" });
    expect(() => new CustomySend("mala")).toThrow();
  });

  it("verifica la firma de un webhook como la produce Send", async () => {
    const secret = `whsec_${Buffer.from("secreto-de-24-bytes-aqui").toString("base64")}`;
    const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-13T00:00:00Z", data: { email_id: "eml_1" } });
    const ts = Math.floor(Date.now() / 1000);
    const mac = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
    const headers = { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": `v1,${mac}` };
    const event = await verifyWebhook(body, headers, secret);
    expect(event.type).toBe("email.delivered");
    await expect(verifyWebhook(body, { ...headers, "webhook-signature": "v1,AAAA" }, secret)).rejects.toThrow(/firma/);
    await expect(verifyWebhook(body, { ...headers, "webhook-timestamp": String(ts - 3600) }, secret)).rejects.toThrow(/marca de tiempo/);
    expect(new CustomySendError(0, "x", "y", null)).toBeInstanceOf(Error);
  });
});

describe("CustomySend · Engage", () => {
  function recorder(respond: (url: string, init: RequestInit) => Response = () => new Response(JSON.stringify({ object: "notification", id: "ntf_1", status: "accepted" }), { status: 202 })) {
    const seen: Array<{ method: string; path: string; headers: Record<string, string>; body: unknown }> = [];
    const fetchImpl = fakeFetch((url, init) => {
      const u = new URL(url);
      seen.push({ method: String(init.method), path: `${u.pathname}${u.search}`, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return respond(url, init);
    });
    return { seen, send: new CustomySend("cs_live_abc", { baseUrl: "https://send.test", fetch: fetchImpl, maxRetries: 1 }) };
  }

  it("notifications.send lleva la Idempotency-Key y reintenta un 5xx solo con ella", async () => {
    let calls = 0;
    const { seen, send } = recorder(() => (++calls === 1 ? new Response(JSON.stringify({ name: "internal", message: "x" }), { status: 503 }) : new Response(JSON.stringify({ object: "notification", id: "ntf_1", status: "accepted", replayed: false }), { status: 202 })));
    const out = await send.notifications.send({ to: "user_1", title: "Pago recibido", body: "Gracias", category: "payments", source: { campaign_id: "cmp_1" } }, { idempotencyKey: "pay-42" });
    expect(out).toMatchObject({ id: "ntf_1", replayed: false });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.path).toBe("/api/notifications");
    expect(seen[0]!.headers["idempotency-key"]).toBe("pay-42");
    expect(seen[1]!.headers["idempotency-key"]).toBe("pay-42");
    expect(seen[0]!.body).toEqual({ to: "user_1", title: "Pago recibido", body: "Gracias", category: "payments", source: { campaign_id: "cmp_1" } });

    // Sin llave, el SDK (el de @customyai/send, debajo del adaptador) genera una:
    // el reintento de un 5xx lleva la misma y no puede duplicar la notificación.
    calls = 0;
    await expect(send.notifications.send({ to: "user_1", title: "x" })).resolves.toMatchObject({ id: "ntf_1" });
    expect(seen).toHaveLength(4);
    expect(seen[2]!.headers["idempotency-key"]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(seen[3]!.headers["idempotency-key"]).toBe(seen[2]!.headers["idempotency-key"]);
  });

  it("rutas de notificaciones, push, bandeja e in-app", async () => {
    const { seen, send } = recorder(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await send.notifications.get("ntf_1");
    await send.notifications.stats({ from: "2026-09-01", category: "payments" });
    await send.notifications.conversion("ntf_1", { subscriber: "user_1", id: "order-9", event: "purchase", value: 20 });
    await send.push.devices.register({ subscriber: "user_1", platform: "android", token: "t".repeat(40) });
    await send.push.devices.list("user_1");
    await send.push.devices.remove({ subscriber: "user_1" });
    await send.push.credentials.putFcm({ service_account: { project_id: "p" } });
    await send.push.credentials.putApns({ team_id: "ABCDE12345", key_id: "KEY1234567", bundle_id: "com.example.app", private_key: "-----BEGIN PRIVATE KEY-----" });
    await send.push.credentials.list();
    await send.push.credentials.remove("apns");
    await send.inbox.list("user_1", { status: "unread", limit: 10 });
    await send.inbox.mark({ subscriber: "user_1", action: "read", all: true });
    await send.inbox.createToken("user_1", { ttl: 900 });
    await send.inApp.create({ name: "Bienvenida", layout: "modal", content: { title: "Hola" } });
    await send.inApp.list({ status: "active" });
    await send.inApp.get("iam_1");
    await send.inApp.update("iam_1", { priority: 5 });
    await send.inApp.archive("iam_1");
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "GET /api/notifications/ntf_1",
      "GET /api/notifications/stats?from=2026-09-01&category=payments",
      "POST /api/notifications/ntf_1/conversions",
      "POST /api/push/devices",
      "GET /api/push/devices?subscriber=user_1",
      "DELETE /api/push/devices?subscriber=user_1",
      "PUT /api/push/credentials/fcm",
      "PUT /api/push/credentials/apns",
      "GET /api/push/credentials",
      "DELETE /api/push/credentials/apns",
      "GET /api/inbox?subscriber=user_1&status=unread&limit=10",
      "POST /api/inbox/mark",
      "POST /api/inbox/tokens",
      "POST /api/in-app/messages",
      "GET /api/in-app/messages?status=active",
      "GET /api/in-app/messages/iam_1",
      "PATCH /api/in-app/messages/iam_1",
      "DELETE /api/in-app/messages/iam_1",
    ]);
    expect(seen[12]!.body).toEqual({ subscriber: "user_1", ttl: 900 });
    expect(seen[0]!.headers.authorization).toBe("Bearer cs_live_abc");
  });

  it("push P0: contenido rico, programación, cancelar/retirar, categorías, ajustes y personas", async () => {
    const { seen, send } = recorder(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const rich = {
      to: "user_1", title: "Pago", subtitle: "Internet", sound: null, thread_id: "bills", interruption_level: "time_sensitive" as const, relevance_score: 0.8,
      actions: [{ id: "mark_paid", label: "Marcar pagada", url: "/bills/42/pay", auth_required: true }], media: { url: "https://cdn.example/a.gif", type: "gif" as const },
      android: { channel_id: "payments", visibility: "private" as const }, replace: true, tag: "bill-42", send_at: "2026-10-01T09:00:00", delivery: { timezone: "subscriber" as const, quiet_hours: { start: "22:00", end: "07:00", action: "delay" as const } },
    };
    await send.notifications.send(rich);
    await send.notifications.send({ to: "user_1", type: "background", data: { sync: "bills" } });
    await send.notifications.cancel("ntf_1", { recall: true });
    await send.notifications.categories.put("payments", { name: "Pagos", android_channel_id: "payments", frequency_cap: { per: "day", max: 3 } });
    await send.notifications.categories.list();
    await send.notifications.categories.get("payments");
    await send.notifications.categories.remove("payments");
    await send.notifications.settings.put({ frequency_caps: [{ per: "day", max: 5 }], provider_budgets: { apns: 1000 } });
    await send.notifications.settings.get();
    await send.subscribers.put("user 1", { timezone: "America/Bogota", quiet_hours: null });
    await send.subscribers.get("user 1");
    await send.subscribers.preferences.put("user_1", { categories: { offers: { push: false } } });
    await send.subscribers.preferences.get("user_1");
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "POST /api/notifications",
      "POST /api/notifications",
      "POST /api/notifications/ntf_1/cancel",
      "PUT /api/notifications/categories/payments",
      "GET /api/notifications/categories",
      "GET /api/notifications/categories/payments",
      "DELETE /api/notifications/categories/payments",
      "PUT /api/notifications/settings",
      "GET /api/notifications/settings",
      "PUT /api/subscribers/user%201",
      "GET /api/subscribers/user%201",
      "PUT /api/subscribers/user_1/preferences",
      "GET /api/subscribers/user_1/preferences",
    ]);
    expect(seen[0]!.body).toEqual(rich);
    expect(seen[2]!.body).toEqual({ recall: true });
    expect(seen[9]!.body).toEqual({ timezone: "America/Bogota", quiet_hours: null });
  });

  it("actionCategoryId: la misma categoría de iOS que manda Send (FNV-1a de ids y opciones)", () => {
    expect(actionCategoryId([{ id: "a" }])).toBe("cy_063c9c0c");
    const set = [{ id: "mark_paid", auth_required: true }, { id: "view" }];
    expect(actionCategoryId(set)).toMatch(/^cy_[0-9a-f]{8}$/);
    expect(actionCategoryId([{ ...set[0]!, label: "Otra" } as never, set[1]!])).toBe(actionCategoryId(set));
    expect(actionCategoryId([{ id: "mark_paid" }, { id: "view" }])).not.toBe(actionCategoryId(set));
    expect(actionCategoryId([...set].reverse())).toBe(actionCategoryId(set));
    // Los mismos vectores que Bonu (categoryIdFor) y su extensión de iPhone.
    expect(actionCategoryId([{ id: "bill_paid", foreground: false, auth_required: true }, { id: "open", foreground: true }])).toBe("cy_5d8086ff");
    expect(actionCategoryId([{ id: "reply", foreground: false, auth_required: true, input: { button: "" } }, { id: "open", foreground: true }])).toBe("cy_ceb8d6fa");
  });
});

describe("deprecación", () => {
  it("avisa una sola vez por proceso aunque se creen varios clientes", () => {
    (globalThis as { [key: symbol]: Set<string> | undefined })[Symbol.for("customy.sdk.deprecations")]?.clear();
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    new CustomySend("cs_test_a");
    new CustomySend("cs_test_b");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("@customyai/send-sdk is deprecated");
    warn.mockRestore();
  });
});
