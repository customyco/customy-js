/**
 * @customyai/client/native/react — the native client in React (React Native, Expo):
 * a provider that restores the session at start and a hook with the status, the user, the
 * discovered sign-in providers and the actions. No DOM, no platform imports.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { accessGrantsFrom, type AccessGrants, type AccessGrantsSource } from "../access-grants";
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

function useContextValue() {
    const value = useContext(Context);
    if (!value) throw new Error("useCustomyNativeAuth must be used inside <CustomyNativeAuthProvider>");
    return value;
}

export function useCustomyNativeAuth() {
    const value = useContextValue();
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

/**
 * Roles y permisos del usuario conectado, sin nombres de rol en la app móvil. `load` llama a TU API (la app móvil no lee `/me` con su
 * token de usuario: lo hace tu servidor con su token de máquina) y devuelve el snapshot de `/me` o `{ roles, permissions }`.
 * Se carga al iniciar sesión y se vacía al cerrarla; `refetch()` lo vuelve a pedir.
 */
export function useAccessGrants<Role extends string = string, Permission extends string = string>(
    load: (accessToken: string) => Promise<AccessGrantsSource>,
): AccessGrants<Role, Permission> & { isLoading: boolean; error: Error | null; refetch: () => Promise<void> } {
    const { auth } = useContextValue();
    const [status, setStatus] = useState<NativeAuthStatus>(auth.status);
    const [source, setSource] = useState<AccessGrantsSource>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const loadRef = useRef(load);
    loadRef.current = load;
    useEffect(() => {
        const off = auth.subscribe(setStatus);
        return () => {
            off();
        };
    }, [auth]);
    const refetch = useCallback(async () => {
        if (auth.status !== "signedIn") {
            setSource(null);
            return;
        }
        setIsLoading(true);
        try {
            setSource(await loadRef.current(await auth.getAccessToken()));
            setError(null);
        } catch (failure) {
            setError(failure as Error);
        } finally {
            setIsLoading(false);
        }
    }, [auth]);
    useEffect(() => {
        void refetch();
    }, [refetch, status]);
    const grants = useMemo(() => accessGrantsFrom<Role, Permission>(status === "signedIn" ? source : null), [source, status]);
    return { ...grants, isLoading, error, refetch };
}

export type { AccessGrants, AccessGrantsSource };
export type { CustomyNativeAuth, NativeAuthConfig, NativeAuthStatus, NativeUser };
