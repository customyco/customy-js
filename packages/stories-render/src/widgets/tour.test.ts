// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { DeliveredChecklist, TourStep } from "../types";
import type { WidgetEvent } from "./common";
import { createTour, mountTour, popoverPosition } from "./tour";

const step = (id: string, over: Partial<TourStep> = {}): TourStep => ({ type: "step", id, title: `Paso ${id}`, body: `Cuerpo ${id}`, anchor: `nav.${id}`, placement: "auto", next_on: "button", ...over });
const entry = (steps: TourStep[], tour: Partial<DeliveredChecklist["config"]["tour"]> = {}): DeliveredChecklist => ({
  id: "tour", priority: 50, control: false, items: steps,
  config: { mode: "tour", title: "Recorrido", ordered: false, dismissible: true, dismiss_confirm: false, progress: "steps", tour: { presentation: "tooltip", skippable: true, ...tour } },
});
const three = () => [step("a"), step("b"), step("c")];
afterEach(() => { document.body.innerHTML = ""; });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("popoverPosition", () => {
  const view = { width: 1000, height: 800 };
  const pop = { width: 300, height: 120 };
  it("respeta el lado pedido si cabe y cae al de más espacio si no", () => {
    expect(popoverPosition({ top: 300, left: 400, width: 100, height: 40 }, pop, view, "top").side).toBe("top");
    expect(popoverPosition({ top: 10, left: 400, width: 100, height: 40 }, pop, view, "top").side).toBe("bottom");
    expect(popoverPosition({ top: 20, left: 400, width: 100, height: 40 }, pop, view, "auto").side).toBe("bottom");
  });
  it("acota al viewport y start/end se invierten en rtl", () => {
    const p = popoverPosition({ top: 300, left: 990, width: 10, height: 40 }, pop, view, "bottom");
    expect(p.left + 300).toBeLessThanOrEqual(1000);
    const ltr = popoverPosition({ top: 300, left: 450, width: 100, height: 40 }, pop, view, "end", false);
    const rtl = popoverPosition({ top: 300, left: 450, width: 100, height: 40 }, pop, view, "end", true);
    expect(ltr.left).toBeGreaterThan(450);
    expect(rtl.left).toBeLessThan(450);
  });
});

describe("createTour", () => {
  it("shown, next, prev, done y complete; skip emite skip y dismiss user", async () => {
    const events: WidgetEvent[] = [];
    const t = createTour({ entry: entry(three()), onEvent: (e) => events.push(e) });
    t.subscribe(() => undefined);
    await tick();
    t.next();
    t.prev();
    t.next();
    t.next();
    t.next();
    expect(t.finished).toBe(true);
    const seq = events.map((e) => (e.type === "tour_step" ? `${e.step}:${e.stepId}` : e.type));
    expect(seq).toEqual(["shown:a", "next:a", "shown:b", "prev:b", "shown:a", "next:a", "shown:b", "next:b", "shown:c", "done:c", "complete"]);
    const ev2: WidgetEvent[] = [];
    const t2 = createTour({ entry: entry(three()), onEvent: (e) => ev2.push(e) });
    t2.skip();
    expect(ev2.map((e) => e.type)).toEqual(["tour_step", "dismiss"]);
    expect(ev2[1]).toMatchObject({ reason: "user" });
    t2.next();
    expect(ev2).toHaveLength(2);
  });
});

describe("mountTour", () => {
  const page = () => {
    document.body.innerHTML = `<nav><a data-customy-anchor="nav.a">A</a><a data-customy-anchor="nav.b">B</a><a data-customy-anchor="nav.c">C</a></nav>`;
  };
  const mount = (e: DeliveredChecklist, extra: Record<string, unknown> = {}) => {
    const events: WidgetEvent[] = [];
    const h = mountTour(null, { entry: e, onEvent: (ev) => events.push(ev), locale: "es", reducedMotion: true, ...extra });
    return { events, h };
  };

  it("muestra el paso con título, cuerpo, n de total y foco; avanza, retrocede y termina", async () => {
    page();
    const { events, h } = mount(entry(three()));
    await tick();
    const pop = h.element.querySelector<HTMLElement>(".cs-tour__pop")!;
    expect(pop.getAttribute("role")).toBe("dialog");
    expect(pop.getAttribute("aria-modal")).toBe("false");
    expect(pop.querySelector(".cs-tour__step")!.textContent).toBe("Paso 1 de 3");
    expect(pop.querySelector(".cs-tour__title")!.textContent).toBe("Paso a");
    expect(document.activeElement).toBe(pop.querySelector(".cs-tour__title"));
    expect(h.element.querySelector('[role="status"]')!.textContent).toBe("Paso 1 de 3: Paso a");
    pop.querySelector<HTMLElement>(".cs-tour__next")!.click();
    expect(h.element.querySelector(".cs-tour__title")!.textContent).toBe("Paso b");
    h.element.querySelector<HTMLElement>(".cs-tour__back")!.click();
    expect(h.element.querySelector(".cs-tour__title")!.textContent).toBe("Paso a");
    for (let i = 0; i < 3; i++) h.element.querySelector<HTMLElement>(".cs-tour__next")!.click();
    expect(events.at(-1)).toMatchObject({ type: "complete" });
    expect(h.element.isConnected).toBe(false);
  });

  it("Escape y «Omitir» saltan en cualquier paso", async () => {
    page();
    const a = mount(entry(three()));
    await tick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(a.events.map((e) => e.type)).toContain("dismiss");
    expect(a.h.element.isConnected).toBe(false);
    const b = mount(entry(three()));
    await tick();
    b.h.element.querySelector<HTMLElement>(".cs-tour__skip")!.click();
    expect(b.events.find((e) => e.type === "tour_step" && e.step === "skip")).toBeTruthy();
  });

  it("next_on anchor_click: tocar el ancla avanza; sin ancla el paso sale centrado", async () => {
    page();
    const { h } = mount(entry([step("a", { next_on: "anchor_click" }), step("b"), step("zzz")]));
    await tick();
    document.querySelector<HTMLElement>('[data-customy-anchor="nav.a"]')!.click();
    expect(h.element.querySelector(".cs-tour__title")!.textContent).toBe("Paso b");
    h.element.querySelector<HTMLElement>(".cs-tour__next")!.click();
    expect(h.element.querySelector(".cs-tour__pop")!.getAttribute("data-side")).toBe("center");
  });

  it("spotlight pinta el anillo; hotspot esconde el globo hasta pulsar el punto", async () => {
    page();
    const s = mount(entry(three(), { presentation: "spotlight" }));
    await tick();
    expect(s.h.element.querySelector<HTMLElement>(".cs-tour__ring")!.getAttribute("data-kind")).toBe("spotlight");
    expect(s.h.element.querySelector<HTMLElement>(".cs-tour__ring")!.hidden).toBe(false);
    s.h.destroy();
    const hs = mount(entry([step("a", { presentation: "hotspot" }), step("b"), step("c")]));
    await tick();
    const pop = hs.h.element.querySelector<HTMLElement>(".cs-tour__pop")!;
    const dot = hs.h.element.querySelector<HTMLButtonElement>(".cs-tour__dot")!;
    expect(pop.hidden).toBe(true);
    expect(dot.getAttribute("aria-label")).toBe("Mostrar el paso: Paso a");
    dot.click();
    expect(pop.hidden).toBe(false);
  });

  it("un ancla tardía se encuentra al llegar", async () => {
    document.body.innerHTML = "<main></main>";
    const { h } = mount(entry(three()));
    await tick();
    expect(h.element.querySelector(".cs-tour__pop")!.getAttribute("data-side")).toBe("center");
    const a = document.createElement("a");
    a.setAttribute("data-customy-anchor", "nav.a");
    document.querySelector("main")!.append(a);
    await tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(h.element.querySelector(".cs-tour__pop")!.getAttribute("data-side")).not.toBe("center");
    h.destroy();
  });
});
