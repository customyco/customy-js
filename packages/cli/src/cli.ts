/**
 * customy — CLI de la plataforma.
 *
 *   customy apps validate [--file customy.app.json]
 *   customy apps codegen  [--file customy.app.json] [--out src/customy.generated.ts]
 *   customy apps sync     --workspace-env <envId> [--file customy.app.json] [--reason "…"]
 *   customy users | audit | policy | whoami | login   (provisioning of TEST users; see ./provisioning.ts)
 *   customy flags | segments | experiments           (Customy Experiments control plane; see ./experiments.ts)
 *
 * `sync` lee CUSTOMY_ACCESS_URL y CUSTOMY_ACCESS_TOKEN (un token de un
 * administrador del Workspace) del entorno; nunca de la línea de comandos.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateAppTypes } from "./codegen.js";
import { syncApp, validateManifest } from "./apps.js";
import { PROVISIONING_GROUPS, PROVISIONING_HELP, runProvisioningCli } from "./provisioning.js";
import { EXPERIMENTS_GROUPS, EXPERIMENTS_HELP, runExperimentsCli } from "./experiments.js";

export type CliIo = {
  cwd: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  fetch?: typeof fetch;
  /** Is stdin an interactive terminal? Production writes ask for confirmation only if so. */
  isTTY?: boolean;
  /** Asks a question on the terminal (the prompt goes to stderr) and returns the typed line. */
  prompt?: (question: string) => Promise<string>;
};

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

async function loadManifest(args: string[], io: CliIo) {
  const file = path.resolve(io.cwd, option(args, "file") ?? "customy.app.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    io.err(`no se pudo leer ${path.relative(io.cwd, file) || file}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
  const result = validateManifest(raw);
  if (!result.ok) {
    for (const problem of result.problems) io.err(`✗ ${problem.path || "(raíz)"}: ${problem.code}`);
    return null;
  }
  return result.manifest;
}

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [group, command, ...args] = argv;
  if (group === "--help" || group === "help") {
    io.out(["uso: customy apps <validate|codegen|sync> [--file customy.app.json]", ...PROVISIONING_HELP, ...EXPERIMENTS_HELP].join("\n"));
    return 0;
  }
  if ((PROVISIONING_GROUPS as readonly string[]).includes(group ?? "")) return runProvisioningCli(group!, argv.slice(1), io);
  if ((EXPERIMENTS_GROUPS as readonly string[]).includes(group ?? "")) return runExperimentsCli(group!, argv.slice(1), io);
  if (group !== "apps" || !["validate", "codegen", "sync"].includes(command ?? "")) {
    io.err("uso: customy apps <validate|codegen|sync> [--file customy.app.json]");
    io.err("     customy users | audit | policy | whoami | login | flags | segments | experiments   (customy --help)");
    return 2;
  }
  const manifest = await loadManifest(args, io);
  if (!manifest) return 1;
  if (command === "validate") {
    io.out(`✓ ${manifest.key}: manifiesto app/v1 válido (${manifest.events.length} eventos, ${manifest.capabilities.length} capabilities)`);
    return 0;
  }
  if (command === "codegen") {
    const out = path.resolve(io.cwd, option(args, "out") ?? "customy.generated.ts");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, generateAppTypes(manifest));
    io.out(`✓ tipos de ${manifest.key} en ${path.relative(io.cwd, out)}`);
    return 0;
  }
  const workspaceEnvironmentId = option(args, "workspace-env");
  const accessUrl = io.env.CUSTOMY_ACCESS_URL;
  const token = io.env.CUSTOMY_ACCESS_TOKEN;
  if (!workspaceEnvironmentId || !accessUrl || !token) {
    io.err("sync necesita --workspace-env y las variables CUSTOMY_ACCESS_URL y CUSTOMY_ACCESS_TOKEN");
    return 2;
  }
  try {
    const result = await syncApp({
      manifest, accessUrl, token, workspaceEnvironmentId,
      reason: option(args, "reason") ?? `customy apps sync ${manifest.key}`,
      fetch: io.fetch,
    });
    const verb = { installed: "instalada", updated: "actualizada", unchanged: "sin cambios" }[result.action];
    io.out(`✓ ${manifest.key} ${verb}: aplicación ${result.applicationId}, entorno ${result.environmentId}, revisión ${result.revision}`);
    let failed = false;
    for (const [product, outcome] of Object.entries(result.reconciliation)) {
      if (outcome.status === "failed") { failed = true; io.err(`✗ ${product}: ${outcome.code} — vuelve a ejecutar sync para reintentar`); }
      else if (outcome.status === "reconciled") io.out(`✓ ${product}: ${outcome.changed ? "actualizado" : "al día"}${outcome.resourceId ? ` (${outcome.resourceId})` : ""}`);
    }
    return failed ? 1 : 0;
  } catch (error) {
    io.err(`✗ sync: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
