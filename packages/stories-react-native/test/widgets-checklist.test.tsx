import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import type { WidgetProgress } from "@customyai/stories-render";
import type { ChecklistController } from "@customyai/stories-render/widgets/checklist";
import { ChecklistView, createAnchorRegistry, notifyChecklistEvent, type WidgetEvent } from "../src/widgets";
import { attr, renderWithProvider } from "./harness";
import { checklistEntry, item } from "./widget-fixtures";

function setup(items = [item("a"), item("b"), item("c")], over = {}, props: Record<string, unknown> = {}, viewProps: Record<string, unknown> = {}) {
  const events: WidgetEvent[] = [];
  const registry = createAnchorRegistry();
  const view = renderWithProvider(<ChecklistView entry={checklistEntry(items, over)} registry={registry} onEvent={(e) => events.push(e)} {...viewProps} />, props);
  return { events, registry, ...view };
}
const label = (id: string) => attr(screen.getByTestId(`cs-check-item-${id}`), "aria-label");
const st = (id: string) => JSON.parse(attr(screen.getByTestId(`cs-check-item-${id}`), "data-state")!);

describe("Checklist nativo", () => {
  it("pinta título (cabecera), progreso como progressbar y cada ítem con su estado leído", () => {
    setup();
    expect(screen.getByText("Empieza").getAttribute("data-role")).toBe("header");
    const bar = screen.getByTestId("cs-check-progress");
    expect(attr(bar, "data-role")).toBe("progressbar");
    expect(JSON.parse(attr(bar, "data-value")!)).toEqual({ min: 0, max: 3, now: 0, text: "0 de 3 completados" });
    expect(label("a")).toBe("Paso a: pendiente");
  });

  it("clic: completa el ítem de tipo click, emite `click` + `checklist_item` (vía click) y anuncia el avance", () => {
    const { events } = setup();
    fireEvent.click(screen.getByTestId("cs-check-item-a"));
    expect(events.map((e) => e.type)).toEqual(["impression", "click", "checklist_item"]);
    expect(events[1]).toMatchObject({ elementId: "widget.start.a", itemId: "a" });
    expect(events[2]).toMatchObject({ itemId: "a", via: "click" });
    expect(label("a")).toBe("Paso a: completado");
    expect(st("a").checked).toBe(true);
    expect(JSON.parse(attr(screen.getByTestId("cs-check-progress"), "data-value")!).now).toBe(1);
    expect(screen.getByTestId("cs-check-live").textContent).toBe("1 de 3 completados");
  });

  it("en orden: el siguiente está bloqueado (disabled, etiqueta lo dice) y pulsarlo no emite nada", () => {
    const { events } = setup([item("a"), item("b")], { ordered: true });
    expect(label("b")).toBe("Paso b: completa antes el paso anterior");
    expect(st("b").disabled).toBe(true);
    const before = events.length;
    fireEvent.click(screen.getByTestId("cs-check-item-b"));
    expect(events).toHaveLength(before);
    fireEvent.click(screen.getByTestId("cs-check-item-a"));
    expect(label("b")).toBe("Paso b: pendiente");
  });

  it("evento de la app: `notifyChecklistEvent` completa los ítems que lo esperan (vía event), una vez", () => {
    const { events, registry } = setup([item("a", { type: "event", event: "profile_saved" }), item("b")]);
    act(() => notifyChecklistEvent("profile_saved", registry));
    act(() => notifyChecklistEvent("profile_saved", registry));
    expect(events.filter((e) => e.type === "checklist_item")).toEqual([{ widgetId: "start", type: "checklist_item", itemId: "a", via: "event" }]);
    expect(label("a")).toBe("Paso a: completado");
  });

  it("a mano (`controllerRef`) y condición del servidor (`progress`): solo se AÑADE, nunca se desmarca", () => {
    const controllerRef: { current: ChecklistController | null } = { current: null };
    const entry = checklistEntry([item("a", { type: "manual" }), item("b", { type: "condition", filters: [] }), item("c")]);
    const events: WidgetEvent[] = [];
    let setProgress: (p: WidgetProgress) => void = () => undefined;
    function Host() {
      const [progress, set] = useState<WidgetProgress | undefined>(undefined);
      setProgress = set;
      return <ChecklistView entry={entry} progress={progress} registry={createAnchorRegistry()} onEvent={(e) => events.push(e)} controllerRef={controllerRef} />;
    }
    renderWithProvider(<Host />);
    expect(controllerRef.current).not.toBeNull();
    act(() => void controllerRef.current!.complete("a", "manual"));
    expect(events.find((e) => e.type === "checklist_item")).toMatchObject({ itemId: "a", via: "manual" });
    // el servidor evalúa la condición y la entrega en `progress`
    act(() => setProgress({ completed: { b: "2026-10-02T10:00:00Z" }, dismissed: false }));
    expect(label("b")).toBe("Paso b: completado");
    // un progreso viejo (vacío) no desmarca nada
    act(() => setProgress({ completed: {}, dismissed: false }));
    expect(label("b")).toBe("Paso b: completado");
    expect(label("a")).toBe("Paso a: completado");
  });

  it("completar todo: `complete` una vez, mensaje final y anuncio con él", () => {
    const { events } = setup([item("a"), item("b")], { completion_message: "¡Todo listo!" });
    fireEvent.click(screen.getByTestId("cs-check-item-a"));
    fireEvent.click(screen.getByTestId("cs-check-item-b"));
    expect(events.filter((e) => e.type === "complete")).toHaveLength(1);
    expect(screen.getByTestId("cs-check-done").textContent).toBe("¡Todo listo!");
    expect(screen.getByTestId("cs-check-live").textContent).toBe("2 de 2 completados. ¡Todo listo!");
  });

  it("un ítem con acción la abre (y avisa `onActionClicked`)", () => {
    const onActionClicked = vi.fn();
    setup([item("a", { type: "click" }, { action: { type: "url", url: "https://app.example.com/perfil" }, element_id: "check.perfil" })], {}, { onActionClicked });
    fireEvent.click(screen.getByTestId("cs-check-item-a"));
    expect(onActionClicked).toHaveBeenCalledWith({ type: "url", url: "https://app.example.com/perfil" }, expect.objectContaining({ surface: "widget", itemId: "a", elementId: "check.perfil" }));
    expect(Linking.openURL).toHaveBeenCalledWith("https://app.example.com/perfil");
  });

  it("descartar con confirmación: cancelar lo deja; confirmar emite dismiss (user) y lo retira", () => {
    const { events } = setup();
    fireEvent.click(screen.getByTestId("cs-check-dismiss"));
    const box = screen.getByTestId("cs-check-confirm");
    expect(attr(box, "data-role")).toBe("alert");
    expect(attr(box, "data-modal")).toBe("1");
    fireEvent.click(screen.getByTestId("cs-check-cancel"));
    expect(screen.queryByTestId("cs-check-confirm")).toBeNull();
    expect(events.some((e) => e.type === "dismiss")).toBe(false);
    fireEvent.click(screen.getByTestId("cs-check-dismiss"));
    fireEvent.click(screen.getByTestId("cs-check-ok"));
    expect(events.at(-1)).toEqual({ widgetId: "start", type: "dismiss", reason: "user" });
    expect(screen.queryByTestId("cs-checklist-start")).toBeNull();
  });

  it("sin confirmación descarta al instante; no descartable no ofrece el botón", () => {
    const { events, unmount } = setup(undefined, { dismiss_confirm: false });
    fireEvent.click(screen.getByTestId("cs-check-dismiss"));
    expect(events.at(-1)).toMatchObject({ type: "dismiss", reason: "user" });
    unmount();
    setup(undefined, { dismissible: false });
    expect(screen.queryByTestId("cs-check-dismiss")).toBeNull();
  });

  it("progreso `steps` y `none`", () => {
    const { unmount } = setup(undefined, { progress: "steps" });
    expect(screen.getByTestId("cs-check-progress").children).toHaveLength(3);
    unmount();
    setup(undefined, { progress: "none" });
    expect(screen.queryByTestId("cs-check-progress")).toBeNull();
  });

  it("arranca con lo ya hecho del servidor y no repite `complete` si ya estaba completo", () => {
    const { events } = setup([item("a"), item("b")], {}, {}, { progress: { completed: { a: "x", b: "y" }, dismissed: false } });
    expect(events.map((e) => e.type)).toEqual(["impression"]);
    expect(label("a")).toBe("Paso a: completado");
  });
});
