/**
 * Doble mínimo del SDK de OpenFeature, para los tests de conformidad cuando
 * `@openfeature/*` no es resoluble sin red: reproduce lo que el SDK exige a un
 * proveedor (ciclo de vida, orden de hooks, estado por eventos, valores por
 * defecto ante error) con las mismas firmas del spec 0.5.
 */
import type { EvaluationContext, Hook, HookContext, ProviderEventType, ResolutionDetails } from "./spec";

type AnyProvider = {
  metadata: { name: string };
  runsOn?: "server" | "client";
  events?: { addHandler(type: ProviderEventType, handler: (details?: any) => void): void };
  hooks?: Hook[];
  initialize?(context?: EvaluationContext): Promise<void> | void;
  onClose?(): Promise<void> | void;
  track?(name: string, context: EvaluationContext, details?: Record<string, unknown>): void;
  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext): ResolutionDetails<boolean> | Promise<ResolutionDetails<boolean>>;
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext): ResolutionDetails<string> | Promise<ResolutionDetails<string>>;
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext): ResolutionDetails<number> | Promise<ResolutionDetails<number>>;
  resolveObjectEvaluation(flagKey: string, defaultValue: never, context: EvaluationContext): ResolutionDetails<unknown> | Promise<ResolutionDetails<unknown>>;
};

export type Status = "NOT_READY" | "READY" | "ERROR" | "STALE";

export class FakeOpenFeatureClient {
  status: Status = "NOT_READY";
  readonly seen: Array<{ type: ProviderEventType; details?: unknown }> = [];

  constructor(readonly provider: AnyProvider, private readonly globalContext: EvaluationContext = {}) {
    for (const type of ["PROVIDER_READY", "PROVIDER_ERROR", "PROVIDER_STALE", "PROVIDER_CONFIGURATION_CHANGED"] as const) {
      provider.events?.addHandler(type, (details) => {
        this.seen.push({ type, details });
        if (type === "PROVIDER_READY") this.status = "READY";
        if (type === "PROVIDER_ERROR") this.status = "ERROR";
        if (type === "PROVIDER_STALE") this.status = "STALE";
      });
    }
  }

  async init(): Promise<void> {
    try {
      await this.provider.initialize?.(this.globalContext);
      this.status = "READY";
    } catch {
      this.status = "ERROR";
    }
  }

  private async run<T>(valueType: string, flagKey: string, defaultValue: T, context: EvaluationContext | undefined, call: (merged: EvaluationContext) => ResolutionDetails<T> | Promise<ResolutionDetails<T>>) {
    const merged = { ...this.globalContext, ...context };
    const hookContext: HookContext = { flagKey, defaultValue, flagValueType: valueType, context: merged, providerMetadata: this.provider.metadata };
    let details: ResolutionDetails<T>;
    try {
      details = await call(merged);
    } catch (error) {
      details = { value: defaultValue, reason: "ERROR", errorCode: "GENERAL", errorMessage: String(error) };
    }
    const evaluation = { ...details, flagKey, flagMetadata: details.flagMetadata ?? {} };
    // El SDK devuelve el valor por defecto ante cualquier errorCode y no ejecuta `after` (sí `error`).
    if (details.errorCode) return { ...evaluation, value: defaultValue };
    for (const hook of this.provider.hooks ?? []) hook.after?.(hookContext, evaluation);
    return evaluation;
  }

  boolean(flagKey: string, defaultValue: boolean, context?: EvaluationContext) { return this.run("boolean", flagKey, defaultValue, context, (c) => this.provider.resolveBooleanEvaluation(flagKey, defaultValue, c)); }
  string(flagKey: string, defaultValue: string, context?: EvaluationContext) { return this.run("string", flagKey, defaultValue, context, (c) => this.provider.resolveStringEvaluation(flagKey, defaultValue, c)); }
  number(flagKey: string, defaultValue: number, context?: EvaluationContext) { return this.run("number", flagKey, defaultValue, context, (c) => this.provider.resolveNumberEvaluation(flagKey, defaultValue, c)); }
  object(flagKey: string, defaultValue: Record<string, unknown>, context?: EvaluationContext) { return this.run("object", flagKey, defaultValue, context, (c) => this.provider.resolveObjectEvaluation(flagKey, defaultValue as never, c)); }
  track(name: string, context?: EvaluationContext, details?: Record<string, unknown>) { this.provider.track?.(name, { ...this.globalContext, ...context }, details); }
}
