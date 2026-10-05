import { fmt, type Messages } from "./messages";
import type { SeenStatus } from "./seen";
import type { StoryGroup } from "./types";

/**
 * Etiqueta accesible de un grupo de la barra: título + estado (nueva/vista/a medias) + fijada +
 * en vivo + posición. Es lo que lee un lector de pantalla, porque el anillo solo se ve.
 */
export function groupAriaLabel(group: Pick<StoryGroup, "title" | "pinned" | "live"> & { sponsor?: StoryGroup["sponsor"] }, status: SeenStatus, position: { n: number; total: number }, m: Messages): string {
  const parts: string[] = [fmt(m.openStory, { title: group.title })];
  parts.push(status === "seen" ? m.statusSeen : status === "partial" ? m.statusPartial : m.statusNew);
  if (group.pinned) parts.push(m.pinned);
  if (group.live) parts.push(m.live);
  if (group.sponsor) parts.push(`${group.sponsor.label}: ${group.sponsor.name}`);
  parts.push(fmt(m.position, { n: position.n, total: position.total }));
  return parts.join(", ");
}

/** Texto de la región `aria-live` al cambiar de página. */
export function pageAnnouncement(group: Pick<StoryGroup, "title">, page: { title?: string }, groupPos: { n: number; total: number }, pagePos: { n: number; total: number }, m: Messages): string {
  const head = `${fmt(m.viewer, { title: group.title })}. ${fmt(m.position, groupPos)}.`;
  const body = fmt(m.pageOf, { n: pagePos.n, total: pagePos.total });
  return [head, body, page.title].filter(Boolean).join(" ");
}
