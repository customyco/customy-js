/**
 * Del contrato del evaluador (`reasonCode`, D6) al de OpenFeature, y del contexto
 * de OpenFeature al de `flags-eval`. Todo es función pura: es lo que los tests de
 * paridad recorren contra los 3 300 vectores compartidos.
 */
import type { EvalContext, EvaluationDetail } from "@customyai/access/flags";
import type { ErrorCode, EvaluationContext, FlagMetadata, JsonValue, ResolutionDetails, StandardReason } from "./spec";

export type FlagKind = "boolean" | "string" | "number" | "object";

/** Lo mínimo que el proveedor lee de un resultado del evaluador (local o remoto). */
export type EvaluatedFlag = Pick<EvaluationDetail, "flagKey" | "treatment" | "value" | "reason" | "reasonCode"> &
  Partial<Pick<EvaluationDetail, "ruleId" | "bucket" | "bucketBp" | "config" | "error">>;

/** `rule:<id>` y `segment:<key>` son TARGETING_MATCH; `rollout` es SPLIT; `off` y `killed` son DISABLED. */
export function reasonOf(reasonCode: string): StandardReason {
  if (reasonCode === "rollout") return "SPLIT";
  if (reasonCode === "off" || reasonCode === "killed") return "DISABLED";
  if (reasonCode === "default" || reasonCode === "prerequisite_failed") return "DEFAULT";
  if (reasonCode === "error") return "ERROR";
  if (reasonCode.startsWith("rule:") || reasonCode.startsWith("segment:")) return "TARGETING_MATCH";
  return "UNKNOWN";
}

export function errorCodeOf(error: string | undefined): ErrorCode {
  if (error === "flag_not_found") return "FLAG_NOT_FOUND";
  if (error === "snapshot_not_loaded") return "PROVIDER_NOT_READY";
  if (error === "missing_context_key") return "TARGETING_KEY_MISSING";
  return "GENERAL";
}

const isObject = (value: unknown): value is Record<string, unknown> | unknown[] => value !== null && typeof value === "object";

function typed(kind: FlagKind, detail: EvaluatedFlag): unknown {
  // Un tratamiento sin valor propio de un flag de cadena se sirve por su clave (variante).
  if (kind === "string" && detail.value === undefined) return detail.treatment;
  return detail.value;
}

const matches = (kind: FlagKind, value: unknown): boolean =>
  kind === "object" ? isObject(value) : typeof value === kind;

export function flagMetadataOf(detail: EvaluatedFlag): FlagMetadata {
  const metadata: FlagMetadata = { reasonCode: detail.reasonCode, legacyReason: detail.reason };
  if (detail.ruleId !== undefined) metadata.ruleId = detail.ruleId;
  if (detail.bucket !== undefined) metadata.bucket = detail.bucket;
  if (detail.bucketBp !== undefined) metadata.bucketBp = detail.bucketBp;
  if (detail.config !== undefined) metadata.config = JSON.stringify(detail.config);
  return metadata;
}

/** Resolución OpenFeature de un resultado del evaluador. Nunca lanza: error ⇒ valor por defecto del código. */
export function toResolution<T>(kind: FlagKind, detail: EvaluatedFlag, defaultValue: T): ResolutionDetails<T> {
  const flagMetadata = flagMetadataOf(detail);
  if (detail.reasonCode === "error") {
    const errorCode = errorCodeOf(detail.error);
    return { value: defaultValue, reason: "ERROR", errorCode, errorMessage: detail.error ?? "evaluation error", flagMetadata };
  }
  const value = typed(kind, detail);
  if (!matches(kind, value)) {
    return {
      value: defaultValue, variant: detail.treatment, reason: "ERROR", errorCode: "TYPE_MISMATCH",
      errorMessage: `Flag "${detail.flagKey}" resolves to ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}, expected ${kind}`, flagMetadata,
    };
  }
  return { value: (kind === "object" ? (value as JsonValue) : value) as T, variant: detail.treatment, reason: reasonOf(detail.reasonCode), flagMetadata };
}

const MAX_FLATTEN_DEPTH = 3;

function flatten(prefix: string, value: unknown, into: NonNullable<EvalContext["attributes"]>, depth: number): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") { into[prefix] = value; return; }
  if (value instanceof Date) { if (!Number.isNaN(value.getTime())) into[prefix] = value.toISOString(); return; }
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string | number | boolean => ["string", "number", "boolean"].includes(typeof item));
    into[prefix] = items;
    return;
  }
  if (isObject(value) && depth < MAX_FLATTEN_DEPTH) {
    for (const [key, inner] of Object.entries(value)) flatten(`${prefix}.${key}`, inner, into, depth + 1);
  }
}

/**
 * Contexto de OpenFeature → contexto de flags-eval: `targetingKey` es la clave
 * de la unidad; el resto son atributos (los objetos se aplanan con punto, las
 * fechas van en ISO 8601; lo que no es primitivo ni lista de primitivos se descarta).
 */
export function toEvalContext(context: EvaluationContext | undefined): EvalContext & { hasKey: boolean } {
  const attributes: NonNullable<EvalContext["attributes"]> = {};
  const key = typeof context?.targetingKey === "string" ? context.targetingKey : "";
  for (const [name, value] of Object.entries(context ?? {})) {
    if (name === "targetingKey" || value === undefined) continue;
    flatten(name, value, attributes, 1);
  }
  return { key, attributes, hasKey: key.length > 0 };
}
