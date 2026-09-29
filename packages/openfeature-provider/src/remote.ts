/**
 * Modo `remote`: evalúa en Customy Experiments (`POST /v1/flags/evaluate`, mismo
 * motor que el SDK local) y reporta exposiciones y conversiones por los mismos
 * contratos que el cliente local (`/v1/flags/impressions` y `/conversions`).
 * Pensado para quien no puede evaluar localmente (Go, Python, Java, .NET, Ruby…
 * a través de su proveedor OpenFeature, o un cliente sin snapshot).
 */
import type { EvaluatedFlag } from "./mapping";
import type { EvalContext } from "@customyai/access/flags";

export type RemoteOptions = {
  mode: "remote";
  /** Origen de Customy Experiments (p. ej. `https://experiments.customy.ai`). */
  baseUrl: string;
  /** Clave publicable del entorno (vista pública, apta para navegador). */
  publishableKey?: string;
  /** Solo servidor: token de máquina, o función que lo entrega fresco. */
  accessToken?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
  /** Plazo por petición de evaluación (3 s): el SDK nunca bloquea la app. */
  timeoutMs?: number;
  /** Envío periódico de exposiciones y conversiones (10 s; 0 la desactiva y manda solo `flush()`). */
  flushIntervalMs?: number;
  maxBatchSize?: number;
};

type Item = Record<string, unknown>;
const SDK = { name: "@customyai/openfeature-provider" } as const;
const MAX_QUEUED = 10_000;

export class RemoteError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "RemoteError"; }
}

export class RemoteClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly impressions: Item[] = [];
  private readonly conversions: Item[] = [];
  private readonly seen = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private readonly batch: number;
  private nextFlushAt = 0;
  private failures = 0;

  constructor(private readonly options: RemoteOptions) {
    if (!options.publishableKey && options.accessToken === undefined) throw new RemoteError("remote mode needs publishableKey or accessToken");
    if (options.publishableKey && options.accessToken !== undefined) throw new RemoteError("pass either publishableKey or accessToken, not both");
    this.base = options.baseUrl.replace(/\/$/, "");
    const impl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!impl) throw new RemoteError("no fetch implementation available; pass options.fetch");
    this.fetchImpl = impl;
    this.batch = Math.max(1, Math.min(1_000, options.maxBatchSize ?? 100));
  }

  start(): void {
    const interval = this.options.flushIntervalMs ?? 10_000;
    if (interval > 0 && !this.timer) {
      this.timer = setInterval(() => void this.autoFlush(), interval);
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush().catch(() => undefined);
  }

  private async headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json", "x-customy-sdk": SDK.name };
    if (this.options.publishableKey) headers["x-publishable-key"] = this.options.publishableKey;
    else {
      const token = typeof this.options.accessToken === "function" ? await this.options.accessToken() : this.options.accessToken;
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private async post<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    const controller = typeof AbortController === "function" ? new AbortController() : undefined;
    const timer = controller && timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const response = await this.fetchImpl(`${this.base}${path}`, { method: "POST", headers: await this.headers(), body: JSON.stringify(body), signal: controller?.signal });
      if (!response.ok) throw new RemoteError(`${path} responded ${response.status}`, response.status);
      return (await response.json().catch(() => ({}))) as T;
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError(error instanceof Error ? error.message : String(error));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async evaluateOne(flagKey: string, context: EvalContext): Promise<EvaluatedFlag> {
    const { result } = await this.post<{ result: EvaluatedFlag }>("/v1/flags/evaluate", { flagKey, context }, this.options.timeoutMs ?? 3_000);
    if (!result) throw new RemoteError("malformed evaluate response");
    return result;
  }

  async evaluateAll(context: EvalContext): Promise<{ version: number; results: Record<string, EvaluatedFlag> }> {
    const body = await this.post<{ version: number; results: Record<string, EvaluatedFlag> }>("/v1/flags/evaluate", { context }, this.options.timeoutMs ?? 3_000);
    if (!body.results) throw new RemoteError("malformed evaluate response");
    return body;
  }

  impression(detail: EvaluatedFlag, context: EvalContext): void {
    if (detail.reasonCode === "error") return;
    const hour = Math.floor(Date.now() / 3_600_000);
    const seenKey = `${detail.flagKey}\u0000${context.key}\u0000${detail.treatment}`;
    if (this.seen.get(seenKey) === hour) return;
    if (this.seen.size >= 50_000) this.seen.clear();
    this.seen.set(seenKey, hour);
    this.impressions.push({
      flagKey: detail.flagKey, contextKey: context.key, treatment: detail.treatment, value: detail.value, reason: detail.reason,
      ...(detail.ruleId !== undefined ? { ruleId: detail.ruleId } : {}), ...(detail.bucket !== undefined ? { bucket: detail.bucket } : {}),
      occurredAt: new Date().toISOString(),
    });
    if (this.impressions.length > MAX_QUEUED) this.impressions.splice(0, this.impressions.length - MAX_QUEUED);
    if (this.impressions.length >= this.batch) void this.autoFlush();
  }

  conversion(item: { id: string; flagKey: string; contextKey: string; treatment: string; metric: string; value: number }): void {
    this.conversions.push({ ...item, occurredAt: new Date().toISOString() });
    if (this.conversions.length > MAX_QUEUED) this.conversions.splice(0, this.conversions.length - MAX_QUEUED);
    if (this.conversions.length >= this.batch) void this.autoFlush();
  }

  private async autoFlush(): Promise<void> {
    if (Date.now() < this.nextFlushAt) return;
    await this.flush().catch(() => undefined);
  }

  /** Envía lo pendiente; ante un fallo el lote vuelve a la cola (salvo rechazo definitivo 400/413/422) y los envíos automáticos esperan con backoff. */
  async flush(): Promise<number> {
    const impressions = this.impressions.splice(0, this.batch);
    const conversions = this.conversions.splice(0, this.batch);
    const permanent = (error: unknown) => error instanceof RemoteError && [400, 413, 422].includes(error.status ?? 0);
    const results = await Promise.allSettled([
      impressions.length ? this.post("/v1/flags/impressions", { impressions, sdk: SDK }) : Promise.resolve(),
      conversions.length ? this.post("/v1/flags/conversions", { conversions, sdk: SDK }) : Promise.resolve(),
    ]);
    const [sentImpressions, sentConversions] = results;
    if (sentImpressions.status === "rejected" && !permanent(sentImpressions.reason)) this.impressions.unshift(...impressions);
    if (sentConversions.status === "rejected" && !permanent(sentConversions.reason)) this.conversions.unshift(...conversions);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) {
      this.failures += 1;
      this.nextFlushAt = Date.now() + Math.min(300_000, (this.options.flushIntervalMs ?? 10_000) * 2 ** Math.min(this.failures, 8));
      throw failed.reason;
    }
    this.failures = 0;
    this.nextFlushAt = 0;
    return impressions.length + conversions.length;
  }
}
