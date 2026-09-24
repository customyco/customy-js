/* eslint-disable */
/**
 * This file is generated from packages/customy-access/openapi/customy-access.openapi.json.
 * Do not edit by hand. Run pnpm sdk:access:generate.
 */

import {
  customyAccessOperationMap,
  type CustomyAccessOperation,
  type CustomyAccessOperationId,
} from "./operations";

export interface CustomyAccessGeneratedClientConfig {
  baseUrl: string;
  apiKey?: string;
  adminSecret?: string;
  bearerToken?: string;
  sessionToken?: string;
  publishableKey?: string;
  organizationId?: string;
  projectId?: string;
  environmentId?: string;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  fetch?: typeof fetch;
  allowUnsafeBrowserCredentials?: boolean;
  autoIdempotencyKey?: boolean;
  hooks?: CustomyAccessGeneratedHooks;
}

export interface CustomyAccessGeneratedRequestOptions {
  path?: Record<string, string | number | boolean>;
  query?: Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>>;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CustomyAccessGeneratedRequestContext {
  operationId: CustomyAccessOperationId;
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  attempt: number;
}

export interface CustomyAccessGeneratedResponseContext extends CustomyAccessGeneratedRequestContext {
  status: number;
  requestId?: string;
}

export interface CustomyAccessGeneratedHooks {
  beforeRequest?: (context: CustomyAccessGeneratedRequestContext) => void | Promise<void>;
  afterResponse?: (context: CustomyAccessGeneratedResponseContext) => void | Promise<void>;
  onRetry?: (context: CustomyAccessGeneratedResponseContext & { delayMs: number }) => void | Promise<void>;
}

export interface CustomyAccessGeneratedPaginationOptions extends CustomyAccessGeneratedRequestOptions {
  limit?: number;
  startPage?: number;
  maxPages?: number;
  pageParam?: string;
  limitParam?: string;
  itemsKey?: string;
  totalKey?: string;
}

export class CustomyAccessGeneratedError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly body: unknown;

  constructor(params: { status: number; message: string; code?: string; requestId?: string; body: unknown }) {
    super(params.message);
    this.name = "CustomyAccessGeneratedError";
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.body = params.body;
  }
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodePath(pathTemplate: string, params: Record<string, string | number | boolean> = {}): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, key: string) => {
    if (!(key in params)) throw new Error(`Missing required path parameter: ${key}`);
    return encodeURIComponent(String(params[key]));
  });
}

function appendQuery(pathname: string, query?: CustomyAccessGeneratedRequestOptions["query"]): string {
  if (!query) return pathname;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

function isReadMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function shouldRetry(method: string, status: number): boolean {
  if (![408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return false;
  return isReadMethod(method);
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function shouldAttachIdempotencyKey(method: string, headers: Record<string, string>, enabled = true): boolean {
  if (!enabled) return false;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  return !Object.keys(headers).some((key) => key.toLowerCase() === "idempotency-key");
}

function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
    throw new Error("CUSTOMY_SECURE_RANDOM_UNAVAILABLE");
  }
  return `cak_idem_${cryptoApi.randomUUID()}`;
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

export class CustomyAccessGeneratedClient {
  readonly config: CustomyAccessGeneratedClientConfig;

  constructor(config: CustomyAccessGeneratedClientConfig) {
    this.config = config;
  }

  operation(operationId: CustomyAccessOperationId): CustomyAccessOperation {
    const operation = customyAccessOperationMap.get(operationId);
    if (!operation) throw new Error(`Unknown Customy Access operationId: ${operationId}`);
    return operation;
  }

  async request<TResponse = unknown>(
    operationId: CustomyAccessOperationId,
    options: CustomyAccessGeneratedRequestOptions = {},
  ): Promise<TResponse> {
    const operation = this.operation(operationId);
    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("A fetch implementation is required.");

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

    const method = operation.method;
    const path = appendQuery(encodePath(operation.path, options.path), options.query);
    const url = `${trimSlashes(this.config.baseUrl)}${path}`;

    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      ...options.headers,
    };
    if (!isBrowser) headers["user-agent"] = this.config.userAgent ?? "customy-access-sdk-generated/1.0";

    if (this.config.apiKey) headers["x-api-key"] = this.config.apiKey;
    if (this.config.adminSecret) headers["x-admin-secret"] = this.config.adminSecret;
    if (this.config.publishableKey) headers["x-publishable-key"] = this.config.publishableKey;
    if (this.config.organizationId) headers["x-org-id"] = this.config.organizationId;
    if (this.config.projectId) headers["x-project-id"] = this.config.projectId;
    if (this.config.environmentId) {
      headers["x-env-id"] = this.config.environmentId;
      headers["x-environment-id"] = this.config.environmentId;
    }
    if (this.config.bearerToken || this.config.sessionToken) {
      headers.authorization = `Bearer ${this.config.bearerToken ?? this.config.sessionToken}`;
    }
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    if (shouldAttachIdempotencyKey(method, headers, this.config.autoIdempotencyKey)) {
      headers["idempotency-key"] = createIdempotencyKey();
    }

    const maxRetries = this.config.retries ?? 2;
    let lastError: unknown;
    const requestBody = options.body === undefined ? undefined : JSON.stringify(options.body);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      options.signal?.throwIfAborted();
      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), options.timeoutMs ?? this.config.timeoutMs ?? 30_000);
      const abort = () => timeoutController.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
      const signal = timeoutController.signal;
      const cleanup = () => {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
      };
      let transportFailed = false;

      try {
        const requestContext: CustomyAccessGeneratedRequestContext = { operationId, method, url, path, headers, attempt };
        await this.config.hooks?.beforeRequest?.(requestContext);
        signal.throwIfAborted();
        let response: Response;
        let text: string;
        try {
          response = await fetchImpl(url, { method, headers, body: requestBody, signal });
          text = await response.text();
        } catch (error) {
          transportFailed = true;
          throw error;
        }
        const requestId = response.headers.get("x-request-id") ?? undefined;
        const body = parseBody(text);
        const responseContext: CustomyAccessGeneratedResponseContext = {
          operationId,
          method,
          url,
          path,
          headers,
          attempt,
          status: response.status,
          requestId,
        };
        await this.config.hooks?.afterResponse?.(responseContext);
        options.signal?.throwIfAborted();

        if (!response.ok) {
          if (attempt < maxRetries && shouldRetry(method, response.status)) {
            const delayMs = retryDelay(attempt, response.headers.get("retry-after"));
            await this.config.hooks?.onRetry?.({ ...responseContext, delayMs });
            cleanup();
            await sleep(delayMs, options.signal);
            continue;
          }

          const errorBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
          throw new CustomyAccessGeneratedError({
            status: response.status,
            code: typeof errorBody.code === "string" ? errorBody.code : undefined,
            message: typeof errorBody.message === "string"
              ? errorBody.message
              : typeof errorBody.error === "string"
                ? errorBody.error
                : `Customy Access request failed with HTTP ${response.status}`,
            requestId,
            body,
          });
        }

        return body as TResponse;
      } catch (error) {
        lastError = error;
        options.signal?.throwIfAborted();
        // Only transport failures of read methods can be safely replayed.
        // A local hook failure is not a network failure, even if it is a TypeError.
        if (!transportFailed || !isReadMethod(method) || attempt >= maxRetries) {
          throw error;
        }
        cleanup();
        await sleep(retryDelay(attempt), options.signal);
      } finally {
        cleanup();
      }
    }

    throw lastError;
  }

  async *paginate<TItem = unknown>(
    operationId: CustomyAccessOperationId,
    options: CustomyAccessGeneratedPaginationOptions = {},
  ): AsyncGenerator<TItem, void, unknown> {
    const pageParam = options.pageParam ?? "page";
    const limitParam = options.limitParam ?? "limit";
    const limit = options.limit ?? 100;
    let page = options.startPage ?? 1;
    let pagesRead = 0;

    while (options.maxPages === undefined || pagesRead < options.maxPages) {
      const response = await this.request<unknown>(operationId, {
        ...options,
        query: {
          ...options.query,
          [pageParam]: page,
          [limitParam]: limit,
        },
      });
      const rows = normalizePageRows<TItem>(response, options.itemsKey);

      if (rows.length === 0) return;

      for (const row of rows) {
        yield row;
      }

      pagesRead += 1;
      if (!hasNextPage(response, rows.length, page, limit, options.totalKey)) return;
      page += 1;
    }
  }

  /** Adopt or rotate a customer-supplied key */
  adoptOrgCustomerKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("adoptOrgCustomerKey", options);
  }

  /** Create a company region or site */
  createWorkspaceOperatingUnit<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("createWorkspaceOperatingUnit", options);
  }

  /** Delete workspace saved view */
  deleteAccessWorkspaceSavedViewsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteAccessWorkspaceSavedViewsId", options);
  }

  /** Delete application */
  deleteApplicationsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteApplicationsId", options);
  }

  /** Delete auth session resource */
  deleteAuthWildcard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteAuthWildcard", options);
  }

  /** Unlink my account provider */
  deleteEnvEnvIdAccountLinkingMyProvidersProviderId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdAccountLinkingMyProvidersProviderId", options);
  }

  /** Unlink user account provider */
  deleteEnvEnvIdAccountLinkingUserIdProviderId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdAccountLinkingUserIdProviderId", options);
  }

  /** Delete agent identity */
  deleteEnvEnvIdAgentIdentitiesAgentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdAgentIdentitiesAgentId", options);
  }

  /** Delete API key */
  deleteEnvEnvIdApiKeysKeyId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdApiKeysKeyId", options);
  }

  /** Delete approval substitute */
  deleteEnvEnvIdApprovalSubstitutesSubId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdApprovalSubstitutesSubId", options);
  }

  /** Delete approval workflow */
  deleteEnvEnvIdApprovalWorkflowsWfId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdApprovalWorkflowsWfId", options);
  }

  /** Delete branding template */
  deleteEnvEnvIdBrandingTemplateCatalogTemplateKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdBrandingTemplateCatalogTemplateKey", options);
  }

  /** Archive auth experience widget */
  deleteEnvEnvIdBrandingWidgetsWidgetKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdBrandingWidgetsWidgetKey", options);
  }

  /** Delete conditional assignment */
  deleteEnvEnvIdConditionalAssignmentsRuleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdConditionalAssignmentsRuleId", options);
  }

  /** Delete identity-provider connection */
  deleteEnvEnvIdConnectionsConnId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdConnectionsConnId", options);
  }

  /** Delete stored credential */
  deleteEnvEnvIdCredentialsCredentialId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdCredentialsCredentialId", options);
  }

  /** Delete credential grant */
  deleteEnvEnvIdCredentialsCredentialIdGrantsGrantId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdCredentialsCredentialIdGrantsGrantId", options);
  }

  /** Delete scoped delegation */
  deleteEnvEnvIdDelegationsDelegId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdDelegationsDelegId", options);
  }

  /** Delete custom domain */
  deleteEnvEnvIdDomainsDomainId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdDomainsDomainId", options);
  }

  /** Delete email template */
  deleteEnvEnvIdEmailTemplatesTemplateKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdEmailTemplatesTemplateKey", options);
  }

  /** Delete dynamic group rule */
  deleteEnvEnvIdGroupsDynamicRulesRuleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdGroupsDynamicRulesRuleId", options);
  }

  /** Delete group */
  deleteEnvEnvIdGroupsGroupId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdGroupsGroupId", options);
  }

  /** Remove group member */
  deleteEnvEnvIdGroupsGroupIdMembersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdGroupsGroupIdMembersUserId", options);
  }

  /** Remove group role */
  deleteEnvEnvIdGroupsGroupIdRolesRoleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdGroupsGroupIdRolesRoleId", options);
  }

  /** Delete impersonation actor token */
  deleteEnvEnvIdImpersonationActorTokensTokenId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdImpersonationActorTokensTokenId", options);
  }

  /** Delete email integration */
  deleteEnvEnvIdIntegrationsEmailId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdIntegrationsEmailId", options);
  }

  /** Delete integration provider secret */
  deleteEnvEnvIdIntegrationsProvidersProviderIdSecretsEnvKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdIntegrationsProvidersProviderIdSecretsEnvKey", options);
  }

  /** Delete SMS integration */
  deleteEnvEnvIdIntegrationsSmsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdIntegrationsSmsId", options);
  }

  /** Delete invitation */
  deleteEnvEnvIdInvitationsInvitationId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdInvitationsInvitationId", options);
  }

  /** Delete limit definition */
  deleteEnvEnvIdLimitDefinitionsDefId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdLimitDefinitionsDefId", options);
  }

  /** Delete limit override */
  deleteEnvEnvIdLimitsLimitId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdLimitsLimitId", options);
  }

  /** Delete admin log stream */
  deleteEnvEnvIdLogStreamsStreamId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdLogStreamsStreamId", options);
  }

  /** Delete log stream */
  deleteEnvEnvIdLogStreamsStreamId2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdLogStreamsStreamId2", options);
  }

  /** Delete member limit */
  deleteEnvEnvIdMemberLimitsLimitId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdMemberLimitsLimitId", options);
  }

  /** Delete member permission */
  deleteEnvEnvIdMemberPermissionsPermissionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdMemberPermissionsPermissionId", options);
  }

  /** Delete member restriction */
  deleteEnvEnvIdMemberRestrictionsRestrictionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdMemberRestrictionsRestrictionId", options);
  }

  /** Delete workspace entitlement override */
  deleteEnvEnvIdOrgsOrgIdEntitlementOverrideId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdOrgsOrgIdEntitlementOverrideId", options);
  }

  /** Delete workspace price override */
  deleteEnvEnvIdOrgsOrgIdPriceOverrideId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdOrgsOrgIdPriceOverrideId", options);
  }

  /** Delete passkey */
  deleteEnvEnvIdPasskeysPasskeyId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdPasskeysPasskeyId", options);
  }

  /** Delete permission */
  deleteEnvEnvIdPermissionsPermissionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdPermissionsPermissionId", options);
  }

  /** Delete policy */
  deleteEnvEnvIdPoliciesPolicyId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdPoliciesPolicyId", options);
  }

  /** Remove policy subject */
  deleteEnvEnvIdPoliciesPolicyIdSubjectsSubjectId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdPoliciesPolicyIdSubjectsSubjectId", options);
  }

  /** Delete relationship tuple */
  deleteEnvEnvIdRelationships<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdRelationships", options);
  }

  /** Delete role assignment */
  deleteEnvEnvIdRoleAssignmentsAssignmentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdRoleAssignmentsAssignmentId", options);
  }

  /** Delete role constraint */
  deleteEnvEnvIdRoleConstraintsConstraintId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdRoleConstraintsConstraintId", options);
  }

  /** Delete role */
  deleteEnvEnvIdRolesRoleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdRolesRoleId", options);
  }

  /** Remove role permission */
  deleteEnvEnvIdRolesRoleIdPermissionsRpId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdRolesRoleIdPermissionsRpId", options);
  }

  /** Delete SCIM config */
  deleteEnvEnvIdScimConfigsConfigId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdScimConfigsConfigId", options);
  }

  /** Delete SCIM group-role mapping */
  deleteEnvEnvIdScimConfigsConfigIdGroupRoleMappingsMappingId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdScimConfigsConfigIdGroupRoleMappingsMappingId", options);
  }

  /** Delete IP access rule */
  deleteEnvEnvIdSecurityIpAccessRuleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdSecurityIpAccessRuleId", options);
  }

  /** Delete session */
  deleteEnvEnvIdSessionsSessionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdSessionsSessionId", options);
  }

  /** Delete SIEM config */
  deleteEnvEnvIdSiemConfigConfigId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdSiemConfigConfigId", options);
  }

  /** Delete token exchange policy */
  deleteEnvEnvIdTokenExchangePoliciesPolicyId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdTokenExchangePoliciesPolicyId", options);
  }

  /** Delete token exchange */
  deleteEnvEnvIdTokenExchangesExchangeId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdTokenExchangesExchangeId", options);
  }

  /** Delete user */
  deleteEnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdUsersUserId", options);
  }

  /** Remove user role */
  deleteEnvEnvIdUsersUserIdRolesRoleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdUsersUserIdRolesRoleId", options);
  }

  /** Delete user sessions */
  deleteEnvEnvIdUsersUserIdSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdUsersUserIdSessions", options);
  }

  /** Delete user sessions via v1 admin API */
  deleteEnvEnvIdUsersUserIdSessions2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdUsersUserIdSessions2", options);
  }

  /** Delete webhook */
  deleteEnvEnvIdWebhooksWebhookId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdWebhooksWebhookId", options);
  }

  /** Delete workflow */
  deleteEnvEnvIdWorkflowsWorkflowId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdWorkflowsWorkflowId", options);
  }

  /** Delete workforce member */
  deleteEnvEnvIdWorkforceMembersId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvEnvIdWorkforceMembersId", options);
  }

  /** Delete environment */
  deleteEnvironmentsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteEnvironmentsId", options);
  }

  /** Revoke my OAuth consent */
  deleteMeConsentsConsentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteMeConsentsConsentId", options);
  }

  /** Delete organization */
  deleteOrganizationsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteOrganizationsId", options);
  }

  /** Delete platform policy config */
  deletePolicyConfigId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deletePolicyConfigId", options);
  }

  /** Delete project */
  deleteProjectsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteProjectsId", options);
  }

  /** Delete SCIM group */
  deleteScimV2EnvEnvIdGroupsGroupId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteScimV2EnvEnvIdGroupsGroupId", options);
  }

  /** Delete SCIM user */
  deleteScimV2EnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteScimV2EnvEnvIdUsersUserId", options);
  }

  /** Delete trusted origin */
  deleteTrustedOriginsOriginId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteTrustedOriginsOriginId", options);
  }

  /** Delete current user session */
  deleteUserSessionsSessionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("deleteUserSessionsSessionId", options);
  }

  /** Get V1 Ui Layout */
  getAccessUiLayout<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessUiLayout", options);
  }

  /** Get V1 Ui Theme */
  getAccessUiTheme<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessUiTheme", options);
  }

  /** Get V1 Workspace Experiments */
  getAccessWorkspaceExperiments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceExperiments", options);
  }

  /** Get V1 Workspace Feature Flags */
  getAccessWorkspaceFeatureFlags<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceFeatureFlags", options);
  }

  /** Get Workspace Layouts Current */
  getAccessWorkspaceLayoutsCurrent<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceLayoutsCurrent", options);
  }

  /** Get V1 Workspace Preferences */
  getAccessWorkspacePreferences<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspacePreferences", options);
  }

  /** Get V1 Workspace Regional */
  getAccessWorkspaceRegional<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceRegional", options);
  }

  /** Get V1 Workspace Saved Views */
  getAccessWorkspaceSavedViews<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceSavedViews", options);
  }

  /** Get V1 Workspace Sdui Documents */
  getAccessWorkspaceSduiDocuments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceSduiDocuments", options);
  }

  /** Get V1 Workspace Sdui Documents */
  getAccessWorkspaceSduiDocumentsKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAccessWorkspaceSduiDocumentsKey", options);
  }

  /** Get Admin Applications Dependencies */
  getApplicationsAppIdDependencies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getApplicationsAppIdDependencies", options);
  }

  /** Get Admin Applications Dependency Candidates */
  getApplicationsAppIdDependencyCandidates<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getApplicationsAppIdDependencyCandidates", options);
  }

  /** Get Api Auth Connection Test */
  getAuthConnectionTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAuthConnectionTest", options);
  }

  /** Get Auth Device List */
  getAuthDeviceList<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAuthDeviceList", options);
  }

  /** Get Auth Device Pending */
  getAuthDevicePending<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAuthDevicePending", options);
  }

  /** Check if current session is an impersonation session */
  getAuthImpersonationStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAuthImpersonationStatus", options);
  }

  /** Get Api Admin Authorize Scope */
  getAuthorizeScope<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAuthorizeScope", options);
  }

  /** Get Api Auth */
  getAuthWildcard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getAuthWildcard", options);
  }

  /** Get Admin Commercial Products */
  getCommercialProducts<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getCommercialProducts", options);
  }

  /** Get Commercial Products Bindings */
  getCommercialProductsProductKeyBindings<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getCommercialProductsProductKeyBindings", options);
  }

  /** Get Commercial Products Catalog */
  getCommercialProductsProductKeyCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getCommercialProductsProductKeyCatalog", options);
  }

  /** Get Commercial Products Context */
  getCommercialProductsProductKeyContext<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getCommercialProductsProductKeyContext", options);
  }

  /** Get Api Admin Console */
  getConsole<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getConsole", options);
  }

  /** Get Oauth Google Callback */
  getCredentialsOauthGoogleCallback<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getCredentialsOauthGoogleCallback", options);
  }

  /** Get Admin Data Isolation Activity */
  getDataIsolationActivity<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDataIsolationActivity", options);
  }

  /** Get Admin Data Isolation Operations */
  getDataIsolationOperations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDataIsolationOperations", options);
  }

  /** Get Data Isolation Operations Facets */
  getDataIsolationOperationsFacets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDataIsolationOperationsFacets", options);
  }

  /** Get Admin Data Isolation Operations */
  getDataIsolationOperationsOperationId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDataIsolationOperationsOperationId", options);
  }

  /** Get Data Isolation Operations Replay Preview */
  getDataIsolationOperationsReplayPreview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDataIsolationOperationsReplayPreview", options);
  }

  /** Get Admin Data Isolation Overview */
  getDataIsolationOverview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDataIsolationOverview", options);
  }

  /** Get V1 Decision Reasons */
  getDecisionReasons<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDecisionReasons", options);
  }

  /** Get V1 Directory Members */
  getDirectoryMembers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDirectoryMembers", options);
  }

  /** Get Api Docs */
  getDocs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocs", options);
  }

  /** Get agent-safe OpenAPI tool manifest */
  getDocsAgentTools<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsAgentTools", options);
  }

  /** Get OpenAPI contract debt promotion backlog */
  getDocsContractDebt<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsContractDebt", options);
  }

  /** Get OpenAPI quality coverage */
  getDocsCoverage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsCoverage", options);
  }

  /** Get OpenAPI domain map */
  getDocsDomains<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsDomains", options);
  }

  /** Get Api Docs Json */
  getDocsJson<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsJson", options);
  }

  /** Get OpenAPI world-class readiness gates */
  getDocsReadiness<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsReadiness", options);
  }

  /** Get Docs Static Index.Html */
  getDocsStaticIndexHtml<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsStaticIndexHtml", options);
  }

  /** Get Docs Static Swagger Initializer.Js */
  getDocsStaticSwaggerInitializerJs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsStaticSwaggerInitializerJs", options);
  }

  /** Get Swagger UI static asset */
  getDocsStaticWildcard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsStaticWildcard", options);
  }

  /** Get Api Docs Yaml */
  getDocsYaml<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getDocsYaml", options);
  }

  /** Get Ecosystem Acceptance Audit */
  getEcosystemAcceptanceAudit<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEcosystemAcceptanceAudit", options);
  }

  /** Get Admin Ecosystem Control Plane */
  getEcosystemControlPlane<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEcosystemControlPlane", options);
  }

  /** Get A2a Federation Partners */
  getEnvEnvIdA2aFederationPartners<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdA2aFederationPartners", options);
  }

  /** Get A2a Federation Partners */
  getEnvEnvIdA2aFederationPartnersPartnerId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdA2aFederationPartnersPartnerId", options);
  }

  /** Get Env A2a Payments Posture */
  getEnvEnvIdA2aPaymentsPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdA2aPaymentsPosture", options);
  }

  /** Get Env A2a Posture */
  getEnvEnvIdA2aPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdA2aPosture", options);
  }

  /** Get Env A2a Tasks */
  getEnvEnvIdA2aTasks<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdA2aTasks", options);
  }

  /** Get Env A2a Tasks */
  getEnvEnvIdA2aTasksTaskId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdA2aTasksTaskId", options);
  }

  /** Get Env Account Linking Callback */
  getEnvEnvIdAccountLinkingCallback<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAccountLinkingCallback", options);
  }

  /** Get Env Account Linking Config */
  getEnvEnvIdAccountLinkingConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAccountLinkingConfig", options);
  }

  /** Get Env Account Linking History */
  getEnvEnvIdAccountLinkingHistory<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAccountLinkingHistory", options);
  }

  /** Get Env Account Linking Trust Levels */
  getEnvEnvIdAccountLinkingTrustLevels<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAccountLinkingTrustLevels", options);
  }

  /** Get Env Account Linking History */
  getEnvEnvIdAccountLinkingUserIdHistory<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAccountLinkingUserIdHistory", options);
  }

  /** Get Env Account Linking Providers */
  getEnvEnvIdAccountLinkingUserIdProviders<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAccountLinkingUserIdProviders", options);
  }

  /** Get Env Agency Guardrails */
  getEnvEnvIdAgencyGuardrails<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgencyGuardrails", options);
  }

  /** Get Env Agent Governance Posture */
  getEnvEnvIdAgentGovernancePosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentGovernancePosture", options);
  }

  /** Get Admin Env Agent Identities */
  getEnvEnvIdAgentIdentities<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentIdentities", options);
  }

  /** Get Admin Env Agent Identities */
  getEnvEnvIdAgentIdentitiesAgentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentIdentitiesAgentId", options);
  }

  /** Get Env Agent Identities Extended Agent Card */
  getEnvEnvIdAgentIdentitiesAgentIdExtendedAgentCard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentIdentitiesAgentIdExtendedAgentCard", options);
  }

  /** Get Admin Env Agents */
  getEnvEnvIdAgents<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgents", options);
  }

  /** Get Agents Commerce Posture */
  getEnvEnvIdAgentsAgentIdCommercePosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsAgentIdCommercePosture", options);
  }

  /** Get Agents Commerce Transactions */
  getEnvEnvIdAgentsAgentIdCommerceTransactions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsAgentIdCommerceTransactions", options);
  }

  /** Get Agents Commerce Transactions */
  getEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionId", options);
  }

  /** Get Env Agents Risk Posture */
  getEnvEnvIdAgentsAgentIdRiskPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsAgentIdRiskPosture", options);
  }

  /** Get Agents Ciba Requests */
  getEnvEnvIdAgentsCibaRequests<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsCibaRequests", options);
  }

  /** Get Agents Ciba Requests */
  getEnvEnvIdAgentsCibaRequestsRequestId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsCibaRequestsRequestId", options);
  }

  /** Get Env Agents Delegations */
  getEnvEnvIdAgentsDelegations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsDelegations", options);
  }

  /** Get Env Agents Delegations */
  getEnvEnvIdAgentsDelegationsGrantId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsDelegationsGrantId", options);
  }

  /** Get Agents Delegations Posture */
  getEnvEnvIdAgentsDelegationsPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsDelegationsPosture", options);
  }

  /** Get Env Agents Sessions */
  getEnvEnvIdAgentsSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsSessions", options);
  }

  /** Get Env Agents Sessions */
  getEnvEnvIdAgentsSessionsSessionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsSessionsSessionId", options);
  }

  /** Get Agents Sessions Continuous Authorization */
  getEnvEnvIdAgentsSessionsSessionIdContinuousAuthorization<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsSessionsSessionIdContinuousAuthorization", options);
  }

  /** Get Agents Token Vault Consents */
  getEnvEnvIdAgentsTokenVaultConsents<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsTokenVaultConsents", options);
  }

  /** Get Agents Token Vault Consents */
  getEnvEnvIdAgentsTokenVaultConsentsConsentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsTokenVaultConsentsConsentId", options);
  }

  /** Get Agents Token Vault Credentials */
  getEnvEnvIdAgentsTokenVaultCredentials<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsTokenVaultCredentials", options);
  }

  /** Get Agents Token Vault Credentials */
  getEnvEnvIdAgentsTokenVaultCredentialsCredentialId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAgentsTokenVaultCredentialsCredentialId", options);
  }

  /** Get Env Ai Agent Auth Overview */
  getEnvEnvIdAiAgentAuthOverview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAiAgentAuthOverview", options);
  }

  /** Get Admin Env Api Keys */
  getEnvEnvIdApiKeys<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApiKeys", options);
  }

  /** Get Env Api Keys Audit */
  getEnvEnvIdApiKeysKeyIdAudit<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApiKeysKeyIdAudit", options);
  }

  /** Get Env Api Keys Usage */
  getEnvEnvIdApiKeysKeyIdUsage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApiKeysKeyIdUsage", options);
  }

  /** Get Admin Env Application Contract */
  getEnvEnvIdApplicationContract<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApplicationContract", options);
  }

  /** Get Admin Env Approvals */
  getEnvEnvIdApprovals<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovals", options);
  }

  /** Get Admin Env Approvals */
  getEnvEnvIdApprovalsApprovalId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalsApprovalId", options);
  }

  /** Get Env Approvals Steps */
  getEnvEnvIdApprovalsApprovalIdSteps<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalsApprovalIdSteps", options);
  }

  /** Get Env Approvals My Pending */
  getEnvEnvIdApprovalsMyPending<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalsMyPending", options);
  }

  /** Get Admin Env Approval Substitutes */
  getEnvEnvIdApprovalSubstitutes<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalSubstitutes", options);
  }

  /** Get Env Approval Substitutes Active */
  getEnvEnvIdApprovalSubstitutesActiveApproverId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalSubstitutesActiveApproverId", options);
  }

  /** Get Env Approval Substitutes My */
  getEnvEnvIdApprovalSubstitutesMy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalSubstitutesMy", options);
  }

  /** Get Admin Env Approval Workflows */
  getEnvEnvIdApprovalWorkflows<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdApprovalWorkflows", options);
  }

  /** Get Admin Env Audit Log */
  getEnvEnvIdAuditLog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuditLog", options);
  }

  /** Get Admin Env Audit Logs */
  getEnvEnvIdAuditLogs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuditLogs", options);
  }

  /** Get Env Audit Logs Export */
  getEnvEnvIdAuditLogsExport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuditLogsExport", options);
  }

  /** Get Env Audit Stats */
  getEnvEnvIdAuditStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuditStats", options);
  }

  /** Get Admin Env Authorization Model */
  getEnvEnvIdAuthorizationModel<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuthorizationModel", options);
  }

  /** Get Env Authorization Model Catalog */
  getEnvEnvIdAuthorizationModelCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuthorizationModelCatalog", options);
  }

  /** Get Env Authorization Model Package */
  getEnvEnvIdAuthorizationModelPackage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuthorizationModelPackage", options);
  }

  /** Get Env Authorization Model Versions */
  getEnvEnvIdAuthorizationModelVersions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuthorizationModelVersions", options);
  }

  /** Get Env Authorization Model Versions */
  getEnvEnvIdAuthorizationModelVersionsVersion<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuthorizationModelVersionsVersion", options);
  }

  /** Get Admin Env Authz Audit */
  getEnvEnvIdAuthzAudit<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdAuthzAudit", options);
  }

  /** Get Admin Env Brain Files */
  getEnvEnvIdBrainFiles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBrainFiles", options);
  }

  /** Get Admin Env Brain Files */
  getEnvEnvIdBrainFilesAgentIdFileName<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBrainFilesAgentIdFileName", options);
  }

  /** Get Env Brain Files Defaults */
  getEnvEnvIdBrainFilesDefaults<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBrainFilesDefaults", options);
  }

  /** Get Admin Env Branding */
  getEnvEnvIdBranding<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBranding", options);
  }

  /** Get Env Branding Template Catalog */
  getEnvEnvIdBrandingTemplateCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBrandingTemplateCatalog", options);
  }

  /** Get Env Branding Widgets */
  getEnvEnvIdBrandingWidgets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBrandingWidgets", options);
  }

  /** Get Admin Env Breach Notification Config */
  getEnvEnvIdBreachNotificationConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBreachNotificationConfig", options);
  }

  /** Get Env Brute Force Stats */
  getEnvEnvIdBruteForceStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdBruteForceStats", options);
  }

  /** Get Admin Env Capability Check */
  getEnvEnvIdCapabilityCheckCapability<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCapabilityCheckCapability", options);
  }

  /** Get Admin Env Capability Matrix */
  getEnvEnvIdCapabilityMatrix<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCapabilityMatrix", options);
  }

  /** Get Admin Env Catalog */
  getEnvEnvIdCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCatalog", options);
  }

  /** Get Env Catalog Approval Requests */
  getEnvEnvIdCatalogApprovalRequests<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCatalogApprovalRequests", options);
  }

  /** Get Admin Env Catalog */
  getEnvEnvIdCatalogEntity<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCatalogEntity", options);
  }

  /** Get Env Catalog Experiments */
  getEnvEnvIdCatalogExperiments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCatalogExperiments", options);
  }

  /** Get Env Catalog Versions */
  getEnvEnvIdCatalogVersions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCatalogVersions", options);
  }

  /** Get Env Catalog Versions */
  getEnvEnvIdCatalogVersionsVersion<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCatalogVersionsVersion", options);
  }

  /** Get Admin Env Commercial Usage */
  getEnvEnvIdCommercialUsage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCommercialUsage", options);
  }

  /** Get Admin Env Compliance Report */
  getEnvEnvIdComplianceReport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdComplianceReport", options);
  }

  /** Get Env Compliance Report */
  getEnvEnvIdComplianceReport2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdComplianceReport2", options);
  }

  /** Get Compliance Report Evidence Catalog */
  getEnvEnvIdComplianceReportEvidenceCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdComplianceReportEvidenceCatalog", options);
  }

  /** Get Compliance Report Export */
  getEnvEnvIdComplianceReportExport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdComplianceReportExport", options);
  }

  /** Get Compliance Report Posture */
  getEnvEnvIdComplianceReportPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdComplianceReportPosture", options);
  }

  /** Get Admin Env Conditional Assignments */
  getEnvEnvIdConditionalAssignments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConditionalAssignments", options);
  }

  /** Get Admin Env Connected Application */
  getEnvEnvIdConnectedApplication<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectedApplication", options);
  }

  /** Get V1 Env Connected Application */
  getEnvEnvIdConnectedApplication2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectedApplication2", options);
  }

  /** Get Admin Env Connected Applications */
  getEnvEnvIdConnectedApplications<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectedApplications", options);
  }

  /** Get Admin Env Connected Products */
  getEnvEnvIdConnectedProducts<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectedProducts", options);
  }

  /** Get Admin Env Connections */
  getEnvEnvIdConnections<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnections", options);
  }

  /** Get Env Connections Callback Uri */
  getEnvEnvIdConnectionsConnIdCallbackUri<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectionsConnIdCallbackUri", options);
  }

  /** Get Env Connections Lifecycle */
  getEnvEnvIdConnectionsConnIdLifecycle<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectionsConnIdLifecycle", options);
  }

  /** Get Env Connections Stats */
  getEnvEnvIdConnectionsStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConnectionsStats", options);
  }

  /** Get Admin Env Consistency Token */
  getEnvEnvIdConsistencyToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdConsistencyToken", options);
  }

  /** Get Env Continuous Authorization Posture */
  getEnvEnvIdContinuousAuthorizationPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdContinuousAuthorizationPosture", options);
  }

  /** Get Admin Env Credentials */
  getEnvEnvIdCredentials<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCredentials", options);
  }

  /** Get Oauth Google Setup */
  getEnvEnvIdCredentialsOauthGoogleSetup<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCredentialsOauthGoogleSetup", options);
  }

  /** Get Env Cross Org Delegations Posture */
  getEnvEnvIdCrossOrgDelegationsPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCrossOrgDelegationsPosture", options);
  }

  /** Get Env Crypto Agility Posture */
  getEnvEnvIdCryptoAgilityPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdCryptoAgilityPosture", options);
  }

  /** Get Admin Env Data Isolation */
  getEnvEnvIdDataIsolation<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDataIsolation", options);
  }

  /** Get Env Data Isolation Activity */
  getEnvEnvIdDataIsolationActivity<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDataIsolationActivity", options);
  }

  /** Get Data Isolation Operations Facets */
  getEnvEnvIdDataIsolationOperationsFacets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDataIsolationOperationsFacets", options);
  }

  /** Get Env Data Isolation Operations */
  getEnvEnvIdDataIsolationOperationsOperationId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDataIsolationOperationsOperationId", options);
  }

  /** Get Data Isolation Operations Replay Preview */
  getEnvEnvIdDataIsolationOperationsReplayPreview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDataIsolationOperationsReplayPreview", options);
  }

  /** Get Admin Env Decision Log */
  getEnvEnvIdDecisionLog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDecisionLog", options);
  }

  /** Get Admin Env Delegations */
  getEnvEnvIdDelegations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDelegations", options);
  }

  /** Get Env Delegations Usage */
  getEnvEnvIdDelegationsDelegIdUsage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDelegationsDelegIdUsage", options);
  }

  /** Get Env Delegations My */
  getEnvEnvIdDelegationsMy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDelegationsMy", options);
  }

  /** Get Admin Env Devices */
  getEnvEnvIdDevices<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDevices", options);
  }

  /** Get Admin Env Did Registry */
  getEnvEnvIdDidRegistry<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDidRegistry", options);
  }

  /** Get Admin Env Did Registry */
  getEnvEnvIdDidRegistryDidId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDidRegistryDidId", options);
  }

  /** Get Env Did Registry Posture */
  getEnvEnvIdDidRegistryPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDidRegistryPosture", options);
  }

  /** Get Admin Env Domains */
  getEnvEnvIdDomains<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDomains", options);
  }

  /** Get Env Domains Posture */
  getEnvEnvIdDomainsDomainIdPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdDomainsDomainIdPosture", options);
  }

  /** Get Admin Env Email Config */
  getEnvEnvIdEmailConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdEmailConfig", options);
  }

  /** Get Admin Env Email Templates */
  getEnvEnvIdEmailTemplates<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdEmailTemplates", options);
  }

  /** Get Admin Env Email Templates */
  getEnvEnvIdEmailTemplatesTemplateKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdEmailTemplatesTemplateKey", options);
  }

  /** Get Admin Env Enterprise Readiness */
  getEnvEnvIdEnterpriseReadiness<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdEnterpriseReadiness", options);
  }

  /** Get Admin Env Entitlements */
  getEnvEnvIdEntitlements<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdEntitlements", options);
  }

  /** Get Env Eu Ai Act Module */
  getEnvEnvIdEuAiActModule<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdEuAiActModule", options);
  }

  /** Get Admin Env Explain Permission */
  getEnvEnvIdExplainPermission<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdExplainPermission", options);
  }

  /** Get Admin Env Flows */
  getEnvEnvIdFlows<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdFlows", options);
  }

  /** Get Env Gdpr Privacy Config */
  getEnvEnvIdGdprPrivacyConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdGdprPrivacyConfig", options);
  }

  /** GDPR Compliance Report */
  getEnvEnvIdGdprReport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdGdprReport", options);
  }

  /** Get Admin Env Groups */
  getEnvEnvIdGroups<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdGroups", options);
  }

  /** Get Env Groups Dynamic Rules */
  getEnvEnvIdGroupsDynamicRules<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdGroupsDynamicRules", options);
  }

  /** Get Env Groups Members */
  getEnvEnvIdGroupsGroupIdMembers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdGroupsGroupIdMembers", options);
  }

  /** Get Env Groups Roles */
  getEnvEnvIdGroupsGroupIdRoles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdGroupsGroupIdRoles", options);
  }

  /** Get Admin Env Hierarchy */
  getEnvEnvIdHierarchy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdHierarchy", options);
  }

  /** Get Env Impersonate History */
  getEnvEnvIdImpersonateHistory<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdImpersonateHistory", options);
  }

  /** List active impersonation sessions */
  getEnvEnvIdImpersonationActive<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdImpersonationActive", options);
  }

  /** Get impersonation configuration for an organization */
  getEnvEnvIdImpersonationConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdImpersonationConfig", options);
  }

  /** Get impersonation session history with pagination */
  getEnvEnvIdImpersonationHistory<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdImpersonationHistory", options);
  }

  /** Get Admin Env Integration Profile */
  getEnvEnvIdIntegrationProfile<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationProfile", options);
  }

  /** Get Env Integrations Control Plane */
  getEnvEnvIdIntegrationsControlPlane<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationsControlPlane", options);
  }

  /** Get Env Integrations Email */
  getEnvEnvIdIntegrationsEmail<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationsEmail", options);
  }

  /** Get Env Integrations Providers */
  getEnvEnvIdIntegrationsProvidersProviderId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationsProvidersProviderId", options);
  }

  /** Get Integrations Providers Secrets */
  getEnvEnvIdIntegrationsProvidersProviderIdSecrets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationsProvidersProviderIdSecrets", options);
  }

  /** Get Env Integrations Sms */
  getEnvEnvIdIntegrationsSms<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationsSms", options);
  }

  /** Get Integrations Tool Platform Overview */
  getEnvEnvIdIntegrationsToolPlatformOverview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdIntegrationsToolPlatformOverview", options);
  }

  /** Get Admin Env Invitations */
  getEnvEnvIdInvitations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdInvitations", options);
  }

  /** Get Admin Env Limit Definitions */
  getEnvEnvIdLimitDefinitions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLimitDefinitions", options);
  }

  /** Get Admin Env Limits */
  getEnvEnvIdLimits<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLimits", options);
  }

  /** Get Env Limits Usage */
  getEnvEnvIdLimitsUsage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLimitsUsage", options);
  }

  /** Get Admin Env Log Streams */
  getEnvEnvIdLogStreams<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLogStreams", options);
  }

  /** Get V1 Env Log Streams */
  getEnvEnvIdLogStreams2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLogStreams2", options);
  }

  /** Get Env Log Streams Contract */
  getEnvEnvIdLogStreamsContract<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLogStreamsContract", options);
  }

  /** Get Env Log Streams Contract */
  getEnvEnvIdLogStreamsContract2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdLogStreamsContract2", options);
  }

  /** Get Admin Env Machine Identities */
  getEnvEnvIdMachineIdentities<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMachineIdentities", options);
  }

  /** Get Env Mcp Clients */
  getEnvEnvIdMcpClients<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpClients", options);
  }

  /** Get Env Mcp Clients */
  getEnvEnvIdMcpClientsClientId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpClientsClientId", options);
  }

  /** Get Mcp Clients Metadata */
  getEnvEnvIdMcpClientsClientIdMetadata<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpClientsClientIdMetadata", options);
  }

  /** Get Env Mcp Posture */
  getEnvEnvIdMcpPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpPosture", options);
  }

  /** Get Env Mcp Rollout Status */
  getEnvEnvIdMcpRolloutStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpRolloutStatus", options);
  }

  /** Get Env Mcp Servers */
  getEnvEnvIdMcpServers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpServers", options);
  }

  /** Get Env Mcp Servers */
  getEnvEnvIdMcpServersServerId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMcpServersServerId", options);
  }

  /** Get Admin Env Member Limits */
  getEnvEnvIdMemberLimits<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMemberLimits", options);
  }

  /** Get Admin Env Member Permissions */
  getEnvEnvIdMemberPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMemberPermissions", options);
  }

  /** Get Admin Env Member Restrictions */
  getEnvEnvIdMemberRestrictions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMemberRestrictions", options);
  }

  /** Get Env Mfa Policy */
  getEnvEnvIdMfaPolicy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdMfaPolicy", options);
  }

  /** Get Env Openid4vc Posture */
  getEnvEnvIdOpenid4vcPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOpenid4vcPosture", options);
  }

  /** Get Admin Env Organization */
  getEnvEnvIdOrganization<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOrganization", options);
  }

  /** Get Admin Env Organizations */
  getEnvEnvIdOrganizations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOrganizations", options);
  }

  /** Get Env Organizations Branding */
  getEnvEnvIdOrganizationsOrganizationIdBranding<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOrganizationsOrganizationIdBranding", options);
  }

  /** Get Env Orgs Entitlement Override */
  getEnvEnvIdOrgsOrgIdEntitlementOverride<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOrgsOrgIdEntitlementOverride", options);
  }

  /** Get Env Orgs Price Override */
  getEnvEnvIdOrgsOrgIdPriceOverride<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOrgsOrgIdPriceOverride", options);
  }

  /** Get Env Orgs Subscription */
  getEnvEnvIdOrgsOrgIdSubscription<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOrgsOrgIdSubscription", options);
  }

  /** Get Admin Env Overview */
  getEnvEnvIdOverview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdOverview", options);
  }

  /** Get Admin Env Passkeys */
  getEnvEnvIdPasskeys<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPasskeys", options);
  }

  /** Get Env Passkeys Stats */
  getEnvEnvIdPasskeysStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPasskeysStats", options);
  }

  /** Get Env Passkeys User */
  getEnvEnvIdPasskeysUserUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPasskeysUserUserId", options);
  }

  /** Get Admin Env Permissions */
  getEnvEnvIdPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPermissions", options);
  }

  /** Get Admin Env Permission Tree */
  getEnvEnvIdPermissionTree<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPermissionTree", options);
  }

  /** Get Admin Env Policies */
  getEnvEnvIdPolicies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPolicies", options);
  }

  /** Get Env Policies Conflicts */
  getEnvEnvIdPoliciesConflicts<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPoliciesConflicts", options);
  }

  /** Get Env Policies Custom Functions */
  getEnvEnvIdPoliciesCustomFunctions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPoliciesCustomFunctions", options);
  }

  /** Get Env Policies Diff */
  getEnvEnvIdPoliciesPolicyIdDiff<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPoliciesPolicyIdDiff", options);
  }

  /** Get Env Policies Subjects */
  getEnvEnvIdPoliciesPolicyIdSubjects<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPoliciesPolicyIdSubjects", options);
  }

  /** Get Env Policies Versions */
  getEnvEnvIdPoliciesPolicyIdVersions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPoliciesPolicyIdVersions", options);
  }

  /** Get Admin Env Policy Templates */
  getEnvEnvIdPolicyTemplates<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPolicyTemplates", options);
  }

  /** Get Env Pricing Billing Ops */
  getEnvEnvIdPricingBillingOps<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPricingBillingOps", options);
  }

  /** Get Env Pricing Catalog */
  getEnvEnvIdPricingCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPricingCatalog", options);
  }

  /** Get Env Pricing Context */
  getEnvEnvIdPricingContext<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdPricingContext", options);
  }

  /** Get Admin Env Product Governance */
  getEnvEnvIdProductGovernance<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdProductGovernance", options);
  }

  /** Get Admin Env Projects */
  getEnvEnvIdProjects<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdProjects", options);
  }

  /** Get Env Rag Decisions */
  getEnvEnvIdRagDecisions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagDecisions", options);
  }

  /** Get Env Rag Dossier */
  getEnvEnvIdRagDossier<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagDossier", options);
  }

  /** Get Env Rag Evaluations */
  getEnvEnvIdRagEvaluations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagEvaluations", options);
  }

  /** Get Env Rag Evaluations */
  getEnvEnvIdRagEvaluationsEvaluationId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagEvaluationsEvaluationId", options);
  }

  /** Get Env Rag Evidence */
  getEnvEnvIdRagEvidence<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagEvidence", options);
  }

  /** Get Env Rag Posture */
  getEnvEnvIdRagPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagPosture", options);
  }

  /** Get Env Rag Summary */
  getEnvEnvIdRagSummary<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRagSummary", options);
  }

  /** Get Env Recertification Campaigns */
  getEnvEnvIdRecertificationCampaigns<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRecertificationCampaigns", options);
  }

  /** Get Admin Env Relationships */
  getEnvEnvIdRelationships<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRelationships", options);
  }

  /** Get Env Relationships Accessible */
  getEnvEnvIdRelationshipsAccessible<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRelationshipsAccessible", options);
  }

  /** Get Env Relationships Changes */
  getEnvEnvIdRelationshipsChanges<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRelationshipsChanges", options);
  }

  /** Get Env Relationships Check */
  getEnvEnvIdRelationshipsCheck<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRelationshipsCheck", options);
  }

  /** Get Env Relationships Watch */
  getEnvEnvIdRelationshipsWatch<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRelationshipsWatch", options);
  }

  /** Get Env Reseller Catalog */
  getEnvEnvIdResellerCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdResellerCatalog", options);
  }

  /** Get Admin Env Resource Types */
  getEnvEnvIdResourceTypes<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdResourceTypes", options);
  }

  /** Get Env Resource Types Relations */
  getEnvEnvIdResourceTypesTypeIdRelations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdResourceTypesTypeIdRelations", options);
  }

  /** Get Admin Env Risk Scores */
  getEnvEnvIdRiskScores<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRiskScores", options);
  }

  /** Get Admin Env Role Assignments */
  getEnvEnvIdRoleAssignments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRoleAssignments", options);
  }

  /** Get Admin Env Role Constraints */
  getEnvEnvIdRoleConstraints<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRoleConstraints", options);
  }

  /** Get Env Role Constraints History */
  getEnvEnvIdRoleConstraintsHistory<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRoleConstraintsHistory", options);
  }

  /** Get Env Role Constraints Scan */
  getEnvEnvIdRoleConstraintsScan<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRoleConstraintsScan", options);
  }

  /** Get Admin Env Roles */
  getEnvEnvIdRoles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRoles", options);
  }

  /** Get Env Roles Compare */
  getEnvEnvIdRolesCompare<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRolesCompare", options);
  }

  /** Get Env Roles Permissions */
  getEnvEnvIdRolesRoleIdPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdRolesRoleIdPermissions", options);
  }

  /** Get Env Scim Config */
  getEnvEnvIdScimConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfig", options);
  }

  /** Get Admin Env Scim Configs */
  getEnvEnvIdScimConfigs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfigs", options);
  }

  /** Get Env Scim Configs Group Role Mappings */
  getEnvEnvIdScimConfigsConfigIdGroupRoleMappings<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfigsConfigIdGroupRoleMappings", options);
  }

  /** Get Env Scim Configs Groups */
  getEnvEnvIdScimConfigsConfigIdGroups<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfigsConfigIdGroups", options);
  }

  /** Get Env Scim Configs Logs */
  getEnvEnvIdScimConfigsConfigIdLogs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfigsConfigIdLogs", options);
  }

  /** Get Env Scim Configs Stats */
  getEnvEnvIdScimConfigsConfigIdStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfigsConfigIdStats", options);
  }

  /** Get Env Scim Configs Users */
  getEnvEnvIdScimConfigsConfigIdUsers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdScimConfigsConfigIdUsers", options);
  }

  /** Get Env Security Attack Stats */
  getEnvEnvIdSecurityAttackStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSecurityAttackStats", options);
  }

  /** Get Env Security Config */
  getEnvEnvIdSecurityConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSecurityConfig", options);
  }

  /** Get Env Security Device Trust */
  getEnvEnvIdSecurityDeviceTrust<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSecurityDeviceTrust", options);
  }

  /** Get Env Security Geo Blocking */
  getEnvEnvIdSecurityGeoBlocking<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSecurityGeoBlocking", options);
  }

  /** Get Env Security Ip Access */
  getEnvEnvIdSecurityIpAccess<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSecurityIpAccess", options);
  }

  /** Get Admin Env Session Logs */
  getEnvEnvIdSessionLogs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSessionLogs", options);
  }

  /** Get Admin Env Sessions */
  getEnvEnvIdSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSessions", options);
  }

  /** Get Admin Env Sessions */
  getEnvEnvIdSessionsSessionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSessionsSessionId", options);
  }

  /** Get Env Shadow Permissions Scan */
  getEnvEnvIdShadowPermissionsScan<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdShadowPermissionsScan", options);
  }

  /** Get Admin Env Siem Config */
  getEnvEnvIdSiemConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSiemConfig", options);
  }

  /** Get Admin Env Subscription Status */
  getEnvEnvIdSubscriptionStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdSubscriptionStatus", options);
  }

  /** Get Env Token Exchange Policies */
  getEnvEnvIdTokenExchangePolicies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdTokenExchangePolicies", options);
  }

  /** Get Env Token Exchanges */
  getEnvEnvIdTokenExchanges<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdTokenExchanges", options);
  }

  /** Get Admin Env Tool Catalog */
  getEnvEnvIdToolCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdToolCatalog", options);
  }

  /** Get Admin Env Trust Registry */
  getEnvEnvIdTrustRegistry<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdTrustRegistry", options);
  }

  /** Get Admin Env Trust Registry */
  getEnvEnvIdTrustRegistryEntryId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdTrustRegistryEntryId", options);
  }

  /** Get Admin Env Usage */
  getEnvEnvIdUsage<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsage", options);
  }

  /** Get Admin Env Usage Status */
  getEnvEnvIdUsageStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsageStatus", options);
  }

  /** Get Admin Env Users */
  getEnvEnvIdUsers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsers", options);
  }

  /** Get Env Users Export */
  getEnvEnvIdUsersExport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsersExport", options);
  }

  /** Get Admin Env Users */
  getEnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsersUserId", options);
  }

  /** Get Env Users Activity */
  getEnvEnvIdUsersUserIdActivity<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsersUserIdActivity", options);
  }

  /** Get Env Users Metadata */
  getEnvEnvIdUsersUserIdMetadata<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsersUserIdMetadata", options);
  }

  /** Get Env Users Roles */
  getEnvEnvIdUsersUserIdRoles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsersUserIdRoles", options);
  }

  /** Get Env Users Sessions */
  getEnvEnvIdUsersUserIdSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdUsersUserIdSessions", options);
  }

  /** Get Admin Env Verifiable Credentials */
  getEnvEnvIdVerifiableCredentials<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdVerifiableCredentials", options);
  }

  /** Get Admin Env Verifiable Credentials */
  getEnvEnvIdVerifiableCredentialsCredentialId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdVerifiableCredentialsCredentialId", options);
  }

  /** Get Env Verifiable Credentials Posture */
  getEnvEnvIdVerifiableCredentialsPosture<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdVerifiableCredentialsPosture", options);
  }

  /** Get Admin Env Visible Modules */
  getEnvEnvIdVisibleModules<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdVisibleModules", options);
  }

  /** Get Admin Env Webhooks */
  getEnvEnvIdWebhooks<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWebhooks", options);
  }

  /** Get Env Webhooks Dead Letters */
  getEnvEnvIdWebhooksWebhookIdDeadLetters<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWebhooksWebhookIdDeadLetters", options);
  }

  /** Get Env Webhooks Logs */
  getEnvEnvIdWebhooksWebhookIdLogs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWebhooksWebhookIdLogs", options);
  }

  /** Get Webhooks Logs Export */
  getEnvEnvIdWebhooksWebhookIdLogsExport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWebhooksWebhookIdLogsExport", options);
  }

  /** Get Env Webhooks Stats */
  getEnvEnvIdWebhooksWebhookIdStats<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWebhooksWebhookIdStats", options);
  }

  /** Get Admin Env Workflows */
  getEnvEnvIdWorkflows<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWorkflows", options);
  }

  /** Get Admin Env Workforce Members */
  getEnvEnvIdWorkforceMembers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvEnvIdWorkforceMembers", options);
  }

  /** Get Environments Agent Bridge Shared Resources */
  getEnvironmentsEnvIdAgentBridgeSharedResources<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvironmentsEnvIdAgentBridgeSharedResources", options);
  }

  /** Get Admin Environments Hierarchy */
  getEnvironmentsEnvIdHierarchy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getEnvironmentsEnvIdHierarchy", options);
  }

  /** Get Admin */
  getFile<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getFile", options);
  }

  /** Get V1 Governance Verify */
  getGovernanceVerify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getGovernanceVerify", options);
  }

  /** Get Health */
  getHealth<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getHealth", options);
  }

  /** Shortlink impersonation URL */
  getI<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getI", options);
  }

  /** One-click impersonation URL (universal) */
  getImpersonate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getImpersonate", options);
  }

  /** Exchange an impersonation ticket for a session token */
  getImpersonationExchange<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getImpersonationExchange", options);
  }

  /** Check if current session is an impersonation session */
  getImpersonationStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getImpersonationStatus", options);
  }

  /** Get V1 Workspaces Regional Profile */
  getInternalWorkspacesRegionalProfile<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getInternalWorkspacesRegionalProfile", options);
  }

  /** Get Api V1 Me */
  getMe<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMe", options);
  }

  /** Get V1 Me Consents */
  getMeConsents<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMeConsents", options);
  }

  /** Get Admin Me Context */
  getMeContext<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMeContext", options);
  }

  /** Get Admin Members Permissions */
  getMembersUserIdPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMembersUserIdPermissions", options);
  }

  /** Get Metrics */
  getMetrics<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMetrics", options);
  }

  /** Get Metrics App */
  getMetricsApp<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMetricsApp", options);
  }

  /** List Push MFA Challenges */
  getMfaPushChallenges<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMfaPushChallenges", options);
  }

  /** Poll Push MFA Challenge Status */
  getMfaPushStatusChallengeId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMfaPushStatusChallengeId", options);
  }

  /** Get VAPID Public Key */
  getMfaPushVapidKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMfaPushVapidKey", options);
  }

  /** Get Api Admin My Hierarchy */
  getMyHierarchy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMyHierarchy", options);
  }

  /** Get Api Admin My Scopes */
  getMyScopes<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getMyScopes", options);
  }

  /** Get Oauth Authorize */
  getOauthAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOauthAuthorize", options);
  }

  /** Get Oauth Jwks.Json */
  getOauthJwksJson<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOauthJwksJson", options);
  }

  /** Get Oauth Userinfo */
  getOauthUserinfo<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOauthUserinfo", options);
  }

  /** Get Oidc Authorize */
  getOidcAuthorizeEnvIdConnectionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOidcAuthorizeEnvIdConnectionId", options);
  }

  /** Get Api Admin Organizations */
  getOrganizations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrganizations", options);
  }

  /** Get Admin Organizations Descendants */
  getOrganizationsIdDescendants<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrganizationsIdDescendants", options);
  }

  /** Get Admin Organizations Inventory */
  getOrganizationsIdInventory<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrganizationsIdInventory", options);
  }

  /** Get Api Admin Organizations */
  getOrganizationsOrgId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrganizationsOrgId", options);
  }

  /** Get Admin Organizations Default Environment */
  getOrganizationsOrgIdDefaultEnvironment<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrganizationsOrgIdDefaultEnvironment", options);
  }

  /** Get the tenant's customer-managed key status */
  getOrgCustomerKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgCustomerKey", options);
  }

  /** Get where an organization's data lives */
  getOrgDataResidency<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgDataResidency", options);
  }

  /** Get Org Oidc Callback */
  getOrgEnvIdOidcCallback<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgEnvIdOidcCallback", options);
  }

  /** Get Admin Org Data Isolation */
  getOrgOrgIdDataIsolation<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolation", options);
  }

  /** Get Org Data Isolation Activity */
  getOrgOrgIdDataIsolationActivity<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolationActivity", options);
  }

  /** Get Org Data Isolation Migrations */
  getOrgOrgIdDataIsolationMigrations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolationMigrations", options);
  }

  /** Get Org Data Isolation Operations */
  getOrgOrgIdDataIsolationOperations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolationOperations", options);
  }

  /** Get Data Isolation Operations Facets */
  getOrgOrgIdDataIsolationOperationsFacets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolationOperationsFacets", options);
  }

  /** Get Org Data Isolation Operations */
  getOrgOrgIdDataIsolationOperationsOperationId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolationOperationsOperationId", options);
  }

  /** Get Data Isolation Operations Replay Preview */
  getOrgOrgIdDataIsolationOperationsReplayPreview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getOrgOrgIdDataIsolationOperationsReplayPreview", options);
  }

  /** Get Api Admin Permissions */
  getPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPermissions", options);
  }

  /** Get Api Admin Plans */
  getPlans<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPlans", options);
  }

  /** Get Api Admin Policy Config */
  getPolicyConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPolicyConfig", options);
  }

  /** Validate Portal Token */
  getPortal<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPortal", options);
  }

  /** Get Admin Portal State */
  getPortalStateOrganizationId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPortalStateOrganizationId", options);
  }

  /** Get Api Admin Product Catalog */
  getProductCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getProductCatalog", options);
  }

  /** Get Admin Product Catalog Authorization */
  getProductCatalogProductKeyAuthorization<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getProductCatalogProductKeyAuthorization", options);
  }

  /** Get Admin Product Dependencies Graph */
  getProductDependenciesGraph<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getProductDependenciesGraph", options);
  }

  /** Get Admin Products Dependencies */
  getProductsProductKeyDependencies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getProductsProductKeyDependencies", options);
  }

  /** Get Admin Products Dependency Candidates */
  getProductsProductKeyDependencyCandidates<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getProductsProductKeyDependencyCandidates", options);
  }

  /** Get Api Public Auth Config */
  getPublicAuthConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPublicAuthConfig", options);
  }

  /** Get Api Public Health */
  getPublicHealth<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPublicHealth", options);
  }

  /** Get Public Invite Validate */
  getPublicInviteValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPublicInviteValidate", options);
  }

  /** Get Public Org Auth Config */
  getPublicOrgOrgSlugAuthConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPublicOrgOrgSlugAuthConfig", options);
  }

  /** Get Wordpress Handoff Finish */
  getPublicWordpressHandoffFinish<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getPublicWordpressHandoffFinish", options);
  }

  /** Get Ready */
  getReady<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getReady", options);
  }

  /** Get Platform Metadata */
  getRoot<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getRoot", options);
  }

  /** Get Admin */
  getRoot2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getRoot2", options);
  }

  /** SAML Single Logout Redirect */
  getSamlLogoutEnvironmentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getSamlLogoutEnvironmentId", options);
  }

  /** SAML SP Metadata */
  getSamlMetadataEnvironmentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getSamlMetadataEnvironmentId", options);
  }

  /** SAML SP-initiated SSO */
  getSamlSsoEnvironmentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getSamlSsoEnvironmentId", options);
  }

  /** Get V2 Env Groups */
  getScimV2EnvEnvIdGroups<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getScimV2EnvEnvIdGroups", options);
  }

  /** Get V2 Env Groups */
  getScimV2EnvEnvIdGroupsGroupId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getScimV2EnvEnvIdGroupsGroupId", options);
  }

  /** Get V2 Env Users */
  getScimV2EnvEnvIdUsers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getScimV2EnvEnvIdUsers", options);
  }

  /** Get V2 Env Users */
  getScimV2EnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getScimV2EnvEnvIdUsersUserId", options);
  }

  /** Get Api Sentry Test */
  getSentryTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getSentryTest", options);
  }

  /** Get Api Admin Trusted Origins */
  getTrustedOrigins<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getTrustedOrigins", options);
  }

  /** Get V1 User Export */
  getUserExport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getUserExport", options);
  }

  /** Get V1 User Sessions */
  getUserSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getUserSessions", options);
  }

  /** Get .Well Known Agent.Json */
  getWellKnownAgentJson<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWellKnownAgentJson", options);
  }

  /** Get .Well Known Oauth Protected Resource */
  getWellKnownOauthProtectedResource<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWellKnownOauthProtectedResource", options);
  }

  /** Get .Well Known Openid Configuration */
  getWellKnownOpenidConfiguration<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWellKnownOpenidConfiguration", options);
  }

  /** Get .Well Known Openid Credential Issuer */
  getWellKnownOpenidCredentialIssuer<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWellKnownOpenidCredentialIssuer", options);
  }

  /** Read a company operating unit */
  getWorkspaceOperatingUnit<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWorkspaceOperatingUnit", options);
  }

  /** Get Workspace Provisioning Status */
  getWorkspaceProvisioningStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWorkspaceProvisioningStatus", options);
  }

  /** Get Admin Workspaces Products */
  getWorkspacesWorkspaceEnvIdProducts<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("getWorkspacesWorkspaceEnvIdProducts", options);
  }

  /** List company operating units */
  listWorkspaceOperatingUnits<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("listWorkspaceOperatingUnits", options);
  }

  /** Update V1 Workspace Saved Views */
  patchAccessWorkspaceSavedViewsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchAccessWorkspaceSavedViewsId", options);
  }

  /** Update Api Admin Applications */
  patchApplicationsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchApplicationsId", options);
  }

  /** Update Api Auth */
  patchAuthWildcard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchAuthWildcard", options);
  }

  /** Update Admin Env Agent Identities */
  patchEnvEnvIdAgentIdentitiesAgentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdAgentIdentitiesAgentId", options);
  }

  /** Update Admin Env Api Keys */
  patchEnvEnvIdApiKeysKeyId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdApiKeysKeyId", options);
  }

  /** Update Admin Env Applications */
  patchEnvEnvIdApplicationsAppId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdApplicationsAppId", options);
  }

  /** Update Env Catalog Addons */
  patchEnvEnvIdCatalogAddonsCodeVersion<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdCatalogAddonsCodeVersion", options);
  }

  /** Update Env Catalog Features */
  patchEnvEnvIdCatalogFeaturesLookupKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdCatalogFeaturesLookupKey", options);
  }

  /** Update Env Catalog Meters */
  patchEnvEnvIdCatalogMetersMeterCode<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdCatalogMetersMeterCode", options);
  }

  /** Update Env Catalog Plans */
  patchEnvEnvIdCatalogPlansCodeVersion<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdCatalogPlansCodeVersion", options);
  }

  /** Update Env Catalog Prices */
  patchEnvEnvIdCatalogPricesId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdCatalogPricesId", options);
  }

  /** Update Admin Env Connections */
  patchEnvEnvIdConnectionsConnId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdConnectionsConnId", options);
  }

  /** Update Env Orgs Entitlement Override */
  patchEnvEnvIdOrgsOrgIdEntitlementOverrideId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdOrgsOrgIdEntitlementOverrideId", options);
  }

  /** Update Env Orgs Price Override */
  patchEnvEnvIdOrgsOrgIdPriceOverrideId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdOrgsOrgIdPriceOverrideId", options);
  }

  /** Update Admin Env Scim Configs */
  patchEnvEnvIdScimConfigsConfigId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdScimConfigsConfigId", options);
  }

  /** Deprovision SCIM configuration */
  patchEnvEnvIdScimConfigsConfigIdDeprovision<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdScimConfigsConfigIdDeprovision", options);
  }

  /** Update Admin Env Sessions */
  patchEnvEnvIdSessionsSessionId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdSessionsSessionId", options);
  }

  /** Update Admin Env Users */
  patchEnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdUsersUserId", options);
  }

  /** Update Env Users Env Role */
  patchEnvEnvIdUsersUserIdEnvRole<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdUsersUserIdEnvRole", options);
  }

  /** Update Admin Env Webhooks */
  patchEnvEnvIdWebhooksWebhookId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdWebhooksWebhookId", options);
  }

  /** Update Admin Env Workforce Members */
  patchEnvEnvIdWorkforceMembersId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvEnvIdWorkforceMembersId", options);
  }

  /** Update Api Admin Environments */
  patchEnvironmentsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchEnvironmentsId", options);
  }

  /** Update Api Admin Organizations */
  patchOrganizationsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchOrganizationsId", options);
  }

  /** Update Api Admin Projects */
  patchProjectsId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchProjectsId", options);
  }

  /** Update V2 Env Users */
  patchScimV2EnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchScimV2EnvEnvIdUsersUserId", options);
  }

  /** GDPR Art.16 — Right to Rectification */
  patchUserMeRectify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("patchUserMeRectify", options);
  }

  /** Create or execute Access V1 Decision */
  postAccessDecision<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAccessDecision", options);
  }

  /** Create or execute Workspace Regional Preview */
  postAccessWorkspaceRegionalPreview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAccessWorkspaceRegionalPreview", options);
  }

  /** Create or execute V1 Workspace Saved Views */
  postAccessWorkspaceSavedViews<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAccessWorkspaceSavedViews", options);
  }

  /** Create or execute V1 Workspace Sdui Documents */
  postAccessWorkspaceSduiDocuments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAccessWorkspaceSduiDocuments", options);
  }

  /** Create or execute Workspace Sdui Documents Publish */
  postAccessWorkspaceSduiDocumentsKeyPublish<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAccessWorkspaceSduiDocumentsKeyPublish", options);
  }

  /** Create or execute Admin Api Keys Batch Status */
  postApiKeysBatchStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postApiKeysBatchStatus", options);
  }

  /** Create or execute Admin Api Keys Validate */
  postApiKeysValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postApiKeysValidate", options);
  }

  /** Create or execute Admin Applications Environments */
  postApplicationsAppIdEnvironments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postApplicationsAppIdEnvironments", options);
  }

  /** Create or execute Auth Device Approve */
  postAuthDeviceApprove<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthDeviceApprove", options);
  }

  /** Create or execute Auth Device Session */
  postAuthDeviceSession<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthDeviceSession", options);
  }

  /** Create or execute Auth Device Start */
  postAuthDeviceStart<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthDeviceStart", options);
  }

  /** Create or execute Auth Device Token */
  postAuthDeviceToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthDeviceToken", options);
  }

  /** Stop auth impersonation */
  postAuthImpersonationStop<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthImpersonationStop", options);
  }

  /** Create or execute Api Auth Realtime Ticket */
  postAuthRealtimeTicket<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthRealtimeTicket", options);
  }

  /** Create or execute Api Auth */
  postAuthWildcard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postAuthWildcard", options);
  }

  /** Create or execute Commercial Bindings Archive */
  postCommercialBindingsBindingIdArchive<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postCommercialBindingsBindingIdArchive", options);
  }

  /** Suspend commercial product binding */
  postCommercialBindingsBindingIdSuspend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postCommercialBindingsBindingIdSuspend", options);
  }

  /** Create or execute Products Catalog Draft */
  postCommercialProductsProductKeyCatalogDraft<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postCommercialProductsProductKeyCatalogDraft", options);
  }

  /** Create or execute Products Catalog Publish */
  postCommercialProductsProductKeyCatalogPublish<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postCommercialProductsProductKeyCatalogPublish", options);
  }

  /** Create or execute Products Environments Create And Connect */
  postCommercialProductsProductKeyEnvironmentsCreateAndConnect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postCommercialProductsProductKeyEnvironmentsCreateAndConnect", options);
  }

  /** Create or execute Data Isolation Operations Replay */
  postDataIsolationOperationsOperationIdReplay<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDataIsolationOperationsOperationIdReplay", options);
  }

  /** Create or execute Data Isolation Operations Replay */
  postDataIsolationOperationsReplay<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDataIsolationOperationsReplay", options);
  }

  /** Create or execute Data Isolation Operations Replay By Query */
  postDataIsolationOperationsReplayByQuery<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDataIsolationOperationsReplayByQuery", options);
  }

  /** Create or execute Data Isolation Overview Refresh */
  postDataIsolationOverviewRefresh<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDataIsolationOverviewRefresh", options);
  }

  /** Create or execute Data Isolation Worklist Recover */
  postDataIsolationWorklistRecover<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDataIsolationWorklistRecover", options);
  }

  /** Create or execute Data Isolation Worklist Remediate */
  postDataIsolationWorklistRemediate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDataIsolationWorklistRemediate", options);
  }

  /** Create or execute Api V1 Decision */
  postDecision<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDecision", options);
  }

  /** Create or execute V1 Decision Batch */
  postDecisionBatch<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDecisionBatch", options);
  }

  /** Create or execute Api Admin Decisions */
  postDecisions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postDecisions", options);
  }

  /** Create or execute A2a Federation Negotiate */
  postEnvEnvIdA2aFederationNegotiate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aFederationNegotiate", options);
  }

  /** Create or execute A2a Federation Outbound Session */
  postEnvEnvIdA2aFederationOutboundSession<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aFederationOutboundSession", options);
  }

  /** Create or execute A2a Federation Partners */
  postEnvEnvIdA2aFederationPartners<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aFederationPartners", options);
  }

  /** Create or execute Env A2a Handshake */
  postEnvEnvIdA2aHandshake<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aHandshake", options);
  }

  /** Create or execute Env A2a Payments Authorize */
  postEnvEnvIdA2aPaymentsAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aPaymentsAuthorize", options);
  }

  /** Create or execute Env A2a Payments Settle */
  postEnvEnvIdA2aPaymentsTransactionIdSettle<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aPaymentsTransactionIdSettle", options);
  }

  /** Create or execute Env A2a Tasks */
  postEnvEnvIdA2aTasks<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aTasks", options);
  }

  /** Create or execute A2a Tasks Introspect */
  postEnvEnvIdA2aTasksIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aTasksIntrospect", options);
  }

  /** Create or execute A2a Tasks Complete */
  postEnvEnvIdA2aTasksTaskIdComplete<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdA2aTasksTaskIdComplete", options);
  }

  /** Create or execute Env Account Linking Auto */
  postEnvEnvIdAccountLinkingAuto<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAccountLinkingAuto", options);
  }

  /** Create or execute Env Account Linking Link Provider */
  postEnvEnvIdAccountLinkingLinkProvider<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAccountLinkingLinkProvider", options);
  }

  /** Create or execute Env Account Linking Manual */
  postEnvEnvIdAccountLinkingManual<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAccountLinkingManual", options);
  }

  /** Create or execute Env Account Linking Rollback */
  postEnvEnvIdAccountLinkingRollbackHistoryId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAccountLinkingRollbackHistoryId", options);
  }

  /** Activate agent governance kill switch */
  postEnvEnvIdAgentGovernanceKillSwitch<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentGovernanceKillSwitch", options);
  }

  /** Create or execute Admin Env Agent Identities */
  postEnvEnvIdAgentIdentities<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentIdentities", options);
  }

  /** Decommission agent identity */
  postEnvEnvIdAgentIdentitiesAgentIdDecommission<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentIdentitiesAgentIdDecommission", options);
  }

  /** Create or execute Env Agent Identities Reactivate */
  postEnvEnvIdAgentIdentitiesAgentIdReactivate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentIdentitiesAgentIdReactivate", options);
  }

  /** Suspend agent identity */
  postEnvEnvIdAgentIdentitiesAgentIdSuspend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentIdentitiesAgentIdSuspend", options);
  }

  /** Create or execute Agents Commerce Authorize */
  postEnvEnvIdAgentsAgentIdCommerceAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsAgentIdCommerceAuthorize", options);
  }

  /** Reject agent commerce transaction */
  postEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionIdReject<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionIdReject", options);
  }

  /** Create or execute Commerce Transactions Settle */
  postEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionIdSettle<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionIdSettle", options);
  }

  /** Create or execute Env Agents Verifiable Credentials */
  postEnvEnvIdAgentsAgentIdVerifiableCredentials<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsAgentIdVerifiableCredentials", options);
  }

  /** Create or execute Agents Ciba Requests */
  postEnvEnvIdAgentsCibaRequests<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsCibaRequests", options);
  }

  /** Create or execute Ciba Requests Approve */
  postEnvEnvIdAgentsCibaRequestsRequestIdApprove<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsCibaRequestsRequestIdApprove", options);
  }

  /** Expire agent CIBA request */
  postEnvEnvIdAgentsCibaRequestsRequestIdExpire<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsCibaRequestsRequestIdExpire", options);
  }

  /** Reject agent CIBA request */
  postEnvEnvIdAgentsCibaRequestsRequestIdReject<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsCibaRequestsRequestIdReject", options);
  }

  /** Create or execute Env Agents Delegations */
  postEnvEnvIdAgentsDelegations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsDelegations", options);
  }

  /** Create or execute Delegations Cross Org Introspect */
  postEnvEnvIdAgentsDelegationsCrossOrgIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsDelegationsCrossOrgIntrospect", options);
  }

  /** Create or execute Agents Delegations Cross Org Proof */
  postEnvEnvIdAgentsDelegationsGrantIdCrossOrgProof<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsDelegationsGrantIdCrossOrgProof", options);
  }

  /** Create or execute Agents Delegations Proof */
  postEnvEnvIdAgentsDelegationsGrantIdProof<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsDelegationsGrantIdProof", options);
  }

  /** Revoke agent delegation */
  postEnvEnvIdAgentsDelegationsGrantIdRevoke<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsDelegationsGrantIdRevoke", options);
  }

  /** Create or execute Delegations Proof Introspect */
  postEnvEnvIdAgentsDelegationsProofIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsDelegationsProofIntrospect", options);
  }

  /** Create or execute Env Agents Sessions */
  postEnvEnvIdAgentsSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsSessions", options);
  }

  /** Create or execute Agents Sessions Heartbeat */
  postEnvEnvIdAgentsSessionsSessionIdHeartbeat<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsSessionsSessionIdHeartbeat", options);
  }

  /** Create or execute Agents Sessions Resume */
  postEnvEnvIdAgentsSessionsSessionIdResume<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsSessionsSessionIdResume", options);
  }

  /** Create or execute Agents Sessions Revalidate */
  postEnvEnvIdAgentsSessionsSessionIdRevalidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsSessionsSessionIdRevalidate", options);
  }

  /** Suspend agent session */
  postEnvEnvIdAgentsSessionsSessionIdSuspend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsSessionsSessionIdSuspend", options);
  }

  /** Create or execute Agents Token Vault Credentials */
  postEnvEnvIdAgentsTokenVaultCredentials<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsTokenVaultCredentials", options);
  }

  /** Create or execute Token Vault Credentials Health */
  postEnvEnvIdAgentsTokenVaultCredentialsCredentialIdHealth<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsTokenVaultCredentialsCredentialIdHealth", options);
  }

  /** Revoke token-vault credential */
  postEnvEnvIdAgentsTokenVaultCredentialsCredentialIdRevoke<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsTokenVaultCredentialsCredentialIdRevoke", options);
  }

  /** Create or execute Agents Token Vault Proxy Token */
  postEnvEnvIdAgentsTokenVaultProxyToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsTokenVaultProxyToken", options);
  }

  /** Create or execute Token Vault Proxy Token Introspect */
  postEnvEnvIdAgentsTokenVaultProxyTokenIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAgentsTokenVaultProxyTokenIntrospect", options);
  }

  /** Create or execute Admin Env Api Keys */
  postEnvEnvIdApiKeys<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApiKeys", options);
  }

  /** Rotate API key */
  postEnvEnvIdApiKeysKeyIdRotate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApiKeysKeyIdRotate", options);
  }

  /** Create or execute Admin Env Applications */
  postEnvEnvIdApplications<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApplications", options);
  }

  /** Create or execute Admin Env Approvals */
  postEnvEnvIdApprovals<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovals", options);
  }

  /** Create or execute Env Approvals Advance */
  postEnvEnvIdApprovalsApprovalIdAdvance<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsApprovalIdAdvance", options);
  }

  /** Create or execute Env Approvals Approve */
  postEnvEnvIdApprovalsApprovalIdApprove<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsApprovalIdApprove", options);
  }

  /** Cancel approval */
  postEnvEnvIdApprovalsApprovalIdCancel<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsApprovalIdCancel", options);
  }

  /** Reject approval */
  postEnvEnvIdApprovalsApprovalIdReject<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsApprovalIdReject", options);
  }

  /** Reject approval step */
  postEnvEnvIdApprovalsApprovalIdRejectStep<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsApprovalIdRejectStep", options);
  }

  /** Create or execute Env Approvals Review */
  postEnvEnvIdApprovalsApprovalIdReview<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsApprovalIdReview", options);
  }

  /** Create or execute Env Approvals Multi Step */
  postEnvEnvIdApprovalsMultiStep<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalsMultiStep", options);
  }

  /** Create or execute Admin Env Approval Substitutes */
  postEnvEnvIdApprovalSubstitutes<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalSubstitutes", options);
  }

  /** Create or execute Env Approval Substitutes Check */
  postEnvEnvIdApprovalSubstitutesCheck<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalSubstitutesCheck", options);
  }

  /** Create or execute Admin Env Approval Workflows */
  postEnvEnvIdApprovalWorkflows<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdApprovalWorkflows", options);
  }

  /** Create or execute Env Audit Log Alerts */
  postEnvEnvIdAuditLogAlerts<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAuditLogAlerts", options);
  }

  /** Create or execute Env Authorization Model Validate */
  postEnvEnvIdAuthorizationModelValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAuthorizationModelValidate", options);
  }

  /** Create or execute V1 Env Authorize */
  postEnvEnvIdAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAuthorize", options);
  }

  /** Create or execute Env Authorize Batch */
  postEnvEnvIdAuthorizeBatch<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdAuthorizeBatch", options);
  }

  /** Create or execute Admin Env Branding */
  postEnvEnvIdBranding<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdBranding", options);
  }

  /** Create or execute Env Branding Template Catalog */
  postEnvEnvIdBrandingTemplateCatalog<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdBrandingTemplateCatalog", options);
  }

  /** Create or execute Env Branding Widgets */
  postEnvEnvIdBrandingWidgets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdBrandingWidgets", options);
  }

  /** Unlock brute-force protection */
  postEnvEnvIdBruteForceUnlock<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdBruteForceUnlock", options);
  }

  /** Create or execute Env Capabilities Changed */
  postEnvEnvIdCapabilitiesChanged<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCapabilitiesChanged", options);
  }

  /** Create or execute Env Catalog Addon Features */
  postEnvEnvIdCatalogAddonFeatures<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogAddonFeatures", options);
  }

  /** Create or execute Env Catalog Addons */
  postEnvEnvIdCatalogAddons<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogAddons", options);
  }

  /** Create or execute Env Catalog Approval Requests */
  postEnvEnvIdCatalogApprovalRequests<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogApprovalRequests", options);
  }

  /** Create or execute Env Catalog Experiments */
  postEnvEnvIdCatalogExperiments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogExperiments", options);
  }

  /** Create or execute Env Catalog Features */
  postEnvEnvIdCatalogFeatures<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogFeatures", options);
  }

  /** Create or execute Env Catalog Meters */
  postEnvEnvIdCatalogMeters<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogMeters", options);
  }

  /** Create or execute Env Catalog Overlays */
  postEnvEnvIdCatalogOverlays<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogOverlays", options);
  }

  /** Create or execute Env Catalog Plan Features */
  postEnvEnvIdCatalogPlanFeatures<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogPlanFeatures", options);
  }

  /** Create or execute Env Catalog Plans */
  postEnvEnvIdCatalogPlans<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogPlans", options);
  }

  /** Create or execute Env Catalog Prices */
  postEnvEnvIdCatalogPrices<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogPrices", options);
  }

  /** Create or execute Env Catalog Publish */
  postEnvEnvIdCatalogPublish<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogPublish", options);
  }

  /** Create or execute Env Catalog Rollback */
  postEnvEnvIdCatalogRollback<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogRollback", options);
  }

  /** Create or execute Env Catalog Seed */
  postEnvEnvIdCatalogSeed<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCatalogSeed", options);
  }

  /** Create or execute Admin Env Conditional Assignments */
  postEnvEnvIdConditionalAssignments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConditionalAssignments", options);
  }

  /** Create or execute Env Conditional Assignments Dry Run */
  postEnvEnvIdConditionalAssignmentsDryRun<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConditionalAssignmentsDryRun", options);
  }

  /** Create or execute Env Conditional Assignments Evaluate */
  postEnvEnvIdConditionalAssignmentsEvaluate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConditionalAssignmentsEvaluate", options);
  }

  /** Create or execute Connected Application Agent Authorize */
  postEnvEnvIdConnectedApplicationAgentAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectedApplicationAgentAuthorize", options);
  }

  /** Create or execute Connected Application Atlas Authorize */
  postEnvEnvIdConnectedApplicationAtlasAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectedApplicationAtlasAuthorize", options);
  }

  /** Create or execute Connected Application Atlas Authorize Execution */
  postEnvEnvIdConnectedApplicationAtlasAuthorizeExecution<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectedApplicationAtlasAuthorizeExecution", options);
  }

  /** Create or execute Connected Application Content Authorize */
  postEnvEnvIdConnectedApplicationContentAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectedApplicationContentAuthorize", options);
  }

  /** Create or execute Env Connected Applications Install */
  postEnvEnvIdConnectedApplicationsInstall<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectedApplicationsInstall", options);
  }

  /** Create or execute Connected Application Tables Authorize */
  postEnvEnvIdConnectedApplicationTablesAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectedApplicationTablesAuthorize", options);
  }

  /** Create or execute Admin Env Connections */
  postEnvEnvIdConnections<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnections", options);
  }

  /** Reset identity-provider connection */
  postEnvEnvIdConnectionsConnIdReset<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectionsConnIdReset", options);
  }

  /** Create or execute Env Connections Test */
  postEnvEnvIdConnectionsConnIdTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectionsConnIdTest", options);
  }

  /** Sync auth providers from another environment */
  postEnvEnvIdConnectionsSyncFromEnv<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConnectionsSyncFromEnv", options);
  }

  /** Create or execute Env Consistency Token Validate */
  postEnvEnvIdConsistencyTokenValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdConsistencyTokenValidate", options);
  }

  /** Create or execute Admin Env Credentials */
  postEnvEnvIdCredentials<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCredentials", options);
  }

  /** Create or execute Env Credentials Grants */
  postEnvEnvIdCredentialsCredentialIdGrants<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCredentialsCredentialIdGrants", options);
  }

  /** Create or execute Oauth Google Start */
  postEnvEnvIdCredentialsOauthGoogleStart<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdCredentialsOauthGoogleStart", options);
  }

  /** Create or execute Data Isolation Operations Replay */
  postEnvEnvIdDataIsolationOperationsOperationIdReplay<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDataIsolationOperationsOperationIdReplay", options);
  }

  /** Create or execute Data Isolation Operations Replay */
  postEnvEnvIdDataIsolationOperationsReplay<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDataIsolationOperationsReplay", options);
  }

  /** Create or execute Data Isolation Operations Replay By Query */
  postEnvEnvIdDataIsolationOperationsReplayByQuery<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDataIsolationOperationsReplayByQuery", options);
  }

  /** Create or execute Env Data Isolation Refresh */
  postEnvEnvIdDataIsolationRefresh<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDataIsolationRefresh", options);
  }

  /** Create or execute Env Decision Log Cleanup */
  postEnvEnvIdDecisionLogCleanup<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDecisionLogCleanup", options);
  }

  /** Create or execute Admin Env Delegations */
  postEnvEnvIdDelegations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDelegations", options);
  }

  /** Create or execute Env Delegations Extend */
  postEnvEnvIdDelegationsDelegIdExtend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDelegationsDelegIdExtend", options);
  }

  /** Create or execute Env Delegations Validate */
  postEnvEnvIdDelegationsDelegIdValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDelegationsDelegIdValidate", options);
  }

  /** Create or execute Env Delegations Scoped */
  postEnvEnvIdDelegationsScoped<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDelegationsScoped", options);
  }

  /** Create or execute Env Delegations With Approval */
  postEnvEnvIdDelegationsWithApproval<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDelegationsWithApproval", options);
  }

  /** Create or execute Env Devices Trust */
  postEnvEnvIdDevicesDeviceIdTrust<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDevicesDeviceIdTrust", options);
  }

  /** Create or execute Env Devices Trust Status */
  postEnvEnvIdDevicesDeviceIdTrustStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDevicesDeviceIdTrustStatus", options);
  }

  /** Create or execute Admin Env Domains */
  postEnvEnvIdDomains<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDomains", options);
  }

  /** Create or execute Env Domains Refresh */
  postEnvEnvIdDomainsDomainIdRefresh<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDomainsDomainIdRefresh", options);
  }

  /** Create or execute Env Domains Verify */
  postEnvEnvIdDomainsDomainIdVerify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDomainsDomainIdVerify", options);
  }

  /** Create or execute Env Domains Verify Observed */
  postEnvEnvIdDomainsDomainIdVerifyObserved<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdDomainsDomainIdVerifyObserved", options);
  }

  /** Create or execute Admin Env Email Config */
  postEnvEnvIdEmailConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdEmailConfig", options);
  }

  /** Create or execute Admin Env Email Templates */
  postEnvEnvIdEmailTemplates<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdEmailTemplates", options);
  }

  /** Create or execute Admin Env Flows */
  postEnvEnvIdFlows<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdFlows", options);
  }

  /** Create or execute Admin Env Groups */
  postEnvEnvIdGroups<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdGroups", options);
  }

  /** Create or execute Env Groups Dynamic Rules */
  postEnvEnvIdGroupsDynamicRules<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdGroupsDynamicRules", options);
  }

  /** Create or execute Env Groups Members */
  postEnvEnvIdGroupsGroupIdMembers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdGroupsGroupIdMembers", options);
  }

  /** Create or execute Env Groups Roles */
  postEnvEnvIdGroupsGroupIdRoles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdGroupsGroupIdRoles", options);
  }

  /** Create or execute Env Impersonate Start */
  postEnvEnvIdImpersonateStart<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonateStart", options);
  }

  /** Stop admin impersonation */
  postEnvEnvIdImpersonateStop<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonateStop", options);
  }

  /** Create an actor token to impersonate a user */
  postEnvEnvIdImpersonationActorTokens<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonationActorTokens", options);
  }

  /** Consume an actor token and create an impersonation session */
  postEnvEnvIdImpersonationAuthenticate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonationAuthenticate", options);
  }

  /** Stop impersonation */
  postEnvEnvIdImpersonationStop<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonationStop", options);
  }

  /** Stop current impersonation */
  postEnvEnvIdImpersonationStopCurrent<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonationStopCurrent", options);
  }

  /** Test webhook delivery */
  postEnvEnvIdImpersonationTestWebhook<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdImpersonationTestWebhook", options);
  }

  /** Create or execute Env Integrations Email */
  postEnvEnvIdIntegrationsEmail<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdIntegrationsEmail", options);
  }

  /** Create or execute Integrations Email Test */
  postEnvEnvIdIntegrationsEmailTestProviderId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdIntegrationsEmailTestProviderId", options);
  }

  /** Create or execute Env Integrations Sms */
  postEnvEnvIdIntegrationsSms<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdIntegrationsSms", options);
  }

  /** Create or execute Integrations Sms Test */
  postEnvEnvIdIntegrationsSmsTestProviderId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdIntegrationsSmsTestProviderId", options);
  }

  /** Create or execute Admin Env Limit Definitions */
  postEnvEnvIdLimitDefinitions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLimitDefinitions", options);
  }

  /** Create or execute Admin Env Limits */
  postEnvEnvIdLimits<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLimits", options);
  }

  /** Create or execute Env Limits Assign */
  postEnvEnvIdLimitsAssign<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLimitsAssign", options);
  }

  /** Create or execute Env Limits Overrides */
  postEnvEnvIdLimitsLimitIdOverrides<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLimitsLimitIdOverrides", options);
  }

  /** Reset environment limits */
  postEnvEnvIdLimitsReset<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLimitsReset", options);
  }

  /** Create or execute Admin Env Log Streams */
  postEnvEnvIdLogStreams<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreams", options);
  }

  /** Create or execute V1 Env Log Streams */
  postEnvEnvIdLogStreams2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreams2", options);
  }

  /** Rotate admin log-stream secret */
  postEnvEnvIdLogStreamsStreamIdRotateSecret<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreamsStreamIdRotateSecret", options);
  }

  /** Rotate log-stream secret */
  postEnvEnvIdLogStreamsStreamIdRotateSecret2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreamsStreamIdRotateSecret2", options);
  }

  /** Create or execute Env Log Streams Test */
  postEnvEnvIdLogStreamsStreamIdTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreamsStreamIdTest", options);
  }

  /** Create or execute Env Log Streams Test */
  postEnvEnvIdLogStreamsStreamIdTest2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreamsStreamIdTest2", options);
  }

  /** Create or execute Env Log Streams Validate */
  postEnvEnvIdLogStreamsValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreamsValidate", options);
  }

  /** Create or execute Env Log Streams Validate */
  postEnvEnvIdLogStreamsValidate2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdLogStreamsValidate2", options);
  }

  /** Create or execute Env Mcp Authorize Tool */
  postEnvEnvIdMcpAuthorizeTool<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMcpAuthorizeTool", options);
  }

  /** Create or execute Mcp Clients Register */
  postEnvEnvIdMcpClientsRegister<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMcpClientsRegister", options);
  }

  /** Create or execute Env Mcp Servers */
  postEnvEnvIdMcpServers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMcpServers", options);
  }

  /** Create or execute Mcp Servers Enforcement Check */
  postEnvEnvIdMcpServersServerIdEnforcementCheck<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMcpServersServerIdEnforcementCheck", options);
  }

  /** Create or execute Env Mcp Token */
  postEnvEnvIdMcpToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMcpToken", options);
  }

  /** Create or execute Mcp Token Introspect */
  postEnvEnvIdMcpTokenIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMcpTokenIntrospect", options);
  }

  /** Create or execute Admin Env Member Limits */
  postEnvEnvIdMemberLimits<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMemberLimits", options);
  }

  /** Create or execute Admin Env Member Permissions */
  postEnvEnvIdMemberPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMemberPermissions", options);
  }

  /** Create or execute Admin Env Member Restrictions */
  postEnvEnvIdMemberRestrictions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdMemberRestrictions", options);
  }

  /** Create or execute Env Oidc Test */
  postEnvEnvIdOidcTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOidcTest", options);
  }

  /** Create or execute Env Openid4vc Credential */
  postEnvEnvIdOpenid4vcCredential<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcCredential", options);
  }

  /** Create or execute Env Openid4vc Credential Offers */
  postEnvEnvIdOpenid4vcCredentialOffers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcCredentialOffers", options);
  }

  /** Create or execute Env Openid4vc Deferred Credential */
  postEnvEnvIdOpenid4vcDeferredCredential<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcDeferredCredential", options);
  }

  /** Create or execute Env Openid4vc Verify Presentation */
  postEnvEnvIdOpenid4vcVerifyPresentation<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcVerifyPresentation", options);
  }

  /** Create or execute Env Openid4vc Wallet Sessions */
  postEnvEnvIdOpenid4vcWalletSessions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcWalletSessions", options);
  }

  /** Create or execute Openid4vc Wallet Sessions Complete */
  postEnvEnvIdOpenid4vcWalletSessionsComplete<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcWalletSessionsComplete", options);
  }

  /** Create or execute Openid4vc Wallet Sessions Introspect */
  postEnvEnvIdOpenid4vcWalletSessionsIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOpenid4vcWalletSessionsIntrospect", options);
  }

  /** Create or execute Env Organizations Branding */
  postEnvEnvIdOrganizationsOrganizationIdBranding<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOrganizationsOrganizationIdBranding", options);
  }

  /** Create or execute Env Orgs Entitlement Override */
  postEnvEnvIdOrgsOrgIdEntitlementOverride<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOrgsOrgIdEntitlementOverride", options);
  }

  /** Create or execute Env Orgs Price Override */
  postEnvEnvIdOrgsOrgIdPriceOverride<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdOrgsOrgIdPriceOverride", options);
  }

  /** Create or execute Admin Env Permissions */
  postEnvEnvIdPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPermissions", options);
  }

  /** Create or execute Env Permissions Evaluate */
  postEnvEnvIdPermissionsEvaluate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPermissionsEvaluate", options);
  }

  /** Create or execute Admin Env Policies */
  postEnvEnvIdPolicies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPolicies", options);
  }

  /** Create or execute Env Policies Dry Run */
  postEnvEnvIdPoliciesDryRun<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPoliciesDryRun", options);
  }

  /** Create or execute Env Policies Revert */
  postEnvEnvIdPoliciesPolicyIdRevert<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPoliciesPolicyIdRevert", options);
  }

  /** Create or execute Env Policies Snapshot */
  postEnvEnvIdPoliciesPolicyIdSnapshot<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPoliciesPolicyIdSnapshot", options);
  }

  /** Create or execute Env Policies Subjects */
  postEnvEnvIdPoliciesPolicyIdSubjects<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPoliciesPolicyIdSubjects", options);
  }

  /** Create or execute Env Policies Toggle */
  postEnvEnvIdPoliciesPolicyIdToggle<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPoliciesPolicyIdToggle", options);
  }

  /** Create or execute Env Policies Test */
  postEnvEnvIdPoliciesTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPoliciesTest", options);
  }

  /** Create or execute Env Policy Templates Apply */
  postEnvEnvIdPolicyTemplatesTemplateIdApply<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPolicyTemplatesTemplateIdApply", options);
  }

  /** Generate Admin Portal Link */
  postEnvEnvIdPortal<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPortal", options);
  }

  /** Create or execute Pricing Catalog Publish */
  postEnvEnvIdPricingCatalogPublish<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPricingCatalogPublish", options);
  }

  /** Create or execute Pricing Catalog Register */
  postEnvEnvIdPricingCatalogRegister<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdPricingCatalogRegister", options);
  }

  /** Create or execute Env Product Governance Connect Agent */
  postEnvEnvIdProductGovernanceConnectAgent<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdProductGovernanceConnectAgent", options);
  }

  /** Create or execute Env Product Governance Materialize */
  postEnvEnvIdProductGovernanceMaterialize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdProductGovernanceMaterialize", options);
  }

  /** Sync governed product auth providers */
  postEnvEnvIdProductGovernanceSyncAuthProviders<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdProductGovernanceSyncAuthProviders", options);
  }

  /** Create or execute Admin Env Projects */
  postEnvEnvIdProjects<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdProjects", options);
  }

  /** Create or execute Admin Env Provision Ecosystem */
  postEnvEnvIdProvisionEcosystem<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdProvisionEcosystem", options);
  }

  /** Create or execute Rag Access Filter */
  postEnvEnvIdRagAccessFilter<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRagAccessFilter", options);
  }

  /** Create or execute Env Rag Field Access */
  postEnvEnvIdRagFieldAccess<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRagFieldAccess", options);
  }

  /** Create or execute Rag Field Access Apply */
  postEnvEnvIdRagFieldAccessApply<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRagFieldAccessApply", options);
  }

  /** Create or execute Env Rag Provenance */
  postEnvEnvIdRagProvenance<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRagProvenance", options);
  }

  /** Create or execute Rag Retrieve Consume */
  postEnvEnvIdRagRetrieveConsume<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRagRetrieveConsume", options);
  }

  /** Create or execute Rag Retrieve Evaluate */
  postEnvEnvIdRagRetrieveEvaluate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRagRetrieveEvaluate", options);
  }

  /** Create or execute Admin Env Rate Limit Policies */
  postEnvEnvIdRateLimitPolicies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRateLimitPolicies", options);
  }

  /** Create or execute Env Recertification Campaigns */
  postEnvEnvIdRecertificationCampaigns<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRecertificationCampaigns", options);
  }

  /** Create or execute Recertification Campaigns Run */
  postEnvEnvIdRecertificationCampaignsCampaignIdRun<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRecertificationCampaignsCampaignIdRun", options);
  }

  /** Create or execute Admin Env Relationships */
  postEnvEnvIdRelationships<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRelationships", options);
  }

  /** Create or execute Env Relationships Batch */
  postEnvEnvIdRelationshipsBatch<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRelationshipsBatch", options);
  }

  /** Create or execute Env Relationships Expand */
  postEnvEnvIdRelationshipsExpand<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRelationshipsExpand", options);
  }

  /** Create or execute Admin Env Reload Auth */
  postEnvEnvIdReloadAuth<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdReloadAuth", options);
  }

  /** Create or execute Env Replay Entitlements */
  postEnvEnvIdReplayEntitlements<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdReplayEntitlements", options);
  }

  /** Create or execute Env Reseller Assign */
  postEnvEnvIdResellerAssign<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdResellerAssign", options);
  }

  /** Create or execute Env Reseller Grant Product */
  postEnvEnvIdResellerGrantProduct<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdResellerGrantProduct", options);
  }

  /** Create or execute Admin Env Resource Types */
  postEnvEnvIdResourceTypes<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdResourceTypes", options);
  }

  /** Create or execute Env Resource Types Relations */
  postEnvEnvIdResourceTypesTypeIdRelations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdResourceTypesTypeIdRelations", options);
  }

  /** Create or execute Admin Env Role Assignments */
  postEnvEnvIdRoleAssignments<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRoleAssignments", options);
  }

  /** Create or execute Admin Env Role Constraints */
  postEnvEnvIdRoleConstraints<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRoleConstraints", options);
  }

  /** Create or execute Env Role Constraints Validate */
  postEnvEnvIdRoleConstraintsValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRoleConstraintsValidate", options);
  }

  /** Create or execute Admin Env Roles */
  postEnvEnvIdRoles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRoles", options);
  }

  /** Create or execute Env Roles Permissions */
  postEnvEnvIdRolesRoleIdPermissions<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRolesRoleIdPermissions", options);
  }

  /** Create or execute Env Roles Promote */
  postEnvEnvIdRolesRoleIdPromote<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRolesRoleIdPromote", options);
  }

  /** Rotate environment secret */
  postEnvEnvIdRotateSecret<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdRotateSecret", options);
  }

  /** Create or execute Admin Env Scim Configs */
  postEnvEnvIdScimConfigs<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdScimConfigs", options);
  }

  /** Create or execute Env Scim Configs Dry Run */
  postEnvEnvIdScimConfigsConfigIdDryRun<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdScimConfigsConfigIdDryRun", options);
  }

  /** Create or execute Env Scim Configs Group Role Mappings */
  postEnvEnvIdScimConfigsConfigIdGroupRoleMappings<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdScimConfigsConfigIdGroupRoleMappings", options);
  }

  /** Rotate SCIM token */
  postEnvEnvIdScimConfigsConfigIdRotateToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdScimConfigsConfigIdRotateToken", options);
  }

  /** Create or execute Env Scim Configs Test */
  postEnvEnvIdScimConfigsConfigIdTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdScimConfigsConfigIdTest", options);
  }

  /** Create or execute Env Secrets Migrate */
  postEnvEnvIdSecretsMigrate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSecretsMigrate", options);
  }

  /** Create or execute Env Security Ip Access */
  postEnvEnvIdSecurityIpAccess<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSecurityIpAccess", options);
  }

  /** Create or execute Admin Env Seed Rbac */
  postEnvEnvIdSeedRbac<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSeedRbac", options);
  }

  /** Create or execute Admin Env Session Policies */
  postEnvEnvIdSessionPolicies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSessionPolicies", options);
  }

  /** Create or execute Admin Env Siem Config */
  postEnvEnvIdSiemConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSiemConfig", options);
  }

  /** Create or execute Env Siem Config Test */
  postEnvEnvIdSiemConfigConfigIdTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSiemConfigConfigIdTest", options);
  }

  /** Create or execute Env Siem Config Test */
  postEnvEnvIdSiemConfigTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSiemConfigTest", options);
  }

  /** Create or execute Admin Env Simulate */
  postEnvEnvIdSimulate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdSimulate", options);
  }

  /** Create or execute Env Token Exchange */
  postEnvEnvIdTokenExchange<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdTokenExchange", options);
  }

  /** Create or execute Env Token Exchange Policies */
  postEnvEnvIdTokenExchangePolicies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdTokenExchangePolicies", options);
  }

  /** Create or execute Admin Env Trust Registry */
  postEnvEnvIdTrustRegistry<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdTrustRegistry", options);
  }

  /** Create or execute Env Trust Registry Status */
  postEnvEnvIdTrustRegistryEntryIdStatus<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdTrustRegistryEntryIdStatus", options);
  }

  /** Create or execute Admin Env Users */
  postEnvEnvIdUsers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsers", options);
  }

  /** Create or execute Env Users Import */
  postEnvEnvIdUsersImport<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersImport", options);
  }

  /** Ban user */
  postEnvEnvIdUsersUserIdBan<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdBan", options);
  }

  /** Force user password reset */
  postEnvEnvIdUsersUserIdForcePasswordReset<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdForcePasswordReset", options);
  }

  /** Reset user two-factor authentication */
  postEnvEnvIdUsersUserIdReset2fa<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdReset2fa", options);
  }

  /** Reset user password */
  postEnvEnvIdUsersUserIdResetPassword<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdResetPassword", options);
  }

  /** Create or execute Env Users Roles */
  postEnvEnvIdUsersUserIdRoles<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdRoles", options);
  }

  /** Create or execute Env Users Set Password */
  postEnvEnvIdUsersUserIdSetPassword<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdSetPassword", options);
  }

  /** Unban user */
  postEnvEnvIdUsersUserIdUnban<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdUsersUserIdUnban", options);
  }

  /** Revoke verifiable credential */
  postEnvEnvIdVerifiableCredentialsCredentialIdRevoke<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdVerifiableCredentialsCredentialIdRevoke", options);
  }

  /** Create or execute Env Verifiable Credentials Selective Disclosure */
  postEnvEnvIdVerifiableCredentialsCredentialIdSelectiveDisclosure<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdVerifiableCredentialsCredentialIdSelectiveDisclosure", options);
  }

  /** Create or execute Env Verifiable Credentials Verify */
  postEnvEnvIdVerifiableCredentialsVerify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdVerifiableCredentialsVerify", options);
  }

  /** Create or execute Admin Env Webhooks */
  postEnvEnvIdWebhooks<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWebhooks", options);
  }

  /** Create or execute Env Webhooks Bulk Toggle */
  postEnvEnvIdWebhooksBulkToggle<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWebhooksBulkToggle", options);
  }

  /** Create or execute Webhooks Logs Retry */
  postEnvEnvIdWebhooksWebhookIdLogsLogIdRetry<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWebhooksWebhookIdLogsLogIdRetry", options);
  }

  /** Rotate webhook secret */
  postEnvEnvIdWebhooksWebhookIdRotateSecret<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWebhooksWebhookIdRotateSecret", options);
  }

  /** Create or execute Env Webhooks Test */
  postEnvEnvIdWebhooksWebhookIdTest<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWebhooksWebhookIdTest", options);
  }

  /** Create or execute Admin Env Workflows */
  postEnvEnvIdWorkflows<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWorkflows", options);
  }

  /** Create or execute Admin Env Workforce Members */
  postEnvEnvIdWorkforceMembers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWorkforceMembers", options);
  }

  /** Create or execute Env Workforce Members Enable Login */
  postEnvEnvIdWorkforceMembersIdEnableLogin<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvEnvIdWorkforceMembersIdEnableLogin", options);
  }

  /** Create or execute Environments Agent Bridge Resource Shares */
  postEnvironmentsEnvIdAgentBridgeResourceShares<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvironmentsEnvIdAgentBridgeResourceShares", options);
  }

  /** Revoke agent bridge resource share */
  postEnvironmentsEnvIdAgentBridgeResourceSharesRevoke<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvironmentsEnvIdAgentBridgeResourceSharesRevoke", options);
  }

  /** Create or execute Admin Environments Verify Sk */
  postEnvironmentsEnvIdVerifySk<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postEnvironmentsEnvIdVerifySk", options);
  }

  /** Create or execute V1 Governance Token */
  postGovernanceToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postGovernanceToken", options);
  }

  /** Stop legacy impersonation */
  postImpersonationStop<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postImpersonationStop", options);
  }

  /** Create or execute V1 M2m Flow Message Grant */
  postM2mFlowMessageGrant<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postM2mFlowMessageGrant", options);
  }

  /** Create or execute M2m Token Introspect */
  postM2mTokenIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postM2mTokenIntrospect", options);
  }

  /** Create or execute Admin Maintenance Retention */
  postMaintenanceRetention<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMaintenanceRetention", options);
  }

  /** Approve Push MFA Challenge */
  postMfaPushApproveChallengeId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaPushApproveChallengeId", options);
  }

  /** Deny push MFA challenge */
  postMfaPushDenyChallengeId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaPushDenyChallengeId", options);
  }

  /** Retry Push MFA Challenge */
  postMfaPushRetryChallengeId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaPushRetryChallengeId", options);
  }

  /** Rotate push MFA VAPID keys */
  postMfaPushRotateVapid<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaPushRotateVapid", options);
  }

  /** Send Push MFA Challenge */
  postMfaPushSend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaPushSend", options);
  }

  /** Generate Recovery Codes */
  postMfaRecoveryCodesGenerate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaRecoveryCodesGenerate", options);
  }

  /** Verify & Consume Recovery Code */
  postMfaRecoveryCodesVerify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaRecoveryCodesVerify", options);
  }

  /** Send SMS OTP */
  postMfaSmsSend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaSmsSend", options);
  }

  /** Verify SMS OTP */
  postMfaSmsVerify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postMfaSmsVerify", options);
  }

  /** Create or execute Oauth Introspect */
  postOauthIntrospect<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOauthIntrospect", options);
  }

  /** Create or execute Oauth Par */
  postOauthPar<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOauthPar", options);
  }

  /** Create or execute V1 Oauth Token */
  postOauthToken<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOauthToken", options);
  }

  /** Create or execute Oauth Token */
  postOauthToken2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOauthToken2", options);
  }

  /** Create or execute Api Admin Organizations */
  postOrganizations<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrganizations", options);
  }

  /** Create or execute Admin Organizations Projects */
  postOrganizationsEnvIdProjects<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrganizationsEnvIdProjects", options);
  }

  /** Create or execute Admin Organizations Lifecycle */
  postOrganizationsIdLifecycle<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrganizationsIdLifecycle", options);
  }

  /** Create or execute Org Auth Discover */
  postOrgEnvIdAuthDiscover<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgEnvIdAuthDiscover", options);
  }

  /** Create or execute Auth Phone Send */
  postOrgEnvIdAuthPhoneSend<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgEnvIdAuthPhoneSend", options);
  }

  /** Create or execute Auth Phone Verify */
  postOrgEnvIdAuthPhoneVerify<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgEnvIdAuthPhoneVerify", options);
  }

  /** Create or execute Org Oidc Authorize */
  postOrgEnvIdOidcAuthorize<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgEnvIdOidcAuthorize", options);
  }

  /** Create or execute Data Isolation Migrations Run */
  postOrgOrgIdDataIsolationMigrationsRun<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationMigrationsRun", options);
  }

  /** Create or execute Data Isolation Operations Replay */
  postOrgOrgIdDataIsolationOperationsOperationIdReplay<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationOperationsOperationIdReplay", options);
  }

  /** Create or execute Data Isolation Operations Replay */
  postOrgOrgIdDataIsolationOperationsReplay<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationOperationsReplay", options);
  }

  /** Create or execute Data Isolation Operations Replay By Query */
  postOrgOrgIdDataIsolationOperationsReplayByQuery<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationOperationsReplayByQuery", options);
  }

  /** Create or execute Org Data Isolation Provision */
  postOrgOrgIdDataIsolationProvision<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationProvision", options);
  }

  /** Create or execute Org Data Isolation Recover */
  postOrgOrgIdDataIsolationRecover<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationRecover", options);
  }

  /** Create or execute Org Data Isolation Refresh */
  postOrgOrgIdDataIsolationRefresh<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationRefresh", options);
  }

  /** Create or execute Org Data Isolation Remediate */
  postOrgOrgIdDataIsolationRemediate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationRemediate", options);
  }

  /** Create or execute Org Data Isolation Validate */
  postOrgOrgIdDataIsolationValidate<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postOrgOrgIdDataIsolationValidate", options);
  }

  /** Create or execute Products Control Planes Bootstrap */
  postProductsControlPlanesBootstrap<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postProductsControlPlanesBootstrap", options);
  }

  /** Create or execute Admin Products Control Plane */
  postProductsProductKeyControlPlane<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postProductsProductKeyControlPlane", options);
  }

  /** Create or execute Admin Projects Applications */
  postProjectsProjectIdApplications<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postProjectsProjectIdApplications", options);
  }

  /** Create or execute Public Invite Accept */
  postPublicInviteAccept<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postPublicInviteAccept", options);
  }

  /** Create or execute Wordpress Handoff Exchange */
  postPublicWordpressHandoffExchange<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postPublicWordpressHandoffExchange", options);
  }

  /** Create or execute Wordpress Oauth Exchange */
  postPublicWordpressOauthExchange<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postPublicWordpressOauthExchange", options);
  }

  /** Create or execute Wordpress Oauth Start */
  postPublicWordpressOauthStart<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postPublicWordpressOauthStart", options);
  }

  /** SAML ACS — Assertion Consumer Service */
  postSamlAcsEnvironmentId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postSamlAcsEnvironmentId", options);
  }

  /** Create or execute V2 Env Groups */
  postScimV2EnvEnvIdGroups<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postScimV2EnvEnvIdGroups", options);
  }

  /** Create or execute V2 Env Users */
  postScimV2EnvEnvIdUsers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postScimV2EnvEnvIdUsers", options);
  }

  /** Create or execute Api Admin Trusted Origins */
  postTrustedOrigins<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postTrustedOrigins", options);
  }

  /** GDPR Art.17 — Right to Erasure */
  postUserMeErase<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postUserMeErase", options);
  }

  /** Revoke all other sessions */
  postUserSessionsRevokeAllOthers<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postUserSessionsRevokeAllOthers", options);
  }

  /** Webhook receiver for impersonation events */
  postWebhooksImpersonation<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postWebhooksImpersonation", options);
  }

  /** Create or execute Workspaces Products Connect Env */
  postWorkspacesWorkspaceEnvIdProductsProductKeyConnectEnv<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postWorkspacesWorkspaceEnvIdProductsProductKeyConnectEnv", options);
  }

  /** Create or execute Workspaces Products Disconnect Env */
  postWorkspacesWorkspaceEnvIdProductsProductKeyDisconnectEnv<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postWorkspacesWorkspaceEnvIdProductsProductKeyDisconnectEnv", options);
  }

  /** Create or execute Admin Workspaces Provision User */
  postWorkspacesWorkspaceEnvIdProvisionUser<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("postWorkspacesWorkspaceEnvIdProvisionUser", options);
  }

  /** Replace Workspace Layouts Current */
  putAccessWorkspaceLayoutsCurrent<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putAccessWorkspaceLayoutsCurrent", options);
  }

  /** Replace V1 Workspace Preferences */
  putAccessWorkspacePreferences<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putAccessWorkspacePreferences", options);
  }

  /** Replace V1 Workspace Regional */
  putAccessWorkspaceRegional<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putAccessWorkspaceRegional", options);
  }

  /** Replace Admin Applications Dependencies */
  putApplicationsAppIdDependencies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putApplicationsAppIdDependencies", options);
  }

  /** Replace Api Auth */
  putAuthWildcard<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putAuthWildcard", options);
  }

  /** Replace Env Account Linking Config */
  putEnvEnvIdAccountLinkingConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdAccountLinkingConfig", options);
  }

  /** Replace Env Account Linking Trust Levels */
  putEnvEnvIdAccountLinkingTrustLevels<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdAccountLinkingTrustLevels", options);
  }

  /** Replace Env Agency Guardrails */
  putEnvEnvIdAgencyGuardrails<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdAgencyGuardrails", options);
  }

  /** Replace Admin Env Approval Workflows */
  putEnvEnvIdApprovalWorkflowsWfId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdApprovalWorkflowsWfId", options);
  }

  /** Replace Admin Env Authorization Model */
  putEnvEnvIdAuthorizationModel<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdAuthorizationModel", options);
  }

  /** Replace Env Branding Template Catalog */
  putEnvEnvIdBrandingTemplateCatalogTemplateKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdBrandingTemplateCatalogTemplateKey", options);
  }

  /** Replace Env Branding Widgets */
  putEnvEnvIdBrandingWidgetsWidgetKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdBrandingWidgetsWidgetKey", options);
  }

  /** Replace Admin Env Breach Notification Config */
  putEnvEnvIdBreachNotificationConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdBreachNotificationConfig", options);
  }

  /** Replace Admin Env Connected Application */
  putEnvEnvIdConnectedApplication<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdConnectedApplication", options);
  }

  /** Replace Admin Env Connections */
  putEnvEnvIdConnectionsConnId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdConnectionsConnId", options);
  }

  /** Replace Admin Env Email Templates */
  putEnvEnvIdEmailTemplatesTemplateKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdEmailTemplatesTemplateKey", options);
  }

  /** Replace Env Gdpr Privacy Config */
  putEnvEnvIdGdprPrivacyConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdGdprPrivacyConfig", options);
  }

  /** Replace Admin Env Groups */
  putEnvEnvIdGroupsGroupId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdGroupsGroupId", options);
  }

  /** Update impersonation configuration for an organization */
  putEnvEnvIdImpersonationConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdImpersonationConfig", options);
  }

  /** Replace Integrations Providers Secrets */
  putEnvEnvIdIntegrationsProvidersProviderIdSecrets<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdIntegrationsProvidersProviderIdSecrets", options);
  }

  /** Replace Admin Env Limits */
  putEnvEnvIdLimitsLimitId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdLimitsLimitId", options);
  }

  /** Replace Admin Env Log Streams */
  putEnvEnvIdLogStreamsStreamId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdLogStreamsStreamId", options);
  }

  /** Replace V1 Env Log Streams */
  putEnvEnvIdLogStreamsStreamId2<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdLogStreamsStreamId2", options);
  }

  /** Replace Env Members Role */
  putEnvEnvIdMembersUserIdRole<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdMembersUserIdRole", options);
  }

  /** Replace Env Mfa Policy */
  putEnvEnvIdMfaPolicy<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdMfaPolicy", options);
  }

  /** Replace Env Orgs Subscription */
  putEnvEnvIdOrgsOrgIdSubscription<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdOrgsOrgIdSubscription", options);
  }

  /** Replace Admin Env Policies */
  putEnvEnvIdPoliciesPolicyId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdPoliciesPolicyId", options);
  }

  /** Replace Admin Env Roles */
  putEnvEnvIdRolesRoleId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdRolesRoleId", options);
  }

  /** Replace Env Scim Config */
  putEnvEnvIdScimConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdScimConfig", options);
  }

  /** Replace Env Security Config */
  putEnvEnvIdSecurityConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdSecurityConfig", options);
  }

  /** Replace Env Security Device Trust */
  putEnvEnvIdSecurityDeviceTrust<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdSecurityDeviceTrust", options);
  }

  /** Replace Env Security Geo Blocking */
  putEnvEnvIdSecurityGeoBlocking<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdSecurityGeoBlocking", options);
  }

  /** Replace Admin Env Siem Config */
  putEnvEnvIdSiemConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdSiemConfig", options);
  }

  /** Replace Admin Env Siem Config */
  putEnvEnvIdSiemConfigConfigId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdSiemConfigConfigId", options);
  }

  /** Replace Env Users Metadata */
  putEnvEnvIdUsersUserIdMetadata<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putEnvEnvIdUsersUserIdMetadata", options);
  }

  /** Replace Admin Organizations Org Quota */
  putOrganizationsIdOrgQuota<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putOrganizationsIdOrgQuota", options);
  }

  /** Replace Org Data Isolation Routing */
  putOrgOrgIdDataIsolationRouting<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putOrgOrgIdDataIsolationRouting", options);
  }

  /** Replace Api Admin Policy Config */
  putPolicyConfig<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putPolicyConfig", options);
  }

  /** Replace Admin Products Dependencies */
  putProductsProductKeyDependencies<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putProductsProductKeyDependencies", options);
  }

  /** Replace V2 Env Groups */
  putScimV2EnvEnvIdGroupsGroupId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putScimV2EnvEnvIdGroupsGroupId", options);
  }

  /** Replace V2 Env Users */
  putScimV2EnvEnvIdUsersUserId<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("putScimV2EnvEnvIdUsersUserId", options);
  }

  /** Register where an organization's data lives */
  registerOrgDataResidency<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("registerOrgDataResidency", options);
  }

  /** Repair credential projection */
  repairEnvEnvIdCredentialsCredentialIdProjection<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("repairEnvEnvIdCredentialsCredentialIdProjection", options);
  }

  /** Send an organization back to the shared database */
  retireOrgDataResidency<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("retireOrgDataResidency", options);
  }

  /** Revoke the customer key — irreversible */
  revokeOrgCustomerKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("revokeOrgCustomerKey", options);
  }

  /** Revoke a paired device */
  revokePairedDevice<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("revokePairedDevice", options);
  }

  /** Rename or reparent a company unit */
  updateWorkspaceOperatingUnit<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("updateWorkspaceOperatingUnit", options);
  }

  /** Check that the stored wrapped key still opens */
  verifyOrgCustomerKey<TResponse = unknown>(options: CustomyAccessGeneratedRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>("verifyOrgCustomerKey", options);
  }
}
