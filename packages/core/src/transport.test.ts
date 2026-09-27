import { describe, expect, it } from "vitest";
import { CustomySdkError } from "./errors";
import { parseRetryAfter } from "./retry";
import { createTransport, type AccessTokenProvider } from "./transport";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function scripted(responses: Array<Response | Error | (() => Response)>) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: typeof init?.body === "string" ? init.body : undefined });
        const next = responses.shift();
        if (!next) throw new Error("sin respuesta preparada");
        if (next instanceof Error) throw next;
        return typeof next === "function" ? next() : next;
    }) as typeof globalThis.fetch;
    return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function transport(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) {
    const sleeps: number[] = [];
    const client = createTransport({
        baseUrl: "https://api.fixture.invalid",
        service: "fixture",
        fetch,
        sleep: async (ms) => { sleeps.push(ms); },
        random: () => 0.5,
        now: () => Date.UTC(2026, 8, 27, 12, 0, 0),
        ...extra,
    });
    return { client, sleeps };
}

describe("parseRetryAfter", () => {
    it("entiende segundos y fecha HTTP, y nunca devuelve negativo", () => {
        const now = Date.UTC(2026, 8, 27, 12, 0, 0);
        expect(parseRetryAfter("3", now)).toBe(3000);
        expect(parseRetryAfter("0.5", now)).toBe(500);
        expect(parseRetryAfter(new Date(now + 7000).toUTCString(), now)).toBe(7000);
        expect(parseRetryAfter(new Date(now - 7000).toUTCString(), now)).toBe(0);
        expect(parseRetryAfter("pronto", now)).toBeNull();
        expect(parseRetryAfter(null, now)).toBeNull();
    });
});

describe("createTransport", () => {
    it("rechaza bases no https y rutas que escapan", () => {
        const { fetch } = scripted([]);
        expect(() => createTransport({ baseUrl: "http://api.fixture.invalid", fetch })).toThrow(CustomySdkError);
        expect(() => createTransport({ baseUrl: "https://u:p@api.fixture.invalid", fetch })).toThrow(/base URL/);
        expect(createTransport({ baseUrl: "http://127.0.0.1:4000/", fetch, allowLoopbackHttp: true }).baseUrl).toBe("http://127.0.0.1:4000");
        const { client } = transport(fetch);
        return expect(client.get("/v1/../admin")).rejects.toMatchObject({ code: "SDK_PATH_INVALID" });
    });

    it("envía JSON, query y Bearer del proveedor", async () => {
        const { fetch, calls } = scripted([json(201, { id: "x_1" })]);
        const { client } = transport(fetch, { accessToken: async () => "tok_1" });
        await expect(client.post("/v1/things", { a: 1 }, { query: { tag: ["a", "b"], skip: undefined } })).resolves.toEqual({ id: "x_1" });
        expect(calls[0]).toMatchObject({ url: "https://api.fixture.invalid/v1/things?tag=a&tag=b", method: "POST", body: "{\"a\":1}" });
        expect(calls[0]!.headers).toMatchObject({ authorization: "Bearer tok_1", "content-type": "application/json", accept: "application/json" });
    });

    it("reintenta un GET ante 503 respetando Retry-After y ante un error de red con backoff", async () => {
        const { fetch, calls } = scripted([json(503, { error: { code: "busy" } }, { "retry-after": "2" }), new TypeError("fetch failed"), json(200, { ok: true })]);
        const { client, sleeps } = transport(fetch);
        const response = await client.request("GET", "/v1/things");
        expect(response).toMatchObject({ data: { ok: true }, attempts: 3 });
        expect(calls).toHaveLength(3);
        // 2 s pedidos por el servidor; luego backoff con jitter (0.5 × 300 × 2¹).
        expect(sleeps).toEqual([2000, 300]);
    });

    it("se rinde tras maxRetries y devuelve el error tipado del sobre de Customy", async () => {
        const { fetch, calls } = scripted([
            json(429, { error: { code: "rate_limited", message: "slow down", requestId: "req_1" } }, { "retry-after": "1" }),
            json(429, { error: { code: "rate_limited" } }, { "retry-after": "1" }),
            json(429, { error: { code: "rate_limited", requestId: "req_3" } }, { "retry-after": "1" }),
        ]);
        const { client } = transport(fetch);
        const error = await client.get("/v1/things").catch((caught) => caught);
        expect(error).toBeInstanceOf(CustomySdkError);
        expect(error).toMatchObject({ code: "rate_limited", status: 429, service: "fixture", requestId: "req_3", retryAfterMs: 1000 });
        expect(calls).toHaveLength(3);
    });

    it("no espera un Retry-After mayor que el tope: devuelve el error con la espera pedida", async () => {
        const { fetch, calls } = scripted([json(503, {}, { "retry-after": "3600" })]);
        const { client, sleeps } = transport(fetch);
        await expect(client.get("/v1/things")).rejects.toMatchObject({ status: 503, code: "HTTP_503", retryAfterMs: 3_600_000 });
        expect(calls).toHaveLength(1);
        expect(sleeps).toEqual([]);
    });

    it("no reintenta errores de cliente", async () => {
        const { fetch, calls } = scripted([json(422, { code: "invalid_input", message: "bad" })]);
        const { client } = transport(fetch);
        await expect(client.get("/v1/things")).rejects.toMatchObject({ status: 422, code: "invalid_input", message: "bad" });
        expect(calls).toHaveLength(1);
    });

    it("un POST sin clave de idempotencia no se repite", async () => {
        const { fetch, calls } = scripted([json(503, {})]);
        const { client } = transport(fetch);
        await expect(client.post("/v1/things", { a: 1 })).rejects.toMatchObject({ status: 503 });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.headers["idempotency-key"]).toBeUndefined();
    });

    it("un POST con idempotencyKey se repite con la MISMA clave en cada intento", async () => {
        const { fetch, calls } = scripted([new TypeError("reset"), json(502, {}), json(200, { id: "x_1" })]);
        const { client } = transport(fetch);
        await expect(client.post("/v1/things", { a: 1 }, { idempotencyKey: "op-42" })).resolves.toEqual({ id: "x_1" });
        expect(calls.map((call) => call.headers["idempotency-key"])).toEqual(["op-42", "op-42", "op-42"]);
    });

    it("genera la clave con idempotencyKey: true o autoIdempotencyKey, y la mantiene entre intentos", async () => {
        const { fetch, calls } = scripted([json(503, {}), json(200, {}), json(200, {})]);
        const { client } = transport(fetch, { autoIdempotencyKey: true });
        await client.post("/v1/things", {});
        const [first, second] = calls.map((call) => call.headers["idempotency-key"]);
        expect(first).toMatch(/^[0-9a-f-]{36}$/);
        expect(second).toBe(first);
        await client.post("/v1/things", {});
        expect(calls[2]!.headers["idempotency-key"]).not.toBe(first);
        await expect(client.post("/v1/things", {}, { idempotencyKey: "tiene espacios" })).rejects.toMatchObject({ code: "SDK_IDEMPOTENCY_KEY_INVALID" });
    });

    it("ante un 401 invalida el proveedor y repite una sola vez con un token nuevo", async () => {
        const { fetch, calls } = scripted([json(401, { error: "invalid_token" }), json(200, { ok: true }), json(401, {}), json(401, {})]);
        let issued = 0;
        const provider: AccessTokenProvider = Object.assign(async () => `tok_${issued}`, { invalidate: () => { issued += 1; } });
        const { client } = transport(fetch, { accessToken: provider });
        await expect(client.get("/v1/things")).resolves.toEqual({ ok: true });
        expect(calls.map((call) => call.headers.authorization)).toEqual(["Bearer tok_0", "Bearer tok_1"]);
        await expect(client.get("/v1/things")).rejects.toMatchObject({ status: 401 });
        expect(calls).toHaveLength(4);
    });

    it("corta por tiempo por intento y reintenta si es seguro", async () => {
        let attempt = 0;
        const fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
            attempt += 1;
            if (attempt === 1) {
                return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
            }
            return Promise.resolve(json(200, { ok: true }));
        }) as typeof globalThis.fetch;
        const { client } = transport(fetch, { timeoutMs: 5 });
        await expect(client.get("/v1/slow")).resolves.toEqual({ ok: true });
        expect(attempt).toBe(2);
    });

    it("respeta la cancelación del llamante sin reintentar", async () => {
        const controller = new AbortController();
        controller.abort();
        const { fetch, calls } = scripted([json(200, {})]);
        const { client } = transport(fetch);
        await expect(client.get("/v1/things", { signal: controller.signal })).rejects.toMatchObject({ code: "SDK_ABORTED" });
        expect(calls).toHaveLength(0);
    });

    it("limita el tamaño de la respuesta", async () => {
        const { fetch } = scripted([new Response("x".repeat(2048), { status: 200 })]);
        const { client } = transport(fetch);
        await expect(client.get("/v1/big", { maxBytes: 1024 })).rejects.toMatchObject({ code: "SDK_RESPONSE_TOO_LARGE" });
    });

    it("un fallo del proveedor de tokens sale como SDK_ACCESS_TOKEN_UNAVAILABLE sin llamar al servicio", async () => {
        const { fetch, calls } = scripted([json(200, {})]);
        const { client } = transport(fetch, { accessToken: async () => { throw new Error("down"); } });
        await expect(client.get("/v1/things")).rejects.toMatchObject({ code: "SDK_ACCESS_TOKEN_UNAVAILABLE", status: 401 });
        expect(calls).toHaveLength(0);
    });
});

describe("opciones por llamada", () => {
    it("callOptions toma solo signal y timeoutMs, y el plazo por llamada manda sobre el del cliente", async () => {
        const { callOptions } = await import("./transport");
        const controller = new AbortController();
        expect(callOptions(undefined)).toEqual({});
        expect(callOptions({ timeoutMs: 5, ...({ environmentId: "x" } as object) })).toEqual({ timeoutMs: 5 });
        expect(callOptions({ signal: controller.signal })).toEqual({ signal: controller.signal });
        const fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof globalThis.fetch;
        const client = createTransport({ baseUrl: "https://api.fixture.invalid", fetch, timeoutMs: 60_000, retry: false });
        const started = Date.now();
        await expect(client.get("/v1/slow", callOptions({ timeoutMs: 5 }))).rejects.toMatchObject({ code: "SDK_TIMEOUT", status: 408 });
        expect(Date.now() - started).toBeLessThan(5_000);
    });
});

describe("http hacia hosts privados", () => {
    it("isPrivateHost: RFC 1918, loopback, ULA, *.internal y una etiqueta; nunca públicos ni link-local", async () => {
        const { isPrivateHost } = await import("./url");
        for (const host of ["10.0.0.23", "172.16.0.1", "172.31.255.255", "192.168.1.10", "127.0.0.1", "localhost", "[::1]", "[fd12:3456::1]", "customy-access", "api.internal"]) {
            expect(isPrivateHost(host), host).toBe(true);
        }
        for (const host of ["8.8.8.8", "172.32.0.1", "169.254.169.254", "access.example.com", "metadata.google.internal", "[2001:db8::1]", "[fe80::1]", "10.0.0.256", ""]) {
            expect(isPrivateHost(host), host).toBe(false);
        }
    });

    it("allowPrivateHttp abre http solo a hosts privados; sin él, https o loopback", () => {
        const make = (baseUrl: string, extra: object = {}) => () => createTransport({ baseUrl, fetch: (async () => new Response("{}")) as typeof fetch, ...extra });
        expect(make("http://customy-access:4001", { allowPrivateHttp: true })).not.toThrow();
        expect(make("http://10.0.0.5", { allowPrivateHttp: true })).not.toThrow();
        expect(make("http://access.example.com", { allowPrivateHttp: true })).toThrow(expect.objectContaining({ code: "SDK_BASE_URL_INVALID" }));
        expect(make("http://customy-access:4001")).toThrow(expect.objectContaining({ code: "SDK_BASE_URL_INVALID" }));
        expect(make("http://customy-access:4001", { allowLoopbackHttp: true })).toThrow(expect.objectContaining({ code: "SDK_BASE_URL_INVALID" }));
    });
});

describe("respuesta 2xx que no es JSON", () => {
    const client = (response: () => Response) => createTransport({ baseUrl: "https://api.fixture.invalid", fetch: (async () => response()) as typeof fetch, retry: false });

    it("es un error tipado SDK_RESPONSE_INVALID, sin reintento", async () => {
        let calls = 0;
        const transport = createTransport({ baseUrl: "https://api.fixture.invalid", fetch: (async () => { calls += 1; return new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }); }) as typeof fetch });
        await expect(transport.get("/v1/things")).rejects.toMatchObject({ code: "SDK_RESPONSE_INVALID", status: 200, body: "<html>login</html>" });
        expect(calls).toBe(1);
    });

    it("vacío es null; JSON sin content-type se lee; responseType text devuelve el texto", async () => {
        expect(await client(() => new Response("", { status: 200 })).get("/v1/x")).toBeNull();
        expect(await client(() => new Response("{\"a\":1}", { status: 200 })).get("/v1/x")).toEqual({ a: 1 });
        expect(await client(() => new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } })).get("/v1/x", { responseType: "text" })).toBe("a,b\n1,2");
        expect(await client(() => new Response("{\"a\":1}", { status: 200 })).get("/v1/x", { responseType: "text" })).toBe("{\"a\":1}");
    });

    it("un error no JSON sigue siendo HTTP_<estado>", async () => {
        await expect(client(() => new Response("Bad gateway", { status: 502 })).get("/v1/x")).rejects.toMatchObject({ code: "HTTP_502", status: 502 });
    });
});
