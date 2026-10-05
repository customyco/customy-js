// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../store";
import { createSeenTracker } from "../seen";
import { banner, group, page, textLayer } from "../test-fixtures";
import type { StoryGroup } from "../types";
import type { ViewerEvent } from "../viewer";
import { mountBanner } from "./banner";
import { defaultOpenLink, isSafeDeepLink } from "./util";
import { mountStoryBar } from "./story-bar";
import { openStoryViewer } from "./viewer";

beforeEach(() => {
  // jsdom no implementa la reproducción de medios.
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
  vi.useFakeTimers();
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.useRealTimers();
});

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const ptr = (el: Element, type: string, x: number, y = 100) => el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

describe("Story Bar", () => {
  const groups: StoryGroup[] = [
    group("a", ["p1"], { order: 2, title: "Alfa" }),
    group("b", ["p1", "p2"], { order: 1, title: "Beta", pinned: true, live: true }),
    group("c", ["p1"], { order: 0, title: "Gamma" }),
    group("ctl", [], { control: true, pages: undefined, title: "Control" }),
  ];
  const mount = (opts: Partial<Parameters<typeof mountStoryBar>[1]> = {}) => {
    const host = document.createElement("div");
    document.body.append(host);
    return { host, bar: mountStoryBar(host, { groups, locale: "es", ...opts }) };
  };

  it("pinned primero, sin el grupo de control, con etiqueta accesible completa", () => {
    const { host, bar } = mount();
    const labels = [...host.querySelectorAll("button.cs-item")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Abrir historia: Beta, nueva, fijada, en vivo, 1 de 3",
      "Abrir historia: Gamma, nueva, 2 de 3",
      "Abrir historia: Alfa, nueva, 3 de 3",
    ]);
    expect(bar.ordered().map((g) => g.id)).toEqual(["b", "c", "a"]);
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe("Historias");
    expect(host.querySelectorAll("li")).toHaveLength(3);
  });

  it("estilo: variante, forma, tamaño, anillo, badge y LTR/RTL", () => {
    const { host } = mount({ style: { variant: "energized", cover_shape: "portrait", size: "large", live_badge: { enabled: true, label: "EN VIVO" }, ring: { enabled: true, unseen_color: "#ff0000" } }, locale: "ar" });
    const nav = q("nav", host);
    expect(nav.className).toContain("cs-bar--energized");
    expect(nav.dataset).toMatchObject({ shape: "portrait", size: "large", ring: "on" });
    expect(nav.getAttribute("dir")).toBe("rtl");
    expect(nav.style.getPropertyValue("--cs-ring-unseen-c")).toBe("#ff0000");
    expect(q(".cs-live", host).textContent).toBe("EN VIVO");
  });

  it("claro/oscuro por token en el contenedor", () => {
    const { host } = mount({ theme: "dark" });
    expect(q("nav", host).getAttribute("data-cs-theme")).toBe("dark");
  });

  it("estado visto: anillo y etiqueta cambian; no vistos primero reordena", async () => {
    const seen = createSeenTracker(createMemoryStore());
    await seen.ready;
    seen.markPageSeen("c", "p1");
    const { host } = mount({ seen, style: { order: "unseen_first", pinned_first: false } });
    const ids = [...host.querySelectorAll<HTMLElement>("button.cs-item")].map((b) => `${b.dataset.groupId}:${b.dataset.status}`);
    expect(ids).toEqual(["b:unseen", "a:unseen", "c:seen"]);
    expect(host.querySelector('[data-group-id="c"]')?.getAttribute("aria-label")).toContain("vista");
  });

  it("max_groups recorta", () => {
    const { host } = mount({ style: { max_groups: 2 } });
    expect(host.querySelectorAll("button.cs-item")).toHaveLength(2);
  });

  it("un clic abre el visor en ese grupo y al cerrar devuelve el foco a su botón", () => {
    const { host } = mount({ viewer: { preloader: false } });
    const btn = q<HTMLButtonElement>('[data-group-id="c"]', host);
    btn.focus();
    btn.click();
    const dlg = q<HTMLDialogElement>("dialog");
    expect(dlg).toBeTruthy();
    expect(dlg.getAttribute("aria-label")).toBe("Historia de Gamma");
    key(dlg, "Escape");
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement?.getAttribute("data-group-id")).toBe("c");
  });

  it("canOpen=false (otro overlay manda) no abre", () => {
    const { host } = mount({ canOpen: () => false, viewer: { preloader: false } });
    q('[data-group-id="c"]', host).click();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("update cambia grupos en sitio", () => {
    const { host, bar } = mount();
    bar.update({ groups: [group("z", ["p"], { title: "Zeta" })] });
    expect(host.querySelectorAll("button.cs-item")).toHaveLength(1);
    bar.destroy();
    expect(host.querySelector("nav")).toBeNull();
  });
});

describe("Visor web", () => {
  const open = (groups: StoryGroup[], opts: Partial<Parameters<typeof openStoryViewer>[0]> = {}) => {
    const events: ViewerEvent[] = [];
    const h = openStoryViewer({ groups, preloader: false, locale: "es", reducedMotion: false, onEvent: (e) => events.push(e), ...opts });
    return { h, events, dlg: h.element };
  };
  const pageWith = (id: string, layers: unknown[] = [], components: unknown[] = []) => page(id, { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: layers as never, components: components as never } });

  it("es un <dialog> con barra de progreso, anuncio aria-live y botón de pausa visible", () => {
    const { dlg } = open([group("g1", ["a", "b"], { title: "Novedades" })]);
    expect(dlg.tagName).toBe("DIALOG");
    expect(dlg.hasAttribute("open")).toBe(true);
    const bar = q('[role="progressbar"]', dlg);
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("2");
    expect(bar.getAttribute("aria-valuetext")).toBe("Página 1 de 2");
    expect(q('[aria-live="polite"][role="status"]', dlg).textContent).toContain("Página 1 de 2");
    const pause = q<HTMLButtonElement>('button[aria-label="Pausar"]', dlg);
    expect(pause.hidden).toBe(false);
  });

  it("teclado: → siguiente, ← anterior, Espacio pausa, Esc cierra; el anuncio cambia", () => {
    const { dlg, events, h } = open([group("g1", ["a", "b", "c"])]);
    key(dlg, "ArrowRight");
    expect(h.controller.getState().pageIndex).toBe(1);
    expect(q('[role="status"]', dlg).textContent).toContain("Página 2 de 3");
    key(dlg, "ArrowLeft");
    expect(h.controller.getState().pageIndex).toBe(0);
    key(dlg, " ");
    expect(h.controller.getState().userPaused).toBe(true);
    expect(q('button[aria-label="Reanudar"]', dlg)).toBeTruthy();
    expect(q('button[aria-label="Reanudar"]', dlg).getAttribute("aria-pressed")).toBe("true");
    key(dlg, "Escape");
    expect(document.querySelector("dialog")).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "close", reason: "keyboard" });
  });

  it("RTL espeja las flechas", () => {
    const { dlg, h } = open([group("g1", ["a", "b"])], { rtl: true });
    expect(dlg.getAttribute("dir")).toBe("rtl");
    key(dlg, "ArrowLeft");
    expect(h.controller.getState().pageIndex).toBe(1);
    key(dlg, "ArrowRight");
    expect(h.controller.getState().pageIndex).toBe(0);
  });

  it("prefers-reduced-motion: arranca en pausa, sin animaciones, y el botón es «Reanudar»", () => {
    const layer = textLayer("t", { animations: [{ phase: "in", kind: "bounce", delay_ms: 0, duration_ms: 400, easing: "ease_out" }] });
    const { dlg, h } = open([group("g1", ["a", "b"], { pages: [pageWith("a", [layer]), pageWith("b")] })], { reducedMotion: true });
    expect(h.controller.getState().snapshot.state).toBe("paused");
    expect(q('button[aria-label="Reanudar"]', dlg)).toBeTruthy();
    expect(q<HTMLElement>(".cs-layer__in", dlg).style.animation).toBe("");
    vi.advanceTimersByTime(60_000);
    expect(h.controller.getState().pageIndex).toBe(0);
  });

  it("sin reduced-motion aplica la animación declarativa", () => {
    const layer = textLayer("t", { animations: [{ phase: "in", kind: "fade", delay_ms: 100, duration_ms: 400, easing: "ease_out" }] });
    const { dlg } = open([group("g1", ["a"], { pages: [pageWith("a", [layer])] })]);
    expect(q<HTMLElement>(".cs-layer__in", dlg).style.animation).toContain("cs-anim-fade 400ms");
  });

  it("capas: alt por capa, decorativas ocultas, z y coordenadas relativas", () => {
    const layers = [
      { type: "image", id: "i1", x: 0.1, y: 0.2, w: 0.5, h: 0.25, rotation: 0, opacity: 1, z: 5, animations: [], decorative: false, alt: "Zapatilla roja", url: "https://c/i.jpg", fit: "fill" },
      { type: "sticker", id: "s1", x: 0, y: 0, w: 0.2, h: 0.1, rotation: 0, opacity: 1, z: 1, animations: [], decorative: true, url: "https://c/s.png" },
      textLayer("t1", { z: 9, text: "Oferta" }),
    ];
    const { dlg } = open([group("g1", ["a"], { pages: [pageWith("a", layers)] })]);
    const img = q<HTMLImageElement>('[data-layer="i1"] img', dlg);
    expect(img.alt).toBe("Zapatilla roja");
    const sticker = q<HTMLImageElement>('[data-layer="s1"] img', dlg);
    expect(sticker.alt).toBe("");
    expect(sticker.getAttribute("aria-hidden")).toBe("true");
    expect(q('[data-layer="t1"]', dlg).textContent).toBe("Oferta");
    const order = [...dlg.querySelectorAll<HTMLElement>(".cs-layer")].map((n) => n.dataset.layer);
    expect(order).toEqual(["s1", "i1", "t1"]);
    // 0.1 de un visor 768*9/16 = 432 de ancho
    expect(q<HTMLElement>('[data-layer="i1"]', dlg).style.left).toBe("43.2px");
  });

  it("el fondo de imagen lleva su alt y vídeo con póster, subtítulos y botón de silencio", () => {
    const vid = pageWith("v");
    vid.background = { type: "video", url: "https://c/v.mp4", poster: "https://c/p.jpg", fit: "fill", muted: true, has_speech: true, captions: [{ lang: "es", url: "https://c/s.vtt", label: "Español" }], alt: "Presentación", decorative: false };
    const { dlg } = open([group("g1", ["v"], { pages: [vid] })]);
    const v = q<HTMLVideoElement>("video", dlg);
    expect(v.getAttribute("poster")).toBe("https://c/p.jpg");
    expect(v.getAttribute("aria-label")).toBe("Presentación");
    expect(v.querySelector("track")?.getAttribute("kind")).toBe("captions");
    expect(q<HTMLButtonElement>('button[aria-label="Activar sonido"]', dlg).hidden).toBe(false);
    expect(q<HTMLButtonElement>('button[aria-label="Ocultar subtítulos"]', dlg).hidden).toBe(false);
    expect(v.muted).toBe(true);
  });

  it("el fondo de vídeo gobierna el reloj: ended avanza", () => {
    const vid = pageWith("v");
    vid.background = { type: "video", url: "https://c/v.mp4", poster: "https://c/p.jpg", fit: "fill", muted: true, has_speech: false, captions: [], decorative: true };
    const { dlg, h } = open([group("g1", ["v", "w"], { pages: [vid, pageWith("w")] })]);
    vi.advanceTimersByTime(30_000);
    expect(h.controller.getState().pageIndex).toBe(0);
    q("video", dlg).dispatchEvent(new Event("ended"));
    expect(h.controller.getState().pageIndex).toBe(1);
  });

  it("gestos por puntero: tercio derecho avanza, izquierdo retrocede, mantener pausa y oculta la UI", () => {
    const { dlg, h } = open([group("g1", ["a", "b", "c"])]);
    const stage = q(".cs-stage", dlg);
    const w = 432;
    ptr(stage, "pointerdown", w - 10);
    ptr(stage, "pointerup", w - 10);
    expect(h.controller.getState().pageIndex).toBe(1);
    ptr(stage, "pointerdown", 10);
    ptr(stage, "pointerup", 10);
    expect(h.controller.getState().pageIndex).toBe(0);
    ptr(stage, "pointerdown", 200);
    vi.advanceTimersByTime(200);
    expect(stage.hasAttribute("data-ui-hidden")).toBe(true);
    expect(h.controller.getState().snapshot.state).toBe("paused");
    ptr(stage, "pointerup", 200);
    expect(stage.hasAttribute("data-ui-hidden")).toBe(false);
    expect(h.controller.getState().snapshot.state).toBe("playing");
  });

  it("swipe abajo cierra; swipe horizontal cambia de grupo", () => {
    const { dlg, h } = open([group("g1"), group("g2")]);
    const stage = q(".cs-stage", dlg);
    ptr(stage, "pointerdown", 300, 200);
    ptr(stage, "pointermove", 100, 205);
    ptr(stage, "pointerup", 100, 205);
    expect(h.controller.getState().groupIndex).toBe(1);
    ptr(stage, "pointerdown", 200, 100);
    ptr(stage, "pointermove", 200, 300);
    ptr(stage, "pointerup", 200, 300);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("los controles no disparan gestos", () => {
    const { dlg, h } = open([group("g1", ["a", "b"])]);
    const pause = q<HTMLButtonElement>('button[aria-label="Pausar"]', dlg);
    ptr(pause, "pointerdown", 10);
    ptr(pause, "pointerup", 10);
    expect(h.controller.getState().pageIndex).toBe(0);
  });

  it("botón + CTA: clic con nombre y enlace; swipe_up abre el mismo", () => {
    const comps = [
      { type: "button", id: "cta", x: 0.1, y: 0.8, w: 0.8, h: 0.06, z: 1, collects: ["click"], consent_purpose: "analytics", style: "button", label: "Comprar ahora", action: { type: "url", url: "https://example.com/p" }, element_id: "cta.comprar" },
    ];
    const openLink = vi.fn();
    const { dlg, events } = open([group("g1", ["a"], { pages: [pageWith("a", [], comps)] })], { openLink });
    q<HTMLButtonElement>('[data-component="cta"] button', dlg).click();
    expect(events.find((e) => e.type === "click")).toMatchObject({ elementId: "cta.comprar" });
    expect(openLink).toHaveBeenCalledWith({ type: "url", url: "https://example.com/p" }, expect.anything());
  });

  it("encuesta accesible: grupo etiquetado, voto único, aria-pressed y agradecimiento", () => {
    const poll = { type: "poll", id: "pl", x: 0.1, y: 0.5, w: 0.8, h: 0.2, z: 1, collects: ["poll_choice"], consent_purpose: "analytics", question: "¿Cuál prefieres?", options: [{ id: "a", label: "Rojo" }, { id: "b", label: "Azul" }], anonymous: true, show_results: "after_vote" };
    const { dlg, events } = open([group("g1", ["a"], { pages: [pageWith("a", [], [poll])] })]);
    const grp = q('[role="group"][aria-labelledby]', dlg);
    expect(q(`#${grp.getAttribute("aria-labelledby")}`, dlg).textContent).toBe("¿Cuál prefieres?");
    const [red, blue] = [...grp.querySelectorAll<HTMLButtonElement>("button")];
    blue!.click();
    expect(blue!.getAttribute("aria-pressed")).toBe("true");
    expect(red!.disabled && blue!.disabled).toBe(true);
    expect(grp.querySelector('[role="status"]')?.textContent).toBe("Gracias por votar");
    expect(events.filter((e) => e.type === "component_response")).toHaveLength(1);
  });

  it("cuenta atrás con recordatorio opt-in: solo registra al pulsarlo", () => {
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const cd = { type: "countdown", id: "cd", x: 0.1, y: 0.4, w: 0.8, h: 0.1, z: 1, collects: ["reminder_optin"], consent_purpose: "reminders", label: "Termina en", ends_at: "2026-10-02T01:00:00Z", reminder: { enabled: true, offset_minutes: 30 } };
    const onReminder = vi.fn();
    const { dlg, events } = open([group("g1", ["a"], { pages: [pageWith("a", [], [cd])] })], { onReminder });
    expect(q('[role="timer"]', dlg).textContent).toBe("1d 01:00:00");
    vi.advanceTimersByTime(1000);
    expect(q('[role="timer"]', dlg).textContent).toBe("1d 00:59:59");
    expect(events.some((e) => e.type === "component_response")).toBe(false);
    const chip = q<HTMLButtonElement>('button[aria-pressed="false"]', q('[data-component="cd"]', dlg));
    chip.click();
    expect(onReminder).toHaveBeenCalledWith(expect.objectContaining({ id: "cd" }), "2026-10-02T00:30:00.000Z");
    expect(events.at(-1)).toMatchObject({ type: "component_response", consentPurpose: "reminders" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("código promocional: copia y registra el clic con nombre", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const promo = { type: "promo_code", id: "pc", x: 0.1, y: 0.6, w: 0.8, h: 0.08, z: 1, collects: ["promo_copy"], consent_purpose: "analytics", code: "VERANO25", copy_label: "Copiar", element_id: "promo.verano" };
    const { dlg, events } = open([group("g1", ["a"], { pages: [pageWith("a", [], [promo])] })]);
    q<HTMLButtonElement>('[data-component="pc"] .cs-chip', dlg).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith("VERANO25");
    expect(events.at(-1)).toMatchObject({ type: "click", elementId: "promo.verano" });
    expect(q('[data-component="pc"] .cs-chip', dlg).textContent).toBe("Copiado");
  });

  it("componentes reservados y vencidos no se pintan ni rompen", () => {
    const rest = [
      { type: "quiz", id: "q", x: 0, y: 0.5, w: 1, h: 0.2, z: 1, collects: [], consent_purpose: "none", config: {} },
      { type: "promo_code", id: "old", x: 0, y: 0.6, w: 1, h: 0.1, z: 1, collects: ["promo_copy"], consent_purpose: "analytics", code: "X", copy_label: "Copiar", element_id: "p.x", valid_until: "2020-01-01T00:00:00Z" },
    ];
    const { dlg } = open([group("g1", ["a"], { pages: [pageWith("a", [], rest)] })]);
    expect(dlg.querySelectorAll(".cs-comp")).toHaveLength(0);
  });

  it("los componentes se mantienen dentro de la zona segura", () => {
    const btn = { type: "button", id: "low", x: 0, y: 0.99, w: 1, h: 0.05, z: 1, collects: ["click"], consent_purpose: "analytics", style: "button", label: "Abajo", action: { type: "url", url: "https://e.com" }, element_id: "cta.low" };
    const { dlg } = open([group("g1", ["a"], { pages: [pageWith("a", [], [btn])] })]);
    const top = parseFloat(q<HTMLElement>('[data-component="low"]', dlg).style.top);
    const vpH = 768; // alto de jsdom
    expect(top + 0.05 * vpH).toBeLessThanOrEqual(vpH - 340 * (vpH / 1920) + 0.01);
  });

  it("al cerrar se limpia el DOM y los temporizadores y devuelve el foco a quien abrió", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { h } = open([group("g1", ["a"])]);
    h.close();
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    // Ningún temporizador ni bucle de fotogramas sigue vivo: dejar correr el tiempo no hace nada.
    const n = document.querySelectorAll("dialog").length;
    vi.advanceTimersByTime(120_000);
    expect(document.querySelectorAll("dialog").length).toBe(n);
    expect(h.controller.getState().open).toBe(false);
  });

  it("compartir aparece solo si hay con qué compartir", () => {
    const a = open([group("g1")]);
    expect(q<HTMLButtonElement>('button[aria-label="Compartir"]', a.dlg).hidden).toBe(true);
    a.h.close();
    const b = open([group("g1")], { shareUrl: () => "https://example.com/s" });
    const nav = navigator as unknown as { share?: unknown };
    nav.share = vi.fn().mockResolvedValue(undefined);
    q<HTMLButtonElement>('button[aria-label="Compartir"]', b.dlg).click();
    expect(b.events.find((e) => e.type === "share")).toMatchObject({ target: "link" });
    delete nav.share;
  });

  it("Lottie se carga bajo demanda solo si hay capa lottie y cargador", async () => {
    const lottieLayer = { type: "lottie", id: "l", x: 0, y: 0, w: 1, h: 0.2, rotation: 0, opacity: 1, z: 1, animations: [], decorative: false, alt: "Confeti", url: "https://c/a.json", loop: true };
    const instance = { play: vi.fn(), pause: vi.fn(), destroy: vi.fn() };
    const factory = vi.fn().mockResolvedValue(instance);
    const loadLottie = vi.fn().mockResolvedValue(factory);
    const none = open([group("g1", ["a"])], { loadLottie });
    expect(loadLottie).not.toHaveBeenCalled();
    none.h.close();
    const { h, dlg } = open([group("g1", ["a"], { pages: [pageWith("a", [lottieLayer])] })], { loadLottie, reducedMotion: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(loadLottie).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(expect.any(HTMLElement), "https://c/a.json", { loop: true, autoplay: false });
    expect(q('[data-layer="l"] [role="img"]', dlg).getAttribute("aria-label")).toBe("Confeti");
    h.close();
    expect(instance.destroy).toHaveBeenCalled();
  });
});

describe("Banner web", () => {
  const mount = (b = banner("bn"), opts: Partial<Parameters<typeof mountBanner>[1]> = {}) => {
    const host = document.createElement("div");
    document.body.append(host);
    const events: unknown[] = [];
    const h = mountBanner(host, { banner: b, locale: "es", immediateImpression: true, reducedMotion: false, onEvent: (e) => events.push(e), ...opts });
    return { host, h, events };
  };

  it("región con carrusel, aspect, imágenes con alt, solo una visible y puntos", () => {
    const { host } = mount();
    const root = q("section", host);
    expect(root.getAttribute("role")).toBe("region");
    expect(root.getAttribute("aria-roledescription")).toBe("carousel");
    expect(root.dataset.aspect).toBe("16:9");
    const slides = [...host.querySelectorAll<HTMLElement>(".cs-banner__slide")];
    expect(slides.map((s) => s.hidden)).toEqual([false, true, true]);
    expect(slides[0]?.querySelector("img")?.alt).toBe("Imagen s1");
    expect(slides[0]?.getAttribute("aria-label")).toBe("Imagen 1 de 3");
    const dots = [...host.querySelectorAll(".cs-dot")];
    expect(dots.map((d) => d.getAttribute("aria-current"))).toEqual(["true", "false", "false"]);
  });

  it("autoplay avanza, el botón lo pausa y la región pasa a polite", () => {
    const { host } = mount();
    expect(q(".cs-banner__track", host).getAttribute("aria-live")).toBe("off");
    vi.advanceTimersByTime(5000);
    expect([...host.querySelectorAll<HTMLElement>(".cs-banner__slide")].map((s) => s.hidden)).toEqual([true, false, true]);
    const play = q<HTMLButtonElement>('button[aria-label="Pausar carrusel"]', host);
    play.click();
    expect(q('button[aria-label="Reanudar carrusel"]', host).getAttribute("aria-pressed")).toBe("true");
    expect(q(".cs-banner__track", host).getAttribute("aria-live")).toBe("polite");
    vi.advanceTimersByTime(60_000);
    expect([...host.querySelectorAll<HTMLElement>(".cs-banner__slide")].map((s) => s.hidden)).toEqual([true, false, true]);
  });

  it("hover pausa el autoavance", () => {
    const { host } = mount();
    q("section", host).dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(20_000);
    expect(q<HTMLElement>(".cs-banner__slide", host).hidden).toBe(false);
    q("section", host).dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(5000);
    expect(q<HTMLElement>(".cs-banner__slide", host).hidden).toBe(true);
  });

  it("reduced-motion: el autoavance arranca pausado", () => {
    const { host } = mount(banner("bn"), { reducedMotion: true });
    vi.advanceTimersByTime(60_000);
    expect(q<HTMLElement>(".cs-banner__slide", host).hidden).toBe(false);
    expect(q('button[aria-label="Reanudar carrusel"]', host)).toBeTruthy();
  });

  it("descartable: emite dismiss, se quita del DOM y avisa", () => {
    const onDismiss = vi.fn();
    const { host, events } = mount(banner("bn"), { onDismiss });
    q<HTMLButtonElement>('button[aria-label="Descartar"]', host).click();
    expect(host.querySelector("section")).toBeNull();
    expect(onDismiss).toHaveBeenCalledWith("user");
    expect(events.at(-1)).toMatchObject({ type: "dismiss", reason: "user" });
  });

  it("no descartable: sin botón de descartar; no se cierra solo", () => {
    const b = banner("bn", ["s1"], { style: { ...banner("x").style, dismissible: false, carousel: false } });
    const { host } = mount(b);
    expect(host.querySelector('button[aria-label="Descartar"]')).toBeNull();
    vi.advanceTimersByTime(3600_000);
    expect(host.querySelector("section")).not.toBeNull();
  });

  it("clic en la imagen: registra el clic con nombre y abre el enlace sin navegar", () => {
    const openLink = vi.fn();
    const { host, events } = mount(banner("bn"), { openLink });
    const a = q<HTMLAnchorElement>("a.cs-banner__slide", host);
    expect(a.getAttribute("href")).toBe("https://example.com/x");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(openLink).toHaveBeenCalledTimes(1);
    expect(events.find((e) => (e as { type: string }).type === "click")).toMatchObject({ elementId: "banner.bn.s1" });
  });

  it("barra de progreso, relación 2:1 y esquinas", () => {
    const b = banner("bn", ["s1", "s2"], { style: { ...banner("x").style, aspect: "2:1", progress: "bar", corner_radius: 20 } });
    const { host } = mount(b);
    expect(q(".cs-dots", host).className).toContain("cs-dots--bar");
    expect(q("section", host).dataset.aspect).toBe("2:1");
    expect(q<HTMLElement>("section", host).style.getPropertyValue("--cs-radius")).toBe("20px");
  });

  it("RTL: dir y flechas espejadas", () => {
    const { host } = mount(banner("bn"), { locale: "ar" });
    expect(q("section", host).getAttribute("dir")).toBe("rtl");
    const ctl = q("section", host);
    ctl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect([...host.querySelectorAll<HTMLElement>(".cs-banner__slide")].map((s) => s.hidden)).toEqual([true, false, true]);
  });
});

describe("defaultOpenLink", () => {
  it("never leaves the origin through a protocol-relative or backslash path", () => {
    const win = { location: { assign: vi.fn(), href: "" }, open: vi.fn() } as unknown as Window;
    for (const url of ["//evil.example/login", "/\\evil.example", "javascript:alert(1)", "http://insecure.example"]) defaultOpenLink({ type: "url", url } as never, win);
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(win.open).not.toHaveBeenCalled();
    defaultOpenLink({ type: "url", url: "/tienda" } as never, win);
    expect(win.location.assign).toHaveBeenCalledWith("/tienda");
    defaultOpenLink({ type: "url", url: "https://example.com/p" } as never, win);
    expect(win.open).toHaveBeenCalledWith("https://example.com/p", "_blank", "noopener,noreferrer");
  });

  it("deep_link: lista blanca (https, mailto, tel, sms) más los esquemas que la app declara; nunca los peligrosos", () => {
    const win = () => ({ location: { assign: vi.fn(), href: "" }, open: vi.fn() }) as unknown as Window & { location: { href: string } };
    for (const uri of ["javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "file:///etc/passwd", "blob:https://x/1", "intent://x#Intent;end", "http://x.example", "tg://resolve?domain=x", "whatsapp://send?text=x", "myapp://p/1", "sin esquema"]) {
      const w = win();
      defaultOpenLink({ type: "deep_link", uri } as never, w);
      expect(w.location.href, uri).toBe("");
    }
    for (const uri of ["https://x.example/a", "mailto:a@b.co", "tel:+573001112233", "sms:+573001112233"]) {
      const w = win();
      defaultOpenLink({ type: "deep_link", uri } as never, w);
      expect(w.location.href, uri).toBe(uri);
    }
    const w = win();
    defaultOpenLink({ type: "deep_link", uri: "myapp://p/1" } as never, w, ["myapp"]);
    expect(w.location.href).toBe("myapp://p/1");
    // declararlos no desbloquea los que ejecutan código
    expect(isSafeDeepLink("javascript:alert(1)", ["javascript"])).toBe(false);
    expect(isSafeDeepLink("tg://resolve?domain=x", ["tg"])).toBe(true);
  });
});
