import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../react";

export type CustomySocialProvider = "google" | "github" | "apple" | "microsoft" | "linkedin";

export interface CustomySignInProps {
    /** URL to redirect to upon successful sign in. Defaults to ?callbackUrl or "/" */
    callbackUrl?: string;
    /** Hide the full-screen shell so the form can be embedded inline */
    embedded?: boolean;
    /** Enforce login or register mode */
    defaultMode?: "login" | "register";
    /** Product or application name rendered in the login card */
    appName?: string;
    /** Organization name rendered above the login title */
    organizationName?: string;
    /** Optional logo from Customy Access branding */
    logoUrl?: string;
    /** Copy from Customy Access branding */
    loginMessage?: string;
    /** Optional hero headline */
    heroTitle?: string;
    /** Optional hero body */
    heroCopy?: string;
    /** Footer text under the credential form */
    footer?: string;
    /** Brand primary color from Customy Access */
    primaryColor?: string;
    /** Access env scope passed through to auth requests */
    environmentId?: string;
    /** Access organization slug passed through to auth requests */
    organizationSlug?: string;
    /** Access publishable key passed through to auth requests */
    publishableKey?: string;
    /** Social OAuth providers to render natively */
    socialProviders?: CustomySocialProvider[];
    /** Successful fallback route when callbackUrl is absent */
    defaultCallbackUrl?: string;
}

const DEFAULT_PRIMARY = "#f97316";

const SPINNER = (
    <svg aria-hidden="true" style={{ animation: "customy-spin 1s linear infinite", height: 18, width: 18 }} viewBox="0 0 24 24">
        <circle cx="12" cy="12" fill="none" r="10" stroke="currentColor" strokeOpacity="0.24" strokeWidth="4" />
        <path d="M4 12a8 8 0 0 1 8-8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
    </svg>
);

const ARROW = (
    <svg aria-hidden="true" height="16" viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
    </svg>
);

export function CustomySignIn({
    callbackUrl: forceCallbackUrl,
    embedded = false,
    defaultMode = "login",
    appName = "Customy",
    organizationName,
    logoUrl,
    loginMessage,
    heroTitle,
    heroCopy,
    footer,
    primaryColor,
    environmentId,
    organizationSlug,
    publishableKey,
    socialProviders = [],
    defaultCallbackUrl = "/",
}: CustomySignInProps) {
    const { isLoaded, isSignedIn, signInWithEmail, signInWithSocial, signUp } = useAuth();
    const [callbackUrl, setCallbackUrl] = useState(defaultCallbackUrl);
    const [mode, setMode] = useState<"login" | "register">(defaultMode);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const safePrimaryColor = sanitizeCssColor(primaryColor || DEFAULT_PRIMARY);
    const orgName = organizationName || appName || "Customy";
    const title = mode === "register" ? "Crear cuenta" : "Iniciar sesion";
    const subtitle = loginMessage || `Accede a ${appName} con identidad, permisos y tenant gobernados por Customy Access.`;
    const resolvedHeroTitle = heroTitle || "Una identidad gobernada para todos los productos Customy.";
    const resolvedHeroCopy = heroCopy || "Customy Access valida la sesion, el workspace, el proyecto, el entorno, permisos y limites antes de abrir cada servicio.";
    const resolvedFooter = footer || "Protegido por Customy Access. Las cookies y scopes quedan alineados con org, project y env.";
    const providers = useMemo(() => Array.from(new Set(socialProviders)).filter(Boolean), [socialProviders]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        setCallbackUrl(safeCallbackPath(
            forceCallbackUrl || params.get("callbackUrl") || params.get("redirect_url") || defaultCallbackUrl,
            defaultCallbackUrl,
        ));
    }, [defaultCallbackUrl, forceCallbackUrl]);

    useEffect(() => {
        if (isLoaded && isSignedIn && typeof window !== "undefined") {
            window.location.replace(callbackUrl);
        }
    }, [callbackUrl, isLoaded, isSignedIn]);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const options = {
                callbackURL: callbackUrl,
                environmentId,
                organizationSlug,
                publishableKey,
            };
            const result = mode === "register"
                ? await signUp(name.trim(), email.trim(), password, options)
                : await signInWithEmail(email.trim(), password, options);

            if (result.error) {
                setError(result.error);
                return;
            }
            if (result.twoFactorRedirect) {
                setError("Two-factor authentication is required. Complete it in Customy Access.");
                return;
            }
            window.location.assign(safeCallbackPath(result.url || callbackUrl, callbackUrl));
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
        } finally {
            setLoading(false);
        }
    }

    function handleSocialSignIn(provider: string) {
        signInWithSocial(provider, {
            callbackURL: callbackUrl,
            environmentId,
            organizationSlug,
            publishableKey,
        });
    }

    const styleVars = {
        "--customy-access-primary": safePrimaryColor,
    } as CSSProperties;

    if (!isLoaded || isSignedIn) {
        return (
            <div style={{ ...styles.loadingShell, minHeight: embedded ? "auto" : "100dvh" }}>
                {!isSignedIn ? SPINNER : <p style={styles.loadingText}>Redirigiendo...</p>}
                <style>{KEYFRAMES}</style>
            </div>
        );
    }

    const content = (
        <main style={{ ...styles.shell, minHeight: embedded ? "auto" : "100dvh", ...styleVars }}>
            <section style={styles.frame}>
                <div style={{ ...styles.hero, background: heroBackground(safePrimaryColor) }}>
                    <div>
                        <BrandMark appName={appName} logoUrl={logoUrl} orgName={orgName} />
                        <h1 style={styles.heroTitle}>{resolvedHeroTitle}</h1>
                        <p style={styles.heroCopy}>{resolvedHeroCopy}</p>
                    </div>
                    <div style={styles.proofRow}>
                        <span style={styles.proof}>Access native</span>
                        <span style={styles.proof}>Project scoped</span>
                        <span style={styles.proof}>Environment aware</span>
                    </div>
                </div>

                <div style={styles.formPane}>
                    <div style={styles.formWrap}>
                        <p style={{ ...styles.productName, color: safePrimaryColor }}>{orgName}</p>
                        <h2 style={styles.title}>{title}</h2>
                        <p style={styles.subtitle}>{subtitle}</p>

                        {providers.length > 0 ? (
                            <div style={styles.socialStack}>
                                {providers.map((provider) => (
                                    <button key={provider} onClick={() => handleSocialSignIn(provider)} style={styles.socialButton} type="button">
                                        <ProviderIcon provider={provider} />
                                        <span>{providerLabel(provider)}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {providers.length > 0 ? <div style={styles.divider}>o usa correo</div> : null}

                        <form data-customy-access-credential-form onSubmit={handleSubmit} style={styles.form}>
                            {mode === "register" ? (
                                <label style={styles.label}>
                                    <span>Nombre</span>
                                    <input autoComplete="name" onChange={(event) => setName(event.target.value)} placeholder="Tu nombre" required style={styles.input} type="text" value={name} />
                                </label>
                            ) : null}
                            <label style={styles.label}>
                                <span>Correo electronico</span>
                                <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="tu@empresa.com" required style={styles.input} type="email" value={email} />
                            </label>
                            <label style={styles.label}>
                                <span>Contrasena</span>
                                <input autoComplete={mode === "register" ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} placeholder="........" required style={styles.input} type="password" value={password} />
                            </label>
                            {error ? <div role="alert" style={styles.error}>{error}</div> : null}
                            <button data-customy-access-submit disabled={loading} style={{ ...styles.submit, background: safePrimaryColor }} type="submit">
                                {loading ? SPINNER : <><span>{mode === "register" ? "Crear cuenta" : "Iniciar sesion"}</span>{ARROW}</>}
                            </button>
                        </form>

                        <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} style={{ ...styles.modeSwitch, color: safePrimaryColor }} type="button">
                            {mode === "login" ? "Crear una cuenta nueva" : "Ya tengo cuenta"}
                        </button>
                        <p style={styles.footer}>{resolvedFooter}</p>
                    </div>
                </div>
            </section>
            <style>{KEYFRAMES}</style>
        </main>
    );

    return embedded ? <div style={styleVars}>{content}</div> : content;
}

function BrandMark({ appName, logoUrl, orgName }: { appName: string; logoUrl?: string; orgName: string }) {
    return (
        <div style={styles.brand}>
            {logoUrl ? (
                <img alt="" src={logoUrl} style={styles.logoImage} />
            ) : (
                <span style={styles.logoFallback}>{orgName.slice(0, 1).toUpperCase()}</span>
            )}
            <span style={styles.brandText}>{appName}</span>
        </div>
    );
}

function ProviderIcon({ provider }: { provider: string }) {
    if (provider === "google") {
        return (
            <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
        );
    }
    return <span style={styles.providerGlyph}>{provider.slice(0, 2).toUpperCase()}</span>;
}

function providerLabel(provider: string) {
    if (provider === "google") return "Continuar con Google";
    if (provider === "github") return "Continuar con GitHub";
    if (provider === "microsoft") return "Continuar con Microsoft";
    if (provider === "apple") return "Continuar con Apple";
    if (provider === "linkedin") return "Continuar con LinkedIn";
    return `Continuar con ${provider}`;
}

function heroBackground(primary: string) {
    return `radial-gradient(circle at 18% 18%, ${primary} 0, rgba(249,115,22,0.20) 28%, transparent 44%), linear-gradient(135deg, #111113 0%, #18181b 46%, #050505 100%)`;
}

function sanitizeCssColor(value: string) {
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
    if (/^rgb[a]?\([\d\s,%.]+\)$/.test(value)) return value;
    if (/^hsl[a]?\([\d\s,%.]+\)$/.test(value)) return value;
    return DEFAULT_PRIMARY;
}

function safeCallbackPath(value: unknown, fallback: string) {
    if (typeof value !== "string" || value.length === 0) return fallback;
    if (typeof window === "undefined") return value.startsWith("/") ? value : fallback;
    try {
        const candidate = new URL(value, window.location.origin);
        if (candidate.origin !== window.location.origin) return fallback;
        return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    } catch {
        return fallback;
    }
}

const KEYFRAMES = `
@keyframes customy-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

const styles = {
    shell: {
        alignItems: "center",
        background: "hsl(0 0% 98%)",
        color: "#171717",
        display: "grid",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        justifyItems: "center",
        padding: 24,
    },
    frame: {
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 24,
        boxShadow: "0 32px 90px rgba(15,23,42,0.16)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
        maxWidth: 1180,
        overflow: "hidden",
        width: "100%",
    },
    hero: {
        color: "white",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 620,
        padding: 40,
    },
    brand: {
        alignItems: "center",
        display: "flex",
        gap: 12,
    },
    logoImage: {
        borderRadius: 14,
        height: 44,
        objectFit: "contain",
        outline: "1px solid rgba(255,255,255,0.24)",
        width: 44,
    } as CSSProperties,
    logoFallback: {
        alignItems: "center",
        background: "rgba(255,255,255,0.16)",
        borderRadius: 14,
        display: "grid",
        fontSize: 15,
        fontWeight: 800,
        height: 44,
        justifyItems: "center",
        outline: "1px solid rgba(255,255,255,0.24)",
        width: 44,
    },
    brandText: {
        color: "rgba(255,255,255,0.86)",
        fontSize: 15,
        fontWeight: 700,
    },
    heroTitle: {
        fontSize: "clamp(34px, 4vw, 56px)",
        fontWeight: 750,
        letterSpacing: 0,
        lineHeight: 1.05,
        margin: "72px 0 0",
        maxWidth: 620,
    },
    heroCopy: {
        color: "rgba(255,255,255,0.72)",
        fontSize: 15,
        lineHeight: 1.7,
        margin: "20px 0 0",
        maxWidth: 560,
    },
    proofRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
    } as CSSProperties,
    proof: {
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 999,
        color: "rgba(255,255,255,0.84)",
        fontSize: 12,
        fontWeight: 700,
        padding: "6px 10px",
    },
    formPane: {
        alignItems: "center",
        background: "white",
        display: "flex",
        justifyContent: "center",
        padding: 40,
    },
    formWrap: {
        maxWidth: 390,
        width: "100%",
    },
    productName: {
        fontSize: 14,
        fontWeight: 800,
        margin: 0,
    },
    title: {
        color: "#171717",
        fontSize: 34,
        fontWeight: 780,
        letterSpacing: 0,
        lineHeight: 1.12,
        margin: "14px 0 0",
    },
    subtitle: {
        color: "#737373",
        fontSize: 15,
        lineHeight: 1.65,
        margin: "10px 0 0",
    },
    socialStack: {
        display: "grid",
        gap: 10,
        marginTop: 28,
    },
    socialButton: {
        alignItems: "center",
        background: "#fff",
        border: "1px solid #d4d4d4",
        borderRadius: 12,
        color: "#171717",
        cursor: "pointer",
        display: "flex",
        fontSize: 14,
        fontWeight: 750,
        gap: 10,
        height: 46,
        justifyContent: "center",
    },
    divider: {
        color: "#8a8a8a",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.12em",
        margin: "22px 0",
        textAlign: "center",
        textTransform: "uppercase",
    } as CSSProperties,
    form: {
        display: "grid",
        gap: 16,
        marginTop: 24,
    },
    label: {
        color: "#262626",
        display: "grid",
        fontSize: 14,
        fontWeight: 700,
        gap: 7,
    },
    input: {
        background: "#fff",
        border: "1px solid #d4d4d4",
        borderRadius: 12,
        color: "#171717",
        fontSize: 15,
        height: 46,
        outline: "none",
        padding: "0 14px",
    },
    error: {
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.28)",
        borderRadius: 12,
        color: "#b91c1c",
        fontSize: 13,
        lineHeight: 1.45,
        padding: "10px 12px",
    },
    submit: {
        alignItems: "center",
        border: "none",
        borderRadius: 12,
        color: "white",
        cursor: "pointer",
        display: "flex",
        fontSize: 14,
        fontWeight: 800,
        gap: 8,
        height: 48,
        justifyContent: "center",
        marginTop: 2,
    },
    modeSwitch: {
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "block",
        fontSize: 12,
        fontWeight: 800,
        margin: "18px auto 0",
        padding: 0,
    },
    footer: {
        color: "#737373",
        fontSize: 12,
        lineHeight: 1.6,
        margin: "24px 0 0",
    },
    providerGlyph: {
        alignItems: "center",
        background: "#f5f5f5",
        border: "1px solid #e5e5e5",
        borderRadius: 6,
        color: "#525252",
        display: "grid",
        fontSize: 10,
        fontWeight: 900,
        height: 20,
        justifyItems: "center",
        width: 20,
    },
    loadingShell: {
        alignItems: "center",
        background: "#fafafa",
        color: DEFAULT_PRIMARY,
        display: "flex",
        justifyContent: "center",
    },
    loadingText: {
        color: "#737373",
        fontSize: 14,
        margin: 0,
    },
} satisfies Record<string, CSSProperties>;
