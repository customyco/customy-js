/**
 * Aviso de deprecación, una vez por proceso (o pestaña) y paquete, aunque el
 * paquete esté duplicado en el bundle: la marca vive en `globalThis`. En Node
 * es un `DeprecationWarning` (se silencia con `--no-deprecation`); fuera de
 * Node, un `console.warn`.
 */
const SEEN = Symbol.for("customy.sdk.deprecations");

export function warnDeprecated(name: string, message: string): void {
    const registry = globalThis as { [SEEN]?: Set<string> };
    const seen = (registry[SEEN] ??= new Set<string>());
    if (seen.has(name)) return;
    seen.add(name);
    const text = `${name} is deprecated: ${message}`;
    const proc = (globalThis as { process?: { emitWarning?: (warning: string, options: { type: string; code: string }) => void } }).process;
    if (typeof proc?.emitWarning === "function") proc.emitWarning(text, { type: "DeprecationWarning", code: "CUSTOMY_SDK_DEPRECATED" });
    else if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(text);
}
