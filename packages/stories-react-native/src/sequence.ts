import { isNudge, orderGroups, placeNudges, viewableGroups, type SeenTracker, type StoryBarStyle, type StoryGroup, type ViewerGroup } from "./core";

export const DEFAULT_BAR_STYLE: StoryBarStyle = {
  variant: "classic",
  cover_shape: "circle",
  size: "medium",
  ring: { enabled: true },
  order: "manual",
  pinned_first: true,
  show_title: true,
  live_badge: { enabled: true, label: "LIVE" },
};

export function mergeBarStyle(s: Partial<StoryBarStyle> | undefined): StoryBarStyle {
  return { ...DEFAULT_BAR_STYLE, ...s, ring: { ...DEFAULT_BAR_STYLE.ring, ...s?.ring }, live_badge: { ...DEFAULT_BAR_STYLE.live_badge, ...s?.live_badge } };
}

/**
 * Lo que pinta la barra (`ordered`: sin control ni `nudge`, ya ordenada: fijados y no vistos primero) y lo que
 * recorre el visor (`sequence`: la barra con los `nudge` insertados entre sus grupos). Misma regla que la web.
 */
export function buildSequence(groups: readonly StoryGroup[], style: StoryBarStyle, seen?: SeenTracker): { ordered: ViewerGroup[]; sequence: ViewerGroup[] } {
  const viewable = viewableGroups(groups);
  let ordered = orderGroups(
    viewable.filter((g) => !isNudge(g)),
    { order: style.order, pinnedFirst: style.pinned_first, isSeen: (g) => seen?.isSeen(g) ?? false, seenAt: (g) => seen?.seenAt(g.id) ?? 0 },
  ) as ViewerGroup[];
  if (style.max_groups) ordered = ordered.slice(0, style.max_groups);
  return { ordered, sequence: placeNudges(ordered, viewable.filter(isNudge)) };
}
