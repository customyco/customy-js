import { createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { createStorage, CustomyStorageError, STORAGE_AUDIENCE, STORAGE_DEFAULT_BASE_URL, STORAGE_MAX_UPLOAD_BYTES, STORAGE_SCOPES } from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string; raw?: unknown };
type Reply = Response | Error | ((call: Call) => Response);

const ISSUER = "https://access.fixture.invalid";
const BASE = "https://storage.fixture.invalid";
const PART = "https://r2.fixture.invalid/bucket/obj";

function scripted(replies: Reply[]) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: typeof init?.body === "string" ? init.body : undefined,
      raw: init?.body,
    };
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error("sin respuesta preparada");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const token = (value: string) => json(200, { access_token: value, token_type: "Bearer", expires_in: 300 });
const etag = (value: string) => new Response(null, { status: 200, headers: { etag: value } });
const fast = { baseDelayMs: 1, maxDelayMs: 1 };
// SHA-256 conocidos (calculados fuera del SDK).
const SHA: Record<string, string> = {
  "0123456789": "84d89877f0d4041efb6bf91a16f0248f2fd573e6af05c19f96bedb9f882f7882",
  "\u0001\u0002\u0003": "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
};
const sha = (data: Uint8Array) => SHA[new TextDecoder().decode(data)]!;
const item = (overrides: Record<string, unknown> = {}) => ({
  id: "901", name: "recibo.jpg", mimeType: "image/jpeg", sizeBytes: 10, scanStatus: "pending",
  createdAt: "2026-09-28T10:00:00.000Z", metadata: { expenseId: "exp_1", other: 3 }, ownerRef: "app:app_bonu", ...overrides,
});

describe("@customyai/storage", () => {
  it("expone el contrato y exige una credencial", () => {
    expect(STORAGE_AUDIENCE).toBe("customy-storage");
    expect(STORAGE_DEFAULT_BASE_URL).toBe("https://storage-api.customy.ai");
    expect(STORAGE_SCOPES).toEqual(["storage:files:read", "storage:files:write", "storage:files:delete"]);
    expect(() => createStorage({ baseUrl: BASE })).toThrow(expect.objectContaining({ code: "SDK_CREDENTIALS_REQUIRED" }));
  });

  it("con machineTokens pide un token de audiencia customy-storage con los scopes indicados", async () => {
    const { fetch, calls } = scripted([token("tok-1"), json(200, item())]);
    const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch });
    const storage = createStorage({ baseUrl: BASE, machineTokens, scopes: ["storage:files:read"], fetch });
    const file = await storage.files.get("901");
    const tokenRequest = new URLSearchParams(calls[0]!.body);
    expect(tokenRequest.get("audience")).toBe("customy-storage");
    expect(tokenRequest.get("scope")).toBe("storage:files:read");
    expect(calls[1]!.url).toBe(`${BASE}/v2/items/901`);
    expect(calls[1]!.headers.authorization).toBe("Bearer tok-1");
    expect(file).toEqual({
      id: "901", name: "recibo.jpg", mimeType: "image/jpeg", sizeBytes: 10, checksumSha256: null,
      scanStatus: "pending", createdAt: "2026-09-28T10:00:00.000Z", metadata: { expenseId: "exp_1" },
    });
  });

  it("upload: calcula el SHA-256, sube las partes firmadas sin la credencial y completa en su carpeta", async () => {
    const data = new TextEncoder().encode("0123456789");
    const { fetch, calls } = scripted([
      json(200, { uploadSessionId: "77", status: "initiated", partSizeBytes: 4, parentId: "55" }),
      json(200, { uploadSessionId: "77", parts: [1, 2, 3].map((partNumber) => ({ partNumber, url: `${PART}?part=${partNumber}` })) }),
      etag('"e1"'), etag('"e2"'), etag('"e3"'),
      json(200, item({ id: "902" })),
    ]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch });
    const file = await storage.files.upload(
      { data, fileName: "recibo.jpg", mimeType: "image/jpeg", metadata: { expenseId: "exp_1" }, folder: "recibos/2026" },
      { idempotencyKey: "expense-exp_1" },
    );

    const create = JSON.parse(calls[0]!.body!);
    expect(calls[0]!.url).toBe(`${BASE}/v2/uploads`);
    expect(create).toEqual({
      fileName: "recibo.jpg", mimeType: "image/jpeg", sizeBytes: 10, checksumSha256: sha(data),
      idempotencyKey: "expense-exp_1", metadata: { expenseId: "exp_1" }, folder: "recibos/2026",
    });
    expect(calls[0]!.headers["idempotency-key"]).toBe("expense-exp_1:session");
    expect(JSON.parse(calls[1]!.body!)).toEqual({ partNumbers: [1, 2, 3] });
    expect(calls[1]!.url).toBe(`${BASE}/v2/uploads/77/parts`);

    const puts = calls.slice(2, 5);
    expect(puts.map((call) => call.method)).toEqual(["PUT", "PUT", "PUT"]);
    expect(puts.map((call) => new TextDecoder().decode(call.raw as Uint8Array))).toEqual(["0123", "4567", "89"]);
    for (const put of puts) {
      expect(put.headers.authorization).toBeUndefined();
      expect(put.headers["content-type"]).toBe("application/octet-stream");
    }

    expect(calls[5]!.url).toBe(`${BASE}/v2/uploads/77/complete`);
    expect(JSON.parse(calls[5]!.body!)).toEqual({
      parts: [{ partNumber: 1, etag: '"e1"' }, { partNumber: 2, etag: '"e2"' }, { partNumber: 3, etag: '"e3"' }],
      checksumSha256: sha(data), parentId: "55", metadata: { expenseId: "exp_1" },
    });
    expect(file).toMatchObject({ id: "902", checksumSha256: sha(data), scanStatus: "pending" });
  });

  it("upload: bytes que Storage ya tiene (o una clave repetida) devuelven el archivo sin subir nada", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const { fetch, calls } = scripted([
      json(200, { uploadSessionId: "78", status: "completed", itemId: "903", deduplicated: true, parentId: "55" }),
      json(200, item({ id: "903", scanStatus: "clean" })),
    ]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch });
    const file = await storage.files.upload({ data, fileName: "a.bin", mimeType: "application/octet-stream" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([`POST ${BASE}/v2/uploads`, `GET ${BASE}/v2/items/903`]);
    expect(file).toMatchObject({ id: "903", scanStatus: "clean", checksumSha256: sha(data) });
    expect(JSON.parse(calls[0]!.body!).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("upload: reintenta una parte ante 503 y red, y no ante 403", async () => {
    const data = new Uint8Array([9, 9]);
    const ok = scripted([
      json(200, { uploadSessionId: "79", status: "initiated", partSizeBytes: 16 }),
      json(200, { uploadSessionId: "79", parts: [{ partNumber: 1, url: PART }] }),
      new Response("busy", { status: 503 }), new TypeError("socket hang up"), etag('"e1"'),
      json(200, item({ id: "904" })),
    ]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch: ok.fetch });
    await expect(storage.files.upload({ data, fileName: "a.bin", mimeType: "application/octet-stream" })).resolves.toMatchObject({ id: "904" });
    expect(ok.calls.filter((call) => call.method === "PUT")).toHaveLength(3);

    const denied = scripted([
      json(200, { uploadSessionId: "80", status: "initiated", partSizeBytes: 16 }),
      json(200, { uploadSessionId: "80", parts: [{ partNumber: 1, url: PART }] }),
      new Response("SignatureDoesNotMatch", { status: 403 }),
    ]);
    const failing = createStorage({ baseUrl: BASE, accessToken: "tok", fetch: denied.fetch });
    const error = await failing.files.upload({ data, fileName: "a.bin", mimeType: "application/octet-stream" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomyStorageError);
    expect(error).toMatchObject({ code: "UPLOAD_PART_FAILED", status: 403, retryable: false });
    expect(denied.calls).toHaveLength(3);
  });

  it("upload: valida la entrada antes de llamar a nadie", async () => {
    const { fetch, calls } = scripted([]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch });
    await expect(storage.files.upload({ data: new Uint8Array(STORAGE_MAX_UPLOAD_BYTES + 1), fileName: "big.bin", mimeType: "application/octet-stream" }))
      .rejects.toMatchObject({ code: "FILE_TOO_LARGE", status: 413, retryable: false });
    await expect(storage.files.upload({ data: new Uint8Array([1]), fileName: "../x", mimeType: "text/plain" }))
      .rejects.toMatchObject({ code: "SDK_INVALID_INPUT" });
    await expect(storage.files.upload({ data: new Uint8Array(), fileName: "x", mimeType: "text/plain" }))
      .rejects.toMatchObject({ code: "SDK_INVALID_INPUT" });
    expect(calls).toHaveLength(0);
  });

  it("downloadUrl: 423 FILE_SCAN_PENDING es un CustomyStorageError reintentable; la cuarentena no", async () => {
    const { fetch, calls } = scripted([
      json(423, { error: "FILE_SCAN_PENDING", message: "El archivo todavía está pasando el antivirus.", scanStatus: "pending", retryable: true }, { "retry-after": "2" }),
      json(423, { error: "FILE_QUARANTINED", message: "El antivirus bloqueó este archivo.", scanStatus: "infected", retryable: false }),
      json(200, { itemId: "901", url: "https://r2.fixture.invalid/signed", expiresIn: 60 }),
    ]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch, retry: fast });
    const pending = await storage.files.downloadUrl("901").catch((e: unknown) => e);
    expect(pending).toBeInstanceOf(CustomyStorageError);
    expect(pending).toBeInstanceOf(CustomySdkError);
    expect(pending).toMatchObject({ code: "FILE_SCAN_PENDING", status: 423, retryable: true, service: "storage", retryAfterMs: 2000 });
    await expect(storage.files.downloadUrl("901")).rejects.toMatchObject({ code: "FILE_QUARANTINED", retryable: false });
    await expect(storage.files.downloadUrl("901", { inline: true, expiresIn: 60, fileName: "gasto.jpg" }))
      .resolves.toEqual({ url: "https://r2.fixture.invalid/signed", expiresIn: 60 });
    expect(calls[2]!.url).toBe(`${BASE}/v2/items/901/download`);
    expect(JSON.parse(calls[2]!.body!)).toEqual({ inline: true, expiresIn: 60, fileName: "gasto.jpg" });
  });

  it("get: lo ajeno es 404 no reintentable; un 503 se reintenta", async () => {
    const { fetch, calls } = scripted([
      json(404, { error: "STORAGE_ITEM_NOT_FOUND", message: "not found" }),
      json(503, { error: "unavailable" }),
      json(200, item({ scanStatus: "quarantined" })),
    ]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch, retry: fast });
    await expect(storage.files.get("999")).rejects.toMatchObject({ code: "STORAGE_ITEM_NOT_FOUND", status: 404, retryable: false });
    await expect(storage.files.get("901")).resolves.toMatchObject({ scanStatus: "infected" });
    expect(calls).toHaveLength(3);
  });

  it("download: devuelve bytes, tipo y nombre; trash manda a la papelera", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { fetch, calls } = scripted([
      (call) => (call.url.endsWith("/download") ? json(200, { itemId: "901", url: "https://r2.fixture.invalid/signed", expiresIn: 300 }) : json(200, item({ scanStatus: "clean" }))),
      (call) => (call.url.endsWith("/download") ? json(200, { itemId: "901", url: "https://r2.fixture.invalid/signed", expiresIn: 300 }) : json(200, item({ scanStatus: "clean" }))),
      new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
      json(200, { itemId: "901", trashed: true }),
    ]);
    const storage = createStorage({ baseUrl: BASE, accessToken: "tok", fetch });
    const file = await storage.files.download("901");
    expect(file).toEqual({ data: bytes, mimeType: "image/jpeg", name: "recibo.jpg" });
    expect(calls[2]!.url).toBe("https://r2.fixture.invalid/signed");
    expect(calls[2]!.headers.authorization).toBeUndefined();
    await expect(storage.files.trash("901")).resolves.toBeUndefined();
    expect(`${calls[3]!.method} ${calls[3]!.url}`).toBe(`POST ${BASE}/v2/items/901/trash`);
  });
});
