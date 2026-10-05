import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../cli";

const BASE = "https://access.fixture.invalid";
const SECRET = "csk_super_secret_client_value";
const BEARER = "eyJhbGciOiJSUzI1NiJ9.bearer-payload.bearer-signature";
const PASSWORD = "Gen3rated-P@ssw0rd-once";
const LINK = "https://app.fixture.invalid/magic?t=very-secret-link";
const CREDS = { CUSTOMY_CLIENT_ID: "client_1", CUSTOMY_CLIENT_SECRET: SECRET, CUSTOMY_ACCESS_URL: BASE };

type Call = { url: string; method: string; headers: Headers; body?: string };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req_cli1", ...headers } });
const failure = (status: number, code: string, details?: Record<string, unknown>) => json(status, { error: { code, message: `${code} happened`, ...(details ? { details } : {}), requestId: "req_cli1" } });

function run(argv: string[], replies: Array<Response | ((call: Call) => Response)> = [], extra: Partial<CliIo> = {}) {
  const calls: Call[] = [];
  const lines: string[] = [];
  const errors: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : undefined };
    if (call.url.endsWith("/oauth/token")) return json(200, { access_token: BEARER, expires_in: 900 });
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error("no scripted reply");
    return typeof next === "function" ? next(call) : next;
  }) as typeof globalThis.fetch;
  const io: CliIo = { cwd: tmpdir(), env: { ...CREDS }, out: (l) => lines.push(l), err: (l) => errors.push(l), fetch, ...extra };
  return { code: runCli(argv, io), calls, lines, errors, io };
}

const USER = { externalKey: "u1", id: "usr_1", kind: "test", email: "a@qa.example.com", name: null, emailVerified: true, version: 2, attributes: {}, expiresAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const BATCH = { batch: { id: "run-1", count: 2, expiresAt: "2026-10-08T00:00:00Z" }, users: [0, 1].map((i) => ({ externalKey: `k${i}`, id: `u${i}`, email: `u${i}@qa.example.com`, name: null, expiresAt: null, credentials: { password: `${PASSWORD}-${i}` } })), audit: { id: "a" } };
const CREATE = ["users", "test", "create", "--count", "2", "--email-domain", "qa.example.com", "--reason", "e2e checkout run"];

describe("argument handling", () => {
  it("requires --env for every server command, with no default", async () => {
    for (const argv of [["users", "get", "u1"], ["users", "list"], ["whoami"], ["policy", "get"], ["audit", "verify"], [...CREATE], ["users", "test", "cleanup", "--mine", "--reason", "cleanup after run"]]) {
      const r = run(argv);
      expect(await r.code).toBe(1);
      expect(r.errors.join("\n")).toContain("--env is required");
      expect(r.calls).toHaveLength(0);
    }
  });

  it("rejects an unknown environment, unknown flags and passwords on the command line", async () => {
    expect(await run(["whoami", "--env", "prod"]).code).toBe(1);
    expect(await run(["whoami", "--env", "staging", "--bogus"]).code).toBe(1);
    const r = run(["users", "upsert", "u1", "--env", "staging", "--email", "a@b.co", "--reason", "manual qa account", "--password", "hunter2"]);
    expect(await r.code).toBe(1);
    expect(r.errors.join("\n")).toContain("never travel on the command line");
    expect(r.calls).toHaveLength(0);
  });

  it("needs the Access origin and credentials from the environment", async () => {
    const noUrl = run(["whoami", "--env", "staging"], [], { env: { CUSTOMY_CLIENT_ID: "a", CUSTOMY_CLIENT_SECRET: "b" } });
    expect(await noUrl.code).toBe(1);
    expect(noUrl.errors.join("\n")).toContain("CUSTOMY_ACCESS_URL");
    const noCreds = run(["whoami", "--env", "staging"], [], { env: { CUSTOMY_ACCESS_URL: BASE } });
    expect(await noCreds.code).toBe(3);
    expect(noCreds.errors.join("\n")).toContain("CUSTOMY_CLIENT_ID");
  });

  it("accepts --base-url and a pre-obtained CUSTOMY_TOKEN", async () => {
    const r = run(["whoami", "--env", "staging", "--base-url", BASE], [json(200, { environmentId: "env1", stage: "staging", client: { id: "c", owner: "o" }, scopes: ["provisioning.users.read"], audience: "customy-provisioning", policy: { version: 1, writesEnabled: true, approvalMode: "none" }, effective: { writesEnabled: true } })], { env: { CUSTOMY_TOKEN: "pre-obtained-token-abc" } });
    expect(await r.code).toBe(0);
    expect(r.calls[0]!.headers.get("authorization")).toBe("Bearer pre-obtained-token-abc");
    expect(r.calls[0]!.headers.get("customy-environment")).toBe("staging");
    expect(r.lines.join("\n")).toContain("provisioning.users.read");
  });

  it("help lists the provisioning commands", async () => {
    const r = run(["--help"]);
    expect(await r.code).toBe(0);
    expect(r.lines.join("\n")).toContain("customy users test create");
  });
});

describe("output", () => {
  it("--json prints exactly one parseable document on stdout and nothing else", async () => {
    const r = run(["users", "get", "u1", "--env", "staging", "--json"], [json(200, USER)]);
    expect(await r.code).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(JSON.parse(r.lines[0]!)).toMatchObject({ externalKey: "u1", version: 2 });
    expect(r.errors).toEqual([]);
  });

  it("test create: passwords on stdout once, warning on stderr, never the password on stderr; sends the environment header", async () => {
    const r = run([...CREATE, "--env", "staging", "--currency", "COP", "--expires-in-days", "3"], [json(201, BATCH)]);
    expect(await r.code).toBe(0);
    expect(r.lines.join("\n")).toContain(`${PASSWORD}-0`);
    expect(r.errors.join("\n")).toContain("shown ONCE");
    expect(r.errors.join("\n")).not.toContain(PASSWORD);
    expect(r.calls[0]!.headers.get("customy-environment")).toBe("staging");
    expect(r.calls[0]!.headers.get("idempotency-key")).toMatch(/^[A-Za-z0-9_:.-]{8,128}$/);
    const body = JSON.parse(r.calls[0]!.body!);
    expect(body).toMatchObject({ count: 2, emailDomain: "qa.example.com", attributes: { currency: "COP" }, reason: "e2e checkout run" });
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now() + 2 * 86_400_000);
  });

  it("test create --json carries the passwords in the single document", async () => {
    const r = run([...CREATE, "--env", "staging", "--json"], [json(201, BATCH)]);
    expect(await r.code).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(JSON.parse(r.lines[0]!).users[1].credentials.password).toBe(`${PASSWORD}-1`);
  });

  it("upsert generates a password by default for test users, and not for regular ones", async () => {
    const created = run(["users", "upsert", "u1", "--env", "staging", "--email", "a@qa.example.com", "--reason", "manual qa account", "--attr", "locale=es-CO"], [json(201, { ...USER, changed: true, created: true, credentials: { password: PASSWORD }, audit: { id: "a" } })]);
    expect(await created.code).toBe(0);
    expect(JSON.parse(created.calls[0]!.body!)).toMatchObject({ password: "generate", kind: "test", attributes: { locale: "es-CO" } });
    expect(created.lines.join("\n")).toContain(PASSWORD);
    expect(created.errors.join("\n")).not.toContain(PASSWORD);
    const regular = run(["users", "upsert", "u2", "--env", "staging", "--email", "b@x.co", "--kind", "regular", "--reason", "manual qa account"], [json(200, { ...USER, kind: "regular", changed: false, created: false, audit: { id: "a" } })]);
    await regular.code;
    expect(JSON.parse(regular.calls[0]!.body!).password).toBeUndefined();
  });

  it("signin-link shows the link once", async () => {
    const r = run(["users", "signin-link", "u1", "--env", "staging", "--reason", "debug a checkout"], [json(201, { externalKey: "u1", link: LINK, expiresAt: "2026-10-01T00:10:00Z", audit: { id: "a" } })]);
    expect(await r.code).toBe(0);
    expect(r.lines.join("\n")).toContain(LINK);
    expect(r.errors.join("\n")).not.toContain(LINK);
  });

  it("list --all follows cursors", async () => {
    const page = (keys: string[], next: string | null) => json(200, { data: keys.map((k) => ({ ...USER, externalKey: k })), page: { nextCursor: next, limit: 2 } });
    const r = run(["users", "list", "--env", "staging", "--all", "--json"], [page(["a", "b"], "c1"), page(["c"], null)]);
    expect(await r.code).toBe(0);
    expect(JSON.parse(r.lines[0]!).data.map((u: { externalKey: string }) => u.externalKey)).toEqual(["a", "b", "c"]);
    expect(new URL(r.calls[1]!.url).searchParams.get("cursor")).toBe("c1");
  });

  it("audit export --out writes the file; audit verify fails with 1 on a broken chain", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "customy-cli-audit-"));
    const exported = run(["audit", "export", "--env", "staging", "--format", "csv", "--out", "audit.csv"], [new Response("id,seq\na1,1\n", { status: 200, headers: { "content-type": "text/csv" } })], { cwd: dir });
    expect(await exported.code).toBe(0);
    expect(readFileSync(path.join(dir, "audit.csv"), "utf8")).toBe("id,seq\na1,1\n");
    const verify = run(["audit", "verify", "--env", "staging"], [json(200, { ok: false, brokenAtSeq: 7, reason: "hash mismatch" })]);
    expect(await verify.code).toBe(1);
    expect(verify.lines.join("\n")).toContain("BROKEN at seq 7");
  });
});

describe("--dry-run", () => {
  const writes: Array<[string, string[], string, string]> = [
    ["test create", [...CREATE, "--env", "staging", "--dry-run", "--json"], "POST", "/v1/provisioning/test-users:batch"],
    ["test cleanup", ["users", "test", "cleanup", "--mine", "--reason", "cleanup after run", "--env", "staging", "--dry-run", "--json"], "DELETE", "/v1/provisioning/test-users"],
    ["delete", ["users", "delete", "u1", "--reason", "remove stale user", "--env", "staging", "--dry-run", "--json"], "DELETE", "/v1/provisioning/users/u1"],
    ["upsert", ["users", "upsert", "u1", "--email", "a@qa.example.com", "--reason", "manual qa account", "--env", "staging", "--dry-run", "--json"], "PUT", "/v1/provisioning/users/u1"],
  ];
  it.each(writes)("%s performs zero network calls and prints the request", async (_name, argv, method, urlPath) => {
    let fetched = 0;
    const r = run(argv, [], { env: {}, fetch: (async () => { fetched += 1; throw new Error("network"); }) as typeof fetch });
    expect([await r.code, r.errors]).toEqual([0, []]);
    expect(fetched).toBe(0);
    expect(r.lines).toHaveLength(1);
    const doc = JSON.parse(r.lines[0]!);
    expect(doc).toMatchObject({ dryRun: true, environment: "staging", request: { method, path: urlPath } });
    expect(doc.request.headers["Customy-Environment"]).toBe("staging");
    expect(JSON.stringify(doc)).not.toMatch(/authorization|bearer/i);
  });

  it("human dry-run is readable, and production dry-run needs no confirmation", async () => {
    const r = run([...CREATE, "--env", "production", "--dry-run"], [], { env: {} });
    expect(await r.code).toBe(0);
    expect(r.lines.join("\n")).toContain("DRY RUN");
    expect(r.lines.join("\n")).toContain("environment: production");
    expect(r.calls).toHaveLength(0);
  });

  it("still validates arguments", async () => {
    const r = run(["users", "test", "create", "--count", "0", "--email-domain", "x.co", "--env", "staging", "--dry-run"], [], { env: {} });
    expect(await r.code).toBe(1);
  });
});

describe("production confirmation", () => {
  const argv = [...CREATE, "--env", "production"];

  it("non-interactive production writes need --yes-i-am-sure production", async () => {
    const none = run(argv, [json(201, BATCH)]);
    expect(await none.code).toBe(4);
    expect(none.errors.join("\n")).toContain("--yes-i-am-sure production");
    expect(none.calls).toHaveLength(0);
    const wrong = run([...argv, "--yes-i-am-sure", "staging"], [json(201, BATCH)]);
    expect(await wrong.code).toBe(4);
    expect(wrong.calls).toHaveLength(0);
    const ok = run([...argv, "--yes-i-am-sure", "production"], [json(201, BATCH)]);
    expect(await ok.code).toBe(0);
    expect(ok.calls[0]!.headers.get("customy-environment")).toBe("production");
  });

  it("interactive: the exact environment name is accepted, anything else is refused", async () => {
    const asked: string[] = [];
    const prompt = (answer: string) => async (question: string) => { asked.push(question); return answer; };
    const accepted = run(argv, [json(201, BATCH)], { isTTY: true, prompt: prompt("production") });
    expect(await accepted.code).toBe(0);
    expect(asked[0]).toContain('Type "production"');
    const rejected = run(argv, [json(201, BATCH)], { isTTY: true, prompt: prompt("prod") });
    expect(await rejected.code).toBe(4);
    expect(rejected.calls).toHaveLength(0);
    expect(rejected.errors.join("\n")).toContain("nothing was changed");
  });

  it("reads and staging writes never ask", async () => {
    const read = run(["users", "get", "u1", "--env", "production"], [json(200, USER)]);
    expect(await read.code).toBe(0);
    const staging = run([...CREATE, "--env", "staging"], [json(201, BATCH)], { isTTY: true, prompt: async () => { throw new Error("must not prompt"); } });
    expect(await staging.code).toBe(0);
  });
});

describe("errors and exit codes", () => {
  it.each([
    [403, "SCOPE_REQUIRED", { scope: "provisioning.test.write" }, 3],
    [403, "ENVIRONMENT_MISMATCH", undefined, 4],
    [401, "TOKEN_INVALID", undefined, 3],
    [403, "AUDIENCE_MISMATCH", undefined, 3],
    [404, "NOT_FOUND", undefined, 1],
    [423, "CAPABILITY_DISABLED", undefined, 1],
    [422, "QUOTA_EXCEEDED", { remaining: 0, limit: 10 }, 1],
  ] as const)("%i %s exits %i with code and request id, no secrets", async (status, code, details, exit) => {
    const r = run(["users", "get", "u1", "--env", "staging"], [failure(status, code, details as Record<string, unknown> | undefined), failure(status, code, details as Record<string, unknown> | undefined)]);
    expect(await r.code).toBe(exit);
    const text = r.errors.join("\n");
    expect(text).toContain(code);
    expect(text).toContain("req_cli1");
    for (const secret of [SECRET, BEARER]) expect(text).not.toContain(secret);
    expect(r.lines).toEqual([]);
  });

  it("shows the missing scope and the current version on conflicts", async () => {
    const scope = run(["users", "test", "cleanup", "--mine", "--reason", "cleanup after run", "--env", "staging"], [failure(403, "SCOPE_REQUIRED", { scope: "provisioning.test.write" })]);
    await scope.code;
    expect(scope.errors.join("\n")).toContain("missing scope: provisioning.test.write");
    const conflict = run(["users", "delete", "u1", "--reason", "remove stale user", "--if-match", "1", "--env", "staging"], [failure(412, "PRECONDITION_FAILED", { currentVersion: 5 })]);
    expect(await conflict.code).toBe(1);
    expect(conflict.errors.join("\n")).toContain("current version: 5");
  });

  it("a hostile server cannot make the CLI print secrets", async () => {
    const hostile = json(400, { error: { code: "VALIDATION", message: `echo ${SECRET} ${BEARER}`, requestId: "req_cli1" } });
    const r = run(["users", "get", "u1", "--env", "staging"], [hostile]);
    expect(await r.code).toBe(1);
    expect(r.errors.join("\n")).not.toContain(SECRET);
    expect(r.errors.join("\n")).not.toContain(BEARER);
  });
});

describe("customy login", () => {
  it("is a stub: says the device flow is not available, explains client credentials, exits 2", async () => {
    const r = run(["login"]);
    expect(await r.code).toBe(2);
    const text = r.errors.join("\n");
    expect(text).toContain("device flow is not available yet");
    expect(text).toContain("CUSTOMY_CLIENT_ID");
    expect(r.lines).toEqual([]);
    expect(r.calls).toHaveLength(0);
  });
});
