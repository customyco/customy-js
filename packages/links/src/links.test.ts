import { collect, createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { createLinks, CustomyLinksError, signPayload, verifyWebhook } from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function scripted(replies: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: typeof init?.body === "string" ? init.body : undefined });
    const next = replies.shift();
    if (!next) throw new Error("sin respuesta preparada");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const BASE = "https://links.fixture.invalid";
const ISSUER = "https://access.fixture.invalid";
const fast = { baseDelayMs: 1, maxDelayMs: 1 };
const link = (id: string) => ({ id, slug: id, domain: "go.fixture.invalid" });

describe("@customyai/links", () => {
  it("traduce los errores de Links a CustomyLinksError", async () => {
    const { fetch } = scripted([json(409, { error: "slug already taken", code: "SLUG_TAKEN" }, { "x-request-id": "req_9" })]);
    const links = createLinks({ baseUrl: BASE, accessToken: "cl_test_x", fetch });
    const error = await links.links.create({ destinationUrl: "https://example.com" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomyLinksError);
    expect(error).toBeInstanceOf(CustomySdkError);
    expect(error).toMatchObject({ code: "SLUG_TAKEN", status: 409, service: "links", requestId: "req_9" });
  });

  it("reintenta lecturas ante 429 respetando Retry-After y no repite un POST", async () => {
    const reads = scripted([json(429, { code: "RATE_LIMITED" }, { "retry-after": "0" }), json(200, link("a"))]);
    const client = createLinks({ baseUrl: BASE, accessToken: "cl_test_x", fetch: reads.fetch, retry: fast });
    await expect(client.links.get("a")).resolves.toMatchObject({ id: "a" });
    expect(reads.calls).toHaveLength(2);

    const writes = scripted([json(503, { code: "UNAVAILABLE" })]);
    const writer = createLinks({ baseUrl: BASE, accessToken: "cl_test_x", fetch: writes.fetch, retry: fast });
    await expect(writer.track.sale({ externalId: "u1", amount: 10 })).rejects.toMatchObject({ code: "UNAVAILABLE", status: 503 });
    expect(writes.calls).toHaveLength(1);
  });

  it("recorre todas las páginas con iterate", async () => {
    const { fetch, calls } = scripted([
      json(200, { items: [link("a"), link("b")], total: 3, page: 1, limit: 2 }),
      json(200, { items: [link("c")], total: 3, page: 2, limit: 2 }),
    ]);
    const client = createLinks({ baseUrl: BASE, accessToken: "cl_test_x", fetch });
    const all = await collect(client.links.iterate({ limit: 2, status: "active" }));
    expect(all.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(new URL(calls[1]!.url).searchParams.get("page")).toBe("2");
    expect(new URL(calls[1]!.url).searchParams.get("status")).toBe("active");
  });

  it("con machineTokens pide audiencia customy-links y el scope indicado", async () => {
    const { fetch, calls } = scripted([json(200, { access_token: "tok", expires_in: 300 }), json(200, { id: "cv_1" })]);
    const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch });
    const client = createLinks({ baseUrl: BASE, machineTokens, scopes: ["links:track"], fetch });
    await client.track.lead({ externalId: "u1" });
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get("audience")).toBe("customy-links");
    expect(form.get("scope")).toBe("links:track");
    expect(calls[1]!.headers.authorization).toBe("Bearer tok");
  });

  it("el estado público no necesita credencial; lo demás sí", async () => {
    const { fetch, calls } = scripted([json(200, { status: "operational" })]);
    const client = createLinks({ baseUrl: BASE, fetch });
    await expect(client.status()).resolves.toMatchObject({ status: "operational" });
    expect(calls[0]!.headers.authorization).toBeUndefined();
    await expect(client.links.list()).rejects.toMatchObject({ code: "SDK_CREDENTIALS_REQUIRED" });
  });

  it("verifica webhooks", async () => {
    const secret = `whsec_${btoa("links-fixture-secret")}`;
    const body = JSON.stringify({ id: "evt_1", type: "link.clicked", createdAt: "2026-09-27T12:00:00Z", data: {} });
    const now = new Date("2026-09-27T12:00:00Z");
    const ts = Math.floor(now.getTime() / 1000);
    const headers = { "webhook-id": "evt_1", "webhook-timestamp": String(ts), "webhook-signature": await signPayload(secret, "evt_1", ts, body) };
    await expect(verifyWebhook(body, headers, secret, { now })).resolves.toMatchObject({ type: "link.clicked" });
    await expect(verifyWebhook(`${body} `, headers, secret, { now })).rejects.toThrow("signature");
  });
});
