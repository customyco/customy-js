/**
 * Lectura del perfil del usuario con su propio token (`GET {issuer}/oauth/userinfo`).
 * Es la fuente de `email_verified` para un token Bearer, que no lo lleva como claim:
 * las apps lo usan para exigir correo verificado antes de cobrar o activar algo sensible.
 *
 * `null` si Access no reconoce el token (→ 401); `ACCESS_UNAVAILABLE` (→ 503) si no
 * contesta (red, plazo, 429, 5xx), para no confundir «no verificado» con «no sé».
 */
import { CustomySdkError, normalizeIssuer } from "@customyai/core";
import { ACCESS_UNAVAILABLE } from "./tokens";

export type UserInfo = Readonly<{
    subject: string;
    email: string | null;
    /** `null` si Access no lo informa; nunca se asume verificado. */
    emailVerified: boolean | null;
    name: string | null;
}>;

export type UserInfoOptions = Readonly<{
    issuer: string;
    /** Por defecto `${issuer}/oauth/userinfo`; debe estar en el origen del issuer. */
    endpoint?: string;
    fetch?: typeof fetch;
    /** Por defecto 3 s. */
    timeoutMs?: number;
    /** Si se indica, un perfil de otro sujeto se rechaza (`null`). */
    expectedSubject?: string;
}>;

function unavailable(cause: unknown): CustomySdkError {
    return new CustomySdkError({ code: ACCESS_UNAVAILABLE, status: 503, service: "access", message: "Customy Access is unavailable to read the user profile", cause });
}

export async function fetchUserInfo(accessToken: string, options: UserInfoOptions): Promise<UserInfo | null> {
    const issuer = normalizeIssuer(options.issuer);
    const endpoint = new URL(options.endpoint ?? `${issuer}/oauth/userinfo`);
    if (endpoint.protocol !== "https:" || endpoint.origin !== new URL(issuer).origin) {
        throw new CustomySdkError({ code: "SDK_USERINFO_ENDPOINT_INVALID", message: "userinfo endpoint must be on the issuer origin" });
    }
    if (!accessToken) return null;
    const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3_000);
    try {
        const response = await fetchImpl(endpoint, {
            method: "GET",
            headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
            redirect: "error",
            signal: controller.signal,
        });
        if (response.status === 429 || response.status >= 500) throw unavailable(new CustomySdkError({ code: `HTTP_${response.status}`, status: response.status, service: "access" }));
        if (!response.ok) return null;
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!body || typeof body !== "object" || typeof body.sub !== "string" || !body.sub) {
            throw unavailable(new CustomySdkError({ code: "SDK_USERINFO_INVALID", status: response.status, service: "access" }));
        }
        if (options.expectedSubject !== undefined && body.sub !== options.expectedSubject) return null;
        return {
            subject: body.sub,
            email: typeof body.email === "string" ? body.email : null,
            emailVerified: typeof body.email_verified === "boolean" ? body.email_verified : null,
            name: typeof body.name === "string" ? body.name : null,
        };
    } catch (error) {
        if (error instanceof CustomySdkError && error.code === ACCESS_UNAVAILABLE) throw error;
        throw unavailable(error);
    } finally {
        clearTimeout(timer);
    }
}
