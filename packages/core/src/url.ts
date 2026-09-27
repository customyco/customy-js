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

function ipv4(hostname: string): number[] | null {
    const parts = hostname.split(".");
    if (parts.length !== 4 || !parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) return null;
    return parts.map(Number);
}

/**
 * ¿Es un host de red privada? Loopback, RFC 1918 (10/8, 172.16/12,
 * 192.168/16), IPv6 local único (`fc00::/7`), nombres `*.internal` y nombres
 * de una sola etiqueta (`customy-access`, el DNS interno de un orquestador).
 * Nunca un host público ni el link-local (`169.254/16`, metadatos de nube).
 */
export function isPrivateHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    if (!host) return false;
    if (LOOPBACK.has(host)) return true;
    if (host.startsWith("[") && host.endsWith("]")) {
        const inner = host.slice(1, -1);
        return inner === "::1" || /^f[cd][0-9a-f]{0,2}:/.test(inner);
    }
    const v4 = ipv4(host);
    if (v4) {
        const [a, b] = v4 as [number, number, number, number];
        return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    if (/^\d+(\.\d+)*$/.test(host)) return false;
    if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith("-") || host.includes("..")) return false;
    if (host === "metadata.google.internal") return false;
    return !host.includes(".") || host.endsWith(".internal");
}

export type BaseUrlOptions = {
    /** Permite `http://` hacia loopback (desarrollo y tests). */
    allowLoopbackHttp?: boolean;
    /**
     * Permite `http://` hacia hosts privados (`isPrivateHost`: RFC 1918,
     * `*.internal`, nombres de una etiqueta), nunca a uno público. Para tráfico
     * entre servicios dentro de una red privada; lo recomendado sigue siendo el
     * nombre público https.
     */
    allowPrivateHttp?: boolean;
    service?: string;
};

/**
 * URL base de un servicio: https siempre; http solo hacia loopback o hacia un
 * host privado cuando se pide expresamente.
 */
export function normalizeBaseUrl(value: string | undefined, options: BaseUrlOptions = {}): string {
    const fail = (code: string) => new CustomySdkError({ code, service: options.service, message: `Customy${options.service ? ` ${options.service}` : ""} base URL is missing or invalid` });
    if (!value) throw fail("SDK_BASE_URL_REQUIRED");
    let url: URL;
    try { url = new URL(value); } catch { throw fail("SDK_BASE_URL_INVALID"); }
    const loopbackHttp = options.allowLoopbackHttp === true && url.protocol === "http:" && LOOPBACK.has(url.hostname);
    const privateHttp = options.allowPrivateHttp === true && url.protocol === "http:" && isPrivateHost(url.hostname);
    if ((url.protocol !== "https:" && !loopbackHttp && !privateHttp) || url.username || url.password || url.search || url.hash) throw fail("SDK_BASE_URL_INVALID");
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
