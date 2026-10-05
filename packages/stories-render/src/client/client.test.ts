import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, group, json, placementResponse } from "../test-fixtures";
import { createMemoryStore } from "../store";
import { createPlacementClient, processPlacement } from "./placements";
import { StoriesError } from "./errors";
import { compareVersions } from "./version";

const T0 = Date.parse("2026-10-02T12:00:00Z");
let now = T0;
const clock = { now: () => now, setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms), clearTimeout: (h: unknown) => globalThis.clearTimeout(h as never) };
beforeEach(() => {
  now = T0;
});
afterEach(() => vi.useRealTimers());

const make = (responses: Parameters<typeof fakeFetch>[0], extra: Partial<Parameters<typeof createPlacementClient>[0]> = {}) => {
  const t = fakeFetch(responses);
  const client = createPlacementClient({ token: async () => "sst_abc", fetch: t.fn, clock, platform: "web", locale: "es", appVersion: "3.1.0", sleep: async () => undefined, ...extra });
  return { client, calls: t.calls };
};

describe("cliente de placements", () => {
  it("pide GET /client/placements/:id con auth, cabecera de cliente y query", async () => {
    const { client, calls } = make([json(placementResponse())]);
    const r = await client.placement("home_top");
    expect(calls[0]!.url).toBe("https://send-api.customy.ai/client/placements/home_top?locale=es&app_version=3.1.0&platform=web");
    expect(calls[0]!.headers.authorization).toBe("Bearer sst_abc");
    expect(JSON.parse(calls[0]!.headers["customy-client"]!)).toMatchObject({ sdk: expect.stringContaining("stories-render/"), platform: "web", app_version: "3.1.0" });
    expect(r).toMatchObject({ status: "ok", fromCache: false, notModified: false, etag: 'W/"v1"' });
  });

  it("respeta el ttl: dentro de la ventana no hay red; vencido, If-None-Match con el ETag y 304 reutiliza la caché", async () => {
    const { client, calls } = make([json(placementResponse({ ttl: 60 })), new Response(null, { status: 304, headers: { etag: 'W/"v1"' } })]);
    await client.placement("home_top");
    now += 59_000;
    const hit = await client.placement("home_top");
    expect(calls).toHaveLength(1);
    expect(hit).toMatchObject({ fromCache: true, notModified: false });
    now += 2_000;
    const revalidated = await client.placement("home_top");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers["if-none-match"]).toBe('W/"v1"');
    expect(revalidated).toMatchObject({ fromCache: true, notModified: true, status: "ok" });
    expect(revalidated.widgets).toHaveLength(2);
    // el 304 renueva la ventana
    now += 30_000;
    await client.placement("home_top");
    expect(calls).toHaveLength(2);
  });

  it("force salta la caché pero sigue enviando el ETag", async () => {
    const { client, calls } = make([json(placementResponse()), new Response(null, { status: 304 })]);
    await client.placement("home_top");
    await client.placement("home_top", { force: true });
    expect(calls[1]!.headers["if-none-match"]).toBe('W/"v1"');
  });

  it("un 200 nuevo sustituye la caché y cambia el ETag", async () => {
    const { client, calls } = make([json(placementResponse({ ttl: 0 })), json(placementResponse({ etag: 'W/"v2"', ttl: 0 }))]);
    await client.placement("home_top");
    const r = await client.placement("home_top");
    expect(r.etag).toBe('W/"v2"');
    expect(calls).toHaveLength(2);
  });

  it("peticiones simultáneas comparten una sola llamada", async () => {
    const { client, calls } = make([json(placementResponse())]);
    await Promise.all([client.placement("home_top"), client.placement("home_top"), client.placement("home_top")]);
    expect(calls).toHaveLength(1);
  });

  it("caché distinta por idioma/plataforma/versión", async () => {
    const { client, calls } = make([json(placementResponse())]);
    await client.placement("home_top", { locale: "es" });
    await client.placement("home_top", { locale: "en" });
    await client.placement("home_top", { platform: "ios" });
    expect(calls).toHaveLength(3);
  });

  it("la caché persiste en el almacenamiento inyectado y sirve sin red tras recargar", async () => {
    const store = createMemoryStore();
    const a = make([json(placementResponse({ ttl: 600 }))], { store });
    await a.client.placement("home_top");
    await new Promise((r) => setTimeout(r, 5));
    const b = make([new Error("sin red")], { store });
    const r = await b.client.placement("home_top");
    expect(b.calls).toHaveLength(0);
    expect(r.fromCache).toBe(true);
  });

  it("sin red sirve lo último (stale); sin caché lanza un error con código", async () => {
    const { client } = make([json(placementResponse({ ttl: 0 })), new Error("offline")], { maxRetries: 0 });
    await client.placement("home_top");
    const r = await client.placement("home_top");
    expect(r).toMatchObject({ stale: true, fromCache: true });
    const fresh = make([new Error("offline")], { maxRetries: 0 });
    await expect(fresh.client.placement("x_placement")).rejects.toMatchObject({ code: "network" });
  });

  it("401 pide un token nuevo una vez; 404 no se disfraza; 429 respeta Retry-After y reintenta", async () => {
    const tokens: boolean[] = [];
    const t = fakeFetch([new Response("", { status: 401 }), json(placementResponse())]);
    const c1 = createPlacementClient({ token: async (f) => (tokens.push(!!f), "sst_x"), fetch: t.fn, clock, sleep: async () => undefined });
    await c1.placement("home_top");
    expect(tokens).toEqual([false, true]);

    const nf = make([new Response("{}", { status: 404 })]);
    await expect(nf.client.placement("nope_id")).rejects.toMatchObject({ code: "not_found", status: 404 });

    const waits: number[] = [];
    const rl = make([new Response("", { status: 429, headers: { "retry-after": "2" } }), json(placementResponse())], { sleep: async (ms) => void waits.push(ms) });
    await rl.client.placement("home_top");
    expect(waits).toEqual([2000]);
    expect(rl.calls).toHaveLength(2);
  });

  it("un 503 con Retry-After (el servidor descarga carga): con algo en caché se sirve YA lo último, sin dormir, y no se vuelve a pedir antes de la hora, ni con force", async () => {
    const waits: number[] = [];
    const { client, calls } = make([json(placementResponse({ ttl: 10 })), new Response("", { status: 503, headers: { "retry-after": "20" } }), json(placementResponse({ etag: 'W/"v2"', ttl: 10 }))], { sleep: async (ms) => void waits.push(ms) });
    await client.placement("home_top");
    now += 11_000;
    const stale = await client.placement("home_top");
    expect(stale).toMatchObject({ fromCache: true, stale: true, status: "ok" });
    expect(waits).toEqual([]);
    expect(calls).toHaveLength(2);
    // inside the window: no request at all, forced or not
    now += 19_000;
    await client.placement("home_top");
    await client.placement("home_top", { force: true });
    expect(calls).toHaveLength(2);
    // after it: back to normal
    now += 2_000;
    const fresh = await client.placement("home_top");
    expect(calls).toHaveLength(3);
    expect(fresh).toMatchObject({ fromCache: false, etag: 'W/"v2"' });
  });

  it("sin caché un 503 sí reintenta (respetando Retry-After): no hay nada que enseñar", async () => {
    const waits: number[] = [];
    const { client, calls } = make([new Response("", { status: 503, headers: { "retry-after": "2" } }), json(placementResponse())], { sleep: async (ms) => void waits.push(ms) });
    await client.placement("home_top");
    expect(waits).toEqual([2000]);
    expect(calls).toHaveLength(2);
  });

  it("una respuesta que no es un placement es invalid_response", async () => {
    const { client } = make([json({ hola: 1 })]);
    await expect(client.placement("home_top")).rejects.toBeInstanceOf(StoriesError);
    await expect(make([json({ placement_id: "a", etag: "x", widgets: [{ kind: "banner" }] })]).client.placement("a_id")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("no se pide token si la caché sirve", async () => {
    const token = vi.fn(async () => "sst");
    const t = fakeFetch([json(placementResponse({ ttl: 600 }))]);
    const c = createPlacementClient({ token, fetch: t.fn, clock });
    await c.placement("home_top");
    await c.placement("home_top");
    expect(token).toHaveBeenCalledTimes(1);
  });
});

describe("kill, min_sdk, calendario", () => {
  const ctx = { sdkVersion: "0.1.0", now: T0 };

  it("kill del placement: nada, con aviso", () => {
    const r = processPlacement(placementResponse({ kill: { placement: true, story: false, banner: false } }), ctx);
    expect(r).toMatchObject({ status: "killed", widgets: [], notice: { code: "kill_placement" } });
  });

  it("kill por superficie VACÍA su lista y deja la otra", () => {
    const story = processPlacement(placementResponse({ kill: { placement: false, story: true, banner: false } }), ctx);
    const bar = story.widgets.find((w) => w.kind === "story_bar");
    const ban = story.widgets.find((w) => w.kind === "banner");
    expect(bar?.items).toEqual([]);
    expect(ban?.items.length).toBeGreaterThan(0);
    expect(story).toMatchObject({ status: "ok", notice: { code: "kill_story" } });
    const banner = processPlacement(placementResponse({ kill: { placement: false, story: false, banner: true } }), ctx);
    expect(banner.widgets.find((w) => w.kind === "banner")?.items).toEqual([]);
    expect(banner.widgets.find((w) => w.kind === "story_bar")?.items.length).toBeGreaterThan(0);
    const both = processPlacement(placementResponse({ kill: { placement: false, story: true, banner: true } }), ctx);
    expect(both.status).toBe("killed");
  });

  it("min_sdk mayor: degradación declarada con aviso y sin widgets", async () => {
    const onNotice = vi.fn();
    const { client } = make([json(placementResponse({ min_sdk: "9.0.0" }))], { onNotice });
    const r = await client.placement("home_top");
    expect(r).toMatchObject({ status: "unsupported", widgets: [], minSdk: "9.0.0", notice: { code: "min_sdk" } });
    expect(onNotice).toHaveBeenCalledWith("home_top", expect.objectContaining({ code: "min_sdk" }));
    const ok = make([json(placementResponse({ min_sdk: "0.1.0" }))]);
    expect((await ok.client.placement("home_top")).status).toBe("ok");
  });

  it("filtra grupos fuera de su calendario y banners caducados", () => {
    const res = placementResponse();
    const bar = res.widgets[0]!;
    if (bar.kind !== "story_bar") throw new Error();
    bar.items = [group("old", ["p"], { schedule: { end_at: "2026-10-01T00:00:00Z" } }), group("future", ["p"], { schedule: { start_at: "2026-11-01T00:00:00Z" } }), group("now", ["p"], { schedule: { start_at: "2026-09-01T00:00:00Z", end_at: "2026-12-01T00:00:00Z" } })];
    const ban = res.widgets[1]!;
    if (ban.kind !== "banner") throw new Error();
    ban.items = [{ ...ban.items[0]!, id: "exp", expires_at: "2026-10-02T11:00:00Z" }, { ...ban.items[1]!, id: "live", expires_at: "2026-10-09T00:00:00Z" }];
    const out = processPlacement(res, ctx);
    expect(out.widgets[0]!.items.map((g) => (g as { id: string }).id)).toEqual(["now"]);
    expect(out.widgets[1]!.items.map((g) => (g as { id: string }).id)).toEqual(["live"]);
  });

  it("widgets reservados pasan sin romper y un placement sin nada es empty", () => {
    const res = placementResponse({ widgets: [{ kind: "video_feed", items: [] }] });
    expect(processPlacement(res, ctx)).toMatchObject({ status: "empty" });
  });

  it("compara versiones semver", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.99.9")).toBe(1);
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0);
  });
});
