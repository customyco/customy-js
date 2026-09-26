import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CustomySend, CustomySendError, verifyWebhook } from "./index";

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

describe("CustomySend", () => {
  it("manda con Bearer, traduce camelCase a la API y devuelve el correo", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const send = new CustomySend("cs_live_abc", { baseUrl: "https://send.test/", fetch: fakeFetch((url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ id: "eml_1", status: "queued" }), { status: 201 }); }) });
    const email = await send.emails.send({ from: "Acme <a@acme.com>", to: "u@x.com", subject: "s", text: "t", replyTo: "r@acme.com", scheduledAt: "in 1 hour", trackOpens: false }, { idempotencyKey: "k1" });
    expect(email).toMatchObject({ id: "eml_1" });
    expect(seen[0]!.url).toBe("https://send.test/api/emails");
    const headers = seen[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer cs_live_abc");
    expect(headers["idempotency-key"]).toBe("k1");
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({ from: "Acme <a@acme.com>", to: "u@x.com", subject: "s", text: "t", reply_to: "r@acme.com", scheduled_at: "in 1 hour", track_opens: false });
  });

  it("acepta un proveedor de tokens de Customy Access y lo consulta en cada petición", async () => {
    let issued = 0;
    const seen: string[] = [];
    const send = new CustomySend(async () => `jwt-${++issued}`, { baseUrl: "https://send.test", fetch: fakeFetch((_url, init) => { seen.push((init.headers as Record<string, string>).authorization); return new Response(JSON.stringify({ data: [] }), { status: 200 }); }) });
    await send.request("GET", "/api/templates");
    await send.request("GET", "/api/templates");
    expect(seen).toEqual(["Bearer jwt-1", "Bearer jwt-2"]);
    expect(() => new CustomySend("sk_otro")).toThrow(/cs_live_/);
  });

  it("un error de la API llega con código y estado; un 429 de ritmo se reintenta con retry-after", async () => {
    let calls = 0;
    const send = new CustomySend("cs_test_abc", { baseUrl: "https://send.test", maxRetries: 2, fetch: fakeFetch(() => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "slow down" }), { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) });
    expect(await send.emails.list()).toEqual({ data: [] });
    expect(calls).toBe(2);
    const failing = new CustomySend("cs_test_abc", { baseUrl: "https://send.test", fetch: fakeFetch(() => new Response(JSON.stringify({ statusCode: 422, name: "domain_not_verified", message: "verify acme.com first" }), { status: 422 })) });
    await expect(failing.emails.send({ from: "a@acme.com", to: "u@x.com", subject: "s", text: "t" })).rejects.toMatchObject({ name: "CustomySendError", status: 422, code: "domain_not_verified" });
    expect(() => new CustomySend("mala")).toThrow();
  });

  it("verifica la firma de un webhook como la produce Send", async () => {
    const secret = `whsec_${Buffer.from("secreto-de-24-bytes-aqui").toString("base64")}`;
    const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-13T00:00:00Z", data: { email_id: "eml_1" } });
    const ts = Math.floor(Date.now() / 1000);
    const mac = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
    const headers = { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": `v1,${mac}` };
    const event = await verifyWebhook(body, headers, secret);
    expect(event.type).toBe("email.delivered");
    await expect(verifyWebhook(body, { ...headers, "webhook-signature": "v1,AAAA" }, secret)).rejects.toThrow(/firma/);
    await expect(verifyWebhook(body, { ...headers, "webhook-timestamp": String(ts - 3600) }, secret)).rejects.toThrow(/marca de tiempo/);
    expect(new CustomySendError(0, "x", "y", null)).toBeInstanceOf(Error);
  });
});
