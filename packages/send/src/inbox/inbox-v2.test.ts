import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EligibleContentCard, EligibleInAppMessage } from "../engage-types";
import {
  BRIDGE_SCRIPT,
  buildHtmlDocument,
  clampHtmlHeight,
  createInAppPresenter,
  createInboxClient,
  CustomySendError,
  DEFAULT_CAPABILITIES,
  HTML_CSP,
  HTML_LAYOUTS,
  HTML_LAYOUTS_FEATURE,
  isSafeBridgeUrl,
  matchesFilters,
  parseBridgeMessage,
  safeAreaStyle,
} from "./index";

// ── Dobles de prueba ───────────────────────────────────────────────────

type Call = { method: string; path: string; headers: Record<string, string>; body: any };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const call = { method: init?.method ?? "GET", path: `${u.pathname}${u.search}`, headers: { ...((init?.headers ?? {}) as Record<string, string>) }, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { impl, calls };
}

function message(id: string, patch: Partial<EligibleInAppMessage> = {}): EligibleInAppMessage {
  return { id, layout: "modal", trigger_event: "session_start", priority: 0, frequency: "once", ends_at: null, content: { title: id, buttons: [], style: {} }, ...patch };
}

function card(id: string, patch: Partial<EligibleContentCard> = {}): EligibleContentCard {
  return { id, kind: "classic", title: id, body: null, image: null, url: null, button_label: null, pinned: false, dismissible: true, priority: 0, starts_at: "2026-09-01T00:00:00.000Z", ends_at: null, variant_id: null, test: false, ...patch };
}

const config = (patch: Record<string, unknown> = {}) => ({ object: "client_config", poll_seconds: 300, features: {}, min_sdk: "1.0.0", kill: { in_app: false, content_cards: false, html: false }, api_version: "2026-09-27", ...patch });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ── Filtros ────────────────────────────────────────────────────────────

describe("matchesFilters", () => {
  it("sin condiciones siempre se cumple; todas deben cumplirse (Y)", () => {
    expect(matchesFilters(undefined, {})).toBe(true);
    expect(matchesFilters([], {})).toBe(true);
    expect(matchesFilters([{ property: "a", op: "eq", value: 1 }, { property: "b", op: "eq", value: 2 }], { a: 1, b: 2 })).toBe(true);
    expect(matchesFilters([{ property: "a", op: "eq", value: 1 }, { property: "b", op: "eq", value: 2 }], { a: 1, b: 3 })).toBe(false);
  });

  it("eq / neq comparan valores simples por su texto y no confunden objetos", () => {
    expect(matchesFilters([{ property: "plan", op: "eq", value: "pro" }], { plan: "pro" })).toBe(true);
    expect(matchesFilters([{ property: "n", op: "eq", value: "1" }], { n: 1 })).toBe(true);
    expect(matchesFilters([{ property: "ok", op: "eq", value: "true" }], { ok: true })).toBe(true);
    expect(matchesFilters([{ property: "plan", op: "eq", value: "Pro" }], { plan: "pro" })).toBe(false);
    expect(matchesFilters([{ property: "o", op: "eq", value: { a: 1 } }], { o: { a: 1 } })).toBe(false);
    expect(matchesFilters([{ property: "plan", op: "neq", value: "pro" }], {})).toBe(true);
    expect(matchesFilters([{ property: "plan", op: "neq", value: "pro" }], { plan: "pro" })).toBe(false);
  });

  it("in / nin con lista (y un valor suelto como lista de uno)", () => {
    expect(matchesFilters([{ property: "c", op: "in", value: ["co", "mx"] }], { c: "mx" })).toBe(true);
    expect(matchesFilters([{ property: "c", op: "in", value: ["co", "mx"] }], { c: "ar" })).toBe(false);
    expect(matchesFilters([{ property: "c", op: "in", value: "co" }], { c: "co" })).toBe(true);
    expect(matchesFilters([{ property: "c", op: "nin", value: ["co"] }], { c: "mx" })).toBe(true);
    expect(matchesFilters([{ property: "c", op: "nin", value: ["co"] }], {})).toBe(true);
    expect(matchesFilters([{ property: "c", op: "in", value: ["co"] }], {})).toBe(false);
  });

  it("gte / lte: numérico, por versión y de texto; sin valor no se cumple", () => {
    expect(matchesFilters([{ property: "total", op: "gte", value: 50 }], { total: 80 })).toBe(true);
    expect(matchesFilters([{ property: "total", op: "gte", value: 50 }], { total: 50 })).toBe(true);
    expect(matchesFilters([{ property: "total", op: "lte", value: 50 }], { total: 80 })).toBe(false);
    expect(matchesFilters([{ property: "total", op: "gte", value: 9 }], { total: "10" })).toBe(true);
    expect(matchesFilters([{ property: "v", op: "gte", value: "1.9.0" }], { v: "1.10.0" })).toBe(true);
    expect(matchesFilters([{ property: "v", op: "lte", value: "1.2" }], { v: "1.2.0" })).toBe(true);
    expect(matchesFilters([{ property: "v", op: "gte", value: "2.0.0" }], { v: "1.99.3-beta.1" })).toBe(false);
    expect(matchesFilters([{ property: "d", op: "gte", value: "2026-09-01" }], { d: "2026-09-27" })).toBe(true);
    expect(matchesFilters([{ property: "total", op: "gte", value: 1 }], {})).toBe(false);
    expect(matchesFilters([{ property: "total", op: "lte", value: 1 }], { total: null })).toBe(false);
    expect(matchesFilters([{ property: "total", op: "gte", value: 1 }], { total: Number.NaN })).toBe(false);
  });

  it("exists / not_exists, contains en texto y en listas, rutas con puntos y operaciones desconocidas", () => {
    expect(matchesFilters([{ property: "coupon", op: "exists" }], { coupon: "" })).toBe(true);
    expect(matchesFilters([{ property: "coupon", op: "exists" }], { coupon: null })).toBe(false);
    expect(matchesFilters([{ property: "coupon", op: "not_exists" }], {})).toBe(true);
    expect(matchesFilters([{ property: "sku", op: "contains", value: "PRO" }], { sku: "X-PRO-1" })).toBe(true);
    expect(matchesFilters([{ property: "sku", op: "contains", value: "pro" }], { sku: "X-PRO-1" })).toBe(false);
    expect(matchesFilters([{ property: "tags", op: "contains", value: "vip" }], { tags: ["new", "vip"] })).toBe(true);
    expect(matchesFilters([{ property: "n", op: "contains", value: 1 }], { n: 1 })).toBe(false);
    expect(matchesFilters([{ property: "cart.total", op: "gte", value: 10 }], { cart: { total: 12 } })).toBe(true);
    expect(matchesFilters([{ property: "cart.total", op: "eq", value: 3 }], { "cart.total": 3, cart: { total: 12 } })).toBe(true);
    expect(matchesFilters([{ field: "attributes.plan", op: "eq", value: "pro" }], { "attributes.plan": "pro" })).toBe(true);
    expect(matchesFilters([{ property: "a", op: "regex" as never, value: ".*" }], { a: "x" })).toBe(false);
    expect(matchesFilters([{ property: "toString", op: "exists" }], {})).toBe(false);
  });
});

// ── Cliente: capacidades, configuración, disparadores ──────────────────

describe("createInboxClient · in-app v2", () => {
  it("sin capabilities no manda Customy-Client ni pide la configuración (app de 1.x)", async () => {
    const { impl, calls } = fakeFetch(() => json({ object: "list", data: [] }));
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, platform: "ios" });
    await client.inApp.eligible();
    expect(calls.map((c) => c.path)).toEqual(["/client/in-app?platform=ios"]);
    expect(calls[0]!.headers["customy-client"]).toBeUndefined();
  });

  it("con capabilities cada petición lleva Customy-Client; las que faltan son las de 1.x", async () => {
    const { impl, calls } = fakeFetch((call) => (call.path === "/client/config" ? json(config()) : json({ object: "list", data: [] })));
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, platform: "android", capabilities: { ...DEFAULT_CAPABILITIES, app_version: "1.4.2" } });
    await client.inApp.eligible();
    await vi.advanceTimersByTimeAsync(0);
    const header = JSON.parse(calls.find((c) => c.path.startsWith("/client/in-app"))!.headers["customy-client"]!);
    expect(header).toEqual({
      sdk: "send/0.2.0",
      app_version: "1.4.2",
      platform: "android",
      layouts: ["modal", "banner", "fullscreen", "card", "slideup", "tooltip", "html"],
      blocks: ["heading", "text", "image", "buttons", "spacer", "divider", "survey"],
      features: ["variables", "content_cards", "bridge_v1", "push_primer"],
    });
    expect(calls.find((c) => c.path.startsWith("/client/in-app"))!.path).toBe("/client/in-app?platform=android&app_version=1.4.2");
    expect(calls.every((c) => c.headers["customy-client"])).toBe(true);
    expect(calls.some((c) => c.path === "/client/config")).toBe(true);

    const partial = fakeFetch(() => json({ object: "list", data: [] }));
    const minimal = createInboxClient({ token: async () => "sst_x", fetch: partial.impl, WebSocket: null, capabilities: { features: ["content_cards"], sdk: "send-sdk/9.9.9" } });
    await minimal.contentCards();
    expect(JSON.parse(partial.calls[0]!.headers["customy-client"]!)).toEqual({ sdk: "send-sdk/9.9.9", layouts: ["modal", "banner", "fullscreen", "card"], blocks: [], features: ["content_cards"] });
  });

  it("inAppMessages: filtra por disparador y trigger_filters, ordena por prioridad y manda app_version", async () => {
    const data = [
      message("iam_low", { trigger_event: "checkout_viewed", priority: 1 }),
      message("iam_big_cart", { trigger_event: "checkout_viewed", priority: 10, trigger_filters: [{ property: "total", op: "gte", value: 100 }] }),
      message("iam_now", { trigger_event: "now", priority: 5 }),
      message("iam_other", { trigger_event: "session_start", priority: 50 }),
    ];
    const { impl, calls } = fakeFetch(() => json({ object: "list", data }));
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null });
    const small = await client.inAppMessages({ trigger: "checkout_viewed", properties: { total: 20 }, appVersion: "2.0.1" });
    expect(small.map((m) => m.id)).toEqual(["iam_now", "iam_low"]);
    expect(calls[0]!.path).toBe("/client/in-app?app_version=2.0.1");
    const big = await client.inAppMessages({ trigger: "checkout_viewed", properties: { total: 120 } });
    expect(big.map((m) => m.id)).toEqual(["iam_big_cart", "iam_now", "iam_low"]);
    expect(calls).toHaveLength(1);
    expect(client.inApp.forTrigger("checkout_viewed")?.id).toBe("iam_now");
    expect(client.inApp.forTrigger("checkout_viewed", { total: 500 })?.id).toBe("iam_big_cart");
    await client.inAppMessages({ trigger: "checkout_viewed", appVersion: "2.0.2" });
    expect(calls[1]!.path).toBe("/client/in-app?app_version=2.0.2");
  });

  it("los interruptores kill ocultan al momento in-app, HTML y tarjetas, y vuelven al apagarlos", async () => {
    let current = config();
    const { impl } = fakeFetch((call) => {
      if (call.path === "/client/config") return json(current);
      if (call.path.startsWith("/client/in-app")) return json({ object: "list", data: [message("iam_modal", { priority: 1 }), message("iam_html", { layout: "html", content: { buttons: [], style: {}, html: "<p>hola</p>" } })] });
      if (call.path.startsWith("/client/content-cards")) return json({ object: "list", data: [card("cc_1")] });
      return json({});
    });
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null });
    await client.inApp.eligible();
    await client.contentCards();
    expect(client.getState().config).toBeNull();
    expect(client.getState().inApp.messages.map((m) => m.id)).toEqual(["iam_modal", "iam_html"]);

    current = config({ kill: { in_app: false, content_cards: true, html: true } });
    await client.config();
    expect(client.getState().config?.kill).toEqual({ in_app: false, content_cards: true, html: true });
    expect(client.getState().inApp.messages.map((m) => m.id)).toEqual(["iam_modal"]);
    expect(client.getState().cards.items).toEqual([]);

    current = config({ kill: { in_app: true } });
    await client.config();
    expect(client.getState().inApp.messages).toEqual([]);
    expect(client.inApp.forTrigger("session_start")).toBeNull();
    expect(client.getState().cards.items.map((c) => c.id)).toEqual(["cc_1"]);

    current = config();
    await client.config();
    expect(client.getState().inApp.messages.map((m) => m.id)).toEqual(["iam_modal", "iam_html"]);
  });

  it("relee la configuración cada poll_seconds mientras hay suscripción, y no insiste si el servidor no la tiene", async () => {
    let polls = 0;
    const { impl } = fakeFetch((call) => {
      if (call.path === "/client/config") {
        polls += 1;
        return json(config({ poll_seconds: 60, kill: { in_app: polls >= 3, content_cards: false, html: false } }));
      }
      if (call.path === "/client/realtime-ticket") return json({ name: "realtime_disabled", message: "off" }, 404);
      return json({ unread: 0, unseen: 0, version: 1 });
    });
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, capabilities: DEFAULT_CAPABILITIES, pollIntervalMs: 1_000_000 });
    const off = client.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(polls).toBe(1);
    expect(client.getState().config?.poll_seconds).toBe(60);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(polls).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(polls).toBe(3);
    expect(client.getState().config?.kill.in_app).toBe(true);
    off();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(polls).toBe(3);

    const old = fakeFetch((call) => (call.path === "/client/config" ? json({ name: "not_found", message: "no" }, 404) : json({ unread: 0, unseen: 0, version: 1 })));
    const legacy = createInboxClient({ token: async () => "sst_x", fetch: old.impl, WebSocket: null, capabilities: DEFAULT_CAPABILITIES });
    await expect(legacy.config()).resolves.toBeNull();
    const stop = legacy.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(old.calls.filter((c) => c.path === "/client/config")).toHaveLength(1);
    stop();
    await legacy.close();
  });

  it("recibos v2: track.inApp, track.card, las marcas de 1.x con variante y cómo se pintó, encuestas y eventos propios", async () => {
    const { impl, calls } = fakeFetch((call) => {
      if (call.path.startsWith("/client/in-app")) return json({ object: "list", data: [message("iam_1", { variant_id: "b", rendered_as: "slideup" }), message("iam_2"), message("iam_3", { priority: -1 })] });
      if (call.path.startsWith("/client/content-cards")) return json({ object: "list", data: [card("cc_1", { priority: 5 }), card("cc_pin", { pinned: true, variant_id: "a" })] });
      return json({ accepted: 1 });
    });
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, events: { maxBatch: 100 } });
    await client.inApp.eligible();
    const cards = await client.contentCards();
    expect(cards.map((c) => c.id)).toEqual(["cc_pin", "cc_1"]);

    client.inApp.impression("iam_1");
    client.inApp.click("iam_2", "ok");
    client.track.inApp({ id: "iam_1", type: "click", action: "buy" });
    client.track.inApp({ id: "iam_3", type: "dismiss", variant_id: "c" });
    client.track.card({ id: "cc_pin", type: "impression" });
    client.track.card({ id: "cc_pin", type: "dismiss" });
    client.submitSurvey({ in_app_id: "iam_1", survey_id: "nps", answers: 9 });
    client.logEvent("checkout_completed", { total: 80 });
    client.track({ type: "opened", notification_id: "ntf_1" });
    expect(client.getState().cards.items.map((c) => c.id)).toEqual(["cc_1"]);
    expect(client.getState().inApp.messages).toEqual([]);
    await client.flush();

    const events = calls.filter((c) => c.path === "/client/events").flatMap((c) => c.body.events).map(({ id, occurred_at, ...rest }: any) => rest);
    expect(events).toEqual([
      { type: "impression", in_app_id: "iam_1", channel: "in_app", variant_id: "b", rendered_as: "slideup" },
      { type: "clicked", in_app_id: "iam_2", channel: "in_app", action: "ok" },
      { type: "in_app_click", in_app_id: "iam_1", channel: "in_app", action: "buy", variant_id: "b", rendered_as: "slideup" },
      { type: "in_app_dismiss", in_app_id: "iam_3", channel: "in_app", variant_id: "c" },
      { type: "card_impression", card_id: "cc_pin", variant_id: "a" },
      { type: "card_dismiss", card_id: "cc_pin", variant_id: "a" },
      { type: "survey_response", in_app_id: "iam_1", survey_id: "nps", answers: 9, variant_id: "b" },
      { type: "custom", name: "checkout_completed", properties: { total: 80 } },
      { type: "opened", notification_id: "ntf_1" },
    ]);
  });

  it("recibos por plataforma: cada evento lleva la plataforma de la app (o la suya propia) para el by_platform de las métricas", async () => {
    const { impl, calls } = fakeFetch(() => json({ accepted: 1 }));
    const web = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, platform: "web", events: { maxBatch: 100 } });
    web.track.inApp({ id: "iam_1", type: "impression" });
    web.track.card({ id: "cc_1", type: "click" });
    web.track({ type: "in_app_click", in_app_id: "iam_1", action: "ok", platform: "ios" });
    await web.flush();
    const ios = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, capabilities: { ...DEFAULT_CAPABILITIES, platform: "android" }, events: { maxBatch: 100 } });
    ios.track.inApp({ id: "iam_2", type: "dismiss" });
    await ios.flush();
    const unknown = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null, events: { maxBatch: 100 } });
    unknown.track.inApp({ id: "iam_3", type: "impression" });
    await unknown.flush();
    const events = calls.filter((c) => c.path === "/client/events").flatMap((c) => c.body.events);
    expect(events.map((e: { platform?: string }) => e.platform)).toEqual(["web", "web", "ios", "android", undefined]);
  });

  it("logEvent y submitSurvey rechazan nombres y propiedades fuera de límites con un error tipado", () => {
    const client = createInboxClient({ token: async () => "sst_x", fetch: fakeFetch(() => json({})).impl, WebSocket: null });
    const error = (() => {
      try {
        client.logEvent("x".repeat(61));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(CustomySendError);
    expect(error).toMatchObject({ code: "SDK_INVALID_EVENT", status: 0 });
    expect(() => client.logEvent("")).toThrow(CustomySendError);
    expect(() => client.logEvent("big", { blob: "x".repeat(2100) })).toThrow(/2048/);
    // Se cuentan bytes UTF-8: 1030 «é» son 2060 B aunque sean 1030 caracteres.
    expect(() => client.logEvent("ñ", { s: "é".repeat(1030) })).toThrow(CustomySendError);
    expect(() => client.logEvent("ñ", { s: "é".repeat(1000) })).not.toThrow();
    expect(() => client.logEvent("arr", [] as never)).toThrow(CustomySendError);
    expect(() => client.logEvent("x".repeat(60), { ok: true })).not.toThrow();
    expect(() => client.submitSurvey({ in_app_id: "iam_1", survey_id: "q", answers: { a: 1 } as never })).toThrow(CustomySendError);
    expect(() => client.submitSurvey({ in_app_id: "", survey_id: "q", answers: "hola" })).toThrow(CustomySendError);
    expect(() => client.submitSurvey({ in_app_id: "iam_1", survey_id: "q", answers: ["a", "b"] })).not.toThrow();
  });
});

// ── Presentador (lo que usa useInAppMessages) ──────────────────────────

describe("createInAppPresenter", () => {
  async function loaded(data: EligibleInAppMessage[]) {
    const { impl } = fakeFetch((call) => (call.path.startsWith("/client/in-app") ? json({ object: "list", data }) : json({ accepted: 1 })));
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null });
    await client.inApp.eligible();
    return client;
  }

  it("espera delay_seconds antes de exponer el mensaje y cancela al cambiar de disparador o dejar de escuchar", async () => {
    const client = await loaded([message("iam_late", { trigger_event: "checkout_viewed", delay_seconds: 5 }), message("iam_home", { trigger_event: "home" })]);
    const presenter = createInAppPresenter(client, { trigger: "checkout_viewed" });
    const seen: Array<string | null> = [];
    const off = presenter.subscribe(() => seen.push(presenter.getMessage()?.id ?? null));
    expect(presenter.getMessage()).toBeNull();
    expect(presenter.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(presenter.getMessage()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(presenter.getMessage()?.id).toBe("iam_late");
    expect(seen).toEqual(["iam_late"]);
    off();

    // Cambiar de disparador durante la espera la cancela.
    const other = await loaded([message("iam_late", { trigger_event: "checkout_viewed", delay_seconds: 5 }), message("iam_home", { trigger_event: "home" })]);
    const second = createInAppPresenter(other, { trigger: "checkout_viewed" });
    const stop = second.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(3_000);
    second.update({ trigger: "home" });
    expect(second.getMessage()?.id).toBe("iam_home");
    second.update({ trigger: "checkout_viewed" });
    expect(second.getMessage()?.id).toBe("iam_home");
    stop();

    // Dejar de escuchar (desmontar) cancela la espera.
    const third = createInAppPresenter(await loaded([message("iam_late", { delay_seconds: 2 })]));
    const bye = third.subscribe(() => undefined);
    expect(third.isPending()).toBe(true);
    bye();
    expect(third.isPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(third.getMessage()).toBeNull();
  });

  it("un objeto de propiedades igual no reinicia la espera; unas propiedades distintas sí", async () => {
    const client = await loaded([message("iam_cart", { trigger_event: "cart", delay_seconds: 10, trigger_filters: [{ property: "total", op: "gte", value: 50 }] })]);
    const presenter = createInAppPresenter(client, { trigger: "cart", properties: { total: 60 } });
    const off = presenter.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(6_000);
    presenter.update({ trigger: "cart", properties: { total: 60 } });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(presenter.getMessage()?.id).toBe("iam_cart");
    presenter.dismiss();
    expect(presenter.getMessage()).toBeNull();

    const small = createInAppPresenter(await loaded([message("iam_cart", { trigger_event: "cart", trigger_filters: [{ property: "total", op: "gte", value: 50 }] })]), { trigger: "cart", properties: { total: 10 } });
    const stop = small.subscribe(() => undefined);
    expect(small.getMessage()).toBeNull();
    small.update({ trigger: "cart", properties: { total: 99 } });
    expect(small.getMessage()?.id).toBe("iam_cart");
    stop();
    off();
  });

  it("sin espera muestra el de mayor prioridad, al cerrarlo sale el siguiente; desactivado no muestra nada", async () => {
    const client = await loaded([message("iam_a", { priority: 5, variant_id: "b" }), message("iam_b", { priority: 1 })]);
    const presenter = createInAppPresenter(client);
    const off = presenter.subscribe(() => undefined);
    expect(presenter.getMessage()?.id).toBe("iam_a");
    presenter.update({ enabled: false });
    expect(presenter.getMessage()).toBeNull();
    presenter.update({});
    expect(presenter.getMessage()?.id).toBe("iam_a");
    presenter.impression();
    presenter.impression();
    presenter.submitSurvey("nps", 10);
    presenter.click("ok");
    expect(presenter.getMessage()?.id).toBe("iam_b");
    off();
    presenter.close();
  });
});

// ── HTML: CSP y puente ─────────────────────────────────────────────────

describe("puente HTML", () => {
  it("HTML_CSP es la del contrato", () => {
    expect(HTML_CSP).toBe("default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'");
  });

  function runBridge(win: Record<string, unknown>) {
    new Function("window", BRIDGE_SCRIPT)(win);
    return win.customy as Record<string, (...args: unknown[]) => void>;
  }

  it("BRIDGE_SCRIPT publica window.customy y manda JSON al marco padre", () => {
    const posted: Array<{ data: string; origin: string }> = [];
    const win: Record<string, unknown> = {};
    win.parent = { postMessage: (data: string, origin: string) => posted.push({ data, origin }) };
    const customy = runBridge(win);
    customy.close!();
    customy.click!("buy", "/checkout");
    customy.click!("later");
    customy.openUrl!("https://example.com/promo");
    customy.requestPushPermission!();
    customy.submitSurvey!("nps", [ "a", "b" ]);
    customy.logEvent!("viewed", { step: 2 });
    customy.logEvent!("bare");
    customy.resize!("320");
    expect(posted.every((p) => p.origin === "*")).toBe(true);
    const messages = posted.map((p) => JSON.parse(p.data));
    expect(messages).toEqual([
      { customy: 1, type: "close" },
      { customy: 1, type: "click", button_id: "buy", url: "/checkout" },
      { customy: 1, type: "click", button_id: "later" },
      { customy: 1, type: "open_url", url: "https://example.com/promo" },
      { customy: 1, type: "request_push_permission" },
      { customy: 1, type: "survey", survey_id: "nps", answers: ["a", "b"] },
      { customy: 1, type: "event", name: "viewed", properties: { step: 2 } },
      { customy: 1, type: "event", name: "bare" },
      { customy: 1, type: "resize", height: 320 },
    ]);
    // Todo lo que manda el puente lo acepta el host.
    expect(posted.map((p) => parseBridgeMessage(p.data))).not.toContain(null);
    // No se puede reemplazar ni se instala dos veces.
    runBridge(win);
    expect(() => {
      (win.customy as Record<string, unknown>).close = () => undefined;
    }).toThrow();
  });

  it("en React Native usa window.ReactNativeWebView.postMessage", () => {
    const rn: string[] = [];
    const parent: string[] = [];
    const win: Record<string, unknown> = { ReactNativeWebView: { postMessage: (data: string) => rn.push(data) }, parent: { postMessage: (data: string) => parent.push(data) } };
    runBridge(win).close!();
    expect(rn).toEqual([JSON.stringify({ customy: 1, type: "close" })]);
    expect(parent).toEqual([]);
  });

  it("parseBridgeMessage acepta los mensajes válidos (texto u objeto) y devuelve solo sus campos", () => {
    expect(parseBridgeMessage('{"customy":1,"type":"close","extra":"x"}')).toEqual({ customy: 1, type: "close" });
    expect(parseBridgeMessage({ customy: 1, type: "click", button_id: "ok", url: "https://a.example/x?y=1" })).toEqual({ customy: 1, type: "click", button_id: "ok", url: "https://a.example/x?y=1" });
    expect(parseBridgeMessage({ customy: 1, type: "click", button_id: "ok", url: null })).toEqual({ customy: 1, type: "click", button_id: "ok" });
    expect(parseBridgeMessage({ customy: 1, type: "open_url", url: "/facturas/42" })).toEqual({ customy: 1, type: "open_url", url: "/facturas/42" });
    expect(parseBridgeMessage({ customy: 1, type: "survey", survey_id: "nps", answers: 10 })).toMatchObject({ answers: 10 });
    expect(parseBridgeMessage({ customy: 1, type: "survey", survey_id: "q", answers: "texto libre" })).toMatchObject({ answers: "texto libre" });
    expect(parseBridgeMessage({ customy: 1, type: "event", name: "x".repeat(60), properties: { a: 1 } })).toMatchObject({ type: "event" });
    expect(parseBridgeMessage({ customy: 1, type: "resize", height: 0 })).toEqual({ customy: 1, type: "resize", height: 0 });
    expect(parseBridgeMessage({ customy: 1, type: "resize", height: 10_000 })).toMatchObject({ height: 10_000 });
    expect(parseBridgeMessage({ customy: 1, type: "request_push_permission" })).toEqual({ customy: 1, type: "request_push_permission" });
  });

  it("parseBridgeMessage rechaza todo lo demás", () => {
    const rejected: unknown[] = [
      "no es json",
      "[]",
      null,
      42,
      { type: "close" },
      { customy: 2, type: "close" },
      { customy: "1", type: "close" },
      { customy: 1, type: "navigate", url: "/x" },
      { customy: 1 },
      { customy: 1, type: "click" },
      { customy: 1, type: "click", button_id: "" },
      { customy: 1, type: "click", button_id: 7 },
      { customy: 1, type: "click", button_id: "ok", url: "javascript:alert(1)" },
      { customy: 1, type: "open_url", url: "http://insecure.example" },
      { customy: 1, type: "open_url", url: "//evil.example/x" },
      { customy: 1, type: "open_url", url: "/\\evil.example" },
      { customy: 1, type: "open_url", url: "https://" },
      { customy: 1, type: "open_url", url: "https://app.example@evil.example/" },
      { customy: 1, type: "open_url", url: "data:text/html,hi" },
      { customy: 1, type: "open_url", url: "https://a.example/ x" },
      { customy: 1, type: "open_url" },
      { customy: 1, type: "survey", survey_id: "q", answers: { a: 1 } },
      { customy: 1, type: "survey", survey_id: "q", answers: [1, 2] },
      { customy: 1, type: "survey", survey_id: "q", answers: Number.POSITIVE_INFINITY },
      { customy: 1, type: "survey", survey_id: "q", answers: "x".repeat(3000) },
      { customy: 1, type: "survey", answers: 1 },
      { customy: 1, type: "event", name: "" },
      { customy: 1, type: "event", name: "x".repeat(61) },
      { customy: 1, type: "event", name: "big", properties: { blob: "x".repeat(2100) } },
      { customy: 1, type: "event", name: "list", properties: [1, 2] },
      { customy: 1, type: "event", name: "str", properties: "a=1" },
      { customy: 1, type: "resize", height: -1 },
      { customy: 1, type: "resize", height: 10_001 },
      { customy: 1, type: "resize", height: Number.NaN },
      { customy: 1, type: "resize", height: "100" },
    ];
    for (const input of rejected) expect(parseBridgeMessage(input), JSON.stringify(input)).toBeNull();
    expect(isSafeBridgeUrl("/ok")).toBe(true);
    expect(isSafeBridgeUrl("HTTPS://A.EXAMPLE")).toBe(true);
  });

  it("buildHtmlDocument inyecta la CSP y el puente al principio de <head> (o crea uno)", () => {
    const inject = `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"><script>${BRIDGE_SCRIPT}</script>`;
    expect(buildHtmlDocument('<!doctype html><html lang="es"><head><title>x</title></head><body>hola</body></html>')).toBe(`<!doctype html><html lang="es"><head>${inject}<title>x</title></head><body>hola</body></html>`);
    expect(buildHtmlDocument('<HEAD data-x="1"><header>h</header>')).toBe(`<HEAD data-x="1">${inject}<header>h</header>`);
    expect(buildHtmlDocument("<!DOCTYPE html><html><body>b</body></html>")).toBe(`<!DOCTYPE html><html><head>${inject}</head><body>b</body></html>`);
    expect(buildHtmlDocument("<!doctype html><p>p</p>")).toBe(`<!doctype html>${inject}<p>p</p>`);
    expect(buildHtmlDocument("<header>solo</header>")).toBe(`${inject}<header>solo</header>`);
  });

  it("§9: márgenes seguros como variables CSS antes del código del autor; html_layouts opcional", () => {
    const doc = buildHtmlDocument("<!doctype html><html><head><style>body{padding-top:var(--customy-safe-top)}</style></head><body>x</body></html>", { safeArea: { top: 47, bottom: 34, left: 0, right: 0 }, viewportHeight: 844 });
    expect(doc).toContain("<style>:root{--customy-safe-top:47px;--customy-safe-bottom:34px;--customy-safe-left:0px;--customy-safe-right:0px;--customy-viewport-height:844px}</style>");
    expect(doc.indexOf("--customy-safe-top:47px")).toBeLessThan(doc.indexOf("padding-top:var"));
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("--customy-safe-top:47px"));
    expect(safeAreaStyle({ safeArea: { top: -3 } })).toBe("<style>:root{--customy-safe-top:0px;--customy-safe-bottom:0px;--customy-safe-left:0px;--customy-safe-right:0px}</style>");
    expect(HTML_LAYOUTS).toEqual(["modal", "fullscreen", "banner", "card", "slideup"]);
    expect(DEFAULT_CAPABILITIES.features).not.toContain(HTML_LAYOUTS_FEATURE);
  });

  it("§9: clampHtmlHeight — banner/slideup ≤ 40 %, card/modal ≤ 80 %, fullscreen lo decide el anfitrión", () => {
    expect(clampHtmlHeight("banner", 900, 800)).toBe(320);
    expect(clampHtmlHeight("slideup", 120, 800)).toBe(120);
    expect(clampHtmlHeight("card", 900, 800)).toBe(640);
    expect(clampHtmlHeight("modal", 300.4, 800)).toBe(300);
    expect(clampHtmlHeight("fullscreen", 300, 800)).toBeNull();
    expect(clampHtmlHeight("card", null, 800)).toBeNull();
  });

  it("BRIDGE_SCRIPT informa solo el alto del contenido (caja de body + márgenes) y lo vuelve a medir", () => {
    const posted: string[] = [];
    let observed: (() => void) | null = null;
    const body = { getBoundingClientRect: () => ({ height: 120.2 }) };
    const win: Record<string, unknown> = {
      parent: { postMessage: (data: string) => posted.push(data) },
      document: { readyState: "complete", body, addEventListener: () => undefined },
      getComputedStyle: () => ({ marginTop: "8px", marginBottom: "8px" }),
      addEventListener: () => undefined,
      ResizeObserver: class { constructor(cb: () => void) { observed = cb; } observe() {} },
    };
    runBridge(win);
    expect(posted.map((d) => JSON.parse(d))).toEqual([{ customy: 1, type: "resize", height: 137 }]);
    observed!();
    expect(posted).toHaveLength(1);
    body.getBoundingClientRect = () => ({ height: 200 });
    observed!();
    expect(JSON.parse(posted[1]!)).toEqual({ customy: 1, type: "resize", height: 216 });
  });
});
