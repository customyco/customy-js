import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { rn } from "./mocks/react-native";
import { touches } from "./mocks/gesture-handler";
import { withRepeat } from "react-native-reanimated";
import { describe, expect, it, vi } from "vitest";
import { createMemoryStore, createSeenTracker, type StoryBarStyle, type StoryGroup } from "@customyai/stories-render";
import { StoryBarView } from "../src/story-bar";
import { buildSequence, mergeBarStyle } from "../src/sequence";
import { attr, renderWithProvider, styleOf } from "./harness";
import { group } from "./fixtures";

const flush = async (): Promise<void> => void (await act(async () => {}));
const item = (id: string): HTMLElement => screen.getByTestId(`cs-item-${id}`);
const labels = (): string[] => screen.getAllByTestId(/^cs-item-/).map((e) => attr(e, "aria-label")!);

describe("barra: orden y etiquetas para lectores de pantalla", () => {
  it("cada grupo es un botón con título, estado, fijada, en vivo y posición", async () => {
    const groups = [group("a", ["p1"], { title: "Novedades", pinned: true, live: true, order: 2 }), group("b", ["p1"], { title: "Ofertas", order: 1 })];
    renderWithProvider(<StoryBarView groups={groups} />);
    await flush();
    // fijados primero
    expect(labels()).toEqual(["Abrir historia: Novedades, nueva, fijada, en vivo, 1 de 2", "Abrir historia: Ofertas, nueva, 2 de 2"]);
    expect(attr(item("a"), "data-role")).toBe("button");
    expect(attr(screen.getByTestId("cs-story-bar"), "data-role")).toBe("list");
  });

  it("el control, los vacíos y los nudge no se pintan en la barra", async () => {
    const groups = [group("a"), group("ctl", [], { control: true, pages: undefined }), group("empty", []), group("n", ["p1"], { mode: "nudge", nudge: { disturbance_id: "d", position: 1 } })];
    renderWithProvider(<StoryBarView groups={groups} />);
    await flush();
    expect(screen.getAllByTestId(/^cs-item-/)).toHaveLength(1);
  });

  it("visto/no visto: el anillo y la etiqueta cambian al ver las páginas, y el orden se recalcula solo al cerrar", async () => {
    const seen = createSeenTracker(createMemoryStore());
    const groups = [group("a", ["p1"], { order: 1 }), group("b", ["p1"], { order: 2 })];
    const style: Partial<StoryBarStyle> = { order: "unseen_first" };
    renderWithProvider(<StoryBarView groups={groups} style={style} seen={seen} />);
    await flush();
    const ring = (id: string) => styleOf(item(id).querySelector("[data-rn=Animated\\.View]")).borderColor;
    expect(ring("a")).toBe(ring("b"));
    act(() => seen.markPageSeen("a", "p1"));
    expect(attr(item("a"), "aria-label")).toContain("vista");
    expect(ring("a")).not.toBe(ring("b"));
    // sigue donde estaba hasta que se reordene (cerrar el visor)
    expect(labels()[0]).toContain("Grupo a");
  });

  it("los tokens de la app tiñen el anillo y la campaña manda sobre ellos", async () => {
    renderWithProvider(<StoryBarView groups={[group("a"), group("b")]} style={{ ring: { enabled: true, unseen_color: "#00ff00" } }} />, { theme: { ringUnseen: "token-anillo" } });
    await flush();
    const ring = (id: string) => styleOf(item(id).querySelector("[data-rn=Animated\\.View]")).borderColor;
    expect(ring("a")).toBe("#00ff00");
    const { unmount } = renderWithProvider(<StoryBarView groups={[group("z")]} />, { theme: { ringUnseen: "token-anillo" } });
    expect(ring("z")).toBe("token-anillo");
    unmount();
  });

  it("formas y tamaños de portada", async () => {
    renderWithProvider(<StoryBarView groups={[group("a")]} style={{ cover_shape: "portrait", size: "large" }} />);
    await flush();
    expect(styleOf(item("a").querySelector("img"))).toMatchObject({ width: 84, height: Math.round(84 * 1.45), borderRadius: 11 });
  });

  it("la variante energizada respira en los no vistos, y se calla con «reducir movimiento»", async () => {
    renderWithProvider(<StoryBarView groups={[group("a")]} style={{ variant: "energized" }} />);
    await flush();
    expect(withRepeat).toHaveBeenCalled();
    cleanup();
    vi.mocked(withRepeat).mockClear();
    renderWithProvider(<StoryBarView groups={[group("a")]} style={{ variant: "energized" }} />, { reducedMotion: true });
    await flush();
    expect(withRepeat).not.toHaveBeenCalled();
    cleanup();
    renderWithProvider(<StoryBarView groups={[group("a")]} style={{ variant: "classic" }} />);
    await flush();
    expect(withRepeat).not.toHaveBeenCalled();
  });

  it("insignias: título, fijada y «en vivo» configurables", async () => {
    renderWithProvider(<StoryBarView groups={[group("a", ["p1"], { live: true, pinned: true })]} style={{ show_title: false, live_badge: { enabled: false, label: "VIVO" } }} />);
    await flush();
    expect(within(item("a")).queryByText("Grupo a")).toBeNull();
    expect(within(item("a")).queryByText("VIVO")).toBeNull();
    expect(within(item("a")).getByText("📌")).toBeTruthy();
  });

  it("RTL fija la dirección del layout", async () => {
    rn.setRTL(true);
    renderWithProvider(<StoryBarView groups={[group("a")]} />);
    await flush();
    expect(styleOf(screen.getByTestId("cs-story-bar")).direction).toBe("rtl");
  });
});

describe("barra: abrir el visor", () => {
  it("pulsar abre en ese grupo y al cerrar el foco vuelve a su botón", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const onOpen = vi.fn();
    const onClose = vi.fn();
    renderWithProvider(<StoryBarView groups={[group("a"), group("b")]} onOpen={onOpen} viewer={{ onClose }} />);
    await flush();
    fireEvent.click(item("b"));
    await flush();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(screen.getByTestId("cs-stage")).toBeTruthy();
    expect(screen.getByTestId("cs-live").textContent).toContain("Grupo b");
    fireEvent.click(screen.getByTestId("cs-close"));
    await flush();
    expect(onClose).toHaveBeenCalledWith("user");
    expect(screen.queryByTestId("cs-stage")).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(150)));
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalled();
  });

  it("`canOpen` falso (otra superficie manda) no abre", async () => {
    renderWithProvider(<StoryBarView groups={[group("a")]} canOpen={() => false} />);
    await flush();
    fireEvent.click(item("a"));
    await flush();
    expect(screen.queryByTestId("cs-stage")).toBeNull();
  });

  it("el visor recorre la barra con los nudge insertados entre sus grupos", async () => {
    const groups = [group("a", ["p1"], { order: 1 }), group("b", ["p1"], { order: 2 }), group("n", ["p1"], { mode: "nudge", order: 0, nudge: { disturbance_id: "d", position: 1 } })];
    const events: string[] = [];
    renderWithProvider(<StoryBarView groups={groups} viewer={{ onEvent: (e) => e.type === "view" && events.push(e.groupId) }} />);
    await flush();
    fireEvent.click(item("a"));
    await flush();
    touches.swipe([300, 300], [100, 300]);
    await flush();
    touches.swipe([300, 300], [100, 300]);
    await flush();
    expect(events).toEqual(["a", "n", "b"]);
  });

  it("onRender entrega la lista ya ordenada (para registrar impresiones) y avisa onWidgetReady", async () => {
    const onRender = vi.fn();
    const onWidgetReady = vi.fn();
    renderWithProvider(<StoryBarView placementId="home" groups={[group("a", ["p1"], { order: 2 }), group("b", ["p1"], { order: 1 })]} onRender={onRender} />, { onWidgetReady });
    await flush();
    expect((onRender.mock.calls[0]![0] as StoryGroup[]).map((g) => g.id)).toEqual(["b", "a"]);
    expect(onWidgetReady).toHaveBeenCalledWith({ placementId: "home", surface: "story" });
  });
});

describe("secuencia", () => {
  it("max_groups recorta, y mergeBarStyle completa los valores por defecto", () => {
    const style = mergeBarStyle({ ring: { enabled: false } });
    expect(style.ring).toEqual({ enabled: false });
    expect(style.live_badge.enabled).toBe(true);
    const groups = [group("a", ["p1"], { order: 0 }), group("b", ["p1"], { order: 1 })];
    expect(buildSequence(groups, style).ordered.map((g) => g.id)).toEqual(["a", "b"]);
    expect(buildSequence(groups, { ...style, max_groups: 1 }).ordered.map((g) => g.id)).toEqual(["a"]);
  });
});
