/**
 * JWKS remoto con rotación. Las claves del issuer se cachean y se refrescan:
 *
 * - al caducar la caché (`cacheMaxAgeMs`, 10 min por defecto);
 * - cuando llega un `kid` desconocido (el issuer acaba de rotar), como mucho
 *   una vez por `cooldownMs` — un atacante que inventa `kid` no convierte cada
 *   petición en una llamada al issuer;
 * - si el refresco falla, se sigue verificando con las claves conocidas hasta
 *   `maxStaleMs` (1 h por defecto): una caída breve del issuer no tumba a
 *   todos los servicios que verifican.
 *
 * Una clave retirada del JWKS deja de aceptarse en el siguiente refresco.
 */
import { CustomySdkError } from "@customyai/core";
import { createLocalJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from "jose";

export type RemoteJwksOptions = Readonly<{
    fetch?: typeof fetch;
    cacheMaxAgeMs?: number;
    cooldownMs?: number;
    maxStaleMs?: number;
    timeoutMs?: number;
    now?: () => number;
}>;

export type RemoteJwks = JWTVerifyGetKey & {
    /** Fuerza un refresco (respeta el cooldown salvo `force`). */
    refresh(options?: { force?: boolean }): Promise<void>;
    /** `kid` de las claves en caché. */
    readonly kids: readonly string[];
};

type Loaded = { set: ReturnType<typeof createLocalJWKSet>; kids: string[]; fetchedAt: number };

function isKeySet(value: unknown): value is JSONWebKeySet {
    return Boolean(value) && typeof value === "object" && Array.isArray((value as { keys?: unknown }).keys);
}

export function createRemoteJwks(jwksUri: string, options: RemoteJwksOptions = {}): RemoteJwks {
    const url = new URL(jwksUri);
    if (url.protocol !== "https:" || url.username || url.password) {
        throw new CustomySdkError({ code: "SDK_JWKS_URI_INVALID", service: "access", message: "JWKS URI must be https" });
    }
    const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    const now = options.now ?? Date.now;
    const maxAge = options.cacheMaxAgeMs ?? 10 * 60_000;
    const cooldown = options.cooldownMs ?? 30_000;
    const maxStale = options.maxStaleMs ?? 60 * 60_000;
    let loaded: Loaded | null = null;
    let lastAttempt = Number.NEGATIVE_INFINITY;
    let pending: Promise<void> | null = null;

    async function load(): Promise<void> {
        lastAttempt = now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
        try {
            const response = await fetchImpl(url.toString(), { headers: { accept: "application/json" }, signal: controller.signal });
            if (!response.ok) throw new CustomySdkError({ code: "SDK_JWKS_UNAVAILABLE", status: response.status, service: "access" });
            const body: unknown = await response.json();
            if (!isKeySet(body)) throw new CustomySdkError({ code: "SDK_JWKS_INVALID", service: "access" });
            const keys = body.keys.filter((key) => key && typeof key === "object" && (key.use === undefined || key.use === "sig"));
            loaded = {
                set: createLocalJWKSet({ keys }),
                kids: keys.map((key) => key.kid).filter((kid): kid is string => typeof kid === "string"),
                fetchedAt: now(),
            };
        } finally {
            clearTimeout(timer);
        }
    }

    function refresh(force = false): Promise<void> {
        if (!force && now() - lastAttempt < cooldown) return pending ?? Promise.resolve();
        pending ??= load().finally(() => { pending = null; });
        return pending;
    }

    async function usable(): Promise<Loaded> {
        if (!loaded || now() - loaded.fetchedAt >= maxAge) {
            try { await refresh(!loaded); }
            catch (error) {
                if (!loaded || now() - loaded.fetchedAt >= maxAge + maxStale) throw error;
            }
        }
        if (!loaded) throw new CustomySdkError({ code: "SDK_JWKS_UNAVAILABLE", service: "access" });
        return loaded;
    }

    const getKey = async function getKey(header, token) {
        const current = await usable();
        const kid = header.kid;
        if (typeof kid === "string" && !current.kids.includes(kid)) {
            // `kid` desconocido: probablemente una rotación. Refresca (con cooldown).
            try { await refresh(); } catch { /* sigue con lo conocido */ }
        }
        return (loaded ?? current).set(header, token);
    } as RemoteJwks;
    getKey.refresh = async (refreshOptions) => { await refresh(refreshOptions?.force === true); };
    Object.defineProperty(getKey, "kids", { get: () => [...(loaded?.kids ?? [])], enumerable: true });
    return getKey;
}
