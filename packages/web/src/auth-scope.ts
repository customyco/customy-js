/** Policy for an external application, not a Workspace tenant switcher. */
export interface FixedAuthScope {
    environmentId?: string;
    organizationSlug?: string;
    publishableKey?: string;
    publicOrigin?: string;
}

const aliases = {
    environmentId: ["envId", "env_id", "environmentId", "environment_id", "x-env-id", "x-environment-id", "x-active-environment-id"],
    organizationSlug: ["orgSlug", "org_slug", "orgId", "org_id", "organizationId", "organization_id", "x-org-id", "x-organization-id"],
    publishableKey: ["publishableKey", "publishable_key", "pk", "x-publishable-key"],
} as const;

export function fixedAuthScopeConfigured(scope: FixedAuthScope): boolean {
    if (!scope.environmentId || !scope.organizationSlug || !scope.publishableKey || !scope.publicOrigin) return false;
    try {
        const url = new URL(scope.publicOrigin);
        return url.origin === scope.publicOrigin && !url.username && !url.password
            && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
    } catch { return false; }
}

export function matchesFixedAuthScope(scope: FixedAuthScope, entries: Iterable<[string, unknown]>): boolean {
    for (const [key, value] of entries) {
        for (const [field, names] of Object.entries(aliases)) {
            if ((names as readonly string[]).includes(key) && value !== scope[field as keyof typeof aliases]) return false;
        }
        if (["callbackURL", "callbackUrl", "redirectTo"].includes(key)) {
            if (typeof value !== "string" || !scope.publicOrigin) return false;
            try { if (new URL(value, scope.publicOrigin).origin !== scope.publicOrigin) return false; }
            catch { return false; }
        }
    }
    return true;
}

/** sourceEnvironmentId is minted from the persisted session, never a projection. */
export function sessionMatchesFixedScope(value: unknown, environmentId: string): boolean {
    if (!value || typeof value !== "object") return false;
    const data = value as { user?: { id?: unknown }; session?: { userId?: unknown; environmentId?: unknown; sourceEnvironmentId?: unknown; expiresAt?: unknown }; act?: unknown };
    return typeof data.user?.id === "string" && !!data.user.id
        && data.session?.userId === data.user.id && data.session.environmentId === environmentId
        && data.session.sourceEnvironmentId === environmentId && !data.act
        && typeof data.session.expiresAt === "string" && Date.parse(data.session.expiresAt) > Date.now();
}
