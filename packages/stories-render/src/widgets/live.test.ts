// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveClient, createLiveController, createLiveCore, type LiveTransport, type LiveTransportHandlers, liveCommerceContext, liveComponentId, liveErrorText, LiveError, mountLive, startsText, type LiveClient, type LiveKitModule, type LiveKitRoomLike, type LiveKitTrackLike, type LiveMarker, type LiveStateSnapshot } from "./live";
import { resolveLiveMessages } from "./live-messages";

const P1 = { connector: "shopify", external_id: "1" };
const marker = (over: Partial<LiveMarker> = {}): LiveMarker => ({ session_id: "lv_abc123", state: "live", title: "Lanzamiento", scheduled_at: "2026-10-10T15:00:00Z", started_at: "2026-10-10T15:01:00Z", ends_by: "2026-10-10T17:01:00Z", chat_mode: "off", reactions: false, featured: [], notice: null, replay: null, transports: ["webrtc"], ...over });
const snap = (over: Partial<LiveStateSnapshot> = {}): LiveStateSnapshot => ({ session_id: "lv_abc123", state: "live", featured: [], chat: { mode: "off", messages: [], next_cursor: null }, reactions: {}, audience_hint: null, ...over });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const m = resolveLiveMessages("es");

// ── Un LiveKit simulado: ni red ni WebRTC ──
class FakeTrack implements LiveKitTrackLike {
  attached: HTMLMediaElement[] = [];
  constructor(readonly kind: string) {}
  attach() { const e = document.createElement(this.kind === "video" ? "video" : "audio"); this.attached.push(e); return e; }
  detach() { this.attached = []; }
}
class FakeRoom implements LiveKitRoomLike {
  static last: FakeRoom | null = null;
  handlers = new Map<string, (...a: never[]) => void>();
  connected = false;
  disconnects = 0;
  subscribed: boolean[] = [];
  remoteParticipants = new Map([["host", { trackPublications: new Map([["t", { setSubscribed: (s: boolean) => { this.subscribed.push(s); } }]]) }]]);
  static failConnect = 0;
  constructor() { FakeRoom.last = this; }
  async connect() { if (FakeRoom.failConnect > 0) { FakeRoom.failConnect--; throw new Error("ice failed"); } this.connected = true; }
  disconnect() { this.connected = false; this.disconnects++; }
  on(event: string, handler: (...a: never[]) => void) { this.handlers.set(event, handler); }
  emit(event: string, ...args: unknown[]) { (this.handlers.get(event) as (...a: unknown[]) => void)?.(...args); }
}
const fakeModule = (): LiveKitModule => ({ Room: FakeRoom as never, RoomEvent: { TrackSubscribed: "trackSubscribed", TrackUnsubscribed: "trackUnsubscribed", Disconnected: "disconnected", Reconnecting: "reconnecting", Reconnected: "reconnected", TranscriptionReceived: "transcriptionReceived" } });

function fakeClock() {
  let now = Date.parse("2026-10-10T15:05:00Z");
  const tasks: Array<{ at: number; fn: () => void; id: number }> = [];
  let seq = 0;
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = ++seq; tasks.push({ at: now + ms, fn, id }); return id; },
    clearTimeout: (h: unknown) => { const i = tasks.findIndex((t) => t.id === h); if (i >= 0) tasks.splice(i, 1); },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        tasks.sort((a, b) => a.at - b.at);
        const next = tasks[0];
        if (!next || next.at > end) break;
        tasks.shift();
        now = next.at;
        next.fn();
        await flush();
      }
      now = end;
    },
  };
}

function fakeClient(over: Partial<Record<keyof LiveClient, unknown>> = {}) {
  const calls: string[] = [];
  const base = {
    join: vi.fn(async () => ({ url: "wss://livekit.staging.customy.ai", token: "tok", expires_in: 300, identity: "v_x", hls_url: null })),
    state: vi.fn(async () => snap()),
    heartbeat: vi.fn(async () => ({ counted: true })),
    events: vi.fn(async () => ({ accepted: 1 })),
    sendChat: vi.fn(async () => ({ id: "lc_1", status: "approved" as const })),
    deleteChat: vi.fn(async () => ({ id: "lc_1" })),
    reportChat: vi.fn(async () => ({ counted: true })),
    blockChat: vi.fn(async () => ({ already_blocked: false })),
    react: vi.fn(async () => ({ ok: true })),
  };
  const client = { ...base, ...over } as typeof base;
  return Object.assign(client, { calls });
}

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
  document.body.innerHTML = ""; FakeRoom.last = null; FakeRoom.failConnect = 0;
});

describe("the HTTP client", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  it("sends the subscriber token, retries once on 401 with a fresh one, and maps the server's codes", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${url} ${(init.headers as Record<string, string>).authorization}`);
      return seen.length === 1 ? res(401, {}) : res(200, { url: "wss://x", token: "t", expires_in: 300, identity: "v_1", hls_url: null });
    });
    const tokens: boolean[] = [];
    const c = createLiveClient({ baseUrl: "https://send.example.com/", token: async (f) => { tokens.push(Boolean(f)); return f ? "fresh" : "old"; }, fetch: fetchMock as never });
    await c.join("lv_1", { noticeVersion: "v1" });
    expect(tokens).toEqual([false, true]);
    expect(seen[1]).toBe("POST https://send.example.com/client/live/lv_1/join Bearer fresh");
    const refused = createLiveClient({ token: async () => "t", fetch: (async () => res(409, { name: "notice_required", message: "x", required_notice_version: "v2" })) as never });
    await expect(refused.join("lv_1")).rejects.toMatchObject({ code: "notice_required", requiredNoticeVersion: "v2" });
    const full = createLiveClient({ token: async () => "t", fetch: (async () => res(429, { name: "live_full", message: "x" })) as never });
    await expect(full.join("lv_1")).rejects.toMatchObject({ code: "live_full", status: 429 });
    const down = createLiveClient({ token: async () => "t", fetch: (async () => { throw new Error("offline"); }) as never });
    await expect(down.state("lv_1")).rejects.toMatchObject({ code: "network" });
  });
  it("never sends a LiveKit credential: the only secret in a request is the subscriber token", async () => {
    let body = "";
    const c = createLiveClient({ token: async () => "sub", fetch: (async (_u: string, init: RequestInit) => { body = String(init.body ?? ""); return res(200, {}); }) as never });
    await c.sendChat("lv_1", "hola");
    expect(body).toBe('{"text":"hola"}');
  });
});

describe("the controller", () => {
  const setup = (over: Partial<Parameters<typeof createLiveController>[0]> = {}, client = fakeClient()) => {
    const clock = fakeClock();
    const states: string[] = [];
    const stage = document.createElement("div");
    const ended: string[] = [];
    const c = createLiveController({ live: marker(), groupId: "g1", client, loadLiveKit: async () => fakeModule(), clock, stage, isHidden: () => false, onState: (s) => states.push(s), onEnded: (s) => ended.push(s), pollMs: 5000, heartbeatMs: 15_000, ...over });
    return { c, clock, states, stage, client, ended };
  };

  it("joins with a server token, loads LiveKit only then, attaches the host's tracks and plays", async () => {
    const load = vi.fn(async () => fakeModule());
    const { c, states, stage, client } = setup({ loadLiveKit: load });
    expect(load).not.toHaveBeenCalled();
    await c.join();
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.join).toHaveBeenCalledWith("lv_abc123", {});
    expect(states).toEqual(["connecting", "waiting_host"]);
    FakeRoom.last!.emit("trackSubscribed", new FakeTrack("video"));
    FakeRoom.last!.emit("trackSubscribed", new FakeTrack("audio"));
    expect(stage.querySelectorAll("video,audio")).toHaveLength(2);
    expect(c.state).toBe("playing");
  });
  it("the notice gate: no token without the person accepting the current notice", async () => {
    const live = marker({ notice: { version: "v1", url: "https://x.example.com/aviso" } });
    const { c, client } = setup({ live });
    await c.join();
    expect(c.state).toBe("needs_notice");
    expect(client.join).not.toHaveBeenCalled();
    c.acceptNotice();
    await c.join();
    expect(client.join).toHaveBeenCalledWith("lv_abc123", { noticeVersion: "v1", acceptedAt: "2026-10-10T15:05:00.000Z" });
    expect(c.state).toBe("waiting_host");
  });
  it("a notice the server says changed sends the person back to the gate", async () => {
    const client = fakeClient({ join: vi.fn(async () => { throw new LiveError("notice_required", "x", { status: 409, requiredNoticeVersion: "v2" }); }) });
    const { c } = setup({}, client);
    await c.join();
    expect(c.state).toBe("needs_notice");
  });
  it("pause is visible and stops the media and the subscription; resume restores them", async () => {
    const { c, states } = setup();
    await c.join();
    FakeRoom.last!.emit("trackSubscribed", new FakeTrack("video"));
    c.pause();
    expect(c.state).toBe("paused");
    expect(c.paused).toBe(true);
    expect(FakeRoom.last!.subscribed).toEqual([false]);
    c.resume();
    expect(c.state).toBe("playing");
    expect(FakeRoom.last!.subscribed).toEqual([false, true]);
    expect(states).toContain("paused");
  });
  it("sends a heartbeat of playing seconds while playing and visible, and none while paused or hidden", async () => {
    let hiddenNow = false;
    const { c, clock, client } = setup({ isHidden: () => hiddenNow });
    await c.join();
    FakeRoom.last!.emit("trackSubscribed", new FakeTrack("video"));
    await clock.advance(15_000);
    expect(client.heartbeat).toHaveBeenCalledWith("lv_abc123", 15, "playing");
    hiddenNow = true;
    client.heartbeat.mockClear();
    await clock.advance(15_000);
    expect(client.heartbeat).not.toHaveBeenCalled();
    hiddenNow = false;
    c.pause();
    client.heartbeat.mockClear();
    await clock.advance(30_000);
    expect(client.heartbeat).not.toHaveBeenCalledWith("lv_abc123", expect.any(Number), "playing");
  });
  it("polls the state: featured, chat (deduplicated) and the cursor", async () => {
    const client = fakeClient({ state: vi.fn(async () => snap({ chat: { mode: "filtered", messages: [{ id: "a", text: "hola", label: "Anónimo A1B", at: "", mine: false }], next_cursor: "7" } })) });
    const { c, clock } = setup({}, client);
    await c.join();
    await clock.advance(6000);
    await clock.advance(5000);
    expect(c.messages).toHaveLength(1);
    expect(client.state).toHaveBeenLastCalledWith("lv_abc123", "7");
  });
  it("when the server says the live is over it leaves the room and degrades (ended, or replay)", async () => {
    const client = fakeClient({ state: vi.fn(async () => snap({ state: "ended" })) });
    const a = setup({}, client);
    await a.c.join();
    const room = FakeRoom.last!;
    await a.clock.advance(1000);
    expect(a.c.state).toBe("ended");
    expect(a.ended).toEqual(["ended"]);
    expect(room.disconnects).toBe(1);
    const b = setup({}, fakeClient({ state: vi.fn(async () => snap({ state: "replay" })) }));
    await b.c.join();
    await b.clock.advance(1000);
    expect(b.c.state).toBe("replay");
    expect(b.ended).toEqual(["replay"]);
  });
  it("reconnects with a fresh token after a drop, with backoff, and gives up after the limit", async () => {
    const a = setup();
    await a.c.join();
    const first = FakeRoom.last!;
    first.emit("disconnected");
    expect(a.c.state).toBe("reconnecting");
    await a.clock.advance(1000);
    await flush();
    expect(a.client.join).toHaveBeenCalledTimes(2);
    expect(FakeRoom.last).not.toBe(first);
    expect(a.c.state).toBe("waiting_host");
    const b = setup({ maxReconnects: 2 });
    await b.c.join();
    FakeRoom.failConnect = 99;
    FakeRoom.last!.emit("disconnected");
    await b.clock.advance(1000);
    await b.clock.advance(2000);
    await b.clock.advance(4000);
    expect(b.c.state).toBe("error");
  });
  it("a drop while the server says it is no longer live degrades instead of retrying forever", async () => {
    const client = fakeClient();
    const { c, clock, ended } = setup({}, client);
    await c.join();
    client.join.mockRejectedValueOnce(new LiveError("live_not_live", "x", { status: 409 }));
    FakeRoom.last!.emit("disconnected");
    await clock.advance(1000);
    expect(c.state).toBe("ended");
    expect(ended).toEqual(["ended"]);
  });
  it("says why it can't enter: full, kill switch, minors", async () => {
    for (const [code, state] of [["live_full", "full"], ["live_kill_switch", "unavailable"], ["live_minors", "unavailable"]] as const) {
      const { c } = setup({}, fakeClient({ join: vi.fn(async () => { throw new LiveError(code, "x", { status: 409 }); }) }));
      await c.join();
      expect(c.state).toBe(state);
    }
  });
  it("shows nothing but a replay for a replay marker, and never connects to a scheduled one", async () => {
    const load = vi.fn(async () => fakeModule());
    const a = setup({ live: marker({ state: "scheduled" }), loadLiveKit: load });
    await a.c.join();
    expect(load).not.toHaveBeenCalled();
    const b = setup({ live: marker({ state: "replay", replay: { url: "https://x.example.com/v.mp4", poster: "https://x.example.com/p.jpg" } }), loadLiveKit: load });
    await b.c.join();
    expect(b.c.state).toBe("replay");
    expect(load).not.toHaveBeenCalled();
  });
  it("commerce events reach the app with the cart context and go to Send once per id", async () => {
    const seen: unknown[] = [];
    const { c, clock, client } = setup({ onProduct: (e) => seen.push(e) });
    await c.join();
    c.product("add_to_cart", P1, 1);
    c.product("wishlist_added", P1);
    expect(seen[0]).toMatchObject({ name: "add_to_cart", quantity: 1, context: { storyId: "g1", componentId: liveComponentId("lv_abc123") } });
    await clock.advance(400);
    const batch = (client.events.mock.calls[0] as unknown as [string, Array<{ event_id: string }>])[1];
    expect(batch).toHaveLength(2);
    expect(new Set(batch.map((e) => e.event_id)).size).toBe(2);
    expect(liveCommerceContext("g1", "lv_abc123")).toEqual({ storyId: "g1", componentId: "live-lv_abc123" });
  });
  it("chat: local rate warning, empty refused, delete and block drop the message locally", async () => {
    const client = fakeClient({ state: vi.fn(async () => snap({ chat: { mode: "filtered", messages: [{ id: "a", text: "hola", label: "x", at: "", mine: false }, { id: "b", text: "yo", label: "x", at: "", mine: true }], next_cursor: "2" } })) });
    const { c, clock } = setup({}, client);
    await c.join();
    await clock.advance(1000);
    expect(c.messages).toHaveLength(2);
    await c.block("a");
    await c.deleteMine("b");
    expect(c.messages).toHaveLength(0);
    for (let i = 0; i < 6; i++) await c.send(`m${i}`);
    await expect(c.send("otro")).rejects.toMatchObject({ code: "chat_rate_limited" });
    await expect(c.send("   ")).rejects.toMatchObject({ code: "invalid" });
  });
  it("reactions are throttled locally", async () => {
    const { c, clock } = setup();
    await c.join();
    expect(await c.react("heart")).toBe(true);
    expect(await c.react("heart")).toBe(false);
    await clock.advance(500);
    expect(await c.react("fire")).toBe(true);
  });
  it("leave closes the room and frees the tracks", async () => {
    const { c, stage } = setup();
    await c.join();
    FakeRoom.last!.emit("trackSubscribed", new FakeTrack("video"));
    await c.leave();
    expect(stage.querySelectorAll("video")).toHaveLength(0);
    expect(FakeRoom.last!.disconnects).toBe(1);
    expect(c.state).toBe("idle");
  });
  it("forwards captions from the room's transcription", async () => {
    const captions: string[] = [];
    const { c } = setup({ onCaption: (t) => captions.push(t) });
    await c.join();
    FakeRoom.last!.emit("transcriptionReceived", [{ text: "hola a todos", final: true }, { text: "borrador", final: false }]);
    expect(captions).toEqual(["hola a todos"]);
  });
});

describe("the core over an injected transport (what the native SDKs reuse)", () => {
  it("drives any transport: attach, kill from the poll, kill() and transport close", async () => {
    const clock = fakeClock();
    let handlers!: LiveTransportHandlers;
    const log: string[] = [];
    const transport: LiveTransport = { connect: async (j, h) => { handlers = h; log.push(`connect ${j.url}`); }, setPlaying: (on) => { log.push(`playing ${on}`); }, close: () => { log.push("close"); } };
    const states: string[] = [];
    const client = fakeClient();
    const c = createLiveCore({ live: marker(), groupId: "g1", client, openTransport: () => transport, clock, isHidden: () => false, onState: (s) => states.push(s) });
    await c.join();
    expect(states).toEqual(["connecting", "waiting_host"]);
    handlers.onAttached(true);
    expect(c.state).toBe("playing");
    c.pause();
    expect(log).toContain("playing false");
    // El servidor apaga el live por el interruptor de la cuenta: se suelta la sala y no se ofrece reintentar.
    client.state.mockRejectedValueOnce(new LiveError("live_kill_switch", "kill"));
    await clock.advance(6000);
    expect(c.state).toBe("unavailable");
    expect(log).toContain("close");
  });
  it("kill() releases the transport and leaves the live unavailable", async () => {
    const clock = fakeClock();
    let closed = 0;
    const c = createLiveCore({ live: marker(), groupId: "g1", client: fakeClient(), openTransport: () => ({ connect: async () => undefined, setPlaying: () => undefined, close: () => { closed++; } }), clock, isHidden: () => false });
    await c.join();
    await c.kill();
    expect(c.state).toBe("unavailable");
    expect(closed).toBe(1);
  });
});

describe("helpers", () => {
  it("countdown text", () => {
    const at = "2026-10-10T15:30:00Z";
    expect(startsText(at, Date.parse("2026-10-10T15:20:00Z"), m, "es")).toBe("Empieza en 10 min");
    expect(startsText(at, Date.parse("2026-10-10T15:31:00Z"), m, "es")).toBe("Empieza en un momento");
    expect(startsText(at, Date.parse("2026-10-09T10:00:00Z"), m, "es")).toMatch(/^Empieza el /);
    expect(startsText("nope", 0, m)).toBe("");
  });
  it("error texts are human and never leak the server's wording", () => {
    expect(liveErrorText(new LiveError("rejected_by_filter", "contains_link"), m)).toBe(m.chatRefused);
    expect(liveErrorText(new LiveError("live_full", "x"), m)).toBe(m.full);
    expect(liveErrorText(new Error("boom"), m)).toBe(m.errGeneric);
  });
  it("messages fall back to English and have no missing keys in es/pt", () => {
    const keys = Object.keys(resolveLiveMessages("en")).sort();
    expect(Object.keys(resolveLiveMessages("es")).sort()).toEqual(keys);
    expect(Object.keys(resolveLiveMessages("pt-BR")).sort()).toEqual(keys);
    expect(resolveLiveMessages("fr").liveBadge).toBe("LIVE");
  });
});

describe("the DOM", () => {
  const mount = (live: LiveMarker, over: Record<string, unknown> = {}, client = fakeClient()) => {
    const host = document.createElement("div");
    document.body.append(host);
    const out = mountLive(host, { live, groupId: "g1", client, loadLiveKit: async () => fakeModule(), locale: "es", reducedMotion: true, pollMs: 5000, ...over });
    return { host, client, ...out };
  };
  it("remote replay and notice URLs: only https without credentials reach the DOM", () => {
    const bad = mount(marker({ state: "replay", replay: { url: "javascript:alert(1)", poster: "https://u:p@evil.example/p.jpg", captions_url: "data:text/vtt,x" }, notice: { version: "v1", url: "javascript:alert(1)" } }));
    const v = bad.host.querySelector("video")!;
    expect(v.getAttribute("src")).toBeNull();
    expect(v.getAttribute("poster")).toBeNull();
    expect(bad.host.querySelector("track")).toBeNull();
    expect(bad.host.querySelector("a[href^='javascript']")).toBeNull();
    const ok = mount(marker({ state: "replay", replay: { url: "https://cdn.example.com/v.mp4", poster: "https://cdn.example.com/p.jpg", captions_url: "https://cdn.example.com/c.vtt" } }));
    expect(ok.host.querySelector("video")!.getAttribute("src")).toBe("https://cdn.example.com/v.mp4");
    expect(ok.host.querySelector("track")!.getAttribute("src")).toBe("https://cdn.example.com/c.vtt");
  });
  it("is a labelled region with a badge, a status area and a watch button that is a real button", () => {
    const { host } = mount(marker());
    const region = host.querySelector("section.cs-live")!;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Transmisión en vivo: Lanzamiento");
    expect(host.querySelector(".cs-live__badge")!.textContent).toBe("EN VIVO");
    expect(host.querySelector("[role=status]")!.getAttribute("aria-live")).toBe("polite");
    const watch = host.querySelector<HTMLButtonElement>(".cs-live__watch")!;
    expect(watch.tagName).toBe("BUTTON");
    expect(watch.getAttribute("aria-label")).toBe("Ver en vivo");
  });
  it("with a notice, 'watch' stays disabled until the box is checked, and the link opens safely", async () => {
    const { host, client } = mount(marker({ notice: { version: "v1", url: "https://x.example.com/aviso" } }));
    const watch = host.querySelector<HTMLButtonElement>(".cs-live__watch")!;
    expect(watch.disabled).toBe(true);
    const link = host.querySelector("a.cs-live__link")!;
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const box = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    expect(host.querySelector("label")!.getAttribute("for")).toBe(box.id);
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(watch.disabled).toBe(false);
    watch.click();
    await flush();
    expect(client.join).toHaveBeenCalledWith("lv_abc123", expect.objectContaining({ noticeVersion: "v1" }));
  });
  it("once connected: pause toggles with aria-pressed and the visible state; the status says what is happening", async () => {
    const { host } = mount(marker());
    host.querySelector<HTMLButtonElement>(".cs-live__watch")!.click();
    await flush();
    await flush();
    const status = host.querySelector(".cs-live__status")!;
    expect(status.textContent).toBe(m.waitingHost);
    FakeRoom.last!.emit("trackSubscribed", new FakeTrack("video"));
    const pause = host.querySelector<HTMLButtonElement>(".cs-live__pause")!;
    expect(pause.hidden).toBe(false);
    pause.click();
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    expect(pause.getAttribute("aria-label")).toBe("Reanudar");
    expect(status.textContent).toBe("En pausa");
    expect(host.querySelector("[data-paused]")).not.toBeNull();
    pause.click();
    expect(pause.getAttribute("aria-pressed")).toBe("false");
  });
  it("reconnecting is announced; ending degrades the UI and asks the app to refetch the placement", async () => {
    const refetch = vi.fn();
    const client = fakeClient({ state: vi.fn(async () => snap({ state: "replay" })) });
    const { host } = mount(marker(), { onRefetch: refetch, pollMs: 100 }, client);
    host.querySelector<HTMLButtonElement>(".cs-live__watch")!.click();
    await flush();
    await flush();
    FakeRoom.last!.emit("reconnecting");
    expect(host.querySelector(".cs-live__status")!.textContent).toBe(m.reconnecting);
    await new Promise((r) => setTimeout(r, 1000));
    expect(refetch).toHaveBeenCalled();
    expect(host.querySelector(".cs-live__status")!.textContent).toBe(m.endedReplay);
    expect(host.querySelector<HTMLElement>(".cs-live__products")!.hidden).toBe(true);
  });
  it("shows featured products as named buttons that fire commerce events with the context", async () => {
    const seen: Array<{ name: string; context: unknown }> = [];
    const client = fakeClient({ state: vi.fn(async () => snap({ featured: [P1], audience_hint: 40 })) });
    const { host } = mount(marker(), { productInfo: () => ({ title: "Zapato", price: "$ 120.000" }), onProduct: (e: { name: string; context: unknown }) => seen.push(e), pollMs: 100 }, client);
    host.querySelector<HTMLButtonElement>(".cs-live__watch")!.click();
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 1000));
    const rail = host.querySelector<HTMLElement>(".cs-live__products")!;
    expect(rail.hidden).toBe(false);
    expect(rail.getAttribute("aria-label")).toBe("Productos destacados");
    const add = Array.from(rail.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Agregar al carrito: Zapato")!;
    add.click();
    expect(seen.find((e) => e.name === "add_to_cart")).toMatchObject({ context: { storyId: "g1", componentId: "live-lv_abc123" } });
    expect(host.querySelector(".cs-live__audience")!.textContent).toBe("Unas 40 personas viendo");
  });
  it("chat: a log region, only with a server chat mode; text goes in as text, never HTML; report and block are reachable", async () => {
    const client = fakeClient({ state: vi.fn(async () => snap({ chat: { mode: "filtered", messages: [{ id: "a", text: "<img src=x onerror=alert(1)>", label: "Anónimo A1B", at: "", mine: false }], next_cursor: "1" } })) });
    const { host } = mount(marker({ chat_mode: "filtered", notice: null }), { pollMs: 100 }, client);
    host.querySelector<HTMLButtonElement>(".cs-live__watch")!.click();
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 1000));
    const log = host.querySelector("[role=log]")!;
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.querySelector("img")).toBeNull();
    expect(log.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(log.querySelector("summary")!.getAttribute("aria-label")).toBe("Opciones del mensaje");
    const buttons = Array.from(log.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(expect.arrayContaining(["Enviar reporte", "No ver más a esta persona"]));
    const input = host.querySelector<HTMLInputElement>(".cs-live__input")!;
    expect(input.maxLength).toBe(200);
    input.value = "hola";
    host.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(client.sendChat).toHaveBeenCalledWith("lv_abc123", "hola");
  });
  it("chat off: no chat, no reactions panel", () => {
    const { host } = mount(marker());
    expect(host.querySelector<HTMLElement>(".cs-live__chat")!.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>(".cs-live__reactions")!.hidden).toBe(true);
  });
  it("a scheduled live shows the countdown and connects to nothing", () => {
    const load = vi.fn(async () => fakeModule());
    const { host } = mount(marker({ state: "scheduled", scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString() }), { loadLiveKit: load });
    expect(host.querySelector(".cs-live__badge")!.textContent).toBe("PRONTO");
    expect(host.querySelector(".cs-live__when")!.textContent).toMatch(/^Empieza en \d+ min$/);
    expect(host.querySelector(".cs-live__watch")).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it("a replay is a normal video with controls, a poster and captions when there are", () => {
    const { host } = mount(marker({ state: "replay", replay: { url: "https://x.example.com/v.mp4", poster: "https://x.example.com/p.jpg", captions_url: "https://x.example.com/c.vtt" }, notice: { version: "v1", url: "https://x.example.com/a" } }));
    const video = host.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("poster")).toBe("https://x.example.com/p.jpg");
    expect(video.querySelector("track")!.getAttribute("kind")).toBe("captions");
    expect(host.querySelector(".cs-live__badge")!.textContent).toBe("REPETICIÓN");
  });
  it("respects reduced motion: no floating reaction; and RTL sets the direction", async () => {
    const client = fakeClient({ state: vi.fn(async () => snap({ chat: { mode: "reactions", messages: [], next_cursor: null } })) });
    const a = mount(marker({ reactions: true }), { reducedMotion: true, pollMs: 100 }, client);
    a.host.querySelector<HTMLButtonElement>(".cs-live__watch")!.click();
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 400));
    const heart = a.host.querySelector<HTMLButtonElement>("button.cs-live__react")!;
    expect(heart.getAttribute("aria-label")).toBe("Me encanta");
    heart.click();
    await flush();
    expect(a.host.querySelector(".cs-live__float")).toBeNull();
    expect(a.host.querySelector("section")!.getAttribute("data-reduced-motion")).toBe("true");
    const b = mount(marker(), { locale: "ar" });
    expect(b.host.querySelector("section")!.getAttribute("dir")).toBe("rtl");
  });
  it("destroy removes the DOM and closes the room", async () => {
    const { host, destroy } = mount(marker());
    host.querySelector<HTMLButtonElement>(".cs-live__watch")!.click();
    await flush();
    await flush();
    const room = FakeRoom.last!;
    await destroy();
    expect(host.querySelector("section")).toBeNull();
    expect(room.disconnects).toBe(1);
  });
});
