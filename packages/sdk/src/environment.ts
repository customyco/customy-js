/**
 * Valores de arranque que una app puede fijar por variable de entorno, sin escribirlos en código:
 *
 * - `CUSTOMY_ACCESS_URL`: URL de Access del entorno (el issuer). Sustituye a `CUSTOMY_ISSUER` si ambas existen.
 * - `CUSTOMY_WORKSPACE_ENVIRONMENT_ID`: entorno de Access de la app. Sobrescribe el que descubre `discoverApplication`.
 * - `CUSTOMY_PROJECT_ID`: proyecto de Customy de la app (lo piden los eventos de `customy.apps`; Access no lo publica).
 *
 * Orden de precedencia en `createCustomy`: opción explícita, variable de entorno, valor descubierto.
 * Una variable vacía no cuenta. No se lee ningún secreto.
 */
export type CustomyEnvironmentSource = Readonly<Record<string, string | undefined>>;

export type CustomyEnvironment = Readonly<{
    accessUrl?: string;
    workspaceEnvironmentId?: string;
    projectId?: string;
}>;

export const CUSTOMY_ENVIRONMENT_VARIABLES = {
    accessUrl: "CUSTOMY_ACCESS_URL",
    workspaceEnvironmentId: "CUSTOMY_WORKSPACE_ENVIRONMENT_ID",
    projectId: "CUSTOMY_PROJECT_ID",
} as const;

function clean(value: string | undefined): string | undefined {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : undefined;
}

/** El `process.env` del runtime si existe (Node, Bun); `{}` en un runtime sin él. */
export function runtimeEnvironment(): CustomyEnvironmentSource {
    const proc = (globalThis as { process?: { env?: CustomyEnvironmentSource } }).process;
    return proc?.env ?? {};
}

/** Lee las tres variables de descubrimiento; las que faltan o están vacías no aparecen. */
export function readCustomyEnvironment(env: CustomyEnvironmentSource = runtimeEnvironment()): CustomyEnvironment {
    const accessUrl = clean(env[CUSTOMY_ENVIRONMENT_VARIABLES.accessUrl]);
    const workspaceEnvironmentId = clean(env[CUSTOMY_ENVIRONMENT_VARIABLES.workspaceEnvironmentId]);
    const projectId = clean(env[CUSTOMY_ENVIRONMENT_VARIABLES.projectId]);
    return {
        ...(accessUrl ? { accessUrl: accessUrl.replace(/\/+$/, "") } : {}),
        ...(workspaceEnvironmentId ? { workspaceEnvironmentId } : {}),
        ...(projectId ? { projectId } : {}),
    };
}
