import { describe, expect, it, vi } from "vitest";
import { CustomyLinks, CustomyLinksError, shortUrlOf } from "./client";
import { signPayload, verifyWebhook, WebhookVerificationError } from "./webhooks";

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init ?? {}));
}

describe("CustomyLinks", () => {
  it("exige la llave y la manda como Bearer con el cuerpo en JSON", async () => {
    expect(() => new CustomyLinks({ apiKey: "" })).toThrow(/apiKey/);
    const fetchFn = fakeFetch((url, init) => {
      expect(url).toBe("https://links.customy.ai/api/links");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer cl_test_abc");
      expect(JSON.parse(String(init.body))).toEqual({ destinationUrl: "https://x.test" });
      return new Response(JSON.stringify({ id: "1", slug: "abc", domain: "links.customy.ai" }), { status: 201 });
    });
    const sdk = new CustomyLinks({ apiKey: "cl_test_abc", fetch: fetchFn as unknown as typeof fetch });
    const link = await sdk.links.create({ destinationUrl: "https://x.test" });
    expect(link.slug).toBe("abc");
    expect(shortUrlOf(link)).toBe("https://links.customy.ai/abc");
  });

  it("acepta un proveedor de tokens de Customy Access", async () => {
    const fetchFn = fakeFetch((_url, init) => {
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer jwt-links");
      return new Response(JSON.stringify({ id: "1", slug: "abc", domain: "links.customy.ai" }), { status: 201 });
    });
    const sdk = new CustomyLinks({ apiKey: async () => "jwt-links", fetch: fetchFn as unknown as typeof fetch });
    expect((await sdk.links.create({ destinationUrl: "https://x.test" })).slug).toBe("abc");
  });

  it("serializa la query y omite lo vacío", async () => {
    const fetchFn = fakeFetch((url) => {
      expect(url).toBe("https://links.example/api/links?search=promo&page=2&limit=50");
      return new Response(JSON.stringify({ items: [], total: 0, page: 2, limit: 50 }));
    });
    const sdk = new CustomyLinks({ apiKey: "cl_live_x", baseUrl: "https://links.example/", fetch: fetchFn as unknown as typeof fetch });
    const page = await sdk.links.list({ search: "promo", page: 2, limit: 50, status: undefined });
    expect(page.total).toBe(0);
  });

  it("convierte los errores de la API en CustomyLinksError con código", async () => {
    const fetchFn = fakeFetch(() => new Response(JSON.stringify({ error: "slug taken", code: "SLUG_TAKEN" }), { status: 409 }));
    const sdk = new CustomyLinks({ apiKey: "cl_live_x", fetch: fetchFn as unknown as typeof fetch, maxRetries: 0 });
    await expect(sdk.links.create({ destinationUrl: "https://x.test", slug: "taken" })).rejects.toMatchObject({ name: "CustomyLinksError", status: 409, code: "SLUG_TAKEN" });
  });

  it("reintenta 429 y 5xx y luego acierta; no reintenta 4xx", async () => {
    let calls = 0;
    const fetchFn = fakeFetch(() => {
      calls += 1;
      if (calls === 1) return new Response("", { status: 503 });
      if (calls === 2) return new Response("", { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ id: "1" }));
    });
    const sdk = new CustomyLinks({ apiKey: "cl_live_x", fetch: fetchFn as unknown as typeof fetch, maxRetries: 2 });
    expect(await sdk.links.get("1")).toEqual({ id: "1" });
    expect(calls).toBe(3);
    let badCalls = 0;
    const bad = fakeFetch(() => { badCalls += 1; return new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 }); });
    const sdk2 = new CustomyLinks({ apiKey: "cl_live_x", fetch: bad as unknown as typeof fetch });
    await expect(sdk2.links.get("nope")).rejects.toBeInstanceOf(CustomyLinksError);
    expect(badCalls).toBe(1);
  });

  it("204 devuelve undefined y /status.json va sin llave", async () => {
    const fetchFn = fakeFetch((url, init) => {
      if (url.endsWith("/status.json")) {
        expect((init.headers as Record<string, string>).authorization).toBeUndefined();
        return new Response(JSON.stringify({ status: "operational" }));
      }
      return new Response(null, { status: 204 });
    });
    const sdk = new CustomyLinks({ apiKey: "cl_live_x", fetch: fetchFn as unknown as typeof fetch });
    expect(await sdk.links.delete("1")).toBeUndefined();
    expect((await sdk.status()).status).toBe("operational");
  });
});

describe("verifyWebhook", () => {
  const secret = "whsec_" + Buffer.from("una-clave-de-pruebas-larga").toString("base64");
  const body = JSON.stringify({ id: "evt_1", type: "link.clicked", createdAt: "2026-09-18T00:00:00Z", data: { link: { id: "1" } } });

  it("acepta una firma válida y devuelve el evento tipado", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signPayload(secret, "msg_1", ts, body);
    const event = await verifyWebhook<{ link: { id: string } }>(body, { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": sig }, secret);
    expect(event.type).toBe("link.clicked");
    expect(event.data.link.id).toBe("1");
  });

  it("acepta Headers de fetch y varias firmas separadas por espacio", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signPayload(secret, "msg_2", ts, body);
    const headers = new Headers({ "webhook-id": "msg_2", "webhook-timestamp": String(ts), "webhook-signature": `v1,otra ${sig}` });
    await expect(verifyWebhook(body, headers, secret)).resolves.toMatchObject({ id: "evt_1" });
  });

  it("rechaza firma mala, cuerpo alterado y timestamp viejo", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signPayload(secret, "msg_3", ts, body);
    await expect(verifyWebhook(body + " ", { "webhook-id": "msg_3", "webhook-timestamp": String(ts), "webhook-signature": sig }, secret)).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyWebhook(body, { "webhook-id": "msg_3", "webhook-timestamp": String(ts), "webhook-signature": "v1,AAAA" }, secret)).rejects.toThrow(/mismatch/);
    await expect(verifyWebhook(body, { "webhook-id": "msg_3", "webhook-timestamp": String(ts - 3600), "webhook-signature": sig }, secret)).rejects.toThrow(/tolerance/);
    await expect(verifyWebhook(body, {}, secret)).rejects.toThrow(/missing/);
  });
});
