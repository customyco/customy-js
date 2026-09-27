import { CustomySdkError } from "@customyai/sdk";

/**
 * Los errores de discovery y de tokens de máquina de `@customyai/core` con los
 * mensajes de 0.x (`CUSTOMY_DISCOVERY_FAILED: 503`,
 * `CUSTOMY_MACHINE_TOKEN_FAILED: 400 invalid_scope`…), para quien los compare.
 * El error original queda en `cause`.
 */
export function legacyPlatformError(error: unknown): unknown {
  if (!(error instanceof CustomySdkError)) return error;
  const { code, status } = error;
  let message: string | null = null;
  if (code === "SDK_DISCOVERY_FAILED") message = status ? `CUSTOMY_DISCOVERY_FAILED: ${status}` : "CUSTOMY_DISCOVERY_FAILED";
  else if (code === "SDK_DISCOVERY_INVALID") message = "CUSTOMY_DISCOVERY_INVALID";
  else if (code === "SDK_ISSUER_INVALID") message = "CUSTOMY_ACCESS_ISSUER_INVALID";
  else if (code.startsWith("SDK_MACHINE_TOKEN_") && status > 0) {
    const reason = code === "SDK_MACHINE_TOKEN_FAILED" ? "" : code.slice("SDK_MACHINE_TOKEN_".length).toLowerCase();
    message = `CUSTOMY_MACHINE_TOKEN_FAILED: ${status} ${reason}`.trim();
  } else if (code === "SDK_MACHINE_TOKEN_FAILED") message = "CUSTOMY_MACHINE_TOKEN_FAILED";
  else if (code.startsWith("SDK_MACHINE_")) message = `CUSTOMY_${code.slice(4)}`;
  if (!message) return error;
  const legacy = new Error(message);
  (legacy as { cause?: unknown }).cause = error;
  return legacy;
}
