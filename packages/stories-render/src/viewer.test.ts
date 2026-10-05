import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "./store";
import { createSeenTracker } from "./seen";
import { createPreloader } from "./preload";
import { createStoryViewer, viewableGroups, type ViewerEvent } from "./viewer";
import { group, page } from "./test-fixtures";
import type { ButtonComponent, PollComponent, StoryGroup } from "./types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const types = (evs: ViewerEvent[]) => evs.map((e) => `${e.type}${"pageId" in e && e.pageId ? `:${e.pageId}` : ""}`);

function make(groups: StoryGroup[], extra: Parameters<typeof createStoryViewer>[0] extends infer O ? Partial<O> : never = {}) {
  const events: ViewerEvent[] = [];
  const onClose = vi.fn();
  const v = createStoryViewer({ groups: viewableGroups(groups), onEvent: (e) => events.push(e), onClose, ...extra });
  return { v, events, onClose };
}

describe("visor: recorrido", () => {
  it("avanza solo por el temporizador, cruza grupos y cierra al terminar", () => {
    const { v, events, onClose } = make([group("g1", ["a", "b"]), group("g2", ["c"])]);
    v.open();
    expect(v.getState()).toMatchObject({ open: true, groupIndex: 0, pageIndex: 0 });
    vi.advanceTimersByTime(7000);
    expect(v.getState()).toMatchObject({ groupIndex: 0, pageIndex: 1 });
    vi.advanceTimersByTime(7000);
    expect(v.getState()).toMatchObject({ groupIndex: 1, pageIndex: 0 });
    vi.advanceTimersByTime(7000);
    expect(v.getState().open).toBe(false);
    expect(onClose).toHaveBeenCalledWith("completed");
    expect(types(events)).toEqual([
      "view:a", "exit_page:a", "next:a", "view:b", "exit_page:b", "next:b", "complete:b", "watch_length:b", "view:c", "exit_page:c", "next:c", "complete:c", "watch_length:c", "close:c",
    ]);
  });

  it("tap adelante/atrás, y atrás en la 1.ª página del grupo va al grupo anterior", () => {
    const { v, events } = make([group("g1", ["a", "b"]), group("g2", ["c"])]);
    v.open();
    v.next("tap");
    expect(v.getState().page?.id).toBe("b");
    v.next("tap");
    expect(v.getState().group?.id).toBe("g2");
    v.prev("tap");
    expect(v.getState()).toMatchObject({ groupIndex: 0, pageIndex: 0 });
    expect(events.filter((e) => e.type === "prev")).toHaveLength(1);
    v.prev("tap"); // ya en el primer grupo y página: reinicia
    expect(v.getState()).toMatchObject({ groupIndex: 0, pageIndex: 0 });
  });

  it("swipe entre grupos y el borde no hace nada", () => {
    const { v } = make([group("g1"), group("g2")]);
    v.open();
    v.prevGroup();
    expect(v.getState().groupIndex).toBe(0);
    v.nextGroup();
    expect(v.getState().groupIndex).toBe(1);
    v.nextGroup();
    expect(v.getState()).toMatchObject({ groupIndex: 1, open: true });
  });

  it("mantener pulsado pausa y oculta la interfaz; soltar reanuda", () => {
    const { v } = make([group("g1", ["a", "b"])]);
    v.open();
    vi.advanceTimersByTime(3000);
    v.hold(true);
    expect(v.getState()).toMatchObject({ uiHidden: true });
    expect(v.getState().snapshot.state).toBe("paused");
    vi.advanceTimersByTime(30_000);
    expect(v.getState().pageIndex).toBe(0);
    v.hold(false);
    expect(v.getState().uiHidden).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(v.getState().pageIndex).toBe(1);
  });

  it("la pausa del usuario sobrevive al cambio de página", () => {
    const { v } = make([group("g1", ["a", "b", "c"])]);
    v.open();
    v.togglePause();
    v.next("tap");
    expect(v.getState().snapshot.state).toBe("paused");
    v.togglePause();
    expect(v.getState().snapshot.state).toBe("playing");
  });

  it("prefers-reduced-motion: empieza en pausa y el botón la levanta", () => {
    const { v } = make([group("g1", ["a", "b"])], { reducedMotion: true });
    v.open();
    expect(v.getState().snapshot.state).toBe("paused");
    expect(v.getState().userPaused).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(v.getState().pageIndex).toBe(0);
    v.togglePause();
    vi.advanceTimersByTime(7000);
    expect(v.getState().pageIndex).toBe(1);
  });

  it("cerrar emite exit_page, watch_length y close con el tiempo realmente visto", () => {
    const { v, events, onClose } = make([group("g1", ["a", "b"])]);
    v.open();
    vi.advanceTimersByTime(2000);
    v.pause("hidden");
    vi.advanceTimersByTime(10_000);
    v.close("user");
    const exit = events.find((e) => e.type === "exit_page");
    expect(exit).toMatchObject({ ms: 2000, pageId: "a" });
    expect(events.find((e) => e.type === "watch_length")).toMatchObject({ ms: 2000 });
    expect(events.find((e) => e.type === "close")).toMatchObject({ reason: "user" });
    expect(onClose).toHaveBeenCalledWith("user");
    expect(v.getState().open).toBe(false);
  });

  it("el anuncio aria-live cambia con cada página", () => {
    const { v } = make([group("g1", ["a", "b"])], { locale: "es" });
    v.open();
    const first = v.getState().announcement;
    expect(first).toContain("Página 1 de 2");
    v.next();
    expect(v.getState().announcement).toContain("Página 2 de 2");
  });
});

describe("visor: estado visto y orden de arranque", () => {
  it("marca páginas vistas y arranca en la primera sin ver", async () => {
    const seen = createSeenTracker(createMemoryStore());
    await seen.ready;
    const g = group("g1", ["a", "b", "c"]);
    const first = make([g], { seen });
    first.v.open();
    first.v.next();
    first.v.close();
    expect(seen.status(g)).toBe("partial");
    const second = make([g], { seen });
    second.v.open();
    expect(second.v.getState().page?.id).toBe("c");
  });

  it("el grupo de control (sin páginas) no se puede abrir", () => {
    const control = group("ctl", [], { control: true, pages: undefined });
    expect(viewableGroups([control, group("g")]).map((g) => g.id)).toEqual(["g"]);
  });
});

describe("visor: precarga y degradación", () => {
  it("espera a la precarga antes de reproducir y pide la siguiente página y el siguiente grupo", async () => {
    const load = vi.fn(async () => undefined);
    const preloader = createPreloader({ load });
    const { v } = make([group("g1", ["a", "b"]), group("g2", ["c"])], { preloader });
    v.open();
    expect(v.getState().snapshot.state).toBe("loading");
    await vi.advanceTimersByTimeAsync(0);
    expect(v.getState().snapshot.state).toBe("playing");
    expect(preloader.has("g1/b") && preloader.has("g2/c")).toBe(true);
  });

  it("si falla un vídeo la página sigue con el póster", async () => {
    const preloader = createPreloader({ load: async (a) => (a.kind === "video" ? Promise.reject(new Error("x")) : undefined), retries: 0 });
    const vp = page("a", { background: { type: "video", url: "https://c/v.mp4", poster: "https://c/p.jpg", fit: "fill", muted: true, has_speech: false, captions: [], decorative: true } });
    const { v } = make([group("g1", ["a"], { pages: [vp] })], { preloader });
    v.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(v.getState().snapshot).toMatchObject({ state: "playing", degraded: true, mode: "timer" });
    vi.advanceTimersByTime(15_000);
    expect(v.getState().open).toBe(false);
  });

  it("al avanzar se cancela lo que ya no se necesita", async () => {
    const preloader = createPreloader({ load: () => new Promise<void>(() => undefined) });
    const { v } = make([group("g1", ["a", "b", "c"])], { preloader });
    v.open();
    expect(preloader.has("g1/a") && preloader.has("g1/b")).toBe(true);
    v.next();
    expect(preloader.has("g1/a")).toBe(false);
    expect(preloader.has("g1/c")).toBe(true);
  });
});

describe("visor: componentes", () => {
  const btn = (over: Partial<ButtonComponent> = {}): ButtonComponent => ({ type: "button", id: "b1", x: 0.1, y: 0.8, w: 0.8, h: 0.08, z: 1, collects: ["click"], consent_purpose: "analytics", style: "button", label: "Comprar", action: { type: "url", url: "https://example.com/p" }, element_id: "cta.comprar", ...over });
  const poll: PollComponent = { type: "poll", id: "pl", x: 0.1, y: 0.5, w: 0.8, h: 0.2, z: 1, collects: ["poll_choice"], consent_purpose: "analytics", question: "¿Cuál?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], anonymous: true, show_results: "after_vote" };

  function withComponents() {
    const p = page("a");
    p.canvas.components = [btn({ id: "up", style: "swipe_up", element_id: "cta.up" }), btn(), poll];
    const openLink = vi.fn();
    return { ...make([group("g1", ["a"], { pages: [p] })], { openLink }), openLink };
  }

  it("botón: registra el clic con su nombre y abre el enlace", () => {
    const { v, events, openLink } = withComponents();
    v.open();
    v.activateButton("b1");
    expect(events.at(-1)).toMatchObject({ type: "click", elementId: "cta.comprar", componentId: "b1" });
    expect(openLink).toHaveBeenCalledWith({ type: "url", url: "https://example.com/p" }, expect.objectContaining({ elementId: "cta.comprar" }));
  });
  it("swipe arriba abre el CTA swipe_up", () => {
    const { v, openLink } = withComponents();
    v.open();
    expect(v.swipeUp()).toBe(true);
    expect(openLink).toHaveBeenCalledTimes(1);
  });
  it("sin botón, swipe arriba no hace nada", () => {
    const { v } = make([group("g1")]);
    v.open();
    expect(v.swipeUp()).toBe(false);
  });
  it("encuesta: un solo voto, con el propósito de consentimiento, y rechaza opciones inventadas", () => {
    const { v, events } = withComponents();
    v.open();
    expect(v.answerPoll("pl", "zzz")).toBeUndefined();
    expect(v.answerPoll("pl", "b")).toBeDefined();
    expect(v.answerPoll("pl", "a")).toBeUndefined();
    const r = events.filter((e) => e.type === "component_response");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ componentId: "pl", choiceId: "b", consentPurpose: "analytics" });
    expect(v.getState().responses).toEqual({ pl: "b" });
  });
  it("recordatorio de cuenta atrás solo con opt-in explícito y si el componente lo habilita", () => {
    const p = page("a");
    p.canvas.components = [
      { type: "countdown", id: "cd", x: 0, y: 0.3, w: 1, h: 0.1, z: 1, collects: ["reminder_optin"], consent_purpose: "reminders", ends_at: "2030-01-01T00:00:00Z", reminder: { enabled: true, offset_minutes: 10 } },
      { type: "countdown", id: "cd2", x: 0, y: 0.5, w: 1, h: 0.1, z: 1, collects: [], consent_purpose: "none", ends_at: "2030-01-01T00:00:00Z", reminder: { enabled: false, offset_minutes: 0 } },
    ];
    const { v, events } = make([group("g1", ["a"], { pages: [p] })]);
    v.open();
    expect(events.some((e) => e.type === "component_response")).toBe(false);
    expect(v.optInReminder("cd2")).toBeUndefined();
    expect(v.optInReminder("cd")).toBeDefined();
    expect(events.at(-1)).toMatchObject({ type: "component_response", componentId: "cd", value: true, consentPurpose: "reminders" });
  });
  it("copiar código registra el clic con nombre", () => {
    const p = page("a");
    p.canvas.components = [{ type: "promo_code", id: "pc", x: 0, y: 0.5, w: 1, h: 0.1, z: 1, collects: ["promo_copy"], consent_purpose: "analytics", code: "VERANO", copy_label: "Copiar", element_id: "promo.verano" }];
    const { v, events } = make([group("g1", ["a"], { pages: [p] })]);
    v.open();
    expect(v.copyPromo("pc")?.code).toBe("VERANO");
    expect(events.at(-1)).toMatchObject({ type: "click", elementId: "promo.verano" });
  });
});
