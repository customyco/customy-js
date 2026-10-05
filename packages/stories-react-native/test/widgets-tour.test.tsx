import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessibilityInfo } from "react-native";
import { popoverPosition } from "@customyai/stories-render/widgets/tour";
import { StoriesAnchor, TourView, createAnchorRegistry, type AnchorRegistry, type WidgetEvent } from "../src/widgets";
import { rn } from "./mocks/react-native";
import { attr, renderWithProvider } from "./harness";
import { step, tourEntry } from "./widget-fixtures";

afterEach(() => void vi.useRealTimers());

const STEPS = [step("s1", "home.cart"), step("s2", "home.search"), step("s3", "home.profile")];
const flush = async (): Promise<void> => void (await act(async () => {}));
const style = (id: string) => JSON.parse(attr(screen.getByTestId(id), "data-style")!) as Record<string, unknown>;

function setup(steps = STEPS, over = {}, props: Record<string, unknown> = {}, viewProps: Record<string, unknown> = {}, withAnchors = true) {
  const events: WidgetEvent[] = [];
  const registry = createAnchorRegistry();
  rn.setLayout("cs-tour-start", { x: 0, y: 0, width: 400, height: 800 });
  rn.setLayout("cs-anchor-home.cart", { x: 100, y: 300, width: 80, height: 40 });
  rn.setLayout("cs-anchor-home.search", { x: 20, y: 60, width: 200, height: 44 });
  const view = renderWithProvider(
    <>
      {withAnchors ? (
        <>
          <StoriesAnchor id="home.cart" registry={registry} />
          <StoriesAnchor id="home.search" registry={registry} />
          <StoriesAnchor id="home.profile" registry={registry} />
        </>
      ) : null}
      <TourView entry={tourEntry(steps, over)} registry={registry} onEvent={(e) => events.push(e)} {...viewProps} />
    </>,
    props,
  );
  return { events, registry, ...view };
}
const types = (events: WidgetEvent[]) => events.map((e) => (e.type === "tour_step" ? `tour_step:${e.stepId}:${e.step}` : e.type));

describe("Tour nativo", () => {
  it("primer paso: título, «Paso 1 de 3», anuncio, foco de accesibilidad y eventos impression + shown", async () => {
    const { events } = setup();
    await flush();
    expect(screen.getByTestId("cs-tour-title").textContent).toBe("Título s1");
    expect(screen.getByText("Paso 1 de 3")).toBeTruthy();
    expect(types(events)).toEqual(["impression", "tour_step:s1:shown"]);
    expect(screen.getByTestId("cs-tour-live").textContent).toBe("Paso 1 de 3: Título s1");
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalled();
    expect(attr(screen.getByTestId("cs-tour-pop"), "data-modal")).toBeNull(); // no es modal: la app sigue usable
  });

  it("el globo se coloca con `popoverPosition` sobre el ancla medida con measureInWindow", async () => {
    setup();
    await flush();
    const expected = popoverPosition({ top: 300, left: 100, width: 80, height: 40 }, { width: 300, height: 60 }, { width: 400, height: 800 }, "auto", false);
    const pop = style("cs-tour-pop");
    expect(pop.top).toBe(expected.top);
    expect(pop.left).toBe(expected.left);
  });

  it("RTL invierte `start`/`end` igual que la función pura", async () => {
    rn.setRTL(true);
    setup([step("s1", "home.cart", { placement: "start" })]);
    await flush();
    const expected = popoverPosition({ top: 300, left: 100, width: 80, height: 40 }, { width: 300, height: 60 }, { width: 400, height: 800 }, "start", true);
    expect(style("cs-tour-pop").left).toBe(expected.left);
  });

  it("sin ancla el paso va centrado (no se pierde); si el ancla llega después, se recoloca sobre ella", async () => {
    const registry = createAnchorRegistry();
    rn.setLayout("cs-tour-start", { x: 0, y: 0, width: 400, height: 800 });
    rn.setLayout("cs-anchor-home.cart", { x: 100, y: 300, width: 80, height: 40 });
    let setShow: (v: boolean) => void = () => undefined;
    function Screen() {
      const [show, set] = useState(false);
      setShow = set;
      return (
        <>
          {show ? <StoriesAnchor id="home.cart" registry={registry} /> : null}
          <TourView entry={tourEntry([step("s1", "home.cart")])} registry={registry} />
        </>
      );
    }
    renderWithProvider(<Screen />);
    await flush();
    // centrado con el tamaño medido del globo (300 × 60) en la ventana de 400 × 800
    expect(style("cs-tour-pop")).toMatchObject({ top: (800 - 60) / 2, left: (400 - 300) / 2 });
    expect(screen.queryByTestId("cs-tour-ring")).toBeNull();
    act(() => setShow(true));
    await flush();
    await flush();
    const expected = popoverPosition({ top: 300, left: 100, width: 80, height: 40 }, { width: 300, height: 60 }, { width: 400, height: 800 }, "auto", false);
    expect(style("cs-tour-pop")).toMatchObject({ top: expected.top, left: expected.left });
  });

  it("siguiente / atrás / terminar: eventos de cada paso y `complete` al final; el tour se retira", async () => {
    const { events } = setup();
    await flush();
    fireEvent.click(screen.getByTestId("cs-tour-next"));
    await flush();
    expect(screen.getByTestId("cs-tour-title").textContent).toBe("Título s2");
    fireEvent.click(screen.getByTestId("cs-tour-back"));
    await flush();
    expect(screen.getByTestId("cs-tour-title").textContent).toBe("Título s1");
    fireEvent.click(screen.getByTestId("cs-tour-next"));
    fireEvent.click(screen.getByTestId("cs-tour-next"));
    await flush();
    expect(screen.getByTestId("cs-tour-next").getAttribute("aria-label")).toBe("Terminar");
    fireEvent.click(screen.getByTestId("cs-tour-next"));
    await flush();
    expect(types(events)).toEqual([
      "impression", "tour_step:s1:shown", "tour_step:s1:next", "tour_step:s2:shown", "tour_step:s2:prev", "tour_step:s1:shown",
      "tour_step:s1:next", "tour_step:s2:shown", "tour_step:s2:next", "tour_step:s3:shown", "tour_step:s3:done", "complete",
    ]);
    expect(screen.queryByTestId("cs-tour-start")).toBeNull();
  });

  it("se omite SIEMPRE: botón «Omitir recorrido», atrás de Android y el gesto de escape; emite skip + dismiss (user)", async () => {
    for (const how of ["button", "back", "escape"] as const) {
      const { events, unmount } = setup();
      await flush();
      act(() => {
        if (how === "button") fireEvent.click(screen.getByTestId("cs-tour-skip"));
        else if (how === "back") expect(rn.backPress()).toBe(true);
        else rn.escape("cs-tour-pop");
      });
      await flush();
      expect(types(events)).toEqual(["impression", "tour_step:s1:shown", "tour_step:s1:skip", "dismiss"]);
      expect(events.at(-1)).toMatchObject({ type: "dismiss", reason: "user" });
      expect(screen.queryByTestId("cs-tour-start")).toBeNull();
      unmount();
    }
  });

  it("spotlight: anillo y velo alrededor del hueco; tooltip: sin anillo", async () => {
    const { unmount } = setup(STEPS, { tour: { presentation: "spotlight", skippable: true } });
    await flush();
    const ring = style("cs-tour-ring");
    expect(ring).toMatchObject({ top: 294, left: 94, width: 92, height: 52 });
    expect(screen.getByTestId("cs-tour-dim").children).toHaveLength(4);
    unmount();
    setup(STEPS, { tour: { presentation: "tooltip", skippable: true } });
    await flush();
    expect(screen.queryByTestId("cs-tour-ring")).toBeNull();
    expect(screen.queryByTestId("cs-tour-dim")).toBeNull();
  });

  it("hotspot: solo el punto (≥ 44 pt) hasta tocarlo; entonces se despliega el globo", async () => {
    setup([step("s1", "home.cart", { presentation: "hotspot" })]);
    await flush();
    expect(screen.queryByTestId("cs-tour-pop")).toBeNull();
    const dot = screen.getByTestId("cs-tour-dot");
    expect(attr(dot, "aria-label")).toBe("Mostrar el paso: Título s1");
    expect(style("cs-tour-dot").width).toBeGreaterThanOrEqual(44);
    fireEvent.click(dot);
    await flush();
    expect(screen.getByTestId("cs-tour-title").textContent).toBe("Título s1");
  });

  it("`next_on: anchor_click`: tocar el ancla avanza al siguiente paso", async () => {
    const { events } = setup([step("s1", "home.cart", { next_on: "anchor_click" }), step("s2", "home.search")]);
    await flush();
    fireEvent.touchEnd(screen.getByTestId("cs-anchor-home.cart"));
    await flush();
    expect(screen.getByTestId("cs-tour-title").textContent).toBe("Título s2");
    expect(types(events)).toContain("tour_step:s1:next");
  });

  it("sigue al elemento si la pantalla se desplaza (vuelve a medir)", async () => {
    vi.useFakeTimers();
    setup(STEPS, { tour: { presentation: "spotlight", skippable: true } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(style("cs-tour-ring").top).toBe(294);
    rn.setLayout("cs-anchor-home.cart", { x: 100, y: 200, width: 80, height: 40 });
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(style("cs-tour-ring").top).toBe(194);
  });

  it("un tour sin pasos no pinta nada", async () => {
    setup([]);
    await flush();
    expect(screen.queryByTestId("cs-tour-start")).toBeNull();
  });
});

// Mantiene a la vista el contrato del registro.
describe("registro de anclas", () => {
  const node = (r: { x: number; y: number; width: number; height: number }) => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(r.x, r.y, r.width, r.height) });
  const check = async (reg: AnchorRegistry) => {
    const off = reg.register("a", node({ x: 1, y: 2, width: 3, height: 4 }));
    expect(reg.has("a")).toBe(true);
    expect(await reg.measure("a")).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    // otra vista toma el nombre: la última manda y la primera, al irse, no se lleva el nombre de la segunda
    const off2 = reg.register("a", node({ x: 9, y: 9, width: 9, height: 9 }));
    off();
    expect(await reg.measure("a")).toEqual({ x: 9, y: 9, width: 9, height: 9 });
    off2();
    expect(reg.has("a")).toBe(false);
    expect(await reg.measure("a")).toBeNull();
  };
  it("registra, mide, la última manda y al desmontar se va", async () => {
    await check(createAnchorRegistry());
  });
  it("una vista sin tamaño (o que no se puede medir) devuelve null", async () => {
    const reg = createAnchorRegistry();
    reg.register("z", node({ x: 0, y: 0, width: 0, height: 0 }));
    expect(await reg.measure("z")).toBeNull();
    reg.register("e", { measureInWindow: () => { throw new Error("sin vista nativa"); } });
    expect(await reg.measure("e")).toBeNull();
  });
});
