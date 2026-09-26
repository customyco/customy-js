import { describe, expect, it } from "vitest";
import {
  bucket,
  createSegmentResolver,
  evaluate,
  type FlagDefinition,
} from "./index.js";

const baseFlag: FlagDefinition = {
  key: "checkout.redesign",
  type: "boolean",
  status: "active",
  defaultTreatment: "off",
  treatments: [
    { key: "off", value: false },
    { key: "on", value: true, config: { layout: "compact" } },
  ],
};

describe("flags-eval", () => {
  it("buckets deterministically and keeps values in the 0..99 range", () => {
    const first = bucket("checkout.redesign", "user_123", "prod");
    const second = bucket("checkout.redesign", "user_123", "prod");

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
  });

  it("serves killed flags from the default treatment", () => {
    const detail = evaluate({ ...baseFlag, status: "killed" }, { key: "user_1" });

    expect(detail.treatment).toBe("off");
    expect(detail.value).toBe(false);
    expect(detail.reason).toBe("killed");
  });

  it("evaluates ordered targeting rules with attributes", () => {
    const detail = evaluate(
      {
        ...baseFlag,
        targetingRules: [
          {
            id: "enterprise-plan",
            condition: { attribute: "plan", op: "equals", value: "enterprise" },
            serveTreatment: "on",
          },
        ],
      },
      { key: "user_1", attributes: { plan: "enterprise" } },
    );

    expect(detail.treatment).toBe("on");
    expect(detail.value).toBe(true);
    expect(detail.config).toEqual({ layout: "compact" });
    expect(detail.reason).toBe("rule_match");
    expect(detail.ruleId).toBe("enterprise-plan");
  });

  it("supports all/any/not condition groups", () => {
    const detail = evaluate(
      {
        ...baseFlag,
        targetingRules: [
          {
            id: "latam-paid-not-beta",
            condition: {
              all: [
                { attribute: "region", op: "in", value: ["CO", "MX", "BR"] },
                { attribute: "planRank", op: "gte", value: 2 },
                { not: { attribute: "channel", op: "equals", value: "beta" } },
              ],
            },
            serveTreatment: "on",
          },
        ],
      },
      { key: "user_2", attributes: { region: "CO", planRank: 3, channel: "stable" } },
    );

    expect(detail.treatment).toBe("on");
  });

  it("resolves segment membership without network calls", () => {
    const segmentContains = createSegmentResolver([
      { key: "vip", members: ["user_vip"] },
      { key: "enterprise-us", condition: { all: [{ attribute: "country", op: "equals", value: "US" }, { attribute: "plan", op: "equals", value: "enterprise" }] } },
    ]);

    const byMember = evaluate(
      {
        ...baseFlag,
        targetingRules: [{ id: "vip-users", condition: { op: "segment", value: "vip" }, serveTreatment: "on" }],
      },
      { key: "user_vip" },
      { treatmentOf: () => undefined, segmentContains },
    );
    const byRule = evaluate(
      {
        ...baseFlag,
        targetingRules: [{ id: "enterprise-us", condition: { op: "segment", value: "enterprise-us" }, serveTreatment: "on" }],
      },
      { key: "user_3", attributes: { country: "US", plan: "enterprise" } },
      { treatmentOf: () => undefined, segmentContains },
    );

    expect(byMember.treatment).toBe("on");
    expect(byRule.treatment).toBe("on");
  });

  it("keeps rollout expansion stable for already-included users", () => {
    const users = Array.from({ length: 500 }, (_, index) => `user_${index}`);
    const tenPercent = (weight: number): FlagDefinition => ({
      ...baseFlag,
      targetingRules: [
        {
          id: `rollout-${weight}`,
          rollout: {
            variants: [
              { treatment: "on", weight },
              { treatment: "off", weight: 100 - weight },
            ],
            salt: "stable-release",
          },
        },
      ],
    });

    const firstCohort = new Set(users.filter((key) => evaluate(tenPercent(10), { key }).treatment === "on"));
    const expandedCohort = new Set(users.filter((key) => evaluate(tenPercent(50), { key }).treatment === "on"));

    for (const key of firstCohort) {
      expect(expandedCohort.has(key)).toBe(true);
    }
    expect(expandedCohort.size).toBeGreaterThan(firstCohort.size);
  });

  it("supports weighted multivariate treatments", () => {
    const flag: FlagDefinition = {
      key: "pricing.copy",
      type: "multivariate",
      status: "active",
      defaultTreatment: "control",
      treatments: [
        { key: "control", value: { headline: "Start" } },
        { key: "variant_a", value: { headline: "Grow faster" } },
        { key: "variant_b", value: { headline: "Scale safely" } },
      ],
      targetingRules: [
        {
          id: "experiment",
          rollout: {
            variants: [
              { treatment: "control", weight: 34 },
              { treatment: "variant_a", weight: 33 },
              { treatment: "variant_b", weight: 33 },
            ],
          },
        },
      ],
    };

    const treatments = new Set(Array.from({ length: 200 }, (_, index) => evaluate(flag, { key: `user_${index}` }).treatment));

    expect(treatments).toContain("control");
    expect(treatments).toContain("variant_a");
    expect(treatments).toContain("variant_b");
  });

  it("blocks evaluation when prerequisites fail", () => {
    const detail = evaluate(
      {
        ...baseFlag,
        prerequisites: [{ dependsOn: "checkout.enabled", requiredTreatment: "on" }],
        targetingRules: [{ id: "all", serveTreatment: "on" }],
      },
      { key: "user_1" },
      { treatmentOf: () => "off" },
    );

    expect(detail.treatment).toBe("off");
    expect(detail.reason).toBe("prerequisite_failed");
  });

  it("returns a safe default instead of throwing on malformed regex", () => {
    const detail = evaluate(
      {
        ...baseFlag,
        targetingRules: [{ id: "bad-regex", condition: { attribute: "email", op: "regex", value: "[" }, serveTreatment: "on" }],
      },
      { key: "user_1", attributes: { email: "a@example.com" } },
    );

    expect(detail.treatment).toBe("off");
    expect(detail.reason).toBe("error");
  });
});
