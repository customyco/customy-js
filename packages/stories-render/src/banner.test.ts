import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBannerController, type BannerEvent } from "./banner";
import { banner } from "./test-fixtures";
import type { DeliveredBanner } from "./types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(b: DeliveredBanner, extra: Partial<Parameters<typeof createBannerController>[0]> = {}) {
  const events: BannerEvent[] = [];
  const openLink = vi.fn();
  const c = createBannerController({ banner: b, onEvent: (e) => events.push(e), openLink, ...extra });
  return { c, events, openLink };
}

describe("banner", () => {
  it("una impresión por vida y autoavance que da la vuelta", () => {
    const { c, events } = make(banner("b"));
    c.show();
    c.show();
    expect(events.filter((e) => e.type === "impression")).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(c.getState().index).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(c.getState().index).toBe(0);
    expect(events.filter((e) => e.type === "next").every((e) => "via" in e && e.via === "auto")).toBe(true);
  });

  it("el autoavance se pausa y se reanuda (WCAG 2.2.2)", () => {
    const { c } = make(banner("b"));
    c.show();
    c.toggleAutoplay();
    expect(c.getState().autoplaying).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(c.getState().index).toBe(0);
    c.toggleAutoplay();
    vi.advanceTimersByTime(5000);
    expect(c.getState().index).toBe(1);
  });

  it("hover/foco pausan por separado: solo reanuda al quitar ambos", () => {
    const { c } = make(banner("b"));
    c.show();
    c.pause("hover");
    c.pause("focus");
    c.resume("hover");
    vi.advanceTimersByTime(20_000);
    expect(c.getState().index).toBe(0);
    c.resume("focus");
    vi.advanceTimersByTime(5000);
    expect(c.getState().index).toBe(1);
  });

  it("reduced-motion: el autoavance empieza pausado", () => {
    const { c } = make(banner("b"), { reducedMotion: true });
    c.show();
    vi.advanceTimersByTime(60_000);
    expect(c.getState()).toMatchObject({ index: 0, autoplaying: false });
    c.toggleAutoplay();
    expect(c.getState().autoplaying).toBe(true);
  });

  it("no se cierra solo por defecto; con auto_close_ms sí, con motivo auto", () => {
    const a = make(banner("b"));
    a.c.show();
    vi.advanceTimersByTime(24 * 3600_000);
    expect(a.c.getState().dismissed).toBe(false);
    const b = make(banner("b", ["s1"], { style: { ...banner("b").style, auto_close_ms: 15000, autoplay: { enabled: false, interval_ms: 5000, pausable: true }, carousel: false } }));
    b.c.show();
    vi.advanceTimersByTime(15_000);
    expect(b.c.getState()).toMatchObject({ dismissed: true, dismissReason: "auto" });
    expect(b.events.at(-1)).toMatchObject({ type: "dismiss", reason: "auto" });
  });

  it("descartable por la persona; si no lo es, no se puede", () => {
    const a = make(banner("b"));
    a.c.show();
    a.c.dismiss("user");
    expect(a.c.getState().dismissed).toBe(true);
    const n = make(banner("n", ["s1"], { style: { ...banner("n").style, dismissible: false, carousel: false } }));
    n.c.show();
    n.c.dismiss("user");
    expect(n.c.getState().dismissed).toBe(false);
  });

  it("logClick con nombre válido; rechaza nombres que el contrato no admitiría", () => {
    const { c, events } = make(banner("b"));
    c.show();
    expect(c.logClick("cta.verano:hero")).toBe(true);
    expect(c.logClick("con espacios")).toBe(false);
    expect(c.logClick("x".repeat(256))).toBe(false);
    expect(events.filter((e) => e.type === "click")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "click", elementId: "cta.verano:hero" });
  });

  it("clic en la imagen: element_id propio o derivado, y abre la acción", () => {
    const b = banner("b");
    b.slides![0]!.element_id = "hero.1";
    const { c, events, openLink } = make(b);
    c.show();
    c.activate();
    expect(events.at(-1)).toMatchObject({ type: "click", elementId: "hero.1", slideId: "s1" });
    expect(openLink).toHaveBeenCalledWith({ type: "url", url: "https://example.com/x" }, expect.objectContaining({ slideId: "s1" }));
    c.next();
    c.activate();
    expect(events.at(-1)).toMatchObject({ elementId: "banner.b.s2" });
  });

  it("sin carrusel no da la vuelta; anuncia la imagen", () => {
    const one = banner("b", ["s1", "s2"], { style: { ...banner("b").style, carousel: false, autoplay: { enabled: false, interval_ms: 5000, pausable: true } } });
    const { c } = make(one, { locale: "es" });
    c.show();
    c.next();
    expect(c.getState().announcement).toBe("Imagen 2 de 2");
    c.next();
    expect(c.getState().index).toBe(1);
  });
});
