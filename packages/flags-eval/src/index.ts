import { bucketRatio as bucketRatioForRollout } from "./hash";

export type FlagPrimitive = string | number | boolean;
export type FlagAttributeValue = FlagPrimitive | null | undefined | FlagPrimitive[];
export type FlagAttributes = Record<string, FlagAttributeValue>;

export interface EvalContext {
  key: string;
  attributes?: FlagAttributes;
}

export type FlagType = "boolean" | "string" | "number" | "json" | "multivariate";
export type FlagStatus = "active" | "killed" | "archived";

export interface FlagTreatment {
  key: string;
  value?: unknown;
  config?: Record<string, unknown>;
  weight?: number;
}

export type FlagConditionOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "regex"
  | "semver_gt"
  | "semver_gte"
  | "semver_lt"
  | "semver_lte"
  | "segment";

export interface FlagCondition {
  attribute?: string;
  op: FlagConditionOperator;
  value: unknown;
}

export interface FlagConditionGroup {
  all?: Array<FlagCondition | FlagConditionGroup>;
  any?: Array<FlagCondition | FlagConditionGroup>;
  not?: FlagCondition | FlagConditionGroup;
}

export interface FlagRolloutVariant {
  treatment: string;
  weight: number;
}

export interface FlagRollout {
  variants: FlagRolloutVariant[];
  salt?: string;
}

export interface FlagTargetingRule {
  id: string;
  condition?: FlagCondition | FlagConditionGroup;
  serveTreatment?: string;
  rollout?: FlagRollout;
}

export interface FlagPrerequisite {
  dependsOn: string;
  requiredTreatment: string;
}

export interface FlagDefinition {
  key: string;
  type: FlagType;
  status: FlagStatus;
  defaultTreatment: string;
  treatments: FlagTreatment[];
  targetingRules?: FlagTargetingRule[];
  prerequisites?: FlagPrerequisite[];
  salt?: string;
}

export interface SegmentDefinition {
  key: string;
  condition?: FlagCondition | FlagConditionGroup;
  members?: string[];
}

export interface EvalDependencies {
  treatmentOf(flagKey: string): string | undefined;
  segmentContains?(segmentKey: string, context: EvalContext): boolean | undefined;
}

export interface EvaluationDetail {
  flagKey: string;
  treatment: string;
  value: unknown;
  config?: Record<string, unknown>;
  reason:
    | "killed"
    | "archived"
    | "prerequisite_failed"
    | "rule_match"
    | "rollout"
    | "default"
    | "error";
  ruleId?: string;
  bucket?: number;
  error?: string;
}

const EMPTY_DEPS: EvalDependencies = {
  treatmentOf: () => undefined,
};

// Bucketing is shared with the experiments engine so flags, page
// personalization and landing experiments cannot drift into different hashes
// for the same visitor. Re-exported here to keep the flags-eval surface
// unchanged; the values are bit-identical to the implementation this file
// used to carry.
export { bucket, bucketRatio, murmur3_32 } from "./hash";

export function evaluate(flag: FlagDefinition, context: EvalContext, deps: EvalDependencies = EMPTY_DEPS): EvaluationDetail {
  try {
    const defaultDetail = serve(flag, flag.defaultTreatment, "default");

    if (!context.key) {
      return { ...defaultDetail, reason: "error", error: "missing_context_key" };
    }
    if (flag.status === "killed") return serve(flag, flag.defaultTreatment, "killed");
    if (flag.status === "archived") return serve(flag, flag.defaultTreatment, "archived");

    for (const prerequisite of flag.prerequisites ?? []) {
      if (deps.treatmentOf(prerequisite.dependsOn) !== prerequisite.requiredTreatment) {
        return serve(flag, flag.defaultTreatment, "prerequisite_failed");
      }
    }

    for (const rule of flag.targetingRules ?? []) {
      if (!rule.condition || matches(rule.condition, context, deps)) {
        if (rule.rollout) {
          const salt = rule.rollout.salt ?? flag.salt ?? "";
          const ratio = bucketRatioForRollout(flag.key, context.key, salt);
          const selected = pickByRollout(rule.rollout, ratio);
          return {
            ...serve(flag, selected ?? flag.defaultTreatment, "rollout"),
            ruleId: rule.id,
            bucket: Math.floor(ratio * 100),
          };
        }
        return {
          ...serve(flag, rule.serveTreatment ?? flag.defaultTreatment, "rule_match"),
          ruleId: rule.id,
        };
      }
    }

    return defaultDetail;
  } catch (err) {
    return {
      ...serve(flag, flag.defaultTreatment, "error"),
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

export function matches(
  condition: FlagCondition | FlagConditionGroup,
  context: EvalContext,
  deps: Pick<EvalDependencies, "segmentContains"> = {},
): boolean {
  if ("all" in condition && condition.all) return condition.all.every((item) => matches(item, context, deps));
  if ("any" in condition && condition.any) return condition.any.some((item) => matches(item, context, deps));
  if ("not" in condition && condition.not) return !matches(condition.not, context, deps);

  const leaf = condition as FlagCondition;
  if (leaf.op === "segment") {
    const segmentKey = String(leaf.value ?? "");
    return deps.segmentContains?.(segmentKey, context) === true;
  }

  const actual = leaf.attribute ? context.attributes?.[leaf.attribute] : undefined;
  return compareValue(actual, leaf.op, leaf.value);
}

export function createSegmentResolver(segments: SegmentDefinition[]): EvalDependencies["segmentContains"] {
  const byKey = new Map(segments.map((segment) => [segment.key, segment]));
  return (segmentKey, context) => {
    const segment = byKey.get(segmentKey);
    if (!segment) return false;
    if (segment.members?.includes(context.key)) return true;
    if (!segment.condition) return false;
    return matches(segment.condition, context, { segmentContains: createSegmentResolver(segments) });
  };
}

export function pickByRollout(rollout: FlagRollout, ratio: number): string | undefined {
  const total = rollout.variants.reduce((sum, variant) => sum + Math.max(0, variant.weight), 0);
  if (total <= 0) return undefined;

  const normalized = Math.min(Math.max(ratio, 0), 0.9999999999) * total;
  let cursor = 0;
  for (const variant of rollout.variants) {
    cursor += Math.max(0, variant.weight);
    if (normalized < cursor) return variant.treatment;
  }
  return rollout.variants.at(-1)?.treatment;
}


function serve(flag: FlagDefinition, treatmentKey: string, reason: EvaluationDetail["reason"]): EvaluationDetail {
  const treatment = flag.treatments.find((item) => item.key === treatmentKey);
  return {
    flagKey: flag.key,
    treatment: treatment?.key ?? flag.defaultTreatment,
    value: treatment?.value,
    config: treatment?.config,
    reason,
  };
}

function compareValue(actual: FlagAttributeValue, op: FlagConditionOperator, expected: unknown): boolean {
  switch (op) {
    case "equals":
      return scalarEquals(actual, expected);
    case "not_equals":
      return !scalarEquals(actual, expected);
    case "in":
      return Array.isArray(expected) && flatten(actual).some((item) => expected.includes(item));
    case "not_in":
      return Array.isArray(expected) && !flatten(actual).some((item) => expected.includes(item));
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return flatten(actual).some((item) => String(item).includes(String(expected)));
    case "regex":
      return new RegExp(String(expected)).test(String(actual ?? ""));
    case "semver_gt":
      return compareSemver(String(actual ?? ""), String(expected ?? "")) > 0;
    case "semver_gte":
      return compareSemver(String(actual ?? ""), String(expected ?? "")) >= 0;
    case "semver_lt":
      return compareSemver(String(actual ?? ""), String(expected ?? "")) < 0;
    case "semver_lte":
      return compareSemver(String(actual ?? ""), String(expected ?? "")) <= 0;
    case "segment":
      return false;
  }
}

function scalarEquals(actual: FlagAttributeValue, expected: unknown): boolean {
  return flatten(actual).some((item) => item === expected);
}

function flatten(value: FlagAttributeValue): FlagPrimitive[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function parseSemver(value: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = value.replace(/^[^\d]*/, "").split(/[.-]/);
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}
