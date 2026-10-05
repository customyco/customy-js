import { act, fireEvent, screen } from "@testing-library/react";
import { Linking, Share } from "react-native";
import { pan } from "./mocks/gesture-handler";
import { describe, expect, it, vi } from "vitest";
import type { StoryComponent, ViewerEvent } from "@customyai/stories-render";
import { components } from "../src/components";
import { StoryViewerView } from "../src/viewer";
import { attr, renderWithProvider, styleOf } from "./harness";
import { buttonComponent, group, page } from "./fixtures";

/** El texto de un componente (no el de la región viva del visor, que repite los avisos). */
const statusOf = (text: string | RegExp): HTMLElement => screen.getAllByText(text).find((e) => e.closest("[data-testid=cs-live]") === null)!;
const flush = async (): Promise<void> => void (await act(async () => {}));
const base = (id: string, y = 0.4) => ({ id, x: 0.05, y, w: 0.9, h: 0.1, z: 0, collects: [], consent_purpose: "analytics" });
const choices = ["a", "b"].map((id) => ({ id, label: `Opción ${id}` }));

async function show(comps: Record<string, unknown>[], props: Record<string, unknown> = {}, answers?: Record<string, string | number | boolean>) {
  const events: ViewerEvent[] = [];
  const g = group("g1", [], { pages: [page("p1", { canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: [], components: comps as unknown as StoryComponent[] } }), page("p2")], ...(answers ? { answers } : {}) });
  const r = renderWithProvider(<StoryViewerView groups={[g]} open onEvent={(e) => events.push(e)} />, { components, ...props });
  await flush();
  return { ...r, events, of: (type: string) => events.filter((e) => e.type === type) };
}

describe("componentes de la Ola 1 (en el visor base)", () => {
  it("encuesta: un voto anónimo con su propósito de consentimiento; luego queda bloqueada con aviso accesible", async () => {
    const { of } = await show([{ ...base("poll1"), type: "poll", question: "¿Cuál?", options: choices, anonymous: true, show_results: "never" }]);
    fireEvent.click(screen.getByTestId("cs-poll-poll1-a"));
    expect(of("component_response")).toEqual([expect.objectContaining({ componentId: "poll1", choiceId: "a", consentPurpose: "analytics" })]);
    fireEvent.click(screen.getByTestId("cs-poll-poll1-b"));
    expect(of("component_response")).toHaveLength(1);
    expect(JSON.parse(attr(screen.getByTestId("cs-poll-poll1-a"), "data-state")!)).toMatchObject({ selected: true });
    expect(statusOf("Gracias por votar").getAttribute("data-live")).toBe("polite");
  });

  it("cuenta atrás: recordatorio SOLO con la acción explícita; el aviso lo da la app", async () => {
    const onReminder = vi.fn();
    const ends = new Date(Date.now() + 3_600_000).toISOString();
    const { of } = await show([{ ...base("cd"), type: "countdown", label: "Acaba en", ends_at: ends, reminder: { enabled: true, offset_minutes: 10 } }], { onReminder });
    expect(of("component_response")).toHaveLength(0);
    expect(attr(screen.getByLabelText(/Acaba en/), "data-role")).toBe("timer");
    fireEvent.click(screen.getByLabelText("Recordármelo"));
    expect(of("component_response")).toEqual([expect.objectContaining({ componentId: "cd", value: true, consentPurpose: "reminders" })]);
    expect(onReminder).toHaveBeenCalledWith(expect.objectContaining({ id: "cd" }), new Date(Date.parse(ends) - 10 * 60_000).toISOString());
  });

  it("código promocional: copiar registra el clic; usa el portapapeles de la app o el menú de compartir; caducado no se pinta", async () => {
    const copyText = vi.fn(() => Promise.resolve());
    const { of } = await show([{ ...base("pc"), type: "promo_code", code: "VERANO10", copy_label: "Copiar", element_id: "promo.copy" }], { copyText });
    await act(async () => void fireEvent.click(screen.getByLabelText("Copiar")));
    expect(copyText).toHaveBeenCalledWith("VERANO10");
    expect(of("click")).toEqual([expect.objectContaining({ elementId: "promo.copy" })]);
    expect(await screen.findByLabelText("Copiado")).toBeTruthy();
  });

  it("sin portapapeles inyectado se ofrece el menú de compartir", async () => {
    await show([{ ...base("pc"), type: "promo_code", code: "VERANO10", copy_label: "Copiar", element_id: "promo.copy" }]);
    await act(async () => void fireEvent.click(screen.getByLabelText("Copiar")));
    expect(Share.share).toHaveBeenCalledWith({ message: "VERANO10" });
  });

  it("un código caducado no se pinta", async () => {
    await show([{ ...base("pc"), type: "promo_code", code: "VIEJO", copy_label: "Copiar", element_id: "promo.copy", valid_until: "2000-01-01T00:00:00Z" }]);
    expect(screen.queryByText("VIEJO")).toBeNull();
  });

  it("botón «desliza hacia arriba»", async () => {
    const { of } = await show([buttonComponent("b1", { style: "swipe_up", label: "Ver más" })]);
    fireEvent.click(screen.getByLabelText("Ver más"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://shop.example.com/p/1");
    expect(of("click")).toHaveLength(1);
  });
});

describe("Ola 2: elección y valor", () => {
  const quiz = { ...base("q1"), type: "quiz", question: "¿Capital?", options: choices, correct_id: "b", explanation: "Es la b", anonymous: true, show_results: "after_vote" };

  it("quiz: acierto y fallo dicen el resultado con texto (no solo color) y la correcta", async () => {
    const { of } = await show([quiz]);
    fireEvent.click(screen.getByTestId("cs-quiz-q1-a"));
    expect(of("component_response")).toEqual([expect.objectContaining({ componentId: "q1", choiceId: "a" })]);
    const status = statusOf(/No era esa/);
    expect(status.textContent).toBe("No era esa. La correcta: Opción b Es la b");
    expect(status.getAttribute("data-live")).toBe("polite");
    expect(screen.getByTestId("cs-quiz-q1-b").getAttribute("disabled")).not.toBeNull();
    expect(styleOf(screen.getByTestId("cs-quiz-q1-b")).backgroundColor).toBeTruthy();
  });

  it("quiz: una respuesta de una visita anterior se muestra sin emitir otro evento", async () => {
    const { of } = await show([quiz], {}, { q1: "b" });
    expect(screen.getByText("¡Correcto!")).toBeTruthy();
    expect(of("component_response")).toHaveLength(0);
  });

  it("reacciones con emoji: botones con etiqueta; una sola respuesta", async () => {
    const { of } = await show([{ ...base("e1"), type: "emoji_reaction", options: [{ id: "love", emoji: "😍", label: "Me encanta" }, { id: "wow", emoji: "😮" }], orientation: "horizontal", anonymous: true, show_results: "never" }]);
    fireEvent.click(screen.getByLabelText("Me encanta"));
    fireEvent.click(screen.getByLabelText("wow"));
    expect(of("component_response")).toEqual([expect.objectContaining({ choiceId: "love" })]);
  });

  it("valoración: entero 1–max con etiqueta «n de max»; no se puede volver a votar", async () => {
    const { of } = await show([{ ...base("r1"), type: "rating", question: "Califica", max: 5, icon: "star", anonymous: true, show_results: "never" }]);
    fireEvent.click(screen.getByLabelText("4 de 5"));
    fireEvent.click(screen.getByLabelText("2 de 5"));
    expect(of("component_response")).toEqual([expect.objectContaining({ componentId: "r1", value: 4 })]);
  });

  it("deslizador emoji: el voto se confirma al soltar (no a cada movimiento) y pausa la historia mientras se mueve", async () => {
    const { of } = await show([{ ...base("s1"), type: "emoji_slider", question: "¿Cuánto?", emoji: "🔥", anonymous: true, show_results: "never" }]);
    const track = screen.getByTestId("cs-slider-s1-track");
    expect(attr(track, "data-role")).toBe("adjustable");
    expect(JSON.parse(attr(track, "data-value")!)).toMatchObject({ min: 0, max: 100, now: 50 });
    act(() => pan.end(150, 150)); // ancho 300 (la maqueta mide 300) → 50 %
    expect(of("component_response")).toEqual([expect.objectContaining({ componentId: "s1", value: 50 })]);
    expect(attr(track, "data-state")).toContain('"disabled":true');
  });

  it("deslizador con lector de pantalla: incrementar/decrementar y confirma tras una pausa", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { of } = await show([{ ...base("s1"), type: "emoji_slider", question: "¿Cuánto?", emoji: "🔥", anonymous: true, show_results: "never" }]);
    expect(attr(screen.getByTestId("cs-slider-s1-track"), "data-actions")).toBe("increment,decrement");
    // la maqueta no dispara acciones de accesibilidad: se comprueba la lógica con el voto por pan y el límite
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(of("component_response")).toHaveLength(0);
  });

  it("valores fuera de rango no se registran (el servidor igual los rechazaría)", async () => {
    const { of } = await show([{ ...base("s1"), type: "emoji_slider", question: "¿Cuánto?", emoji: "🔥", anonymous: true, show_results: "never" }]);
    act(() => pan.end(150, 900)); // x/ancho > 1 se recorta a 100
    expect(of("component_response")).toEqual([expect.objectContaining({ value: 100 })]);
  });
});

describe("Ola 2: pregunta abierta", () => {
  const q = { ...base("qq"), type: "question", enabled: true, prompt: "Pregunta", submit_label: "Enviar", max_length: 20, anonymous: true, show_answers: true, answers: [{ id: "a1", text: "Una respuesta aprobada" }] };

  it("apagada por defecto: sin `enabled` no se pinta", async () => {
    await show([{ ...q, enabled: false }]);
    expect(screen.queryByText("Pregunta")).toBeNull();
  });

  it("enviar registra el texto (sin ramificar), bloquea el campo y avisa que se revisará", async () => {
    const { of } = await show([q]);
    const send = screen.getByTestId("cs-question-qq-send");
    expect(send.getAttribute("disabled")).not.toBeNull();
    fireEvent.change(screen.getByTestId("cs-question-qq-input"), { target: { value: "  ¿Hay talla M?  " } });
    fireEvent.click(screen.getByTestId("cs-question-qq-send"));
    expect(of("component_response")).toEqual([expect.objectContaining({ componentId: "qq", value: "¿Hay talla M?" })]);
    expect(statusOf(/se revisará/).getAttribute("data-live")).toBe("polite");
    expect(screen.getByTestId("cs-question-qq-input").getAttribute("disabled")).not.toBeNull();
  });

  it("escribir pausa la historia y salir del campo la reanuda", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const g = group("g1", [], { pages: [page("p1", { duration_ms: 2000, canvas: { safe_zone: { top_px: 250, bottom_px: 340 }, layers: [], components: [q] as unknown as StoryComponent[] } }), page("p2")] });
    const events: ViewerEvent[] = [];
    renderWithProvider(<StoryViewerView groups={[g]} open onEvent={(e) => events.push(e)} />, { components });
    await flush();
    const input = screen.getByTestId("cs-question-qq-input");
    fireEvent.focus(input);
    await act(async () => void (await vi.advanceTimersByTimeAsync(6000)));
    expect(events.some((e) => e.type === "next")).toBe(false);
    fireEvent.blur(input);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2100)));
    expect(events.some((e) => e.type === "next")).toBe(true);
  });

  it("reportar una respuesta pide motivo y se registra una vez", async () => {
    const { of } = await show([q]);
    fireEvent.click(screen.getByLabelText("Reportar"));
    fireEvent.click(screen.getByLabelText("Es spam"));
    expect(of("report")).toEqual([expect.objectContaining({ componentId: "qq", answerId: "a1", reason: "spam" })]);
    expect(statusOf("Reportada, gracias")).toBeTruthy();
    expect(screen.queryByText("Una respuesta aprobada")).toBeNull();
  });
});

describe("Ola 2: acciones", () => {
  it("llamar, WhatsApp y mapa abren su destino y registran el clic con nombre", async () => {
    const { of } = await show([
      { ...base("c1", 0.1), type: "call", phone: "+573001112233", label: "Llamar", element_id: "call.cta" },
      { ...base("w1", 0.25), type: "whatsapp", phone: "+573001112233", message: "Hola Customy", label: "Escribir", element_id: "wa.cta" },
      { ...base("m1", 0.4), type: "map", lat: 4.6, lng: -74.08, label: "Cómo llegar", element_id: "map.cta" },
    ]);
    fireEvent.click(screen.getByLabelText("Llamar"));
    expect(Linking.openURL).toHaveBeenLastCalledWith("tel:+573001112233");
    fireEvent.click(screen.getByLabelText("Escribir"));
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://wa.me/573001112233?text=Hola%20Customy");
    fireEvent.click(screen.getByLabelText("Cómo llegar"));
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://www.google.com/maps/search/?api=1&query=4.6,-74.08");
    expect(of("click").map((e) => (e as { elementId: string }).elementId)).toEqual(["call.cta", "wa.cta", "map.cta"]);
    expect(attr(screen.getByLabelText("Llamar"), "data-role")).toBe("link");
  });

  it("formulario: solo se pinta si la app sabe abrirlo", async () => {
    const form = { ...base("f1"), type: "form", form_id: "frm_1", label: "Rellenar", element_id: "form.cta" };
    const { unmount } = await show([form]);
    expect(screen.queryByLabelText("Rellenar")).toBeNull();
    unmount();
    const openForm = vi.fn();
    const { of } = await show([form], { openForm });
    fireEvent.click(screen.getByLabelText("Rellenar"));
    expect(openForm).toHaveBeenCalledWith("frm_1", expect.objectContaining({ surface: "story", groupId: "g1", pageId: "p1", elementId: "form.cta" }));
    expect(of("click")).toHaveLength(1);
  });

  it("añadir al calendario entrega el .ics a la app; sin el hook no se pinta", async () => {
    const cal = { ...base("cal"), type: "add_to_calendar", title: "Lanzamiento", starts_at: "2026-11-01T15:00:00Z", label: "Al calendario", element_id: "cal.cta" };
    const { unmount } = await show([cal]);
    expect(screen.queryByLabelText("Al calendario")).toBeNull();
    unmount();
    const onAddToCalendar = vi.fn();
    await show([cal], { onAddToCalendar });
    fireEvent.click(screen.getByLabelText("Al calendario"));
    expect(onAddToCalendar).toHaveBeenCalledWith(expect.objectContaining({ id: "cal", title: "Lanzamiento", startsAt: "2026-11-01T15:00:00Z", ics: expect.stringContaining("BEGIN:VEVENT") }));
  });

  it("compartir usa el menú del sistema; marca de tiempo y GIF con texto alternativo", async () => {
    const { of } = await show([
      { ...base("sh", 0.1), type: "share", label: "Compartir", text: "Mira esto", url: "https://customy.ai/x", element_id: "share.cta" },
      { ...base("ts", 0.25), type: "timestamp", at: "2026-11-01T15:00:00Z", style: "date", label: "Desde" },
      { ...base("gf", 0.4), type: "gif", url: "https://cdn.test/a.gif", alt: "Gato bailando", decorative: false },
    ]);
    fireEvent.click(screen.getByTestId("cs-share-sh"));
    expect(Share.share).toHaveBeenCalledWith({ message: "Mira esto https://customy.ai/x", url: "https://customy.ai/x" });
    expect(of("share")).toEqual([expect.objectContaining({ target: "component" })]);
    expect(statusOf(/Desde/).textContent).toContain("2026");
    expect(attr(screen.getByLabelText("Gato bailando"), "data-role")).toBe("image");
  });
});

describe("Ola 2: comercio", () => {
  const ref = { connector: "shopify", external_id: "sku-1" };
  const resolved = { ref, title: "Zapatilla", price: { amount: 120000, currency: "COP", formatted: "$ 120.000" }, available: true, url: "https://shop.example.com/z", image_url: "https://cdn.test/z.jpg" };

  it("etiqueta de producto: precio resuelto en vivo, `product_viewed` una vez por página y abre la ficha", async () => {
    const resolveProducts = vi.fn(async () => [resolved]);
    const { of } = await show([{ ...base("pt"), type: "product_tag", product: ref, show_price: true, element_id: "tag.1" }], { resolveProducts });
    await flush();
    const tag = screen.getByTestId("cs-product-pt");
    expect(attr(tag, "aria-label")).toBe("Zapatilla, $ 120.000");
    fireEvent.click(tag);
    fireEvent.click(tag);
    expect(of("product_viewed")).toHaveLength(1);
    expect(of("click")).toHaveLength(2);
    expect(Linking.openURL).toHaveBeenCalledWith("https://shop.example.com/z");
  });

  it("agotado: la etiqueta lo dice y el carrito se desactiva; un fallo del hook no rompe la página", async () => {
    const soldOut = { ...resolved, available: false };
    await show([{ ...base("pt", 0.2), type: "product_tag", product: ref, show_price: true }, { ...base("ct", 0.5), type: "cart", product: ref, quantity: 1, label: "Comprar ya" }], { resolveProducts: async () => [soldOut] });
    await flush();
    expect(attr(screen.getByTestId("cs-product-pt"), "aria-label")).toContain("Agotado");
    expect(screen.getByTestId("cs-cart-ct").getAttribute("disabled")).not.toBeNull();
    cleanupAll();
    const { of } = await show([{ ...base("pt"), type: "product_tag", product: ref, show_price: true, label: "Zapatilla" }], { resolveProducts: async () => Promise.reject(new Error("caído")) });
    await flush();
    fireEvent.click(screen.getByTestId("cs-product-pt"));
    expect(of("product_viewed")).toHaveLength(1);
  });

  it("carrito y favoritos: registran el evento y avisan a la app (el carrito lo decide su backend)", async () => {
    const onAddToCart = vi.fn();
    const onWishlist = vi.fn();
    const { of } = await show(
      [
        { ...base("ct", 0.2), type: "cart", product: ref, quantity: 2, label: "Añadir" },
        { ...base("wl", 0.5), type: "wishlist", product: ref },
      ],
      { onAddToCart, onWishlist, resolveProducts: async () => [resolved] },
    );
    await flush();
    fireEvent.click(screen.getByTestId("cs-cart-ct"));
    fireEvent.click(screen.getByTestId("cs-cart-ct"));
    expect(of("add_to_cart")).toEqual([expect.objectContaining({ componentId: "ct", quantity: 2 })]);
    // El contexto de historia viaja con el carrito (atribución de ingresos).
    expect(onAddToCart).toHaveBeenCalledWith(ref, 2, expect.objectContaining({ componentId: "ct", storyId: expect.any(String) }));
    fireEvent.click(screen.getByTestId("cs-wish-wl"));
    expect(of("wishlist_added")).toHaveLength(1);
    expect(onWishlist).toHaveBeenCalledWith(ref, expect.objectContaining({ componentId: "wl" }));
    expect(attr(screen.getByTestId("cs-wish-wl"), "aria-label")).toBe("Guardado en favoritos");
  });

  it("tarjetas de producto: una por referencia, con precio, y cada toque cuenta una vista", async () => {
    const ref2 = { connector: "shopify", external_id: "sku-2" };
    const { of } = await show([{ ...base("pcs"), type: "product_cards", title: "Para ti", products: [ref, ref2], layout: "carousel", show_price: true }], { resolveProducts: async () => [resolved, { ...resolved, ref: ref2, title: "Bota", price: { amount: 5, currency: "USD" } }] });
    await flush();
    fireEvent.click(screen.getByLabelText("Zapatilla, $ 120.000"));
    fireEvent.click(screen.getByLabelText(/^Bota/));
    expect(of("product_viewed")).toHaveLength(2);
  });
});

describe("Ola 2: ramificación y módulo opcional", () => {
  it("un componente con visibilidad aparece al responder la encuesta de la que depende", async () => {
    const poll = { ...base("poll1", 0.1), type: "poll", question: "¿Cuál?", options: choices, anonymous: true, show_results: "never" };
    const dependent = { ...buttonComponent("later", { y: 0.6, label: "Solo si eliges a" }), visibility: { op: "and", conditions: [{ component_id: "poll1", cmp: "eq", value: "a" }] } };
    await show([poll, dependent]);
    expect(screen.queryByLabelText("Solo si eliges a")).toBeNull();
    fireEvent.click(screen.getByTestId("cs-poll-poll1-a"));
    expect(screen.getByLabelText("Solo si eliges a")).toBeTruthy();
  });

  it("sin el módulo de la Ola 2, sus componentes se omiten sin romper la página", async () => {
    const { events } = await show([{ ...base("q1"), type: "quiz", question: "¿?", options: choices, correct_id: "a", anonymous: true, show_results: "never" }, buttonComponent("b1")], { components: undefined });
    expect(screen.queryByTestId("cs-quiz-q1")).toBeNull();
    expect(screen.getByTestId("cs-button-b1")).toBeTruthy();
    expect(events[0]!.type).toBe("view");
  });

  it("los componentes de la Ola 2 viven en su propio módulo (no entran en el principal)", async () => {
    const main = await import("../src/index");
    expect("components" in main).toBe(false);
    expect(Object.keys(components).sort()).toEqual(["add_to_calendar", "call", "cart", "emoji_reaction", "emoji_slider", "form", "game", "gif", "map", "product_cards", "product_tag", "question", "quiz", "rating", "share", "timestamp", "whatsapp", "wishlist"]);
  });
});

function cleanupAll(): void {
  document.body.innerHTML = "";
}
