#!/usr/bin/env node
// Publishes every package of this repository whose version is not on npm yet.
//
// Runs in .github/workflows/publish.yml on each push to main. Versions are
// never changed here: they arrive with the commit. For each workspace package
// under packages/, in dependency order (dependencies first):
//
//   - the version is already on npm           -> skipped (re-running is safe)
//   - the version is missing                   -> npm publish --provenance,
//                                                 dist-tag latest / next / backport,
//                                                 then git tag <dir>-v<version>
//   - a dependency failed to publish in this run -> skipped until the next run
//
// Usage:
//   node scripts/publish.mjs plan [--only <package>] [--json | --markdown]
//   node scripts/publish.mjs publish [--only <package>] [--dry-run] [--summary <file>]
//
// Zero dependencies (Node >= 20). Tags use the GitHub API with GITHUB_TOKEN,
// GITHUB_REPOSITORY and GITHUB_SHA from the Actions environment.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

// ─── Semver (just what publishing needs) ─────────────────────────────────────

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version ?? ""));
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ? match[4].split(".") : [] };
}

/** -1, 0 or 1 by semver precedence (a prerelease sorts before its release). */
export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  if (!x || !y) throw new Error(`not a semver version: ${!x ? a : b}`);
  for (const key of ["major", "minor", "patch"]) if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
  if (x.prerelease.length === 0 && y.prerelease.length === 0) return 0;
  if (x.prerelease.length === 0) return 1;
  if (y.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(x.prerelease.length, y.prerelease.length); index += 1) {
    const [p, q] = [x.prerelease[index], y.prerelease[index]];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/**
 * dist-tag for a new version: `next` for prereleases, `latest` when it is the
 * highest release, `backport` when it is lower than the current `latest` (a
 * patch to an older line must not move `latest` backwards).
 */
export function distTagFor(version, latest) {
  if (parseVersion(version)?.prerelease.length) return "next";
  if (latest && compareVersions(version, latest) < 0) return "backport";
  return "latest";
}

export function tagName(short, version) {
  return `${short}-v${version}`;
}

// ─── Packages and order ──────────────────────────────────────────────────────

/** Workspace packages under `packages/`: name, version, directory and in-repo runtime dependencies. */
export function workspacePackages(root) {
  const base = path.join(root, "packages");
  const manifests = readdirSync(base)
    .filter((dir) => existsSync(path.join(base, dir, "package.json")))
    .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(path.join(base, dir, "package.json"), "utf8")) }))
    .filter(({ manifest }) => !manifest.private);
  const names = new Set(manifests.map(({ manifest }) => manifest.name));
  return manifests.map(({ dir, manifest }) => ({
    name: manifest.name,
    version: manifest.version,
    short: dir,
    target: `packages/${dir}`,
    dependencies: Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).filter((name) => names.has(name)).sort(),
  }));
}

/** Topological order (dependencies first, ties by name). Throws on a cycle. */
export function topoOrder(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const done = new Set();
  const visiting = new Set();
  const ordered = [];
  const visit = (pkg, trail) => {
    if (done.has(pkg.name)) return;
    if (visiting.has(pkg.name)) throw new Error(`dependency cycle: ${[...trail, pkg.name].join(" -> ")}`);
    visiting.add(pkg.name);
    for (const dep of [...pkg.dependencies].sort()) if (byName.has(dep)) visit(byName.get(dep), [...trail, pkg.name]);
    visiting.delete(pkg.name);
    done.add(pkg.name);
    ordered.push(pkg);
  };
  for (const pkg of [...packages].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) visit(pkg, []);
  return ordered;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/** `{ exists, versions, latest }` for a package (anonymous read). */
export async function registryLookup(name, { registry = DEFAULT_REGISTRY, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${registry.replace(/\/$/, "")}/${name.split("/").join("%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) return { exists: false, versions: [], latest: null };
  if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`);
  const body = await response.json();
  return { exists: true, versions: Object.keys(body.versions ?? {}), latest: body["dist-tags"]?.latest ?? null };
}

// ─── Plan ────────────────────────────────────────────────────────────────────

/** `--only` matches the npm name, the directory name or the last name segment. */
export function matchesPackage(pkg, wanted) {
  return [pkg.name, pkg.short, pkg.target, pkg.source, pkg.name.split("/").pop()].includes(wanted);
}

/**
 * Publish plan in dependency order. Actions:
 * - `publish`: the version is not on npm; goes out with `distTag`.
 * - `published`: already on npm.
 * - `blocked`: an in-repo dependency at the version this package will require
 *   is neither on npm nor in this plan (only possible with `only`).
 */
export async function buildPlan({ packages, lookup, only = [] }) {
  const ordered = topoOrder(packages);
  const unknown = only.filter((wanted) => !ordered.some((pkg) => matchesPackage(pkg, wanted)));
  if (unknown.length) throw new Error(`unknown packages: ${unknown.join(", ")}`);
  const selected = only.length ? ordered.filter((pkg) => only.some((wanted) => matchesPackage(pkg, wanted))) : ordered;
  const registry = new Map();
  await Promise.all(ordered.map(async (pkg) => registry.set(pkg.name, await lookup(pkg.name))));
  const byName = new Map(ordered.map((pkg) => [pkg.name, pkg]));
  const rows = [];
  for (const pkg of selected) {
    const npm = registry.get(pkg.name);
    const row = { ...pkg, npmLatest: npm.latest, npmExists: npm.exists };
    if (npm.versions.includes(pkg.version)) {
      rows.push({ ...row, action: "published" });
      continue;
    }
    const missing = pkg.dependencies.filter((dep) => {
      if (registry.get(dep)?.versions.includes(byName.get(dep)?.version)) return false;
      return !rows.some((other) => other.name === dep && other.action === "publish");
    });
    if (missing.length) {
      rows.push({ ...row, action: "blocked", reason: `missing on npm: ${missing.map((dep) => `${dep}@${byName.get(dep).version}`).join(", ")}` });
      continue;
    }
    rows.push({ ...row, action: "publish", distTag: distTagFor(pkg.version, npm.latest), tag: tagName(pkg.short, pkg.version), firstRelease: !npm.exists });
  }
  return { packages: rows, pending: rows.filter((row) => row.action === "publish").length, blocked: rows.filter((row) => row.action === "blocked").length };
}

/** A markdown table cell: backslashes first, then pipes. */
export function escapeCell(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function formatPlan(plan, { markdown = false } = {}) {
  const header = ["package", "repo", "npm latest", "action"];
  const lines = plan.packages.map((row) => [
    row.name,
    row.version,
    row.npmExists ? row.npmLatest ?? "-" : "(not on npm)",
    row.action === "publish" ? `publish -> ${row.distTag}${row.firstRelease ? " (first release)" : ""}` : row.action === "blocked" ? `blocked: ${row.reason}` : "published",
  ]);
  if (markdown) {
    return [`### npm publish plan (${plan.pending} pending)`, "", `| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...lines.map((line) => `| ${line.map(escapeCell).join(" | ")} |`), ""].join("\n");
  }
  const widths = header.map((title, index) => Math.max(title.length, ...lines.map((line) => line[index].length)));
  return [header, ...lines].map((line) => line.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd()).join("\n");
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export function npmPublishArgs(row, { dryRun = false, provenance = true } = {}) {
  return ["publish", "--access", "public", "--tag", row.distTag, ...(provenance ? ["--provenance"] : []), ...(dryRun ? ["--dry-run"] : [])];
}

/** Lightweight tag through the GitHub API; an existing tag on the same commit is fine. */
export async function createGitTag({ repo, sha, tag, token, fetchImpl = fetch }) {
  const api = `https://api.github.com/repos/${repo}/git/refs`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  const response = await fetchImpl(api, { method: "POST", headers, body: JSON.stringify({ ref: `refs/tags/${tag}`, sha }) });
  if (response.status === 201) return { tag, status: "created" };
  if (response.status === 422) {
    const existing = await fetchImpl(`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, { headers });
    const body = existing.ok ? await existing.json() : null;
    if (body?.object?.sha === sha) return { tag, status: "exists" };
    return { tag, status: "conflict", detail: `tag already points to ${body?.object?.sha ?? "another commit"}` };
  }
  return { tag, status: "error", detail: `GitHub answered ${response.status}` };
}

/**
 * Publishes the `publish` rows in order. `exec(args, cwd)` runs npm and returns
 * `{ status, output }`; `tagger(row)` creates the git tag; `lookup` re-checks
 * npm right before each package so concurrent or repeated runs never collide.
 */
export async function publishPlan(plan, { root, dryRun = false, provenance = true, lookup, exec, tagger, log = () => {} }) {
  const results = [];
  const failed = new Set();
  for (const row of plan.packages) {
    if (row.action !== "publish") { results.push({ name: row.name, version: row.version, status: row.action, detail: row.reason }); continue; }
    const brokenDeps = row.dependencies.filter((dep) => failed.has(dep));
    if (brokenDeps.length) {
      failed.add(row.name);
      results.push({ name: row.name, version: row.version, status: "skipped", detail: `depends on ${brokenDeps.join(", ")}, which failed` });
      continue;
    }
    const current = await lookup(row.name);
    if (current.versions.includes(row.version)) {
      results.push({ name: row.name, version: row.version, status: "published", detail: "already on npm" });
      continue;
    }
    const dir = path.join(root, row.target);
    const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    if (manifest.name !== row.name || manifest.version !== row.version) {
      failed.add(row.name);
      results.push({ name: row.name, version: row.version, status: "failed", detail: `the package directory holds ${manifest.name}@${manifest.version}` });
      continue;
    }
    const distTag = distTagFor(row.version, current.latest);
    log(`${dryRun ? "[dry-run] " : ""}npm publish ${row.name}@${row.version} --tag ${distTag}`);
    const published = exec(npmPublishArgs({ ...row, distTag }, { dryRun, provenance }), dir);
    if (published.status !== 0) {
      failed.add(row.name);
      const tail = String(published.output ?? "").trim().split("\n").slice(-6).join("\n");
      // npm only accepts a trusted publisher for a package that already exists.
      const hint = current.exists ? "" : "first release: npm needs one manual publish before trusted publishing can be configured. ";
      results.push({ name: row.name, version: row.version, status: "failed", detail: `${hint}${tail}` });
      continue;
    }
    const result = { name: row.name, version: row.version, status: dryRun ? "dry-run" : "published-now", distTag };
    if (!dryRun && tagger) result.tag = await tagger({ ...row, distTag });
    results.push(result);
  }
  // A tag name already taken by an older, immutable tag (e.g. a package that
  // was renamed) is reported but does not fail a publish that succeeded.
  const ok = results.every((result) => !["failed", "skipped", "blocked"].includes(result.status) && result.tag?.status !== "error");
  return { ok, results, warnings: results.filter((result) => result.tag?.status === "conflict").map((result) => `${result.tag.tag}: ${result.tag.detail}`) };
}

export function formatResults(outcome, { dryRun = false } = {}) {
  const lines = [`### npm publish${dryRun ? " (dry-run)" : ""}: ${outcome.ok ? "ok" : "failed"}`, "", "| package | version | result |", "|---|---|---|"];
  for (const result of outcome.results) {
    const tag = result.tag ? ` · tag ${result.tag.tag} (${result.tag.status}${result.tag.detail ? `: ${result.tag.detail}` : ""})` : "";
    const detail = result.detail ? ` - ${result.detail}` : "";
    lines.push(`| ${escapeCell(result.name)} | ${escapeCell(result.version)} | ${escapeCell(`${result.status}${result.distTag ? ` -> ${result.distTag}` : ""}${tag}${detail}`)} |`);
  }
  return `${lines.join("\n")}\n`;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

export function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function listOption(args, name) {
  return args.flatMap((arg, index) => (arg === name && args[index + 1] ? args[index + 1].split(",").map((value) => value.trim()).filter(Boolean) : []));
}

async function main() {
  const [command = "plan", ...args] = process.argv.slice(2);
  const root = path.resolve(option(args, "--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const registry = option(args, "--registry") ?? DEFAULT_REGISTRY;
  const lookup = (name) => registryLookup(name, { registry });
  const plan = await buildPlan({ packages: workspacePackages(root), lookup, only: listOption(args, "--only") });
  if (command === "plan") {
    if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
    else console.log(formatPlan(plan, { markdown: args.includes("--markdown") }));
    return;
  }
  if (command === "publish") {
    const dryRun = args.includes("--dry-run");
    const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_SHA: sha } = process.env;
    const tagger = token && repo && sha ? (row) => createGitTag({ repo, sha, tag: row.tag, token }) : null;
    if (!dryRun && !tagger) console.error("[publish] GITHUB_TOKEN/GITHUB_REPOSITORY/GITHUB_SHA missing: no git tags");
    const exec = (npmArgs, cwd) => {
      const result = spawnSync("npm", npmArgs, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      process.stdout.write(output);
      return { status: result.status ?? 1, output };
    };
    const outcome = await publishPlan(plan, {
      root, dryRun, provenance: !args.includes("--no-provenance"), lookup, exec, tagger,
      log: (line) => console.log(`[publish] ${line}`),
    });
    const summary = formatResults(outcome, { dryRun });
    console.log(summary);
    for (const warning of outcome.warnings) console.log(`::warning::tag not created, ${warning}`);
    const summaryFile = option(args, "--summary");
    if (summaryFile) appendFileSync(summaryFile, `${summary}\n`);
    process.exitCode = outcome.ok ? 0 : 1;
    return;
  }
  console.error("usage: publish.mjs plan [--only <pkg>] [--json|--markdown] | publish [--only <pkg>] [--dry-run] [--summary <file>]");
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[publish] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
