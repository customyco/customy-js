import { groupAriaLabel } from "../a11y";
import { isNudge, orderGroups, placeNudges } from "../order";
import { resolveMessages } from "../messages";
import type { SeenTracker } from "../seen";
import type { StoryBarStyle, StoryGroup } from "../types";
import { viewableGroups } from "../viewer";
import { applyTheme, el, icon, resolveUi, type UiOptions } from "./util";
import { openStoryViewer, type StoryViewerHandle, type StoryViewerUiOptions } from "./viewer";

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

export type StoryBarUiOptions = UiOptions & {
  groups: readonly StoryGroup[];
  style?: Partial<StoryBarStyle>;
  seen?: SeenTracker;
  /** Se pasa tal cual al visor (eventos, compartir, Lottie…). `groups`, `seen` y `startGroupId` los pone la barra. */
  viewer?: Omit<StoryViewerUiOptions, "groups" | "startGroupId" | "startPageId" | "seen" | keyof UiOptions>;
  /** Se pintó la lista (ya ordenada y sin los grupos de control): sirve para registrar impresiones. */
  onRender?: (ordered: StoryGroup[]) => void;
  onOpen?: (group: StoryGroup) => void;
  /** Un `Elemento` se cierra antes de abrir el visor, p. ej. si otra superficie manda (un overlay a la vez). */
  canOpen?: () => boolean;
};

export type StoryBarHandle = {
  element: HTMLElement;
  update(patch: Partial<Pick<StoryBarUiOptions, "groups" | "style">>): void;
  /** Los grupos tal como se pintan. */
  ordered(): StoryGroup[];
  destroy(): void;
};

/**
 * Story Bar: `classic` o `energized`; portada círculo|cuadrado|redondeado|rectángulo vertical;
 * anillo visto/no visto; orden (no vistos y fijados primero); insignia «en vivo»; LTR/RTL;
 * claro/oscuro por tokens. Cada grupo es un `<button>` con etiqueta completa para lectores de
 * pantalla (título, estado, fijado, en vivo, posición).
 */
export function mountStoryBar(container: HTMLElement, options: StoryBarUiOptions): StoryBarHandle {
  const { doc, rtl } = resolveUi(options);
  const m = resolveMessages(options.locale, options.messages);
  let style: StoryBarStyle = mergeStyle(options.style);
  let all = options.groups;
  let ordered: StoryGroup[] = [];
  /** Lo que recorre el visor: los de la barra con los `nudge` insertados entre ellos. */
  let sequence: StoryGroup[] = [];
  let viewerHandle: StoryViewerHandle | null = null;

  const root = el(doc, "nav", { class: "cs-bar cs-root", dir: rtl ? "rtl" : "ltr", "aria-label": m.storyBar });
  applyTheme(root, options.theme);
  container.append(root);

  function statusOf(g: StoryGroup) {
    return options.seen?.status(g) ?? "unseen";
  }

  function paint(): void {
    const viewable = viewableGroups(all);
    ordered = orderGroups(viewable.filter((g) => !isNudge(g)), {
      order: style.order,
      pinnedFirst: style.pinned_first,
      isSeen: (g) => options.seen?.isSeen(g) ?? false,
      seenAt: (g) => options.seen?.seenAt(g.id) ?? 0,
    });
    if (style.max_groups) ordered = ordered.slice(0, style.max_groups);
    sequence = placeNudges(ordered, viewable.filter(isNudge));
    root.dataset.variant = style.variant;
    root.className = `cs-bar cs-root cs-bar--${style.variant}`;
    root.dataset.shape = style.cover_shape;
    root.dataset.size = style.size;
    root.dataset.ring = style.ring.enabled ? "on" : "off";
    if (style.ring.unseen_color) root.style.setProperty("--cs-ring-unseen-c", style.ring.unseen_color);
    else root.style.removeProperty("--cs-ring-unseen-c");
    if (style.ring.seen_color) root.style.setProperty("--cs-ring-seen-c", style.ring.seen_color);
    else root.style.removeProperty("--cs-ring-seen-c");

    const list = el(doc, "ul", { class: "cs-bar__list", role: "list" });
    ordered.forEach((g, i) => {
      const status = statusOf(g);
      const btn = el(
        doc,
        "button",
        { type: "button", class: "cs-item", "data-group-id": g.id, "data-status": status, "aria-label": groupAriaLabel(g, status, { n: i + 1, total: ordered.length }, m) },
        el(doc, "span", { class: "cs-ring" }, el(doc, "img", { class: "cs-cover", src: g.cover.url, alt: g.cover.alt, loading: "lazy", decoding: "async" })),
        style.show_title ? el(doc, "span", { class: "cs-title" }, g.title) : null,
        g.pinned && style.pinned_first ? el(doc, "span", { class: "cs-pin", "aria-hidden": "true" }, icon(doc, "pin", 11)) : null,
        g.live && style.live_badge.enabled ? el(doc, "span", { class: "cs-live", "aria-hidden": "true" }, style.live_badge.label || m.live.toUpperCase()) : null,
        g.sponsor ? el(doc, "span", { class: "cs-spons", "aria-hidden": "true" }, g.sponsor.label) : null,
      );
      btn.addEventListener("click", () => open(g));
      list.append(el(doc, "li", { class: "cs-bar__item" }, btn));
    });
    root.replaceChildren(list);
    options.onRender?.(ordered);
  }

  const byGroup = (id: string): HTMLElement | undefined => Array.from(root.querySelectorAll<HTMLElement>("[data-group-id]")).find((n) => n.dataset.groupId === id);

  /** Estado visto/no visto sin recomponer la lista (no se pierde el foco mientras el visor está abierto). */
  function refreshStatus(): void {
    ordered.forEach((g, i) => {
      const btn = byGroup(g.id);
      if (!btn) return;
      const status = statusOf(g);
      btn.dataset.status = status;
      btn.setAttribute("aria-label", groupAriaLabel(g, status, { n: i + 1, total: ordered.length }, m));
    });
  }

  function open(g: StoryGroup): void {
    if (viewerHandle || options.canOpen?.() === false) return;
    options.onOpen?.(g);
    const userClose = options.viewer?.onClose;
    viewerHandle = openStoryViewer({
      ...options.viewer,
      locale: options.locale,
      rtl,
      theme: options.theme,
      messages: options.messages,
      reducedMotion: options.reducedMotion,
      clock: options.clock,
      doc,
      groups: sequence,
      startGroupId: g.id,
      seen: options.seen,
      onClose: (reason) => {
        viewerHandle = null;
        paint();
        byGroup(g.id)?.focus();
        userClose?.(reason);
      },
    });
  }

  const unsubscribe = options.seen?.subscribe(refreshStatus);
  paint();

  return {
    element: root,
    update(patch) {
      if (patch.groups) all = patch.groups;
      if (patch.style) style = mergeStyle({ ...style, ...patch.style });
      paint();
    },
    ordered: () => ordered,
    destroy() {
      unsubscribe?.();
      viewerHandle?.close("app");
      root.remove();
    },
  };
}

function mergeStyle(s: Partial<StoryBarStyle> | undefined): StoryBarStyle {
  return {
    ...DEFAULT_BAR_STYLE,
    ...s,
    ring: { ...DEFAULT_BAR_STYLE.ring, ...s?.ring },
    live_badge: { ...DEFAULT_BAR_STYLE.live_badge, ...s?.live_badge },
  };
}
