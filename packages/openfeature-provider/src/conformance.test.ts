import { describe, expect, it, vi } from "vitest";
import { CustomyServerProvider } from "./index";
import { CustomyWebProvider } from "./web";
import { FakeOpenFeatureClient } from "./harness";
import { localClient, snapshotOf } from "./fixtures";

async function server(extra: Record<string, unknown> = {}) {
  const local = localClient();
  const provider = new CustomyServerProvider({ client: local.client, ...extra });
  const client = new FakeOpenFeatureClient(provider);
  await client.init();
  return { ...local, provider, client };
}

describe("spec: forma del proveedor", () => {
  it("metadata, runsOn, events y hooks", async () => {
    const { provider } = await server();
    expect(provider.metadata.name).toBe("customy");
    expect(provider.runsOn).toBe("server");
    expect(new CustomyWebProvider({ client: localClient().client }).runsOn).toBe("client");
    for (const method of ["addHandler", "removeHandler", "removeAllHandlers", "getHandlers", "emit"]) expect(typeof (provider.events as never)[method]).toBe("function");
    expect(provider.hooks.length).toBeGreaterThan(0);
    for (const method of ["resolveBooleanEvaluation", "resolveStringEvaluation", "resolveNumberEvaluation", "resolveObjectEvaluation", "initialize", "onClose", "track"]) {
      expect(typeof (provider as never)[method]).toBe("function");
    }
  });
});

describe("spec: resolución de valores", () => {
  it("boolean: TARGETING_MATCH por regla, variante y metadata con el reasonCode del contrato", async () => {
    const { client } = await server();
    const hit = await client.boolean("checkout.v2", false, { targetingKey: "u1", plan: "pro" });
    expect(hit).toMatchObject({ value: true, variant: "on", reason: "TARGETING_MATCH" });
    expect(hit.flagMetadata).toMatchObject({ reasonCode: "rule:pro", ruleId: "pro" });
    const miss = await client.boolean("checkout.v2", true, { targetingKey: "u1", plan: "free" });
    expect(miss).toMatchObject({ value: false, variant: "off", reason: "DEFAULT" });
    expect(miss.flagMetadata.reasonCode).toBe("default");
  });

  it("segmento: TARGETING_MATCH con segment:<key>; killed: DISABLED", async () => {
    const { client } = await server();
    const vip = await client.boolean("checkout.v2", false, { targetingKey: "vip-user" });
    expect(vip.flagMetadata.reasonCode).toBe("segment:vip");
    const dead = await client.boolean("dead", true, { targetingKey: "u1" });
    expect(dead).toMatchObject({ value: false, reason: "DISABLED" });
    expect(dead.flagMetadata.reasonCode).toBe("killed");
  });

  it("string multivariante (SPLIT; sin valor propio sirve la clave), number y object", async () => {
    const { client } = await server();
    const seen = new Set<string>();
    for (let n = 0; n < 40; n += 1) {
      const banner = await client.string("banner", "z", { targetingKey: `user-${n}` });
      expect(banner.reason).toBe("SPLIT");
      expect(banner.flagMetadata.bucketBp).toBeTypeOf("number");
      seen.add(banner.value);
    }
    expect([...seen].sort()).toEqual(["A", "b"]);
    expect(await client.number("limit", 0, { targetingKey: "u1" })).toMatchObject({ value: 10, variant: "low", reason: "DEFAULT" });
    const theme = await client.object("theme", {}, { targetingKey: "u1" });
    expect(theme.value).toEqual({ mode: "dark", accent: ["a", "b"] });
    expect(JSON.parse(String(theme.flagMetadata.config))).toEqual({ variant: "d" });
  });

  it("errores: flag inexistente, tipo equivocado y sin targetingKey ⇒ valor por defecto + errorCode", async () => {
    const { provider } = await server();
    expect(await provider.resolveBooleanEvaluation("nope", true, { targetingKey: "u" })).toMatchObject({ value: true, reason: "ERROR", errorCode: "FLAG_NOT_FOUND" });
    expect(await provider.resolveBooleanEvaluation("limit", false, { targetingKey: "u" })).toMatchObject({ value: false, reason: "ERROR", errorCode: "TYPE_MISMATCH" });
    expect(await provider.resolveStringEvaluation("bad-type", "d", { targetingKey: "u" })).toMatchObject({ value: "d", errorCode: "TYPE_MISMATCH" });
    expect(await provider.resolveObjectEvaluation("limit", { a: 1 }, { targetingKey: "u" })).toMatchObject({ errorCode: "TYPE_MISMATCH" });
    expect(await provider.resolveStringEvaluation("banner", "d", {})).toMatchObject({ value: "d", errorCode: "TARGETING_KEY_MISSING" });
    // el evaluador (contrato D6) exige clave de unidad: sin ella, error `missing_context_key`, también en flags sin reparto
    expect(await provider.resolveNumberEvaluation("limit", 7, {})).toMatchObject({ value: 7, errorCode: "TARGETING_KEY_MISSING" });
  });

  it("sin instantánea: PROVIDER_NOT_READY, nunca lanza", async () => {
    const provider = new CustomyServerProvider({ clientOptions: { publishableKey: "pk", fetch: (async () => { throw new Error("offline"); }) as never } });
    await expect(provider.initialize()).rejects.toBeTruthy();
    expect(await provider.resolveBooleanEvaluation("x", true, { targetingKey: "u" })).toMatchObject({ value: true, errorCode: "PROVIDER_NOT_READY" });
  });

  it("el contexto aplana objetos y fechas hacia atributos de flags-eval", async () => {
    const { provider } = await server();
    const r = await provider.resolveBooleanEvaluation("checkout.v2", false, { targetingKey: "u", plan: "pro", account: { tier: "x" }, when: new Date(0), junk: () => 1 });
    expect(r.value).toBe(true);
  });
});

describe("spec: eventos", () => {
  it("PROVIDER_CONFIGURATION_CHANGED con flagsChanged al llegar una versión nueva (sondeo)", async () => {
    vi.useFakeTimers();
    try {
      const local = localClient();
      const provider = new CustomyServerProvider({ client: local.client, pollIntervalMs: 5_000 });
      const client = new FakeOpenFeatureClient(provider);
      await client.init();
      const changed = snapshotOf(2, { flags: snapshotOf(2).flags.map((flag) => (flag.key === "limit" ? { ...flag, defaultTreatment: "high" } : flag)) });
      local.serve(changed);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(client.seen.at(-1)).toMatchObject({ type: "PROVIDER_CONFIGURATION_CHANGED", details: { flagsChanged: ["limit"] } });
      await provider.onClose();
    } finally { vi.useRealTimers(); }
  });

  it("fallo al refrescar con snapshot ⇒ PROVIDER_STALE (sigue sirviendo); al volver ⇒ PROVIDER_READY", async () => {
    vi.useFakeTimers();
    try {
      const local = localClient();
      const provider = new CustomyServerProvider({ client: local.client, pollIntervalMs: 5_000 });
      const client = new FakeOpenFeatureClient(provider);
      await client.init();
      local.serve(new Error("down"));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(client.status).toBe("STALE");
      expect(await client.number("limit", 0, { targetingKey: "u" })).toMatchObject({ value: 10 });
      local.serve(snapshotOf(1));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(client.status).toBe("READY");
      await provider.onClose();
    } finally { vi.useRealTimers(); }
  });

  it("un manejador que lanza no rompe a los demás", async () => {
    const { provider } = await server();
    const ok = vi.fn();
    provider.events.addHandler("PROVIDER_READY", () => { throw new Error("boom"); });
    provider.events.addHandler("PROVIDER_READY", ok);
    provider.events.emit("PROVIDER_READY");
    expect(ok).toHaveBeenCalledOnce();
  });
});

describe("spec: track() y exposición", () => {
  it("el hook after registra la exposición una vez; sin valor entregado (error) no registra", async () => {
    const { client, tracked } = await server();
    await client.boolean("checkout.v2", false, { targetingKey: "u1", plan: "pro" });
    await client.boolean("nope", false, { targetingKey: "u1" });
    expect(tracked.map((t) => [t.detail.flagKey, t.detail.treatment, t.context.key])).toEqual([["checkout.v2", "on", "u1"]]);
  });

  it("track() atribuye la conversión a los flags que la unidad ha visto, con métrica, importe e id idempotente", async () => {
    const { client, conversions } = await server();
    await client.boolean("checkout.v2", false, { targetingKey: "u1", plan: "pro" });
    await client.number("limit", 0, { targetingKey: "u1" });
    client.track("purchase", { targetingKey: "u1", plan: "pro" }, { value: 49.9, eventId: "ord-1" });
    expect(conversions.map((c) => [c.flagKey, c.options])).toEqual([
      ["checkout.v2", { metric: "purchase", value: 49.9, id: "ord-1:checkout.v2" }],
      ["limit", { metric: "purchase", value: 49.9, id: "ord-1:limit" }],
    ]);
  });

  it("track() con flagKey explícito, valor inválido a 0, y sin targetingKey o sin exposición no hace nada", async () => {
    const { client, conversions } = await server();
    client.track("signup", { targetingKey: "u9" }, { flagKey: "banner", value: -3 });
    expect(conversions).toHaveLength(1);
    expect(conversions[0]!.options).toMatchObject({ metric: "signup", value: 0 });
    client.track("signup", {}, { flagKey: "banner" });
    client.track("signup", { targetingKey: "never-seen" });
    expect(conversions).toHaveLength(1);
  });
});

describe("spec: ciclo de vida", () => {
  it("onClose corta el sondeo y envía lo pendiente", async () => {
    const local = localClient();
    const flush = vi.fn(async () => 0);
    (local.client as { flush?: () => Promise<number> }).flush = flush;
    const provider = new CustomyServerProvider({ client: local.client, pollIntervalMs: 5_000 });
    await provider.initialize();
    await provider.onClose();
    expect(flush).toHaveBeenCalled();
  });
});
