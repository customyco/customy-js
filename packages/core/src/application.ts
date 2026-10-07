/**
 * Descubrimiento del alcance de una aplicación: de una llave publicable o de un cliente de máquina
 * (M2M) salen la organización, el entorno, la aplicación de Access y los endpoints de producto.
 *
 * Una app configura solo el issuer (`CUSTOMY_ISSUER`, el único valor de arranque) y una credencial; ningún
 * id de organización, de entorno ni de aplicación, ni la URL de ningún producto, se escribe a mano.
 *
 * ```ts
 * const app = await discoverApplication({ issuer: process.env.CUSTOMY_ISSUER!, publishableKey: process.env.NEXT_PUBLIC_CUSTOMY_PUBLISHABLE_KEY });
 * app.organizationId; app.environmentId; app.applicationId; app.products.send?.baseUrl;
 * ```
 *
 * Lee `GET /api/v1/application` de Access, que solo devuelve identificadores del propio entorno de la
 * credencial (con una llave publicable, los mismos que ya publica `/api/public/auth-config`).
 */
import { discoverPlatform, type CustomyPlatformConfiguration, type CustomyProductEndpoint, type DiscoverOptions } from "./discovery";
import { CustomySdkError } from "./errors";
import type { MachineTokens } from "./machine-token";
import { createTransport, type AccessTokenProvider } from "./transport";

export const ACCESS_APPLICATION_PATH = "/api/v1/application";
const ACCESS_AUDIENCE = "customy-access";
const ACCESS_APPLICATION_SCOPE = "capabilities:read";
const DEFAULT_TTL_MS = 300_000;

export type CustomyApplication = Readonly<{
    /** Issuer de Access: también la URL de Access del entorno. */
    issuer: string;
    accessUrl: string;
    /** `staging` / `production` si el entorno lo anuncia. */
    environment?: string;
    organizationId: string;
    organizationSlug?: string;
    environmentId: string;
    /** Tipo del entorno en Access (`production`, `staging`…). */
    environmentType?: string;
    /** Aplicación de Access a la que pertenece el entorno. */
    applicationId: string;
    /** Clave del manifiesto de la app conectada, si el entorno publica uno. */
    applicationKey?: string;
    publishableKey?: string;
    /** Productos del discovery: URL pública y audiencia de cada uno. */
    products: Readonly<Record<string, CustomyProductEndpoint>>;
    /** El discovery completo, listo para `createMachineTokens` y los clientes de producto. */
    platform: CustomyPlatformConfiguration;
}>;

export type DiscoverApplicationOptions = DiscoverOptions & Readonly<{
    /** Issuer de Access (`CUSTOMY_ISSUER`). */
    issuer: string;
    /** Llave publicable del entorno (pública por diseño; sirve en el navegador y en el servidor). */
    publishableKey?: string;
    /** Cliente de máquina de la app (`createMachineTokens`): se pide con la audiencia `customy-access` y `capabilities:read`. */
    machineTokens?: MachineTokens;
    /** Otra credencial de Access: token de usuario o de máquina, o su proveedor. */
    accessToken?: string | AccessTokenProvider;
    /** Discovery ya leído: evita pedirlo otra vez. */
    platform?: CustomyPlatformConfiguration;
    /** Vigencia de la caché en memoria, en ms (por defecto 5 min; 0 la desactiva). */
    ttlMs?: number;
    now?: () => number;
}>;

type CacheEntry = { expiresAt: number; value: CustomyApplication };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CustomyApplication>>();
const identities = new WeakMap<object, number>();
let identityCounter = 0;

function identityOf(value: object): number {
    let id = identities.get(value);
    if (id === undefined) { id = ++identityCounter; identities.set(value, id); }
    return id;
}

/** Vacía la caché en memoria (tests, rotación de credenciales). */
export function clearApplicationCache(): void {
    cache.clear();
    inflight.clear();
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function invalid(detail: string): CustomySdkError {
    return new CustomySdkError({ code: "SDK_DISCOVERY_INVALID", service: "access", message: `Customy application document is invalid: ${detail}` });
}

/** Valida la respuesta de `GET /api/v1/application` y la une al discovery de plataforma. */
export function parseApplicationScope(platform: CustomyPlatformConfiguration, body: unknown): CustomyApplication {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("not an object");
    const record = body as Record<string, unknown>;
    const organizationId = text(record.organizationId);
    const environmentId = text(record.environmentId);
    const applicationId = text(record.applicationId);
    if (!organizationId) throw invalid("organizationId");
    if (!environmentId) throw invalid("environmentId");
    if (!applicationId) throw invalid("applicationId");
    const organizationSlug = text(record.organizationSlug);
    const environmentType = text(record.environmentType);
    const applicationKey = text(record.applicationKey);
    const publishableKey = text(record.publishableKey);
    return {
        issuer: platform.issuer,
        accessUrl: platform.issuer,
        ...(platform.environment ? { environment: platform.environment } : {}),
        organizationId,
        ...(organizationSlug ? { organizationSlug } : {}),
        environmentId,
        ...(environmentType ? { environmentType } : {}),
        applicationId,
        ...(applicationKey ? { applicationKey } : {}),
        ...(publishableKey ? { publishableKey } : {}),
        products: platform.products,
        platform,
    };
}

/**
 * Descubre dónde vive la app: organización, entorno, aplicación y productos. Falla con
 * `CustomySdkError` (`SDK_CREDENTIALS_REQUIRED`, `SDK_DISCOVERY_FAILED`, `SDK_DISCOVERY_INVALID`,
 * `APPLICATION_NOT_FOUND`, `UNAUTHENTICATED`…); un fallo no se cachea.
 */
export async function discoverApplication(options: DiscoverApplicationOptions): Promise<CustomyApplication> {
    const publishableKey = text(options.publishableKey)?.trim();
    const credentials = [options.machineTokens, options.accessToken].filter((value) => value !== undefined);
    if (credentials.length > 1) throw new CustomySdkError({ code: "SDK_CREDENTIALS_AMBIGUOUS", service: "access", message: "Pass either accessToken or machineTokens, not both" });
    if (!publishableKey && credentials.length === 0) {
        throw new CustomySdkError({ code: "SDK_CREDENTIALS_REQUIRED", service: "access", message: "discoverApplication needs a publishableKey, machineTokens or an accessToken" });
    }

    const now = options.now ?? Date.now;
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const credentialId = options.machineTokens ? `m:${identityOf(options.machineTokens)}`
        : typeof options.accessToken === "function" ? `p:${identityOf(options.accessToken)}`
            : options.accessToken !== undefined ? null // un token de texto no sirve de clave: no se cachea
                : `k:${publishableKey}`;
    const cacheKey = credentialId === null || ttlMs <= 0 ? null : `${options.issuer.replace(/\/$/, "")}|${credentialId}|${options.platform ? "p" : ""}`;

    if (cacheKey) {
        const hit = cache.get(cacheKey);
        if (hit && hit.expiresAt > now()) return hit.value;
        if (hit) cache.delete(cacheKey);
        const pending = inflight.get(cacheKey);
        if (pending) return pending;
    }

    const load = async (): Promise<CustomyApplication> => {
        const platform = options.platform ?? await discoverPlatform(options.issuer, { fetch: options.fetch, signal: options.signal, timeoutMs: options.timeoutMs });
        const credential = options.machineTokens
            ? options.machineTokens.forAudience(ACCESS_AUDIENCE, [ACCESS_APPLICATION_SCOPE])
            : options.accessToken;
        const transport = createTransport({
            baseUrl: platform.issuer,
            service: "access",
            accessToken: credential,
            headers: credential === undefined && publishableKey ? { "x-publishable-key": publishableKey } : undefined,
            fetch: options.fetch,
            timeoutMs: options.timeoutMs ?? 10_000,
        });
        const body = await transport.get<unknown>(ACCESS_APPLICATION_PATH, { signal: options.signal });
        return parseApplicationScope(platform, body);
    };

    if (!cacheKey) return load();
    const request = load().then((value) => {
        cache.set(cacheKey, { expiresAt: now() + ttlMs, value });
        return value;
    }).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, request);
    return request;
}
