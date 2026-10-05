/**
 * `customy flags | segments | experiments`: control de Customy Experiments desde la
 * línea de comandos (mismas rutas `/v1/experiments/*` que usa la consola y el
 * proveedor de Terraform).
 *
 *   customy flags list|get|create|update|archive|restore|kill|delete
 *   customy segments list|get|create|update|delete|members add|members remove
 *   customy experiments list|get|create|update|start|pause|conclude
 *
 * El origen sale de --base-url o CUSTOMY_EXPERIMENTS_URL y la credencial de
 * CUSTOMY_EXPERIMENTS_TOKEN: jamás por argv. Toda escritura exige `--reason` (la
 * auditoría pide el porqué) y admite `--dry-run` (imprime la petición y no envía
 * nada). El inquilino y el entorno los decide el servidor por la credencial.
 *
 * Códigos de salida: 0 ok, 1 error del servidor o de uso, 3 credencial rechazada
 * (401/403), 4 el servidor pide una solicitud de cambio o un conflicto (409/412).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CliIo } from "./cli.js";

export const EXPERIMENTS_GROUPS = ["flags", "segments", "experiments"] as const;
export const EXPERIMENTS_EXIT = { ok: 0, failure: 1, auth: 3, conflict: 4 } as const;

export const EXPERIMENTS_HELP = [
  "Customy Experiments (credential: CUSTOMY_EXPERIMENTS_TOKEN, origin: --base-url or CUSTOMY_EXPERIMENTS_URL):",
  "  customy flags list [--q TEXT --tag T --archived true|false --limit N --cursor C]",
  "  customy flags get <key> | customy flags create --file flag.json --reason \"...\"",
  "  customy flags update <key> --file patch.json --reason \"...\"",
  "  customy flags archive|restore|delete <key> --reason \"...\" | customy flags kill <key> [--environment E] --reason \"...\"",
  "  customy segments list|get <key> | create --file segment.json --reason | update <key> --file patch.json --reason | delete <key> --reason",
  "  customy segments members add|remove <key> --unit-keys a,b,c --reason \"...\"",
  "  customy experiments list|get <key> | create --file experiment.json --reason | update <key> --file patch.json --reason",
  "  customy experiments start|pause <key> --reason \"...\" | customy experiments conclude <key> --decision ship|rollback|iterate --reason \"...\"",
  "Common flags: --json (the response as one JSON document), --dry-run (writes: print the request, send nothing).",
];

class UsageError extends Error {}

const VALUE_FLAGS = new Set(["file", "reason", "base-url", "q", "tag", "archived", "limit", "cursor", "environment", "unit-keys", "decision"]);

function parse(args: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`--${name} necesita un valor`);
      flags[name] = value;
      index += 1;
    } else flags[name] = true;
  }
  return { positional, flags };
}

type Call = { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string; query?: Record<string, string>; body?: unknown; write: boolean };

async function readBody(flags: Record<string, string | true>, io: CliIo): Promise<Record<string, unknown>> {
  const file = flags.file;
  if (typeof file !== "string") throw new UsageError("falta --file con el JSON de la petición");
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(path.resolve(io.cwd, file), "utf8")); }
  catch (error) { throw new UsageError(`no se pudo leer ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new UsageError(`${file} debe contener un objeto JSON`);
  return parsed as Record<string, unknown>;
}

function reasonOf(flags: Record<string, string | true>): string {
  const reason = typeof flags.reason === "string" ? flags.reason.trim() : "";
  if (reason.length < 3) throw new UsageError("toda escritura exige --reason \"…\" (mínimo 3 caracteres)");
  return reason;
}

function keyOf(positional: string[], what: string): string {
  const key = positional[0];
  if (!key) throw new UsageError(`falta la clave de ${what}`);
  return encodeURIComponent(key);
}

function listQuery(flags: Record<string, string | true>, names: string[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const name of names) if (typeof flags[name] === "string") query[name] = flags[name] as string;
  return query;
}

async function plan(group: string, args: string[], io: CliIo): Promise<Call> {
  const [command, ...rest] = args;
  const { positional, flags } = parse(rest);
  const withReason = async (call: Omit<Call, "write">, extra: Record<string, unknown> = {}): Promise<Call> => ({ ...call, write: true, body: { ...extra, reason: reasonOf(flags) } });
  const fromFile = async (call: Omit<Call, "write" | "body">): Promise<Call> => ({ ...call, write: true, body: { ...(await readBody(flags, io)), reason: reasonOf(flags) } });

  if (group === "flags") {
    switch (command) {
      case "list": return { method: "GET", path: "/flags", query: listQuery(flags, ["q", "tag", "archived", "limit", "cursor"]), write: false };
      case "get": return { method: "GET", path: `/flags/${keyOf(positional, "flag")}`, write: false };
      case "create": return fromFile({ method: "POST", path: "/flags" });
      case "update": return fromFile({ method: "PATCH", path: `/flags/${keyOf(positional, "flag")}` });
      case "archive": case "restore": return withReason({ method: "POST", path: `/flags/${keyOf(positional, "flag")}/${command}` });
      case "delete": return withReason({ method: "DELETE", path: `/flags/${keyOf(positional, "flag")}` });
      case "kill": return withReason({ method: "POST", path: `/flags/${keyOf(positional, "flag")}/kill` }, typeof flags.environment === "string" ? { environment: flags.environment } : {});
    }
  } else if (group === "segments") {
    if (command === "members") {
      const [action, ...more] = positional;
      const unitKeys = typeof flags["unit-keys"] === "string" ? (flags["unit-keys"] as string).split(",").map((item) => item.trim()).filter(Boolean) : [];
      if (action !== "add" && action !== "remove") throw new UsageError("customy segments members add|remove <key> --unit-keys a,b --reason \"…\"");
      if (!unitKeys.length) throw new UsageError("falta --unit-keys a,b,c");
      return withReason({ method: action === "add" ? "POST" : "DELETE", path: `/segments/${keyOf(more, "segmento")}/members` }, { unitKeys });
    }
    switch (command) {
      case "list": return { method: "GET", path: "/segments", query: listQuery(flags, ["limit", "cursor"]), write: false };
      case "get": return { method: "GET", path: `/segments/${keyOf(positional, "segmento")}`, write: false };
      case "create": return fromFile({ method: "POST", path: "/segments" });
      case "update": return fromFile({ method: "PATCH", path: `/segments/${keyOf(positional, "segmento")}` });
      case "delete": return withReason({ method: "DELETE", path: `/segments/${keyOf(positional, "segmento")}` });
    }
  } else {
    switch (command) {
      case "list": return { method: "GET", path: "/experiments", query: listQuery(flags, ["limit", "cursor"]), write: false };
      case "get": return { method: "GET", path: `/experiments/${keyOf(positional, "experimento")}`, write: false };
      case "create": return fromFile({ method: "POST", path: "/experiments" });
      case "update": return fromFile({ method: "PATCH", path: `/experiments/${keyOf(positional, "experimento")}` });
      case "start": case "pause": return withReason({ method: "POST", path: `/experiments/${keyOf(positional, "experimento")}/${command}` });
      case "conclude": {
        const decision = flags.decision;
        if (decision !== "ship" && decision !== "rollback" && decision !== "iterate") throw new UsageError("conclude exige --decision ship|rollback|iterate");
        return withReason({ method: "POST", path: `/experiments/${keyOf(positional, "experimento")}/conclude` }, { decision });
      }
    }
  }
  throw new UsageError(`comando desconocido: customy ${group} ${command ?? ""}`.trim() + "  (customy --help)");
}

function summarize(group: string, call: Call, data: unknown): string[] {
  if (!data || typeof data !== "object") return ["✓ hecho"];
  const record = data as Record<string, unknown>;
  const rowOf = (item: unknown) => {
    const row = item as Record<string, unknown>;
    return `${String(row.key ?? row.id ?? "?")}\t${String(row.name ?? "")}\t${String(row.status ?? row.kind ?? "")}`;
  };
  if (Array.isArray(record.items)) return [...record.items.map(rowOf), ...(record.nextCursor ? [`# más: --cursor ${String(record.nextCursor)}`] : [])];
  if (call.write) return [`✓ ${group} ${call.method} ${call.path}${record.key ? ` (${String(record.key)})` : ""}`];
  return [rowOf(data), ...(typeof record.description === "string" ? [String(record.description)] : [])];
}

export async function runExperimentsCli(group: string, args: string[], io: CliIo): Promise<number> {
  try {
    if (args.includes("--help")) { io.out(EXPERIMENTS_HELP.join("\n")); return EXPERIMENTS_EXIT.ok; }
    const { flags } = parse(args.slice(1));
    const call = await plan(group, args, io);
    const base = (typeof flags["base-url"] === "string" ? flags["base-url"] : io.env.CUSTOMY_EXPERIMENTS_URL)?.replace(/\/$/, "");
    if (!base) throw new UsageError("falta el origen: --base-url o CUSTOMY_EXPERIMENTS_URL");
    const query = call.query && Object.keys(call.query).length ? `?${new URLSearchParams(call.query)}` : "";
    const url = `${base}/v1/experiments${call.path}${query}`;
    if (call.write && flags["dry-run"]) {
      io.out(JSON.stringify({ dryRun: true, method: call.method, url, body: call.body }, null, 2));
      return EXPERIMENTS_EXIT.ok;
    }
    const token = io.env.CUSTOMY_EXPERIMENTS_TOKEN;
    if (!token) throw new UsageError("falta CUSTOMY_EXPERIMENTS_TOKEN en el entorno (nunca por la línea de comandos)");
    const doFetch = io.fetch ?? fetch;
    const response = await doFetch(url, {
      method: call.method,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "customy-cli", ...(call.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
    });
    const text = await response.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
    if (!response.ok) {
      const body = (data && typeof data === "object" ? data : {}) as { name?: string; message?: string; details?: unknown };
      io.err(`✗ HTTP ${response.status}${body.name ? ` ${body.name}` : ""}: ${body.message ?? (typeof data === "string" && data ? data : response.statusText)}`);
      if (body.details !== undefined) io.err(JSON.stringify(body.details));
      return response.status === 401 || response.status === 403 ? EXPERIMENTS_EXIT.auth : response.status === 409 || response.status === 412 ? EXPERIMENTS_EXIT.conflict : EXPERIMENTS_EXIT.failure;
    }
    if (flags.json) io.out(JSON.stringify(data ?? null, null, 2));
    else for (const line of summarize(group, call, data)) io.out(line);
    return EXPERIMENTS_EXIT.ok;
  } catch (error) {
    if (error instanceof UsageError) { io.err(`✗ ${error.message}`); return EXPERIMENTS_EXIT.failure; }
    io.err(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return EXPERIMENTS_EXIT.failure;
  }
}
