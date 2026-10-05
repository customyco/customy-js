import type { BarOrder, StoryGroup } from "./types";

export type OrderOptions = {
  order: BarOrder;
  pinnedFirst: boolean;
  /** `true` si el grupo está visto del todo. */
  isSeen: (group: StoryGroup) => boolean;
  /** Cuándo se vio por última vez (ms); sirve para `seen_last`. */
  seenAt?: (group: StoryGroup) => number;
};

const startMs = (g: StoryGroup): number => (g.schedule?.start_at ? Date.parse(g.schedule.start_at) || 0 : 0);

/**
 * Orden de la barra, determinista y estable:
 *  1. fijados primero (si `pinnedFirst`);
 *  2. `unseen_first`: no vistos antes que vistos; `seen_last`: igual, y los vistos al final por
 *     antigüedad (el visto hace más tiempo, antes); `recent`: el de inicio más reciente primero;
 *     `manual` e `interest`: solo el orden recibido (en `interest` lo fija el servidor);
 *  3. desempate: `order` manual y luego `id`.
 * No muta la entrada. El grupo de control NO se filtra aquí (lo hace quien pinta).
 */
export function orderGroups(groups: readonly StoryGroup[], opts: OrderOptions): StoryGroup[] {
  const rank = (g: StoryGroup): [number, number, number, number, string] => {
    const pin = opts.pinnedFirst && g.pinned ? 0 : 1;
    const seen = opts.isSeen(g);
    let primary = 0;
    let secondary = 0;
    switch (opts.order) {
      case "unseen_first":
        primary = seen ? 1 : 0;
        break;
      case "seen_last":
        primary = seen ? 1 : 0;
        secondary = seen ? opts.seenAt?.(g) ?? 0 : 0;
        break;
      case "recent":
        primary = -startMs(g);
        break;
      default:
        break;
    }
    return [pin, primary, secondary, g.order, g.id];
  };
  return groups
    .map((g) => ({ g, r: rank(g) }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) {
        const d = (a.r[i] as number) - (b.r[i] as number);
        if (d !== 0) return d;
      }
      return a.r[4] < b.r[4] ? -1 : a.r[4] > b.r[4] ? 1 : 0;
    })
    .map((x) => x.g);
}

// ─── Nudge (Ola 2): grupos insertados entre otros ───────────────────────────

/** Los grupos `nudge` no se pintan en la barra: se encuentran al recorrer el visor. */
export const isNudge = (g: Pick<StoryGroup, "mode">): boolean => g.mode === "nudge";

/**
 * Mete los `nudge` entre los grupos normales (ya ordenados): los de una misma `disturbance_id` van
 * juntos (como mucho 4), tras las `position` primeras normales (la menor de la disturbance); varias
 * disturbances en la misma posición, por id. Misma regla que el servidor; no muta la entrada.
 */
export function placeNudges<T extends Pick<StoryGroup, "id" | "order" | "nudge">>(regular: readonly T[], nudges: readonly T[]): T[] {
  const by = new Map<string, T[]>();
  for (const n of [...nudges].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const k = n.nudge?.disturbance_id ?? "";
    const list = by.get(k) ?? [];
    if (list.length < 4) by.set(k, [...list, n]);
  }
  const plan = [...by.entries()]
    .map(([k, list]) => ({ k, list, at: Math.min(regular.length, ...list.map((n) => n.nudge?.position ?? 0)) }))
    .sort((a, b) => a.at - b.at || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const out: T[] = [];
  let p = 0;
  for (let i = 0; i <= regular.length; i++) {
    while (p < plan.length && plan[p]!.at === i) out.push(...plan[p++]!.list);
    if (i < regular.length) out.push(regular[i]!);
  }
  return out;
}
