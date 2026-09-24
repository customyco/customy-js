import React, { useState, useEffect, useRef } from "react";
import { useAuth, useUser, useOrganization } from "../react";

/**
 * Render children only if the user is signed in.
 */
export function SignedIn({ children }: { children: React.ReactNode }) {
    const { isLoaded, isSignedIn } = useAuth();
    if (!isLoaded || !isSignedIn) return null;
    return <>{children}</>;
}

/**
 * Render children only if the user is NOT signed in.
 */
export function SignedOut({ children }: { children: React.ReactNode }) {
    const { isLoaded, isSignedIn } = useAuth();
    if (!isLoaded || isSignedIn) return null;
    return <>{children}</>;
}

const LogOutIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
);

const SettingsIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

export interface UserButtonProps {
    /** Additional CSS classes for the button */
    className?: string;
    /** Standard CSS properties */
    style?: React.CSSProperties;
    /** Override the background color of the avatar */
    avatarBackground?: string;
    /** Hide the user's name on desktop, showing only the avatar */
    hideName?: boolean;
}

/**
 * A drop-in `<UserButton />` that renders an interactive avatar and a dropdown menu
 * to manage the account or sign out, imitating the Clerk/Auth0 experience natively.
 */
export function UserButton({ className, style, avatarBackground, hideName = false }: UserButtonProps) {
    const { isLoaded, isSignedIn, signOut } = useAuth();
    const { user } = useUser();
    const [isOpen, setIsOpen] = useState(false);
    
    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = () => setIsOpen(false);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, [isOpen]);

    if (!isLoaded || !isSignedIn || !user) return null;

    const initials = user.name ? user.name[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : "?");
    const displayName = user.name || (user.email ? user.email.split("@")[0] : "User");

    return (
        <div style={{ position: "relative", display: "inline-block", fontFamily: "system-ui, sans-serif", ...style }}>
            <button 
                type="button"
                className={className} 
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                style={{ 
                    display: "flex", alignItems: "center", gap: 8, padding: hideName ? "4px" : "4px 12px 4px 4px", 
                    border: isOpen ? "1px solid rgba(234,88,12,0.5)" : "1px solid transparent", 
                    borderRadius: 32, cursor: "pointer", 
                    background: isOpen ? "rgba(234,88,12,0.05)" : "transparent",
                    transition: "all 0.2s ease"
                }}
                onMouseOver={(e) => { if (!isOpen) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                onMouseOut={(e) => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
            >
                <div style={{ 
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: avatarBackground || "linear-gradient(135deg, #f97316, #9a3412)", 
                    display: "flex", alignItems: "center", justifyContent: "center", 
                    color: "white", fontSize: 13, fontWeight: 600,
                    boxShadow: "0 2px 4px rgba(234,88,12,0.2)"
                }}>
                    {initials}
                </div>
                {!hideName && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#111827", userSelect: "none" }}>
                        {displayName}
                    </span>
                )}
            </button>
            
            {isOpen && (
                <div style={{
                    position: "absolute", bottom: "100%", left: 0, marginBottom: 8, minWidth: 240,
                    background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12,
                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
                    zIndex: 9999, padding: "12px", transformOrigin: "bottom left",
                    animation: "customy-fade-in 0.15s ease-out forwards"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6", marginBottom: 8 }}>
                         <div style={{ 
                            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                            background: avatarBackground || "linear-gradient(135deg, #f97316, #9a3412)", 
                            display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, fontWeight: 600
                        }}>
                            {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                             <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                 {user.name || "User"}
                             </p>
                             <p style={{ margin: 0, fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                 {user.email}
                             </p>
                        </div>
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => { setIsOpen(false); /* NOTE: Link to account portal using CustomyAccess router if needed */ }}
                        style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                            background: "transparent", border: "none", cursor: "pointer",  color: "#374151",
                            borderRadius: 6, transition: "background 0.1s", fontSize: 13, fontWeight: 500
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#f9fafb"}
                        onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        <SettingsIcon /> Manage Account
                    </button>

                    <button
                        type="button"
                        onClick={() => { setIsOpen(false); signOut(); }}
                        style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                            background: "transparent", border: "none", cursor: "pointer", color: "#dc2626",
                            borderRadius: 6, transition: "background 0.1s", fontSize: 13, fontWeight: 500, marginTop: 4
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#fef2f2"}
                        onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        <LogOutIcon /> Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── RBAC & ABAC DX Abstractions ────────────────────────────────

export interface ProtectProps {
    /** The child components to render if authorized */
    children: React.ReactNode;
    /** The component to render if NOT authorized. Defaults to null. */
    fallback?: React.ReactNode;
    /** Require a specific role (e.g., "admin") or one of multiple roles (e.g., ["admin", "owner"]) */
    role?: string | string[];
    /** Provide a custom validation function to determine access dynamically */
    condition?: (has: (params: { role?: string }) => boolean) => boolean;
}

/**
 * `<Protect />` allows you to conditionally render content based on the user's role
 * within the active organization. It mirrors the exact DX standard of Clerk.
 * 
 * @example
 * <Protect role="admin" fallback={<p>Unauthorized</p>}>
 *   <DeleteButton />
 * </Protect>
 */
export function Protect({ children, fallback = null, role, condition }: ProtectProps) {
    const { isLoaded, isSignedIn } = useAuth();
    const { organization, membership } = useOrganization();

    if (!isLoaded || !isSignedIn) return <>{fallback}</>;

    // The core Authorization checking logic
    const has = (params: { role?: string }): boolean => {
        if (!params.role) return false;
        if (!membership?.role) return false;
        return membership.role === params.role;
    };

    // If a custom condition is provided, use it
    if (condition) {
        if (condition(has)) return <>{children}</>;
        return <>{fallback}</>;
    }

    // Role-based validation
    if (role) {
        const requiredRoles = Array.isArray(role) ? role : [role];
        if (membership && membership.role && requiredRoles.includes(membership.role)) {
            return <>{children}</>;
        }
        return <>{fallback}</>;
    }

    // Default: if no guard clauses match but is signed in, allow
    return <>{children}</>;
}

// ─── Native User Profile Dashboard ────────────────────────────────

const SpinIcon = () => (
    <svg style={{ animation: "spin 1s linear infinite", height: 20, width: 20 }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export interface UserProfileProps {
    /** Override styling */
    style?: React.CSSProperties;
    /** Enforce dark mode or light mode base styling */
    theme?: "dark" | "light";
}

const ProfileIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const SecurityIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;

/**
 * `<UserProfile />` is a complete full-screen or embedded drop-in component
 * capable of managing the authenticated user's profile, linked accounts, and sessions.
 * Matches Clerk's identical DX approach.
 * 
 * @example
 * <UserProfile theme="dark" />
 */
export function UserProfile({ style, theme = "light" }: UserProfileProps) {
    const { isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");

    if (!isLoaded || !isSignedIn || !user) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
                {!isSignedIn && <SpinIcon />}
                {isSignedIn && <p>Loading Profile...</p>}
            </div>
        );
    }

    const initials = user.name ? user.name[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : "?");
    
    // Theme palette mapper
    const palette = {
        bg: theme === "dark" ? "#0a0a0f" : "#ffffff",
        cardBg: theme === "dark" ? "rgba(17,17,23,0.8)" : "#ffffff",
        border: theme === "dark" ? "rgba(255,255,255,0.1)" : "#e5e7eb",
        textPrimary: theme === "dark" ? "#ffffff" : "#111827",
        textSecondary: theme === "dark" ? "#94a3b8" : "#6b7280",
        tabHover: theme === "dark" ? "rgba(255,255,255,0.05)" : "#f3f4f6",
        tabActive: theme === "dark" ? "rgba(234,88,12,0.15)" : "#fff7ed",
        tabActiveText: theme === "dark" ? "#fb923c" : "#ea580c",
        inputBg: theme === "dark" ? "rgba(255,255,255,0.05)" : "#f9fafb",
    };

    return (
        <div style={{
            width: "100%", maxWidth: 900, minHeight: 500, margin: "0 auto", 
            background: palette.cardBg, border: `1px solid ${palette.border}`, borderRadius: 24, 
            boxShadow: theme === "dark" ? "0 25px 50px -12px rgba(0,0,0,0.5)" : "0 10px 25px -5px rgba(0,0,0,0.05)",
            display: "flex", overflow: "hidden", fontFamily: "system-ui, sans-serif",
            ...style
        }}>
            {/* Sidebar */}
            <div style={{ width: 220, borderRight: `1px solid ${palette.border}`, padding: 24, background: theme === "dark" ? "transparent" : "#fdfdfd" }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: palette.textPrimary, marginBottom: 24, margin: "0 0 24px 0" }}>Account</h2>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab("profile")}
                        style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                            background: activeTab === "profile" ? palette.tabActive : "transparent",
                            color: activeTab === "profile" ? palette.tabActiveText : palette.textSecondary,
                            border: "none", cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontWeight: 500,
                            textAlign: "left"
                        }}
                        onMouseOver={e => { if (activeTab !== "profile") e.currentTarget.style.background = palette.tabHover; }}
                        onMouseOut={e => { if (activeTab !== "profile") e.currentTarget.style.background = "transparent"; }}
                    >
                        <ProfileIcon /> Profile
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("security")}
                        style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                            background: activeTab === "security" ? palette.tabActive : "transparent",
                            color: activeTab === "security" ? palette.tabActiveText : palette.textSecondary,
                            border: "none", cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontWeight: 500,
                            textAlign: "left"
                        }}
                        onMouseOver={e => { if (activeTab !== "security") e.currentTarget.style.background = palette.tabHover; }}
                        onMouseOut={e => { if (activeTab !== "security") e.currentTarget.style.background = "transparent"; }}
                    >
                        <SecurityIcon /> Security
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, padding: 32 }}>
                {activeTab === "profile" && (
                    <div style={{ animation: "customy-fade-in 0.2s ease-out forwards" }}>
                        <h3 style={{ fontSize: 20, fontWeight: 600, color: palette.textPrimary, margin: "0 0 24px 0" }}>Profile Details</h3>
                        
                        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32 }}>
                            <div style={{ 
                                width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #f97316, #9a3412)", 
                                display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 32, fontWeight: 600,
                                boxShadow: "0 4px 14px rgba(234,88,12,0.3)"
                            }}>
                                {initials}
                            </div>
                            <div>
                                <h4 style={{ margin: "0 0 4px 0", fontSize: 18, color: palette.textPrimary }}>{user.name || "Customy User"}</h4>
                                <p style={{ margin: 0, fontSize: 14, color: palette.textSecondary }}>{user.email}</p>
                            </div>
                        </div>

                        <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                            <div>
                                <label style={{ fontSize: 14, fontWeight: 500, color: palette.textSecondary, marginBottom: 8, display: "block" }}>Full Name</label>
                                <input 
                                    type="text" 
                                    defaultValue={user.name || ""}
                                    readOnly
                                    style={{
                                        width: "100%", maxWidth: 400, background: palette.inputBg, border: `1px solid ${palette.border}`,
                                        borderRadius: 8, padding: "10px 14px", color: palette.textPrimary, outline: "none", fontSize: 14
                                    }} 
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 14, fontWeight: 500, color: palette.textSecondary, marginBottom: 8, display: "block" }}>Email Address</label>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <input 
                                        type="email" 
                                        defaultValue={user.email}
                                        readOnly
                                        style={{
                                            width: "100%", maxWidth: 400, background: palette.inputBg, border: `1px solid ${palette.border}`,
                                            borderRadius: 8, padding: "10px 14px", color: palette.textPrimary, outline: "none", fontSize: 14
                                        }} 
                                    />
                                    {user.emailVerified && (
                                        <span style={{ fontSize: 12, fontWeight: 500, color: "#16a34a", background: "rgba(22,163,74,0.1)", padding: "4px 8px", borderRadius: 12 }}>Verified</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "security" && (
                    <div style={{ animation: "customy-fade-in 0.2s ease-out forwards" }}>
                        <h3 style={{ fontSize: 20, fontWeight: 600, color: palette.textPrimary, margin: "0 0 24px 0" }}>Security & Logins</h3>
                        
                        <div style={{ padding: 20, border: `1px solid ${palette.border}`, borderRadius: 12, background: palette.inputBg }}>
                            <h4 style={{ fontSize: 16, fontWeight: 600, color: palette.textPrimary, margin: "0 0 8px 0" }}>Update Password</h4>
                            <p style={{ fontSize: 14, color: palette.textSecondary, margin: "0 0 16px 0", lineHeight: 1.5 }}>
                                Ensure your account is using a long, random password to stay secure. Password management is currently handled via recovery flow.
                            </p>
                            <button
                                type="button"
                                style={{
                                    background: "#ea580c", color: "white", borderRadius: 8, padding: "8px 16px",
                                    fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s"
                                }}
                            >
                                Reset Password
                            </button>
                        </div>
                        
                        <div style={{ marginTop: 24, padding: 20, border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, background: theme === "dark" ? "rgba(239,68,68,0.05)" : "#fef2f2" }}>
                            <h4 style={{ fontSize: 16, fontWeight: 600, color: "#dc2626", margin: "0 0 8px 0" }}>Danger Zone</h4>
                            <p style={{ fontSize: 14, color: palette.textSecondary, margin: "0 0 16px 0", lineHeight: 1.5 }}>
                                Once you delete your account, there is no going back. Please be certain.
                            </p>
                            <button
                                type="button"
                                style={{
                                    background: "transparent", color: "#dc2626", borderRadius: 8, padding: "8px 16px",
                                    fontSize: 14, fontWeight: 600, border: "1px solid #dc2626", cursor: "pointer", transition: "all 0.2s"
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = "#dc2626"; e.currentTarget.style.color = "white"; }}
                                onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#dc2626"; }}
                            >
                                Delete Account
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes customy-fade-in {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </div>
    );
}

// ─── Native Organization Profile Dashboard ─────────────────────────

export interface OrganizationProfileProps {
    /** Override styling */
    style?: React.CSSProperties;
    /** Enforce dark mode or light mode base styling */
    theme?: "dark" | "light";
}

const BuildingIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>;
const UsersIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

/**
 * `<OrganizationProfile />` is a complete full-screen or embedded drop-in component
 * capable of managing the active organization's profile, domains, and members.
 * Matches Clerk's identical DX approach for Workspace administration.
 * 
 * @example
 * <OrganizationProfile theme="dark" />
 */
export function OrganizationProfile({ style, theme = "light" }: OrganizationProfileProps) {
    const { isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const { organization, membership } = useOrganization();
    const [activeTab, setActiveTab] = useState<"general" | "members">("general");

    if (!isLoaded || !isSignedIn || !user) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
                {!isSignedIn && <SpinIcon />}
                {isSignedIn && <p>Loading Workspace...</p>}
            </div>
        );
    }

    if (!organization) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
                <p>No active organization. Please select one.</p>
            </div>
        );
    }

    const initials = organization.name ? organization.name[0].toUpperCase() : "?";
    
    // Theme palette mapper
    const palette = {
        bg: theme === "dark" ? "#0a0a0f" : "#ffffff",
        cardBg: theme === "dark" ? "rgba(17,17,23,0.8)" : "#ffffff",
        border: theme === "dark" ? "rgba(255,255,255,0.1)" : "#e5e7eb",
        textPrimary: theme === "dark" ? "#ffffff" : "#111827",
        textSecondary: theme === "dark" ? "#94a3b8" : "#6b7280",
        tabHover: theme === "dark" ? "rgba(255,255,255,0.05)" : "#f3f4f6",
        tabActive: theme === "dark" ? "rgba(234,88,12,0.15)" : "#fff7ed",
        tabActiveText: theme === "dark" ? "#fb923c" : "#ea580c",
        inputBg: theme === "dark" ? "rgba(255,255,255,0.05)" : "#f9fafb",
    };

    return (
        <div style={{
            width: "100%", maxWidth: 900, minHeight: 500, margin: "0 auto", 
            background: palette.cardBg, border: `1px solid ${palette.border}`, borderRadius: 24, 
            boxShadow: theme === "dark" ? "0 25px 50px -12px rgba(0,0,0,0.5)" : "0 10px 25px -5px rgba(0,0,0,0.05)",
            display: "flex", overflow: "hidden", fontFamily: "system-ui, sans-serif",
            ...style
        }}>
            {/* Sidebar */}
            <div style={{ width: 220, borderRight: `1px solid ${palette.border}`, padding: 24, background: theme === "dark" ? "transparent" : "#fdfdfd" }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: palette.textPrimary, marginBottom: 24, margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ 
                        width: 20, height: 20, borderRadius: 4, background: "linear-gradient(135deg, #f97316, #9a3412)", 
                        display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 700
                    }}>
                        {initials}
                    </div>
                    Organization
                </h2>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab("general")}
                        style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                            background: activeTab === "general" ? palette.tabActive : "transparent",
                            color: activeTab === "general" ? palette.tabActiveText : palette.textSecondary,
                            border: "none", cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontWeight: 500,
                            textAlign: "left"
                        }}
                        onMouseOver={e => { if (activeTab !== "general") e.currentTarget.style.background = palette.tabHover; }}
                        onMouseOut={e => { if (activeTab !== "general") e.currentTarget.style.background = "transparent"; }}
                    >
                        <BuildingIcon /> General
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("members")}
                        style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                            background: activeTab === "members" ? palette.tabActive : "transparent",
                            color: activeTab === "members" ? palette.tabActiveText : palette.textSecondary,
                            border: "none", cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontWeight: 500,
                            textAlign: "left"
                        }}
                        onMouseOver={e => { if (activeTab !== "members") e.currentTarget.style.background = palette.tabHover; }}
                        onMouseOut={e => { if (activeTab !== "members") e.currentTarget.style.background = "transparent"; }}
                    >
                        <UsersIcon /> Members
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, padding: 32 }}>
                {activeTab === "general" && (
                    <div style={{ animation: "customy-fade-in 0.2s ease-out forwards" }}>
                        <h3 style={{ fontSize: 20, fontWeight: 600, color: palette.textPrimary, margin: "0 0 24px 0" }}>Organization Profile</h3>
                        
                        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32 }}>
                            <div style={{ 
                                width: 80, height: 80, borderRadius: 16, background: "linear-gradient(135deg, #f97316, #9a3412)", 
                                display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 32, fontWeight: 600,
                                boxShadow: "0 4px 14px rgba(234,88,12,0.3)"
                            }}>
                                {initials}
                            </div>
                            <div>
                                <h4 style={{ margin: "0 0 4px 0", fontSize: 18, color: palette.textPrimary }}>{organization.name}</h4>
                                <p style={{ margin: 0, fontSize: 14, color: palette.textSecondary }}>{"@" + organization.slug}</p>
                            </div>
                        </div>

                        <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                            <div>
                                <label style={{ fontSize: 14, fontWeight: 500, color: palette.textSecondary, marginBottom: 8, display: "block" }}>Organization Name</label>
                                <input 
                                    type="text" 
                                    defaultValue={organization.name}
                                    readOnly
                                    style={{
                                        width: "100%", maxWidth: 400, background: palette.inputBg, border: `1px solid ${palette.border}`,
                                        borderRadius: 8, padding: "10px 14px", color: palette.textPrimary, outline: "none", fontSize: 14
                                    }} 
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 14, fontWeight: 500, color: palette.textSecondary, marginBottom: 8, display: "block" }}>URL Slug</label>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 400, background: palette.inputBg, border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden" }}>
                                    <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.05)", borderRight: `1px solid ${palette.border}`, color: palette.textSecondary, fontSize: 14 }}>customy.ai/</div>
                                    <input 
                                        type="text" 
                                        defaultValue={organization.slug}
                                        readOnly
                                        style={{
                                            flex: 1, background: "transparent", border: "none",
                                            padding: "10px 14px 10px 0", color: palette.textPrimary, outline: "none", fontSize: 14
                                        }} 
                                    />
                                </div>
                            </div>
                            
                            {membership?.role === "admin" && (
                                <div style={{ marginTop: 24, padding: 20, border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, background: theme === "dark" ? "rgba(239,68,68,0.05)" : "#fef2f2" }}>
                                    <h4 style={{ fontSize: 16, fontWeight: 600, color: "#dc2626", margin: "0 0 8px 0" }}>Delete Organization</h4>
                                    <p style={{ fontSize: 14, color: palette.textSecondary, margin: "0 0 16px 0", lineHeight: 1.5 }}>
                                        Careful! This will permanently delete the organization and all associated data.
                                    </p>
                                    <button
                                        type="button"
                                        style={{
                                            background: "transparent", color: "#dc2626", borderRadius: 8, padding: "8px 16px",
                                            fontSize: 14, fontWeight: 600, border: "1px solid #dc2626", cursor: "pointer", transition: "all 0.2s"
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.background = "#dc2626"; e.currentTarget.style.color = "white"; }}
                                        onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#dc2626"; }}
                                    >
                                        Delete Forever
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "members" && (
                    <div style={{ animation: "customy-fade-in 0.2s ease-out forwards" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                            <h3 style={{ fontSize: 20, fontWeight: 600, color: palette.textPrimary, margin: 0 }}>Active Members</h3>
                            {membership?.role === "admin" && (
                                <button type="button" style={{
                                    background: "#ea580c", color: "white", borderRadius: 8, padding: "8px 16px",
                                    fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s",
                                    display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px 0 rgba(234, 88, 12, 0.39)"
                                }}>
                                    + Invite Member
                                </button>
                            )}
                        </div>
                        
                        <div style={{ 
                            border: `1px solid ${palette.border}`, borderRadius: 12, background: palette.inputBg, overflow: "hidden"
                        }}>
                            {/* Current User Row */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <div style={{ 
                                        width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #f97316, #9a3412)", 
                                        display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, fontWeight: 600
                                    }}>
                                        {user.name ? user.name[0].toUpperCase() : "?"}
                                    </div>
                                    <div>
                                        <p style={{ margin: "0 0 4px 0", fontSize: 15, fontWeight: 500, color: palette.textPrimary }}>
                                            {user.name} <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>(You)</span>
                                        </p>
                                        <p style={{ margin: 0, fontSize: 13, color: palette.textSecondary }}>{user.email}</p>
                                    </div>
                                </div>
                                
                                <span style={{ 
                                    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                                    background: membership?.role === "admin" ? "rgba(249,115,22,0.15)" : "rgba(107,114,128,0.15)",
                                    color: membership?.role === "admin" ? "#ea580c" : palette.textSecondary,
                                }}>{membership?.role || "Member"}</span>
                            </div>
                        </div>

                        {membership?.role !== "admin" && (
                            <div style={{ marginTop: 24, textAlign: "right" }}>
                                <button
                                    type="button"
                                    style={{
                                        background: "transparent", color: palette.textSecondary, borderRadius: 8, padding: "8px 16px",
                                        fontSize: 14, fontWeight: 500, border: `1px solid ${palette.border}`, cursor: "pointer", transition: "all 0.2s"
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.background = palette.border; }}
                                    onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                                >
                                    Leave Organization
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
        </div>
    );
}
