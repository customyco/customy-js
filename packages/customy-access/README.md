# @customyai/customy-access

Official SDK for **Customy Access** — Identity & Access Management.

One package, three entry points:

```bash
npm install @customyai/customy-access
```

## Quick Start

```tsx
import {
  CustomyProvider,
  resolveCustomyAccessClientConfig,
  useAuth,
  useUser,
} from "@customyai/customy-access/react";

function App() {
  const access = resolveCustomyAccessClientConfig(process.env);

  return (
    <CustomyProvider
      baseUrl={access.baseUrl}
      enableFetchInterceptor
      environmentId={access.environmentId}
      organizationSlug={access.organizationSlug}
      publishableKey={access.publishableKey}
    >
      <YourApp />
    </CustomyProvider>
  );
}

function LoginButton() {
  const { signInWithSocial, signInWithEmail } = useAuth();
  return <button onClick={() => signInWithSocial("google", { callbackURL: "/dashboard" })}>Sign in with Google</button>;
}

function NavBar() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  if (!isSignedIn) return <LoginButton />;
  return <button onClick={signOut}>Sign out {user?.name}</button>;
}
```

## Multi-Environment Setup

Browser apps should not hand-roll Customy Access URLs, OAuth redirects, cookie forwarding, or auth proxy logic. Use the SDK resolver and the SDK Next.js route handlers so local, staging, and production share the same contract.

```tsx
// app/providers.tsx
"use client";

import { CustomyProvider, resolveCustomyAccessClientConfig } from "@customyai/customy-access/react";

const access = resolveCustomyAccessClientConfig(process.env);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CustomyProvider
      baseUrl={access.baseUrl}
      enableFetchInterceptor
      environmentId={access.environmentId}
      organizationSlug={access.organizationSlug}
      publishableKey={access.publishableKey}
    >
      {children}
    </CustomyProvider>
  );
}
```

```ts
// app/api/auth/[...path]/route.ts
import { customyAuthProxyHandlers } from "@customyai/customy-access/nextjs";

export const runtime = "nodejs";

const handlers = customyAuthProxyHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
```

```ts
// app/api/auth/social-redirect/[provider]/route.ts
import { customySocialRedirectHandlers } from "@customyai/customy-access/nextjs";

export const runtime = "nodejs";

const handlers = customySocialRedirectHandlers();

export const GET = handlers.GET;
```

```ts
// app/api/auth/sign-out/route.ts
import { customySignOutHandlers } from "@customyai/customy-access/nextjs";

export const runtime = "nodejs";

const handlers = customySignOutHandlers();

export const POST = handlers.POST;
```

```env
# local / staging / prod differ only by env values
NEXT_PUBLIC_ACCESS_API_URL=https://access-api.customy.ai
NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_ACCESS_ENV_ID=env_...
NEXT_PUBLIC_ACCESS_ORG_SLUG=my-org
```

## Node.js / TypeScript SDK

```ts
import { CustomyAccess } from "@customyai/customy-access";

const customy = new CustomyAccess({
  baseUrl: "https://access.customy.ai",
  apiKey: process.env.CUSTOMY_ACCESS_API_KEY,
  environmentId: "env_123",
});

// typed resource clients
const { users } = await customy.users.list("env_123");
const connections = await customy.connections.list("env_123");
const testResult = await customy.connections.test("env_123", "conn_abc");
const roles = await customy.roles.list("env_123");
const history = await customy.impersonation.getHistory("org_123");
const matrix = await customy.capabilities.getMatrix("env_123", { userId: "user_456" });
const canUseBrowser = await customy.capabilities.canUseCapability("env_123", "api.browser_tasks", {
  userId: "user_456",
  accessMode: "write",
});
const bootstrap = await customy.capabilities.bootstrap("env_123", {
  userId: "user_456",
  capabilities: ["crm.contacts.write", "agent.execute"],
});

if (!bootstrap.canUseCapability("agent.execute")) {
  console.log(bootstrap.getCapability("agent.execute")?.reason);
}
```

**Available clients:** `hierarchy` · `connections` · `users` · `sessions` · `roles` · `policies` · `audit` · `bruteForce` · `impersonation` · `webhooks` · `mfa` · `branding` · `delegations` · `relationships` · `gdpr` · `accountLinking` · `tokenExchange` · `pushMfa` · `rateLimits` · `emailConfig` · `scim` · `m2m` · `logStreams` · `devices` · `organizations` · `health` · `capabilities`

Server-side product integrations can request an explicit token audience with
`m2m.getToken({ clientId, clientSecret, scopes, audience: "customy-content" })`.
Access still enforces the service key's allowed audiences and scopes. Keep the
credentials and token on the server; omitting `audience` preserves Access's
existing default and does not grant access to another product.

Server credentials are blocked in browser runtime by default. Use `publishableKey` and same-origin cookies in browser apps, or proxy privileged requests through a server route.

## Contract-Generated Client — `@customyai/customy-access/generated`

For full backend coverage, import the generated client. It is produced from the live Customy Access OpenAPI contract after the SDK contract gate passes.

```ts
import {
  CustomyAccessGeneratedClient,
  customyAccessOperations,
} from "@customyai/customy-access/generated";

const access = new CustomyAccessGeneratedClient({
  baseUrl: "https://access.customy.ai",
  apiKey: process.env.CUSTOMY_ACCESS_API_KEY,
  environmentId: "293755894137516032",
});

const readiness = await access.getDocsReadiness();

const users = await access.request("getEnvEnvIdUsers", {
  path: { envId: "293755894137516032" },
  query: { limit: 50 },
});

console.log(customyAccessOperations.length); // Full OpenAPI operation count.
```

Generation commands:

```bash
pnpm sdk:access:contract
pnpm sdk:access:generate
pnpm sdk:access:core:smoke
pnpm sdk:access:generated:smoke
pnpm sdk:access:wordpress:static
pnpm --filter @customyai/customy-access typecheck
pnpm --filter @customyai/customy-access build
```

The generated entry point is intentionally isolated from the React entry point so browser bundles do not pull the complete administrative API surface by accident.

### Production-Grade Transport Controls

Both the core SDK and generated client include the integration controls expected from a serious server-side SDK:

- Typed API errors include status, body, code, and `x-request-id`.
- Automatic retries are limited to GET, HEAD and OPTIONS, within the configured retry budget. POST, PUT, PATCH and DELETE are not replayed after network errors, truncated responses, timeouts or HTTP failures: the server may already have applied the operation.
- Application hook and JSON serialization errors are propagated without retrying. An idempotency header does not by itself prove server-side deduplication.
- The generated client accepts a request `signal`; cancellation stops in-flight work and retry backoff, preserves the caller's reason, and releases abort listeners. Per-attempt deadlines are cleared before backoff.
- `Retry-After` is respected.
- `Idempotency-Key` is attached automatically for mutating requests unless disabled with `autoIdempotencyKey: false`.
- Browser runtime blocks `apiKey`, `adminSecret`, `bearerToken`, and `sessionToken` by default.
- `hooks.beforeRequest`, `hooks.afterResponse`, and `hooks.onRetry` support observability without monkey-patching fetch.
- `core.paginate(...)` and `generated.paginate(...)` provide async iterators for paginated resources.

```ts
const access = new CustomyAccess({
  baseUrl: "https://access.customy.ai",
  apiKey: process.env.CUSTOMY_ACCESS_API_KEY,
  hooks: {
    afterResponse: ({ status, requestId }) => {
      console.log({ status, requestId });
    },
  },
});

for await (const user of access.core.paginate<User>("/api/admin/env/env_123/users", {
  itemsKey: "users",
  limit: 100,
})) {
  console.log(user.email);
}
```

## Capability Control Plane

```ts
const matrix = await customy.capabilities.getMatrix("env_123", { userId: "user_456" });
const decision = await customy.capabilities.check("env_123", "crm.contacts.write", { userId: "user_456" });
const modules = await customy.capabilities.listVisibleModules("env_123", { userId: "user_456" });
const usage = await customy.capabilities.getUsageStatus("env_123", {
  userId: "user_456",
  capability: "agent.execute",
});
const entitlements = await customy.capabilities.getEntitlements("env_123", {
  userId: "user_456",
});
const subscription = await customy.capabilities.getSubscriptionStatus("env_123");
const commercialUsage = await customy.capabilities.getCommercialUsage("env_123", {
  userId: "user_456",
});

console.log(entitlements.addOnCodes);
console.log(entitlements.entitlements.find((item) => item.capability === "access.sso")?.commerciallyIncludedVia);

if (decision.state === "requires_upgrade") {
  // show upgrade CTA
}
```

Helpers included:

- `isCapabilityStateAllowed`
- `isCapabilityDecisionAllowed`
- `getCapabilityFromMatrix`
- `getModuleFromMatrix`

High-level bootstrap included:

- `capabilities.bootstrap(envId, { userId, capabilities, includeUsage })`
- `capabilities.getEntitlements(envId, { userId })`
- `capabilities.getSubscriptionStatus(envId)`
- `capabilities.getCommercialUsage(envId, { userId, capability })`

That snapshot preloads `matrix`, `modules`, `usage`, and keyed capability decisions in a single SDK call path so apps do not need to orchestrate multiple requests manually.
The billing-aware surface complements it with commercial truth for the active tenant: subscription posture, plan + add-on inclusion, commercially included capabilities, and usage pressure ready for admin shells or product gating.

## React SDK — `@customyai/customy-access/react`

### Auth Methods

```tsx
const { signInWithSocial, signInWithEmail, signUp, signOut, setActiveOrganization } = useAuth();

// Social login (Google, GitHub, Apple, Microsoft, etc.)
signInWithSocial("google", { callbackURL: "/dashboard" });

// Email/password
const result = await signInWithEmail("user@example.com", "password", "/dashboard");
if (result.error) console.error(result.error);

// Sign up
const signup = await signUp("John", "john@example.com", "password");

// Multi-tenant org switching
await setActiveOrganization("org_abc");
```

### Hooks

| Hook | Returns |
|------|---------|
| `useAuth()` | `isSignedIn`, `signOut`, `signInWithSocial`, `signInWithEmail`, `signUp`, `setActiveOrganization` |
| `useUser()` | `user`, `isSignedIn`, `refetch` |
| `useSession()` | `data` (user + session), `isPending` |
| `useOrganization()` | `organization`, `membership` |
| `useSDK()` | Full `CustomyAccess` admin SDK instance |
| `useImpersonation()` | `isImpersonated`, `actor`, `stopImpersonation` |
| `useCapabilityMatrix()` | Resolved capability matrix for the active env |
| `useCapabilityDecision()` | Single capability decision |
| `useVisibleModules()` | Visible modules from Access |
| `useUsageStatus()` | Usage/limits status from Access |
| `useCapabilityBootstrap()` | Preloaded matrix + modules + usage + decisions |
| `useCapabilityLookup()` | Lookup helpers on top of the bootstrap snapshot |
| `useActiveCapabilitySummary()` | Friendly summary for dashboards/admin shells |
| `useCanUseCapability()` | Boolean helper for feature gating |
| `useCanAccessModule()` | Boolean helper for module gating |

### Zero-Boilerplate Capability Gating

```tsx
import {
  CapabilityGate,
  ModuleGate,
  useCapabilityBootstrap,
} from "@customyai/customy-access/react";

function SettingsPage() {
  const access = useCapabilityBootstrap({
    capabilities: ["crm.contacts.write", "agent.execute"],
  });

  if (access.isLoading) return <div>Loading access state...</div>;

  return (
    <ModuleGate moduleKey="crm" fallback={<div>CRM locked</div>}>
      <CapabilityGate
        capability="crm.contacts.write"
        fallback={<div>You can view contacts, but not edit them.</div>}
      >
        <button>Create contact</button>
      </CapabilityGate>
    </ModuleGate>
  );
}
```

The React hooks automatically reuse tenant headers from `CustomyProvider` (`x-env-id`, `x-environment-id`, `x-active-environment-id`) when `environmentId` is omitted, so most screens do not need to pass env context manually.

### Components

`CustomyProvider` · `SignInButton` · `SignOutButton` · `UserButton` · `ProtectedRoute` · `OrganizationSwitcher` · `ImpersonationBanner`

## Edge SDK — `@customyai/customy-access/edge`

```ts
import { createEdgeClient } from "@customyai/customy-access/edge";

const customy = createEdgeClient({ publishableKey: "pk_live_..." });

// Works in Vercel Edge, Cloudflare Workers, Deno Deploy
const { isValid, user } = await customy.verifySession(token);
```

## License

MIT © Customy
