/**
 * @customyai/access/flags/edge — asignación de variantes en el borde (middleware
 * de Next.js, Workers, Vercel Edge) sin parpadeo: se lee la instantánea pública,
 * se evalúa con el mismo motor que el SDK (`flags-eval` + hash murmur3 de
 * `experiments-core`), se fija una cookie de unidad estable y las asignaciones
 * viajan al render del servidor en una cabecera de la petición. `FlagsProvider`
 * de `@customyai/access/flags/react` las recoge y la hidratación coincide con lo
 * que se pintó. Isomórfico: solo `fetch`, `Request`/`Response` y Web Crypto.
 *
 * ```ts
 * // middleware.ts
 * const flags = createEdgeFlags({ publishableKey: process.env.NEXT_PUBLIC_CUSTOMY_KEY! });
 * export async function middleware(request: NextRequest) {
 *   const edge = await flags.resolve(request, { flags: ["hero.layout"] });
 *   const response = NextResponse.next({ request: { headers: edge.requestHeaders } });
 *   edge.applyTo(response);
 *   return response;
 * }
 * // app/layout.tsx (servidor)
 * const bootstrap = decodeBootstrap((await headers()).get(EDGE_BOOTSTRAP_HEADER));
 * ```
 *
 * Si la instantánea no se puede leer, el borde sigue con la última que tenga
 * (fail-static) y, sin ninguna, no asigna: la app pinta su valor por defecto.
 * No registra exposiciones: las registra el cliente al renderizar.
 */
import type { EvalContext, FlagDefinition, SegmentDefinition } from "@customyai/flags-eval";
import { createBootstrap, decodeBootstrap, encodeBootstrap, type FlagsBootstrap } from "./flags-bootstrap";

export { createBootstrap, decodeBootstrap, encodeBootstrap } from "./flags-bootstrap";
export type { BootstrapFlag, BootstrapSnapshot, CreateBootstrapOptions, FlagsBootstrap } from "./flags-bootstrap";

/** Cabecera de petición con las asignaciones (base64url del JSON de `FlagsBootstrap`). */
export const EDGE_BOOTSTRAP_HEADER = "x-customy-flags";
export const EDGE_UNIT_COOKIE = "customy_uid";
/** Por encima de esto la cabecera no cabe en los límites habituales de los proxies: no se envía. */
const MAX_HEADER_BYTES = 6_000;
const DEFAULT_ORIGIN = "https://access.customy.ai";

export type EdgeSnapshot = { version: number; etag?: string; flags: FlagDefinition[]; segments?: SegmentDefinition[] };

export type EdgeFlagsOptions = Readonly<{
    /** Clave publicable del entorno (vista pública). */
    publishableKey: string;
    /** Origen de Access o de Experiments (por defecto el público de Access). */
    baseUrl?: string;
    /** Lee por CDN (`latest.json`, caché de borde) en vez del origen. */
    cdn?: boolean | { baseUrl: string };
    fetch?: typeof fetch;
    /** Instantánea inicial (p. ej. incluida en el build): el primer visitante no espera a la red. */
    snapshot?: EdgeSnapshot;
    /** Cuánto se reutiliza la instantánea antes de revalidarla con ETag (5 s). */
    ttlMs?: number;
    /** Nombre de la cookie de unidad. */
    cookieName?: string;
    /** Duración de la cookie en segundos (1 año). */
    cookieMaxAgeSeconds?: number;
    /** Clave de unidad propia (usuario autenticado); si devuelve algo, se usa en vez de la cookie y no se fija ninguna. */
    unitKey?: (request: Request) => string | undefined | null;
    /** Atributos del contexto de evaluación (país, plan, dispositivo…). */
    attributes?: (request: Request) => EvalContext["attributes"];
    /** Reloj, para pruebas. */
    now?: () => number;
}>;

export type EdgeResolveOptions = { flags?: readonly string[] };

export type EdgeFlagsResult = {
    unitKey: string;
    bootstrap?: FlagsBootstrap;
    /** Cabeceras de la petición con `x-customy-flags`, para `NextResponse.next({ request: { headers } })`. */
    requestHeaders: Headers;
    /** `Set-Cookie` si hubo que crear la cookie de unidad. */
    setCookie?: string;
    /** Añade `Set-Cookie` (si hace falta) a la respuesta y la devuelve. */
    applyTo<T extends { headers: Headers }>(response: T): T;
};

function readCookie(header: string | null, name: string): string | undefined {
    for (const part of (header ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
    }
    return undefined;
}

export type EdgeFlags = {
    snapshot(): Promise<EdgeSnapshot | undefined>;
    resolve(request: Request, options?: EdgeResolveOptions): Promise<EdgeFlagsResult>;
};

export function createEdgeFlags(options: EdgeFlagsOptions): EdgeFlags {
    const fetchImpl = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    const origin = (typeof options.cdn === "object" ? options.cdn.baseUrl : options.baseUrl ?? DEFAULT_ORIGIN).replace(/\/$/, "");
    const url = options.cdn
        ? `${origin}/api/v1/flags/cdn/${encodeURIComponent(options.publishableKey)}/latest.json`
        : `${origin}/api/v1/flags/snapshot`;
    const ttlMs = options.ttlMs ?? 5_000;
    const now = options.now ?? Date.now;
    const cookieName = options.cookieName ?? EDGE_UNIT_COOKIE;
    let current = options.snapshot;
    let etag = options.snapshot?.etag;
    let checkedAt = options.snapshot ? now() : 0;
    let inflight: Promise<void> | undefined;

    async function revalidate(): Promise<void> {
        if (!fetchImpl) return;
        try {
            const headers: Record<string, string> = options.cdn ? {} : { accept: "application/json", "x-publishable-key": options.publishableKey };
            if (etag && !options.cdn) headers["if-none-match"] = etag;
            const response = await fetchImpl(url, { method: "GET", headers });
            if (response.status === 304 || !response.ok) return;
            const next = await response.json() as EdgeSnapshot;
            // Nunca se retrocede ni se acepta una forma inválida.
            if (!Array.isArray(next.flags) || typeof next.version !== "number" || (current && next.version < current.version)) return;
            current = next;
            etag = response.headers.get("etag") ?? next.etag;
        } catch {
            /* fail-static: se conserva la anterior */
        } finally {
            checkedAt = now();
        }
    }

    async function snapshot(): Promise<EdgeSnapshot | undefined> {
        if (!current) { await (inflight ??= revalidate().finally(() => { inflight = undefined; })); return current; }
        if (now() - checkedAt >= ttlMs) {
            // Revalida sin hacer esperar a la petición: sirve la que tiene (stale-while-revalidate).
            inflight ??= revalidate().finally(() => { inflight = undefined; });
        }
        return current;
    }

    async function resolve(request: Request, resolveOptions: EdgeResolveOptions = {}): Promise<EdgeFlagsResult> {
        const own = options.unitKey?.(request) || undefined;
        const existing = own ?? readCookie(request.headers.get("cookie"), cookieName);
        const unitKey = existing ?? globalThis.crypto.randomUUID();
        const maxAge = options.cookieMaxAgeSeconds ?? 31_536_000;
        const setCookie = existing ? undefined : `${cookieName}=${encodeURIComponent(unitKey)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
        const requestHeaders = new Headers(request.headers);
        requestHeaders.delete(EDGE_BOOTSTRAP_HEADER); // nunca se confía en una cabecera que traiga el cliente
        const loaded = await snapshot();
        let bootstrap: FlagsBootstrap | undefined;
        if (loaded) {
            bootstrap = createBootstrap(loaded, { key: unitKey, attributes: options.attributes?.(request) }, { flags: resolveOptions.flags });
            const encoded = encodeBootstrap(bootstrap);
            if (encoded.length <= MAX_HEADER_BYTES) requestHeaders.set(EDGE_BOOTSTRAP_HEADER, encoded);
            else bootstrap = undefined;
        }
        return {
            unitKey, bootstrap, requestHeaders, setCookie,
            applyTo(response) {
                if (setCookie) response.headers.append("set-cookie", setCookie);
                return response;
            },
        };
    }

    return { snapshot, resolve };
}
