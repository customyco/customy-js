import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EligibleInAppMessage } from "../engage-types";
import {
  BRIDGE_SCRIPT,
  buildHtmlDocument,
  createInAppPresenter,
  createInboxClient,
  CustomySendError,
  DEFAULT_CAPABILITIES,
  HTML_CSP,
  matchesFilters,
  parseBridgeMessage,
} from "./index";

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

const message = (id: string, patch: Partial<EligibleInAppMessage> = {}): EligibleInAppMessage => ({ id, layout: "modal", trigger_event: "session_start", priority: 0, frequency: "once", ends_at: null, content: { title: id, buttons: [], style: {} }, ...patch });
const config = (kill: Record<string, boolean> = {}) => ({ object: "client_config", poll_seconds: 300, features: {}, min_sdk: null, kill: { in_app: false, content_cards: false, html: false, ...kill }, api_version: "2026-09-27" });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("@customyai/send-sdk/inbox · in-app v2", () => {
  it("con capabilities manda Customy-Client con sdk send-sdk/<versión>; sin ellas, nada", async () => {
    const withCaps = fakeFetch((call) => (call.path === "/client/config" ? json(config()) : json({ object: "list", data: [] })));
    const client = createInboxClient({ token: async () => "sst_x", fetch: withCaps.impl, WebSocket: null, platform: "web", capabilities: { ...DEFAULT_CAPABILITIES, app_version: "3.1.0" } });
    await client.contentCards();
    const header = JSON.parse(withCaps.calls.find((c) => c.path.startsWith("/client/content-cards"))!.headers["customy-client"]!);
    expect(header).toMatchObject({ sdk: "send-sdk/1.4.0", app_version: "3.1.0", platform: "web", features: DEFAULT_CAPABILITIES.features });
    expect(withCaps.calls.find((c) => c.path.startsWith("/client/content-cards"))!.path).toBe("/client/content-cards?platform=web&app_version=3.1.0");

    const bare = fakeFetch(() => json({ object: "list", data: [] }));
    const legacy = createInboxClient({ token: async () => "sst_x", fetch: bare.impl, WebSocket: null });
    await legacy.inApp.eligible();
    expect(bare.calls[0]!.headers["customy-client"]).toBeUndefined();
    expect(bare.calls).toHaveLength(1);
  });

  it("inAppMessages con trigger_filters, interruptores kill y recibos v2", async () => {
    let current = config();
    const { impl, calls } = fakeFetch((call) => {
      if (call.path === "/client/config") return json(current);
      if (call.path.startsWith("/client/in-app")) return json({ object: "list", data: [message("iam_1", { trigger_event: "cart", priority: 2, variant_id: "b", trigger_filters: [{ property: "total", op: "gte", value: 50 }] }), message("iam_html", { layout: "html", trigger_event: "cart" })] });
      return json({ accepted: 1 });
    });
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null });
    expect((await client.inAppMessages({ trigger: "cart", properties: { total: 10 } })).map((m) => m.id)).toEqual(["iam_html"]);
    expect((await client.inAppMessages({ trigger: "cart", properties: { total: 90 } })).map((m) => m.id)).toEqual(["iam_1", "iam_html"]);
    current = config({ html: true });
    await client.config();
    expect(client.getState().inApp.messages.map((m) => m.id)).toEqual(["iam_1"]);
    expect(client.getState().config?.kill.html).toBe(true);

    client.track.inApp({ id: "iam_1", type: "impression", rendered_as: "modal" });
    client.track.card({ id: "cc_1", type: "click" });
    client.submitSurvey({ in_app_id: "iam_1", survey_id: "nps", answers: ["a"] });
    client.logEvent("cart_viewed", { total: 90 });
    client.track({ type: "opened", notification_id: "ntf_1" });
    await client.flush();
    const events = calls.filter((c) => c.path === "/client/events").flatMap((c) => c.body.events).map(({ id, occurred_at, ...rest }: any) => rest);
    expect(events).toEqual([
      { type: "in_app_impression", in_app_id: "iam_1", channel: "in_app", variant_id: "b", rendered_as: "modal" },
      { type: "card_click", card_id: "cc_1" },
      { type: "survey_response", in_app_id: "iam_1", survey_id: "nps", answers: ["a"], variant_id: "b" },
      { type: "custom", name: "cart_viewed", properties: { total: 90 } },
      { type: "opened", notification_id: "ntf_1" },
    ]);
  });

  it("logEvent fuera de límites lanza el CustomySendError de 1.x", () => {
    const client = createInboxClient({ token: async () => "sst_x", fetch: fakeFetch(() => json({})).impl, WebSocket: null });
    let error: unknown;
    try {
      client.logEvent("x".repeat(61));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CustomySendError);
    expect(error).toMatchObject({ code: "SDK_INVALID_EVENT", status: 0 });
    expect(() => client.logEvent("big", { b: "x".repeat(2100) })).toThrow(CustomySendError);
  });

  it("el presentador funciona con el cliente del adaptador (delay_seconds)", async () => {
    const { impl } = fakeFetch(() => json({ object: "list", data: [message("iam_late", { delay_seconds: 3 })] }));
    const client = createInboxClient({ token: async () => "sst_x", fetch: impl, WebSocket: null });
    await client.inApp.eligible();
    const presenter = createInAppPresenter(client);
    const off = presenter.subscribe(() => undefined);
    expect(presenter.getMessage()).toBeNull();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(presenter.getMessage()?.id).toBe("iam_late");
    off();
  });

  it("reexporta el puente y los filtros de @customyai/send/inbox", () => {
    expect(HTML_CSP).toContain("default-src 'none'");
    expect(buildHtmlDocument("<head></head>")).toContain(BRIDGE_SCRIPT);
    expect(parseBridgeMessage('{"customy":1,"type":"resize","height":120}')).toEqual({ customy: 1, type: "resize", height: 120 });
    expect(parseBridgeMessage({ customy: 1, type: "open_url", url: "javascript:x" })).toBeNull();
    expect(matchesFilters([{ property: "v", op: "gte", value: "1.2.0" }], { v: "1.10.0" })).toBe(true);
  });
});
