/**
 * `customy users | audit | policy | whoami | login`: Customy Provisioning of TEST users.
 *
 * Every command that talks to the server needs `--env staging|production` (no default).
 * Credentials come from the environment (CUSTOMY_CLIENT_ID + CUSTOMY_CLIENT_SECRET, or a
 * pre-obtained CUSTOMY_TOKEN) and the Access origin from --base-url or CUSTOMY_ACCESS_URL:
 * never from argv. Generated passwords and signin links are printed once, to stdout, and
 * are never written to a file or to stderr.
 *
 * Exit codes: 0 ok, 1 server/usage error, 2 unsupported, 3 auth/scope error,
 * 4 environment mismatch or confirmation refused.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
    createProvisioning,
    CustomyAuthError,
    CustomyConflictError,
    CustomyEnvironmentMismatchError,
    CustomyProvisioningError,
    CustomyRateLimitError,
    CustomyScopeError,
    type AuditEntry,
    type BatchTestUsersResult,
    type CustomyProvisioning,
    type ListUsersParams,
    type ProvisionedUser,
    type ProvisioningEnvironment,
    type UpsertUserInput,
} from "@customyai/provisioning";
import type { CliIo } from "./cli.js";

export const EXIT = { ok: 0, failure: 1, unsupported: 2, auth: 3, confirmation: 4 } as const;

export const PROVISIONING_GROUPS = ["users", "audit", "policy", "whoami", "login"] as const;

export const PROVISIONING_HELP = [
    "Provisioning of TEST users (every command needs --env staging|production; there is no default):",
    "  customy users test create --env E --count N (--email-base me@x.com | --email-domain qa.example.com)",
    "         [--currency USD --country US --locale es-CO --tag T --expires-in-days N --reason \"...\" --ticket X --batch-id Y]",
    "  customy users test cleanup --env E (--batch ID | --mine) --reason \"...\"",
    "  customy users get <externalKey> --env E",
    "  customy users list --env E [--kind test|regular --batch ID --q PREFIX --limit N --all]",
    "  customy users upsert <externalKey> --env E --email ... --reason \"...\" [--name N --kind test|regular --attr k=v ... --password generate|none]",
    "  customy users delete <externalKey> --env E --reason \"...\"",
    "  customy users signin-link <externalKey> --env E --reason \"...\"",
    "  customy audit list --env E [--actor --action --subject --batch --from --to --limit --all]",
    "  customy audit export --env E --format csv|ndjson [--out file] [filters]",
    "  customy audit verify --env E",
    "  customy policy get --env E | customy whoami --env E",
    "  customy login                                   (device flow: not available yet)",
    "Common flags: --json (one JSON document on stdout), --base-url URL (or CUSTOMY_ACCESS_URL),",
    "  --dry-run (writes: print the request, send nothing), --yes-i-am-sure production (non-interactive production writes).",
    "Credentials: CUSTOMY_CLIENT_ID + CUSTOMY_CLIENT_SECRET (or CUSTOMY_TOKEN), never argv.",
];

class UsageError extends Error {}
class Refused extends Error {}

type FlagKind = "string" | "boolean" | "list";
type Flags = Record<string, string | boolean | string[]>;

const COMMON: Record<string, FlagKind> = { env: "string", "base-url": "string", json: "boolean", "dry-run": "boolean", "yes-i-am-sure": "string", help: "boolean" };

function parse(args: string[], spec: Record<string, FlagKind>, positionals: number): { flags: Flags; rest: string[] } {
    const known = { ...COMMON, ...spec };
    const flags: Flags = {};
    const rest: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]!;
        if (!arg.startsWith("--")) { rest.push(arg); continue; }
        const eq = arg.indexOf("=");
        const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
        const kind = known[name];
        if (!kind) throw new UsageError(`unknown flag --${name}`);
        if (kind === "boolean") { flags[name] = eq >= 0 ? arg.slice(eq + 1) !== "false" : true; continue; }
        let value: string | undefined = eq >= 0 ? arg.slice(eq + 1) : args[i + 1];
        if (eq < 0) i += 1;
        if (value === undefined || (eq < 0 && value.startsWith("--"))) throw new UsageError(`--${name} needs a value`);
        if (kind === "list") flags[name] = [...((flags[name] as string[] | undefined) ?? []), value];
        else flags[name] = value;
    }
    if (rest.length !== positionals) throw new UsageError(positionals === 0 ? `unexpected argument "${rest[0]}"` : `expected ${positionals} argument(s), got ${rest.length}`);
    return { flags, rest };
}

const str = (flags: Flags, name: string): string | undefined => (typeof flags[name] === "string" ? (flags[name] as string) : undefined);
const bool = (flags: Flags, name: string): boolean => flags[name] === true;

function int(flags: Flags, name: string, min: number, max: number): number | undefined {
    const raw = str(flags, name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < min || value > max) throw new UsageError(`--${name} must be an integer between ${min} and ${max}`);
    return value;
}

function required(flags: Flags, name: string): string {
    const value = str(flags, name);
    if (!value) throw new UsageError(`--${name} is required`);
    return value;
}

function environmentOf(flags: Flags): ProvisioningEnvironment {
    const env = str(flags, "env");
    if (env === undefined) throw new UsageError("--env is required (staging|production); there is no default environment");
    if (env !== "staging" && env !== "production") throw new UsageError(`--env must be "staging" or "production", got "${env}"`);
    return env;
}

function attributes(flags: Flags): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const key of ["currency", "country", "locale"]) { const value = str(flags, key); if (value) out[key] = value; }
    for (const pair of (flags.attr as string[] | undefined) ?? []) {
        const at = pair.indexOf("=");
        if (at <= 0) throw new UsageError(`--attr expects key=value, got "${pair}"`);
        out[pair.slice(0, at)] = pair.slice(at + 1);
    }
    return Object.keys(out).length ? out : undefined;
}

function expiry(flags: Flags): Date | undefined {
    const days = int(flags, "expires-in-days", 1, 3650);
    return days === undefined ? undefined : new Date(Date.now() + days * 86_400_000);
}

type Ctx = { io: CliIo; flags: Flags; env: ProvisioningEnvironment; json: boolean };
type Dry = { method: string; path: string; query?: Record<string, string>; headers: Record<string, string>; body?: unknown };

/** A client wired to a fake `fetch` that answers the token request and captures the first API request. Nothing leaves the process. */
function dryRunClient(env: ProvisioningEnvironment): { api: CustomyProvisioning; captured: () => Dry | undefined } {
    let captured: Dry | undefined;
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === "/oauth/token") return new Response(JSON.stringify({ access_token: "dry-run-token", expires_in: 900 }), { status: 200, headers: { "content-type": "application/json" } });
        const headers = new Headers(init?.headers);
        const query: Record<string, string> = {};
        url.searchParams.forEach((value, name) => { query[name] = value; });
        captured = {
            method: init?.method ?? "GET",
            path: url.pathname,
            ...(Object.keys(query).length ? { query } : {}),
            headers: { "Customy-Environment": headers.get("customy-environment") ?? env, ...(headers.get("idempotency-key") ? { "Idempotency-Key": headers.get("idempotency-key")! } : {}), ...(headers.get("if-match") ? { "If-Match": headers.get("if-match")! } : {}) },
            ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) as unknown } : {}),
        };
        // The SDK wraps this into a network error; the request is read from `captured`.
        throw new Error("dry-run: request captured, nothing sent");
    }) as typeof fetch;
    const api = createProvisioning({ environment: env, baseUrl: "https://dry-run.invalid", clientId: "dry-run", clientSecret: "dry-run-secret", fetch: fakeFetch, retry: false });
    return { api, captured: () => captured };
}

function liveClient(ctx: Ctx): CustomyProvisioning {
    const baseUrl = str(ctx.flags, "base-url") ?? ctx.io.env.CUSTOMY_ACCESS_URL;
    if (!baseUrl) throw new UsageError("the Access origin is required: pass --base-url or set CUSTOMY_ACCESS_URL (there is no default host)");
    const { CUSTOMY_CLIENT_ID: clientId, CUSTOMY_CLIENT_SECRET: clientSecret, CUSTOMY_TOKEN: accessToken } = ctx.io.env;
    const common = { environment: ctx.env, baseUrl, ...(ctx.io.fetch ? { fetch: ctx.io.fetch } : {}) };
    if (clientId && clientSecret) return createProvisioning({ ...common, clientId, clientSecret });
    if (accessToken) return createProvisioning({ ...common, accessToken });
    throw new CustomyAuthError({ code: "SDK_CREDENTIALS_REQUIRED", status: 0, message: "set CUSTOMY_CLIENT_ID and CUSTOMY_CLIENT_SECRET (or CUSTOMY_TOKEN) in the environment" });
}

/** Production writes need the environment name typed (TTY) or `--yes-i-am-sure production` (no TTY). */
async function confirmProduction(ctx: Ctx, summary: string): Promise<void> {
    if (ctx.env !== "production") return;
    const given = str(ctx.flags, "yes-i-am-sure");
    if (given !== undefined) {
        if (given !== "production") throw new Refused(`--yes-i-am-sure must equal "production", got "${given}"`);
        return;
    }
    if (!ctx.io.isTTY || !ctx.io.prompt) throw new Refused('production writes without a terminal need --yes-i-am-sure production');
    ctx.io.err(`About to ${summary} in PRODUCTION.`);
    const answer = await ctx.io.prompt('Type "production" to confirm: ');
    if (answer.trim() !== "production") throw new Refused("confirmation refused: nothing was changed");
}

function emit(ctx: Ctx, json: unknown, human: string[]): void {
    if (ctx.json) ctx.io.out(JSON.stringify(json, null, 2));
    else for (const line of human) ctx.io.out(line);
}

function table(rows: string[][]): string[] {
    const widths = rows[0]!.map((_, col) => Math.max(...rows.map((row) => (row[col] ?? "").length)));
    return rows.map((row) => row.map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd(widths[col]!))).join("  ").trimEnd());
}

const SECRET_WARNING = "Store these now: passwords and links are shown ONCE and cannot be retrieved again.";

/** Runs a write: dry-run prints the request; otherwise confirms (production) and calls the API. */
async function write<T>(ctx: Ctx, summary: string, run: (api: CustomyProvisioning) => Promise<T>, render: (result: T) => { json?: unknown; human: string[]; secret?: boolean }): Promise<number> {
    if (bool(ctx.flags, "dry-run")) {
        const dry = dryRunClient(ctx.env);
        try { await run(dry.api); }
        catch (error) {
            const request = dry.captured();
            if (!request) throw error; // local validation failed before any request was built
            const { method, path: urlPath, query, headers, body } = request;
            const doc = { dryRun: true, environment: ctx.env, request: { method, path: urlPath, ...(query ? { query } : {}), headers, ...(body !== undefined ? { body } : {}) } };
            emit(ctx, doc, [
                `DRY RUN (nothing sent): ${summary}`,
                `environment: ${ctx.env}`,
                `${method} ${urlPath}${query ? `?${new URLSearchParams(query)}` : ""}`,
                ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
                ...(body !== undefined ? [JSON.stringify(body, null, 2)] : []),
            ]);
            return EXIT.ok;
        }
        throw new Error("dry run did not capture a request");
    }
    await confirmProduction(ctx, summary);
    const result = await run(liveClient(ctx));
    const out = render(result);
    if (out.secret && !ctx.json) ctx.io.err(SECRET_WARNING);
    emit(ctx, out.json ?? result, out.human);
    return EXIT.ok;
}

async function read<T>(ctx: Ctx, run: (api: CustomyProvisioning) => Promise<T>, render: (result: T) => { json?: unknown; human: string[] }): Promise<number> {
    const result = await run(liveClient(ctx));
    const out = render(result);
    emit(ctx, out.json ?? result, out.human);
    return EXIT.ok;
}

const userLines = (user: ProvisionedUser): string[] => [
    `externalKey: ${user.externalKey}`, `id:          ${user.id}`, `kind:        ${user.kind}`, `email:       ${user.email}`,
    `version:     ${user.version}`, `expiresAt:   ${user.expiresAt ?? "-"}`, `createdAt:   ${user.createdAt}`,
    ...(user.batchId ? [`batch:       ${user.batchId}`] : []),
];

const usersTable = (users: ProvisionedUser[]): string[] =>
    users.length === 0 ? ["(no users)"] : table([["EXTERNAL KEY", "KIND", "EMAIL", "EXPIRES"], ...users.map((u) => [u.externalKey, u.kind, u.email, u.expiresAt ?? "-"])]);

const auditTable = (entries: AuditEntry[]): string[] =>
    entries.length === 0 ? ["(no entries)"] : table([["SEQ", "AT", "ACTION", "SUBJECT", "ACTOR"], ...entries.map((e) => [String(e.seq), e.at, e.action, e.subject.key, e.actor.id])]);

function batchLines(result: BatchTestUsersResult): string[] {
    return [
        `batch ${result.batch.id}: ${result.batch.count} users, expires ${result.batch.expiresAt ?? "-"}`,
        ...table([["EXTERNAL KEY", "EMAIL", "PASSWORD"], ...result.users.map((u) => [u.externalKey, u.email, u.credentials.password ?? "(not returned)"])]),
    ];
}

async function users(args: string[], io: CliIo): Promise<number> {
    const [first, ...tail] = args;
    if (first === "test") {
        const [action, ...rest] = tail;
        if (action === "create") {
            const { flags } = parse(rest, { count: "string", "email-base": "string", "email-domain": "string", currency: "string", country: "string", locale: "string", tag: "string", "expires-in-days": "string", reason: "string", ticket: "string", "batch-id": "string", attr: "list" }, 0);
            const ctx = context(io, flags);
            const count = int(flags, "count", 1, 1000);
            if (count === undefined) throw new UsageError("--count is required (1-1000)");
            const emailBase = str(flags, "email-base");
            const emailDomain = str(flags, "email-domain");
            if ((emailBase === undefined) === (emailDomain === undefined)) throw new UsageError("pass exactly one of --email-base or --email-domain");
            const input = {
                count, ...(emailBase !== undefined ? { emailBase } : { emailDomain }),
                ...(str(flags, "tag") ? { tag: str(flags, "tag") } : {}), ...(attributes(flags) ? { attributes: attributes(flags) } : {}),
                ...(expiry(flags) ? { expiresAt: expiry(flags) } : {}), ...(str(flags, "ticket") ? { ticket: str(flags, "ticket") } : {}),
                ...(str(flags, "batch-id") ? { batchId: str(flags, "batch-id") } : {}),
                reason: str(flags, "reason") ?? `customy cli: create ${count} test users`,
            };
            return write(ctx, `create ${count} test users`, (api) => api.testUsers.batch(input), (result) => ({ human: batchLines(result), secret: true }));
        }
        if (action === "cleanup") {
            const { flags } = parse(rest, { batch: "string", mine: "boolean", reason: "string", ticket: "string" }, 0);
            const ctx = context(io, flags);
            const batch = str(flags, "batch");
            if ((batch === undefined) === !bool(flags, "mine")) throw new UsageError("pass exactly one of --batch ID or --mine");
            const reason = required(flags, "reason");
            return write(ctx, batch ? `delete test users of batch ${batch}` : "delete all your test users",
                (api) => api.testUsers.cleanup(batch ? { batch } : { mine: true }, { reason, ...(str(flags, "ticket") ? { ticket: str(flags, "ticket") } : {}) }),
                (r) => ({ human: [`deleted ${r.deleted} test users${r.batch ? ` (batch ${r.batch})` : ""}`] }));
        }
        throw new UsageError("usage: customy users test <create|cleanup> --env staging|production ...");
    }
    if (first === "get") {
        const { flags, rest } = parse(tail, {}, 1);
        const ctx = context(io, flags);
        return read(ctx, (api) => api.users.get(rest[0]!), (user) => ({ human: userLines(user) }));
    }
    if (first === "list") {
        const { flags } = parse(tail, { kind: "string", batch: "string", q: "string", limit: "string", all: "boolean", cursor: "string", "created-by": "string" }, 0);
        const ctx = context(io, flags);
        const kind = str(flags, "kind");
        if (kind !== undefined && kind !== "test" && kind !== "regular") throw new UsageError("--kind must be test or regular");
        const params: ListUsersParams = { ...(kind ? { kind } : {}), ...(str(flags, "batch") ? { batch: str(flags, "batch") } : {}), ...(str(flags, "q") ? { q: str(flags, "q") } : {}), ...(str(flags, "created-by") ? { createdBy: str(flags, "created-by") } : {}), ...(int(flags, "limit", 1, 200) ? { limit: int(flags, "limit", 1, 200) } : {}) };
        if (bool(flags, "all")) {
            return read(ctx, async (api) => { const all: ProvisionedUser[] = []; for await (const user of api.users.listAll(params)) all.push(user); return all; }, (all) => ({ json: { data: all }, human: usersTable(all) }));
        }
        return read(ctx, (api) => api.users.list({ ...params, ...(str(flags, "cursor") ? { cursor: str(flags, "cursor") } : {}) }), (page) => ({
            human: [...usersTable(page.data), ...(page.page.nextCursor ? [`more results: --cursor ${page.page.nextCursor} (or --all)`] : [])],
        }));
    }
    if (first === "upsert") {
        const { flags, rest } = parse(tail, { email: "string", name: "string", kind: "string", attr: "list", currency: "string", country: "string", locale: "string", password: "string", "expires-in-days": "string", reason: "string", ticket: "string", "expected-version": "string" }, 1);
        const ctx = context(io, flags);
        const kind = str(flags, "kind") ?? "test";
        if (kind !== "test" && kind !== "regular") throw new UsageError("--kind must be test or regular");
        const password = str(flags, "password") ?? (kind === "test" ? "generate" : "none");
        if (password !== "generate" && password !== "none") throw new UsageError('--password accepts only "generate" or "none" (passwords never travel on the command line)');
        const input: UpsertUserInput = {
            email: required(flags, "email"), kind, reason: required(flags, "reason"),
            ...(str(flags, "name") ? { name: str(flags, "name") } : {}), ...(attributes(flags) ? { attributes: attributes(flags) } : {}),
            ...(password === "generate" ? { password: "generate" as const } : {}), ...(expiry(flags) ? { expiresAt: expiry(flags) } : {}),
            ...(str(flags, "ticket") ? { ticket: str(flags, "ticket") } : {}),
            ...(int(flags, "expected-version", 0, Number.MAX_SAFE_INTEGER) !== undefined ? { expectedVersion: int(flags, "expected-version", 0, Number.MAX_SAFE_INTEGER) } : {}),
        };
        return write(ctx, `upsert user ${rest[0]}`, (api) => api.users.upsert(rest[0]!, input), (result) => ({
            human: [`${result.created ? "created" : result.changed ? "updated" : "unchanged"} ${result.externalKey} (version ${result.version})`, ...userLines(result),
                ...(result.credentials?.password ? [`password:    ${result.credentials.password}`] : [])],
            secret: Boolean(result.credentials?.password),
        }));
    }
    if (first === "delete") {
        const { flags, rest } = parse(tail, { reason: "string", ticket: "string", "if-match": "string" }, 1);
        const ctx = context(io, flags);
        const reason = required(flags, "reason");
        return write(ctx, `delete user ${rest[0]}`, (api) => api.users.delete(rest[0]!, { reason, ...(str(flags, "ticket") ? { ticket: str(flags, "ticket") } : {}), ...(str(flags, "if-match") ? { ifMatch: str(flags, "if-match") } : {}) }),
            (r) => ({ human: [`deleted ${r.externalKey} (version ${r.version})`] }));
    }
    if (first === "signin-link") {
        const { flags, rest } = parse(tail, { reason: "string", ticket: "string" }, 1);
        const ctx = context(io, flags);
        const reason = required(flags, "reason");
        return write(ctx, `issue a signin link for ${rest[0]}`, (api) => api.users.signinLink(rest[0]!, { reason, ...(str(flags, "ticket") ? { ticket: str(flags, "ticket") } : {}) }),
            (r) => ({ human: [`link:      ${r.link ?? "(not returned)"}`, `expiresAt: ${r.expiresAt}`], secret: Boolean(r.link) }));
    }
    throw new UsageError("usage: customy users <test create|test cleanup|get|list|upsert|delete|signin-link> --env staging|production ...");
}

async function audit(args: string[], io: CliIo): Promise<number> {
    const [action, ...rest] = args;
    const filters: Record<string, FlagKind> = { actor: "string", action: "string", subject: "string", batch: "string", from: "string", to: "string" };
    const pick = (flags: Flags) => Object.fromEntries(Object.keys(filters).filter((name) => str(flags, name)).map((name) => [name, str(flags, name)!])) as Record<string, string>;
    if (action === "list") {
        const { flags } = parse(rest, { ...filters, limit: "string", all: "boolean", cursor: "string" }, 0);
        const ctx = context(io, flags);
        const limit = int(flags, "limit", 1, 200);
        const params = { ...pick(flags), ...(limit ? { limit } : {}) };
        if (bool(flags, "all")) {
            return read(ctx, async (api) => { const all: AuditEntry[] = []; for await (const entry of api.audit.listAll(params)) all.push(entry); return all; }, (all) => ({ json: { data: all }, human: auditTable(all) }));
        }
        return read(ctx, (api) => api.audit.list({ ...params, ...(str(flags, "cursor") ? { cursor: str(flags, "cursor") } : {}) }), (page) => ({
            human: [...auditTable(page.data), ...(page.page.nextCursor ? [`more results: --cursor ${page.page.nextCursor} (or --all)`] : [])],
        }));
    }
    if (action === "export") {
        const { flags } = parse(rest, { ...filters, format: "string", out: "string" }, 0);
        const ctx = context(io, flags);
        const format = required(flags, "format");
        if (format !== "csv" && format !== "ndjson") throw new UsageError("--format must be csv or ndjson");
        const text = await liveClient(ctx).audit.export({ format, ...pick(flags) });
        const out = str(flags, "out");
        if (out) {
            await writeFile(path.resolve(io.cwd, out), text);
            emit(ctx, { out, bytes: text.length, format }, [`wrote ${text.length} characters of ${format} to ${out}`]);
        } else io.out(text.replace(/\n$/, ""));
        return EXIT.ok;
    }
    if (action === "verify") {
        const { flags } = parse(rest, {}, 0);
        const ctx = context(io, flags);
        const result = await liveClient(ctx).audit.verify();
        emit(ctx, result, [result.ok ? `audit chain OK: ${result.verified} entries verified (head seq ${result.headSeq})` : `audit chain BROKEN at seq ${result.brokenAtSeq}: ${result.reason}`]);
        return result.ok ? EXIT.ok : EXIT.failure;
    }
    throw new UsageError("usage: customy audit <list|export|verify> --env staging|production ...");
}

async function policy(args: string[], io: CliIo): Promise<number> {
    const [action, ...rest] = args;
    if (action !== "get") throw new UsageError("usage: customy policy get --env staging|production");
    const ctx = context(io, parse(rest, {}, 0).flags);
    return read(ctx, (api) => api.policy.get(), (view) => ({
        human: [`policy version ${view.version}`, `writes enabled (effective): ${view.effective.writesEnabled} (deployment ${view.effective.deployment.enabled ? "on" : "off"}, stage ${view.effective.stage})`, `approval mode: ${view.policy.approvalMode}`,
            ...Object.entries(view.policy.caps).map(([name, value]) => `${name}: ${value}`), `allowRegularUsers: ${view.policy.allowRegularUsers}`, `allowSigninLinks: ${view.policy.allowSigninLinks}`],
    }));
}

async function whoami(args: string[], io: CliIo): Promise<number> {
    const ctx = context(io, parse(args, {}, 0).flags);
    return read(ctx, (api) => api.whoami(), (me) => ({
        human: [`client:      ${me.client.id} (owner ${me.client.owner})`, `environment: ${me.environmentId} (${me.stage})`, `audience:    ${me.audience}`, `scopes:      ${me.scopes.join(" ") || "-"}`, `writes:      ${me.effective.writesEnabled ? "enabled" : "disabled"} (policy v${me.policy.version}, ${me.policy.approvalMode})`],
    }));
}

function context(io: CliIo, flags: Flags): Ctx {
    return { io, flags, env: environmentOf(flags), json: bool(flags, "json") };
}

function login(io: CliIo): number {
    io.err("customy login: the interactive device flow is not available yet.");
    io.err("Use client credentials instead: export CUSTOMY_CLIENT_ID, CUSTOMY_CLIENT_SECRET and CUSTOMY_ACCESS_URL (an Access API key of the target environment),");
    io.err("then pass --env staging|production. A pre-obtained bearer can be given as CUSTOMY_TOKEN.");
    return EXIT.unsupported;
}

/** Message for a failure, with the error code and request id and never a secret (the SDK scrubs them). */
function report(error: unknown, io: CliIo): number {
    if (error instanceof UsageError) { io.err(`error: ${error.message}`); io.err("run `customy --help` for usage"); return EXIT.failure; }
    if (error instanceof Refused) { io.err(`refused: ${error.message}`); return EXIT.confirmation; }
    if (error instanceof CustomyProvisioningError) {
        const request = error.requestId ? ` (request ${error.requestId})` : "";
        io.err(`error ${error.code}${error.status ? ` [${error.status}]` : ""}: ${error.message}${request}`);
        if (error instanceof CustomyScopeError && error.scope) io.err(`missing scope: ${error.scope}`);
        if (error instanceof CustomyEnvironmentMismatchError) io.err("the API key belongs to another environment than --env");
        if (error instanceof CustomyConflictError && error.currentVersion !== undefined) io.err(`current version: ${error.currentVersion}`);
        if (error instanceof CustomyRateLimitError && error.retryAfter !== undefined) io.err(`retry after ${error.retryAfter}s`);
        if (error instanceof CustomyEnvironmentMismatchError) return EXIT.confirmation;
        if (error instanceof CustomyAuthError) return EXIT.auth;
        return EXIT.failure;
    }
    io.err(`error: ${error instanceof Error ? error.message : "unexpected failure"}`);
    return EXIT.failure;
}

export async function runProvisioningCli(group: string, args: string[], io: CliIo): Promise<number> {
    try {
        if (args.includes("--help") && group !== "login") { io.out(PROVISIONING_HELP.join("\n")); return EXIT.ok; }
        switch (group) {
            case "users": return await users(args, io);
            case "audit": return await audit(args, io);
            case "policy": return await policy(args, io);
            case "whoami": return await whoami(args, io);
            default: return login(io);
        }
    } catch (error) {
        return report(error, io);
    }
}
