/**
 * Los tipos mínimos del spec de OpenFeature que el proveedor necesita, en forma
 * estructural: no se importa `@openfeature/*` (ni como dependencia ni como peer)
 * porque el SDK de OpenFeature valida el proveedor por su forma, y así el mismo
 * paquete sirve a `@openfeature/server-sdk`, `@openfeature/web-sdk` y a cualquier
 * otra implementación del spec. Los nombres y valores son los del spec.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type EvaluationContextValue = unknown;
export type EvaluationContext = { targetingKey?: string; [key: string]: EvaluationContextValue };

export type ErrorCode =
  | "PROVIDER_NOT_READY"
  | "PROVIDER_FATAL"
  | "FLAG_NOT_FOUND"
  | "PARSE_ERROR"
  | "TYPE_MISMATCH"
  | "TARGETING_KEY_MISSING"
  | "INVALID_CONTEXT"
  | "GENERAL";

/** Razones estándar del spec. */
export type StandardReason = "STATIC" | "DEFAULT" | "TARGETING_MATCH" | "SPLIT" | "CACHED" | "DISABLED" | "UNKNOWN" | "STALE" | "ERROR";

export type FlagMetadata = Record<string, string | number | boolean>;

export type ResolutionDetails<T> = {
  value: T;
  variant?: string;
  reason?: StandardReason | string;
  errorCode?: ErrorCode;
  errorMessage?: string;
  flagMetadata?: FlagMetadata;
};

export type ProviderEventType =
  | "PROVIDER_READY"
  | "PROVIDER_ERROR"
  | "PROVIDER_CONFIGURATION_CHANGED"
  | "PROVIDER_STALE"
  | "PROVIDER_CONTEXT_CHANGED";

export type ProviderEventDetails = {
  message?: string;
  flagsChanged?: string[];
  errorCode?: ErrorCode;
  eventMetadata?: FlagMetadata;
};

export type EventHandler = (details?: ProviderEventDetails) => void;

export type ProviderEmitter = {
  addHandler(type: ProviderEventType, handler: EventHandler): void;
  removeHandler(type: ProviderEventType, handler: EventHandler): void;
  removeAllHandlers(type?: ProviderEventType): void;
  getHandlers(type: ProviderEventType): EventHandler[];
  emit(type: ProviderEventType, details?: ProviderEventDetails): void;
};

export type Logger = { error(...args: unknown[]): void; warn(...args: unknown[]): void; info(...args: unknown[]): void; debug(...args: unknown[]): void };

export type TrackingEventDetails = { value?: number; [key: string]: unknown };

export type HookContext = { flagKey: string; defaultValue: unknown; flagValueType: string; context: EvaluationContext; providerMetadata: { name: string } };
export type EvaluationDetails<T> = ResolutionDetails<T> & { flagKey: string; flagMetadata: FlagMetadata };

export type Hook = {
  after?(hookContext: HookContext, details: EvaluationDetails<unknown>, hints?: unknown): void;
};
