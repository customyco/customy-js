import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { banner, fakeFetch, json, placementResponse } from "../../stories-render/src/test-fixtures";
import { createEmbed, type EmbedHandle } from "../src/embed";
import { HOST_SOURCE } from "../src/protocol";
import type { ModuleLoaders } from "../src/modules";

const TOKEN = "sst_test_token_123456";
const rejectingLoaders = (): ModuleLoaders => {
  const no = () => Promise.reject(new Error("módulo no disponible en la prueba"));
  return { components: no, lottie: no, game: no, video: no, live: no, ads: no };
};

type Msg = { source: string; v: number; type: string; [k: string]: unknown };
function setup(over: { placement?: ReturnType<typeof placementResponse>; loaders?: ModuleLoaders } = {}) {
  const sent: Msg[] = [];
  const t = fakeFetch([(call) => (call.url.includes("/client/events") ? json({ accepted: true }) : json(over.placement ?? placementResponse()))]);
  vi.stubGlobal("fetch", t.fn);
  const api = createEmbed({ win: window, loaders: over.loaders ?? rejectingLoaders() });
  const transport = (j: string): void => void sent.push(JSON.parse(j) as Msg);
  const host = (cmd: Record<string, unknown>): boolean => api.receive(JSON.stringify({ source: HOST_SOURCE, v: 1, ...cmd }));
  const of = (type: string): Msg[] => sent.filter((m) => m.type === type);
  return { api, sent, of, host, transport, calls: t.calls };
}

let handles: EmbedHandle[] = [];
const track = (h: EmbedHandle): EmbedHandle => (handles.push(h), h);

beforeEach(() => {
  // El embed persiste caché, frecuencia y «visto» en localStorage: cada prueba parte de cero.
  localStorage.clear();
  document.body.innerHTML = '<div id="customy-stories"></div>';
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
});
afterEach(async () => {
  for (const h of handles) await h.destroy();
  handles = [];
  vi.unstubAllGlobals();
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

describe("init: credenciales y configuración", () => {
  it("exige un token y rechaza llaves de servicio o valores raros", async () => {
    const { api, transport } = setup();
    await expect(api.init({ placementId: "home_top", transport })).rejects.toThrow(/falta token/);
    for (const bad of ["sk_live_abcdefghijkl", "Bearer sst_abcdefgh1234", "x-internal-key", ""]) {
      await expect(api.init({ placementId: "home_top", token: bad, transport })).rejects.toThrow(/token de suscriptor/);
    }
  });

  it("valida placementId, baseUrl y tema antes de pedir nada", async () => {
    const { api, transport, calls } = setup();
    await expect(api.init({ placementId: "../x", token: TOKEN, transport })).rejects.toThrow(/placementId/);
    await expect(api.init({ placementId: "ok", token: TOKEN, baseUrl: "http://evil.example", transport })).rejects.toThrow(/baseUrl/);
    await expect(api.init({ placementId: "ok", token: TOKEN, theme: "x" as never, transport })).rejects.toThrow(/theme/);
    expect(calls).toHaveLength(0);
  });

  it("un token de función que devuelve otra cosa no llega a la red y se informa como error", async () => {
    const { api, transport, of, calls } = setup();
    const errors: string[] = [];
    track(await api.init({ placementId: "home_top", token: async () => "sk_live_abcdefghijkl", transport, onError: (e) => errors.push(e.code) }));
    expect(calls.filter((c) => c.headers.authorization)).toHaveLength(0);
    expect(of("error").length + errors.length).toBeGreaterThan(0);
  });
});

describe("render y puente", () => {
  it("pinta la barra y el banner, avisa ready y manda el token como Bearer", async () => {
    const { api, of, transport, calls } = setup();
    track(await api.init({ placementId: "home_top", token: TOKEN, locale: "es", transport }));
    expect(of("ready")[0]).toMatchObject({ protocol: 1, awaitingInit: false });
    expect(document.querySelector("#customy-stories .cs-embed .cs-bar")).not.toBeNull();
    expect(document.querySelector("#customy-stories .cs-embed .cs-banner")).not.toBeNull();
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(of("resize").at(-1)).toMatchObject({ mode: "inline" });
  });

  it("el visor abre en pantalla completa, reenvía eventos sin credenciales y vuelve a inline al cerrar", async () => {
    const { api, of, sent, transport } = setup();
    track(await api.init({ placementId: "home_top", token: TOKEN, transport, locale: "es" }));
    document.querySelector<HTMLButtonElement>('[data-group-id="g1"]')!.click();
    expect(of("resize").at(-1)).toMatchObject({ mode: "fullscreen" });
    const names = of("event").map((m) => m.name);
    expect(names).toContain("story.view");
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    const close = [...document.querySelectorAll<HTMLButtonElement>(".cs-viewer button")].find((x) => /cerrar|close/i.test(x.getAttribute("aria-label") ?? ""));
    expect(close).toBeDefined();
    close!.click();
    expect(of("resize").at(-1)).toMatchObject({ mode: "inline" });
  });

  it("el comando close_viewer del anfitrión cierra el visor abierto (Atrás nativo)", async () => {
    const { api, of, host, transport } = setup();
    track(await api.init({ placementId: "home_top", token: TOKEN, transport, locale: "es" }));
    document.querySelector<HTMLButtonElement>('[data-group-id="g1"]')!.click();
    expect(of("resize").at(-1)).toMatchObject({ mode: "fullscreen" });
    expect(host({ type: "close_viewer" })).toBe(true);
    expect(of("resize").at(-1)).toMatchObject({ mode: "inline" });
  });

  it("un enlace https del banner cruza el puente normalizado", async () => {
    const { api, of, transport } = setup();
    track(await api.init({ placementId: "home_top", token: TOKEN, transport }));
    document.querySelector<HTMLElement>(".cs-banner__slide")!.click();
    expect(of("open_url")).toEqual([expect.objectContaining({ url: "https://example.com/x", kind: "url" })]);
  });

  it("un enlace javascript:, data: o de un esquema no declarado NO cruza el puente y se registra como link_blocked", async () => {
    for (const [action, blocked] of [
      [{ type: "url", url: "javascript:alert(1)" }, "esquema prohibido"],
      [{ type: "url", url: "data:text/html,<script>alert(1)</script>" }, "esquema prohibido"],
      [{ type: "deep_link", uri: "myapp://promo/1" }, "esquema no permitido"],
      [{ type: "url", url: "/relativo" }, "no es una URL absoluta"],
    ] as const) {
      localStorage.clear();
      document.body.innerHTML = '<div id="customy-stories"></div>';
      const evil = banner("b2", ["s1"], { priority: 90 });
      evil.slides![0] = { ...evil.slides![0]!, action };
      const base = placementResponse();
      const widgets = base.widgets.map((w) => (w.kind === "banner" ? { ...w, items: [evil] } : w));
      const { api, of, transport } = setup({ placement: placementResponse({ widgets }) });
      const events: { name: string; data: Record<string, unknown> }[] = [];
      track(await api.init({ placementId: "home_top", token: TOKEN, transport, onEvent: (e) => events.push(e) }));
      document.querySelector<HTMLElement>(".cs-banner__slide")!.click();
      expect(of("open_url")).toHaveLength(0);
      expect(events.find((e) => e.name === "link_blocked")?.data.reason).toContain(blocked);
      await handles.pop()!.destroy();
    }
  });

  it("un deep link propio pasa solo si la app declaró su esquema", async () => {
    const evil = banner("b2", ["s1"], { priority: 90 });
    evil.slides![0] = { ...evil.slides![0]!, action: { type: "deep_link", uri: "myapp://promo/1" } };
    const widgets = placementResponse().widgets.map((w) => (w.kind === "banner" ? { ...w, items: [evil] } : w));
    const { api, of, transport } = setup({ placement: placementResponse({ widgets }) });
    track(await api.init({ placementId: "home_top", token: TOKEN, transport, allowedSchemes: ["myapp"] }));
    document.querySelector<HTMLElement>(".cs-banner__slide")!.click();
    expect(of("open_url")).toEqual([expect.objectContaining({ url: "myapp://promo/1", kind: "deep_link" })]);
  });

  it("sin puente (sitio web) abre https en pestaña nueva con noopener", async () => {
    const { api } = setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    track(await api.init({ placementId: "home_top", token: TOKEN }));
    document.querySelector<HTMLElement>(".cs-banner__slide")!.click();
    expect(open).toHaveBeenCalledWith("https://example.com/x", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("display=banner no pinta la barra; display=viewer abre directo y pide cerrar el WebView al terminar", async () => {
    const a = setup();
    track(await a.api.init({ placementId: "home_top", token: TOKEN, transport: a.transport, display: "banner" }));
    expect(document.querySelector(".cs-bar")).toBeNull();
    expect(document.querySelector(".cs-banner")).not.toBeNull();
    await handles.pop()!.destroy();

    localStorage.clear();
    document.body.innerHTML = '<div id="customy-stories"></div>';
    const b = setup();
    track(await b.api.init({ placementId: "home_top", token: TOKEN, transport: b.transport, display: "viewer" }));
    expect(document.querySelector("dialog.cs-viewer")).not.toBeNull();
    expect(document.querySelector(".cs-banner")).toBeNull();
    expect(b.of("resize").at(-1)).toMatchObject({ mode: "fullscreen" });
  });

  it("un placement apagado por kill switch se informa y no pinta nada", async () => {
    const killed = placementResponse({ kill: { placement: true, story: false, banner: false } });
    const { api, of, transport } = setup({ placement: killed });
    track(await api.init({ placementId: "home_top", token: TOKEN, transport }));
    expect(document.querySelector(".cs-bar")).toBeNull();
    expect(of("event").map((m) => m.name)).toContain("placement.unavailable");
  });
});

describe("token nativo y comandos", () => {
  it("el token se pide al anfitrión (request_token) y la respuesta se valida", async () => {
    const { api, of, host, transport, calls } = setup();
    const p = api.init({ placementId: "home_top", token: "native", transport });
    await vi.waitFor(() => expect(of("request_token")).toHaveLength(1));
    const req = of("request_token")[0]!;
    expect(host({ type: "token", requestId: "otro", token: TOKEN })).toBe(true); // id desconocido: se ignora
    expect(calls).toHaveLength(0);
    expect(host({ type: "token", requestId: req.requestId, token: "sk_live_abcdefghijkl" })).toBe(false); // llave de servicio: rechazada
    expect(host({ type: "token", requestId: req.requestId, token: TOKEN })).toBe(true);
    track(await p);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("autostart: avisa ready con awaitingInit y arranca solo con el comando init del anfitrión", async () => {
    const { api, of, host, transport } = setup();
    api.autostart({ transport });
    expect(of("ready")[0]).toMatchObject({ awaitingInit: true });
    expect(host({ type: "init", config: { placementId: "../malo" } })).toBe(false);
    expect(of("request_token")).toHaveLength(0);
    expect(host({ type: "init", config: { placementId: "home_top", locale: "es", platform: "android", allowedSchemes: ["myapp"] } })).toBe(true);
    await vi.waitFor(() => expect(of("request_token")).toHaveLength(1));
    host({ type: "token", requestId: of("request_token")[0]!.requestId, token: TOKEN });
    await vi.waitFor(() => expect(document.querySelector(".cs-bar")).not.toBeNull());
    expect(host({ type: "destroy" })).toBe(true);
    await vi.waitFor(() => expect(document.querySelector(".cs-embed")).toBeNull());
  });

  it("set_theme repinta, pause/resume pausan la entrega y destroy limpia todo", async () => {
    const { api, host, transport } = setup();
    const h = track(await api.init({ placementId: "home_top", token: TOKEN, transport }));
    expect(host({ type: "set_theme", theme: "dark" })).toBe(true);
    await vi.waitFor(() => expect(document.querySelector(".cs-bar")?.getAttribute("data-cs-theme")).toBe("dark"));
    host({ type: "pause" });
    expect(h.client.surfaces.isPaused("story")).toBe(true);
    host({ type: "resume" });
    expect(h.client.surfaces.isPaused("story")).toBe(false);
    expect(host({ type: "destroy" })).toBe(true);
    await vi.waitFor(() => expect(document.querySelector(".cs-embed")).toBeNull());
    expect(api.receive(JSON.stringify({ source: HOST_SOURCE, v: 1, type: "pause" }))).toBe(false);
  });

  it("navigator.share se sustituye por el puente mientras vive el embed y se restaura al destruirlo", async () => {
    const { api, of, transport } = setup();
    expect("share" in navigator).toBe(false);
    const h = track(await api.init({ placementId: "home_top", token: TOKEN, transport }));
    await navigator.share({ url: "https://example.com/s", title: "hola" });
    expect(of("share")).toEqual([expect.objectContaining({ url: "https://example.com/s", title: "hola" })]);
    await navigator.share({ url: "javascript:alert(1)" });
    expect(of("share")).toHaveLength(1);
    await h.destroy();
    expect("share" in navigator).toBe(false);
  });
});

describe("estilos compatibles con CSP", () => {
  it("con nonce inyecta <style nonce>; con injectStyles=false no inyecta nada", async () => {
    const a = setup();
    track(await a.api.init({ placementId: "home_top", token: TOKEN, transport: a.transport, nonce: "abc123" }));
    expect(document.head.querySelector("style[nonce='abc123']")).not.toBeNull();
    await handles.pop()!.destroy();
    document.head.querySelectorAll("style").forEach((s) => s.remove());
    const b = setup();
    track(await b.api.init({ placementId: "home_top", token: TOKEN, transport: b.transport, injectStyles: false }));
    expect(document.head.querySelector("style")).toBeNull();
  });
});
