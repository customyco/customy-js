/**
 * Verificación de una petición entrante sobre `Request` estándar, más el
 * adaptador para el `IncomingMessage` de Node. Cada petición trae exactamente
 * una credencial: `Authorization: Bearer <token de Access>` o la assertion del
 * BFF (`x-customy-actor`). Con las dos, o ninguna, no hay principal.
 *
 * Resultado: el principal, `null` si la credencial no vale (→ 401), o una
 * excepción `ACCESS_UNAVAILABLE` si Access no responde para decidir (→ 503).
 */
import { CustomySdkError } from "@customyai/core";
import { assertActorAssertionSecret, ACTOR_ASSERTION_HEADER, verifyActorAssertion, type ActorAssertion } from "./assertion";
import { isAccessUnavailable, type MachinePrincipal, type TokenVerifier } from "./tokens";

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/** Lee `Authorization: Bearer <jwt>` de una Request estándar. */
export function bearerToken(request: Request): string | null {
    const header = request.headers.get("authorization");
    if (!header || header.length > 16_400) return null;
    return BEARER.exec(header)?.[1] ?? null;
}

export type VerifyRequestOptions<P> = Readonly<{
    /** Verificador del Bearer (`createMachineTokenVerifier` o `createAccessTokenVerifier`). */
    bearer?: TokenVerifier<P>;
    /** Scopes que debe llevar el principal del Bearer. */
    requiredScopes?: readonly string[];
    /** Acepta la assertion del BFF firmada con este secreto para esta audiencia. */
    assertion?: Readonly<{ secret: string; audience: string; header?: string; now?: () => number }>;
}>;

export type RequestPrincipal<P> =
    | Readonly<{ kind: "bearer"; principal: P }>
    | Readonly<{ kind: "assertion"; actor: ActorAssertion }>;

function hasScopes(principal: unknown, required: readonly string[]): boolean {
    if (required.length === 0) return true;
    const scopes = (principal as { scopes?: unknown }).scopes;
    return Array.isArray(scopes) && required.every((scope) => scopes.includes(scope));
}

/**
 * Resuelve el principal de una petición, o `null`. Nunca lanza por
 * credenciales inválidas ni por un secreto de assertion mal configurado (eso
 * se detecta al arrancar con `createRequestVerifier`). Solo relanza
 * `ACCESS_UNAVAILABLE` del verificador del Bearer: la app responde 503.
 */
export async function verifyRequest<P>(request: Request, options: VerifyRequestOptions<P>): Promise<RequestPrincipal<P> | null> {
    const assertionHeader = (options.assertion?.header ?? ACTOR_ASSERTION_HEADER).toLowerCase();
    const authorization = request.headers.get("authorization");
    const assertion = request.headers.get(assertionHeader);
    if (authorization !== null && assertion !== null) return null;

    if (authorization !== null) {
        if (!options.bearer) return null;
        const token = bearerToken(request);
        if (!token) return null;
        let principal: P | null;
        try { principal = await options.bearer(token); } catch (error) {
            if (isAccessUnavailable(error)) throw error;
            return null;
        }
        if (!principal || !hasScopes(principal, options.requiredScopes ?? [])) return null;
        return { kind: "bearer", principal };
    }

    if (assertion !== null && options.assertion) {
        let path: string;
        try { path = new URL(request.url).pathname; } catch { return null; }
        let actor: ActorAssertion | null;
        try {
            actor = await verifyActorAssertion(assertion, {
                secret: options.assertion.secret,
                audience: options.assertion.audience,
                method: request.method,
                path,
                now: options.assertion.now,
            });
        } catch {
            return null;
        }
        return actor ? { kind: "assertion", actor } : null;
    }
    return null;
}

/**
 * `verifyRequest` con las opciones comprobadas al construir: un secreto de
 * assertion ausente o corto lanza `SDK_ASSERTION_SECRET_INVALID` al arrancar,
 * no un 401 en cada petición.
 *
 * ```ts
 * const verify = createRequestVerifier({ bearer, assertion: { secret: process.env.ACTOR_SECRET!, audience: "acme-api" } });
 * try {
 *   const auth = await verify(request);
 *   if (!auth) return new Response(null, { status: 401 });
 * } catch (error) {
 *   if (isAccessUnavailable(error)) return new Response(null, { status: 503 });
 *   throw error;
 * }
 * ```
 */
export function createRequestVerifier<P>(options: VerifyRequestOptions<P>): (request: Request) => Promise<RequestPrincipal<P> | null> {
    if (options.assertion) {
        assertActorAssertionSecret(options.assertion.secret);
        if (typeof options.assertion.audience !== "string" || options.assertion.audience.length === 0) {
            throw new CustomySdkError({ code: "SDK_ASSERTION_INVALID", message: "assertion audience is required" });
        }
    }
    return (request) => verifyRequest(request, options);
}

/** Verifica el Bearer de una Request como token de máquina y exige los scopes indicados. */
export async function verifyMachineRequest(
    request: Request,
    verify: TokenVerifier<MachinePrincipal>,
    requiredScopes: readonly string[] = [],
): Promise<MachinePrincipal | null> {
    const token = bearerToken(request);
    if (!token) return null;
    const principal = await verify(token).catch((error: unknown) => {
        if (isAccessUnavailable(error)) throw error;
        return null;
    });
    if (!principal) return null;
    return hasScopes(principal, requiredScopes) ? principal : null;
}

/** Lo que se usa de un `IncomingMessage` de Node (sin depender de sus tipos). */
export type IncomingMessageLike = Readonly<{
    method?: string;
    url?: string;
    headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}>;

/**
 * Convierte un `IncomingMessage` en una `Request` estándar con método, URL y
 * cabeceras (sin cuerpo: basta para verificar). `origin` solo da forma a la
 * URL; la verificación usa la ruta.
 */
export function requestFromIncomingMessage(message: IncomingMessageLike, options: Readonly<{ origin?: string }> = {}): Request {
    const headers = new Headers();
    for (const [name, value] of Object.entries(message.headers)) {
        if (value === undefined || name.startsWith(":")) continue;
        for (const item of typeof value === "string" ? [value] : value) {
            try { headers.append(name, item); } catch { /* cabecera no representable: se ignora */ }
        }
    }
    const url = new URL(message.url && message.url.startsWith("/") ? message.url : "/", options.origin ?? "http://localhost");
    return new Request(url, { method: (message.method ?? "GET").toUpperCase(), headers });
}

/** `verifyRequest` para un `IncomingMessage` de Node. */
export function verifyIncomingMessage<P>(message: IncomingMessageLike, options: VerifyRequestOptions<P>): Promise<RequestPrincipal<P> | null> {
    let request: Request;
    try { request = requestFromIncomingMessage(message); } catch { return Promise.resolve(null); }
    return verifyRequest(request, options);
}
