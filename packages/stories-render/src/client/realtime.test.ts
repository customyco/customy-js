import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { backoffDelay, createStoriesRealtime, type ForegroundSource, type WebSocketLike } from "./realtime";

class FakeWs implements WebSocketLike {
  static all: FakeWs[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWs.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

function foreground(): ForegroundSource & { set(active: boolean): void } {
  let active = true;
  const ls = new Set<(a: boolean) => void>();
  return { isActive: () => active, subscribe: (l) => (ls.add(l), () => ls.delete(l)), set: (a) => { active = a; for (const l of ls) l(a); } };
}

const ticketFetch = (status = 200) =>
  vi.fn(async () => (status === 200 ? new Response(JSON.stringify({ url: "wss://rt.test/ws?channels=notify.acc&ticket=t" }), { status: 200 }) : new Response("{}", { status })));

const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

function make(over: Record<string, unknown> = {}) {
  const fg = foreground();
  const fetchFn = (over.fetch as ReturnType<typeof ticketFetch>) ?? ticketFetch();
  const rt = createStoriesRealtime({ enabled: true, baseUrl: "https://send.test", token: async () => "sst", fetch: fetchFn as never, WebSocket: FakeWs as never, foreground: fg, random: () => 1, ...over });
  return { rt, fg, fetchFn };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWs.all = [];
});
afterEach(() => vi.useRealTimers());

describe("tiempo real de Stories (SDK)", () => {
  it("apagado por defecto: no pide ticket ni abre socket", async () => {
    const { rt, fetchFn } = make({ enabled: undefined });
    rt.watch("home", () => undefined);
    await flush(1000);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(FakeWs.all).toHaveLength(0);
  });

  it("señal stories.changed: revalida solo el placement afectado, agrupando stories+banners", async () => {
    const { rt, fetchFn } = make();
    const home = vi.fn();
    const other = vi.fn();
    rt.watch("home", home);
    rt.watch("other", other);
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const ws = FakeWs.all[0]!;
    ws.open();
    ws.emit({ type: "stories.changed", placement_ids: ["home"] });
    ws.emit({ type: "banners.changed", placement_ids: ["home"] });
    ws.emit({ type: "inbox.changed" });
    await flush(200);
    expect(home).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(rt.status).toBe("live");
  });

  it("sin placement_ids o con `all` revalida todo", async () => {
    const { rt } = make();
    const a = vi.fn();
    const b = vi.fn();
    rt.watch("a", a);
    rt.watch("b", b);
    await flush();
    const ws = FakeWs.all[0]!;
    ws.open();
    ws.emit({ type: "widgets.changed", placement_ids: [] });
    await flush(200);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("ignora basura y mensajes de otros tipos", async () => {
    const { rt } = make();
    const a = vi.fn();
    rt.watch("a", a);
    await flush();
    const ws = FakeWs.all[0]!;
    ws.open();
    ws.onmessage?.({ data: "{no json" });
    ws.emit({ type: "pong" });
    await flush(500);
    expect(a).not.toHaveBeenCalled();
  });

  it("caída: sondeo corto de 30 s, reconexión con backoff y revalidación al reconectar", async () => {
    const { rt } = make();
    const a = vi.fn();
    rt.watch("a", a);
    await flush();
    FakeWs.all[0]!.open();
    FakeWs.all[0]!.drop();
    expect(rt.status).toBe("polling");
    await flush(30_400);
    expect(a).toHaveBeenCalled(); // sondeo
    expect(FakeWs.all.length).toBeGreaterThan(1); // reconectó
    const calls = a.mock.calls.length;
    FakeWs.all.at(-1)!.open();
    await flush(200);
    expect(a.mock.calls.length).toBe(calls + 1); // se pone al día tras la caída
    expect(rt.status).toBe("live");
  });

  it("segundo plano: cierra y para; al volver revalida una vez y reconecta", async () => {
    const { rt, fg } = make();
    const a = vi.fn();
    rt.watch("a", a);
    await flush();
    const first = FakeWs.all[0]!;
    first.open();
    fg.set(false);
    expect(rt.status).toBe("off");
    expect(first.readyState).toBe(3);
    await flush(120_000);
    expect(a).not.toHaveBeenCalled();
    expect(FakeWs.all).toHaveLength(1);
    fg.set(true);
    await flush(300);
    expect(a).toHaveBeenCalledTimes(1);
    expect(FakeWs.all).toHaveLength(2);
  });

  it("realtime no configurado (404): degrada a sondeo sin martillear el ticket", async () => {
    const fetchFn = ticketFetch(404);
    const { rt } = make({ fetch: fetchFn });
    const a = vi.fn();
    rt.watch("a", a);
    await flush(100_000);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(1);
    expect(rt.status).toBe("polling");
    expect(a.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("la baja del último observador cierra el socket", async () => {
    const { rt } = make();
    const off = rt.watch("a", () => undefined);
    await flush();
    FakeWs.all[0]!.open();
    off();
    expect(FakeWs.all[0]!.readyState).toBe(3);
    expect(rt.status).toBe("off");
  });

  it("backoff exponencial con jitter, acotado", () => {
    expect(backoffDelay(0, 1000, 60000, () => 1)).toBe(1000);
    expect(backoffDelay(3, 1000, 60000, () => 1)).toBe(8000);
    expect(backoffDelay(10, 1000, 60000, () => 1)).toBe(60000);
    expect(backoffDelay(5, 1000, 60000, () => 0)).toBe(1000);
  });
});
