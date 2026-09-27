/**
 * Condiciones de Send (`trigger_filters` de un mensaje in-app, y las mismas
 * operaciones que la audiencia): la app las evalúa con las propiedades del
 * evento que dispara el mensaje. Misma semántica que el servidor:
 *
 * - `eq` / `neq`: igualdad; entre valores simples se compara su texto (`1` = `"1"`).
 * - `in` / `nin`: `value` es una lista (un valor suelto cuenta como lista de uno).
 * - `gte` / `lte`: dos números (o un número y un texto numérico) → numérico;
 *   dos versiones (`1.2.3`, `10`) → por segmentos numéricos; si no, orden de
 *   texto. Sin valor → no se cumple.
 * - `exists` / `not_exists`: la propiedad no es `null` ni falta.
 * - `contains`: texto que incluye (distingue mayúsculas) o lista que incluye.
 * - Una operación desconocida no se cumple (mejor no mostrar que mostrar mal).
 */
import type { AudienceFilter, FilterOp, TriggerFilter } from "../engage-types";

/** Una condición: `property` (disparadores) o `field` (audiencia). */
export type FilterCondition = TriggerFilter | AudienceFilter | { property?: string; field?: string; op: FilterOp | (string & {}); value?: unknown };

const VERSION = /^v?(\d+(?:\.\d+)*)(?:[-+].*)?$/;

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isPrimitive(a) && isPrimitive(b)) return String(a) === String(b);
  return false;
}

function versionParts(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const match = VERSION.exec(value.trim());
  return match ? match[1]!.split(".").map(Number) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** −1, 0, 1; `null` si no se pueden comparar. */
function compare(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  // Un número frente a un texto numérico («80» de un formulario) también es numérico.
  if (typeof a === "number" || typeof b === "number") {
    const x = toNumber(a);
    const y = toNumber(b);
    if (x !== null && y !== null) return x === y ? 0 : x < y ? -1 : 1;
    if (typeof a === "number" && typeof b === "number") return null;
  }
  const va = versionParts(a);
  const vb = versionParts(b);
  if (va && vb) {
    for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
      const x = va[i] ?? 0;
      const y = vb[i] ?? 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }
  if (!isPrimitive(a) || !isPrimitive(b)) return null;
  const sa = String(a);
  const sb = String(b);
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

/** El valor de `properties[key]`, o por ruta con puntos (`cart.total`) si no hay una clave literal. */
function lookup(properties: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(properties, key)) return properties[key];
  if (!key.includes(".")) return undefined;
  let current: unknown = properties;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Si una condición se cumple con este valor. */
export function matchesFilter(op: FilterOp | (string & {}), actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "eq":
      return equals(actual, expected);
    case "neq":
      return !equals(actual, expected);
    case "in":
    case "nin": {
      const list = Array.isArray(expected) ? expected : [expected];
      const found = list.some((item) => equals(actual, item));
      return op === "in" ? found : !found;
    }
    case "gte":
    case "lte": {
      const order = compare(actual, expected);
      if (order === null) return false;
      return op === "gte" ? order >= 0 : order <= 0;
    }
    case "exists":
      return actual !== null && actual !== undefined;
    case "not_exists":
      return actual === null || actual === undefined;
    case "contains":
      if (typeof actual === "string") return isPrimitive(expected) && actual.includes(String(expected));
      if (Array.isArray(actual)) return actual.some((item) => equals(item, expected));
      return false;
    default:
      return false;
  }
}

/**
 * Todas las condiciones a la vez (Y). Sin condiciones → `true`.
 *
 *   matchesFilters([{ property: "total", op: "gte", value: 50 }], { total: 80 }) // true
 */
export function matchesFilters(filters: readonly FilterCondition[] | null | undefined, properties: Record<string, unknown> | null | undefined = {}): boolean {
  if (!filters || filters.length === 0) return true;
  const props = properties ?? {};
  for (const filter of filters) {
    if (!filter || typeof filter !== "object") return false;
    const key = "property" in filter && typeof filter.property === "string" ? filter.property : "field" in filter && typeof filter.field === "string" ? filter.field : null;
    if (key === null) return false;
    if (!matchesFilter(filter.op, lookup(props, key), filter.value)) return false;
  }
  return true;
}
