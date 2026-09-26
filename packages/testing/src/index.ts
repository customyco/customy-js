/**
 * @customyai/testing — la plataforma Customy en memoria para probar una app.
 *
 * `createFakeCustomy({ manifest })` devuelve un `fetch` que sirve el discovery,
 * el token endpoint de máquina y las rutas de Send, Billing y Data que usan los
 * SDK, con los mismos códigos de error. Todo se comprueba contra el
 * `customy.app.json` de la app: solo hay productos, scopes, eventos (con su
 * JSON Schema y sus propósitos de consentimiento) y meters declarados. Lo que
 * la app envía queda registrado para las aserciones.
 *
 *   const fake = createFakeCustomy({ manifest });
 *   const customy = await createCustomy({ ...fake.credentials, fetch: fake.fetch });
 *   await coach.run(customy);
 *   expect(fake.usage).toEqual([expect.objectContaining({ meter: "coach.runs" })]);
 */
import Ajv, { type ValidateFunction } from "ajv";

export type FakeAppManifest = {
  key: string;
  products?: ReadonlyArray<{ product: string; scopes?: readonly string[] }>;
  events?: ReadonlyArray<{ name: string; type: string; purposes: readonly string[]; properties?: Record<string, unknown> }>;
  capabilities?: ReadonlyArray<{ lookupKey: string; type: "boolean" | "metered" | "config" }>;
  plans?: ReadonlyArray<{ code: string; capabilities?: Record<string, unknown> }>;
  meters?: ReadonlyArray<{ code: string }>;
};

export type FakeCustomyOptions = {
  manifest: FakeAppManifest;
  /** Por defecto `https://access.customy.test`. */
  issuer?: string;
  /** Segundos de vida de los tokens emitidos (900 por defecto). */
  tokenTtlSeconds?: number;
};

export type RecordedEmail = { id: string; idempotencyKey: string | null; body: Record<string, unknown> };
export type RecordedUsage = { id: string; meter: string; quantity: number; idempotencyKey: string; occurredAt: string | null };
export type RecordedEvent = { eventId: string; event: Record<string, unknown> };
export type RecordedToken = { audience: string; scopes: string[] };

export type FakeCustomy = {
  readonly issuer: string;
  /** Para `createCustomy`: `{ issuer, clientId, clientSecret }`. */
  readonly credentials: { issuer: string; clientId: string; clientSecret: string };
  readonly fetch: typeof fetch;
  readonly emails: RecordedEmail[];
  readonly usage: RecordedUsage[];
  readonly events: RecordedEvent[];
  readonly tokens: RecordedToken[];
  /** URL que el discovery publica para un producto (`send`, `billing`, `data`…). */
  baseUrl(product: string): string;
  /** Capabilities efectivas de un plan del manifiesto, con los valores por defecto de cada tipo. */
  planCapabilities(plan: string): Record<string, unknown>;
  /** Vacía lo registrado; conserva la configuración. */
  reset(): void;
};

type Claims = { audience: string; scopes: string[] };

const CLIENT_ID = "app_fake_client";
const CLIENT_SECRET = "fake-secret";

class HttpError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super(String(body.error ?? body.name ?? status)); }
}

const shortName = (product: string) => product.replace(/^customy-/, "");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const toBase64Url = (value: string) => btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (value: string) => atob(value.replace(/-/g, "+").replace(/_/g, "/"));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function createFakeCustomy(options: FakeCustomyOptions): FakeCustomy {
  const { manifest } = options;
  const issuer = (options.issuer ?? "https://access.customy.test").replace(/\/$/, "");
  const products = new Map((manifest.products ?? []).map((use) => [shortName(use.product), { audience: use.product, scopes: [...(use.scopes ?? [])] }]));
  const meters = new Set((manifest.meters ?? []).map((meter) => meter.code));
  const ajv = new Ajv({ allErrors: false, strict: false });
  const validators = new Map<string, ValidateFunction>();
  const emails: RecordedEmail[] = [];
  const usage: RecordedUsage[] = [];
  const events: RecordedEvent[] = [];
  const tokens: RecordedToken[] = [];
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}_fake_${(++sequence).toString().padStart(6, "0")}`;
  const baseUrl = (product: string) => `https://${product}.customy.test`;

  function discovery() {
    return {
      issuer,
      token_endpoint: `${issuer}/oauth/token`,
      products: Object.fromEntries([...products].map(([name, use]) => [name, { base_url: baseUrl(name), audience: use.audience }])),
    };
  }

  function issueToken(request: Request, body: string): Response {
    const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
    const [clientId, clientSecret] = scheme === "Basic" && encoded ? atob(encoded).split(":").map(decodeURIComponent) : [];
    if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) return json(401, { error: "invalid_client" });
    const form = new URLSearchParams(body);
    if (form.get("grant_type") !== "client_credentials") return json(400, { error: "unsupported_grant_type" });
    const audience = form.get("audience") ?? "";
    const use = [...products.values()].find((candidate) => candidate.audience === audience);
    if (!use) return json(400, { error: "invalid_target" });
    const requested = (form.get("scope") ?? "").split(" ").filter(Boolean);
    if (requested.some((scope) => !use.scopes.includes(scope))) return json(400, { error: "invalid_scope" });
    const scopes = requested.length ? requested : use.scopes;
    tokens.push({ audience, scopes });
    const ttl = options.tokenTtlSeconds ?? 900;
    return json(200, { access_token: `fake.${toBase64Url(JSON.stringify({ aud: audience, scope: scopes.join(" "), app: manifest.key }))}`, token_type: "Bearer", expires_in: ttl });
  }

  function claims(request: Request, product: string): Claims {
    const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
    let payload: { aud?: string; scope?: string } = {};
    try { payload = JSON.parse(fromBase64Url(token.replace(/^fake\./, ""))); } catch { /* token ajeno */ }
    const use = products.get(product);
    if (!token.startsWith("fake.") || !use || payload.aud !== use.audience) throw new HttpError(401, { error: "UNAUTHORIZED", message: `A Customy Access token for ${use?.audience ?? product} is required` });
    return { audience: payload.aud, scopes: String(payload.scope ?? "").split(" ").filter(Boolean) };
  }

  function requireScope(granted: Claims, scope: string, error: (message: string) => Record<string, unknown>) {
    if (!granted.scopes.includes(scope)) throw new HttpError(403, error(`The token lacks the ${scope} scope`));
  }

  // --- Send -------------------------------------------------------------------
  const sendError = (status: number, name: string, message: string) => new HttpError(status, { name, message, statusCode: status });
  const sentByKey = new Map<string, RecordedEmail>();

  function acceptEmail(body: unknown, idempotencyKey: string | null): RecordedEmail {
    if (!isRecord(body) || typeof body.from !== "string" || !body.to || typeof body.subject !== "string" || !(body.html || body.text)) {
      throw sendError(422, "validation_error", "from, to, subject and html or text are required");
    }
    if (idempotencyKey && sentByKey.has(idempotencyKey)) return sentByKey.get(idempotencyKey)!;
    const email = { id: nextId("em"), idempotencyKey, body };
    emails.push(email);
    if (idempotencyKey) sentByKey.set(idempotencyKey, email);
    return email;
  }

  function emailResource(email: RecordedEmail) {
    const list = (value: unknown) => (value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]);
    const body = email.body;
    return {
      id: email.id, status: "queued", from: body.from, to: list(body.to), cc: list(body.cc), bcc: list(body.bcc), reply_to: list(body.reply_to),
      subject: body.subject, created_at: new Date().toISOString(), scheduled_at: body.scheduled_at ?? null, sent_at: null, last_event: null,
      tags: body.tags ?? [], metadata: body.metadata ?? {},
    };
  }

  async function send(request: Request, path: string, body: unknown): Promise<Response> {
    const granted = claims(request, "send");
    if (request.method === "POST" && path === "/api/emails") {
      requireScope(granted, "send:emails:send", (message) => ({ name: "insufficient_scope", message, statusCode: 403 }));
      return json(200, emailResource(acceptEmail(body, request.headers.get("idempotency-key"))));
    }
    if (request.method === "POST" && path === "/api/emails/batch") {
      requireScope(granted, "send:emails:send", (message) => ({ name: "insufficient_scope", message, statusCode: 403 }));
      if (!Array.isArray(body) || body.length === 0 || body.length > 100) throw sendError(422, "validation_error", "between 1 and 100 emails per batch");
      const data = body.map((item) => {
        try { return { id: acceptEmail(item, null).id }; }
        catch (error) { return { error: { name: "validation_error", message: error instanceof HttpError ? String(error.body.message) : "invalid email" } }; }
      });
      return json(200, { data });
    }
    throw notImplemented(request, path);
  }

  // --- Billing ----------------------------------------------------------------
  const billingError = (status: number, error: string, message: string) => new HttpError(status, { error, message, statusCode: status });
  const usageByKey = new Map<string, RecordedUsage>();

  function billing(request: Request, path: string, body: unknown): Response {
    if (request.method !== "POST" || path !== "/v1/apps/usage") throw notImplemented(request, path);
    const granted = claims(request, "billing");
    requireScope(granted, "billing:usage:report", (message) => ({ error: "INSUFFICIENT_SCOPE", message, statusCode: 403 }));
    const batch = isRecord(body) && Array.isArray(body.events) ? body.events : null;
    const valid = batch && batch.length >= 1 && batch.length <= 100 && batch.every((event) => isRecord(event)
      && typeof event.meter === "string" && /^[a-z][a-z0-9_.-]{0,79}$/.test(event.meter)
      && typeof event.quantity === "number" && Number.isFinite(event.quantity) && event.quantity >= 0 && event.quantity <= 1e9
      && typeof event.idempotencyKey === "string" && /^[A-Za-z0-9_.:-]{8,128}$/.test(event.idempotencyKey)
      && (event.occurredAt === undefined || (typeof event.occurredAt === "string" && !Number.isNaN(Date.parse(event.occurredAt)))));
    if (!valid) throw billingError(400, "INVALID_USAGE", "The usage batch is invalid");
    const events = batch as Array<{ meter: string; quantity: number; idempotencyKey: string; occurredAt?: string }>;
    const keys = new Set<string>();
    for (const event of events) {
      // Más estricto que la plataforma a propósito: un meter fuera del manifiesto no cuenta para ningún plan.
      if (!meters.has(event.meter)) throw billingError(400, "METER_NOT_DECLARED", `The meter ${event.meter} is not declared in customy.app.json`);
      const key = `${event.meter}\u0000${event.idempotencyKey}`;
      if (keys.has(key)) throw billingError(400, "DUPLICATE_IDEMPOTENCY_KEY", "Each event needs its own idempotency key");
      keys.add(key);
    }
    const results = events.map((event) => {
      const key = `${event.meter}\u0000${event.idempotencyKey}`;
      const existing = usageByKey.get(key);
      if (existing) return { meter: event.meter, idempotencyKey: event.idempotencyKey, id: existing.id, deduplicated: true };
      const recorded = { id: nextId("usage"), meter: event.meter, quantity: event.quantity, idempotencyKey: event.idempotencyKey, occurredAt: event.occurredAt ?? null };
      usage.push(recorded);
      usageByKey.set(key, recorded);
      return { meter: event.meter, idempotencyKey: event.idempotencyKey, id: recorded.id, deduplicated: false };
    });
    return json(202, { accepted: results.length, events: results });
  }

  // --- Data -------------------------------------------------------------------
  const dataError = (code: string, status = 422) => new HttpError(status, { error: code, code, statusCode: status });
  const eventsById = new Map<string, RecordedEvent>();

  function governEvent(value: unknown) {
    if (!isRecord(value)) throw dataError("DATA_EXTERNAL_EVENT_NOT_ALLOWED");
    const declared = (manifest.events ?? []).find((event) => event.name === String(value.event ?? value.type ?? ""));
    if (!declared || declared.type !== value.type) throw dataError("DATA_EXTERNAL_EVENT_NOT_ALLOWED");
    const consent = isRecord(value.consent) ? value.consent : {};
    if (declared.purposes.some((purpose) => consent[purpose] !== true && consent[purpose] !== "granted")) throw dataError("DATA_EXTERNAL_CONSENT_REQUIRED");
    let validate = validators.get(declared.name);
    if (!validate) {
      validate = ajv.compile(declared.properties ?? { type: "object" });
      validators.set(declared.name, validate);
    }
    if (!validate(value.properties ?? {})) throw dataError("DATA_EXTERNAL_SCHEMA_REJECTED");
    return value;
  }

  function collect(value: Record<string, unknown>) {
    const messageId = typeof value.messageId === "string" ? value.messageId : null;
    const existing = messageId ? eventsById.get(messageId) : undefined;
    if (existing) return { eventId: existing.eventId, accepted: false, deduplicated: true, quarantined: false };
    const recorded = { eventId: nextId("evt"), event: value };
    events.push(recorded);
    if (messageId) eventsById.set(messageId, recorded);
    return { eventId: recorded.eventId, accepted: true, deduplicated: false, quarantined: false };
  }

  function data(request: Request, path: string, body: unknown): Response {
    const granted = claims(request, "data");
    requireScope(granted, "data:collect", () => ({ error: "DATA_ACCESS_SCOPE_REQUIRED", code: "DATA_ACCESS_SCOPE_REQUIRED", statusCode: 403 }));
    if (request.method === "GET" && path === "/v1/collect/source") return json(200, { id: `src_fake_${manifest.key}`, key: manifest.key, status: "active" });
    if (request.method === "POST" && path === "/v1/collect/event") return json(200, collect(governEvent(body)));
    if (request.method === "POST" && path === "/v1/collect/batch") {
      const batch = isRecord(body) && Array.isArray(body.batch) ? body.batch : null;
      if (!batch || batch.length === 0) throw dataError("DATA_BATCH_INVALID", 400);
      // Como la plataforma: se valida el lote entero antes de escribir nada.
      const governed = batch.map(governEvent);
      const results = governed.map(collect);
      return json(200, {
        accepted: results.filter((result) => result.accepted).length,
        deduplicated: results.filter((result) => result.deduplicated).length,
        quarantined: 0,
        results,
      });
    }
    throw notImplemented(request, path);
  }

  function notImplemented(request: Request, path: string) {
    return new HttpError(404, { error: "FAKE_ROUTE_NOT_IMPLEMENTED", code: "FAKE_ROUTE_NOT_IMPLEMENTED", message: `${request.method} ${path} is not part of the fake platform` });
  }

  const handlers: Record<string, (request: Request, path: string, body: unknown) => Response | Promise<Response>> = { send, billing, data };

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
    if (url.origin === issuer) {
      if (request.method === "GET" && url.pathname === "/.well-known/customy-configuration") return json(200, discovery());
      if (request.method === "POST" && url.pathname === "/oauth/token") return issueToken(request, text);
      return json(404, { error: "FAKE_ROUTE_NOT_IMPLEMENTED" });
    }
    const product = [...products.keys()].find((name) => url.origin === baseUrl(name));
    if (!product) throw new TypeError(`fetch failed: ${url.origin} is not a Customy product declared in customy.app.json`);
    let body: unknown = undefined;
    if (text) {
      try { body = JSON.parse(text); } catch { return json(400, { error: "INVALID_JSON" }); }
    }
    try {
      const handler = handlers[product];
      if (!handler) throw notImplemented(request, url.pathname);
      return await handler(request, url.pathname, body);
    } catch (error) {
      if (error instanceof HttpError) return json(error.status, error.body);
      throw error;
    }
  }) as typeof fetch;

  return {
    issuer,
    credentials: { issuer, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    fetch: fakeFetch,
    emails, usage, events, tokens,
    baseUrl,
    planCapabilities(code) {
      const plan = (manifest.plans ?? []).find((candidate) => candidate.code === code);
      if (!plan) throw new Error(`plan ${code} is not declared in customy.app.json`);
      const defaults = { boolean: false, metered: 0, config: null } as const;
      return Object.fromEntries((manifest.capabilities ?? []).map((capability) => [
        capability.lookupKey, plan.capabilities?.[capability.lookupKey] ?? defaults[capability.type],
      ]));
    },
    reset() {
      emails.length = 0; usage.length = 0; events.length = 0; tokens.length = 0;
      sentByKey.clear(); usageByKey.clear(); eventsById.clear();
    },
  };
}
