import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "../engage-types";
import { actionCategoryId, createInboxClient, formatBadgeCount, subscriberTokenExpiry, type WebSocketLike } from "./index";

// ── Dobles de prueba ───────────────────────────────────────────────────

type Call = { method: string; path: string; auth: string; body: any };
type Handler = (call: Call) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(handler: Handler) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call = { method: init?.method ?? "GET", path: `${u.pathname}${u.search}`, auth: headers.authorization, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { impl, calls };
}

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
  }
  // Lo que haría Customy Realtime.
  connect() {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({ data: JSON.stringify({ type: "connected", clientId: "c1", channels: [], timestamp: "now" }) });
  }
  signal(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ type: "inbox.acc.abc", tenantId: "org", ephemeral: true, payload }) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

function item(id: string, patch: Partial<InboxItem> = {}): InboxItem {
  return { object: "inbox_item", id, notification_id: id.replace("ibx_", "ntf_"), category: null, title: `t ${id}`, body: null, url: null, icon: null, image: null, tag: null, data: null, seen: false, read: false, archived: false, interacted: false, created_at: "2026-09-26T00:00:00.000Z", ...patch };
}

const page = (items: InboxItem[], counts = { unread: items.filter((i) => !i.read).length, unseen: items.filter((i) => !i.seen).length, version: 1 }, next: string | null = null) =>
  json({ object: "list", data: items, has_more: Boolean(next), next_cursor: next, counts });

async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createInboxClient", () => {
  it("pide otro token ante un 401 y repite la petición una vez", async () => {
    let issued = 0;
    const { impl, calls } = fakeFetch((call) => (call.auth === "Bearer sst_old" ? json({ statusCode: 401, name: "invalid_subscriber_token", message: "expired" }, 401) : page([item("ibx_1")])));
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, token: async () => (++issued === 1 ? "sst_old" : "sst_new") });
    const out = await client.list();
    expect(out.data).toHaveLength(1);
    expect(issued).toBe(2);
    expect(calls.map((c) => c.auth)).toEqual(["Bearer sst_old", "Bearer sst_new"]);
    expect(calls[0]!.path).toBe("/client/inbox?limit=20&status=all");
    // El token nuevo se reutiliza.
    await client.counts().catch(() => undefined);
    expect(issued).toBe(2);
  });

  it("renueva el token antes de que caduque", async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Date.now();
    const soon = `sst_${b64({ alg: "HS256" })}.${b64({ exp: Math.floor(now / 1000) + 30 })}.sig`;
    expect(subscriberTokenExpiry(soon)).toBe((Math.floor(now / 1000) + 30) * 1000);
    let issued = 0;
    const { impl } = fakeFetch(() => json({ object: "inbox_counts", unread: 0, unseen: 0, version: 1 }));
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, token: async () => (issued++, soon) });
    await client.counts();
    await client.counts();
    expect(issued).toBe(2);
  });

  it("marca de forma optimista y deshace si el servidor falla", async () => {
    let failMarks = false;
    const { impl, calls } = fakeFetch((call) => {
      if (call.path.startsWith("/client/inbox?")) return page([item("ibx_1"), item("ibx_2"), item("ibx_3", { read: true, seen: true })], { unread: 2, unseen: 2, version: 5 });
      if (call.path === "/client/inbox/mark") return failMarks ? json({ statusCode: 422, name: "validation_error", message: "no" }, 422) : json({ object: "inbox_counts", unread: 1, unseen: 1, version: 6 });
      if (call.path === "/client/inbox/counts") return json({ object: "inbox_counts", unread: 1, unseen: 1, version: 6 });
      return json({}, 404);
    });
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, token: async () => "sst_t" });
    await client.list();

    const pending = client.markRead(["ibx_1"]);
    // Antes de que responda el servidor la interfaz ya cambió.
    expect(client.getState().items.find((i) => i.id === "ibx_1")).toMatchObject({ read: true, seen: true });
    expect(client.getState().counts).toEqual({ unread: 1, unseen: 1, version: 5 });
    await pending;
    expect(client.getState().counts).toEqual({ unread: 1, unseen: 1, version: 6 });
    expect(calls.find((c) => c.path === "/client/inbox/mark")!.body).toEqual({ action: "read", ids: ["ibx_1"] });

    // Archivar sale de la lista; si falla, vuelve a su sitio con sus contadores.
    failMarks = true;
    const archived = client.archive(["ibx_2"]);
    expect(client.getState().items.map((i) => i.id)).toEqual(["ibx_1", "ibx_3"]);
    expect(client.getState().counts.unread).toBe(0);
    await expect(archived).rejects.toMatchObject({ status: 422, code: "validation_error" });
    expect(client.getState().items.map((i) => i.id)).toEqual(["ibx_1", "ibx_2", "ibx_3"]);
    expect(client.getState().items[1]).toMatchObject({ archived: false, read: false });
    expect(client.getState().counts).toEqual({ unread: 1, unseen: 1, version: 6 });

    // Marcar todo como leído: una llamada, contadores a cero al instante.
    failMarks = false;
    const all = client.markRead("all");
    expect(client.getState().counts.unread).toBe(0);
    expect(client.getState().items.every((i) => i.read)).toBe(true);
    await all;
    expect(calls.filter((c) => c.path === "/client/inbox/mark").at(-1)!.body).toEqual({ action: "read", all: true });
    await client.close();
  });

  it("tiempo real: aplica señales nuevas, ignora versiones viejas y relee la primera página", async () => {
    let listCalls = 0;
    const { impl, calls } = fakeFetch((call) => {
      if (call.path === "/client/realtime-ticket") return json({ object: "realtime_ticket", ticket: `tk${calls.length}`, channels: ["inbox.acc.abc", "notify.acc"], url: `wss://rt.test/ws?ticket=tk${calls.length}` });
      if (call.path.startsWith("/client/inbox?")) {
        listCalls += 1;
        return listCalls === 1 ? page([item("ibx_1")], { unread: 1, unseen: 1, version: 3 }) : page([item("ibx_2"), item("ibx_1")], { unread: 2, unseen: 2, version: 7 });
      }
      if (call.path === "/client/inbox/counts") return json({ object: "inbox_counts", unread: 1, unseen: 1, version: 3 });
      return json({}, 404);
    });
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: FakeSocket, token: async () => "sst_t" });
    await client.list();
    const changes: unknown[] = [];
    const off = client.subscribe((change) => changes.push(change));
    await settle();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0]!.url).toContain("ticket=");
    FakeSocket.instances[0]!.connect();
    await settle();
    expect(client.getState().connection).toBe("realtime");

    FakeSocket.instances[0]!.signal({ type: "inbox.changed", reason: "new", counts: { unread: 2, unseen: 2 }, version: 7 });
    expect(client.getState().counts).toEqual({ unread: 2, unseen: 2, version: 7 });
    await settle(200);
    expect(client.getState().items.map((i) => i.id)).toEqual(["ibx_2", "ibx_1"]);

    // Una señal atrasada (versión menor o igual) no toca nada.
    FakeSocket.instances[0]!.signal({ type: "inbox.changed", counts: { unread: 0, unseen: 0 }, version: 6 });
    FakeSocket.instances[0]!.signal({ type: "inbox.changed", counts: { unread: 0, unseen: 0 }, version: 7 });
    expect(client.getState().counts).toEqual({ unread: 2, unseen: 2, version: 7 });
    expect(changes).toEqual([{ type: "inbox", counts: { unread: 2, unseen: 2, version: 7 }, reason: "new" }]);

    // Se cae: se reconecta con un ticket nuevo.
    FakeSocket.instances[0]!.drop();
    await settle(1_100);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(calls.filter((c) => c.path === "/client/realtime-ticket")).toHaveLength(2);
    expect(FakeSocket.instances[1]!.url).not.toBe(FakeSocket.instances[0]!.url);
    off();
    expect(client.getState().connection).toBe("idle");
  });

  it("sin tiempo real (404 realtime_disabled) consulta los contadores cada intervalo", async () => {
    let version = 1;
    const { impl, calls } = fakeFetch((call) => {
      if (call.path === "/client/realtime-ticket") return json({ statusCode: 404, name: "realtime_disabled", message: "poll" }, 404);
      if (call.path === "/client/inbox/counts") return json({ object: "inbox_counts", unread: version, unseen: version, version });
      return json({}, 404);
    });
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: FakeSocket, pollIntervalMs: 30_000, token: async () => "sst_t" });
    const changes: any[] = [];
    client.subscribe((change) => changes.push(change));
    await settle();
    expect(client.getState().connection).toBe("polling");
    expect(FakeSocket.instances).toHaveLength(0);
    expect(client.getState().counts.version).toBe(1);
    version = 4;
    await settle(30_000);
    expect(client.getState().counts).toEqual({ unread: 4, unseen: 4, version: 4 });
    expect(calls.filter((c) => c.path === "/client/inbox/counts")).toHaveLength(2);
    expect(changes.map((c) => c.counts.version)).toEqual([1, 4]);
    await client.close();
  });

  it("si el WebSocket falla una y otra vez se queda en sondeo", async () => {
    const { impl, calls } = fakeFetch((call) => {
      if (call.path === "/client/realtime-ticket") return json({ ticket: "t", channels: [], url: "wss://rt.test/ws" });
      if (call.path === "/client/inbox/counts") return json({ object: "inbox_counts", unread: 0, unseen: 0, version: 1 });
      return json({}, 404);
    });
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: FakeSocket, maxRealtimeFailures: 3, pollIntervalMs: 45_000, token: async () => "sst_t" });
    client.subscribe(() => undefined);
    for (let i = 0; i < 3; i += 1) {
      await settle();
      FakeSocket.instances.at(-1)!.drop();
      await settle(5_000);
    }
    expect(FakeSocket.instances).toHaveLength(3);
    expect(client.getState().connection).toBe("polling");
    const tickets = calls.filter((c) => c.path === "/client/realtime-ticket").length;
    await settle(120_000);
    expect(calls.filter((c) => c.path === "/client/realtime-ticket").length).toBe(tickets);
    expect(calls.filter((c) => c.path === "/client/inbox/counts").length).toBeGreaterThanOrEqual(3);
    await client.close();
  });

  it("junta los recibos en lotes con ids estables y los reintenta sin duplicar", async () => {
    let fail = 1;
    const { impl, calls } = fakeFetch((call) => {
      if (call.path === "/client/events") {
        if (fail-- > 0) return json({ statusCode: 503, name: "unavailable", message: "later" }, 503);
        return json({ object: "client_events", accepted: call.body.events.length, rejected: 0 }, 202);
      }
      return json({}, 404);
    });
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, maxRetries: 0, events: { flushIntervalMs: 1_000, maxBatch: 3 }, token: async () => "sst_t" });
    client.track({ type: "delivered", notification_id: "ntf_1", channel: "fcm" });
    client.track({ type: "opened", notification_id: "ntf_1", channel: "fcm" });
    expect(calls).toHaveLength(0);
    await settle(1_000);
    // Primer intento: 503 → siguen en la cola.
    expect(calls).toHaveLength(1);
    const firstIds = calls[0]!.body.events.map((e: { id: string }) => e.id);
    expect(firstIds).toHaveLength(2);
    expect(new Set(firstIds).size).toBe(2);
    await settle(5_000);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.events.map((e: { id: string }) => e.id)).toEqual(firstIds);

    // Al llegar a maxBatch se envía sin esperar.
    client.track([{ type: "impression", in_app_id: "iam_1" }, { type: "clicked", in_app_id: "iam_1", action: "cta" }, { type: "dismissed", in_app_id: "iam_2" }]);
    await settle();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.body.events).toHaveLength(3);
    expect(calls[2]!.body.events[1]).toMatchObject({ type: "clicked", in_app_id: "iam_1", action: "cta" });
    await client.close();
  });

  it("mensajes in-app: la app declara su plataforma y el servidor filtra", async () => {
    const { impl, calls } = fakeFetch(() => json({ object: "list", data: [] }));
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, locale: "es", platform: "android", token: async () => "sst_t" });
    await client.inApp.eligible();
    expect(calls[0]!.path).toBe("/client/in-app?locale=es&platform=android");
    await client.close();
    const bare = fakeFetch(() => json({ object: "list", data: [] }));
    const plain = createInboxClient({ baseUrl: "https://send.test", fetch: bare.impl, WebSocket: null, token: async () => "sst_t" });
    await plain.inApp.eligible();
    expect(bare.calls[0]!.path).toBe("/client/in-app");
    await plain.close();
  });

  it("mensajes in-app: el de mayor prioridad por disparador, sin repetir los vistos", async () => {
    const { impl, calls } = fakeFetch((call) => {
      if (call.path.startsWith("/client/in-app")) {
        return json({
          object: "list",
          data: [
            { id: "iam_low", layout: "banner", trigger_event: "session_start", priority: 0, frequency: "once", ends_at: null, content: { title: "low", buttons: [], style: {} } },
            { id: "iam_high", layout: "modal", trigger_event: "session_start", priority: 10, frequency: "once", ends_at: null, content: { title: "high", buttons: [], style: {} } },
            { id: "iam_cart", layout: "card", trigger_event: "checkout_viewed", priority: 50, frequency: "always", ends_at: null, content: { title: "cart", buttons: [], style: {} } },
          ],
        });
      }
      return json({ object: "client_events", accepted: 1, rejected: 0 }, 202);
    });
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, locale: "es", token: async () => "sst_t" });
    await client.inApp.eligible();
    expect(calls[0]!.path).toBe("/client/in-app?locale=es");
    expect(client.inApp.forTrigger("session_start")?.id).toBe("iam_high");
    expect(client.inApp.forTrigger("checkout_viewed")?.id).toBe("iam_cart");
    client.inApp.impression("iam_high");
    expect(client.inApp.forTrigger("session_start")?.id).toBe("iam_low");
    client.inApp.impression("iam_cart");
    expect(client.inApp.forTrigger("checkout_viewed")?.id).toBe("iam_cart");
    client.inApp.dismiss("iam_cart");
    expect(client.inApp.forTrigger("checkout_viewed")).toBeNull();
    await client.flush();
    const sent = calls.filter((c) => c.path === "/client/events").flatMap((c) => c.body.events);
    expect(sent.map((e: { type: string; in_app_id: string }) => `${e.type}:${e.in_app_id}`)).toEqual(["impression:iam_high", "impression:iam_cart", "dismissed:iam_cart"]);
    await client.close();
  });

  it("registra y retira el dispositivo push de esta app", async () => {
    const { impl, calls } = fakeFetch((call) => (call.method === "POST" ? json({ object: "push_device", id: "pdv_1" }, 201) : json({ object: "push_device_removal", removed: 1 })));
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, token: async () => "sst_t" });
    await client.devices.register({ platform: "ios", token: "a".repeat(64), sandbox: true, app_version: "2.1.0" });
    await client.devices.unregister("a".repeat(64));
    expect(calls[0]).toMatchObject({ method: "POST", path: "/client/push/devices", body: { platform: "ios", token: "a".repeat(64), sandbox: true, app_version: "2.1.0" } });
    expect(calls[1]).toMatchObject({ method: "DELETE", path: `/client/push/devices?token=${"a".repeat(64)}` });
  });

  it("preferencias de la persona y apertura de un push con el botón pulsado", async () => {
    const { impl, calls } = fakeFetch((call) => (call.path === "/client/events" ? json({ accepted: 1 }, 202) : json({ object: "subscriber_preferences", subscriber: "u1", categories: { offers: { push: false, inbox: true } } })));
    const client = createInboxClient({ baseUrl: "https://send.test", fetch: impl, WebSocket: null, token: async () => "sst_t" });
    expect((await client.preferences.get()).categories.offers).toEqual({ push: false, inbox: true });
    await client.preferences.set({ offers: { push: true } });
    expect(calls[0]).toMatchObject({ method: "GET", path: "/client/preferences" });
    expect(calls[1]).toMatchObject({ method: "PUT", path: "/client/preferences", body: { categories: { offers: { push: true } } } });
    client.opened("ntf_1", { action: "mark_paid", channel: "apns", deviceId: "pdv_1" });
    await client.flush();
    const events = calls.filter((c) => c.path === "/client/events").flatMap((c) => c.body.events);
    expect(events).toEqual([{ type: "opened", notification_id: "ntf_1", channel: "apns", action: "mark_paid", device_id: "pdv_1", id: expect.any(String), occurred_at: expect.any(String) }]);
    expect(actionCategoryId([{ id: "a" }])).toBe("cy_063c9c0c");
    await client.close();
  });

  it("formatea la insignia", () => {
    expect(formatBadgeCount(0)).toBe("");
    expect(formatBadgeCount(7)).toBe("7");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(12, 9)).toBe("9+");
  });
});
