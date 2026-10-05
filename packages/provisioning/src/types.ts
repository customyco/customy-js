/** Wire types of the Customy Provisioning API (`/v1/provisioning`). Hand-written from the contract. */

export type ProvisioningEnvironment = "staging" | "production";
export type UserKind = "test" | "regular";

export const PROVISIONING_SCOPES = [
    "provisioning.users.read",
    "provisioning.users.write",
    "provisioning.users.signin",
    "provisioning.test.write",
    "provisioning.audit.read",
    "provisioning.policy.manage",
] as const;
export type ProvisioningScope = (typeof PROVISIONING_SCOPES)[number];

export type UserAttributes = { currency?: string; country?: string; locale?: string } & Record<string, string | undefined>;

export type UpsertUserInput = {
    email: string;
    name?: string;
    /** Default `test`. */
    kind?: UserKind;
    /** Default `true`. */
    emailVerified?: boolean;
    /** The only accepted value: the password is generated server side and returned once. */
    password?: "generate";
    attributes?: UserAttributes;
    expiresAt?: string | Date;
    /** 10–300 characters. */
    reason: string;
    /** At most 64 characters. */
    ticket?: string;
    expectedVersion?: number;
};

export type UserCredentials = { password: string | null; redacted?: boolean };

export type ProvisionedUser = {
    externalKey: string;
    id: string;
    kind: UserKind;
    email: string;
    name: string | null;
    emailVerified: boolean;
    version: number;
    attributes: Record<string, string>;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
    batchId?: string | null;
};

export type UpsertUserResult = ProvisionedUser & {
    changed: boolean;
    created: boolean;
    /** Present only when `password: "generate"` created or rotated the password. Returned once. */
    credentials?: UserCredentials;
    audit: { id: string };
};

export type ListUsersParams = {
    kind?: UserKind;
    createdBy?: string;
    /** externalKey prefix. */
    q?: string;
    batch?: string;
    expiresBefore?: string | Date;
    /** 1–200, default 50. */
    limit?: number;
    cursor?: string;
};

export type PageInfo = { nextCursor: string | null; limit: number };
export type Paged<T> = { data: T[]; page: PageInfo };

export type DeleteUserInput = { reason: string; ticket?: string; ifMatch?: number | string };
export type DeleteUserResult = { externalKey: string; deleted: true; version: number; audit: { id: string } };

export type SigninLinkResult = {
    externalKey: string;
    /** A secret, returned once. */
    link: string | null;
    redacted?: boolean;
    expiresAt: string;
    audit: { id: string };
};

export type BatchTestUsersInput = {
    /** 1–1000. */
    count: number;
    /** `me@gmail.com` produces `me+<tag>-<yyyymmdd>-<batch>-<n>@gmail.com`. Exactly one of emailBase / emailDomain. */
    emailBase?: string;
    emailDomain?: string;
    /** Default `test`. */
    tag?: string;
    namePrefix?: string;
    attributes?: UserAttributes;
    expiresAt?: string | Date;
    reason: string;
    ticket?: string;
    /** Client run id, 3–64 characters. */
    batchId?: string;
    emailVerified?: boolean;
};

export type BatchTestUser = {
    externalKey: string;
    id: string;
    email: string;
    name: string | null;
    expiresAt: string | null;
    credentials: { password: string | null; redacted?: boolean };
};

export type BatchTestUsersResult = {
    batch: { id: string; count: number; expiresAt: string | null };
    users: BatchTestUser[];
    audit: { id: string };
};

export type CleanupTarget = { batch: string; mine?: undefined } | { mine: true; batch?: undefined };
export type CleanupInput = { reason: string; ticket?: string };
export type CleanupResult = { deleted: number; batch: string | null; audit: { id: string } | null };
export type ExpireResult = { expired: number };

export type AuditFilters = {
    actor?: string;
    action?: string;
    /** externalKey. */
    subject?: string;
    batch?: string;
    from?: string | Date;
    to?: string | Date;
};
export type ListAuditParams = AuditFilters & { limit?: number; cursor?: string };

export type AuditEntry = {
    id: string;
    seq: number;
    at: string;
    actor: { id: string; role: string; owner: string };
    action: string;
    subject: { type: string; key: string; id: string | null };
    batchId: string | null;
    before: unknown;
    after: unknown;
    reason: string | null;
    ticket: string | null;
    ip: string | null;
    userAgent: string | null;
    requestId: string | null;
    environment?: string;
    hash: string;
    prevHash: string | null;
};

export type AuditExportParams = AuditFilters & { format: "csv" | "ndjson" };
export type AuditVerifyResult =
    | { ok: true; verified: number; headSeq: number; headHash: string }
    | { ok: false; brokenAtSeq: number; reason: string };

export type ApprovalMode = "none" | "confirm" | "two-person";
export type ProvisioningPolicy = {
    writesEnabled: boolean;
    approvalMode: ApprovalMode;
    caps: {
        maxLiveTestUsers: number;
        maxBatchSize: number;
        maxWritesPerHourPerPrincipal: number;
        defaultTestExpiryDays: number;
        maxExpiryDays: number;
    };
    email: { allowedBases: string[]; allowedDomains: string[]; allowedAddresses: string[] };
    allowRegularUsers: boolean;
    allowSigninLinks: boolean;
};
export type PolicyView = {
    version: number;
    policy: ProvisioningPolicy;
    effective: { writesEnabled: boolean; deployment: { enabled: boolean }; stage: string };
};
export type PutPolicyInput = { policy: ProvisioningPolicy; reason: string; ticket?: string; expectedVersion?: number };
export type PutPolicyResult = { version: number; policy: ProvisioningPolicy; audit: { id: string } };

export type Whoami = {
    environmentId: string;
    stage: string;
    client: { id: string; owner: string };
    scopes: string[];
    audience: string;
    policy: { version: number; writesEnabled: boolean; approvalMode: ApprovalMode };
    effective: { writesEnabled: boolean };
};

/** Per-call options. Writes get an automatic `Idempotency-Key` (reused across retries) unless one is given. */
export type CallOptions = {
    idempotencyKey?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
};
export type UpsertOptions = CallOptions & { ifMatch?: number | string };

/** Redacted view of a request, handed to `onRequest`. */
export type RequestEvent = {
    method: string;
    url: string;
    attempt: number;
    headers: Record<string, string>;
    body?: unknown;
};
/** Redacted view of a response (or failure), handed to `onResponse`. */
export type ResponseEvent = {
    method: string;
    url: string;
    attempt: number;
    status: number;
    ok: boolean;
    requestId?: string;
    durationMs: number;
    headers: Record<string, string>;
    body?: unknown;
    /** `RateLimit-*` headers of writes, when the server sent them. */
    rateLimit?: { limit?: number; remaining?: number; resetSeconds?: number };
    /** `Idempotency-Replayed: true`. */
    replayed?: boolean;
};
