import { describe, expect, it } from "vitest";
import { createCustomy } from "./server";

const ISSUER = "https://access.example.test";
const discovery = {
  issuer: ISSUER,
  token_endpoint: `${ISSUER}/oauth/token`,
  products: {
    send: { base_url: "https://send.example.test", audience: "customy-send" },
    links: { base_url: "https://links.example.test", audience: "customy-links" },
    data: { base_url: "https://data.example.test", audience: "customy-data" },
    billing: { base_url: "https://billing.example.test", audience: "customy-billing" },
    crm: { base_url: "https://crm.example.test/", audience: "customy-crm" },
  },
};

type Call = { url: string; init: RequestInit };

function platform(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === `${ISSUER}/.well-known/customy-configuration`) return Response.json(discovery);
    if (url === `${ISSUER}/oauth/token`) {
      const audience = new URLSearchParams(String(init.body)).get("audience");
      return Response.json({ access_token: `token-for-${audience}`, expires_in: 300 });
    }
    const match = Object.entries(responses).find(([prefix]) => url.startsWith(prefix));
    return Response.json(match?.[1] ?? {});
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const authorization = (call: Call | undefined) => new Headers(call?.init.headers).get("authorization");
const tokenRequests = (calls: Call[]) => calls.filter((call) => call.url.endsWith("/oauth/token"));

describe("createCustomy", () => {
  it("descubre la plataforma y pide un token por audiencia, una sola vez", async () => {
    const { calls, fetchImpl } = platform({ "https://crm.example.test": { ok: true } });
    const customy = await createCustomy({ issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret", fetch: fetchImpl });

    expect(customy.platform.products.crm?.baseUrl).toBe("https://crm.example.test");
    const crm = customy.product("crm");
    expect(customy.product("crm")).toBe(crm);
    await crm.get("/v1/contacts");
    await crm.get("/v1/contacts");

    const request = calls.filter((call) => call.url.startsWith("https://crm.example.test/v1/contacts"));
    expect(request).toHaveLength(2);
    expect(authorization(request[0])).toBe("Bearer token-for-customy-crm");
    expect(tokenRequests(calls)).toHaveLength(1);
    expect(authorization(tokenRequests(calls)[0])).toBe(`Basic ${btoa("app_1:s3cret")}`);
  });

  it("entrega Billing apuntando a su URL con el token de su audiencia", async () => {
    const { calls, fetchImpl } = platform({ "https://billing.example.test/v1/apps/usage": { accepted: 1, events: [] } });
    const customy = await createCustomy({ issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret", fetch: fetchImpl });

    await customy.billing.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: "run-1" }]);
    const usage = calls.find((call) => call.url === "https://billing.example.test/v1/apps/usage");
    expect(authorization(usage)).toBe("Bearer token-for-customy-billing");
    expect(customy.billing).toBe(customy.billing);
  });

  it("entrega Send con el token de su audiencia", async () => {
    const { calls, fetchImpl } = platform({ "https://send.example.test": { id: "em_1" } });
    const customy = await createCustomy({ issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret", fetch: fetchImpl });

    await customy.send.emails.send({ from: "Acme <hola@acme.test>", to: "ana@acme.test", subject: "Hola", html: "<p>Hola</p>" });
    const email = calls.find((call) => call.url.startsWith("https://send.example.test/"));
    expect(authorization(email)).toBe("Bearer token-for-customy-send");
  });

  it("pasa los scopes configurados por producto", async () => {
    const { calls, fetchImpl } = platform();
    const customy = await createCustomy({
      issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret", fetch: fetchImpl,
      scopes: { billing: ["billing:usage:report"] },
    });
    await customy.token("billing")();
    expect(new URLSearchParams(String(tokenRequests(calls)[0]?.init.body)).get("scope")).toBe("billing:usage:report");
  });

  it("construye Links y Data sin red hasta el primer uso", async () => {
    const { calls, fetchImpl } = platform();
    const customy = await createCustomy({ issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret", fetch: fetchImpl });
    expect(customy.links).toBe(customy.links);
    expect(customy.data).toBe(customy.data);
    expect(tokenRequests(calls)).toHaveLength(0);
  });

  it("falla con un producto que el entorno no publica", async () => {
    const { fetchImpl } = platform();
    const customy = await createCustomy({ issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret", fetch: fetchImpl });
    expect(() => customy.product("voice")).toThrow("SDK_PRODUCT_NOT_DISCOVERED");
    expect(() => customy.token("voice")).toThrow("CUSTOMY_PRODUCT_NOT_DISCOVERED");
  });

  it("exige las credenciales de la app", async () => {
    await expect(createCustomy({ issuer: ISSUER, clientId: "", clientSecret: "x" })).rejects.toThrow("CUSTOMY_MACHINE_CREDENTIALS_REQUIRED");
  });

  it("un fallo del proveedor de tokens es un error tipado del SDK", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.well-known/customy-configuration")) return Response.json(discovery);
      if (url.endsWith("/oauth/token")) return Response.json({ error: "invalid_client" }, { status: 401 });
      return Response.json({});
    }) as typeof fetch;
    const customy = await createCustomy({ issuer: ISSUER, clientId: "app_1", clientSecret: "bad", fetch: fetchImpl });
    await expect(customy.product("crm").get("/v1/contacts")).rejects.toMatchObject({ status: 401, code: "SDK_ACCESS_TOKEN_UNAVAILABLE" });
  });
});
