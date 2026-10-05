import { describe, expect, it, vi } from "vitest";
import { createBridge, detectTransport } from "../src/bridge";
import { HOST_SOURCE } from "../src/protocol";

type Listener = (e: unknown) => void;
function fakeWin(extra: Record<string, unknown> = {}) {
  const listeners = new Set<Listener>();
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_t: string, l: Listener) => void listeners.add(l),
    removeEventListener: (_t: string, l: Listener) => void listeners.delete(l),
    ...extra,
  };
  return { win: win as unknown as Window & typeof globalThis, parent, listeners, fire: (e: unknown) => listeners.forEach((l) => l(e)) };
}

describe("detección del canal", () => {
  it("elige iOS, Android, React Native y Flutter por su objeto inyectado", () => {
    const ios = vi.fn();
    expect(detectTransport(fakeWin({ webkit: { messageHandlers: { customyStories: { postMessage: ios } } } }).win)?.name).toBe("ios");
    expect(detectTransport(fakeWin({ CustomyStoriesAndroid: { postMessage: vi.fn() } }).win)?.name).toBe("android");
    expect(detectTransport(fakeWin({ ReactNativeWebView: { postMessage: vi.fn() } }).win)?.name).toBe("rn");
    expect(detectTransport(fakeWin({ CustomyStoriesFlutter: { postMessage: vi.fn() } }).win)?.name).toBe("flutter");
  });

  it("sin canal no hay puente; el canal parent exige un origen declarado", () => {
    expect(detectTransport(fakeWin().win)).toBeNull();
    expect(detectTransport(fakeWin().win, "https://app.example.com")?.name).toBe("parent");
  });

  it("las llamadas viajan como TEXTO JSON (Android solo admite cadenas)", () => {
    const post = vi.fn();
    const w = fakeWin({ CustomyStoriesAndroid: { postMessage: post } });
    const b = createBridge({ win: w.win, policy: () => ({}), onCommand: vi.fn() });
    expect(b.send({ type: "close", reason: "user" })).toBe(true);
    expect(typeof post.mock.calls[0]![0]).toBe("string");
  });
});

describe("envío validado", () => {
  it("no envía un open_url con esquema peligroso y avisa localmente", () => {
    const post = vi.fn();
    const onReject = vi.fn();
    const b = createBridge({ win: fakeWin().win, custom: post, policy: () => ({}), onCommand: vi.fn(), onReject });
    expect(b.send({ type: "open_url", url: "javascript:alert(1)", kind: "url" })).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith("out", expect.stringContaining("no permitida"));
  });

  it("envía el deep link propio solo si la política lo declara", () => {
    const post = vi.fn();
    let schemes: string[] = [];
    const b = createBridge({ win: fakeWin().win, custom: post, policy: () => ({ extraSchemes: schemes }), onCommand: vi.fn() });
    expect(b.send({ type: "open_url", url: "myapp://promo/1", kind: "deep_link" })).toBe(false);
    schemes = ["myapp"];
    expect(b.send({ type: "open_url", url: "myapp://promo/1", kind: "deep_link" })).toBe(true);
  });

  it("sin canal devuelve false y un canal que lanza no rompe la página", () => {
    const none = createBridge({ win: fakeWin().win, policy: () => ({}), onCommand: vi.fn() });
    expect(none.send({ type: "close", reason: "x" })).toBe(false);
    const onReject = vi.fn();
    const boom = createBridge({ win: fakeWin().win, custom: () => { throw new Error("canal cerrado"); }, policy: () => ({}), onCommand: vi.fn(), onReject });
    expect(boom.send({ type: "close", reason: "x" })).toBe(false);
    expect(onReject).toHaveBeenCalledWith("out", "canal cerrado");
  });

  it("recorta los datos del evento antes de enviar (sin credenciales)", () => {
    const post = vi.fn();
    const b = createBridge({ win: fakeWin().win, custom: post, policy: () => ({}), onCommand: vi.fn() });
    b.send({ type: "event", name: "story.view", data: { groupId: "g1", token: "sst_secretsecret" } });
    const sent = String(post.mock.calls[0]![0]);
    expect(sent).toContain("g1");
    expect(sent).not.toContain("sst_secretsecret");
  });
});

describe("recepción de comandos", () => {
  it("receive entrega los válidos y rechaza los mal formados sin lanzar", () => {
    const onCommand = vi.fn();
    const onReject = vi.fn();
    const b = createBridge({ win: fakeWin().win, policy: () => ({}), onCommand, onReject });
    expect(b.receive(JSON.stringify({ source: HOST_SOURCE, v: 1, type: "pause" }))).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({ type: "pause" });
    for (const bad of ["{", "null", "[]", JSON.stringify({ source: HOST_SOURCE, v: 1, type: "exec", code: "alert(1)" }), 42, undefined]) expect(b.receive(bad)).toBe(false);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(6);
  });

  it("canal iframe: solo acepta el origen declarado Y la ventana padre", () => {
    const w = fakeWin();
    const onCommand = vi.fn();
    createBridge({ win: w.win, parentOrigin: "https://app.example.com", policy: () => ({}), onCommand });
    const cmd = { source: HOST_SOURCE, v: 1, type: "pause" };
    w.fire({ origin: "https://evil.example.com", source: w.parent, data: cmd });
    w.fire({ origin: "https://app.example.com", source: {}, data: cmd });
    w.fire({ origin: "null", source: w.parent, data: cmd });
    expect(onCommand).not.toHaveBeenCalled();
    w.fire({ origin: "https://app.example.com", source: w.parent, data: cmd });
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it("canal iframe: publica con el origen exacto, nunca con \"*\"", () => {
    const w = fakeWin();
    const b = createBridge({ win: w.win, parentOrigin: "https://app.example.com", policy: () => ({}), onCommand: vi.fn() });
    b.send({ type: "close", reason: "user" });
    expect(w.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "close" }), "https://app.example.com");
  });

  it("destroy quita el oyente de mensajes", () => {
    const w = fakeWin();
    const b = createBridge({ win: w.win, parentOrigin: "https://app.example.com", policy: () => ({}), onCommand: vi.fn() });
    expect(w.listeners.size).toBe(1);
    b.destroy();
    expect(w.listeners.size).toBe(0);
  });
});
