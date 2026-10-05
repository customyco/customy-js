// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Banner, StoryBar, StoryViewer } from "./index";
import { banner, group } from "../test-fixtures";
import type { ViewerEvent } from "../viewer";

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("componentes React", () => {
  it("StoryBar pinta los grupos, abre el visor y reenvía los eventos más recientes", () => {
    const onEvent = vi.fn();
    const groups = [group("a", ["p1"], { title: "Alfa" }), group("b", ["p1"], { title: "Beta", pinned: true })];
    const { rerender } = render(<StoryBar groups={groups} locale="es" viewer={{ preloader: false, onEvent }} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Abrir historia: Beta, nueva, fijada, 1 de 2", "Abrir historia: Alfa, nueva, 2 de 2"]);
    // Cambiar los callbacks no re-monta: se usa el último.
    const onEvent2 = vi.fn();
    rerender(<StoryBar groups={groups} locale="es" viewer={{ preloader: false, onEvent: onEvent2 }} />);
    act(() => buttons[0]?.click());
    expect(document.querySelector("dialog")).not.toBeNull();
    expect(onEvent2).toHaveBeenCalledWith(expect.objectContaining({ type: "view", groupId: "b" }));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("StoryBar se actualiza en sitio al cambiar `groups`", () => {
    const { rerender, container } = render(<StoryBar groups={[group("a")]} />);
    expect(container.querySelectorAll("button.cs-item")).toHaveLength(1);
    rerender(<StoryBar groups={[group("a"), group("b")]} />);
    expect(container.querySelectorAll("button.cs-item")).toHaveLength(2);
  });

  it("Banner monta, descarta y se limpia al desmontar", () => {
    const onDismiss = vi.fn();
    const { container, unmount } = render(<Banner banner={banner("bn")} locale="es" immediateImpression reducedMotion onDismiss={onDismiss} />);
    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Banner bn");
    act(() => screen.getByLabelText("Descartar").click());
    expect(onDismiss).toHaveBeenCalledWith("user");
    expect(container.querySelector("section")).toBeNull();
    unmount();
  });

  it("StoryViewer controlado: abre con open, cierra con open=false y avisa onClose", () => {
    const events: ViewerEvent[] = [];
    const onClose = vi.fn();
    const groups = [group("a", ["p1", "p2"])];
    const { rerender } = render(<StoryViewer open={false} groups={groups} preloader={false} onEvent={(e) => events.push(e)} onClose={onClose} />);
    expect(document.querySelector("dialog")).toBeNull();
    rerender(<StoryViewer open groups={groups} preloader={false} onEvent={(e) => events.push(e)} onClose={onClose} />);
    expect(document.querySelector("dialog")).not.toBeNull();
    act(() => (document.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    expect(onClose).toHaveBeenCalledWith("user");
    expect(document.querySelector("dialog")).toBeNull();
    rerender(<StoryViewer open groups={groups} preloader={false} onClose={onClose} />);
    rerender(<StoryViewer open={false} groups={groups} preloader={false} onClose={onClose} />);
    expect(document.querySelector("dialog")).toBeNull();
  });
});
