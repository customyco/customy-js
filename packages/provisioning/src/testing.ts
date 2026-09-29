/**
 * Test helpers: a batch of throw-away users that is ALWAYS cleaned up.
 *
 * ```ts
 * await withEphemeralUsers({ count: 2, client, emailDomain: "qa.example.com" }, async ([a, b]) => {
 *   await signIn(a.email, a.password);
 * });
 * ```
 */
import { createProvisioning, type CustomyProvisioning, type ProvisioningOptions } from "./client";
import { CustomyProvisioningError } from "./errors";
import type { BatchTestUsersInput } from "./types";

export type EphemeralUser = { externalKey: string; email: string; password: string; id: string };

type EmailSource = { emailBase: string; emailDomain?: undefined } | { emailDomain: string; emailBase?: undefined };
type ClientSource = { client: CustomyProvisioning; credentials?: undefined } | { credentials: ProvisioningOptions; client?: undefined };

export type EphemeralUsersOptions = EmailSource & ClientSource & {
    count: number;
    /** Tags the batch. Default: GITHUB_RUN_ID / CI run id from the environment, else random. */
    runId?: string;
    currency?: string;
    country?: string;
    reason?: string;
    /** Server-side expiry safety net if cleanup never runs (default 4 hours). */
    ttlHours?: number;
    /** Called when cleanup fails. A cleanup failure never masks an error thrown by the callback. */
    onCleanupError?: (error: unknown) => void;
    /** Environment variables used to derive the run id (default: `process.env` when it exists). */
    env?: Record<string, string | undefined>;
};

const CI_RUN_VARS = ["GITHUB_RUN_ID", "CI_PIPELINE_ID", "BUILD_ID", "BUILDKITE_BUILD_ID", "CIRCLE_WORKFLOW_ID", "CI_JOB_ID"];

function randomId(): string {
    const bytes = (globalThis.crypto ?? undefined)?.getRandomValues(new Uint8Array(5));
    if (!bytes) return Math.random().toString(36).slice(2, 12);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A batch id the server accepts: 3-64 characters of [A-Za-z0-9._-]. */
export function resolveRunId(runId: string | undefined, env: Record<string, string | undefined> | undefined): string {
    let raw = runId;
    if (!raw && env) {
        const found = CI_RUN_VARS.find((name) => env[name]);
        if (found) raw = `${env[found]}${env.GITHUB_RUN_ATTEMPT ? `-${env.GITHUB_RUN_ATTEMPT}` : ""}-${randomId().slice(0, 4)}`;
    }
    raw ||= `local-${randomId()}`;
    const clean = raw.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64);
    return clean.length >= 3 ? clean : `run-${clean}`;
}

function processEnv(): Record<string, string | undefined> | undefined {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
}

export type EphemeralBatch = {
    runId: string;
    batchId: string;
    users: EphemeralUser[];
    /** Deletes the batch (reason "ephemeral cleanup <runId>"). */
    cleanup(): Promise<void>;
};

/** Creates the batch; the caller owns `cleanup()`. `withEphemeralUsers` and the fixture build on it. */
export async function createEphemeralBatch(options: EphemeralUsersOptions): Promise<EphemeralBatch> {
    const client = options.client ?? createProvisioning(options.credentials);
    const runId = resolveRunId(options.runId, options.env ?? processEnv());
    const cleanupReason = `ephemeral cleanup ${runId}`;
    const input: BatchTestUsersInput = {
        count: options.count,
        ...(options.emailBase !== undefined ? { emailBase: options.emailBase } : { emailDomain: options.emailDomain }),
        tag: "e2e",
        batchId: runId,
        reason: options.reason ?? `ephemeral users for run ${runId}`,
        expiresAt: new Date(Date.now() + (options.ttlHours ?? 4) * 3_600_000),
        attributes: { currency: options.currency ?? "USD", country: options.country ?? "US" },
    };
    let result;
    try {
        result = await client.testUsers.batch(input);
    } catch (error) {
        // The batch is atomic. If the outcome is unknown (network / 5xx), try to drop a batch that may exist.
        const status = (error as { status?: number }).status;
        if (status === 0 || (typeof status === "number" && status >= 500)) {
            await client.testUsers.cleanup({ batch: runId }, { reason: cleanupReason }).catch((cleanupError: unknown) => options.onCleanupError?.(cleanupError));
        }
        throw error;
    }
    const users = result.users.map((user): EphemeralUser => {
        if (typeof user.credentials?.password !== "string") {
            throw new CustomyProvisioningError({ code: "SDK_PASSWORD_UNAVAILABLE", message: "the server did not return the generated password (idempotent replay?)" });
        }
        return { externalKey: user.externalKey, email: user.email, password: user.credentials.password, id: user.id };
    });
    const batchId = result.batch.id;
    return {
        runId, batchId, users,
        async cleanup() { await client.testUsers.cleanup({ batch: batchId }, { reason: cleanupReason }); },
    };
}

/** Runs `fn` with fresh users and always deletes them afterwards (also if `fn` throws). */
export async function withEphemeralUsers<T>(options: EphemeralUsersOptions, fn: (users: EphemeralUser[]) => Promise<T> | T): Promise<T> {
    const batch = await createEphemeralBatch(options);
    let failed = false;
    let failure: unknown;
    let result!: T;
    try {
        result = await fn(batch.users);
    } catch (error) {
        failed = true;
        failure = error;
    }
    try {
        await batch.cleanup();
    } catch (cleanupError) {
        options.onCleanupError?.(cleanupError);
        if (!failed) throw cleanupError;
    }
    if (failed) throw failure;
    return result;
}

export type EphemeralUsersFixture = {
    /** Create the batch (call from `beforeAll`). */
    setup(): Promise<EphemeralUser[]>;
    /** Delete it (call from `afterAll`); safe to call twice or without `setup`. */
    teardown(): Promise<void>;
    readonly users: EphemeralUser[];
};

/** Framework-agnostic: `beforeAll(fixture.setup); afterAll(fixture.teardown)` in vitest, jest, node:test... */
export function ephemeralUsersFixture(options: EphemeralUsersOptions): EphemeralUsersFixture {
    let batch: EphemeralBatch | undefined;
    return {
        async setup() { batch ??= await createEphemeralBatch(options); return batch.users; },
        async teardown() {
            const current = batch;
            batch = undefined;
            if (!current) return;
            try { await current.cleanup(); } catch (error) { options.onCleanupError?.(error); throw error; }
        },
        get users() { return batch?.users ?? []; },
    };
}
