import { applyTheme } from "../dom/util";
import type { ChecklistItem, ComponentAction, DeliveredChecklist, WidgetProgress } from "../types";
import { defaultOpenLink, el, linkNode, onVisible, resolveUi, widgetElementId, widgetEmitter, widgetIcon, widgetRoot, type WidgetControllerBase, type WidgetEvent, type WidgetHandle } from "./common";
import { checklistMessages, fmt } from "./messages";

/**
 * Checklist (modo `checklist` del widget): lista de pasos de onboarding con progreso, orden opcional («completa en
 * orden»), ítems que se completan por evento de la app, por clic, por condición (la evalúa el servidor y llega en
 * `progress`) o a mano, y descarte con confirmación. **Un ítem completado nunca se desmarca**: ni `sync` con un
 * progreso viejo, ni un reintento, ni otro dispositivo lo deshacen. Para el modo `tour`, ver `./widgets/tour`.
 */

/** Igual que `checklistNextOpen` del contrato: ids pendientes, solo el primero si va en orden. */
export function nextOpen(items: ReadonlyArray<{ id: string }>, completed: Readonly<Record<string, unknown>>, ordered: boolean): string[] {
  const open = items.filter((i) => !(i.id in completed)).map((i) => i.id);
  return ordered ? open.slice(0, 1) : open;
}

export type ChecklistVia = "event" | "click" | "condition" | "manual";

export type ChecklistControllerOptions = {
  entry: DeliveredChecklist;
  progress?: WidgetProgress;
  onEvent?: (e: WidgetEvent) => void;
  now?: () => number;
};

export type ChecklistController = {
  readonly items: readonly ChecklistItem[];
  readonly completed: Readonly<Record<string, string>>;
  readonly done: number;
  readonly total: number;
  readonly allDone: boolean;
  isDone(id: string): boolean;
  /** Con `ordered`, solo el primer pendiente se puede completar. */
  isLocked(id: string): boolean;
  /** Completa un ítem (por `via`). `false` si ya estaba hecho, está bloqueado o no existe. */
  complete(id: string, via: ChecklistVia): boolean;
  /** La app avisa de un evento (`complete_on: { type: "event", event }`): completa los ítems que lo esperan. */
  notify(event: string): string[];
  /** Un clic en el ítem: lo completa si es de tipo `click`. */
  activate(id: string): boolean;
  /** Une un progreso de fuera (servidor, otro dispositivo): solo AÑADE. */
  sync(progress: WidgetProgress | undefined): string[];
  subscribe(l: () => void): () => void;
};

export function createChecklist(options: ChecklistControllerOptions): ChecklistController {
  const { entry } = options;
  const items = (entry.items ?? []).filter((i): i is ChecklistItem => i.type === "item");
  const ordered = entry.config.ordered;
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const now = options.now ?? Date.now;
  const known = new Set(items.map((i) => i.id));
  const completed: Record<string, string> = {};
  for (const [id, at] of Object.entries(options.progress?.completed ?? {})) if (known.has(id)) completed[id] = at;
  const listeners = new Set<() => void>();
  let finished = items.length > 0 && items.every((i) => i.id in completed);
  const changed = (): void => listeners.forEach((l) => l());
  const maybeFinish = (): void => {
    if (!finished && items.length > 0 && items.every((i) => i.id in completed)) {
      finished = true;
      emit({ type: "complete" });
    }
  };
  const api: ChecklistController = {
    items,
    completed,
    get done() { return Object.keys(completed).length; },
    total: items.length,
    get allDone() { return items.length > 0 && api.done >= items.length; },
    isDone: (id) => id in completed,
    isLocked: (id) => !(id in completed) && ordered && !nextOpen(items, completed, true).includes(id),
    complete(id, via) {
      if (!known.has(id) || id in completed || api.isLocked(id)) return false;
      completed[id] = new Date(now()).toISOString();
      emit({ type: "checklist_item", itemId: id, via });
      maybeFinish();
      changed();
      return true;
    },
    notify(event) {
      const hit: string[] = [];
      for (const i of items) if (i.complete_on.type === "event" && i.complete_on.event === event && api.complete(i.id, "event")) hit.push(i.id);
      return hit;
    },
    activate(id) {
      const item = items.find((i) => i.id === id);
      return item?.complete_on.type === "click" ? api.complete(id, "click") : false;
    },
    sync(progress) {
      const added: string[] = [];
      for (const [id, at] of Object.entries(progress?.completed ?? {})) {
        if (!known.has(id) || id in completed) continue;
        completed[id] = at;
        added.push(id);
      }
      if (added.length) {
        finished ||= api.allDone;
        changed();
      }
      return added;
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  return api;
}

export type ChecklistOptions = WidgetControllerBase & {
  entry: DeliveredChecklist;
  progress?: WidgetProgress;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
  openLink?: (action: ComponentAction, ctx: { widgetId: string; itemId: string; elementId: string }) => void;
};

export type ChecklistHandle = WidgetHandle & ChecklistController & { controller: ChecklistController };

export function mountChecklist(container: HTMLElement, options: ChecklistOptions): ChecklistHandle {
  const { doc, win, rtl } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const m = checklistMessages(options.locale, options.messages);
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const open = (a: ComponentAction, itemId: string, elementId: string): void => (options.openLink ?? ((x) => defaultOpenLink(x, win, options.allowedSchemes)))(a, { widgetId: entry.id, itemId, elementId });
  const ctl = createChecklist({ entry, progress: options.progress, onEvent: options.onEvent });

  const root = widgetRoot(doc, "checklist", entry.id, cfg.title || m.checklist, { dir: rtl ? "rtl" : "ltr", "data-mode": "checklist" });
  applyTheme(root, options.theme);
  const head = el(doc, "div", { class: "cs-check__head" }, el(doc, "h2", { class: "cs-check__title" }, cfg.title), cfg.description ? el(doc, "p", { class: "cs-check__desc" }, cfg.description) : null);
  const dismissBtn = cfg.dismissible ? el(doc, "button", { type: "button", class: "cs-ctl cs-check__dismiss", "aria-label": m.dismiss }, widgetIcon(doc, "close")) : null;
  if (dismissBtn) head.append(dismissBtn);
  const progressEl = cfg.progress === "none" ? null : el(doc, "div", { class: `cs-check__progress cs-check__progress--${cfg.progress}`, role: "progressbar", "aria-valuemin": 0, "aria-valuemax": ctl.total, "aria-label": m.checklist });
  const fill = progressEl ? el(doc, "span", { class: "cs-check__fill" }) : null;
  if (progressEl && fill) progressEl.append(fill);
  const label = el(doc, "p", { class: "cs-check__count" });
  const list = el(doc, "ol", { class: "cs-check__list" });
  const live = el(doc, "div", { class: "cs-sr", role: "status", "aria-live": "polite" });
  const message = el(doc, "p", { class: "cs-check__done", hidden: true });
  root.append(head, ...(progressEl ? [progressEl] : []), label, list, message, live);

  const rows = new Map<string, { li: HTMLElement; node: HTMLElement; mark: HTMLElement }>();
  for (const item of ctl.items) {
    const elementId = widgetElementId(entry.id, item.id, item.element_id);
    const mark = el(doc, "span", { class: "cs-check__mark", "aria-hidden": "true" });
    const body = el(doc, "span", { class: "cs-check__text" }, el(doc, "span", { class: "cs-check__item-title" }, item.title), item.description ? el(doc, "span", { class: "cs-check__item-desc" }, item.description) : null);
    const node = linkNode(doc, "button", item.action, { class: "cs-check__item", "data-item-id": item.id }, () => {
      if (ctl.isLocked(item.id)) return;
      emit({ type: "click", elementId, itemId: item.id });
      ctl.activate(item.id);
      if (item.action) open(item.action, item.id, elementId);
    });
    node.append(mark, body);
    const li = el(doc, "li", { class: "cs-check__row" }, node);
    list.append(li);
    rows.set(item.id, { li, node, mark });
  }

  const refresh = (announce?: string): void => {
    const open = nextOpen(ctl.items, ctl.completed, cfg.ordered);
    for (const item of ctl.items) {
      const r = rows.get(item.id)!;
      const done = ctl.isDone(item.id);
      const locked = !done && !open.includes(item.id);
      r.li.setAttribute("data-state", done ? "done" : locked ? "locked" : "open");
      r.node.setAttribute("aria-label", fmt(done ? m.itemDone : locked ? m.itemLocked : m.itemOpen, { title: item.title }));
      if (locked) r.node.setAttribute("aria-disabled", "true");
      else r.node.removeAttribute("aria-disabled");
      r.mark.replaceChildren(done ? widgetIcon(doc, "check", 14) : "");
    }
    const text = fmt(m.progressOf, { done: ctl.done, total: ctl.total });
    label.textContent = text;
    progressEl?.setAttribute("aria-valuenow", String(ctl.done));
    progressEl?.setAttribute("aria-valuetext", text);
    if (fill) fill.style.inlineSize = `${ctl.total ? (ctl.done / ctl.total) * 100 : 0}%`;
    if (ctl.allDone) {
      message.hidden = false;
      message.textContent = cfg.completion_message ?? m.allDone;
    }
    if (announce) live.textContent = ctl.allDone ? `${announce}. ${message.textContent}` : announce;
  };
  ctl.subscribe(() => refresh(label.textContent ? fmt(m.progressOf, { done: ctl.done, total: ctl.total }) : undefined));
  refresh();
  container.append(root);

  // ─── Descartar, con confirmación ──────────────────────────────────────────
  const finishDismiss = (): void => {
    emit({ type: "dismiss", reason: "user" });
    destroy();
  };
  dismissBtn?.addEventListener("click", () => {
    if (!cfg.dismiss_confirm) return finishDismiss();
    if (root.querySelector(".cs-check__confirm")) return;
    const ok = el(doc, "button", { type: "button", class: "cs-widget__cta cs-check__ok" }, m.dismissConfirm);
    const cancel = el(doc, "button", { type: "button", class: "cs-check__cancel" }, m.dismissCancel);
    const box = el(doc, "div", { class: "cs-check__confirm", role: "alertdialog", "aria-labelledby": `cs-cf-${entry.id}`, "aria-describedby": `cs-cd-${entry.id}` }, el(doc, "p", { id: `cs-cf-${entry.id}`, class: "cs-check__confirm-title" }, m.dismissTitle), el(doc, "p", { id: `cs-cd-${entry.id}` }, m.dismissBody), el(doc, "div", { class: "cs-check__confirm-actions" }, cancel, ok));
    const close = (): void => {
      box.remove();
      dismissBtn.focus();
    };
    ok.addEventListener("click", finishDismiss);
    cancel.addEventListener("click", close);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    });
    root.append(box);
    cancel.focus();
  });

  const stopVisible = onVisible(win, root, () => emit({ type: "impression" }));
  function destroy(): void {
    stopVisible();
    root.remove();
  }
  return Object.assign(Object.create(ctl) as ChecklistController, { element: root, destroy, controller: ctl }) as ChecklistHandle;
}
