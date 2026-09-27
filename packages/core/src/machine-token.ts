/**
 * Tokens de máquina de Customy Access (`client_credentials` + `audience`).
 *
 * Un proveedor pide el token la primera vez que hace falta, lo cachea hasta
 * poco antes de su caducidad y agrupa las peticiones concurrentes en una sola:
 * miles de llamadas por segundo no generan miles de peticiones a Access. Usa el
 * secreto de la app, así que solo tiene sentido en servidor (node o edge).
 */
import type { CustomyPlatformConfiguration } from "./discovery";
import { CustomySdkError } from "./errors";
import type { AccessTokenProvider } from "./transport";
import { normalizeIssuer } from "./url";

export type MachineTokenProviderOptions = Readonly<{
    issuer: string;
    clientId: string;
    clientSecret: string;
    /** Audiencia del producto, p. ej. `customy-send`. */
    audience: string;
    scopes?: readonly string[];
    /** Por defecto `${issuer}/oauth/token` (o el del discovery). */
    tokenEndpoint?: string;
    fetch?: typeof fetch;
    /** Segundos antes de caducar en que se renueva (por defecto 60, nunca más de la mitad de la vida del token). */
    refreshSkewSeconds?: number;
    /** Límite de la petición al token endpoint (por defecto 10 s). */
    timeoutMs?: number;
    now?: () => number;
}>;

/** Devuelve un token vigente para una audiencia; `invalidate()` fuerza pedir otro. */
export type MachineTokenProvider = AccessTokenProvider & {
    (): Promise<string>;
    invalidate(): void;
    readonly audience: string;
};

function required(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function encodeBasic(clientId: string, clientSecret: string): string {
    const raw = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
    const bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function createMachineTokenProvider(options: MachineTokenProviderOptions): MachineTokenProvider {
    const issuer = normalizeIssuer(options.issuer);
    if (!required(options.clientId) || !required(options.clientSecret)) {
        throw new CustomySdkError({ code: "SDK_MACHINE_CREDENTIALS_REQUIRED", service: "access", message: "clientId and clientSecret are required" });
    }
    if (!required(options.audience)) throw new CustomySdkError({ code: "SDK_MACHINE_TOKEN_AUDIENCE_REQUIRED", service: "access", message: "audience is required" });
    const endpoint = options.tokenEndpoint ?? `${issuer}/oauth/token`;
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:" || endpointUrl.origin !== new URL(issuer).origin) {
        throw new CustomySdkError({ code: "SDK_TOKEN_ENDPOINT_INVALID", service: "access", message: "token endpoint must be on the issuer origin" });
    }
    const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    const now = options.now ?? Date.now;
    const skewMs = Math.max(0, options.refreshSkewSeconds ?? 60) * 1000;
    const authorization = `Basic ${encodeBasic(options.clientId, options.clientSecret)}`;
    let cached: { token: string; refreshAt: number; expiresAt: number } | null = null;
    let pending: Promise<string> | null = null;
    let generation = 0;

    async function request(): Promise<string> {
        const started = generation;
        const body = new URLSearchParams({ grant_type: "client_credentials", audience: options.audience });
        if (options.scopes?.length) body.set("scope", options.scopes.join(" "));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
        let response: Response;
        try {
            response = await fetchImpl(endpoint, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded", authorization, accept: "application/json" },
                body: body.toString(),
                signal: controller.signal,
            });
        } catch (error) {
            throw new CustomySdkError({ code: "SDK_MACHINE_TOKEN_FAILED", service: "access", cause: error });
        } finally {
            clearTimeout(timer);
        }
        const json = await response.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
        if (!response.ok || !required(json.access_token)) {
            throw new CustomySdkError({
                code: typeof json.error === "string" && /^[a-z_]{1,64}$/.test(json.error) ? `SDK_MACHINE_TOKEN_${json.error.toUpperCase()}` : "SDK_MACHINE_TOKEN_FAILED",
                status: response.status,
                service: "access",
            });
        }
        const lifetimeMs = Math.max(0, Number(json.expires_in) || 0) * 1000;
        const issuedAt = now();
        // Solo se guarda si nadie lo invalidó mientras volaba.
        if (lifetimeMs > 0 && started === generation) {
            cached = { token: json.access_token, expiresAt: issuedAt + lifetimeMs, refreshAt: issuedAt + lifetimeMs - Math.min(skewMs, lifetimeMs / 2) };
        }
        return json.access_token;
    }

    const provider = async function machineToken(): Promise<string> {
        if (cached && cached.refreshAt > now()) return cached.token;
        pending ??= request().finally(() => { pending = null; });
        return pending;
    } as MachineTokenProvider;
    provider.invalidate = () => { cached = null; pending = null; generation += 1; };
    Object.defineProperty(provider, "audience", { value: options.audience, enumerable: true });
    return provider;
}

export type MachineTokensOptions = Readonly<{
    issuer: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint?: string;
    /** Discovery ya leído: habilita `forProduct(clave)`. */
    platform?: CustomyPlatformConfiguration;
    /** Scopes por audiencia o por clave de producto. Sin entrada, los del cliente. */
    scopes?: Readonly<Record<string, readonly string[]>>;
    fetch?: typeof fetch;
    refreshSkewSeconds?: number;
    now?: () => number;
}>;

export type MachineTokens = Readonly<{
    /** Proveedor (perezoso, uno por audiencia y scopes) para una audiencia. */
    forAudience(audience: string, scopes?: readonly string[]): MachineTokenProvider;
    /** Proveedor para un producto del discovery. */
    forProduct(product: string): MachineTokenProvider;
    /** Invalida todos los tokens cacheados. */
    invalidateAll(): void;
}>;

/** Un almacén de proveedores por audiencia para una sola identidad de app. */
export function createMachineTokens(options: MachineTokensOptions): MachineTokens {
    const issuer = normalizeIssuer(options.platform?.issuer ?? options.issuer);
    if (options.platform && normalizeIssuer(options.issuer) !== issuer) {
        throw new CustomySdkError({ code: "SDK_ISSUER_MISMATCH", service: "access", message: "platform configuration belongs to another issuer" });
    }
    const tokenEndpoint = options.tokenEndpoint ?? options.platform?.tokenEndpoint;
    const providers = new Map<string, MachineTokenProvider>();

    function forAudience(audience: string, scopes?: readonly string[]): MachineTokenProvider {
        const resolvedScopes = scopes ?? options.scopes?.[audience];
        const key = `${audience}\u0000${[...(resolvedScopes ?? [])].sort().join(" ")}`;
        let provider = providers.get(key);
        if (!provider) {
            provider = createMachineTokenProvider({
                issuer, clientId: options.clientId, clientSecret: options.clientSecret, audience,
                scopes: resolvedScopes, tokenEndpoint, fetch: options.fetch, refreshSkewSeconds: options.refreshSkewSeconds, now: options.now,
            });
            providers.set(key, provider);
        }
        return provider;
    }

    return {
        forAudience,
        forProduct(product) {
            const entry = options.platform?.products[product];
            if (!entry) throw new CustomySdkError({ code: "SDK_PRODUCT_NOT_DISCOVERED", service: product, message: `Product ${product} is not in the platform discovery` });
            return forAudience(entry.audience, options.scopes?.[product] ?? options.scopes?.[entry.audience]);
        },
        invalidateAll() {
            for (const provider of providers.values()) provider.invalidate();
        },
    };
}
