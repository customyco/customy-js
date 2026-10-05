export type StoriesErrorCode = "network" | "timeout" | "unauthorized" | "not_found" | "rate_limited" | "server" | "invalid_response" | "token" | "invalid";

/** Error del cliente de Stories: código estable, estado HTTP si lo hubo y `retryAfterMs` en 429/503. */
export class StoriesError extends Error {
  readonly code: StoriesErrorCode;
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(code: StoriesErrorCode, message: string, options: { status?: number; retryAfterMs?: number | null; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "StoriesError";
    this.code = code;
    this.status = options.status ?? 0;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function retryAfterMs(res: Pick<Response, "headers">): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export async function errorFromResponse(res: Response): Promise<StoriesError> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    /* sin cuerpo */
  }
  const status = res.status;
  const code: StoriesErrorCode = status === 401 || status === 403 ? "unauthorized" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : "server";
  return new StoriesError(code, `HTTP ${status}${detail ? `: ${detail}` : ""}`, { status, retryAfterMs: retryAfterMs(res) });
}
