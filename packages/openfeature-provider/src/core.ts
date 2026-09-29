/**
 * Núcleo común de los proveedores de servidor y de navegador: motor (local o
 * remoto), eventos, hook de exposición y `track()` hacia conversiones.
 */
import type { EvalContext } from "@customyai/access/flags";
import { ProviderEvents } from "./emitter";
import { LocalEngine, RemoteEngine, isRemote, type ProviderOptions } from "./engine";
import { toEvalContext, toResolution, type EvaluatedFlag, type FlagKind } from "./mapping";
import type { EvaluationContext, EvaluationDetails, Hook, HookContext, Logger, ResolutionDetails, TrackingEventDetails } from "./spec";

const MAX_TRACKED_UNITS = 10_000;
export const PROVIDER_NAME = "customy";

export class ProviderCore {
  readonly events = new ProviderEvents();
  readonly local?: LocalEngine;
  readonly remote?: RemoteEngine;
  /** Qué tratamiento vio cada unidad (acotado): atribuye `track()` cuando no se dice el flag. */
  private readonly exposed = new Map<string, Map<string, string>>();
  private remoteFailing = false;
  readonly hooks: Hook[] = [{ after: (hookContext, details) => this.onAfter(hookContext, details) }];

  constructor(readonly options: ProviderOptions, readonly logger?: Logger) {
    if (isRemote(options)) this.remote = new RemoteEngine(options);
    else this.local = new LocalEngine(options, this.events);
  }

  async start(): Promise<void> {
    if (this.local) await this.local.start();
    else this.remote!.start();
  }

  async stop(): Promise<void> {
    await (this.local ?? this.remote!).stop();
    this.events.removeAllHandlers();
  }

  async flush(): Promise<void> {
    if (this.local) await this.local.client.flush?.();
    else await this.remote!.remote.flush();
  }

  /** Evalúa en proceso (modo local). */
  evalLocal(flagKey: string, context: EvaluationContext | undefined): { detail: EvaluatedFlag; eval: ReturnType<typeof toEvalContext> } {
    const ctx = toEvalContext(context);
    return { detail: this.local!.evaluate(flagKey, { key: ctx.key, attributes: ctx.attributes }), eval: ctx };
  }

  /** Evalúa en Experiments (modo remoto). Un fallo emite PROVIDER_ERROR una vez por racha y devuelve un error evaluable, nunca lanza. */
  async evalRemote(flagKey: string, context: EvaluationContext | undefined): Promise<{ detail: EvaluatedFlag; eval: ReturnType<typeof toEvalContext> }> {
    const ctx = toEvalContext(context);
    try {
      const detail = await this.remote!.remote.evaluateOne(flagKey, { key: ctx.key, attributes: ctx.attributes });
      this.recovered();
      return { detail, eval: ctx };
    } catch (error) {
      return { detail: this.failed(flagKey, error), eval: ctx };
    }
  }

  recovered(): void {
    if (this.remoteFailing) { this.remoteFailing = false; this.events.emit("PROVIDER_READY", { message: "remote evaluation recovered" }); }
  }

  failed(flagKey: string, error: unknown): EvaluatedFlag {
    const message = error instanceof Error ? error.message : String(error);
    if (!this.remoteFailing) { this.remoteFailing = true; this.events.emit("PROVIDER_ERROR", { message, errorCode: "GENERAL" }); }
    this.logger?.warn(`customy: remote evaluation of "${flagKey}" failed: ${message}`);
    return { flagKey, treatment: "control", value: undefined, reason: "error", reasonCode: "error", error: "remote_unavailable" };
  }

  /** Detalle OpenFeature de un resultado. Sin `targetingKey` el evaluador responde `missing_context_key` ⇒ TARGETING_KEY_MISSING. */
  resolution<T>(kind: FlagKind, _flagKey: string, defaultValue: T, result: { detail: EvaluatedFlag; eval: ReturnType<typeof toEvalContext> }): ResolutionDetails<T> {
    return toResolution(kind, result.detail, defaultValue);
  }

  /** Hook `after`: la exposición se registra cuando el valor se entregó de verdad a la app. */
  private onAfter(hookContext: HookContext, details: EvaluationDetails<unknown>): void {
    try {
      if (details.errorCode || details.variant === undefined) return;
      const ctx = toEvalContext(hookContext.context);
      if (!ctx.hasKey) return;
      const meta = details.flagMetadata;
      const detail: EvaluatedFlag = {
        flagKey: hookContext.flagKey, treatment: details.variant, value: details.value,
        reason: (meta.legacyReason as EvaluatedFlag["reason"]) ?? "default", reasonCode: String(meta.reasonCode ?? "default") as EvaluatedFlag["reasonCode"],
        ...(typeof meta.ruleId === "string" ? { ruleId: meta.ruleId } : {}), ...(typeof meta.bucket === "number" ? { bucket: meta.bucket } : {}),
      };
      this.remember(ctx.key, hookContext.flagKey, details.variant);
      const evalContext: EvalContext = { key: ctx.key, attributes: ctx.attributes };
      if (this.local) this.local.client.track(detail as never, evalContext);
      else this.remote!.remote.impression(detail, evalContext);
    } catch (error) {
      this.logger?.debug(`customy: exposure not recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private remember(unit: string, flagKey: string, treatment: string): void {
    let flags = this.exposed.get(unit);
    if (!flags) {
      if (this.exposed.size >= MAX_TRACKED_UNITS) this.exposed.delete(this.exposed.keys().next().value as string);
      this.exposed.set(unit, (flags = new Map()));
    }
    flags.set(flagKey, treatment);
  }

  /**
   * `track()` de OpenFeature → conversiones. Se atribuye a `details.flagKey` /
   * `details.flagKeys` si vienen, y si no a los flags que esa unidad ha visto.
   * Métrica = nombre del evento; importe = `details.value` (≥ 0); `details.eventId`
   * hace idempotente un reintento. Nunca lanza.
   */
  track(trackingEventName: string, context: EvaluationContext | undefined, details?: TrackingEventDetails): void {
    try {
      const ctx = toEvalContext(context);
      if (!ctx.hasKey) { this.logger?.debug("customy: track() ignored, no targetingKey"); return; }
      const explicit = typeof details?.flagKey === "string" ? [details.flagKey] : Array.isArray(details?.flagKeys) ? details.flagKeys.filter((key): key is string => typeof key === "string") : [];
      const seen = this.exposed.get(ctx.key);
      const flagKeys = explicit.length ? explicit : [...(seen?.keys() ?? [])];
      if (!flagKeys.length) { this.logger?.debug(`customy: track("${trackingEventName}") has no flag to attribute to`); return; }
      const value = typeof details?.value === "number" && Number.isFinite(details.value) && details.value >= 0 ? details.value : 0;
      const eventId = typeof details?.eventId === "string" ? details.eventId : undefined;
      const evalContext: EvalContext = { key: ctx.key, attributes: ctx.attributes };
      for (const flagKey of flagKeys) {
        const id = eventId ? `${eventId}:${flagKey}` : undefined;
        if (this.local) this.local.client.trackConversion(flagKey, evalContext, { metric: trackingEventName, value, ...(id ? { id } : {}) });
        else void this.remoteConversion(flagKey, evalContext, trackingEventName, value, id, seen?.get(flagKey));
      }
    } catch (error) {
      this.logger?.warn(`customy: track() failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async remoteConversion(flagKey: string, ctx: EvalContext, metric: string, value: number, id: string | undefined, known: string | undefined): Promise<void> {
    try {
      const treatment = known ?? (await this.remote!.remote.evaluateOne(flagKey, ctx)).treatment;
      if (treatment === "control" && known === undefined) return;
      this.remote!.remote.conversion({ id: id ?? `conv-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, flagKey, contextKey: ctx.key, treatment, metric, value });
    } catch (error) {
      this.logger?.warn(`customy: conversion not recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
