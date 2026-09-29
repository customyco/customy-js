import type { CustomyFlagsSnapshot, EvalContext, EvaluationDetail } from "@customyai/access/flags";
import { createFlagsClient } from "@customyai/access/flags";
import type { FlagsClientLike } from "./engine";

export const flags: CustomyFlagsSnapshot["flags"] = [
  { key: "checkout.v2", type: "boolean", status: "active", defaultTreatment: "off", treatments: [{ key: "on", value: true }, { key: "off", value: false }],
    targetingRules: [
      { id: "pro", condition: { attribute: "plan", op: "equals", value: "pro" }, serveTreatment: "on" },
      { id: "vip", condition: { op: "segment", value: "vip" }, serveTreatment: "on" },
    ] },
  { key: "banner", type: "multivariate", status: "active", defaultTreatment: "a", treatments: [{ key: "a", value: "A" }, { key: "b" }],
    targetingRules: [{ id: "split", rollout: { variants: [{ treatment: "a", weight: 50 }, { treatment: "b", weight: 50 }] } }] },
  { key: "limit", type: "number", status: "active", defaultTreatment: "low", treatments: [{ key: "low", value: 10 }, { key: "high", value: 100 }] },
  { key: "theme", type: "json", status: "active", defaultTreatment: "dark", treatments: [{ key: "dark", value: { mode: "dark", accent: ["a", "b"] }, config: { variant: "d" } }] },
  { key: "bad-type", type: "string", status: "active", defaultTreatment: "x", treatments: [{ key: "x", value: 42 }] },
  { key: "dead", type: "boolean", status: "killed", defaultTreatment: "off", treatments: [{ key: "on", value: true }, { key: "off", value: false }] },
];

export const snapshotOf = (version: number, overrides: Partial<CustomyFlagsSnapshot> = {}): CustomyFlagsSnapshot => ({
  schemaVersion: "2026-06-fme", organizationId: "o", projectId: "p", environmentId: "e", version, generatedAt: "2026-10-02T00:00:00.000Z",
  flags, segments: [{ key: "vip", members: ["vip-user"] }], ...overrides,
});

/** Cliente local real sobre una instantánea inyectada; `refresh` devuelve lo que se programe. */
export function localClient(initial = snapshotOf(1)) {
  const client = createFlagsClient({ publishableKey: "pk_test", snapshot: initial, fetch: (async () => { throw new Error("no network"); }) as never });
  const tracked: Array<{ detail: EvaluationDetail; context: EvalContext }> = [];
  const conversions: Array<{ flagKey: string; context: EvalContext; options?: unknown }> = [];
  const original = { track: client.track.bind(client), conv: client.trackConversion.bind(client) };
  client.track = (detail, context) => { tracked.push({ detail, context }); original.track(detail, context); };
  client.trackConversion = (flagKey, context, options) => { conversions.push({ flagKey, context, options }); return original.conv(flagKey, context, options); };
  let next: CustomyFlagsSnapshot | Error = initial;
  client.refresh = async () => { if (next instanceof Error) throw next; return next; };
  return { client: client as FlagsClientLike, tracked, conversions, serve: (value: CustomyFlagsSnapshot | Error) => { next = value; } };
}
