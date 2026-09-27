import { describe, expect, it, vi } from "vitest";
import { authFailureFromResponse, createCustomyClient } from "./index";

function client(respond: () => Response | Promise<Response>) {
    const calls: RequestInit[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push(init);
        return respond();
    }) as unknown as typeof globalThis.fetch;
    return { calls, client: createCustomyClient({ baseUrl: "https://app.fixture.invalid", organizationSlug: "org-fixture", fetch }) };
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("errores del login con estado y código", () => {
    it("credenciales malas: 401 con el código de Access y el texto de siempre", async () => {
        const { client: c } = client(() => json({ error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } }, 401));
        expect(await c.signInWithEmail("ana@example.com", "bad")).toEqual({ error: "Invalid email or password", status: 401, code: "INVALID_EMAIL_OR_PASSWORD", retryable: false });
    });

    it("lee también el formato plano y el de texto libre", async () => {
        const flat = client(() => json({ code: "USER_ALREADY_EXISTS", message: "User already exists" }, 422));
        expect(await flat.client.signUp("Ana", "ana@example.com", "pw")).toMatchObject({ error: "User already exists", status: 422, code: "USER_ALREADY_EXISTS" });
        expect(authFailureFromResponse(400, { error: "Something odd happened" })).toEqual({ error: "Something odd happened", status: 400, code: "HTTP_400", retryable: false });
        expect(authFailureFromResponse(401, { code: "INVALID_TOKEN" }).error).toBe("INVALID_TOKEN");
    });

    it("servicio caído, límite, plazo y red se distinguen como reintentables", async () => {
        const down = client(() => json({ error: { code: "BAD_GATEWAY", message: "Customy Access is temporarily unavailable" } }, 502));
        expect(await down.client.signInWithEmail("a@example.com", "pw")).toMatchObject({ status: 502, code: "BAD_GATEWAY", retryable: true });
        const limited = client(() => new Response("", { status: 429 }));
        expect(await limited.client.signInWithEmail("a@example.com", "pw")).toMatchObject({ status: 429, code: "HTTP_429", retryable: true, error: "HTTP 429" });
        const timeout = client(() => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); });
        expect(await timeout.client.signInWithEmail("a@example.com", "pw")).toEqual({ error: "Request timed out. Try again.", status: 408, code: "SDK_TIMEOUT", retryable: true });
        const offline = client(() => { throw new TypeError("Failed to fetch"); });
        expect(await offline.client.signInWithMagicLink("a@example.com")).toEqual({ error: "Failed to fetch", status: 0, code: "SDK_NETWORK_ERROR", retryable: true });
    });

    it("el éxito no cambia", async () => {
        const ok = client(() => json({ url: "/home", redirect: true }, 200));
        expect(await ok.client.signInWithEmail("a@example.com", "pw")).toEqual({ url: "/home", redirect: true });
    });
});

describe("cabecera de organización", () => {
    it("envía el slug en x-organization-slug y en la heredada x-organization-id", async () => {
        const { client: c, calls } = client(() => json(null, 200));
        await c.getSession();
        const headers = new Headers(calls[0]!.headers);
        expect(headers.get("x-organization-slug")).toBe("org-fixture");
        expect(headers.get("x-organization-id")).toBe("org-fixture");
        expect(c.authHeaders).toMatchObject({ "x-organization-slug": "org-fixture", "x-organization-id": "org-fixture" });
    });
});

describe("enlace mágico", () => {
    it("se pide en /api/auth/sign-in/magic-link, la ruta de Access", async () => {
        const urls: string[] = [];
        const fetch = vi.fn(async (input: RequestInfo | URL) => { urls.push(String(input)); return json({ status: true }, 200); }) as unknown as typeof globalThis.fetch;
        const c = createCustomyClient({ baseUrl: "https://app.fixture.invalid", fetch });
        expect(await c.signInWithMagicLink("ana@example.com", "/welcome")).toEqual({ success: true });
        expect(urls).toEqual(["https://app.fixture.invalid/api/auth/sign-in/magic-link"]);
    });
});
