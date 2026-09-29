import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../cli";

const BASE = "https://experiments.fixture.invalid";
const TOKEN = "cex_secret_fixture_token";
type Call = { url: string; method: string; headers: Headers; body?: string };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function run(argv: string[], replies: Response[] = [], env: Record<string, string | undefined> = { CUSTOMY_EXPERIMENTS_URL: BASE, CUSTOMY_EXPERIMENTS_TOKEN: TOKEN }, cwd = tmpdir()) {
  const calls: Call[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : undefined });
    const next = replies.shift();
    if (!next) throw new Error("sin respuesta programada");
    return next;
  }) as typeof globalThis.fetch;
  const io: CliIo = { cwd, env, out: (l) => out.push(l), err: (l) => err.push(l), fetch };
  return { code: runCli(argv, io), calls, out, err };
}

const fileWith = (content: unknown) => {
  const dir = mkdtempSync(path.join(tmpdir(), "customy-exp-"));
  writeFileSync(path.join(dir, "body.json"), JSON.stringify(content));
  return dir;
};

describe("customy flags | segments | experiments", () => {
  it("flags list: GET con Bearer del entorno, filtros en la query y una línea por flag", async () => {
    const r = run(["flags", "list", "--q", "check", "--limit", "5"], [json(200, { items: [{ key: "checkout.v2", name: "Checkout", status: "active" }], nextCursor: "abc" })]);
    expect(await r.code).toBe(0);
    expect(r.calls[0]).toMatchObject({ url: `${BASE}/v1/experiments/flags?q=check&limit=5`, method: "GET" });
    expect(r.calls[0]!.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(r.out).toEqual(["checkout.v2\tCheckout\tactive", "# más: --cursor abc"]);
  });

  it("flags create: cuerpo del archivo + reason, y --json devuelve la respuesta", async () => {
    const cwd = fileWith({ key: "new.flag", name: "Nuevo", kind: "boolean" });
    const r = run(["flags", "create", "--file", "body.json", "--reason", "alta desde CI", "--json"], [json(201, { key: "new.flag" })], undefined, cwd);
    expect(await r.code).toBe(0);
    expect(r.calls[0]).toMatchObject({ method: "POST", url: `${BASE}/v1/experiments/flags` });
    expect(JSON.parse(r.calls[0]!.body!)).toEqual({ key: "new.flag", name: "Nuevo", kind: "boolean", reason: "alta desde CI" });
    expect(JSON.parse(r.out.join(""))).toEqual({ key: "new.flag" });
  });

  it("toda escritura exige --reason y no sale ninguna petición", async () => {
    const r = run(["flags", "archive", "old.flag"]);
    expect(await r.code).toBe(1);
    expect(r.err[0]).toMatch(/--reason/);
    expect(r.calls).toHaveLength(0);
  });

  it("--dry-run imprime la petición y no envía nada ni exige token", async () => {
    const r = run(["flags", "kill", "checkout.v2", "--environment", "env_prod", "--reason", "incidente 42", "--dry-run"], [], { CUSTOMY_EXPERIMENTS_URL: BASE });
    expect(await r.code).toBe(0);
    expect(r.calls).toHaveLength(0);
    expect(JSON.parse(r.out.join("\n"))).toEqual({ dryRun: true, method: "POST", url: `${BASE}/v1/experiments/flags/checkout.v2/kill`, body: { environment: "env_prod", reason: "incidente 42" } });
  });

  it("la clave se escapa en la ruta y delete/archive/restore usan su verbo", async () => {
    const del = run(["flags", "delete", "a/b", "--reason", "limpieza"], [json(200, {})]);
    await del.code;
    expect(del.calls[0]).toMatchObject({ method: "DELETE", url: `${BASE}/v1/experiments/flags/a%2Fb` });
    const restore = run(["flags", "restore", "x.y", "--reason", "volver"], [json(200, { key: "x.y" })]);
    await restore.code;
    expect(restore.calls[0]).toMatchObject({ method: "POST", url: `${BASE}/v1/experiments/flags/x.y/restore` });
  });

  it("segments members add/remove con --unit-keys", async () => {
    const add = run(["segments", "members", "add", "beta", "--unit-keys", "u1, u2,,u3", "--reason", "alta beta"], [json(200, {})]);
    expect(await add.code).toBe(0);
    expect(add.calls[0]).toMatchObject({ method: "POST", url: `${BASE}/v1/experiments/segments/beta/members` });
    expect(JSON.parse(add.calls[0]!.body!)).toEqual({ unitKeys: ["u1", "u2", "u3"], reason: "alta beta" });
    const remove = run(["segments", "members", "remove", "beta", "--unit-keys", "u1", "--reason", "baja"], [json(200, {})]);
    await remove.code;
    expect(remove.calls[0]!.method).toBe("DELETE");
    expect(await run(["segments", "members", "add", "beta", "--reason", "x y z"]).code).toBe(1);
  });

  it("experiments conclude exige --decision válida; start/pause/get/update", async () => {
    expect(await run(["experiments", "conclude", "exp1", "--decision", "maybe", "--reason", "fin"]).code).toBe(1);
    const ok = run(["experiments", "conclude", "exp1", "--decision", "ship", "--reason", "ganó la B"], [json(200, { key: "exp1" })]);
    expect(await ok.code).toBe(0);
    expect(JSON.parse(ok.calls[0]!.body!)).toEqual({ decision: "ship", reason: "ganó la B" });
    const start = run(["experiments", "start", "exp1", "--reason", "arranque"], [json(200, { key: "exp1" })]);
    await start.code;
    expect(start.calls[0]).toMatchObject({ method: "POST", url: `${BASE}/v1/experiments/experiments/exp1/start` });
    const get = run(["experiments", "get", "exp1"], [json(200, { key: "exp1", name: "Hero", status: "running", description: "hipótesis" })]);
    expect(await get.code).toBe(0);
    expect(get.out).toEqual(["exp1\tHero\trunning", "hipótesis"]);
  });

  it("códigos de salida: 401/403 ⇒ 3, 409/412 ⇒ 4, otros ⇒ 1; el mensaje lleva el nombre del servidor y nunca el token", async () => {
    const denied = run(["flags", "list"], [json(403, { name: "forbidden", message: "sin capacidad" })]);
    expect(await denied.code).toBe(3);
    const conflict = run(["flags", "delete", "x", "--reason", "borrar"], [json(409, { name: "flag_in_use", message: "lo usan 2 flags", details: { dependents: ["a", "b"] } })]);
    expect(await conflict.code).toBe(4);
    expect(conflict.err.join("\n")).toContain("flag_in_use");
    expect(conflict.err.join("\n")).toContain("dependents");
    const boom = run(["flags", "list"], [new Response("<html>bad gateway</html>", { status: 502 })]);
    expect(await boom.code).toBe(1);
    expect([...denied.err, ...conflict.err, ...boom.err].join("\n")).not.toContain(TOKEN);
  });

  it("falta de origen o de credencial: error claro y ninguna petición", async () => {
    const noUrl = run(["flags", "list"], [], { CUSTOMY_EXPERIMENTS_TOKEN: TOKEN });
    expect(await noUrl.code).toBe(1);
    expect(noUrl.err[0]).toMatch(/CUSTOMY_EXPERIMENTS_URL/);
    const noToken = run(["flags", "list"], [], { CUSTOMY_EXPERIMENTS_URL: BASE });
    expect(await noToken.code).toBe(1);
    expect(noToken.err[0]).toMatch(/CUSTOMY_EXPERIMENTS_TOKEN/);
    expect([...noUrl.calls, ...noToken.calls]).toHaveLength(0);
  });

  it("--base-url gana sobre el entorno y comando desconocido da uso", async () => {
    const r = run(["flags", "list", "--base-url", "https://stg.invalid/"], [json(200, { items: [] })]);
    await r.code;
    expect(r.calls[0]!.url).toBe("https://stg.invalid/v1/experiments/flags");
    const unknown = run(["flags", "explode"]);
    expect(await unknown.code).toBe(1);
    expect(unknown.err[0]).toMatch(/desconocido/);
  });

  it("--help y ayuda general listan los comandos", async () => {
    const help = run(["flags", "--help"]);
    expect(await help.code).toBe(0);
    expect(help.out.join("\n")).toContain("customy segments members add|remove");
    const general = run(["--help"]);
    await general.code;
    expect(general.out.join("\n")).toContain("customy experiments conclude");
  });
});
