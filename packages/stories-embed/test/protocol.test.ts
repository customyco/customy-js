import { describe, expect, it } from "vitest";
import { HOST_SOURCE, MAX_INBOUND_BYTES, PROTOCOL_VERSION, encodePageMessage, isSafeBaseUrl, parseHostCommand, parseInitConfig, sanitizeData, validateOutbound } from "../src/protocol";

const host = (over: Record<string, unknown>): string => JSON.stringify({ source: HOST_SOURCE, v: PROTOCOL_VERSION, ...over });

describe("comandos del anfitrión: validación estricta", () => {
  it("acepta texto JSON y objetos bien formados", () => {
    expect(parseHostCommand(host({ type: "pause" }))).toEqual({ ok: true, value: { type: "pause" } });
    expect(parseHostCommand({ source: HOST_SOURCE, v: 1, type: "set_theme", theme: "dark" })).toEqual({ ok: true, value: { type: "set_theme", theme: "dark" } });
    expect(parseHostCommand(host({ type: "open", groupId: "g_1" }))).toEqual({ ok: true, value: { type: "open", groupId: "g_1" } });
    expect(parseHostCommand(host({ type: "token", requestId: "r1", token: "sst_abcdefgh1234" }))).toMatchObject({ ok: true });
  });

  it.each([
    ["no es JSON", "{nope"],
    ["JSON que no es objeto", "[1,2]"],
    ["null", "null"],
    ["un número", 7],
    ["sin source", JSON.stringify({ v: 1, type: "pause" })],
    ["source ajeno", JSON.stringify({ source: "otro", v: 1, type: "pause" })],
    ["source de la página (rebote)", JSON.stringify({ source: "customy-stories", v: 1, type: "pause" })],
    ["versión futura", host({ v: 2, type: "pause" })],
    ["versión como texto", host({ v: "1", type: "pause" })],
    ["tipo desconocido", host({ type: "eval" })],
    ["tipo con código", host({ type: "pause", js: "alert(1)" }) && host({ type: "alert(1)" })],
    ["theme inválido", host({ type: "set_theme", theme: "<script>" })],
    ["locale inválido", host({ type: "set_locale", locale: "es; DROP" })],
    ["groupId con caracteres raros", host({ type: "open", groupId: "../../x" })],
    ["groupId no texto", host({ type: "open", groupId: 5 })],
    ["permission_result inválido", host({ type: "permission_result", permission: "root", granted: true })],
    ["granted no booleano", host({ type: "permission_result", permission: "camera", granted: "yes" })],
    ["visibility no booleano", host({ type: "visibility", visible: 1 })],
    ["token que parece llave de servicio", host({ type: "token", requestId: "r1", token: "sk_live_abcdefghijkl" })],
    ["token sin prefijo", host({ type: "token", requestId: "r1", token: "abcdefghijkl" })],
    ["requestId inválido", host({ type: "token", requestId: "a b", token: "sst_abcdefgh1234" })],
    ["init con config no objeto", host({ type: "init", config: "x" })],
    ["init con placement inyectado", host({ type: "init", config: { placementId: "a/../b" } })],
  ])("rechaza: %s", (_n, raw) => {
    expect(parseHostCommand(raw).ok).toBe(false);
  });

  it("rechaza un mensaje demasiado grande sin parsearlo", () => {
    const r = parseHostCommand(host({ type: "pause", pad: "a".repeat(MAX_INBOUND_BYTES) }));
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("grande") });
  });

  it("descarta los campos que no conoce (no se cuelan al resultado)", () => {
    const r = parseHostCommand(host({ type: "pause", extra: "x", __proto__: { polluted: true } }));
    expect(r).toEqual({ ok: true, value: { type: "pause" } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("configuración de init", () => {
  it("acepta lo mínimo y lo completo", () => {
    expect(parseInitConfig({ placementId: "home" }).ok).toBe(true);
    const full = parseInitConfig({ placementId: "home_top", locale: "es-CO", theme: "dark", platform: "ios", appVersion: "1.2.3", baseUrl: "https://send-api.customy.ai", display: "viewer", allowedSchemes: ["myapp"] });
    expect(full.ok).toBe(true);
  });

  it.each([
    [{ placementId: "x y" }],
    [{ placementId: "" }],
    [{}],
    [{ placementId: "a", locale: "no es locale" }],
    [{ placementId: "a", theme: "neon" }],
    [{ placementId: "a", platform: "windows" }],
    [{ placementId: "a", display: "fullpage" }],
    [{ placementId: "a", baseUrl: "http://evil.example" }],
    [{ placementId: "a", baseUrl: "https://user:pw@send-api.customy.ai" }],
    [{ placementId: "a", baseUrl: "javascript:alert(1)" }],
    [{ placementId: "a", allowedSchemes: ["JAVASCRIPT"] }],
    [{ placementId: "a", allowedSchemes: "myapp" }],
    [{ placementId: "a", appVersion: "1 2" }],
    ["texto"],
  ])("rechaza %j", (cfg) => {
    expect(parseInitConfig(cfg).ok).toBe(false);
  });

  it("baseUrl: http solo hacia localhost", () => {
    expect(isSafeBaseUrl("http://localhost:4165")).toBe(true);
    expect(isSafeBaseUrl("http://127.0.0.1:4165")).toBe(true);
    expect(isSafeBaseUrl("http://10.0.2.2:4165")).toBe(true); // el anfitrión desde el emulador de Android
    expect(isSafeBaseUrl("http://192.168.1.10:4165")).toBe(false);
    expect(isSafeBaseUrl("http://example.com")).toBe(false);
    expect(isSafeBaseUrl("https://send-api.customy.ai?x=1")).toBe(false);
  });
});

describe("datos de eventos y mensajes salientes", () => {
  it("sanitizeData quita credenciales, claves peligrosas y recorta la profundidad", () => {
    const data = sanitizeData({
      ok: 1,
      token: "sst_x",
      Authorization: "Bearer x",
      apiKey: "k",
      nested: { password: "p", keep: "v", deep: { a: { b: { c: { d: 1 } } } } },
      list: [1, "a", { secret: "s", fine: true }],
      big: "x".repeat(2000),
      nan: Number.NaN,
      fn: () => 1,
    });
    expect(JSON.stringify(data)).not.toMatch(/sst_x|Bearer|password|secret|"k"/);
    expect(data.ok).toBe(1);
    expect((data.big as string).length).toBe(512);
    expect(data).not.toHaveProperty("nan");
    expect(data).not.toHaveProperty("fn");
    expect(JSON.stringify(data.nested)).not.toContain('"d":1');
  });

  it("sanitizeData ignora __proto__ y constructor", () => {
    const evil = JSON.parse('{"__proto__":{"x":1},"constructor":{"y":2},"a":1}');
    const out = sanitizeData(evil);
    expect(Object.keys(out)).toEqual(["a"]);
  });

  it("validateOutbound bloquea open_url peligrosos y normaliza los buenos", () => {
    expect(validateOutbound({ type: "open_url", url: "javascript:alert(1)", kind: "url" }, {}).ok).toBe(false);
    const ok = validateOutbound({ type: "open_url", url: "HTTPS://Example.com", kind: "url" }, {});
    expect(ok).toMatchObject({ ok: true, value: { url: "https://example.com/" } });
    expect(validateOutbound({ type: "open_url", url: "myapp://x", kind: "deep_link" }, { extraSchemes: ["myapp"] }).ok).toBe(true);
    expect(validateOutbound({ type: "share", url: "myapp://x" }, { extraSchemes: ["myapp"] }).ok).toBe(false);
    expect(validateOutbound({ type: "resize", height: -1, mode: "inline" }, {}).ok).toBe(false);
    expect(validateOutbound({ type: "event", name: "no valido!", data: {} }, {}).ok).toBe(false);
  });

  it("el sobre saliente lleva source y versión", () => {
    expect(JSON.parse(encodePageMessage({ type: "close", reason: "user" }))).toEqual({ source: "customy-stories", v: 1, type: "close", reason: "user" });
  });
});
