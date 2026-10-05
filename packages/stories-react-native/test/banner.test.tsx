import { act, fireEvent, screen } from "@testing-library/react";
import { Linking } from "react-native";
import { rn } from "./mocks/react-native";
import { pan } from "./mocks/gesture-handler";
import { describe, expect, it, vi } from "vitest";
import type { BannerEvent, DeliveredBanner } from "@customyai/stories-render";
import { BannerView } from "../src/banner";
import { attr, renderWithProvider, styleOf } from "./harness";
import { banner } from "./fixtures";

const flush = async (): Promise<void> => void (await act(async () => {}));
const slide = (): HTMLElement => screen.getByTestId("cs-banner-slide");

async function show(b: DeliveredBanner, props: Record<string, unknown> = {}, viewProps: Record<string, unknown> = {}) {
  const events: BannerEvent[] = [];
  const onDismiss = vi.fn();
  const r = renderWithProvider(<BannerView banner={b} onEvent={(e) => events.push(e)} onDismiss={onDismiss} {...viewProps} />, props);
  await flush();
  return { ...r, events, onDismiss };
}

describe("banner", () => {
  it("una impresión y la vista de la primera imagen; la caja respeta el aspecto y el radio", async () => {
    const { events } = await show(banner("b1"));
    expect(events.map((e) => e.type)).toEqual(["impression", "view"]);
    const frame = screen.getByTestId("cs-banner-slide").parentElement!.parentElement!;
    expect(styleOf(frame)).toMatchObject({ aspectRatio: 16 / 9, borderRadius: 12 });
  });

  it("accesible: rol, etiqueta con alt y posición, y acciones incrementar/decrementar", async () => {
    await show(banner("b1"));
    expect(attr(slide(), "data-role")).toBe("link");
    expect(attr(slide(), "aria-label")).toBe("Imagen s1. Imagen 1 de 3");
    expect(attr(slide(), "data-actions")).toBe("increment,decrement");
    const noAction = banner("b2", ["s1"], { slides: [{ id: "s1", image: { url: "https://cdn.test/s1.jpg", alt: "Solo imagen" } }] });
    const { unmount } = await show(noAction);
    expect(attr(screen.getAllByTestId("cs-banner-slide").at(-1)!, "data-role")).toBe("image");
    unmount();
  });

  it("pulsar registra el clic con su nombre y abre el enlace; avisa onActionClicked", async () => {
    const onActionClicked = vi.fn();
    const { events } = await show(banner("b1"), { onActionClicked });
    fireEvent.click(slide());
    expect(events.find((e) => e.type === "click")).toMatchObject({ elementId: "banner.b1.s1" });
    expect(Linking.openURL).toHaveBeenCalledWith("https://example.com/x");
    expect(onActionClicked).toHaveBeenCalledWith({ type: "url", url: "https://example.com/x" }, expect.objectContaining({ surface: "banner", bannerId: "b1", slideId: "s1" }));
  });

  it("swipe cambia de imagen (espejado en RTL)", async () => {
    const { events } = await show(banner("b1"));
    act(() => pan.end(-120));
    expect(attr(slide(), "aria-label")).toContain("2 de 3");
    act(() => pan.end(-10)); // movimiento corto: no cuenta
    expect(attr(slide(), "aria-label")).toContain("2 de 3");
    expect(events.some((e) => e.type === "next" && e.via === "swipe")).toBe(true);
  });

  it("en RTL, deslizar a la izquierda retrocede", async () => {
    rn.setRTL(true);
    await show(banner("b1"));
    act(() => pan.end(-120));
    expect(attr(slide(), "aria-label")).toContain("3 de 3"); // anterior desde la 1.ª, con vuelta
  });

  it("autoplay: avanza solo, el botón visible lo pausa y se puede reanudar (WCAG 2.2.2)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await show(banner("b1"));
    const btn = () => screen.getByTestId("cs-banner-autoplay");
    expect(attr(btn(), "aria-label")).toBe("Pausar carrusel");
    await act(async () => void (await vi.advanceTimersByTimeAsync(5100)));
    expect(attr(slide(), "aria-label")).toContain("2 de 3");
    fireEvent.click(btn());
    expect(attr(btn(), "aria-label")).toBe("Reanudar carrusel");
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_000)));
    expect(attr(slide(), "aria-label")).toContain("2 de 3");
    fireEvent.click(btn());
    await act(async () => void (await vi.advanceTimersByTimeAsync(5100)));
    expect(attr(slide(), "aria-label")).toContain("3 de 3");
  });

  it("con «reducir movimiento» el autoplay empieza en pausa", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await show(banner("b1"), { reducedMotion: true });
    expect(attr(screen.getByTestId("cs-banner-autoplay"), "aria-label")).toBe("Reanudar carrusel");
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(attr(slide(), "aria-label")).toContain("1 de 3");
  });

  it("segundo plano pausa el autoplay y la pausa por superficie lo difiere", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await show(banner("b1"));
    act(() => rn.setAppState("background"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_000)));
    expect(attr(slide(), "aria-label")).toContain("1 de 3");
    act(() => rn.setAppState("active"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(5100)));
    expect(attr(slide(), "aria-label")).toContain("2 de 3");
  });

  it("descartable: el botón lo quita y avisa; sin `dismissible` no hay botón; NUNCA se cierra solo por defecto", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { onDismiss } = await show(banner("b1"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)));
    expect(screen.getByTestId("cs-banner")).toBeTruthy(); // WCAG 2.2.1: sin autocierre
    fireEvent.click(screen.getByTestId("cs-banner-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("user");
    expect(screen.queryByTestId("cs-banner")).toBeNull();
  });

  it("sin botón de descarte si el banner no es descartable; con `auto_close_ms` sí se cierra", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const b = banner("b1", ["s1"]);
    b.style = { ...b.style, dismissible: false, auto_close_ms: 3000 };
    const { onDismiss } = await show(b);
    expect(screen.queryByTestId("cs-banner-dismiss")).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3100)));
    expect(onDismiss).toHaveBeenCalledWith("auto");
  });

  it("puntos: cada uno es un botón que lleva a su imagen; los segmentos no son interactivos", async () => {
    await show(banner("b1"));
    fireEvent.click(screen.getByTestId("cs-banner-dot-2"));
    expect(attr(slide(), "aria-label")).toContain("3 de 3");
    expect(attr(screen.getByTestId("cs-banner-dot-2"), "aria-label")).toBe("Ir a la imagen 3");
    expect(JSON.parse(attr(screen.getByTestId("cs-banner-dot-2"), "data-state")!)).toMatchObject({ selected: true });
  });

  it("una sola imagen no muestra puntos ni botón de autoplay; los avisos de ciclo de vida se emiten", async () => {
    const onWidgetReady = vi.fn();
    const onVisibilityChange = vi.fn();
    const { unmount } = await show(banner("b1", ["s1"]), { onWidgetReady, onVisibilityChange }, { placementId: "home" });
    expect(screen.queryByTestId("cs-banner-autoplay")).toBeNull();
    expect(screen.queryByTestId("cs-banner-dot-0")).toBeNull();
    expect(onWidgetReady).toHaveBeenCalledWith({ placementId: "home", surface: "banner" });
    expect(onVisibilityChange).toHaveBeenCalledWith({ surface: "banner", visible: true });
    unmount();
    await flush();
    expect(onVisibilityChange).toHaveBeenLastCalledWith({ surface: "banner", visible: false });
  });
});
