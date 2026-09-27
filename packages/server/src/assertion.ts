/**
 * Assertion de actor BFF → API. La web de una app valida la sesión del
 * navegador contra Access y, en vez de reenviar la cookie, firma una assertion
 * HMAC-SHA256 de vida corta ligada a método, ruta y audiencia. La API la
 * verifica sin ver nunca la credencial del navegador.
 *
 * Formato: `<payload base64url>.<mac base64url>`; el payload es JSON con
 * `iss`, `sub`, `org`/`env` (tenant), `aud`, `m`, `p`, `iat`, `exp`.
 * Web Crypto: funciona igual en node y edge.
 */
import { CustomySdkError } from "@customyai/core";

export const ACTOR_ASSERTION_HEADER = "x-customy-actor";
/** Vida máxima de una assertion (s). */
export const MAX_ASSERTION_TTL_SECONDS = 60;
const DEFAULT_TTL_SECONDS = 30;
const MIN_SECRET_BYTES = 32;
const MAX_ASSERTION_LENGTH = 4_096;

export type ActorAssertion = Readonly<{
    /** Issuer de Access que autenticó la sesión. */
    issuer: string;
    /** Usuario (`sub`) de la sesión. */
    subject: string;
    organizationId?: string;
    environmentId: string;
}>;

export type ActorAssertionOptions = Readonly<{
    /** Secreto compartido BFF ↔ API (≥ 32 bytes). */
    secret: string;
    /** Audiencia: la API que debe aceptarla (p. ej. `acme-api`). */
    audience: string;
    method: string;
    /** Ruta sin query (`/api/items`). */
    path: string;
    now?: () => number;
}>;

type Payload = {
    iss: string;
    sub: string;
    org?: string;
    env: string;
    aud: string;
    m: string;
    p: string;
    iat: number;
    exp: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
    try {
        const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4));
        const bytes = new Uint8Array(new ArrayBuffer(binary.length));
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        return null;
    }
}

function subtle(): SubtleCrypto {
    const api = (globalThis as { crypto?: Crypto }).crypto?.subtle;
    if (!api) throw new CustomySdkError({ code: "SDK_CRYPTO_UNAVAILABLE", message: "Web Crypto is not available" });
    return api;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
    if (typeof secret !== "string" || encoder.encode(secret).byteLength < MIN_SECRET_BYTES) {
        throw new CustomySdkError({ code: "SDK_ASSERTION_SECRET_INVALID", message: `assertion secret must be at least ${MIN_SECRET_BYTES} bytes` });
    }
    return subtle().importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function validPath(path: string): boolean {
    return typeof path === "string" && path.startsWith("/") && !path.includes("?") && !path.includes("#") && path.length <= 2048;
}

/** Firma una assertion para una petición concreta (lado BFF). */
export async function signActorAssertion(actor: ActorAssertion, options: ActorAssertionOptions & Readonly<{ ttlSeconds?: number }>): Promise<string> {
    const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    if (!actor.issuer?.startsWith("https://") || !actor.subject || !actor.environmentId || !options.audience || !validPath(options.path)
        || !Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_ASSERTION_TTL_SECONDS) {
        throw new CustomySdkError({ code: "SDK_ASSERTION_INVALID", message: "actor, audience, path or ttl is invalid" });
    }
    const issuedAt = Math.floor((options.now?.() ?? Date.now()) / 1000);
    const payload: Payload = {
        iss: actor.issuer,
        sub: actor.subject,
        ...(actor.organizationId ? { org: actor.organizationId } : {}),
        env: actor.environmentId,
        aud: options.audience,
        m: options.method.toUpperCase(),
        p: options.path,
        iat: issuedAt,
        exp: issuedAt + ttl,
    };
    const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
    const mac = new Uint8Array(await subtle().sign("HMAC", await hmacKey(options.secret), encoder.encode(encoded)));
    return `${encoded}.${toBase64Url(mac)}`;
}

/** Verifica una assertion (lado API). `null` si no es válida para esta petición. */
export async function verifyActorAssertion(assertion: string | null | undefined, options: ActorAssertionOptions): Promise<ActorAssertion | null> {
    if (typeof assertion !== "string" || assertion.length > MAX_ASSERTION_LENGTH) return null;
    const key = await hmacKey(options.secret);
    const parts = assertion.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const mac = fromBase64Url(parts[1]);
    if (!mac || mac.byteLength !== 32) return null;
    // `verify` compara en tiempo constante.
    if (!(await subtle().verify("HMAC", key, mac, encoder.encode(parts[0])))) return null;
    const raw = fromBase64Url(parts[0]);
    if (!raw) return null;
    let payload: Partial<Payload>;
    try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        payload = parsed as Partial<Payload>;
    } catch {
        return null;
    }
    const second = Math.floor((options.now?.() ?? Date.now()) / 1000);
    if (payload.aud !== options.audience || payload.m !== options.method.toUpperCase() || payload.p !== options.path) return null;
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if (payload.iat! > second + 5 || payload.exp! < second || payload.exp! - payload.iat! > MAX_ASSERTION_TTL_SECONDS) return null;
    if (typeof payload.iss !== "string" || !payload.iss.startsWith("https://") || typeof payload.sub !== "string" || !payload.sub
        || typeof payload.env !== "string" || !payload.env || (payload.org !== undefined && (typeof payload.org !== "string" || !payload.org))) return null;
    return {
        issuer: payload.iss,
        subject: payload.sub,
        ...(payload.org ? { organizationId: payload.org } : {}),
        environmentId: payload.env,
    };
}
