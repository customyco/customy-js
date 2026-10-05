// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ChecklistItem, DeliveredChecklist } from "../types";
import type { WidgetEvent } from "./common";
import { createChecklist, mountChecklist, nextOpen } from "./checklist";

const item = (id: string, complete_on: ChecklistItem["complete_on"] = { type: "click" }, over: Partial<ChecklistItem> = {}): ChecklistItem => ({ type: "item", id, title: `Paso ${id}`, complete_on, ...over });
const entry = (items: ChecklistItem[], over: Partial<DeliveredChecklist["config"]> = {}): DeliveredChecklist => ({
  id: "start", priority: 50, control: false, items,
  config: { mode: "checklist", title: "Empieza", ordered: false, dismissible: true, dismiss_confirm: true, progress: "bar", tour: { presentation: "tooltip", skippable: true }, ...over },
});

describe("createChecklist", () => {
  it("completa por clic, evento y manual; un ítem hecho no se rehace ni se desmarca", () => {
    const events: WidgetEvent[] = [];
    const c = createChecklist({ entry: entry([item("a"), item("b", { type: "event", event: "profile_saved" }), item("c", { type: "manual" })]), onEvent: (e) => events.push(e) });
    expect(c.activate("a")).toBe(true);
    expect(c.activate("a")).toBe(false);
    expect(c.activate("c")).toBe(false); // manual no se completa con clic
    expect(c.notify("profile_saved")).toEqual(["b"]);
    expect(c.notify("profile_saved")).toEqual([]);
    expect(c.complete("c", "manual")).toBe(true);
    expect(c.allDone).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["checklist_item", "checklist_item", "checklist_item", "complete"]);
    expect(events.filter((e) => e.type === "checklist_item").map((e) => e.type === "checklist_item" && e.via)).toEqual(["click", "event", "manual"]);
  });

  it("en orden: solo el primer pendiente; sync solo añade (un progreso viejo no desmarca)", () => {
    const c = createChecklist({ entry: entry([item("a"), item("b"), item("c")], { ordered: true }) });
    expect(c.isLocked("b")).toBe(true);
    expect(c.complete("b", "manual")).toBe(false);
    expect(c.complete("a", "click")).toBe(true);
    expect(c.isLocked("b")).toBe(false);
    expect(c.sync({ completed: { b: "2026-10-02T10:00:00Z" }, dismissed: false })).toEqual(["b"]);
    expect(c.sync({ completed: {}, dismissed: false })).toEqual([]);
    expect(c.isDone("a") && c.isDone("b")).toBe(true);
    expect(nextOpen([{ id: "a" }, { id: "b" }], { a: 1 }, true)).toEqual(["b"]);
  });

  it("arranca con lo ya hecho del servidor y no emite complete si ya estaba completo; ignora ids desconocidos", () => {
    const events: WidgetEvent[] = [];
    const c = createChecklist({ entry: entry([item("a")]), progress: { completed: { a: "x", ghost: "y" }, dismissed: false }, onEvent: (e) => events.push(e) });
    expect(c.done).toBe(1);
    expect(c.sync(undefined)).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe("mountChecklist", () => {
  const mount = (e: DeliveredChecklist, extra: Record<string, unknown> = {}) => {
    const host = document.createElement("div");
    document.body.append(host);
    const events: WidgetEvent[] = [];
    const h = mountChecklist(host, { entry: e, onEvent: (ev) => events.push(ev), locale: "es", ...extra });
    return { host, events, h };
  };

  it("pinta progreso accesible, estado por ítem y anuncia el avance", () => {
    const { host, h } = mount(entry([item("a"), item("b")]));
    const bar = host.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(host.querySelector(".cs-check__count")!.textContent).toBe("0 de 2 completados");
    host.querySelector<HTMLElement>('[data-item-id="a"]')!.click();
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(host.querySelector('[data-item-id="a"]')!.getAttribute("aria-label")).toBe("Paso a: completado");
    expect(host.querySelector('[role="status"]')!.textContent).toBe("1 de 2 completados");
    expect(h.done).toBe(1);
  });

  it("en orden bloquea los siguientes (aria-disabled) y el clic no hace nada", () => {
    const { host, events } = mount(entry([item("a"), item("b")], { ordered: true }));
    const b = host.querySelector<HTMLElement>('[data-item-id="b"]')!;
    expect(b.getAttribute("aria-disabled")).toBe("true");
    b.click();
    expect(events.some((e) => e.type === "click")).toBe(false);
  });

  it("clic emite click con element_id, abre la acción y completa; al terminar muestra el mensaje", () => {
    const openLink = vi.fn();
    const { host, events } = mount(entry([item("a", { type: "click" }, { element_id: "ck.a", action: { type: "url", url: "https://example.com/a" } })], { completion_message: "¡Listo, genial!" }), { openLink });
    host.querySelector<HTMLElement>('[data-item-id="a"]')!.click();
    expect(events).toContainEqual({ widgetId: "start", type: "click", elementId: "ck.a", itemId: "a" });
    expect(openLink).toHaveBeenCalledWith({ type: "url", url: "https://example.com/a" }, { widgetId: "start", itemId: "a", elementId: "ck.a" });
    expect(host.querySelector(".cs-check__done")!.textContent).toBe("¡Listo, genial!");
    expect(events.at(-1)).toMatchObject({ type: "complete" });
  });

  it("descartar pide confirmación; cancelar conserva, confirmar emite dismiss y retira; sin confirm es directo", () => {
    const { host, events, h } = mount(entry([item("a")]));
    host.querySelector<HTMLElement>(".cs-check__dismiss")!.click();
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    host.querySelector<HTMLElement>(".cs-check__cancel")!.click();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(events.some((e) => e.type === "dismiss")).toBe(false);
    host.querySelector<HTMLElement>(".cs-check__dismiss")!.click();
    host.querySelector<HTMLElement>(".cs-check__ok")!.click();
    expect(events).toContainEqual({ widgetId: "start", type: "dismiss", reason: "user" });
    expect(h.element.isConnected).toBe(false);
    const d = mount(entry([item("a")], { dismiss_confirm: false }));
    d.host.querySelector<HTMLElement>(".cs-check__dismiss")!.click();
    expect(d.events.some((e) => e.type === "dismiss")).toBe(true);
  });

  it("no dismissible: sin botón de descarte; progress none: sin barra", () => {
    const { host } = mount(entry([item("a")], { dismissible: false, progress: "none" }));
    expect(host.querySelector(".cs-check__dismiss")).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
  });
});
