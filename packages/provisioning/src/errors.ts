import { CustomySdkError, type CustomySdkErrorOptions } from "@customyai/core";

export const REDACTED = "[REDACTED]";

/** Keys whose values are secrets (matched case-insensitively, anywhere in a payload). */
const SECRET_KEY = /pass(word|phrase)?|secret|token|authorization|^link$|credential|cookie|apikey|api_key/i;

/** Secrets known to a client (client secret, live tokens): scrubbed out of any text. */
export type Scrubber = {
    add(secret: string | undefined): void;
    text(value: string): string;
    value<T>(input: T): T;
};

export function createScrubber(): Scrubber {
    const secrets = new Set<string>();
    const text = (value: string): string => {
        let out = value;
        for (const secret of secrets) if (secret.length >= 6) out = out.split(secret).join(REDACTED);
        // Bearer tokens, even if unknown to this client.
        return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`);
    };
    const walk = (input: unknown, depth: number): unknown => {
        if (typeof input === "string") return text(input);
        if (input === null || typeof input !== "object") return input;
        if (depth > 8) return REDACTED;
        if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(input)) out[key] = SECRET_KEY.test(key) && item !== null && item !== undefined && item !== false && item !== true ? REDACTED : walk(item, depth + 1);
        return out;
    };
    return {
        add(secret) { if (secret) secrets.add(secret); },
        text,
        value: (input) => walk(input, 0) as typeof input,
    };
}

export type ProvisioningErrorOptions = CustomySdkErrorOptions & { details?: Record<string, unknown> };

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * Base error of Customy Provisioning. Carries `code`, `status`, `requestId` and `details`.
 * Never holds the raw response or any secret: its `message`, `toJSON()` and
 * `util.inspect` output are built from scrubbed data only.
 */
export class CustomyProvisioningError extends CustomySdkError {
    readonly details?: Record<string, unknown>;

    constructor(options: ProvisioningErrorOptions) {
        super({ ...options, service: "provisioning" });
        this.name = "CustomyProvisioningError";
        if (options.details !== undefined) this.details = options.details;
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            status: this.status,
            message: this.message,
            ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
            ...(this.details !== undefined ? { details: this.details } : {}),
        };
    }

    [INSPECT](): string {
        const extra = Object.entries(this.toJSON()).filter(([key]) => key !== "name" && key !== "message");
        return `${this.name}: ${this.message} ${JSON.stringify(Object.fromEntries(extra))}`;
    }
}

/** 401/403 family that is not a missing scope: TOKEN_INVALID, AUDIENCE_MISMATCH, rejected client credentials. */
export class CustomyAuthError extends CustomyProvisioningError {
    constructor(options: ProvisioningErrorOptions) {
        super(options);
        this.name = "CustomyAuthError";
    }
}

/** SCOPE_REQUIRED (403): `scope` is the scope the call needs. */
export class CustomyScopeError extends CustomyAuthError {
    readonly scope: string | undefined;
    constructor(options: ProvisioningErrorOptions & { scope?: string }) {
        super(options);
        this.name = "CustomyScopeError";
        this.scope = options.scope;
    }
    override toJSON(): Record<string, unknown> {
        return { ...super.toJSON(), ...(this.scope !== undefined ? { scope: this.scope } : {}) };
    }
}

/** ENVIRONMENT_MISMATCH (403): the key belongs to another environment than `Customy-Environment`. */
export class CustomyEnvironmentMismatchError extends CustomyAuthError {
    constructor(options: ProvisioningErrorOptions) {
        super(options);
        this.name = "CustomyEnvironmentMismatchError";
    }
}

/** VERSION_CONFLICT (409) and PRECONDITION_FAILED (412): `currentVersion` is the server's. */
export class CustomyConflictError extends CustomyProvisioningError {
    readonly currentVersion: number | undefined;
    constructor(options: ProvisioningErrorOptions & { currentVersion?: number }) {
        super(options);
        this.name = "CustomyConflictError";
        this.currentVersion = options.currentVersion;
    }
    override toJSON(): Record<string, unknown> {
        return { ...super.toJSON(), ...(this.currentVersion !== undefined ? { currentVersion: this.currentVersion } : {}) };
    }
}

/** RATE_LIMITED (429): `retryAfter` in seconds. */
export class CustomyRateLimitError extends CustomyProvisioningError {
    readonly retryAfter: number | undefined;
    constructor(options: ProvisioningErrorOptions & { retryAfter?: number }) {
        super(options);
        this.name = "CustomyRateLimitError";
        this.retryAfter = options.retryAfter;
    }
    override toJSON(): Record<string, unknown> {
        return { ...super.toJSON(), ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}) };
    }
}

/** CAPABILITY_DISABLED (423): the kill switch is on (writes only). */
export class CustomyCapabilityDisabledError extends CustomyProvisioningError {
    constructor(options: ProvisioningErrorOptions) {
        super(options);
        this.name = "CustomyCapabilityDisabledError";
    }
}

/** VALIDATION (400) and business rules answered 422 (REASON_REQUIRED, QUOTA_EXCEEDED, ...), also local validation. */
export class CustomyValidationError extends CustomyProvisioningError {
    constructor(options: ProvisioningErrorOptions) {
        super(options);
        this.name = "CustomyValidationError";
    }
}

/**
 * Maps a core error (HTTP failure, token failure or network failure) to the
 * typed error. Everything user-visible goes through `scrub`.
 */
export function toProvisioningError(error: unknown, scrub: Scrubber): CustomyProvisioningError {
    if (error instanceof CustomyProvisioningError) return error;
    if (!(error instanceof CustomySdkError)) {
        return new CustomyProvisioningError({ code: "SDK_UNEXPECTED", message: scrub.text(error instanceof Error ? error.message : "unexpected error"), cause: error });
    }
    const envelope = readEnvelope(error.body, scrub);
    const code = error.code;
    const base = {
        code,
        status: error.status,
        message: envelope.message ?? (error.body === undefined ? scrub.text(error.message) : `${code} (${error.status})`),
        requestId: error.requestId,
        details: envelope.details,
        ...(error.status === 0 || error.status === 408 ? { cause: error.cause } : {}),
    };
    if (code.startsWith("SDK_MACHINE_TOKEN_")) {
        // Token endpoint failure: rejected credentials are an auth error; a 5xx/network failure stays retryable.
        return error.status >= 400 && error.status < 500 ? new CustomyAuthError({ ...base, code: code === "SDK_MACHINE_TOKEN_FAILED" ? "TOKEN_INVALID" : code }) : new CustomyProvisioningError(base);
    }
    switch (code) {
        case "SCOPE_REQUIRED": {
            const scope = envelope.details?.scope;
            return new CustomyScopeError({ ...base, scope: typeof scope === "string" ? scope : undefined });
        }
        case "ENVIRONMENT_MISMATCH": return new CustomyEnvironmentMismatchError(base);
        case "TOKEN_INVALID": case "AUDIENCE_MISMATCH": case "SDK_ACCESS_TOKEN_UNAVAILABLE": return new CustomyAuthError(base);
        case "VERSION_CONFLICT": case "PRECONDITION_FAILED": {
            const current = envelope.details?.currentVersion;
            return new CustomyConflictError({ ...base, currentVersion: typeof current === "number" ? current : undefined });
        }
        case "RATE_LIMITED": return new CustomyRateLimitError({ ...base, retryAfter: error.retryAfterMs === undefined ? undefined : Math.ceil(error.retryAfterMs / 1000) });
        case "CAPABILITY_DISABLED": return new CustomyCapabilityDisabledError(base);
        default:
    }
    if (error.status === 429) return new CustomyRateLimitError({ ...base, retryAfter: error.retryAfterMs === undefined ? undefined : Math.ceil(error.retryAfterMs / 1000) });
    if (error.status === 423) return new CustomyCapabilityDisabledError(base);
    if (error.status === 400 || error.status === 422) return new CustomyValidationError(base);
    if (error.status === 401) return new CustomyAuthError(base);
    return new CustomyProvisioningError(base);
}

function readEnvelope(body: unknown, scrub: Scrubber): { message?: string; details?: Record<string, unknown> } {
    if (!body || typeof body !== "object") return {};
    const nested = (body as { error?: unknown }).error;
    if (!nested || typeof nested !== "object") return {};
    const { message, details } = nested as { message?: unknown; details?: unknown };
    return {
        ...(typeof message === "string" && message.length > 0 && message.length <= 500 ? { message: scrub.text(message) } : {}),
        ...(details && typeof details === "object" && !Array.isArray(details) ? { details: scrub.value(details as Record<string, unknown>) } : {}),
    };
}
