/**
 * Asignaciones calculadas en el servidor o en el borde que viajan al navegador
 * para hidratar sin parpadeo: `@customyai/access/flags/edge` las crea y
 * `@customyai/access/flags/react` las consume. Puro y sin dependencias de runtime.
 */
import { createDependencies, evaluate, type EvalContext, type EvaluationDetail, type FlagDefinition, type SegmentDefinition } from "@customyai/flags-eval";

export type BootstrapFlag = {
    treatment: string;
    value?: unknown;
    config?: Record<string, unknown>;
    /** Contrato D6: `default | off | killed | prerequisite_failed | rule:<id> | rollout | segment:<key> | error`. */
    reasonCode: string;
    /** Razón histórica del evaluador (`rule_match`, `rollout`, …), para registrar la exposición igual que el SDK. */
    reason: string;
    ruleId?: string;
    bucket?: number;
};

export type FlagsBootstrap = {
    /** Versión de la instantánea con la que se calcularon. */
    version: number;
    /** Clave de la unidad (visitante o usuario) a la que corresponden. */
    unitKey: string;
    flags: Record<string, BootstrapFlag>;
};

export type BootstrapSnapshot = { version: number; flags: FlagDefinition[]; segments?: SegmentDefinition[] };

export type CreateBootstrapOptions = {
    /** Solo estos flags (por defecto, todos los de la instantánea). */
    flags?: readonly string[];
};

export function toBootstrapFlag(detail: EvaluationDetail): BootstrapFlag {
    return {
        treatment: detail.treatment,
        ...(detail.value !== undefined ? { value: detail.value } : {}),
        ...(detail.config !== undefined ? { config: detail.config } : {}),
        reasonCode: detail.reasonCode,
        reason: detail.reason,
        ...(detail.ruleId !== undefined ? { ruleId: detail.ruleId } : {}),
        ...(detail.bucket !== undefined ? { bucket: detail.bucket } : {}),
    };
}

/** Evalúa la instantánea para `context` y devuelve lo que el cliente necesita para hidratar. Los flags con error no se incluyen (el cliente decide con su propio valor por defecto). */
export function createBootstrap(snapshot: BootstrapSnapshot, context: EvalContext, options: CreateBootstrapOptions = {}): FlagsBootstrap {
    const wanted = options.flags ? new Set(options.flags) : undefined;
    const dependencies = createDependencies(snapshot.flags, snapshot.segments ?? [], context);
    const flags: Record<string, BootstrapFlag> = {};
    for (const flag of snapshot.flags) {
        if (wanted && !wanted.has(flag.key)) continue;
        const detail = evaluate(flag, context, dependencies);
        if (detail.reason !== "error") flags[flag.key] = toBootstrapFlag(detail);
    }
    return { version: snapshot.version, unitKey: context.key, flags };
}

/** Cabecera HTTP segura (ASCII): JSON en UTF-8 → base64url. */
export function encodeBootstrap(bootstrap: FlagsBootstrap): string {
    const bytes = new TextEncoder().encode(JSON.stringify(bootstrap));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inversa de `encodeBootstrap`; `undefined` si el valor falta o no es una asignación válida (nunca lanza). */
export function decodeBootstrap(value: string | null | undefined): FlagsBootstrap | undefined {
    if (!value) return undefined;
    try {
        const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<FlagsBootstrap>;
        if (typeof parsed.version !== "number" || typeof parsed.unitKey !== "string" || !parsed.flags || typeof parsed.flags !== "object") return undefined;
        return parsed as FlagsBootstrap;
    } catch {
        return undefined;
    }
}
