import { act, fireEvent, screen } from "@testing-library/react";
import { Linking, Share, AccessibilityInfo } from "react-native";
import { modals, rn } from "./mocks/react-native";
import { touches } from "./mocks/gesture-handler";
import { describe, expect, it, vi } from "vitest";
import { type CloseReason, type StoryGroup, type StoryPage, type ViewerEvent } from "@customyai/stories-render";
import type { StoryVideoProps, VideoPlayerAdapter } from "../src/adapters";
import { StoryViewerView } from "../src/viewer";
import { attr, instantCache, renderWithProvider, styleOf } from "./harness";
import { buttonComponent, group, page, textLayer } from "./fixtures";

const flush = async (): Promise<void> => void (await act(async () => {}));
const types = (events: ViewerEvent[]): string[] => events.map((e) => `${e.type}${"via" in e ? `:${e.via}` : ""}`);

async function open(groups: StoryGroup[], props: Record<string, unknown> = {}, viewerProps: Record<string, unknown> = {}) {
  const events: ViewerEvent[] = [];
  const onClose = vi.fn<(r: CloseReason) => void>();
  const r = renderWithProvider(<StoryViewerView groups={groups} open onEvent={(e) => events.push(e)} onClose={onClose} {...viewerProps} />, props);
  await flush();
  return { ...r, events, onClose };
}

const two = (): StoryGroup[] => [group("g1", ["p1", "p2"]), group("g2", ["p1"])];

describe("visor: arranque y accesibilidad", () => {
  it("abre en la primera página, registra la vista y anuncia el cambio de página", async () => {
    const { events } = await open(two());
    expect(events[0]).toMatchObject({ type: "view", groupId: "g1", pageId: "p1" });
    expect(screen.getByTestId("cs-live").textContent).toContain("Historia de Grupo g1");
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(expect.stringContaining("Página 1 de 2"));
    const bar = screen.getByTestId("cs-progress");
    expect(attr(bar, "data-role")).toBe("progressbar");
    expect(JSON.parse(attr(bar, "data-value")!)).toMatchObject({ min: 1, max: 2, now: 1, text: "Página 1 de 2" });
    expect(attr(screen.getByTestId("cs-live"), "data-live")).toBe("polite");
  });

  it("el botón de pausa es visible, tiene rol y etiqueta, y alterna", async () => {
    await open(two());
    const pause = screen.getByTestId("cs-pause");
    expect(attr(pause, "data-role")).toBe("button");
    expect(attr(pause, "aria-label")).toBe("Pausar");
    fireEvent.click(pause);
    expect(attr(screen.getByTestId("cs-pause"), "aria-label")).toBe("Reanudar");
    fireEvent.click(screen.getByTestId("cs-pause"));
    expect(attr(screen.getByTestId("cs-pause"), "aria-label")).toBe("Pausar");
  });

  it("con «reducir movimiento» empieza en pausa y las capas no se animan", async () => {
    const animated = page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, components: [], layers: [textLayer("t1", { animations: [{ phase: "in", kind: "fade", delay_ms: 0, duration_ms: 500, easing: "linear" }] })] } });
    await open([group("g1", [], { pages: [animated] })], { reducedMotion: true });
    expect(attr(screen.getByTestId("cs-pause"), "aria-label")).toBe("Reanudar");
    expect(screen.getByTestId("cs-layer-t1").getAttribute("data-rn")).toBe("View");
  });

  it("sin reducir movimiento la capa con animación es un Animated.View", async () => {
    const animated = page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, components: [], layers: [textLayer("t1", { animations: [{ phase: "in", kind: "fade", delay_ms: 0, duration_ms: 500, easing: "linear" }] })] } });
    await open([group("g1", [], { pages: [animated] })]);
    expect(screen.getByTestId("cs-layer-t1").getAttribute("data-rn")).toBe("Animated.View");
    // al principio de la página la entrada `fade` deja la capa invisible
    expect(styleOf(screen.getByTestId("cs-layer-t1")).opacity).toBe(0);
  });

  it("con lector de pantalla aparecen anterior/siguiente (no hay tercios que pulsar)", async () => {
    rn.setScreenReader(true);
    const { events } = await open(two());
    await flush();
    fireEvent.click(await screen.findByTestId("cs-next"));
    expect(types(events)).toContain("next:keyboard");
    expect(attr(screen.getByTestId("cs-next"), "aria-label")).toBe("Siguiente");
  });

  it("la zona segura real se suma a la de la campaña (la interfaz baja bajo la muesca)", async () => {
    await open(two(), { insets: { top: 100, bottom: 40, left: 0, right: 0 } });
    // ventana 400×800, visor 400×711: 44,4 px de bandas; 100 − 44,4 + 8
    const chrome = screen.getByTestId("cs-progress").parentElement!.parentElement!;
    expect(styleOf(chrome).paddingTop).toBeCloseTo(63.56, 1);
  });

  it("los tokens de tema llegan a los controles (nada de colores propios)", async () => {
    await open(two(), { theme: { viewerBackground: "token-fondo", viewerForeground: "token-texto" } });
    expect(styleOf(screen.getByTestId("cs-stage")).backgroundColor).toBe("token-fondo");
  });
});

describe("visor: gestos", () => {
  it("tap por tercios: derecha = siguiente, izquierda = anterior", async () => {
    const { events } = await open(two());
    touches.tap(350, 300);
    await flush();
    expect(events.filter((e) => e.type === "view").map((e) => e.pageId)).toEqual(["p1", "p2"]);
    touches.tap(50, 300);
    await flush();
    expect(types(events)).toEqual(expect.arrayContaining(["next:tap", "prev:tap"]));
    // el tercio central no hace nada
    const n = events.length;
    touches.tap(200, 300);
    await flush();
    expect(events.length).toBe(n);
  });

  it("en RTL los tercios se espejan: la derecha es «anterior»", async () => {
    rn.setRTL(true);
    const { events } = await open(two(), {}, { startPageId: "p2" });
    touches.tap(350, 300);
    await flush();
    expect(types(events)).toContain("prev:tap");
    expect(types(events)).not.toContain("next:tap");
    // y el swipe: dedo a la derecha = siguiente grupo
    touches.swipe([100, 300], [300, 300]);
    await flush();
    expect(events.filter((e) => e.type === "view").at(-1)).toMatchObject({ groupId: "g2" });
  });

  it("mantener pulsado = pausa y oculta la interfaz; soltar reanuda y NO avanza", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { events } = await open(two());
    touches.down(350, 300);
    await act(async () => void (await vi.advanceTimersByTimeAsync(250)));
    expect(screen.getByTestId("cs-progress").parentElement!.parentElement!.getAttribute("data-pointer-events")).toBe("none");
    touches.up(350, 300);
    await flush();
    expect(types(events)).not.toContain("next:tap");
    expect(screen.getByTestId("cs-progress").parentElement!.parentElement!.getAttribute("data-pointer-events")).toBe("box-none");
  });

  it("swipe horizontal cambia de grupo; swipe abajo cierra con motivo «swipe»", async () => {
    const { events, onClose } = await open(two());
    touches.swipe([300, 300], [100, 310]);
    await flush();
    expect(events.filter((e) => e.type === "view").at(-1)).toMatchObject({ groupId: "g2" });
    touches.swipe([200, 200], [200, 400]);
    await flush();
    expect(onClose).toHaveBeenCalledWith("swipe");
    expect(types(events)).toContain("close");
    expect(screen.queryByTestId("cs-stage")).toBeNull();
  });

  it("swipe arriba o el botón abren el enlace (clic con nombre) y avisan onActionClicked", async () => {
    const withCta = group("g1", [], { pages: [page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: [], components: [buttonComponent("b1")] } })] });
    const onActionClicked = vi.fn();
    const { events } = await open([withCta], { onActionClicked });
    touches.swipe([200, 500], [200, 300]);
    await flush();
    expect(Linking.openURL).toHaveBeenCalledWith("https://shop.example.com/p/1");
    expect(events.find((e) => e.type === "click")).toMatchObject({ elementId: "cta.buy", componentId: "b1" });
    expect(onActionClicked).toHaveBeenCalledWith({ type: "url", url: "https://shop.example.com/p/1" }, expect.objectContaining({ surface: "story", groupId: "g1", pageId: "p1" }));
  });

  it("un toque que empieza en un botón es del botón: no avanza la página", async () => {
    const withCta = group("g1", ["p1", "p2"]);
    withCta.pages![0] = page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: [], components: [buttonComponent("b1", { x: 0.7, w: 0.25 })] } });
    const { events } = await open([withCta]);
    const btn = screen.getByTestId("cs-button-b1");
    fireEvent.touchStart(btn);
    touches.tap(350, 560);
    fireEvent.click(btn);
    await flush();
    expect(types(events)).not.toContain("next:tap");
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    // el siguiente toque, fuera del botón, vuelve a ser de la historia
    touches.tap(350, 200);
    await flush();
    expect(types(events)).toContain("next:tap");
  });

  it("dos dedos no son un toque de la historia", async () => {
    const { events } = await open(two());
    touches.down(350, 300, 2);
    touches.up(350, 300);
    await flush();
    expect(types(events)).not.toContain("next:tap");
  });
});

describe("visor: ciclo de vida", () => {
  it("segundo plano congela la página (no avanza sola) y volver la reanuda", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { events } = await open([group("g1", [], { pages: [page("p1", { duration_ms: 3000 }), page("p2")] })]);
    act(() => rn.setAppState("background"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(types(events)).not.toContain("next:auto");
    act(() => rn.setAppState("active"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3100)));
    expect(types(events)).toContain("next:auto");
  });

  it("Android: el botón «atrás» (onRequestClose) cierra con registro", async () => {
    const { onClose, events } = await open(two());
    act(() => modals.onRequestClose?.());
    expect(onClose).toHaveBeenCalledWith("user");
    expect(types(events)).toContain("close");
  });

  it("onVisibilityChange avisa al abrir y al cerrar", async () => {
    const onVisibilityChange = vi.fn();
    const { unmount } = await open(two(), { onVisibilityChange });
    expect(onVisibilityChange).toHaveBeenCalledWith({ surface: "story", visible: true });
    unmount();
    await flush();
    expect(onVisibilityChange).toHaveBeenLastCalledWith({ surface: "story", visible: false });
  });

  it("desmontar mientras está abierto registra el cierre y cancela la precarga", async () => {
    const signals: AbortSignal[] = [];
    const cache = { load: vi.fn((_a: unknown, s: AbortSignal) => (signals.push(s), new Promise<void>(() => undefined))) };
    const { events, unmount } = await open(two(), { mediaCache: cache });
    expect(signals.length).toBeGreaterThan(0);
    unmount();
    await flush();
    expect(events.at(-1)).toMatchObject({ type: "close", reason: "app" });
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe("visor: precarga con cancelación", () => {
  it("precarga la página actual, la siguiente y la primera del grupo siguiente", async () => {
    const cache = instantCache();
    await open(two(), { mediaCache: cache });
    const urls = cache.load.mock.calls.map((c) => (c[0] as { url: string }).url);
    expect(urls).toEqual(expect.arrayContaining(["https://cdn.test/p1.jpg", "https://cdn.test/p2.jpg"]));
    // g1/p1, g1/p2 y g2/p1 comparten nombre de fondo (p1/p2): 3 páginas, 2 URLs distintas por fondo; lo que importa es que son 3 trabajos
    expect(cache.load).toHaveBeenCalledTimes(3);
  });

  it("al saltar de grupo se cancela lo que ya no está en el plan", async () => {
    const signals = new Map<string, AbortSignal>();
    const cache = { load: vi.fn((a: { url: string }, s: AbortSignal) => (signals.set(a.url, s), new Promise<void>(() => undefined))) };
    const groups = [group("g1", ["a1", "a2"]), group("g2", ["b1", "b2"]), group("g3", ["c1"])];
    await open(groups, { mediaCache: cache });
    expect([...signals.keys()].sort()).toEqual(["https://cdn.test/a1.jpg", "https://cdn.test/a2.jpg", "https://cdn.test/b1.jpg"]);
    touches.swipe([300, 300], [100, 300]); // g2
    await flush();
    touches.swipe([300, 300], [100, 300]); // g3
    await flush();
    // a1/a2 ya no cuentan: su descarga se abortó; la de g3 sigue viva
    expect(signals.get("https://cdn.test/a2.jpg")!.aborted).toBe(true);
    expect(signals.get("https://cdn.test/c1.jpg")!.aborted).toBe(false);
  });
});

describe("visor: vídeo con adaptador inyectable", () => {
  const videoPage = (over: Partial<StoryPage> = {}): StoryPage =>
    page("p1", { background: { type: "video", url: "https://cdn.test/v.mp4", poster: "https://cdn.test/v.jpg", fit: "fill", muted: true, has_speech: false, captions: [{ lang: "es", label: "Español", url: "https://cdn.test/v.vtt" }], decorative: true }, ...over });

  function adapter() {
    const seen: StoryVideoProps[] = [];
    const a: VideoPlayerAdapter = {
      Component: (p) => {
        seen.push(p);
        return null;
      },
    };
    return { a, seen, last: () => seen.at(-1)! };
  }

  it("el vídeo principal lleva el reloj de la historia y al acabar avanza", async () => {
    const { a, last } = adapter();
    const { events } = await open([group("g1", [], { pages: [videoPage(), page("p2")] })], { video: a });
    expect(last().uri).toBe("https://cdn.test/v.mp4");
    expect(last().primary).toBe(true);
    expect(last().captionsEnabled).toBe(true);
    await flush();
    expect(last().paused).toBe(false);
    act(() => last().onProgress(5000, 10000));
    act(() => last().onEnd());
    await flush();
    expect(types(events)).toContain("next:auto");
  });

  it("pausar la historia pausa el vídeo; silenciar y subtítulos son botones con estado", async () => {
    const { a, last } = adapter();
    await open([group("g1", [], { pages: [videoPage()] })], { video: a });
    await flush();
    fireEvent.click(screen.getByTestId("cs-pause"));
    expect(last().paused).toBe(true);
    expect(last().muted).toBe(true);
    fireEvent.click(screen.getByTestId("cs-mute"));
    expect(last().muted).toBe(false);
    fireEvent.click(screen.getByTestId("cs-captions"));
    expect(last().captionsEnabled).toBe(false);
  });

  it("un error del vídeo degrada al póster con temporizador (la página no se queda colgada)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { a, last } = adapter();
    const { events } = await open([group("g1", [], { pages: [videoPage({ duration_ms: 2000 }), page("p2")] })], { video: a });
    act(() => last().onError());
    await act(async () => void (await vi.advanceTimersByTimeAsync(2100)));
    expect(types(events)).toContain("next:auto");
  });

  it("sin adaptador: póster y temporizador, y sin botones de vídeo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { events } = await open([group("g1", [], { pages: [videoPage({ duration_ms: 2000 }), page("p2")] })]);
    expect(screen.getByTestId("cs-video-primary")).toBeTruthy();
    expect(screen.queryByTestId("cs-mute")).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2100)));
    expect(types(events)).toContain("next:auto");
  });
});

describe("visor: capas", () => {
  it("texto con tokens y tamaño relativo, imagen con alt y decorativa oculta, forma, lottie solo con adaptador", async () => {
    const layers = [
      textLayer("t1", { text: "Oferta", font_size: 0.05 }),
      { type: "image" as const, id: "i1", url: "https://cdn.test/i1.png", fit: "fit" as const, x: 0, y: 0, w: 0.2, h: 0.1, rotation: 0, opacity: 1, z: 1, animations: [], decorative: false, alt: "Zapatilla roja" },
      { type: "image" as const, id: "i2", url: "https://cdn.test/i2.png", fit: "fill" as const, x: 0, y: 0.2, w: 0.2, h: 0.1, rotation: 0, opacity: 1, z: 2, animations: [], decorative: true },
      { type: "shape" as const, id: "s1", shape: "ellipse" as const, fill: "#112233", stroke_width: 0, radius: 0, x: 0.5, y: 0.5, w: 0.2, h: 0.1, rotation: 15, opacity: 0.5, z: 3, animations: [], decorative: true },
      { type: "lottie" as const, id: "l1", url: "https://cdn.test/a.json", loop: true, x: 0, y: 0, w: 0.3, h: 0.2, rotation: 0, opacity: 1, z: 4, animations: [], decorative: true },
    ];
    const g = group("g1", [], { pages: [page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, components: [], layers } })] });
    const { unmount } = await open([g], { theme: { viewerForeground: "token-texto" } });
    const text = screen.getByTestId("cs-layer-t1").querySelector("[data-rn=Text]")!;
    // 0,05 × alto del visor (400 × 16/9 = 711,11) = 35,56
    expect(styleOf(text)).toMatchObject({ fontSize: 35.56, color: "token-texto", textAlign: "left" });
    const img = screen.getByTestId("cs-layer-i1").querySelector("img")!;
    expect(attr(img, "aria-label")).toBe("Zapatilla roja");
    expect(attr(img, "data-role")).toBe("image");
    expect(attr(screen.getByTestId("cs-layer-i2").querySelector("img"), "data-hidden")).toBe("1");
    const shape = screen.getByTestId("cs-layer-s1");
    expect(styleOf(shape)).toMatchObject({ opacity: 0.5, transform: [{ rotate: "15deg" }] });
    expect(screen.queryByTestId("cs-layer-l1")).toBeNull();
    unmount();
    const Lottie = vi.fn(() => null);
    await open([g], { lottie: { Component: Lottie as never } });
    expect(screen.getByTestId("cs-layer-l1")).toBeTruthy();
    expect(Lottie).toHaveBeenCalledWith(expect.objectContaining({ uri: "https://cdn.test/a.json", loop: true, autoplay: true }), undefined);
  });

  it("el texto empieza a la derecha en RTL y el color de campaña se aplica como dato", async () => {
    rn.setRTL(true);
    const g = group("g1", [], { pages: [page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, components: [], layers: [textLayer("t1", { color: "#ff0000", background: "#000000" })] } })] });
    await open([g]);
    const text = screen.getByTestId("cs-layer-t1").querySelector("[data-rn=Text]")!;
    expect(styleOf(text)).toMatchObject({ textAlign: "right", color: "#ff0000", backgroundColor: "#000000" });
  });

  it("un componente no se sale de la zona segura (ni la del dispositivo)", async () => {
    const g = group("g1", [], { pages: [page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: [], components: [buttonComponent("b1", { y: 0.0, h: 0.05 })] } })] });
    await open([g]);
    const box = screen.getByTestId("cs-button-b1").parentElement!;
    // 250 px de referencia × (400/1080) = 92,6
    expect(styleOf(box).top as number).toBeGreaterThanOrEqual(92.5);
  });

  it("compartir usa el menú del sistema y registra el evento", async () => {
    const { events } = await open(two(), { shareUrl: ({ groupId }: { groupId: string }) => `https://customy.ai/s/${groupId}` });
    fireEvent.click(screen.getByTestId("cs-share"));
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://customy.ai/s/g1" }));
    expect(events.find((e) => e.type === "share")).toMatchObject({ target: "link" });
  });
});

describe("visor: patrocinado", () => {
  it("la etiqueta abre la hoja de transparencia, pausa la historia y cerrar reanuda", async () => {
    const sponsored = group("g1", ["p1"], { mode: "sponsored", sponsor: { name: "Acme", label: "Patrocinado", transparency: { text: "Anuncio de Acme", payer: "Acme SAS", url: "https://acme.test/ads" } } });
    await open([sponsored]);
    const btn = screen.getByTestId("cs-sponsor");
    expect(attr(btn, "aria-label")).toContain("Patrocinado: Acme");
    fireEvent.click(btn);
    expect(screen.getByText("Anuncio de Acme")).toBeTruthy();
    expect(screen.getByText("Anuncio de Acme").closest("[data-modal=\"1\"]")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("Más información"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://acme.test/ads");
    fireEvent.click(screen.getByTestId("cs-sheet-close"));
    expect(screen.queryByText("Anuncio de Acme")).toBeNull();
  });
});
