/**
 * `customy apps validate | sync`: reconcilia el `customy.app.json` de una app
 * con Customy Access (ADR SDK, D3).
 *
 * `sync` es idempotente: instala la app en el Workspace si no existe (el
 * install repetido devuelve la misma conexión) y, si el manifiesto cambió,
 * publica una versión nueva sobre la revisión actual. Access lleva después el
 * manifiesto a los productos (los `events` a Data) y devuelve cómo fue; repetir
 * `sync` con el mismo manifiesto repara una reconciliación fallida. Nunca crea
 * credenciales: eso lo decide un administrador del Workspace.
 */
import { AppManifestSchema, appManifestProblems, type AppManifest } from "./vendor/app-manifest";

export type Problem = { path: string; code: string };

/** Mensajes para los códigos de validación de `permissions`/`roles` (el resto se enseña tal cual). */
const PROBLEM_HINTS: Record<string, string> = {
  PERMISSION_NAMESPACE_VIOLATION: "la clave del permiso debe empezar por «<clave-de-la-app>.»",
  ROLE_NAMESPACE_VIOLATION: "la clave del rol debe empezar por «<clave-de-la-app>.»",
  PERMISSION_UNDECLARED: "el rol usa un permiso que no está declarado en permissions[]",
};

export function describeProblem(problem: Problem): string {
  const hint = PROBLEM_HINTS[problem.code];
  return `✗ ${problem.path || "(raíz)"}: ${problem.code}${hint ? ` — ${hint}` : ""}`;
}

/** Resumen de una línea de lo que declara el manifiesto en permisos y roles. */
export function authorizationSummary(manifest: AppManifest): string {
  return `${manifest.permissions?.length ?? 0} permisos, ${manifest.roles?.length ?? 0} roles`;
}

export function validateManifest(input: unknown): { ok: true; manifest: AppManifest } | { ok: false; problems: Problem[] } {
  const problems = appManifestProblems(input);
  return problems.length ? { ok: false, problems } : { ok: true, manifest: AppManifestSchema.parse(input) };
}

export type SyncOptions = {
  manifest: AppManifest;
  accessUrl: string;
  token: string;
  workspaceEnvironmentId: string;
  reason: string;
  fetch?: typeof fetch;
};

export type ProductReconciliation =
  | { status: "skipped"; reason: string }
  | { status: "reconciled"; changed: boolean; resourceId?: string; permissions?: number; roles?: number; rolesOrphaned?: number }
  | { status: "failed"; code: string; conflicts?: string[] };

export type SyncResult = {
  action: "installed" | "updated" | "unchanged";
  applicationId: string;
  environmentId: string;
  revision: number;
  /** Cómo quedó cada producto; vacío si Access no lo informa. */
  reconciliation: Record<string, ProductReconciliation>;
};

export class SyncError extends Error {
  constructor(readonly code: string, readonly status: number) { super(`${code} (${status})`); }
}

export async function syncApp(options: SyncOptions): Promise<SyncResult> {
  const base = options.accessUrl.replace(/\/$/, "");
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new SyncError("ACCESS_URL_INSECURE", 0);
  const call = async (method: string, path: string, body: unknown) => {
    const response = await (options.fetch ?? fetch)(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new SyncError(String(json.code ?? json.error ?? "ACCESS_REQUEST_FAILED"), response.status);
    return json;
  };
  const env = encodeURIComponent(options.workspaceEnvironmentId);
  const installed = await call("POST", `/api/admin/env/${env}/connected-applications/install`, { manifest: options.manifest, reason: options.reason });
  const connection = installed.connection as { applicationId: string; environmentId: string; revision: number };
  const reconciliation = (value: unknown) => (value && typeof value === "object" ? value : {}) as Record<string, ProductReconciliation>;
  if (!installed.replayed) {
    return { action: "installed", applicationId: connection.applicationId, environmentId: connection.environmentId, revision: connection.revision, reconciliation: reconciliation(installed.reconciliation) };
  }
  const updated = await call("PUT", `/api/admin/env/${encodeURIComponent(connection.environmentId)}/connected-application/manifest`, {
    expectedRevision: connection.revision, manifest: options.manifest, reason: options.reason,
  });
  const revision = Number(updated.revision ?? connection.revision);
  return { action: updated.unchanged ? "unchanged" : "updated", applicationId: connection.applicationId, environmentId: connection.environmentId, revision, reconciliation: reconciliation(updated.reconciliation) };
}
