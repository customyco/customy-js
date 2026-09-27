import { CustomySdkError } from "./errors";

/**
 * Issuer de Customy Access: https, sin credenciales, query ni fragmento, sin
 * barra final. Es el valor que se compara con `iss`, así que no se reescribe.
 */
export function normalizeIssuer(issuer: string): string {
    let url: URL;
    try { url = new URL(issuer); } catch { throw new CustomySdkError({ code: "SDK_ISSUER_INVALID", message: "Customy issuer must be an absolute https URL" }); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new CustomySdkError({ code: "SDK_ISSUER_INVALID", message: "Customy issuer must be an absolute https URL" });
    }
    return issuer.replace(/\/$/, "");
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * URL base de un servicio: https siempre; http solo hacia loopback cuando se
 * pide expresamente (desarrollo y tests).
 */
export function normalizeBaseUrl(value: string | undefined, options: { allowLoopbackHttp?: boolean; service?: string } = {}): string {
    const fail = (code: string) => new CustomySdkError({ code, service: options.service, message: `Customy${options.service ? ` ${options.service}` : ""} base URL is missing or invalid` });
    if (!value) throw fail("SDK_BASE_URL_REQUIRED");
    let url: URL;
    try { url = new URL(value); } catch { throw fail("SDK_BASE_URL_INVALID"); }
    const loopbackHttp = options.allowLoopbackHttp === true && url.protocol === "http:" && LOOPBACK.has(url.hostname);
    if ((url.protocol !== "https:" && !loopbackHttp) || url.username || url.password || url.search || url.hash) throw fail("SDK_BASE_URL_INVALID");
    return url.toString().replace(/\/$/, "");
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

/** Une base, ruta relativa y query. La ruta no puede escapar de la base. */
export function buildUrl(baseUrl: string, path: string, query?: Query, service?: string): URL {
    if (!path.startsWith("/") || path.startsWith("//") || path.split("?")[0]!.split("/").some((segment) => segment === ".." || segment === ".")) {
        throw new CustomySdkError({ code: "SDK_PATH_INVALID", service, message: "Request path must be absolute and must not traverse" });
    }
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values as readonly QueryValue[]) {
            if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
        }
    }
    return url;
}
