/**
 * Origen público de la app y cabeceras hacia Access. Con `publicOrigin`
 * configurado, manda él: las cabeceras reenviadas (`x-forwarded-host`…) solo
 * cuentan si el operador lo pide con `trustProxyHeaders`. Detrás de varios
 * proxies el último salto puede reescribir el host a uno interno, y un
 * origen deducido de ahí rechazaría logins legítimos. Sin `publicOrigin`, el
 * host sale de las cabeceras reenviadas o del `Host`, nunca de un host
 * interno (localhost, 0.0.0.0…).
 */
import { CustomySdkError } from "@customyai/core";
import { trimTrailingSlashes } from "./trim";

/** Ámbito de la app en Access: lo que identifica su entorno. */
export interface CustomyScopeOptions {
    /** Clave publicable del entorno (`pk_…`). */
    publishableKey?: string;
    /** Id del entorno de Access. */
    environmentId?: string;
    /** Slug de la organización. */
    organizationSlug?: string;
}

export interface CustomyOriginOptions {
    /**
     * Origen público canónico de la app (`https://app.example.com`).
     * Recomendado siempre; detrás de proxies, imprescindible. Si está, es el
     * origen que se compara (CSRF) y con el que se resuelven redirecciones y callbacks.
     */
    publicOrigin?: string;
    /**
     * Con `publicOrigin`, deja que las cabeceras reenviadas por el proxy
     * (`x-customy-forwarded-host`, `x-forwarded-host`, `x-forwarded-proto`)
     * manden sobre él (por defecto false). Solo si tu proxy las fija siempre
     * y la app sirve varios hosts públicos.
     */
    trustProxyHeaders?: boolean;
}

/** Petición mínima que leen los handlers: la `Request` estándar. */
export type RequestLike = Pick<Request, "headers" | "url" | "method">;

export function firstForwardedValue(value: string | null): string {
    return value?.split(",")[0]?.trim() || "";
}

export function hostnameFromHost(host: string): string {
    const cleaned = firstForwardedValue(host);
    if (!cleaned) return "";
    if (cleaned.startsWith("[")) return cleaned.slice(1, cleaned.indexOf("]"));
    return cleaned.split(":")[0]?.toLowerCase() || "";
}

export function isInternalHost(host: string): boolean {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"].includes(hostnameFromHost(host));
}

function configuredOrigin(options?: CustomyOriginOptions): URL | null {
    if (!options?.publicOrigin) return null;
    try {
        return new URL(new URL(options.publicOrigin).origin);
    } catch {
        return null;
    }
}

export function getPublicHost(request: RequestLike, options?: CustomyOriginOptions): string {
    const configured = configuredOrigin(options);
    if (configured && options?.trustProxyHeaders !== true) return configured.host;
    const candidates = [
        firstForwardedValue(request.headers.get("x-customy-forwarded-host")),
        firstForwardedValue(request.headers.get("x-forwarded-host")),
        firstForwardedValue(request.headers.get("host")),
        new URL(request.url).host,
    ];
    return candidates.find((host) => host && !isInternalHost(host)) || configured?.host || candidates.find(Boolean) || "";
}

export function getPublicProto(request: RequestLike, options?: CustomyOriginOptions): "http" | "https" {
    const configured = configuredOrigin(options);
    if (configured && options?.trustProxyHeaders !== true) return configured.protocol === "http:" ? "http" : "https";
    const publicHost = getPublicHost(request, options);
    if (configured && (isInternalHost(publicHost) || publicHost === configured.host)) {
        return configured.protocol === "http:" ? "http" : "https";
    }
    const forwarded = firstForwardedValue(request.headers.get("x-customy-forwarded-proto"))
        || firstForwardedValue(request.headers.get("x-forwarded-proto"));
    if (forwarded === "http" || forwarded === "https") return forwarded;
    return new URL(request.url).protocol === "http:" ? "http" : "https";
}

export function getPublicOrigin(request: RequestLike, options?: CustomyOriginOptions): string {
    return `${getPublicProto(request, options)}://${getPublicHost(request, options)}`;
}

/** URL base de Access sin barra final; debe ser https salvo loopback. */
export function accessBaseUrl(accessUrl: string | undefined): string {
    let url: URL;
    try {
        url = new URL(accessUrl ?? "");
    } catch {
        throw new CustomySdkError({ code: "SDK_ACCESS_URL_INVALID", service: "access", message: "accessUrl is required and must be an absolute URL" });
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
        throw new CustomySdkError({ code: "SDK_ACCESS_URL_INVALID", service: "access", message: "accessUrl must be https (http only for loopback)" });
    }
    return `${url.origin}${trimTrailingSlashes(url.pathname)}`;
}

export function searchParam(url: URL, names: readonly string[], fallback = ""): string {
    for (const name of names) {
        const value = url.searchParams.get(name);
        if (value) return value;
    }
    return fallback;
}

/** Cabeceras de ámbito de Access: clave publicable, entorno y organización. */
export function applyScopeHeaders(headers: Headers, url: URL, options?: CustomyScopeOptions): void {
    const publishableKey = searchParam(url, ["publishableKey", "publishable_key", "pk"], options?.publishableKey ?? "");
    const environmentId = searchParam(url, ["envId", "env_id", "environmentId", "environment_id"], options?.environmentId ?? "");
    const organizationSlug = searchParam(url, ["orgSlug", "org_slug", "orgId", "org_id", "organizationId", "organization_id"], options?.organizationSlug ?? "")
        || organizationSlugFromHeaders(headers);
    if (publishableKey) headers.set("x-publishable-key", publishableKey);
    if (environmentId) {
        headers.set("x-env-id", environmentId);
        headers.set("x-environment-id", environmentId);
    }
    if (organizationSlug) {
        // Transición: el slug viaja en las dos; `x-organization-id` es la que leen las versiones actuales de Access.
        headers.set(ORGANIZATION_SLUG_HEADER, organizationSlug);
        headers.set(LEGACY_ORGANIZATION_HEADER, organizationSlug);
    }
}

/** Cabecera con el slug de la organización (la nueva). */
export const ORGANIZATION_SLUG_HEADER = "x-organization-slug";
/** Cabecera heredada que también lleva el slug; se envía y se lee durante la transición. */
export const LEGACY_ORGANIZATION_HEADER = "x-organization-id";

/** Slug de la organización en unas cabeceras: primero `x-organization-slug`, luego la heredada `x-organization-id`. */
export function organizationSlugFromHeaders(headers: Pick<Headers, "get">): string {
    return headers.get(ORGANIZATION_SLUG_HEADER)?.trim() || headers.get(LEGACY_ORGANIZATION_HEADER)?.trim() || "";
}

export function applyNoStore(headers: Headers): void {
    headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    headers.set("pragma", "no-cache");
    headers.set("expires", "0");
}

export function jsonResponse(body: unknown, status: number, init?: { noStore?: boolean }): Response {
    const headers = new Headers({ "content-type": "application/json" });
    if (init?.noStore !== false) applyNoStore(headers);
    return new Response(JSON.stringify(body), { status, headers });
}

export function redirectResponse(location: string, status = 302): Response {
    const headers = new Headers({ location });
    applyNoStore(headers);
    return new Response(null, { status, headers });
}
