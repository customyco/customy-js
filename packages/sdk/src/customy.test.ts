import { CustomySdkError } from "@customyai/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createCustomy } from "./index";

const ISSUER = "https://access.fixture.invalid";
const discovery = {
    issuer: ISSUER,
    token_endpoint: `${ISSUER}/oauth/token`,
    products: {
        access: { base_url: "https://access.fixture.invalid", audience: "customy-access" },
        send: { base_url: "https://send.fixture.invalid", audience: "customy-send" },
        links: { base_url: "https://links.fixture.invalid", audience: "customy-links" },
        data: { base_url: "https://data.fixture.invalid", audience: "customy-data" },
        billing: { base_url: "https://billing.fixture.invalid", audience: "customy-billing" },
        crm: { base_url: "https://crm.fixture.invalid/", audience: "customy-crm" },
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
            return Response.json({ access_token: `token-for-${audience}`, token_type: "Bearer", expires_in: 300 });
        }
        const match = Object.entries(responses).find(([prefix]) => url.startsWith(prefix));
        return Response.json(match?.[1] ?? {});
    }) as typeof fetch;
    return { calls, fetchImpl };
}

const authorization = (call: Call | undefined) => new Headers(call?.init.headers).get("authorization");
const tokenRequests = (calls: Call[]) => calls.filter((call) => call.url.endsWith("/oauth/token"));
const credentials = { issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret" };

describe("createCustomy: one connected-app entry (discovery, tokens, access, permissions)", () => {
    const application = { organizationId: "org_1", environmentId: "env_1", applicationId: "app_1", applicationKey: "bonu" };
    const roles = { roles: [{ key: "bonu.admin", name: "Admin", description: null, permissions: ["bonu.funds.manage"] }] };
    const assignments = { assignments: [{ userId: "usr_1", roleKey: "bonu.admin", source: "application", assignedAt: 1, expiresAt: null }] };

    it("discoverApplication takes the environment from the machine client: no environment id in configuration", async () => {
        const { calls, fetchImpl } = platform({
            [`${ISSUER}/api/v1/application`]: application,
            [`${ISSUER}/api/v1/env/env_1/app-roles`]: roles,
            [`${ISSUER}/api/v1/env/env_1/app-role-assignments`]: assignments,
        });
        const customy = await createCustomy<{ roles: "bonu.admin"; permissions: "bonu.funds.manage" | "bonu.funds.read" }>({ ...credentials, fetch: fetchImpl, discoverApplication: true });
        expect(customy.application).toMatchObject({ organizationId: "org_1", environmentId: "env_1", applicationKey: "bonu" });
        expect(authorization(calls.find((call) => call.url.startsWith(`${ISSUER}/api/v1/application`)))).toBe("Bearer token-for-customy-access");
        expect(await customy.permissions.can("usr_1", "bonu.funds.manage")).toBe(true);
        expect(await customy.permissions.can("usr_1", "bonu.funds.read")).toBe(false);
        expect(await customy.permissions.hasRole("usr_1", "bonu.admin")).toBe(true);
        await customy.permissions.require("usr_1", "bonu.funds.manage");
        await expect(customy.permissions.require("usr_1", "bonu.funds.read")).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
        expect(calls.filter((call) => call.url.includes("/app-roles"))).toHaveLength(1); // the directory cached the answer
        expectTypeOf(customy.permissions.can).parameter(1).toEqualTypeOf<"bonu.funds.manage" | "bonu.funds.read">();
    });

    it("without discoverApplication there is no application and an explicit environmentId still works", async () => {
        const { calls, fetchImpl } = platform({ [`${ISSUER}/api/v1/env/env_9/app-roles`]: roles, [`${ISSUER}/api/v1/env/env_9/app-role-assignments`]: assignments });
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, environmentId: "env_9" });
        expect(customy.application).toBeNull();
        expect(calls.some((call) => call.url.includes("/api/v1/application"))).toBe(false);
        expect(await customy.permissions.hasRole("usr_1", "bonu.admin")).toBe(true);
    });

    it("a failed discovery rejects createCustomy with the Access error", async () => {
        const fetchImpl = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/.well-known/customy-configuration")) return Response.json(discovery);
            if (url.endsWith("/oauth/token")) return Response.json({ access_token: "t", token_type: "Bearer", expires_in: 300 });
            return Response.json({ error: "APPLICATION_NOT_FOUND" }, { status: 404 });
        }) as typeof fetch;
        await expect(createCustomy({ ...credentials, fetch: fetchImpl, discoverApplication: true, retry: false })).rejects.toBeInstanceOf(CustomySdkError);
    });
});

describe("createCustomy: roles and permissions typed from the manifest", () => {
    it("customy.access carries the Role and Permission unions", async () => {
        const { fetchImpl } = platform();
        type App = { capabilities: "ai.coach"; roles: "app.admin" | "app.viewer"; permissions: "app.read" | "app.manage" };
        const customy = await createCustomy<App>({ ...credentials, fetch: fetchImpl });
        expectTypeOf(customy.access.permissions.effective).returns.resolves.toMatchTypeOf<{ roles: Array<"app.admin" | "app.viewer">; permissions: Array<"app.read" | "app.manage"> }>();
        expectTypeOf(customy.access.capabilities.check).parameter(0).toEqualTypeOf<"ai.coach">();
    });
});

describe("createCustomy", () => {
    it("descubre la plataforma y pide un token por audiencia, una sola vez", async () => {
        const { calls, fetchImpl } = platform({ "https://crm.fixture.invalid": { ok: true } });
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        expect(customy.platform.products.crm?.baseUrl).toBe("https://crm.fixture.invalid");
        const crm = customy.product("crm");
        expect(customy.product("crm")).toBe(crm);
        await crm.get("/v1/contacts");
        await crm.get("/v1/contacts");
        const requests = calls.filter((call) => call.url.startsWith("https://crm.fixture.invalid/v1/contacts"));
        expect(requests).toHaveLength(2);
        expect(authorization(requests[0])).toBe("Bearer token-for-customy-crm");
        expect(tokenRequests(calls)).toHaveLength(1);
        expect(authorization(tokenRequests(calls)[0])).toBe(`Basic ${btoa("app_1:s3cret")}`);
    });

    it("compone Send, Billing, Data, Links y Access con la URL y la audiencia de cada uno", async () => {
        const { calls, fetchImpl } = platform({
            "https://send.fixture.invalid": { id: "eml_1" },
            "https://billing.fixture.invalid": { accepted: 1, events: [] },
            "https://data.fixture.invalid": { accepted: true, deduplicated: false, eventId: "evt_1" },
            "https://links.fixture.invalid": { items: [], nextCursor: null },
            "https://access.fixture.invalid/api/v1/me": { entitlements: [] },
        });
        const customy = await createCustomy<{ events: { "lesson.completed": { minutes: number } }; meters: "coach.runs" }>({ ...credentials, fetch: fetchImpl });
        await customy.send.emails.send({ templateId: "welcome", to: "ana@acme.test", variables: { name: "Ana" } });
        await customy.billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: "run-1" }]);
        await customy.data.track("lesson.completed", { minutes: 12 }, { userId: "u1" });
        await customy.links.links.list();
        const bearer = (prefix: string) => authorization(calls.find((call) => call.url.startsWith(prefix)));
        expect(bearer("https://send.fixture.invalid/")).toBe("Bearer token-for-customy-send");
        expect(bearer("https://billing.fixture.invalid/v1/apps/usage")).toBe("Bearer token-for-customy-billing");
        expect(bearer("https://data.fixture.invalid/")).toBe("Bearer token-for-customy-data");
        expect(bearer("https://links.fixture.invalid/")).toBe("Bearer token-for-customy-links");
        expect(customy.send).toBe(customy.send);
        expect(customy.access).toBe(customy.access);
        // Data pide su scope mínimo si la app no dice otro.
        const dataToken = tokenRequests(calls).find((call) => new URLSearchParams(String(call.init.body)).get("audience") === "customy-data");
        expect(new URLSearchParams(String(dataToken?.init.body)).get("scope")).toBe("data:collect");
    });

    it("pasa los scopes configurados por producto", async () => {
        const { calls, fetchImpl } = platform({ "https://billing.fixture.invalid": { accepted: 1, events: [] } });
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, scopes: { billing: ["billing:usage:report"], crm: ["crm:read"] } });
        await customy.token("crm")();
        await customy.billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: "run-2" }]);
        const scopes = tokenRequests(calls).map((call) => new URLSearchParams(String(call.init.body)).get("scope"));
        expect(scopes).toEqual(["crm:read", "billing:usage:report"]);
    });

    it("no toca la red hasta el primer uso y reutiliza el discovery que se le pasa", async () => {
        const first = platform();
        const customy = await createCustomy({ ...credentials, fetch: first.fetchImpl });
        expect(customy.links).toBe(customy.links);
        expect(customy.data).toBe(customy.data);
        expect(tokenRequests(first.calls)).toHaveLength(0);
        const second = platform();
        await createCustomy({ ...credentials, fetch: second.fetchImpl, platform: customy.platform });
        expect(second.calls).toHaveLength(0);
    });

    it("falla con un producto que el entorno no publica y exige las credenciales", async () => {
        const { fetchImpl } = platform();
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        expect(() => customy.product("voice")).toThrow(expect.objectContaining({ code: "SDK_PRODUCT_NOT_DISCOVERED" }));
        expect(() => customy.token("voice")).toThrow(expect.objectContaining({ code: "SDK_PRODUCT_NOT_DISCOVERED" }));
        await expect(createCustomy({ ...credentials, clientId: "" })).rejects.toBeInstanceOf(CustomySdkError);
    });

    it("un fallo del proveedor de tokens es un error tipado del SDK", async () => {
        const fetchImpl = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/.well-known/customy-configuration")) return Response.json(discovery);
            if (url.endsWith("/oauth/token")) return Response.json({ error: "invalid_client" }, { status: 401 });
            return Response.json({});
        }) as typeof fetch;
        const customy = await createCustomy({ ...credentials, clientSecret: "bad", fetch: fetchImpl, retry: false });
        await expect(customy.product("crm").get("/v1/contacts")).rejects.toMatchObject({ status: 401, code: "SDK_MACHINE_TOKEN_INVALID_CLIENT" });
    });
});

describe("scopes: manifiesto y Access perezoso", () => {
    const scopeOf = (call: Call) => new URLSearchParams(String(call.init.body)).get("scope");
    const audienceOf = (call: Call) => new URLSearchParams(String(call.init.body)).get("audience");

    it("sin scopes, access.users.contact pide users:contact:read (no falla con el mínimo)", async () => {
        const { calls, fetchImpl } = platform({
            "https://access.fixture.invalid/api/v1/users/": { userId: "u1", email: "ana@acme.test", emailVerified: true, name: null, locale: null },
            "https://access.fixture.invalid/api/v1/me": { entitlements: {} },
        });
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, environmentId: "env_fixture" });
        await customy.access.users.contact("u1");
        await customy.access.me();
        expect(tokenRequests(calls).map(scopeOf)).toEqual(["users:contact:read", "capabilities:read"]);
    });

    it("el manifiesto da los scopes de cada producto (por audiencia o clave) y `scopes` manda sobre él", async () => {
        const { calls, fetchImpl } = platform({ "https://send.fixture.invalid": { id: "eml_1" }, "https://billing.fixture.invalid": { accepted: 1, events: [] } });
        const manifest = {
            products: [
                { product: "customy-send", scopes: ["send:emails:send", "send:templates:read"] },
                { product: "billing", scopes: ["billing:usage:report"] },
                { product: "customy-unknown", scopes: ["x:y"] },
            ],
        };
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, manifest, scopes: { billing: ["billing:usage:report", "billing:read"] } });
        await customy.send.emails.send({ templateId: "welcome", to: "ana@acme.test" });
        await customy.billing.usage.report([{ meter: "m", quantity: 1, idempotencyKey: "k-1" }]);
        expect(tokenRequests(calls).map((call) => [audienceOf(call), scopeOf(call)])).toEqual([
            ["customy-send", "send:emails:send send:templates:read"],
            ["customy-billing", "billing:usage:report billing:read"],
        ]);
    });

    it("scopesFromManifest ignora lo que el discovery no publica", async () => {
        const { scopesFromManifest } = await import("./index");
        const { fetchImpl } = platform();
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        expect(scopesFromManifest({ products: [{ product: "customy-crm", scopes: ["crm:read"] }, { product: "voice", scopes: ["v:1"] }, { product: "customy-send", scopes: [] }] }, customy.platform))
            .toEqual({ crm: ["crm:read"] });
        expect(scopesFromManifest(undefined, customy.platform)).toEqual({});
    });
});
