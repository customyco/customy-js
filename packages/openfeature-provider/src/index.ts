/**
 * @customyai/openfeature-provider — proveedor de OpenFeature para Customy
 * Experiments, para SERVIDOR (`@openfeature/server-sdk`). El de navegador está en
 * `@customyai/openfeature-provider/web`.
 *
 * ```ts
 * import { OpenFeature } from "@openfeature/server-sdk";
 * import { CustomyServerProvider } from "@customyai/openfeature-provider";
 *
 * await OpenFeature.setProviderAndWait(new CustomyServerProvider({
 *   clientOptions: { accessToken: process.env.CUSTOMY_TOKEN! },  // local: instantánea en proceso
 *   realtimeUrl: "https://realtime.customy.ai",
 * }));
 * const flags = OpenFeature.getClient();
 * await flags.getBooleanValue("checkout.v2", false, { targetingKey: user.id, plan: "pro" });
 * ```
 *
 * Dos modos: `local` (por defecto; evalúa la instantánea publicada en el proceso)
 * y `remote` (`{ mode: "remote", baseUrl, accessToken }`; evalúa en Customy
 * Experiments por `POST /v1/flags/evaluate`, para lenguajes sin SDK nativo).
 * Razón y variante salen del contrato `reasonCode` del evaluador. Nunca lanza ni
 * bloquea: ante un fallo devuelve el valor por defecto del código con `ERROR`.
 */
import { ProviderCore, PROVIDER_NAME } from "./core";
import type { ProviderOptions } from "./engine";
import type { EvaluationContext, Hook, JsonValue, Logger, ProviderEmitter, ResolutionDetails, TrackingEventDetails } from "./spec";

export type { ProviderOptions, LocalOptions, FlagsClientLike } from "./engine";
export type { RemoteOptions } from "./remote";
export { RemoteError } from "./remote";
export { reasonOf, toEvalContext, toResolution, errorCodeOf, flagMetadataOf } from "./mapping";
export type { EvaluatedFlag, FlagKind } from "./mapping";
export { ProviderEvents } from "./emitter";
export { changedFlags } from "./engine";
export type * from "./spec";

export class CustomyServerProvider {
  readonly metadata = { name: PROVIDER_NAME } as const;
  readonly runsOn = "server" as const;
  readonly events: ProviderEmitter;
  readonly hooks: Hook[];
  private readonly core: ProviderCore;

  constructor(options: ProviderOptions & { logger?: Logger } = {}) {
    this.core = new ProviderCore(options, options.logger);
    this.events = this.core.events;
    this.hooks = this.core.hooks;
  }

  /** El SDK la espera antes de servir; falla si no hay instantánea ni red (modo local). */
  initialize(): Promise<void> { return this.core.start(); }
  onClose(): Promise<void> { return this.core.stop(); }
  /** Fuerza el envío de exposiciones y conversiones pendientes. */
  flush(): Promise<void> { return this.core.flush(); }

  private async resolve<T>(kind: "boolean" | "string" | "number" | "object", flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
    const result = this.core.local ? this.core.evalLocal(flagKey, context) : await this.core.evalRemote(flagKey, context);
    return this.core.resolution(kind, flagKey, defaultValue, result);
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, _logger?: Logger): Promise<ResolutionDetails<boolean>> { return this.resolve("boolean", flagKey, defaultValue, context); }
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, _logger?: Logger): Promise<ResolutionDetails<string>> { return this.resolve("string", flagKey, defaultValue, context); }
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, _logger?: Logger): Promise<ResolutionDetails<number>> { return this.resolve("number", flagKey, defaultValue, context); }
  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, _logger?: Logger): Promise<ResolutionDetails<T>> { return this.resolve("object", flagKey, defaultValue, context); }

  track(trackingEventName: string, context: EvaluationContext, trackingEventDetails?: TrackingEventDetails): void {
    this.core.track(trackingEventName, context, trackingEventDetails);
  }
}
