import type { AnswerMap, Visibility, VisibilityCondition } from "./types";

/**
 * Visibilidad condicional (Ola 2): la MISMA lógica que `evaluateVisibility` del contrato (que usa el
 * servidor para ocultar un grupo); este paquete es público y no puede importar el contrato privado,
 * así que se duplica y `visibility.test.ts` los compara con miles de combinaciones.
 */
const same = (a: string | number | boolean, b: string | number): boolean => String(a) === String(b);

function check(c: VisibilityCondition, answers: AnswerMap, pending?: ReadonlySet<string>): boolean | null {
  const a = answers[c.component_id];
  if (a === undefined) return pending?.has(c.component_id) ? null : c.cmp === "not_answered";
  const v = c.value;
  switch (c.cmp) {
    case "answered":
      return true;
    case "not_answered":
      return false;
    case "eq":
      return v !== undefined && !Array.isArray(v) && same(a, v);
    case "neq":
      return v !== undefined && !Array.isArray(v) && !same(a, v);
    case "in":
      return Array.isArray(v) ? v.some((x) => same(a, x)) : v !== undefined && same(a, v);
  }
}

/** `true` / `false` / `null` (aún indeterminado: depende de algo que todavía puede responderse). Sin condición: `true`. */
export function evaluateVisibility(v: Visibility | null | undefined, answers: AnswerMap, opts: { pending?: ReadonlySet<string> } = {}): boolean | null {
  if (!v?.conditions?.length) return true;
  const r = v.conditions.map((c) => check(c, answers, opts.pending));
  if ((v.op ?? "and") === "or") return r.includes(true) ? true : r.includes(null) ? null : false;
  return r.includes(false) ? false : r.includes(null) ? null : true;
}
