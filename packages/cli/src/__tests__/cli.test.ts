import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../cli";
import { generateAppTypes, schemaToType } from "../codegen";
import { validateManifest } from "../apps";

const manifest = {
  schema: "app/v1", key: "example-app", name: "Example App",
  origins: { staging: "https://app.staging.example.test" },
  events: [{ name: "habit.completed", type: "track", schemaVersion: 1, purposes: ["analytics"],
    properties: { type: "object", required: ["habitId"], properties: { habitId: { type: "string" }, streak: { type: "integer" }, mood: { enum: ["good", "bad"] } }, additionalProperties: false } }],
  capabilities: [{ lookupKey: "habits.unlimited", name: "Unlimited", type: "boolean" }],
  plans: [{ code: "pro", name: "Pro", capabilities: { "habits.unlimited": true } }],
  meters: [{ code: "coach.runs", aggregation: "count", unit: "run" }],
};

function workspace(content: unknown = manifest) {
  const dir = mkdtempSync(path.join(tmpdir(), "customy-cli-"));
  writeFileSync(path.join(dir, "customy.app.json"), JSON.stringify(content));
  const lines: string[] = [];
  const errors: string[] = [];
  const io = (extra: Partial<CliIo> = {}): CliIo => ({ cwd: dir, env: {}, out: (l) => lines.push(l), err: (l) => errors.push(l), ...extra });
  return { dir, lines, errors, io };
}

describe("codegen", () => {
  it("convierte JSON Schema en tipos y genera los nombres declarados", () => {
    expect(schemaToType({ type: "array", items: { type: ["string", "null"] } })).toBe("Array<string | null>");
    const validated = validateManifest(manifest);
    if (!validated.ok) throw new Error("manifest fixture must be valid");
    const source = generateAppTypes(validated.manifest);
    expect(source).toContain('export type CustomyEventName = "habit.completed";');
    expect(source).toMatch(/"habit\.completed": \{\n\s+habitId: string;\n\s+streak\?: number;\n\s+mood\?: "good" \| "bad";/);
    expect(source).toContain('export type CustomyCapability = "habits.unlimited";');
    expect(source).toContain('export type CustomyMeter = "coach.runs";');
  });
});

describe("customy apps", () => {
  it("validate informa problemas con su ruta y falla", async () => {
    const bad = workspace({ ...manifest, plans: [{ code: "pro", name: "Pro", capabilities: { missing: true } }] });
    expect(await runCli(["apps", "validate"], bad.io())).toBe(1);
    expect(bad.errors).toContain("✗ plans.0.capabilities.missing: CAPABILITY_UNDECLARED");
    const good = workspace();
    expect(await runCli(["apps", "validate"], good.io())).toBe(0);
  });

  it("codegen escribe el archivo de tipos", async () => {
    const w = workspace();
    expect(await runCli(["apps", "codegen", "--out", "src/customy.generated.ts"], w.io())).toBe(0);
    expect(readFileSync(path.join(w.dir, "src/customy.generated.ts"), "utf8")).toContain("CustomyEventProperties");
  });

  it("sync instala, y en ejecuciones siguientes publica la versión nueva sobre la revisión actual", async () => {
    const calls: Array<{ method: string; url: string; body: Record<string, unknown>; auth: string }> = [];
    let installed = false;
    const fetcher = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ method: String(init.method), url, body, auth: String((init.headers as Record<string, string>).authorization) });
      if (url.endsWith("/connected-applications/install")) {
        const replayed = installed; installed = true;
        return Response.json({ replayed, connection: { applicationId: "app_1", environmentId: "env_app", revision: 3 } }, { status: replayed ? 200 : 201 });
      }
      return Response.json({ revision: 4, unchanged: false });
    }) as typeof fetch;
    const env = { CUSTOMY_ACCESS_URL: "https://access.example.test", CUSTOMY_ACCESS_TOKEN: "admin-token" };
    const w = workspace();
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], w.io({ env, fetch: fetcher }))).toBe(0);
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], w.io({ env, fetch: fetcher }))).toBe(0);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://access.example.test/api/admin/env/env_ws/connected-applications/install",
      "POST https://access.example.test/api/admin/env/env_ws/connected-applications/install",
      "PUT https://access.example.test/api/admin/env/env_app/connected-application/manifest",
    ]);
    expect(calls[2].body).toMatchObject({ expectedRevision: 3, manifest: { key: "example-app" } });
    expect(calls.every((c) => c.auth === "Bearer admin-token")).toBe(true);
    expect(w.lines).toEqual(expect.arrayContaining([expect.stringContaining("instalada"), expect.stringContaining("actualizada")]));
  });

  it("sync informa la reconciliación de cada producto y falla si alguno no quedó", async () => {
    const env = { CUSTOMY_ACCESS_URL: "https://access.example.test", CUSTOMY_ACCESS_TOKEN: "admin-token" };
    const respond = (data: unknown) => (async (url: string) => url.endsWith("/install")
      ? Response.json({ replayed: true, connection: { applicationId: "app_1", environmentId: "env_app", revision: 3 } })
      : Response.json({ revision: 3, unchanged: true, reconciliation: { data } })) as unknown as typeof fetch;
    const ok = workspace();
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], ok.io({ env, fetch: respond({ status: "reconciled", changed: true, resourceId: "source_1" }) }))).toBe(0);
    expect(ok.lines).toEqual(expect.arrayContaining([expect.stringContaining("sin cambios"), "✓ data: actualizado (source_1)"]));
    const failed = workspace();
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], failed.io({ env, fetch: respond({ status: "failed", code: "DATA_APP_SCHEMA_VERSION_REUSED" }) }))).toBe(1);
    expect(failed.errors).toEqual([expect.stringContaining("data: DATA_APP_SCHEMA_VERSION_REUSED")]);
  });

  it("sync exige credenciales por entorno, rechaza URLs inseguras y muestra el código del servidor", async () => {
    const w = workspace();
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], w.io())).toBe(2);
    const insecure = { CUSTOMY_ACCESS_URL: "http://access.example.test", CUSTOMY_ACCESS_TOKEN: "t" };
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], w.io({ env: insecure }))).toBe(1);
    expect(w.errors.at(-1)).toMatch(/ACCESS_URL_INSECURE/);
    const denied = (async () => Response.json({ code: "CONNECTION_ADMIN_REQUIRED" }, { status: 403 })) as unknown as typeof fetch;
    expect(await runCli(["apps", "sync", "--workspace-env", "env_ws"], w.io({ env: { ...insecure, CUSTOMY_ACCESS_URL: "https://a.example.test" }, fetch: denied }))).toBe(1);
    expect(w.errors.at(-1)).toMatch(/CONNECTION_ADMIN_REQUIRED \(403\)/);
  });
});
