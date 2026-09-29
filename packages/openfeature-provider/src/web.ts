/**
 * Proveedor de OpenFeature de NAVEGADOR (`@openfeature/web-sdk`): evaluación
 * síncrona. En modo `local` evalúa la instantánea en el cliente; en `remote`
 * pide TODOS los flags del contexto actual a `POST /v1/flags/evaluate` al
 * inicializar y al cambiar el contexto, y sirve de esa copia.
 *
 * ```ts
 * import { OpenFeature } from "@openfeature/web-sdk";
 * import { CustomyWebProvider } from "@customyai/openfeature-provider/web";
 *
 * await OpenFeature.setContext({ targetingKey: visitorId });
 * await OpenFeature.setProviderAndWait(new CustomyWebProvider({ clientOptions: { publishableKey }, pollIntervalMs: 30_000 }));
 * ```
 */
import { ProviderCore, PROVIDER_NAME } from "./core";
import type { ProviderOptions } from "./engine";
import { toEvalContext, type EvaluatedFlag } from "./mapping";
import type { EvaluationContext, Hook, JsonValue, Logger, ProviderEmitter, ResolutionDetails, TrackingEventDetails } from "./spec";

export type { ProviderOptions, LocalOptions, FlagsClientLike } from "./engine";
export type { RemoteOptions } from "./remote";
export type * from "./spec";

export class CustomyWebProvider {
  readonly metadata = { name: PROVIDER_NAME } as const;
  readonly runsOn = "client" as const;
  readonly events: ProviderEmitter;
  readonly hooks: Hook[];
  private readonly core: ProviderCore;
  private cache = new Map<string, EvaluatedFlag>();
  private cacheVersion = 0;

  constructor(options: ProviderOptions & { logger?: Logger } = {}) {
    this.core = new ProviderCore(options, options.logger);
    this.events = this.core.events;
    this.hooks = this.core.hooks;
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    await this.core.start();
    if (this.core.remote) await this.prime(context, false);
  }

  async onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    if (this.core.remote) await this.prime(newContext, false);
  }

  /** Modo remoto: relee los flags del contexto y avisa de los que cambiaron (PROVIDER_CONFIGURATION_CHANGED). */
  async refresh(context?: EvaluationContext): Promise<string[]> {
    return this.core.remote ? this.prime(context, true) : [];
  }

  onClose(): Promise<void> { return this.core.stop(); }
  flush(): Promise<void> { return this.core.flush(); }

  private lastContext?: EvaluationContext;

  private async prime(context: EvaluationContext | undefined, announce: boolean): Promise<string[]> {
    const ctx = toEvalContext(context ?? this.lastContext);
    if (context) this.lastContext = context;
    const body = await this.core.remote!.remote.evaluateAll({ key: ctx.key, attributes: ctx.attributes });
    const next = new Map(Object.entries(body.results));
    const changed = [...new Set([...this.cache.keys(), ...next.keys()])].filter((key) => JSON.stringify(this.cache.get(key)) !== JSON.stringify(next.get(key)));
    const first = this.cache.size === 0 && this.cacheVersion === 0;
    this.cache = next;
    this.cacheVersion = body.version;
    this.core.recovered();
    if (announce && changed.length && !first) this.core.events.emit("PROVIDER_CONFIGURATION_CHANGED", { flagsChanged: changed });
    return changed;
  }

  private resolve<T>(kind: "boolean" | "string" | "number" | "object", flagKey: string, defaultValue: T, context: EvaluationContext): ResolutionDetails<T> {
    if (this.core.local) return this.core.resolution(kind, flagKey, defaultValue, this.core.evalLocal(flagKey, context));
    const eval_ = toEvalContext(context);
    const detail = this.cache.get(flagKey) ?? { flagKey, treatment: "control", value: undefined, reason: "error" as const, reasonCode: "error" as const, error: "flag_not_found" };
    return this.core.resolution(kind, flagKey, defaultValue, { detail, eval: eval_ });
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, _logger?: Logger): ResolutionDetails<boolean> { return this.resolve("boolean", flagKey, defaultValue, context); }
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, _logger?: Logger): ResolutionDetails<string> { return this.resolve("string", flagKey, defaultValue, context); }
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, _logger?: Logger): ResolutionDetails<number> { return this.resolve("number", flagKey, defaultValue, context); }
  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, _logger?: Logger): ResolutionDetails<T> { return this.resolve("object", flagKey, defaultValue, context); }

  track(trackingEventName: string, context: EvaluationContext, trackingEventDetails?: TrackingEventDetails): void {
    this.core.track(trackingEventName, context, trackingEventDetails);
  }
}
