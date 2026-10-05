import { applyTheme } from "../dom/util";
import type { DeliveredChecklist, TourPresentation, TourStep } from "../types";
import { el, findAnchor, resolveUi, widgetEmitter, widgetRoot, type AnchorRegistry, type WidgetControllerBase, type WidgetEvent, type WidgetHandle } from "./common";
import { tourMessages, fmt } from "./messages";

/**
 * Tour (modo `tour` del widget checklist): recorrido de 3–7 pasos con tooltips, hotspots o spotlights sobre
 * elementos de la propia app, anclados por un id estable (`data-customy-anchor`, nunca un selector CSS). Salta con
 * Escape o el botón «Omitir» en cualquier paso (WCAG 2.1.1, 2.2.2: no avanza solo), anuncia cada paso y mueve el foco
 * al paso (no es modal: la app sigue usable). Si el ancla no está, el paso se muestra centrado en vez de perderse.
 */

export type TourController = {
  readonly steps: readonly TourStep[];
  readonly index: number;
  readonly step: TourStep | null;
  readonly finished: boolean;
  next(via?: "button" | "anchor"): void;
  prev(): void;
  skip(): void;
  subscribe(l: () => void): () => void;
};

export function createTour(options: { entry: DeliveredChecklist; onEvent?: (e: WidgetEvent) => void }): TourController {
  const { entry } = options;
  const steps = (entry.items ?? []).filter((i): i is TourStep => i.type === "step");
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const listeners = new Set<() => void>();
  let index = 0;
  let finished = steps.length === 0;
  let shown = -1;
  const changed = (): void => {
    if (!finished && shown !== index) {
      shown = index;
      emit({ type: "tour_step", stepId: steps[index]!.id, step: "shown" });
    }
    listeners.forEach((l) => l());
  };
  const api: TourController = {
    steps,
    get index() { return index; },
    get step() { return finished ? null : steps[index] ?? null; },
    get finished() { return finished; },
    next() {
      if (finished) return;
      const cur = steps[index]!;
      if (index >= steps.length - 1) {
        emit({ type: "tour_step", stepId: cur.id, step: "done" });
        emit({ type: "complete" });
        finished = true;
      } else {
        emit({ type: "tour_step", stepId: cur.id, step: "next" });
        index += 1;
      }
      changed();
    },
    prev() {
      if (finished || index === 0) return;
      emit({ type: "tour_step", stepId: steps[index]!.id, step: "prev" });
      index -= 1;
      changed();
    },
    skip() {
      if (finished) return;
      emit({ type: "tour_step", stepId: steps[index]!.id, step: "skip" });
      emit({ type: "dismiss", reason: "user" });
      finished = true;
      changed();
    },
    subscribe(l) {
      listeners.add(l);
      queueMicrotask(() => changed());
      return () => void listeners.delete(l);
    },
  };
  return api;
}

type Rect = { top: number; left: number; width: number; height: number };
export type PopoverPlacement = "top" | "bottom" | "start" | "end";

/**
 * Dónde poner el globo: el lado pedido si cabe; con `auto` (o si no cabe), el lado con más espacio. Se acota al
 * viewport con un margen. Pura: la prueban sin DOM. `rtl` invierte `start`/`end`.
 */
export function popoverPosition(anchor: Rect, pop: { width: number; height: number }, viewport: { width: number; height: number }, want: "auto" | PopoverPlacement, rtl = false, gap = 12, margin = 8): { top: number; left: number; side: PopoverPlacement } {
  const room: Record<PopoverPlacement, number> = {
    top: anchor.top - gap - margin,
    bottom: viewport.height - (anchor.top + anchor.height) - gap - margin,
    start: (rtl ? viewport.width - (anchor.left + anchor.width) : anchor.left) - gap - margin,
    end: (rtl ? anchor.left : viewport.width - (anchor.left + anchor.width)) - gap - margin,
  };
  const need: Record<PopoverPlacement, number> = { top: pop.height, bottom: pop.height, start: pop.width, end: pop.width };
  const order: PopoverPlacement[] = ["bottom", "top", "end", "start"];
  const side: PopoverPlacement = want !== "auto" && room[want] >= need[want] ? want : order.filter((s) => room[s] >= need[s]).sort((a, b) => room[b] - room[a])[0] ?? order.sort((a, b) => room[b] - room[a])[0]!;
  const cx = anchor.left + anchor.width / 2, cy = anchor.top + anchor.height / 2;
  const physical = side === "start" ? (rtl ? "right" : "left") : side === "end" ? (rtl ? "left" : "right") : side;
  let top = physical === "top" ? anchor.top - gap - pop.height : physical === "bottom" ? anchor.top + anchor.height + gap : cy - pop.height / 2;
  let left = physical === "left" ? anchor.left - gap - pop.width : physical === "right" ? anchor.left + anchor.width + gap : cx - pop.width / 2;
  top = Math.max(margin, Math.min(top, viewport.height - pop.height - margin));
  left = Math.max(margin, Math.min(left, viewport.width - pop.width - margin));
  return { top, left, side };
}

export type TourOptions = WidgetControllerBase & {
  entry: DeliveredChecklist;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
  root?: ParentNode;
  anchors?: AnchorRegistry;
};

export type TourHandle = WidgetHandle & { controller: TourController };

export function mountTour(container: HTMLElement | null, options: TourOptions): TourHandle {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const m = tourMessages(options.locale, options.messages);
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const ctl = createTour({ entry, onEvent: options.onEvent });

  const layer = widgetRoot(doc, "checklist", entry.id, m.tour, { dir: rtl ? "rtl" : "ltr", "data-mode": "tour" });
  applyTheme(layer, options.theme);
  const ring = el(doc, "div", { class: "cs-tour__ring", "aria-hidden": "true", hidden: true });
  const dot = el(doc, "button", { type: "button", class: "cs-tour__dot", hidden: true });
  const pop = el(doc, "div", { class: "cs-tour__pop", role: "dialog", "aria-modal": "false", tabindex: -1 });
  const live = el(doc, "div", { class: "cs-sr", role: "status", "aria-live": "polite" });
  layer.append(ring, dot, pop, live);
  (container ?? doc.body).append(layer);

  let anchorEl: HTMLElement | null = null;
  let offAnchor: (() => void) | null = null;
  let revealed = true;
  let raf = 0;

  const presentationOf = (s: TourStep): TourPresentation => s.presentation ?? cfg.tour.presentation;

  function position(): void {
    const s = ctl.step;
    if (!s) return;
    const view = { width: win.innerWidth || 1024, height: win.innerHeight || 768 };
    const pr = pop.getBoundingClientRect();
    const size = { width: pr.width || 280, height: pr.height || 140 };
    const a = anchorEl && anchorEl.isConnected ? anchorEl.getBoundingClientRect() : null;
    const pres = presentationOf(s);
    if (!a) {
      ring.hidden = true;
      dot.hidden = true;
      pop.setAttribute("data-side", "center");
      pop.style.top = `${Math.max(8, (view.height - size.height) / 2)}px`;
      pop.style.left = `${Math.max(8, (view.width - size.width) / 2)}px`;
      return;
    }
    const spot = { top: a.top - 6, left: a.left - 6, width: a.width + 12, height: a.height + 12 };
    ring.hidden = pres === "tooltip";
    ring.setAttribute("data-kind", pres);
    Object.assign(ring.style, { top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, height: `${spot.height}px` });
    dot.hidden = pres !== "hotspot";
    if (pres === "hotspot") Object.assign(dot.style, { top: `${a.top + a.height / 2 - 12}px`, left: `${a.left + a.width / 2 - 12}px` });
    pop.hidden = pres === "hotspot" && !revealed;
    const at = popoverPosition(a, size, view, s.placement, rtl);
    pop.setAttribute("data-side", at.side);
    pop.style.top = `${at.top}px`;
    pop.style.left = `${at.left}px`;
  }
  const schedule = (): void => {
    if (raf) return;
    const run = (): void => {
      raf = 0;
      position();
    };
    raf = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame(run) : (win.setTimeout(run, 16) as unknown as number);
  };

  function bindAnchor(s: TourStep): void {
    offAnchor?.();
    offAnchor = null;
    anchorEl = findAnchor(doc, s.anchor, options.anchors);
    if (options.root && anchorEl && !options.root.contains(anchorEl)) anchorEl = null;
    if (anchorEl && s.next_on === "anchor_click") {
      const target = anchorEl;
      const onClick = (): void => ctl.next("anchor");
      target.addEventListener("click", onClick, { once: true });
      offAnchor = () => target.removeEventListener("click", onClick);
    }
    anchorEl?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
  }

  function render(): void {
    const s = ctl.step;
    if (!s) return destroy();
    bindAnchor(s);
    revealed = presentationOf(s) !== "hotspot";
    const last = ctl.index === ctl.steps.length - 1;
    const titleId = `cs-tt-${entry.id}`;
    pop.setAttribute("aria-labelledby", titleId);
    pop.setAttribute("aria-label", m.tour);
    const stepText = fmt(m.stepOf, { n: ctl.index + 1, total: ctl.steps.length });
    const skip = el(doc, "button", { type: "button", class: "cs-tour__skip" }, m.skip);
    const back = ctl.index > 0 ? el(doc, "button", { type: "button", class: "cs-tour__back" }, m.back) : null;
    const next = el(doc, "button", { type: "button", class: "cs-widget__cta cs-tour__next" }, last ? m.finish : m.next);
    skip.addEventListener("click", () => ctl.skip());
    back?.addEventListener("click", () => ctl.prev());
    next.addEventListener("click", () => ctl.next("button"));
    pop.replaceChildren(el(doc, "p", { class: "cs-tour__step" }, stepText), el(doc, "h3", { id: titleId, class: "cs-tour__title", tabindex: -1 }, s.title));
    if (s.body) pop.append(el(doc, "p", { class: "cs-tour__body" }, s.body));
    pop.append(el(doc, "div", { class: "cs-tour__actions" }, skip, ...(back ? [back] : []), next));
    pop.hidden = false;
    live.textContent = `${stepText}: ${s.title}`;
    position();
    if (presentationOf(s) === "hotspot") {
      pop.hidden = true;
      dot.setAttribute("aria-label", fmt(m.showStep, { title: s.title }));
      dot.onclick = () => {
        revealed = true;
        pop.hidden = false;
        position();
        pop.querySelector<HTMLElement>(".cs-tour__title")?.focus();
      };
    } else pop.querySelector<HTMLElement>(".cs-tour__title")?.focus({ preventScroll: true });
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && ctl.step) {
      e.stopPropagation();
      ctl.skip();
    }
  };
  doc.addEventListener("keydown", onKey);
  win.addEventListener("resize", schedule, { passive: true });
  win.addEventListener("scroll", schedule, { passive: true, capture: true });
  const Observer = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
  // El ancla puede llegar tarde o irse: se vuelve a buscar cuando cambia el DOM y se recoloca el globo.
  const mo = Observer
    ? new Observer(() => {
        const s = ctl.step;
        if (s && !anchorEl?.isConnected && findAnchor(doc, s.anchor, options.anchors)) bindAnchor(s);
        schedule();
      })
    : null;
  mo?.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-customy-anchor"] });

  const unsub = ctl.subscribe(() => render());
  emit({ type: "impression" });

  let dead = false;
  function destroy(): void {
    if (dead) return;
    dead = true;
    unsub();
    offAnchor?.();
    mo?.disconnect();
    doc.removeEventListener("keydown", onKey);
    win.removeEventListener("resize", schedule);
    win.removeEventListener("scroll", schedule, { capture: true });
    layer.remove();
  }
  return { element: layer, destroy, controller: ctl };
}
