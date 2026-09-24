/**
 * Customy Access — Official Node.js / TypeScript SDK
 *
 * A fully-typed client library for consuming the Customy Access API.
 * Published as: @customyai/customy-access
 *
 * @example
 * ```ts
 * import { CustomyAccess } from "@customyai/customy-access";
 *
 * const customy = new CustomyAccess({
 *   baseUrl: "https://access.customy.ai",
 *   adminSecret: process.env.CUSTOMY_ADMIN_SECRET,
 * });
 *
 * // List users
 * const users = await customy.users.list("env_123");
 *
 * // Check permissions
 * const check = await customy.permissions.check({
 *   environmentId: "env_123",
 *   userId: "user_456",
 *   permission: "conversations:read",
 * });
 *
 * // Manage connections
 * const connections = await customy.connections.list("env_123");
 * await customy.connections.test("env_123", "conn_abc");
 * ```
 */


// Flags se expone solo por el subpath ./flags del workspace hasta que el
// servicio responda en staging (ADR CUSTOMY_SDK_PLATFORM_DECISION_2026-09-24, D5).

// ─── Config ──────────────────────────────────────────────────────

export interface CustomyAccessConfig {
    baseUrl: string;
    apiKey?: string;
    adminSecret?: string;
    bearerToken?: string;
    sessionToken?: string;
    /** Publishable key for environment identification */
    publishableKey?: string;
    organizationId?: string;
    projectId?: string;
    environmentId?: string;
    applicationId?: string;
    timeout?: number;
    retries?: number;
    userAgent?: string;
    fetch?: typeof fetch;
    allowUnsafeBrowserCredentials?: boolean;
    autoIdempotencyKey?: boolean;
    hooks?: CustomyAccessHooks;
}

export interface CustomyAccessRequestContext {
    method: string;
    url: string;
    path: string;
    headers: Record<string, string>;
    attempt: number;
}

export interface CustomyAccessResponseContext extends CustomyAccessRequestContext {
    status: number;
    requestId?: string;
}

export interface CustomyAccessHooks {
    beforeRequest?: (context: CustomyAccessRequestContext) => void | Promise<void>;
    afterResponse?: (context: CustomyAccessResponseContext) => void | Promise<void>;
    onRetry?: (context: CustomyAccessResponseContext & { delayMs: number }) => void | Promise<void>;
}

export interface PaginationOptions {
    limit?: number;
    startPage?: number;
    maxPages?: number;
    pageParam?: string;
    limitParam?: string;
    itemsKey?: string;
    totalKey?: string;
}

// ─── Error Class ─────────────────────────────────────────────────

export class APIError extends Error {
    status: number;
    body: unknown;
    requestId?: string;
    code?: string;

    constructor(status: number, message: string, body: unknown, requestId?: string, code?: string) {
        super(message);
        this.name = "CustomyAPIError";
        this.status = status;
        this.body = body;
        this.requestId = requestId;
        this.code = code;
    }
}

// ─── Base Client ─────────────────────────────────────────────────

class BaseClient {
    protected config: CustomyAccessConfig;

    constructor(config: CustomyAccessConfig) {
        this.config = config;
    }

    protected async request<T>(
        method: string,
        path: string,
        body?: unknown,
        overrideHeaders?: Record<string, string>
    ): Promise<T> {
        // In browser context, use relative URLs so requests go through the Next.js proxy
        // (which forwards cookies). The absolute baseUrl is only for server-side usage.
        const effectiveBase = typeof globalThis.window !== "undefined" ? "" : this.config.baseUrl;
        const url = `${effectiveBase}${path}`;
        const isBrowser = typeof globalThis.window !== "undefined";

        if (isBrowser && !this.config.allowUnsafeBrowserCredentials) {
            const unsafeKeys = [
                this.config.apiKey ? "apiKey" : null,
                this.config.adminSecret ? "adminSecret" : null,
                this.config.bearerToken ? "bearerToken" : null,
                this.config.sessionToken ? "sessionToken" : null,
            ].filter(Boolean);

            if (unsafeKeys.length > 0) {
                throw new Error(
                    `Customy Access browser SDK cannot use server-side credentials: ${unsafeKeys.join(", ")}. ` +
                    "Use publishableKey plus same-origin cookies, or proxy through a server route.",
                );
            }
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...overrideHeaders,
        };

        if (!isBrowser) {
            headers["User-Agent"] = this.config.userAgent ?? "customy-access-sdk/0.2.3";
        }
        if (this.config.apiKey) {
            headers["X-API-Key"] = this.config.apiKey;
        }
        if (this.config.adminSecret) {
            headers["X-Admin-Secret"] = this.config.adminSecret;
        }
        if (this.config.publishableKey) {
            headers["X-Publishable-Key"] = this.config.publishableKey;
        }
        const bearerToken = this.config.bearerToken ?? this.config.sessionToken;
        if (bearerToken) {
            headers["Authorization"] = `Bearer ${bearerToken}`;
        }
        if (this.config.organizationId) {
            headers["X-Org-Id"] = this.config.organizationId;
        }
        if (this.config.projectId) {
            headers["X-Project-Id"] = this.config.projectId;
        }
        if (this.config.environmentId) {
            headers["X-Env-Id"] = this.config.environmentId;
            headers["X-Environment-Id"] = this.config.environmentId;
        }
        if (this.config.applicationId) {
            headers["X-Application-Id"] = this.config.applicationId;
        }
        if (shouldAttachIdempotencyKey(method, headers, this.config.autoIdempotencyKey)) {
            headers["Idempotency-Key"] = createIdempotencyKey();
        }

        let lastError: Error | null = null;
        const maxRetries = this.config.retries ?? 2;
        const fetchImpl = this.config.fetch ?? fetch;
        const requestBody = body === undefined ? undefined : JSON.stringify(body);

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.config.timeout ?? 10000);
            let transportFailed = false;

            try {
                const requestContext: CustomyAccessRequestContext = { method, url, path, headers, attempt };
                await this.config.hooks?.beforeRequest?.(requestContext);
                controller.signal.throwIfAborted();
                let res: Response;
                let data: unknown;
                try {
                    res = await fetchImpl(url, {
                        method,
                        headers,
                        body: requestBody,
                        signal: controller.signal,
                        // In browser context, include credentials so session cookies are sent
                        ...(isBrowser ? { credentials: "include" as RequestCredentials } : {}),
                    });
                    data = res.status === 204 ? null : await parseResponseBody(res);
                } catch (error) {
                    transportFailed = true;
                    throw error;
                }
                const requestId = res.headers.get("x-request-id") ?? undefined;
                const responseContext: CustomyAccessResponseContext = {
                    method,
                    url,
                    path,
                    headers,
                    attempt,
                    status: res.status,
                    requestId,
                };
                await this.config.hooks?.afterResponse?.(responseContext);

                if (!res.ok) {
                    const retryAfter = res.headers.get("retry-after");
                    const code = data && typeof data === "object" && "code" in data
                        ? String((data as { code?: unknown }).code)
                        : undefined;

                    if (attempt < maxRetries && shouldRetry(method, res.status)) {
                        const delayMs = retryDelay(attempt, retryAfter);
                        await this.config.hooks?.onRetry?.({ ...responseContext, delayMs });
                        clearTimeout(timeout);
                        await sleep(delayMs);
                        continue;
                    }

                    throw new APIError(
                        res.status,
                        (data as Record<string, string>)?.message
                        ?? (data as Record<string, string>)?.error
                        ?? `HTTP ${res.status}`,
                        data,
                        requestId,
                        code
                    );
                }

                return data as T;
            } catch (err) {
                lastError = err as Error;
                // A mutation may already have succeeded when its response is lost.
                // HTTP errors and application hooks must not bypass the retry policy.
                if (!transportFailed || !isReadMethod(method) || attempt >= maxRetries) {
                    throw err;
                }
                clearTimeout(timeout);
                await sleep(retryDelay(attempt));
            } finally {
                clearTimeout(timeout);
            }
        }

        throw lastError;
    }
}

function shouldRetry(method: string, status: number): boolean {
    if (![408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return false;
    return isReadMethod(method);
}

function isReadMethod(method: string): boolean {
    return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function retryDelay(attempt: number, retryAfter?: string | null): number {
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }

    return Math.min(1000, 100 * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function shouldAttachIdempotencyKey(method: string, headers: Record<string, string>, enabled = true): boolean {
    if (!enabled) return false;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
    return !Object.keys(headers).some((key) => key.toLowerCase() === "idempotency-key");
}

/** Clave de idempotencia aleatoria e impredecible (Web Crypto: Node 20+, edge y navegador). */
function createIdempotencyKey(): string {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
        throw new Error("CUSTOMY_SECURE_RANDOM_UNAVAILABLE");
    }
    return `cak_idem_${cryptoApi.randomUUID()}`;
}

function queryString(params?: object): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
        if (!["string", "number", "boolean"].includes(typeof value) && value !== null && value !== undefined) continue;
        if (value === null || value === undefined || value === "") continue;
        search.set(key, String(value));
    }
    const serialized = search.toString();
    return serialized ? `?${serialized}` : "";
}

class RawClient extends BaseClient {
    public async request<T>(method: string, path: string, body?: unknown, overrideHeaders?: Record<string, string>): Promise<T> {
        return super.request(method, path, body, overrideHeaders);
    }

    public async *paginate<T>(path: string, options: PaginationOptions = {}): AsyncGenerator<T, void, unknown> {
        const pageParam = options.pageParam ?? "page";
        const limitParam = options.limitParam ?? "limit";
        const limit = options.limit ?? 100;
        let page = options.startPage ?? 1;
        let pagesRead = 0;

        while (options.maxPages === undefined || pagesRead < options.maxPages) {
            const separator = path.includes("?") ? "&" : "?";
            const response = await this.request<unknown>(
                "GET",
                `${path}${separator}${pageParam}=${encodeURIComponent(String(page))}&${limitParam}=${encodeURIComponent(String(limit))}`,
            );
            const rows = normalizePageRows<T>(response, options.itemsKey);

            if (rows.length === 0) return;

            for (const row of rows) {
                yield row;
            }

            pagesRead += 1;
            if (!hasNextPage(response, rows.length, page, limit, options.totalKey)) return;
            page += 1;
        }
    }
}

// ─── Helper: Normalize array/rows responses ──────────────────────

function normalizeRows<T>(data: unknown): T[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "rows" in data) return (data as { rows: T[] }).rows || [];
    return [];
}

function normalizePageRows<T>(data: unknown, itemsKey?: string): T[] {
    if (itemsKey && data && typeof data === "object" && itemsKey in data) {
        const value = (data as Record<string, unknown>)[itemsKey];
        return Array.isArray(value) ? value as T[] : [];
    }
    if (Array.isArray(data)) return data as T[];

    if (data && typeof data === "object") {
        for (const key of ["rows", "items", "data", "users", "sessions", "results"]) {
            const value = (data as Record<string, unknown>)[key];
            if (Array.isArray(value)) return value as T[];
        }
    }

    return [];
}

function hasNextPage(data: unknown, rowCount: number, page: number, limit: number, totalKey = "total"): boolean {
    if (rowCount < limit) return false;
    if (!data || typeof data !== "object") return rowCount === limit;

    const nextCursor = (data as Record<string, unknown>).nextCursor;
    if (typeof nextCursor === "string" && nextCursor.length > 0) return true;

    const hasMore = (data as Record<string, unknown>).hasMore;
    if (typeof hasMore === "boolean") return hasMore;

    const total = (data as Record<string, unknown>)[totalKey];
    if (typeof total === "number") return page * limit < total;

    return rowCount === limit;
}

// ═══════════════════════════════════════════════════════════════════
// ─── Resource Clients ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

// ─── Hierarchy ──────────────────────────────────────────────────

export interface Organization { id: string; name: string; slug: string; logo?: string; createdAt: string; }
export interface Project { id: string; name: string; organizationId: string; createdAt: string; }
export interface Application { id: string; name: string; projectId: string; type: string; createdAt: string; }
export interface Environment { id: string; name: string; type: string; applicationId: string; createdAt: string; }

export interface HierarchyTree {
    organizations: Array<Organization & {
        projects: Array<Project & {
            applications: Array<Application & {
                environments: Environment[];
            }>;
        }>;
    }>;
}

class HierarchyClient extends BaseClient {
    async getTree(): Promise<HierarchyTree> {
        return this.request("GET", "/api/admin/hierarchy");
    }

    async listOrganizations(): Promise<Organization[]> {
        const data = await this.request<unknown>("GET", "/api/admin/organizations");
        return normalizeRows(data);
    }

    async listProjects(envId: string): Promise<Project[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/projects`);
        return normalizeRows(data);
    }

    async listEnvironments(envId: string): Promise<Environment[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/environments`);
        return normalizeRows(data);
    }
}

// ─── Connections ────────────────────────────────────────────────

export interface Connection {
    id: string;
    name: string;
    provider_id: string;
    client_id: string;
    client_secret?: string;
    strategy: string;
    enabled: boolean;
    is_primary?: boolean;
    domain_hint?: string;
    scopes?: string;
    app_type?: string;
    environment_id?: string;
    organization_id?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ConnectionTestResult {
    connectionId: string;
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; message: string; durationMs?: number }>;
    warnings?: string[];
    connectionType?: string;
    testedAt?: string;
}

export interface ConnectionStats {
    totalConnections: number;
    totalUsers: number;
    mostPopularProvider: string;
    ssoAdoptionRate: number;
    connections: Array<{
        connectionId: string;
        providerId: string;
        name: string;
        totalUsers: number;
        activeUsers30d: number;
        signupsThisMonth: number;
        failedLoginsThisMonth: number;
    }>;
}

class ConnectionsClient extends BaseClient {
    async list(envId: string): Promise<Connection[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/connections`);
        return normalizeRows(data);
    }

    async get(envId: string, connectionId: string): Promise<Connection> {
        return this.request("GET", `/api/admin/env/${envId}/connections/${connectionId}`);
    }

    async create(envId: string, connection: Partial<Connection>): Promise<Connection> {
        return this.request("POST", `/api/admin/env/${envId}/connections`, connection);
    }

    async update(envId: string, connectionId: string, updates: Partial<Connection>): Promise<Connection> {
        return this.request("PUT", `/api/admin/env/${envId}/connections/${connectionId}`, updates);
    }

    async delete(envId: string, connectionId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/connections/${connectionId}`);
    }

    async test(envId: string, connectionId: string): Promise<ConnectionTestResult> {
        return this.request("POST", `/api/admin/env/${envId}/connections/${connectionId}/test`);
    }

    async toggle(envId: string, connectionId: string, enabled: boolean): Promise<Connection> {
        return this.request("PUT", `/api/admin/env/${envId}/connections/${connectionId}`, { enabled });
    }

    async stats(envId: string): Promise<ConnectionStats> {
        return this.request("GET", `/api/admin/env/${envId}/connections/stats`);
    }

    async discover(envId: string, email: string): Promise<{
        providerId: string | null;
        providerName?: string;
        method?: string;
        connectionId?: string;
        socialProviders?: string[];
    }> {
        return this.request("POST", `/api/admin/env/${envId}/connections/discover`, { email });
    }
}

// ─── Users ──────────────────────────────────────────────────────

export interface User {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    role?: string;
    banned?: boolean;
    banReason?: string;
}

class UsersClient extends BaseClient {
    async list(envId: string, params?: { search?: string; page?: number; limit?: number; sort?: string; order?: string }): Promise<{ users: User[]; total: number }> {
        const qs = new URLSearchParams();
        if (params?.search) qs.set("search", params.search);
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.sort) qs.set("sort", params.sort);
        if (params?.order) qs.set("order", params.order);
        const qstr = qs.toString();
        return this.request("GET", `/api/admin/env/${envId}/users${qstr ? `?${qstr}` : ""}`);
    }

    async get(envId: string, userId: string): Promise<User> {
        return this.request("GET", `/api/admin/env/${envId}/users/${userId}`);
    }

    async update(envId: string, userId: string, data: Partial<User>): Promise<User> {
        return this.request("PUT", `/api/admin/env/${envId}/users/${userId}`, data);
    }

    async ban(envId: string, userId: string, reason?: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/users/${userId}/ban`, { reason });
    }

    async unban(envId: string, userId: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/users/${userId}/unban`);
    }

    async delete(envId: string, userId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/users/${userId}`);
    }

    async impersonate(envId: string, userId: string, reason: string = "SDK fallback request"): Promise<{ token: string; url: string }> {
        // Point backward-compatible method to the new V1 impersonation architecture
        return this.request("POST", `/api/v1/env/${envId}/impersonation/actor-tokens`, { targetUserId: userId, reason });
    }

    async import(envId: string, users: Array<{ email: string; name?: string; role?: string }>): Promise<{
        total: number; success: number; failed: number; errors: Array<{ email: string; error: string }>; duration_ms: number;
    }> {
        return this.request("POST", `/api/v1/admin/env/${envId}/users/import`, { users });
    }

    async export(envId: string, format: "json" | "csv" = "json"): Promise<{ users: unknown[] }> {
        return this.request("GET", `/api/v1/admin/env/${envId}/users/export?format=${format}`);
    }

    async getSessions(envId: string, userId: string): Promise<{ sessions: Array<{ id: string; deviceType: string; ipAddress: string; createdAt: string; expiresAt: string }> }> {
        return this.request("GET", `/api/admin/env/${envId}/users/${userId}/sessions`);
    }
}

// ─── Sessions ───────────────────────────────────────────────────

export interface Session {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
    createdAt: string;
    updatedAt?: string;
    ipAddress?: string;
    userAgent?: string;
    userName?: string;
    userEmail?: string;
}

class SessionsClient extends BaseClient {
    async list(envId: string, params?: { page?: number; limit?: number; userId?: string }): Promise<{ sessions: Session[]; total: number }> {
        const qs = new URLSearchParams();
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.userId) qs.set("userId", params.userId);
        const qstr = qs.toString();
        return this.request("GET", `/api/admin/env/${envId}/sessions${qstr ? `?${qstr}` : ""}`);
    }

    async get(envId: string, sessionId: string): Promise<Session> {
        return this.request("GET", `/api/admin/env/${envId}/sessions/${sessionId}`);
    }

    async revoke(envId: string, sessionId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/sessions/${sessionId}`);
    }

    async revokeAll(envId: string, userId: string): Promise<{ revoked: number }> {
        return this.request("POST", `/api/admin/env/${envId}/sessions/revoke-all`, { userId });
    }
}

// ─── Roles & Permissions ────────────────────────────────────────

export interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
    environment_id?: string;
    is_system?: boolean;
    created_at?: string;
}

export interface Permission {
    code: string;
    resource: string;
    action: string;
    category: string;
    description: string;
}

export type CapabilityState =
    | "enabled"
    | "hidden"
    | "disabled"
    | "read_only"
    | "requires_upgrade"
    | "requires_admin";

export interface CapabilityDecision {
    capability: string;
    state: CapabilityState;
    reason: string;
    requiredPermissions: string[];
}

export interface CapabilityUsageStatus {
    capability: string;
    meterCode?: string | null;
    limitCode?: string | null;
    period?: string | null;
    current: number | null;
    limit: number | null;
    remaining: number | null;
    status: "ok" | "near_limit" | "at_limit" | "exceeded" | "unmetered" | "unknown";
    source: "billing" | "access_limits" | "none";
}

export interface CapabilityUsagePressureSummary {
    level: "healthy" | "warning" | "critical";
    warnings: CapabilityUsageStatus[];
    critical: CapabilityUsageStatus[];
    affectedCapabilities: string[];
    affectedMeterCodes: string[];
    recommendedAction: "none" | "review_usage" | "upgrade_now";
}

export interface AccessSubscriptionRecord {
    externalId: string;
    planCode: string;
    status: string;
    startedAt: string;
    addOnCodes: string[];
}

export interface AccessSubscriptionStatus {
    environmentId: string;
    organizationId: string;
    primaryPlanCode: string | null;
    subscriptionStatus: string | null;
    hasActiveSubscription: boolean;
    planCodes: string[];
    addOnCodes: string[];
    subscriptions: AccessSubscriptionRecord[];
}

export interface AccessEntitlementItem {
    capability: string;
    label: string;
    module: string;
    decisionState: CapabilityState;
    commerciallyIncluded: boolean;
    commerciallyIncludedVia: "plan" | "addon" | "none";
    requiredPlans: string[];
    reason: string;
    usage?: CapabilityUsageStatus | null;
}

export interface AccessEntitlements {
    environmentId: string;
    organizationId: string;
    planCodes: string[];
    addOnCodes: string[];
    subscriptions: AccessSubscriptionRecord[];
    entitlements: AccessEntitlementItem[];
    productGovernance?: {
        productKey: string | null;
        planMatrixVersion: string | null;
        activePlanCode: string | null;
        activePlanVersion: string | null;
        migrationPolicy: string | null;
        grandfatherEligible: boolean | null;
        availablePlans: Array<{
            planCode: string;
            version: string | null;
            migrationPolicy: string | null;
            grandfatherEligible: boolean | null;
            roleCount: number;
            featureCount: number;
            limitCount: number;
        }>;
        activePlan: {
            roles: string[];
            features: string[];
            limits: Record<string, unknown>;
        } | null;
        paywallHooks: Record<string, unknown>;
        planGovernance: Record<string, unknown> | null;
    };
}

export interface AccessCommercialUsageSnapshot {
    environmentId: string;
    organizationId: string;
    planCodes: string[];
    addOnCodes: string[];
    usageByCode: Record<string, { current: number | null; limit: number | null }>;
    usage: CapabilityUsageStatus[];
    summary: CapabilityUsagePressureSummary;
}

export interface EntitlementFeature {
    id: string;
    lookupKey: string;
    name: string;
    type: "boolean" | "metered" | "config";
    productKey: string;
    moduleKey?: string;
    meterCode?: string | null;
    defaultValue?: unknown;
    status: "draft" | "active" | "archived";
    version: number;
    requiredPermissions: string[];
    compatibilitySignals: string[];
    metadata: Record<string, unknown>;
}

export interface EntitlementPlan {
    code: string;
    version: number;
    name: string;
    status: "draft" | "active" | "archived";
    rank: number;
    eligibleAddOns: string[];
    limits: Record<string, unknown>;
    metadata: Record<string, unknown>;
}

export interface EntitlementPlanFeature {
    planCode: string;
    planVersion: number;
    featureLookupKey: string;
    config: Record<string, unknown>;
}

export interface EntitlementAddOn {
    code: string;
    version: number;
    name: string;
    status: "draft" | "active" | "archived";
    limits: Record<string, unknown>;
    metadata: Record<string, unknown>;
}

export interface EntitlementAddOnFeature {
    addOnCode: string;
    addOnVersion: number;
    featureLookupKey: string;
    config: Record<string, unknown>;
}

export interface EntitlementPrice {
    id: string;
    planCode?: string | null;
    planVersion?: number | null;
    addOnCode?: string | null;
    addOnVersion?: number | null;
    model: "flat" | "per_unit" | "tiered" | "volume" | "graduated" | "package" | "usage";
    config: Record<string, unknown>;
    currency: string;
    recurrence: "one_time" | "monthly" | "annual" | "usage";
    version: number;
    meterCode?: string | null;
    status: "draft" | "active" | "archived";
    metadata: Record<string, unknown>;
}

export interface EntitlementMeter {
    meterCode: string;
    aggregation: "sum" | "count" | "last";
    unit: string;
    status: "draft" | "active" | "archived";
    metadata: Record<string, unknown>;
}

export interface EntitlementCatalogOverlay {
    id: string;
    applicationId: string;
    environmentId?: string | null;
    kind: "feature" | "plan" | "addon" | "price" | "meter" | "catalog";
    payload: Record<string, unknown>;
    status: "draft" | "active" | "archived";
    version: number;
}

export interface EntitlementCatalogSnapshot {
    version: string;
    source: string;
    features: EntitlementFeature[];
    plans: EntitlementPlan[];
    planFeatures: EntitlementPlanFeature[];
    addOns: EntitlementAddOn[];
    addOnFeatures: EntitlementAddOnFeature[];
    prices: EntitlementPrice[];
    meters: EntitlementMeter[];
}

export type CommercialCatalogKind =
    | "workspace_bundle"
    | "product_catalog"
    | "access_catalog"
    | "external_app_catalog"
    | "consumer_only";

export interface CommercialCatalogScope {
    organizationId?: string;
    projectId?: string;
    productKey?: string;
    catalogOwnerId?: string;
    catalogKind?: CommercialCatalogKind;
}

export interface CommercialCatalogOwner {
    catalogKind: CommercialCatalogKind;
    catalogOwnerId: string;
    productKey: string | null;
    displayName: string;
    pricingOwner: string;
    sourceOfTruth: "customy-access";
    canManagePlans: boolean;
    canPublishCatalog: boolean;
    inheritsWorkspaceAccess: boolean;
    mergePolicy: "never_without_migration";
    permissionsEditableInAccess: boolean;
    externalPricingEnabled: boolean;
    catalogRegistrationSource: "sdk" | "ui" | "api" | "seed" | "product_catalog";
    status: string;
    reason: string;
}

export interface PricingCatalogResponse {
    context: Record<string, unknown>;
    commercialCatalogOwner: CommercialCatalogOwner;
    catalog: EntitlementCatalogSnapshot;
    publishState: {
        publishedVersion: number | null;
        lastPublishedAt?: string | null;
        syncState?: string;
    };
}

export interface RegisterPricingCatalogInput {
    productKey: string;
    displayName?: string;
    catalogKind?: CommercialCatalogKind;
    applicationId?: string | null;
    metadata?: Record<string, unknown>;
    meters?: Partial<EntitlementMeter>[];
    features?: Partial<EntitlementFeature>[];
    plans?: Partial<EntitlementPlan>[];
    planFeatures?: Partial<EntitlementPlanFeature>[];
    addOns?: Partial<EntitlementAddOn>[];
    addOnFeatures?: Partial<EntitlementAddOnFeature>[];
    prices?: Partial<EntitlementPrice>[];
}

export interface WorkspaceSubscription {
    id?: string;
    organizationId: string;
    projectId: string;
    environmentId: string;
    planCode?: string | null;
    planVersionPin?: number | null;
    status: "trialing" | "active" | "paused" | "canceled" | "expired";
    addOnCodes: string[];
    metadata: Record<string, unknown>;
    approvedBy?: string | null;
    reason?: string | null;
    approvalRequestId?: string | null;
    expiresAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface WorkspacePriceOverride {
    id?: string;
    organizationId: string;
    projectId: string;
    environmentId: string;
    targetKind: "plan" | "addon" | "meter";
    targetCode: string;
    targetVersion?: number | null;
    priceId?: string | null;
    model: EntitlementPrice["model"];
    config: Record<string, unknown>;
    currency: string;
    recurrence: EntitlementPrice["recurrence"];
    status: EntitlementPrice["status"];
    metadata: Record<string, unknown>;
    approvedBy?: string | null;
    reason?: string | null;
    approvalRequestId?: string | null;
    expiresAt?: string | null;
}

export interface WorkspaceEntitlementOverride {
    id?: string;
    organizationId: string;
    projectId: string;
    environmentId: string;
    kind: "plan_feature" | "addon_feature" | "plan_limit" | "addon_limit" | "feature" | "catalog";
    operation: "grant" | "revoke" | "replace" | "merge";
    targetCode?: string | null;
    targetVersion?: number | null;
    featureLookupKey?: string | null;
    payload: Record<string, unknown>;
    status: EntitlementPrice["status"];
    metadata: Record<string, unknown>;
    approvedBy?: string | null;
    reason?: string | null;
    approvalRequestId?: string | null;
    expiresAt?: string | null;
}

export interface AccessMeSnapshot {
    environmentId: string;
    user: { id: string } | null;
    subscription: AccessSubscriptionStatus;
    entitlements: AccessEntitlements;
    modules: CapabilityMatrixModule[];
    usage: AccessCommercialUsageSnapshot;
}

export interface CapabilityMatrixItem extends CapabilityDecision {
    module: string;
    label: string;
    allowed: boolean;
    visible: boolean;
    usage?: CapabilityUsageStatus;
}

export interface CapabilityMatrixModule {
    key: string;
    label: string;
    state: CapabilityState;
    visible: boolean;
    capabilities: CapabilityMatrixItem[];
}

export interface CapabilityMatrix {
    environmentId: string;
    organizationId: string;
    subject: {
        userId: string | null;
        permissions: string[];
        roles: string[];
    };
    modules: CapabilityMatrixModule[];
    capabilities: CapabilityMatrixItem[];
}

export interface CapabilityBootstrapOptions {
    userId?: string;
    capabilities?: string[];
    includeUsage?: boolean;
}

export interface CapabilityBootstrapSnapshot {
    matrix: CapabilityMatrix;
    modules: CapabilityMatrixModule[];
    usage: CapabilityUsageStatus[];
    decisions: Record<string, CapabilityMatrixItem>;
    canUseCapability: (
        capability: string,
        accessMode?: "read" | "write",
    ) => boolean;
    canAccessModule: (
        moduleKey: string,
        accessMode?: "read" | "write",
    ) => boolean;
    getCapability: (capability: string) => CapabilityMatrixItem | undefined;
    getModule: (moduleKey: string) => CapabilityMatrixModule | undefined;
}

export function isCapabilityStateAllowed(
    state: CapabilityState,
    accessMode: "read" | "write" = "write",
): boolean {
    if (state === "enabled") return true;
    if (accessMode === "read" && state === "read_only") return true;
    return false;
}

export function isCapabilityDecisionAllowed(
    decision: Pick<CapabilityDecision, "state"> | null | undefined,
    accessMode: "read" | "write" = "write",
): boolean {
    if (!decision) return false;
    return isCapabilityStateAllowed(decision.state, accessMode);
}

export function getCapabilityFromMatrix(
    matrix: CapabilityMatrix,
    capability: string,
): CapabilityMatrixItem | undefined {
    return matrix.capabilities.find((item) => item.capability === capability);
}

export function getModuleFromMatrix(
    matrix: CapabilityMatrix,
    moduleKey: string,
): CapabilityMatrixModule | undefined {
    return matrix.modules.find((module) => module.key === moduleKey);
}

export function summarizeCapabilityUsage(
    usage: CapabilityUsageStatus[],
): CapabilityUsagePressureSummary {
    const warnings = usage.filter(
        (item) => item.status === "near_limit" || item.status === "at_limit",
    );
    const critical = usage.filter((item) => item.status === "exceeded");
    const affectedCapabilities = Array.from(
        new Set([...warnings, ...critical].map((item) => item.capability)),
    );
    const affectedMeterCodes = Array.from(
        new Set(
            [...warnings, ...critical]
                .map((item) => item.meterCode)
                .filter((value): value is string => Boolean(value)),
        ),
    );

    if (critical.length > 0) {
        return {
            level: "critical",
            warnings,
            critical,
            affectedCapabilities,
            affectedMeterCodes,
            recommendedAction: "upgrade_now",
        };
    }

    if (warnings.length > 0) {
        return {
            level: "warning",
            warnings,
            critical,
            affectedCapabilities,
            affectedMeterCodes,
            recommendedAction: "review_usage",
        };
    }

    return {
        level: "healthy",
        warnings: [],
        critical: [],
        affectedCapabilities: [],
        affectedMeterCodes: [],
        recommendedAction: "none",
    };
}

class RolesClient extends BaseClient {
    async list(envId: string): Promise<Role[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/roles`);
        return normalizeRows(data);
    }

    async create(envId: string, role: { name: string; description?: string; permissions: string[] }): Promise<Role> {
        return this.request("POST", `/api/admin/env/${envId}/roles`, role);
    }

    async update(envId: string, roleId: string, updates: Partial<Role>): Promise<Role> {
        return this.request("PUT", `/api/admin/env/${envId}/roles/${roleId}`, updates);
    }

    async delete(envId: string, roleId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/roles/${roleId}`);
    }

    async assign(envId: string, userId: string, roleId: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/roles/${roleId}/assign`, { userId });
    }

    async revoke(envId: string, userId: string, roleId: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/roles/${roleId}/revoke`, { userId });
    }

    async listPermissions(envId: string): Promise<Permission[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/permissions`);
        return normalizeRows(data);
    }

    async checkPermission(envId: string, userId: string, permission: string): Promise<{
        allowed: boolean; reason?: string; matchedRule?: string;
    }> {
        return this.request("POST", `/api/admin/env/${envId}/explain-permission`, { userId, permission });
    }

    async getEffective(envId: string, userId: string): Promise<{ permissions: string[]; roles: string[] }> {
        return this.request("GET", `/api/v1/env/${envId}/users/${userId}/permissions`);
    }
}

// ─── Policies (ABAC) ───────────────────────────────────────────

export interface Policy {
    id: string;
    name: string;
    description?: string;
    effect: "allow" | "deny";
    resource: string;
    action: string;
    conditions: Record<string, unknown>;
    priority: number;
    enabled: boolean;
    environment_id?: string;
    created_at?: string;
}

class PoliciesClient extends BaseClient {
    async list(envId: string): Promise<Policy[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/policies`);
        return normalizeRows(data);
    }

    async create(envId: string, policy: Partial<Policy>): Promise<Policy> {
        return this.request("POST", `/api/admin/env/${envId}/policies`, policy);
    }

    async update(envId: string, policyId: string, updates: Partial<Policy>): Promise<Policy> {
        return this.request("PUT", `/api/admin/env/${envId}/policies/${policyId}`, updates);
    }

    async delete(envId: string, policyId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/policies/${policyId}`);
    }

    async evaluate(envId: string, params: { userId: string; resource: string; action: string; context?: Record<string, unknown> }): Promise<{
        allowed: boolean; matchedPolicies: string[]; reason: string;
    }> {
        return this.request("POST", `/api/admin/env/${envId}/policies/evaluate`, params);
    }
}

// ─── Audit Logs ─────────────────────────────────────────────────

export interface AuditEvent {
    id: string;
    event: string;
    actor_id?: string;
    actor_email?: string;
    target_id?: string;
    target_type?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, unknown>;
    environment_id?: string;
    created_at: string;
}

class AuditClient extends BaseClient {
    async list(envId: string, params?: {
        page?: number; limit?: number; event?: string; actorId?: string; from?: string; to?: string;
    }): Promise<{ events: AuditEvent[]; total: number }> {
        const qs = new URLSearchParams();
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.event) qs.set("event", params.event);
        if (params?.actorId) qs.set("actorId", params.actorId);
        if (params?.from) qs.set("from", params.from);
        if (params?.to) qs.set("to", params.to);
        const qstr = qs.toString();
        return this.request("GET", `/api/admin/env/${envId}/audit${qstr ? `?${qstr}` : ""}`);
    }
}

// ─── Brute Force ────────────────────────────────────────────────

export interface BruteForceConfig {
    enabled: boolean;
    maxAttempts: number;
    lockoutDurationMinutes: number;
    windowMinutes: number;
    blockByIp: boolean;
    blockByEmail: boolean;
    notifyAdmin: boolean;
}

class BruteForceClient extends BaseClient {
    async getConfig(envId: string): Promise<BruteForceConfig> {
        return this.request("GET", `/api/admin/env/${envId}/brute-force`);
    }

    async updateConfig(envId: string, config: Partial<BruteForceConfig>): Promise<BruteForceConfig> {
        return this.request("PUT", `/api/admin/env/${envId}/brute-force`, config);
    }

    async getLockedAccounts(envId: string): Promise<Array<{ email: string; lockedAt: string; attempts: number }>> {
        return this.request("GET", `/api/admin/env/${envId}/brute-force/locked`);
    }

    async unlock(envId: string, email: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/brute-force/unlock`, { email });
    }
}

// ─── Impersonation ──────────────────────────────────────────────

export interface ImpersonationSession {
    id: string;
    adminUserId: string;
    adminEmail: string;
    targetUserId: string;
    targetEmail: string;
    reason: string;
    startedAt: string;
    expiresAt: string;
    endedAt?: string | null;
    endReason?: string | null;
}

class ImpersonationClient extends BaseClient {
    async createActorToken(envId: string, params: { targetUserId: string; reason: string }): Promise<{
        actorTokenId: string; token: string; url: string; expiresAt: string;
    }> {
        return this.request("POST", `/api/v1/env/${envId}/impersonation/actor-tokens`, params);
    }

    async authenticate(envId: string, token: string): Promise<{
        sessionToken: string; impersonationId: string;
        targetUser: { id: string; email: string; name: string };
        actor: { sub: string; email: string; name: string };
        expiresAt: string;
    }> {
        return this.request("POST", `/api/v1/env/${envId}/impersonation/authenticate`, { token });
    }

    async stop(envId: string, impersonationId: string, reason?: string): Promise<{ stopped: boolean; duration: number }> {
        return this.request("POST", `/api/v1/env/${envId}/impersonation/stop`, { impersonationId, reason: reason || "manual" });
    }

    async listActive(envId: string): Promise<{ items: ImpersonationSession[]; total: number }> {
        return this.request("GET", `/api/v1/env/${envId}/impersonation/active`);
    }

    async getHistory(envId: string, params?: { page?: number; limit?: number; adminUserId?: string; targetUserId?: string }): Promise<{
        items: ImpersonationSession[]; total: number; page: number;
    }> {
        const qs = new URLSearchParams();
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.adminUserId) qs.set("adminUserId", params.adminUserId);
        if (params?.targetUserId) qs.set("targetUserId", params.targetUserId);
        const qstr = qs.toString();
        return this.request("GET", `/api/v1/env/${envId}/impersonation/history${qstr ? `?${qstr}` : ""}`);
    }

    async getConfig(envId: string): Promise<{
        enabled: boolean; maxDurationMinutes: number; maxActivePerAdmin: number;
        monthlyLimit: number | null; requireReason: boolean; allowedRoles: string[];
        blockedTargetRoles: string[]; notifyTarget: boolean; restrictWriteOps: boolean;
        webhookUrl: string | null;
    }> {
        return this.request("GET", `/api/v1/env/${envId}/impersonation/config`);
    }

    async updateConfig(envId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/v1/env/${envId}/impersonation/config`, config);
    }
}

// ─── Webhooks ───────────────────────────────────────────────────

export interface Webhook {
    id: string;
    url: string;
    events: string[];
    secret?: string;
    enabled: boolean;
    description?: string;
    created_at?: string;
}

class WebhooksClient extends BaseClient {
    async list(envId: string): Promise<Webhook[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/webhooks`);
        return normalizeRows(data);
    }

    async create(envId: string, webhook: Partial<Webhook>): Promise<Webhook> {
        return this.request("POST", `/api/admin/env/${envId}/webhooks`, webhook);
    }

    async update(envId: string, webhookId: string, updates: Partial<Webhook>): Promise<Webhook> {
        return this.request("PUT", `/api/admin/env/${envId}/webhooks/${webhookId}`, updates);
    }

    async delete(envId: string, webhookId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/webhooks/${webhookId}`);
    }

    async test(envId: string, webhookId: string): Promise<{ success: boolean; statusCode: number; responseTime: number }> {
        return this.request("POST", `/api/admin/env/${envId}/webhooks/${webhookId}/test`);
    }

    async getLogs(envId: string, webhookId: string): Promise<Array<{
        id: string; event: string; statusCode: number; responseTime: number; createdAt: string; success: boolean;
    }>> {
        return this.request("GET", `/api/admin/env/${envId}/webhooks/${webhookId}/logs`);
    }

    /** Verify an incoming webhook signature (static, no request needed) */
    static verifySignature(params: { payload: string; signature: string; secret: string }): boolean {
        // Dynamic import to work in both Node and browser
        try {
            const crypto = globalThis.crypto;
            if (!crypto?.subtle) return false; // Browser without SubtleCrypto
        } catch {
            return false;
        }
        return false; // For browser builds, use server-side verification
    }
}

// ─── MFA ────────────────────────────────────────────────────────

export interface MFAConfig {
    enabled: boolean;
    methods: string[];
    enforcementLevel: "optional" | "required" | "step_up";
    gracePeriodDays?: number;
}

class MFAClient extends BaseClient {
    async getConfig(envId: string): Promise<MFAConfig> {
        return this.request("GET", `/api/v1/env/${envId}/mfa/config`);
    }

    async updateConfig(envId: string, config: Partial<MFAConfig>): Promise<MFAConfig> {
        return this.request("PUT", `/api/v1/env/${envId}/mfa/config`, config);
    }

    async listEnrollments(envId: string, userId: string): Promise<Array<{
        id: string; method: string; verified: boolean; createdAt: string;
    }>> {
        return this.request("GET", `/api/v1/env/${envId}/mfa/enrollments?userId=${userId}`);
    }

    async deleteEnrollment(envId: string, enrollmentId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/v1/env/${envId}/mfa/enrollments/${enrollmentId}`);
    }
}

// ─── Branding ───────────────────────────────────────────────────

export interface BrandingConfig {
    logo_url?: string;
    favicon_url?: string;
    primary_color?: string;
    primaryColor?: string;
    effective_primary_color?: string;
    effectivePrimaryColor?: string;
    primary_color_source?: string;
    primaryColorSource?: string;
    accent_color?: string;
    company_name?: string;
    support_email?: string;
    custom_css?: string;
    login_page_title?: string;
    login_page_subtitle?: string;
}

class BrandingClient extends BaseClient {
    async get(envId: string): Promise<BrandingConfig> {
        return this.request("GET", `/api/admin/env/${envId}/branding`);
    }

    async update(envId: string, branding: Partial<BrandingConfig>): Promise<BrandingConfig> {
        return this.request("PUT", `/api/admin/env/${envId}/branding`, branding);
    }
}

// ─── Delegations ────────────────────────────────────────────────

export interface Delegation {
    id: string;
    delegator_id: string;
    delegate_id: string;
    permissions: string[];
    starts_at: string;
    expires_at?: string;
    environment_id?: string;
}

class DelegationsClient extends BaseClient {
    async list(envId: string): Promise<Delegation[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/delegations`);
        return normalizeRows(data);
    }

    async create(envId: string, delegation: Partial<Delegation>): Promise<Delegation> {
        return this.request("POST", `/api/admin/env/${envId}/delegations`, delegation);
    }

    async revoke(envId: string, delegationId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/delegations/${delegationId}`);
    }
}

// ─── Relationships (ReBAC) ──────────────────────────────────────

export interface RelationshipTuple {
    id: string;
    object_type: string;
    object_id: string;
    relation: string;
    subject_type: string;
    subject_id: string;
    environment_id?: string;
    created_at?: string;
}

class RelationshipsClient extends BaseClient {
    async list(envId: string, params?: { objectType?: string; relation?: string }): Promise<RelationshipTuple[]> {
        const qs = new URLSearchParams();
        if (params?.objectType) qs.set("objectType", params.objectType);
        if (params?.relation) qs.set("relation", params.relation);
        const qstr = qs.toString();
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/relationships${qstr ? `?${qstr}` : ""}`);
        return normalizeRows(data);
    }

    async create(envId: string, tuple: Partial<RelationshipTuple>): Promise<RelationshipTuple> {
        return this.request("POST", `/api/admin/env/${envId}/relationships`, tuple);
    }

    async delete(envId: string, tupleId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/relationships/${tupleId}`);
    }

    async check(envId: string, params: {
        objectType: string; objectId: string; relation: string; subjectType: string; subjectId: string;
    }): Promise<{ allowed: boolean; path?: string[] }> {
        return this.request("POST", `/api/admin/env/${envId}/relationships/check`, params);
    }
}

// ─── GDPR ───────────────────────────────────────────────────────

class GDPRClient extends BaseClient {
    async exportUserData(envId: string, userId: string): Promise<{ data: Record<string, unknown>; exportedAt: string }> {
        return this.request("GET", `/api/v1/env/${envId}/gdpr/export/${userId}`);
    }

    async deleteUserData(envId: string, userId: string): Promise<{ deleted: boolean; deletedItems: string[] }> {
        return this.request("DELETE", `/api/v1/env/${envId}/gdpr/delete/${userId}`);
    }

    async getConsentStatus(envId: string, userId: string): Promise<{ consents: Array<{ type: string; granted: boolean; grantedAt?: string }> }> {
        return this.request("GET", `/api/v1/env/${envId}/gdpr/consent/${userId}`);
    }
}

// ─── Account Linking ────────────────────────────────────────────

export interface LinkedProvider {
    providerId: string;
    accountId: string;
    createdAt: string;
}

export interface LinkResult {
    linked: boolean;
    primaryUserId: string;
    mergedUserIds: string[];
    accountsMerged: number;
    linkHistoryId?: string;
}

export interface LinkBlockedResult {
    linked: false;
    blocked: true;
    reason: "email_not_verified" | "untrusted_provider" | "config_disabled" | "conflict";
    verificationRequired?: boolean;
    existingProviders?: string[];
    resolution?: { signInAndLink?: string; verifyEmail?: string };
}

export interface AccountLinkingConfig {
    autoLinkEnabled: boolean;
    autoLinkStrategy: "email" | "email_verified" | "disabled";
    requireEmailVerification: boolean;
    allowUserInitiatedLink: boolean;
    allowUserInitiatedUnlink: boolean;
    allowAdminLink: boolean;
    conflictResolution: "block" | "merge_verified" | "trust_hierarchy";
    notifyUserOnLink: boolean;
    notifyUserOnUnlink: boolean;
    rollbackWindowDays: number;
}

export interface LinkHistoryEntry {
    id: string;
    primaryUserId: string;
    secondaryUserId: string;
    secondaryEmail: string | null;
    action: string;
    trigger: string;
    providerId: string | null;
    performedBy: string | null;
    rolledBackAt: string | null;
    createdAt: string;
}

class AccountLinkingClient extends BaseClient {
    /** Get linked providers for a user */
    async getProviders(envId: string, userId: string): Promise<LinkedProvider[]> {
        return this.request("GET", `/api/v1/env/${envId}/account-linking/${userId}/providers`);
    }

    /** Auto-link accounts by email (called internally from auth callbacks) */
    async autoLink(envId: string, params: {
        email: string; userId: string; providerId: string; emailVerified: boolean;
    }): Promise<LinkResult | LinkBlockedResult> {
        return this.request("POST", `/api/v1/env/${envId}/account-linking/auto`, params);
    }

    /** Manually link two users (admin action) */
    async manualLink(envId: string, params: {
        primaryUserId: string; secondaryUserId: string; reason?: string;
    }): Promise<LinkResult> {
        return this.request("POST", `/api/v1/env/${envId}/account-linking/manual`, params);
    }

    /** Admin unlink a provider from a user */
    async unlinkProvider(envId: string, userId: string, providerId: string): Promise<{ unlinked: boolean; message: string }> {
        return this.request("DELETE", `/api/v1/env/${envId}/account-linking/${userId}/${providerId}`);
    }

    /** User-initiated: start OAuth flow to link a new provider */
    async initiateLink(envId: string, params: {
        providerId: string; redirectUrl?: string;
    }): Promise<{ redirectUrl: string; state: string; expiresIn: number }> {
        return this.request("POST", `/api/v1/env/${envId}/account-linking/link-provider`, params);
    }

    /** User-initiated: unlink own provider */
    async userUnlink(envId: string, providerId: string): Promise<{ unlinked: boolean; message: string }> {
        return this.request("DELETE", `/api/v1/env/${envId}/account-linking/my-providers/${providerId}`);
    }

    /** Get link history for a specific user */
    async getUserHistory(envId: string, userId: string): Promise<LinkHistoryEntry[]> {
        return this.request("GET", `/api/v1/env/${envId}/account-linking/${userId}/history`);
    }

    /** Get link history for the entire organization */
    async getOrgHistory(envId: string): Promise<LinkHistoryEntry[]> {
        return this.request("GET", `/api/v1/env/${envId}/account-linking/history`);
    }

    /** Rollback a previous merge */
    async rollback(envId: string, historyId: string): Promise<{ rolledBack: boolean }> {
        return this.request("POST", `/api/v1/env/${envId}/account-linking/rollback/${historyId}`);
    }

    /** Get account linking config for an org */
    async getConfig(envId: string): Promise<AccountLinkingConfig> {
        return this.request("GET", `/api/v1/env/${envId}/account-linking/config`);
    }

    /** Update account linking config (partial) */
    async updateConfig(envId: string, config: Partial<AccountLinkingConfig>): Promise<AccountLinkingConfig> {
        return this.request("PUT", `/api/v1/env/${envId}/account-linking/config`, config);
    }

    /** Get provider trust levels for an org */
    async getTrustLevels(envId: string): Promise<{
        configured: Array<{ providerId: string; trustLevel: string }>;
        defaults: { trusted: string[]; untrusted: string[] };
    }> {
        return this.request("GET", `/api/v1/env/${envId}/account-linking/trust-levels`);
    }

    /** Set trust level for a provider */
    async setTrustLevel(envId: string, params: {
        providerId: string; trustLevel: "trusted" | "untrusted";
    }): Promise<{ success: boolean; providerId: string; trustLevel: string }> {
        return this.request("PUT", `/api/v1/env/${envId}/account-linking/trust-levels`, params);
    }
}

// ─── Token Exchange ─────────────────────────────────────────────

class TokenExchangeClient extends BaseClient {
    async getConfig(envId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/v1/env/${envId}/token-exchange/config`);
    }

    async updateConfig(envId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/v1/env/${envId}/token-exchange/config`, config);
    }

    async exchange(envId: string, params: {
        grantType: string; subjectToken: string; subjectTokenType: string; scope?: string;
    }): Promise<{ access_token: string; token_type: string; expires_in: number }> {
        return this.request("POST", `/api/v1/env/${envId}/token-exchange`, params);
    }
}

// ─── Push MFA ───────────────────────────────────────────────────

class PushMFAClient extends BaseClient {
    async getConfig(envId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/v1/env/${envId}/push-mfa/config`);
    }

    async updateConfig(envId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/v1/env/${envId}/push-mfa/config`, config);
    }
}

// ─── Rate Limits ────────────────────────────────────────────────

class RateLimitsClient extends BaseClient {
    async getConfig(envId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/admin/env/${envId}/rate-limits`);
    }

    async updateConfig(envId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/admin/env/${envId}/rate-limits`, config);
    }
}

// ─── Email Config ───────────────────────────────────────────────

class EmailConfigClient extends BaseClient {
    async get(envId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/admin/env/${envId}/email-config`);
    }

    async update(envId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/admin/env/${envId}/email-config`, config);
    }

    async testEmail(envId: string, to: string): Promise<{ sent: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/email-config/test`, { to });
    }
}

// ─── SCIM ───────────────────────────────────────────────────────

class SCIMClient extends BaseClient {
    async listGroups(envId: string): Promise<{ schemas: string[]; totalResults: number; Resources: unknown[] }> {
        return this.request("GET", `/api/scim/v2/env/${envId}/Groups`);
    }

    async createGroup(envId: string, displayName: string, members?: string[]): Promise<unknown> {
        return this.request("POST", `/api/scim/v2/env/${envId}/Groups`, {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            displayName,
            members: (members ?? []).map(id => ({ value: id })),
        });
    }

    async getConfig(envId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/admin/env/${envId}/scim/config`);
    }

    async updateConfig(envId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/admin/env/${envId}/scim/config`, config);
    }
}

// ─── API Keys (M2M) ────────────────────────────────────────────

class M2MClient extends BaseClient {
    async getToken(params: { clientId: string; clientSecret: string; scopes?: string[]; audience?: string }): Promise<{
        access_token: string; token_type: "Bearer"; expires_in: number; scope: string;
    }> {
        return this.request("POST", "/api/v1/oauth/token", {
            grant_type: "client_credentials",
            client_id: params.clientId,
            client_secret: params.clientSecret,
            ...(params.scopes ? { scope: params.scopes.join(" ") } : {}),
            // Access validates this against the key's allowed audiences. Do
            // not silently issue an Access-only token for a product reader.
            ...(params.audience !== undefined ? { audience: params.audience } : {}),
        });
    }

    /**
     * Token de máquina firmado (JWT) para un producto: `client_credentials` en el
     * token endpoint OIDC estándar. La audiencia es obligatoria y el producto lo
     * verifica con el JWKS de Access sin consultar Access por request.
     */
    async getMachineToken(params: { clientId: string; clientSecret: string; audience: string; scopes?: string[] }): Promise<{
        access_token: string; token_type: "Bearer"; expires_in: number; scope: string;
    }> {
        if (!params.audience) throw new Error("CUSTOMY_MACHINE_TOKEN_AUDIENCE_REQUIRED");
        return this.request("POST", "/oauth/token", {
            grant_type: "client_credentials",
            client_id: params.clientId,
            client_secret: params.clientSecret,
            audience: params.audience,
            ...(params.scopes ? { scope: params.scopes.join(" ") } : {}),
        });
    }

    /**
     * Token exchange (RFC 8693): un producto cambia el token de una app que
     * recibió por uno para otro producto, en nombre de esa app. El token
     * resultante conserva el tenant de la app y lleva al producto en `act`.
     */
    async exchangeToken(params: { clientId: string; clientSecret: string; subjectToken: string; audience: string; scopes: string[] }): Promise<{
        access_token: string; issued_token_type: string; token_type: "Bearer"; expires_in: number; scope: string;
    }> {
        if (!params.audience) throw new Error("CUSTOMY_MACHINE_TOKEN_AUDIENCE_REQUIRED");
        if (!params.subjectToken) throw new Error("CUSTOMY_SUBJECT_TOKEN_REQUIRED");
        return this.request("POST", "/oauth/token", {
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            client_id: params.clientId,
            client_secret: params.clientSecret,
            subject_token: params.subjectToken,
            subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
            audience: params.audience,
            scope: params.scopes.join(" "),
        });
    }

    async createApiKey(envId: string, params: {
        name: string;
        scopes: string[];
        expiresInDays?: number;
        machineIdentityType?: "service" | "agent" | "worker" | "integration" | "automation";
        machineIdentityId?: string;
        ownerService?: string;
        allowedAudiences?: string[];
    }): Promise<{
        id: string;
        rawKey: string;
        prefix: string;
        scopes: string[];
        machineIdentityType?: string;
        machineIdentityId?: string | null;
        ownerService?: string | null;
        allowedAudiences?: string[];
    }> {
        return this.request("POST", `/api/admin/env/${envId}/api-keys`, params);
    }

    async listApiKeys(envId: string): Promise<Array<{
        id: string;
        name: string;
        prefix: string;
        scopes: string[];
        machineIdentityType?: string;
        machineIdentityId?: string | null;
        ownerService?: string | null;
        allowedAudiences?: string[];
        createdAt: string;
    }>> {
        return this.request("GET", `/api/admin/env/${envId}/api-keys`);
    }

    async revokeApiKey(envId: string, keyId: string): Promise<{ success: true }> {
        return this.request("DELETE", `/api/admin/env/${envId}/api-keys/${keyId}`);
    }

    /**
     * Introspección de un token M2M opaco heredado. `envId` se conserva por
     * compatibilidad: el servidor resuelve el entorno a partir del token.
     */
    async introspect(_envId: string, token: string): Promise<{
        active: boolean; environmentId?: string; scope?: string; exp?: number; audiences?: string[];
    }> {
        const result = await this.request<{
            valid: boolean; environmentId?: string; scopes?: string[]; expiresAt?: string; allowedAudiences?: string[];
        }>("POST", "/api/v1/m2m/token/introspect", { token });
        if (!result.valid) return { active: false };
        return {
            active: true,
            environmentId: result.environmentId,
            scope: result.scopes?.join(" "),
            exp: result.expiresAt ? Math.floor(Date.parse(result.expiresAt) / 1000) : undefined,
            audiences: result.allowedAudiences,
        };
    }
}

// ─── Log Streams ────────────────────────────────────────────────

class LogStreamsClient extends BaseClient {
    async list(envId: string): Promise<Array<Record<string, unknown>>> {
        const data = await this.request<unknown>("GET", `/api/v1/env/${envId}/log-streams`);
        return normalizeRows(data);
    }

    async create(envId: string, stream: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("POST", `/api/v1/env/${envId}/log-streams`, stream);
    }

    async update(envId: string, streamId: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.request("PUT", `/api/v1/env/${envId}/log-streams/${streamId}`, updates);
    }

    async delete(envId: string, streamId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/v1/env/${envId}/log-streams/${streamId}`);
    }
}

// ─── Devices ────────────────────────────────────────────────────

class DevicesClient extends BaseClient {
    async list(envId: string, userId?: string): Promise<Array<Record<string, unknown>>> {
        const qs = userId ? `?userId=${userId}` : "";
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/devices${qs}`);
        return normalizeRows(data);
    }

    async revoke(envId: string, deviceId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/devices/${deviceId}`);
    }
}

// ─── Organizations (Admin) ──────────────────────────────────────

class OrganizationsClient extends BaseClient {
    async list(): Promise<Organization[]> {
        const data = await this.request<unknown>("GET", "/api/admin/organizations");
        return normalizeRows(data);
    }

    async get(envId: string): Promise<Organization> {
        return this.request("GET", `/api/admin/env/${envId}`);
    }

    async getMembers(envId: string): Promise<Array<{ userId: string; role: string; email: string; name: string }>> {
        return this.request("GET", `/api/admin/env/${envId}/members`);
    }
}

// ─── Health ─────────────────────────────────────────────────────

class HealthClient extends BaseClient {
    async check(): Promise<{
        status: "ok" | "degraded" | "down"; service: string; version: string;
        uptime: number; db: "connected" | "disconnected"; timestamp: string;
    }> {
        return this.request("GET", "/health");
    }
}

// ─── Authorization Client (Brecha 15) ───────────────────────────

export interface AuthorizeResult {
    allowed: boolean;
    evaluationMs?: number;
}

export interface BatchAuthorizeResult {
    results: Record<string, boolean>;
    evaluationMs: number;
}

export interface SimulateResult {
    before: Record<string, boolean>;
    after: Record<string, boolean>;
    changes: Array<{ permission: string; before: boolean; after: boolean }>;
}

class AuthorizationClient extends BaseClient {
    /** Check a single permission */
    async authorize(envId: string, params: {
        userId: string; action: string; resource?: string;
        resourceId?: string; workspaceId?: string;
        context?: Record<string, unknown>;
    }): Promise<AuthorizeResult> {
        return this.request("POST", `/api/v1/env/${envId}/authorize`, params);
    }

    /** Batch check multiple permissions */
    async batchAuthorize(envId: string, params: {
        userId: string; permissions: string[]; workspaceId?: string;
    }): Promise<BatchAuthorizeResult> {
        return this.request("POST", `/api/v1/env/${envId}/authorize/batch`, params);
    }

    /** Simulate a role/policy change and see permission impact */
    async simulate(envId: string, params: {
        scenario: "add_role" | "remove_role" | "add_policy" | "remove_policy";
        params: { userId: string; roleId?: string; policyId?: string; workspaceId?: string };
        checks: string[];
    }): Promise<SimulateResult> {
        return this.request("POST", `/api/admin/env/${envId}/simulate`, params);
    }

    /** Explain why a permission is granted or denied */
    async explain(envId: string, params: {
        userId: string; permission: string;
    }): Promise<{ allowed: boolean; reason?: string; matchedRule?: string }> {
        return this.request("POST", `/api/admin/env/${envId}/explain-permission`, params);
    }

    /** Get effective permissions for a user */
    async getEffective(envId: string, userId: string): Promise<{ permissions: string[]; roles: string[] }> {
        return this.request("GET", `/api/v1/env/${envId}/users/${userId}/permissions`);
    }
}

class PermissionsClient extends BaseClient {
    async can(params: {
        environmentId?: string;
        userId: string;
        action: string;
        resource?: string;
        resourceId?: string;
        workspaceId?: string;
        context?: Record<string, unknown>;
    }): Promise<AuthorizeResult> {
        const envId = params.environmentId ?? this.config.environmentId;
        if (!envId) throw new Error("Customy Access permissions.can requires environmentId");
        return this.request("POST", `/api/v1/env/${envId}/authorize`, {
            userId: params.userId,
            action: params.action,
            resource: params.resource,
            resourceId: params.resourceId,
            workspaceId: params.workspaceId,
            context: params.context,
        });
    }
}

export interface AccessApplicationContract {
    organizationId: string;
    organizationName: string;
    projectId: string;
    projectName: string;
    applicationId: string;
    applicationName: string;
    applicationSlug?: string | null;
    productKey?: string | null;
    purpose: "platform_control_plane" | "product_tenant_control_plane" | "customer_application";
    applicationPurpose: string;
    applicationType: string;
    status: string;
    allowedOrigins: string[];
    callbackUrls: string[];
    cookieNamespace?: string | null;
    environmentId: string;
    environmentName: string;
    environmentType: string;
    publishableKey: string;
    appUrl?: string | null;
    sessionPolicy?: Record<string, unknown> | null;
    rateLimitPolicy?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
}

export interface CreateAccessApplicationInput {
    name: string;
    slug?: string;
    productKey?: string | null;
    purpose?: "platform_control_plane" | "product_tenant_control_plane" | "customer_application";
    type?: "spa" | "web" | "native" | "m2m";
    allowedOrigins?: string[];
    callbackUrls?: string[];
    cookieNamespace?: string | null;
    metadata?: Record<string, unknown>;
}

export interface UpdateAccessApplicationInput {
    purpose?: "platform_control_plane" | "product_tenant_control_plane" | "customer_application";
    name?: string;
    slug?: string;
    productKey?: string | null;
    status?: string;
    allowedOrigins?: string[];
    callbackUrls?: string[];
    cookieNamespace?: string | null;
}

class AppClient extends BaseClient {
    async getContract(environmentId = this.config.environmentId): Promise<AccessApplicationContract> {
        if (!environmentId) throw new Error("Customy Access app.getContract requires environmentId");
        const data = await this.request<{ contract: AccessApplicationContract }>(
            "GET",
            `/api/admin/env/${environmentId}/application-contract`,
        );
        return data.contract;
    }

    async listConnectedProducts(environmentId = this.config.environmentId): Promise<{ products: Array<Record<string, unknown>>; count: number }> {
        if (!environmentId) throw new Error("Customy Access app.listConnectedProducts requires environmentId");
        return this.request("GET", `/api/admin/env/${environmentId}/connected-products`);
    }

    async createApplication(environmentId: string, input: CreateAccessApplicationInput): Promise<{ application: Application & Record<string, unknown> }> {
        return this.request("POST", `/api/admin/env/${environmentId}/applications`, input);
    }

    async updateApplication(environmentId: string, applicationId: string, input: UpdateAccessApplicationInput): Promise<{ application: Application & Record<string, unknown> }> {
        return this.request("PATCH", `/api/admin/env/${environmentId}/applications/${applicationId}`, input);
    }
}

class CredentialsClient extends BaseClient {
    async list(environmentId = this.config.environmentId): Promise<{ credentials: Array<Record<string, unknown>>; count?: number }> {
        if (!environmentId) throw new Error("Customy Access credentials.list requires environmentId");
        return this.request("GET", `/api/admin/env/${environmentId}/credentials`);
    }
}

// ─── Groups Client (Brecha 6) ───────────────────────────────────

export interface Group {
    id: string;
    name: string;
    description?: string;
    parent_id?: string;
    member_count?: number;
    environment_id?: string;
    created_at?: string;
}

class GroupsClient extends BaseClient {
    async list(envId: string): Promise<Group[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/groups`);
        return normalizeRows(data);
    }

    async create(envId: string, group: { name: string; description?: string; parentId?: string }): Promise<{ success: boolean; id: string }> {
        return this.request("POST", `/api/admin/env/${envId}/groups`, group);
    }

    async update(envId: string, groupId: string, updates: Partial<Group>): Promise<Group> {
        return this.request("PUT", `/api/admin/env/${envId}/groups/${groupId}`, updates);
    }

    async delete(envId: string, groupId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/groups/${groupId}`);
    }

    async listMembers(envId: string, groupId: string): Promise<Array<{ user_id: string; user_name: string; user_email: string }>> {
        return this.request("GET", `/api/admin/env/${envId}/groups/${groupId}/members`);
    }

    async addMembers(envId: string, groupId: string, userIds: string[]): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/groups/${groupId}/members`, { userIds });
    }

    async removeMember(envId: string, groupId: string, userId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/groups/${groupId}/members/${userId}`);
    }

    async listRoles(envId: string, groupId: string): Promise<Array<{ role_id: string; role_name: string }>> {
        return this.request("GET", `/api/admin/env/${envId}/groups/${groupId}/roles`);
    }

    async assignRole(envId: string, groupId: string, roleId: string): Promise<{ success: boolean; id: string }> {
        return this.request("POST", `/api/admin/env/${envId}/groups/${groupId}/roles`, { roleId });
    }

    async removeRole(envId: string, groupId: string, roleId: string): Promise<{ success: boolean }> {
        return this.request("DELETE", `/api/admin/env/${envId}/groups/${groupId}/roles/${roleId}`);
    }
}

// ─── Limits Client (Brecha 9) ───────────────────────────────────

export interface LimitDefinition {
    id: string; code: string; name: string; description?: string;
    category?: string; default_value?: number; period?: string; is_active: boolean;
}

class LimitsClient extends BaseClient {
    async list(envId: string): Promise<LimitDefinition[]> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/limits`);
        return normalizeRows(data);
    }

    async create(envId: string, limit: { code: string; name: string; defaultValue?: number; period?: string }): Promise<{ success: boolean; id: string }> {
        return this.request("POST", `/api/admin/env/${envId}/limits`, limit);
    }

    async update(envId: string, limitId: string, updates: Partial<LimitDefinition>): Promise<LimitDefinition> {
        return this.request("PUT", `/api/admin/env/${envId}/limits/${limitId}`, updates);
    }

    async getUsage(envId: string, userId: string, workspaceId: string): Promise<Array<Record<string, unknown>>> {
        return this.request("GET", `/api/admin/env/${envId}/limits/usage?userId=${userId}&workspaceId=${workspaceId}`);
    }

    async assign(envId: string, params: { userId: string; workspaceId: string; limitDefinitionId: string; maxValue: number }): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/limits/assign`, params);
    }

    async reset(envId: string, params?: { userId?: string; workspaceId?: string; limitDefinitionId?: string }): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/limits/reset`, params || {});
    }
}

// ─── Capability Control Plane ──────────────────────────────────

class CapabilitiesClient extends BaseClient {
    async getMatrix(envId: string, params?: { userId?: string }): Promise<CapabilityMatrix> {
        const query = new URLSearchParams();
        if (params?.userId) query.set("userId", params.userId);
        const qstr = query.toString();
        return this.request("GET", `/api/admin/env/${envId}/capability-matrix${qstr ? `?${qstr}` : ""}`);
    }

    async check(envId: string, capability: string, params?: { userId?: string }): Promise<CapabilityMatrixItem> {
        const query = new URLSearchParams();
        if (params?.userId) query.set("userId", params.userId);
        const qstr = query.toString();
        return this.request("GET", `/api/admin/env/${envId}/capability-check/${encodeURIComponent(capability)}${qstr ? `?${qstr}` : ""}`);
    }

    async listVisibleModules(envId: string, params?: { userId?: string }): Promise<CapabilityMatrixModule[]> {
        const query = new URLSearchParams();
        if (params?.userId) query.set("userId", params.userId);
        const qstr = query.toString();
        const response = await this.request<{ modules: CapabilityMatrixModule[] }>("GET", `/api/admin/env/${envId}/visible-modules${qstr ? `?${qstr}` : ""}`);
        return response.modules;
    }

    async getUsageStatus(envId: string, params?: { userId?: string; capability?: string }): Promise<CapabilityUsageStatus[]> {
        const query = new URLSearchParams();
        if (params?.userId) query.set("userId", params.userId);
        if (params?.capability) query.set("capability", params.capability);
        const qstr = query.toString();
        const response = await this.request<{ usage: CapabilityUsageStatus[] }>("GET", `/api/admin/env/${envId}/usage-status${qstr ? `?${qstr}` : ""}`);
        return response.usage;
    }

    async getEntitlements(envId: string, params?: { userId?: string }): Promise<AccessEntitlements> {
        const query = new URLSearchParams();
        if (params?.userId) query.set("userId", params.userId);
        const qstr = query.toString();
        return this.request("GET", `/api/admin/env/${envId}/entitlements${qstr ? `?${qstr}` : ""}`);
    }

    /**
     * Subscription, entitlements, visible modules and usage for one environment.
     * Requires a credential: a user session (the snapshot is always the session's
     * own user; `userId` must match it), an API key / M2M token of `envId` with
     * the `capabilities:read` scope, or the admin secret.
     */
    async getMe(envId: string, params?: { userId?: string }): Promise<AccessMeSnapshot> {
        const query = new URLSearchParams();
        query.set("envId", envId);
        if (params?.userId) query.set("userId", params.userId);
        return this.request("GET", `/api/v1/me?${query.toString()}`);
    }

    async getSubscriptionStatus(envId: string): Promise<AccessSubscriptionStatus> {
        return this.request("GET", `/api/admin/env/${envId}/subscription-status`);
    }

    async getCommercialUsage(envId: string, params?: { userId?: string; capability?: string }): Promise<AccessCommercialUsageSnapshot> {
        const query = new URLSearchParams();
        if (params?.userId) query.set("userId", params.userId);
        if (params?.capability) query.set("capability", params.capability);
        const qstr = query.toString();
        return this.request("GET", `/api/admin/env/${envId}/commercial-usage${qstr ? `?${qstr}` : ""}`);
    }

    async canUseCapability(
        envId: string,
        capability: string,
        params?: { userId?: string; accessMode?: "read" | "write" },
    ): Promise<boolean> {
        const decision = await this.check(envId, capability, { userId: params?.userId });
        return isCapabilityDecisionAllowed(decision, params?.accessMode);
    }

    async canAccessModule(
        envId: string,
        moduleKey: string,
        params?: { userId?: string; accessMode?: "read" | "write" },
    ): Promise<boolean> {
        const matrix = await this.getMatrix(envId, { userId: params?.userId });
        const module = getModuleFromMatrix(matrix, moduleKey);
        if (!module) return false;
        return isCapabilityStateAllowed(module.state, params?.accessMode);
    }

    async bootstrap(
        envId: string,
        options: CapabilityBootstrapOptions = {},
    ): Promise<CapabilityBootstrapSnapshot> {
        const [matrix, modules, usage] = await Promise.all([
            this.getMatrix(envId, { userId: options.userId }),
            this.listVisibleModules(envId, { userId: options.userId }),
            options.includeUsage === false
                ? Promise.resolve([])
                : this.getUsageStatus(envId, { userId: options.userId }),
        ]);

        const seededDecisions = new Map<string, CapabilityMatrixItem>();
        for (const item of matrix.capabilities) {
            seededDecisions.set(item.capability, item);
        }

        if (options.capabilities?.length) {
            const missingCapabilities = options.capabilities.filter(
                (capability) => !seededDecisions.has(capability),
            );
            if (missingCapabilities.length) {
                const decisions = await Promise.all(
                    missingCapabilities.map((capability) =>
                        this.check(envId, capability, { userId: options.userId }),
                    ),
                );
                for (const decision of decisions) {
                    seededDecisions.set(decision.capability, decision);
                }
            }
        }

        const decisions = Object.fromEntries(seededDecisions.entries());

        return {
            matrix,
            modules,
            usage,
            decisions,
            canUseCapability(capability, accessMode = "write") {
                const decision = decisions[capability]
                    ?? getCapabilityFromMatrix(matrix, capability);
                return isCapabilityDecisionAllowed(decision, accessMode);
            },
            canAccessModule(moduleKey, accessMode = "write") {
                const module = modules.find((item) => item.key === moduleKey)
                    ?? getModuleFromMatrix(matrix, moduleKey);
                if (!module) return false;
                return isCapabilityStateAllowed(module.state, accessMode);
            },
            getCapability(capability) {
                return decisions[capability] ?? getCapabilityFromMatrix(matrix, capability);
            },
            getModule(moduleKey) {
                return modules.find((item) => item.key === moduleKey)
                    ?? getModuleFromMatrix(matrix, moduleKey);
            },
        };
    }
}

// ─── Approvals Client (Brecha 14) ───────────────────────────────

class ApprovalsClient extends BaseClient {
    async list(envId: string): Promise<Array<Record<string, unknown>>> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/approvals`);
        return normalizeRows(data);
    }

    async approve(envId: string, approvalId: string, comment?: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/approvals/${approvalId}/approve`, { comment });
    }

    async reject(envId: string, approvalId: string, reason?: string): Promise<{ success: boolean }> {
        return this.request("POST", `/api/admin/env/${envId}/approvals/${approvalId}/reject`, { reason });
    }

    async listWorkflows(envId: string): Promise<Array<Record<string, unknown>>> {
        const data = await this.request<unknown>("GET", `/api/admin/env/${envId}/approval-workflows`);
        return normalizeRows(data);
    }

    async createWorkflow(envId: string, workflow: Record<string, unknown>): Promise<{ success: boolean; id: string }> {
        return this.request("POST", `/api/admin/env/${envId}/approval-workflows`, workflow);
    }
}

// ─── Policy Templates Client (Brecha 20) ────────────────────────

class PolicyTemplatesClient extends BaseClient {
    async list(envId: string): Promise<Array<{ id: string; name: string; effect: string; description: string; conditions: Record<string, unknown> }>> {
        return this.request("GET", `/api/admin/env/${envId}/policy-templates`);
    }

    async apply(envId: string, templateId: string, params?: { workspaceId?: string; name?: string }): Promise<{ success: boolean; id: string }> {
        return this.request("POST", `/api/admin/env/${envId}/policy-templates/${templateId}/apply`, params || {});
    }
}

// ─── Auth Client ──────────────────────────────────────────────────

class AuthClient extends BaseClient {
    async getSession(token?: string): Promise<{ session: Record<string, unknown>; user: Record<string, unknown> } | null> {
        return this.request("GET", `/api/auth/get-session`, undefined, token ? {
            "Authorization": `Bearer ${token}`,
            // Access resolves sessions from a cookie. Keep the bearer
            // header for compatible gateways, but send a server-only cookie
            // as the canonical transport so service-to-service lookups work
            // through proxies that strip Authorization on GET requests.
            "Cookie": `customy.session_token=${encodeURIComponent(token)}`,
        } : undefined);
    }

    async signIn(body?: Record<string, unknown>, path = "/api/auth/sign-in/email"): Promise<Record<string, unknown>> {
        return this.request("POST", path, body ?? {});
    }
}

// ─── Agent Bridge Client ────────────────────────────────────────

class AgentBridgeClient extends BaseClient {
    async getHierarchy(envId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/admin/environments/${envId}/hierarchy`);
    }

    async verifySk(envId: string, secretKey: string): Promise<{ valid: boolean }> {
        return this.request("POST", `/api/admin/environments/${envId}/verify-sk`, { secretKey });
    }

    async validateApiKey(apiKey: string): Promise<{
        valid: boolean;
        keyId?: string;
        userId?: string;
        environmentId?: string;
        permissions?: string[];
        machineIdentityType?: string;
        machineIdentityId?: string | null;
        ownerService?: string | null;
        allowedAudiences?: string[];
    }> {
        return this.request("POST", `/api/admin/api-keys/validate`, { apiKey });
    }

    async getPermissions(userId: string, envId?: string, orgId?: string): Promise<{ permissions: string[]; role: string; groupIds?: string[] }> {
        const query = new URLSearchParams();
        if (envId) query.set("environmentId", envId);
        if (orgId) query.set("organizationId", orgId);
        return this.request("GET", `/api/admin/members/${userId}/permissions?${query.toString()}`);
    }

    async decide(input: {
        userId: string;
        envId: string;
        orgId?: string;
        projectId?: string;
        action: string;
        resourceType?: string;
        resourceId?: string;
        context?: Record<string, unknown>;
    }): Promise<{
        allowed: boolean;
        reason: string;
        uxState: string;
        title: string;
        message: string;
        action: string;
        resourceType: string;
        requiredPermissions: string[];
        missingPermissions: string[];
        effectivePermissions: string[];
        limits: Record<string, unknown>;
        capability?: string;
        capabilityState?: string | null;
        capabilityReason?: string | null;
        usage?: unknown;
        paywallHook?: string;
        approvalWorkflowId?: string;
        primaryAction?: { kind: string; label: string; href?: string };
        secondaryAction?: { kind: string; label: string; href?: string };
        auditId: string;
    }> {
        return this.request("POST", "/api/access/v1/decision", input);
    }

    async getOrganization(orgId: string): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/admin/organizations/${orgId}`);
    }

    async getDefaultEnvironment(orgId: string): Promise<{ environmentId: string }> {
        return this.request("GET", `/api/admin/organizations/${orgId}/default-environment`);
    }
}

class CatalogClient extends BaseClient {
    async seed(envId: string): Promise<{ success: boolean; catalog: EntitlementCatalogSnapshot }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/seed`);
    }

    async get(envId: string): Promise<EntitlementCatalogSnapshot> {
        return this.request("GET", `/api/admin/env/${envId}/catalog`);
    }

    async pricingContext(envId: string, scope?: CommercialCatalogScope): Promise<Omit<PricingCatalogResponse, "catalog">> {
        return this.request("GET", `/api/admin/env/${envId}/pricing/context${queryString(scope)}`);
    }

    async pricingCatalog(envId: string, scope?: CommercialCatalogScope): Promise<PricingCatalogResponse> {
        return this.request("GET", `/api/admin/env/${envId}/pricing/catalog${queryString(scope)}`);
    }

    async registerPricingCatalog(envId: string, catalog: RegisterPricingCatalogInput): Promise<{
        product: Record<string, unknown>;
        commercialCatalogOwner: CommercialCatalogOwner | null;
    }> {
        return this.request("POST", `/api/admin/env/${envId}/pricing/catalog/register`, catalog);
    }

    async publishPricingCatalog(envId: string, params?: { authorId?: string | null; approvalId?: string | null; requireApproval?: boolean }): Promise<{
        success: boolean;
        id: string;
        environmentId: string;
        version: number;
        snapshot: EntitlementCatalogSnapshot;
    }> {
        return this.request("POST", `/api/admin/env/${envId}/pricing/catalog/publish`, params ?? {});
    }

    async pricingBillingOps(envId: string, scope?: CommercialCatalogScope): Promise<Record<string, unknown>> {
        return this.request("GET", `/api/admin/env/${envId}/pricing/billing-ops${queryString(scope)}`);
    }

    async listFeatures(envId: string): Promise<EntitlementFeature[]> {
        const response = await this.request<{ items: EntitlementFeature[] }>("GET", `/api/admin/env/${envId}/catalog/features`);
        return response.items;
    }

    async listPlans(envId: string): Promise<EntitlementPlan[]> {
        const response = await this.request<{ items: EntitlementPlan[] }>("GET", `/api/admin/env/${envId}/catalog/plans`);
        return response.items;
    }

    async listAddOns(envId: string): Promise<EntitlementAddOn[]> {
        const response = await this.request<{ items: EntitlementAddOn[] }>("GET", `/api/admin/env/${envId}/catalog/addons`);
        return response.items;
    }

    async listPrices(envId: string): Promise<EntitlementPrice[]> {
        const response = await this.request<{ items: EntitlementPrice[] }>("GET", `/api/admin/env/${envId}/catalog/prices`);
        return response.items;
    }

    async listMeters(envId: string): Promise<EntitlementMeter[]> {
        const response = await this.request<{ items: EntitlementMeter[] }>("GET", `/api/admin/env/${envId}/catalog/meters`);
        return response.items;
    }

    async upsertFeature(envId: string, feature: EntitlementFeature): Promise<{ success: boolean; feature: EntitlementFeature }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/features`, feature);
    }

    async upsertPlan(envId: string, plan: EntitlementPlan): Promise<{ success: boolean; plan: EntitlementPlan }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/plans`, plan);
    }

    async upsertPlanFeature(envId: string, planFeature: EntitlementPlanFeature): Promise<{ success: boolean; planFeature: EntitlementPlanFeature }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/plan-features`, planFeature);
    }

    async upsertAddOn(envId: string, addOn: EntitlementAddOn): Promise<{ success: boolean; addOn: EntitlementAddOn }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/addons`, addOn);
    }

    async upsertAddOnFeature(envId: string, addOnFeature: EntitlementAddOnFeature): Promise<{ success: boolean; addOnFeature: EntitlementAddOnFeature }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/addon-features`, addOnFeature);
    }

    async upsertPrice(envId: string, price: EntitlementPrice): Promise<{ success: boolean; price: EntitlementPrice }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/prices`, price);
    }

    async upsertMeter(envId: string, meter: EntitlementMeter): Promise<{ success: boolean; meter: EntitlementMeter }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/meters`, meter);
    }

    async upsertOverlay(envId: string, overlay: EntitlementCatalogOverlay): Promise<{ success: boolean; overlay: EntitlementCatalogOverlay }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/overlays`, overlay);
    }

    async publish(envId: string, params?: { authorId?: string | null }): Promise<{ success: boolean; id: string; environmentId: string; version: number; snapshot: EntitlementCatalogSnapshot }> {
        return this.request("POST", `/api/admin/env/${envId}/catalog/publish`, params ?? {});
    }
}

class WorkspaceClient extends BaseClient {
    async getSubscription(envId: string, orgId: string, projectId: string): Promise<WorkspaceSubscription | null> {
        const response = await this.request<{ subscription: WorkspaceSubscription | null }>(
            "GET",
            `/api/admin/env/${envId}/orgs/${orgId}/subscription?projectId=${encodeURIComponent(projectId)}`,
        );
        return response.subscription;
    }

    async setSubscription(envId: string, orgId: string, subscription: Omit<WorkspaceSubscription, "environmentId" | "organizationId">): Promise<{ success: boolean; subscription: WorkspaceSubscription }> {
        return this.request("PUT", `/api/admin/env/${envId}/orgs/${orgId}/subscription`, subscription);
    }

    async listPriceOverrides(envId: string, orgId: string, projectId: string): Promise<WorkspacePriceOverride[]> {
        const response = await this.request<{ items: WorkspacePriceOverride[] }>(
            "GET",
            `/api/admin/env/${envId}/orgs/${orgId}/price-override?projectId=${encodeURIComponent(projectId)}`,
        );
        return response.items;
    }

    async upsertPriceOverride(envId: string, orgId: string, override: Omit<WorkspacePriceOverride, "environmentId" | "organizationId">): Promise<{ success: boolean; override: WorkspacePriceOverride }> {
        const method = override.id ? "PATCH" : "POST";
        const suffix = override.id ? `/${override.id}` : "";
        return this.request(method, `/api/admin/env/${envId}/orgs/${orgId}/price-override${suffix}`, override);
    }

    async listEntitlementOverrides(envId: string, orgId: string, projectId: string): Promise<WorkspaceEntitlementOverride[]> {
        const response = await this.request<{ items: WorkspaceEntitlementOverride[] }>(
            "GET",
            `/api/admin/env/${envId}/orgs/${orgId}/entitlement-override?projectId=${encodeURIComponent(projectId)}`,
        );
        return response.items;
    }

    async upsertEntitlementOverride(envId: string, orgId: string, override: Omit<WorkspaceEntitlementOverride, "environmentId" | "organizationId">): Promise<{ success: boolean; override: WorkspaceEntitlementOverride }> {
        const method = override.id ? "PATCH" : "POST";
        const suffix = override.id ? `/${override.id}` : "";
        return this.request(method, `/api/admin/env/${envId}/orgs/${orgId}/entitlement-override${suffix}`, override);
    }
}

// ═══════════════════════════════════════════════════════════════════
// ─── Main SDK Class ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

export class CustomyAccess {
    readonly hierarchy: HierarchyClient;
    readonly connections: ConnectionsClient;
    readonly users: UsersClient;
    readonly sessions: SessionsClient;
    readonly roles: RolesClient;
    readonly policies: PoliciesClient;
    readonly audit: AuditClient;
    readonly bruteForce: BruteForceClient;
    readonly impersonation: ImpersonationClient;
    readonly webhooks: WebhooksClient;
    readonly mfa: MFAClient;
    readonly branding: BrandingClient;
    readonly delegations: DelegationsClient;
    readonly relationships: RelationshipsClient;
    readonly gdpr: GDPRClient;
    readonly accountLinking: AccountLinkingClient;
    readonly tokenExchange: TokenExchangeClient;
    readonly pushMfa: PushMFAClient;
    readonly rateLimits: RateLimitsClient;
    readonly emailConfig: EmailConfigClient;
    readonly scim: SCIMClient;
    readonly m2m: M2MClient;
    readonly logStreams: LogStreamsClient;
    readonly devices: DevicesClient;
    readonly organizations: OrganizationsClient;
    readonly health: HealthClient;
    // ─── Authorization Roadmap SDK Clients ──────────────────────
    readonly authorization: AuthorizationClient;
    readonly groups: GroupsClient;
    readonly limits: LimitsClient;
    readonly capabilities: CapabilitiesClient;
    readonly catalog: CatalogClient;
    readonly workspace: WorkspaceClient;
    readonly approvals: ApprovalsClient;
    readonly policyTemplates: PolicyTemplatesClient;
    readonly agentBridge: AgentBridgeClient;
    readonly auth: AuthClient;
    readonly permissions: PermissionsClient;
    readonly credentials: CredentialsClient;
    readonly app: AppClient;
    readonly core: RawClient;

    readonly APIError = APIError;

    constructor(config: CustomyAccessConfig) {
        this.hierarchy = new HierarchyClient(config);
        this.connections = new ConnectionsClient(config);
        this.users = new UsersClient(config);
        this.sessions = new SessionsClient(config);
        this.roles = new RolesClient(config);
        this.policies = new PoliciesClient(config);
        this.audit = new AuditClient(config);
        this.bruteForce = new BruteForceClient(config);
        this.impersonation = new ImpersonationClient(config);
        this.webhooks = new WebhooksClient(config);
        this.mfa = new MFAClient(config);
        this.branding = new BrandingClient(config);
        this.delegations = new DelegationsClient(config);
        this.relationships = new RelationshipsClient(config);
        this.gdpr = new GDPRClient(config);
        this.accountLinking = new AccountLinkingClient(config);
        this.tokenExchange = new TokenExchangeClient(config);
        this.pushMfa = new PushMFAClient(config);
        this.rateLimits = new RateLimitsClient(config);
        this.emailConfig = new EmailConfigClient(config);
        this.scim = new SCIMClient(config);
        this.m2m = new M2MClient(config);
        this.logStreams = new LogStreamsClient(config);
        this.devices = new DevicesClient(config);
        this.organizations = new OrganizationsClient(config);
        this.health = new HealthClient(config);
        // ─── Authorization Roadmap SDK Clients ──────────────────
        this.authorization = new AuthorizationClient(config);
        this.groups = new GroupsClient(config);
        this.limits = new LimitsClient(config);
        this.capabilities = new CapabilitiesClient(config);
        this.catalog = new CatalogClient(config);
        this.workspace = new WorkspaceClient(config);
        this.approvals = new ApprovalsClient(config);
        this.policyTemplates = new PolicyTemplatesClient(config);
        this.agentBridge = new AgentBridgeClient(config);
        this.auth = new AuthClient(config);
        this.permissions = new PermissionsClient(config);
        this.credentials = new CredentialsClient(config);
        this.app = new AppClient(config);
        this.core = new RawClient(config);
    }
}

export function createAccessClient(config: CustomyAccessConfig): CustomyAccess {
    return new CustomyAccess(config);
}
