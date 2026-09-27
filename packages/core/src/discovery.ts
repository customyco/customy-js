/**
 * Discovery de un entorno de Customy (`/.well-known/customy-configuration`):
 * issuer, JWKS, token endpoint y, por producto, su URL pública y la audiencia
 * que se pide en `client_credentials`. Una app configura solo sus credenciales;
 * ningún host se escribe a mano.
 */
import { CustomySdkError } from "./errors";
import { normalizeIssuer } from "./url";

export type CustomyProductEndpoint = Readonly<{ baseUrl: string; audience: string }>;

export type CustomyPlatformConfiguration = Readonly<{
    issuer: string;
    /** `staging` / `production` si el entorno lo anuncia. */
    environment?: string;
    jwksUri: string;
    tokenEndpoint: string;
    grantTypesSupported: readonly string[];
    products: Readonly<Record<string, CustomyProductEndpoint>>;
}>;

export type DiscoverOptions = Readonly<{
    fetch?: typeof fetch;
    signal?: AbortSignal;
    /** Límite de la petición (por defecto 10 s). */
    timeoutMs?: number;
}>;

function sameOriginHttps(value: unknown, issuer: string): value is string {
    if (typeof value !== "string") return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === new URL(issuer).origin && !url.username && !url.password;
    } catch {
        return false;
    }
}

function httpsUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch {
        return false;
    }
}

/**
 * Valida un documento de discovery ya leído. El issuer debe ser exactamente el
 * pedido, y JWKS y token endpoint viven en su mismo origen: un discovery
 * manipulado no puede desviar las credenciales a otro host.
 */
export function parsePlatformConfiguration(issuer: string, body: unknown): CustomyPlatformConfiguration {
    const base = normalizeIssuer(issuer);
    const invalid = (detail: string) => new CustomySdkError({ code: "SDK_DISCOVERY_INVALID", service: "access", message: `Customy discovery document is invalid: ${detail}` });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("not an object");
    const record = body as Record<string, unknown>;
    if (record.issuer !== base) throw invalid("issuer mismatch");
    const tokenEndpoint = record.token_endpoint;
    if (!sameOriginHttps(tokenEndpoint, base)) throw invalid("token_endpoint");
    const jwksUri = record.jwks_uri ?? `${base}/oauth/jwks.json`;
    if (!sameOriginHttps(jwksUri, base)) throw invalid("jwks_uri");
    const products: Record<string, CustomyProductEndpoint> = {};
    const rawProducts = record.products && typeof record.products === "object" ? record.products as Record<string, unknown> : {};
    for (const [name, product] of Object.entries(rawProducts)) {
        if (!product || typeof product !== "object") continue;
        const { base_url: baseUrl, audience } = product as Record<string, unknown>;
        if (httpsUrl(baseUrl) && typeof audience === "string" && audience.length > 0) {
            products[name] = { baseUrl: baseUrl.replace(/\/$/, ""), audience };
        }
    }
    const grants = Array.isArray(record.grant_types_supported) ? record.grant_types_supported.filter((grant): grant is string => typeof grant === "string") : [];
    return {
        issuer: base,
        ...(typeof record.environment === "string" ? { environment: record.environment } : {}),
        jwksUri,
        tokenEndpoint,
        grantTypesSupported: grants,
        products,
    };
}

/** Lee y valida el discovery del issuer. */
export async function discoverPlatform(issuer: string, options: DiscoverOptions | typeof fetch = {}): Promise<CustomyPlatformConfiguration> {
    const resolved: DiscoverOptions = typeof options === "function" ? { fetch: options } : options;
    const base = normalizeIssuer(issuer);
    const fetchImpl = resolved.fetch ?? globalThis.fetch.bind(globalThis);
    const controller = new AbortController();
    const onAbort = () => controller.abort(resolved.signal?.reason);
    resolved.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), resolved.timeoutMs ?? 10_000);
    try {
        let response: Response;
        try {
            response = await fetchImpl(`${base}/.well-known/customy-configuration`, { headers: { accept: "application/json" }, signal: controller.signal });
        } catch (error) {
            throw new CustomySdkError({ code: "SDK_DISCOVERY_FAILED", service: "access", cause: error });
        }
        if (!response.ok) throw new CustomySdkError({ code: "SDK_DISCOVERY_FAILED", status: response.status, service: "access" });
        let body: unknown;
        try { body = await response.json(); }
        catch (error) { throw new CustomySdkError({ code: "SDK_DISCOVERY_INVALID", status: response.status, service: "access", cause: error }); }
        return parsePlatformConfiguration(base, body);
    } finally {
        clearTimeout(timer);
        resolved.signal?.removeEventListener("abort", onAbort);
    }
}
