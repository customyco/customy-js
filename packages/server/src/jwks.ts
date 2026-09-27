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
 * Una clave retirada del JWKS deja de aceptarse en el siguiente refresco. Cada
 * clave se importa al cargar: una malformada se descarta (no cuenta en `kids`),
 * y un JWKS sin ninguna clave utilizable es `SDK_JWKS_INVALID`.
 *
 * Un issuer inalcanzable es `SDK_JWKS_UNAVAILABLE` (con la causa); los
 * verificadores lo convierten en `ACCESS_UNAVAILABLE`, nunca en «token inválido».
 */
import { CustomySdkError } from "@customyai/core";
import { createLocalJWKSet, importJWK, type JSONWebKeySet, type JWK, type JWTVerifyGetKey } from "jose";

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
    /** `kid` de las claves en caché que se pudieron importar. */
    readonly kids: readonly string[];
};

type Loaded = { set: ReturnType<typeof createLocalJWKSet>; kids: string[]; fetchedAt: number };

function isKeySet(value: unknown): value is JSONWebKeySet {
    return Boolean(value) && typeof value === "object" && Array.isArray((value as { keys?: unknown }).keys);
}

/** Algoritmo con el que importar una clave para comprobarla: el suyo o, en RSA, RS256. */
function importAlgorithm(key: JWK): string | undefined {
    if (typeof key.alg === "string") return key.alg;
    return key.kty === "RSA" ? "RS256" : undefined;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** RS256 exige un módulo de al menos 2048 bits (256 bytes). */
const MIN_RSA_MODULUS_BYTES = 256;

function base64UrlBytes(value: unknown): number {
    if (typeof value !== "string" || !BASE64URL.test(value) || value.length % 4 === 1) return 0;
    return Math.floor((value.length * 3) / 4);
}

/** Forma mínima de una clave: una RSA con módulo y exponente base64url válidos y ≥ 2048 bits. */
function wellFormed(key: JWK): boolean {
    if (key.kty === "RSA") {
        if (key.d !== undefined) return false; // una clave privada nunca va en un JWKS público
        return base64UrlBytes(key.n) >= MIN_RSA_MODULUS_BYTES - 1 && base64UrlBytes(key.e) > 0;
    }
    return true;
}

/** Solo las claves de firma que de verdad se importan (una malformada con `kid` no cuenta). */
export async function usableSigningKeys(keys: readonly unknown[]): Promise<JWK[]> {
    const candidates = keys.filter((key): key is JWK => Boolean(key) && typeof key === "object" && ((key as JWK).use === undefined || (key as JWK).use === "sig"));
    const checked = await Promise.all(candidates.map(async (key) => {
        const alg = importAlgorithm(key);
        if (!alg || !wellFormed(key)) return null;
        try {
            await importJWK(key, alg);
            return key;
        } catch {
            return null;
        }
    }));
    return checked.filter((key): key is JWK => key !== null);
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
            let response: Response;
            try {
                response = await fetchImpl(url.toString(), { headers: { accept: "application/json" }, signal: controller.signal });
            } catch (error) {
                throw new CustomySdkError({ code: "SDK_JWKS_UNAVAILABLE", service: "access", message: "JWKS could not be fetched", cause: error });
            }
            if (!response.ok) throw new CustomySdkError({ code: "SDK_JWKS_UNAVAILABLE", status: response.status, service: "access" });
            const body: unknown = await response.json().catch(() => null);
            if (!isKeySet(body)) throw new CustomySdkError({ code: "SDK_JWKS_INVALID", service: "access" });
            const keys = await usableSigningKeys(body.keys);
            if (keys.length === 0) throw new CustomySdkError({ code: "SDK_JWKS_INVALID", service: "access", message: "JWKS has no usable signing key" });
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
