/**
 * @customyai/client/native/react — the native client in React (React Native, Expo):
 * a provider that restores the session at start and a hook with the status, the user, the
 * discovered sign-in providers and the actions. No DOM, no platform imports.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomyNativeAuth, NativeAuthConfig, NativeAuthStatus, NativeUser } from "../native";

type Value = {
    status: NativeAuthStatus;
    user: NativeUser | null;
    /** Organization, environment, enabled providers — null until discovered. */
    config: NativeAuthConfig | null;
    auth: CustomyNativeAuth;
};

const Context = createContext<Value | null>(null);

export function CustomyNativeAuthProvider({ auth, children }: { auth: CustomyNativeAuth; children: ReactNode }) {
    const [status, setStatus] = useState<NativeAuthStatus>(auth.status);
    const [config, setConfig] = useState<NativeAuthConfig | null>(null);
    useEffect(() => {
        const off = auth.subscribe(setStatus);
        void auth.restore();
        void auth.discover().then(setConfig, () => undefined);
        return () => {
            off();
        };
    }, [auth]);
    const value = useMemo<Value>(() => ({ status, user: status === "signedIn" ? auth.user() : null, config, auth }), [status, config, auth]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCustomyNativeAuth() {
    const value = useContext(Context);
    if (!value) throw new Error("useCustomyNativeAuth must be used inside <CustomyNativeAuthProvider>");
    const { auth } = value;
    return {
        status: value.status,
        isSignedIn: value.status === "signedIn",
        user: value.user,
        config: value.config,
        providers: value.config?.providers ?? [],
        signInWithPassword: auth.signInWithPassword,
        signUpWithPassword: auth.signUpWithPassword,
        signInWithProvider: auth.signInWithProvider,
        getAccessToken: auth.getAccessToken,
        signOut: auth.signOut,
    };
}

export type { CustomyNativeAuth, NativeAuthConfig, NativeAuthStatus, NativeUser };
