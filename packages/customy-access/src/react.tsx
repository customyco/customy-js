"use client";

/**
 * @customyai/customy-access/react
 *
 * @deprecated Usa `@customyai/client/react`: este módulo reexporta sus hooks y
 * componentes (sesión same-origin, capacidades, organizaciones, cuentas
 * vinculadas). Solo conserva de 0.x lo que el paquete nuevo no trae:
 * `CustomyProvider` con `adminSecret` y `useSDK()`, que devuelve el cliente de
 * administración `CustomyAccess` (congelado en este paquete).
 *
 * @example
 * ```tsx
 * import { CustomyProvider, useAuth, useUser } from "@customyai/customy-access/react";
 *
 * function App() {
 *   return (
 *     <CustomyProvider baseUrl="https://access.customy.ai">
 *       <YourApp />
 *     </CustomyProvider>
 *   );
 * }
 * ```
 */

import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import {
    CustomyProvider as ClientProvider,
    type CustomyActor,
    type CustomyOrganization,
    type CustomySession,
    type CustomyUser,
    type ScopedAuthOptions,
    type SignInResult,
    type SocialSignInOptions,
} from "@customyai/client/react";
import { CustomyAccess } from "./index";
import { warnDeprecated } from "./deprecation";

export {
    type AccountLinkingConfig,
    type CapabilityBootstrapHookOptions,
    CapabilityGate,
    type CapabilityGateProps,
    type CapabilityMatrix,
    type CapabilityMatrixItem,
    type CapabilityMatrixModule,
    type CapabilityUsagePressureSummary,
    type CapabilityUsageStatus,
    type CustomyAccessClientConfig,
    type CustomyAccessClientEnv,
    type CustomyActor,
    type CustomyOrganization,
    type CustomySession,
    CustomySignIn,
    type CustomySignInProps,
    type CustomySocialProvider,
    type CustomyUser,
    ImpersonationBanner,
    type LinkBlockedResult,
    type LinkHistoryEntry,
    LinkProviderButton,
    type LinkResult,
    LinkedAccountsManager,
    type LinkedProvider,
    type LinkedProviderInfo,
    ModuleGate,
    type ModuleGateProps,
    OrganizationProfile,
    type OrganizationProfileProps,
    OrganizationSwitcher,
    Protect,
    type ProtectProps,
    ProtectedRoute,
    type RealtimeTicketResponse,
    type ScopedAuthOptions,
    SignInButton,
    type SignInResult,
    SignOutButton,
    SignedIn,
    SignedOut,
    type SocialSignInOptions,
    type SocialSignInUrlOptions,
    UserButton,
    type UserButtonProps,
    UserProfile,
    type UserProfileProps,
    createSocialSignInUrl,
    fetchRealtimeTicket,
    resolveCustomyAccessClientConfig,
    useAccountLinking,
    useActiveCapabilitySummary,
    useAuth,
    useCanAccessModule,
    useCanUseCapability,
    useCapabilityBootstrap,
    useCapabilityCommercialUsage,
    useCapabilityDecision,
    useCapabilityEntitlements,
    useCapabilityLookup,
    useCapabilityMatrix,
    useCapabilitySubscriptionStatus,
    useCustomyFetch,
    useImpersonation,
    useLinkedProviders,
    useOrganization,
    useSession,
    useUsageStatus,
    useUser,
    useVisibleModules,
    withAuth,
} from "@customyai/client/react";
export { CustomyAccess } from "./index";
export type { CustomyAccessConfig } from "./index";

export interface CustomyContextValue {
    /** Whether session state has been resolved (true once the first check completes) */
    isLoaded: boolean;
    /** Whether the user is currently signed in */
    isSignedIn: boolean;
    /** The signed-in user object (null when not authenticated) */
    user: CustomyUser | null;
    /** The current session object */
    session: CustomySession | null;
    /** The current organization (if organizationId was provided) */
    organization: CustomyOrganization | null;
    /** The impersonating admin info (null when not impersonated) */
    actor: CustomyActor | null;
    /** Whether this session is an impersonated session */
    isImpersonated: boolean;
    /** Dynamic tenancy headers injected into useCustomyFetch */
    tenantHeaders: Record<string, string>;
    /** Update tenancy headers for API requests (e.g. x-org-id, x-env-id) */
    setTenantHeaders: (headers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    /** Sign out and clear session */
    signOut: () => Promise<void>;
    /** Re-fetch session from the backend */
    refetch: () => Promise<void>;
    /** Trigger a social OAuth sign-in (Google, GitHub, etc) */
    signInWithSocial: (provider: string, callbackURLOrOptions?: string | SocialSignInOptions) => void;
    /** Sign in with email/password */
    signInWithEmail: (email: string, password: string, callbackURLOrOptions?: string | ScopedAuthOptions) => Promise<SignInResult>;
    /** Sign up with name/email/password */
    signUp: (name: string, email: string, password: string, callbackURLOrOptions?: string | ScopedAuthOptions) => Promise<SignInResult>;
    /** Send a magic link to the provided email */
    signInWithMagicLink: (email: string, callbackURL?: string) => Promise<SignInResult>;
    /** Enable MFA via TOTP and return the secret URI */
    enableMFA: (password: string) => Promise<{ error?: string; secretURI?: string; QRCode?: string; backupCodes?: string[] }>;
    /** Verify an MFA TOTP code */
    verifyMFA: (code: string) => Promise<SignInResult>;
    /** Register a WebAuthn passkey */
    registerPasskey: (name?: string) => Promise<{ error?: string; success?: boolean }>;
    /** Authenticate using a WebAuthn passkey */
    signInWithPasskey: () => Promise<SignInResult>;
    /** Set the active organization (for multi-tenant) */
    setActiveOrganization: (organizationId: string) => Promise<void>;
    /** The base URL of the Customy Access backend */
    baseUrl: string;
    /** The underlying SDK instance for direct admin API access */
    sdk: CustomyAccess;
}

export interface CustomyProviderProps {
    children: ReactNode;
    /** Base URL of the Customy Access API (e.g. http://localhost:4001 or https://access.customy.ai) */
    baseUrl: string;
    /** Admin secret for server-side usage (optional, NOT for browser) */
    adminSecret?: string;
    /** Publishable key — primary environment identifier (preferred, like Clerk/Stripe) */
    publishableKey?: string;
    /** Environment ID for non-prod/staging/local auth routing when a publishable key is not enough */
    environmentId?: string;
    /** Organization ID to auto-set on the session (optional) */
    organizationId?: string;
    /** @deprecated Use publishableKey instead */
    organizationSlug?: string;
    /** Session polling interval in ms (0 = disabled, default: 0) */
    sessionPollingMs?: number;
    /** If true, the SDK will automatically patch window.fetch to inject tenancy headers */
    enableFetchInterceptor?: boolean;
    /** Set to false to disable the built-in ImpersonationBanner (useful when you render your own). Default: true */
    showImpersonationBanner?: boolean;
}

const LegacyContext = createContext<CustomyAccess | null>(null);

/**
 * `CustomyProvider` de `@customyai/client/react` más el cliente de
 * administración de 0.x para `useSDK()`.
 */
export function CustomyProvider({
    children,
    baseUrl,
    adminSecret,
    publishableKey,
    environmentId,
    organizationId,
    organizationSlug,
    sessionPollingMs,
    enableFetchInterceptor,
    showImpersonationBanner,
}: CustomyProviderProps) {
    warnDeprecated("@customyai/customy-access/react", "use CustomyProvider from @customyai/client/react.");
    const sdk = useMemo(() => new CustomyAccess({
        baseUrl,
        adminSecret,
        environmentId,
        organizationId,
        publishableKey,
    }), [adminSecret, baseUrl, environmentId, organizationId, publishableKey]);
    return (
        <LegacyContext.Provider value={sdk}>
            <ClientProvider
                baseUrl={baseUrl}
                publishableKey={publishableKey}
                environmentId={environmentId}
                organizationId={organizationId}
                organizationSlug={organizationSlug}
                sessionPollingMs={sessionPollingMs}
                enableFetchInterceptor={enableFetchInterceptor}
                showImpersonationBanner={showImpersonationBanner}
            >
                {children}
            </ClientProvider>
        </LegacyContext.Provider>
    );
}

/** useSDK — el cliente de administración `CustomyAccess` del `CustomyProvider`. */
export function useSDK(): CustomyAccess {
    const sdk = useContext(LegacyContext);
    if (!sdk) throw new Error("Customy hooks must be used within <CustomyProvider>");
    return sdk;
}
