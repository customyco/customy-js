import type { StoryCommerceContext } from "../commerce";
/**
 * @customyai/stories-render/components — los componentes interactivos de la Ola 2, como módulo
 * OPCIONAL (quien no los usa no los descarga): quiz, emoji_reaction, emoji_slider, rating, question
 * (apagada por defecto, moderada por el servidor), share, timestamp, call, whatsapp, map,
 * add_to_calendar, form, gif y los de comercio (product_tag, product_cards, cart, wishlist).
 *
 *   import { components } from "@customyai/stories-render/components";
 *   mountStoryBar(el, { ...bind, viewer: { components, resolveProducts, openForm } });
 *
 * Cada pintor recibe un `ComponentCtx` (ver component-api.ts) y habla con el visor por su API de
 * dominio (`respond`, `activateAction`, `trackProduct`, `reportAnswer`): el visor valida, registra el
 * evento (anónimo por defecto) y la capa de eventos añade el consentimiento. Aquí solo hay DOM.
 */
import type { StoryComponent, AddToCalendarComponent, CartComponent, EmojiReactionComponent, EmojiSliderComponent, GifComponent, ProductCardsComponent, ProductRef, ProductTagComponent, QuestionComponent, QuizComponent, RatingComponent, ResolvedProduct, ShareComponent, TimestampComponent, WishlistComponent } from "../types";
import type { ComponentCtx, ComponentRegistry } from "./component-api";
import type { ComponentAction } from "../types";

// ─── Textos ─────────────────────────────────────────────────────────────────

export type ComponentMessages = {
  thanks: string;
  quizCorrect: string;
  quizWrong: string;
  quizRight: string;
  questionThanks: string;
  questionCount: string;
  answers: string;
  report: string;
  reportReasons: { spam: string; abuse: string; privacy: string };
  reported: string;
  sliderValue: string;
  ratingOf: string;
  shareCopied: string;
  addToCalendar: string;
  addToCart: string;
  added: string;
  wishlist: string;
  wishlisted: string;
  soldOut: string;
  openProduct: string;
  price: string;
};

const es: ComponentMessages = {
  thanks: "Gracias",
  quizCorrect: "¡Correcto!",
  quizWrong: "No era esa",
  quizRight: "La correcta: {answer}",
  questionThanks: "Gracias. Tu pregunta se revisará antes de publicarse.",
  questionCount: "{n} de {max}",
  answers: "Respuestas",
  report: "Reportar",
  reportReasons: { spam: "Es spam", abuse: "Es ofensiva", privacy: "Muestra datos personales" },
  reported: "Reportada, gracias",
  sliderValue: "{n} de 100",
  ratingOf: "{n} de {max}",
  shareCopied: "Enlace copiado",
  addToCalendar: "Añadir al calendario",
  addToCart: "Añadir al carrito",
  added: "Añadido",
  wishlist: "Guardar en favoritos",
  wishlisted: "Guardado en favoritos",
  soldOut: "Agotado",
  openProduct: "Ver producto",
  price: "Precio",
};

const en: ComponentMessages = {
  thanks: "Thanks",
  quizCorrect: "Correct!",
  quizWrong: "Not that one",
  quizRight: "The right one: {answer}",
  questionThanks: "Thanks. Your question will be reviewed before it is published.",
  questionCount: "{n} of {max}",
  answers: "Answers",
  report: "Report",
  reportReasons: { spam: "It's spam", abuse: "It's offensive", privacy: "It shows personal data" },
  reported: "Reported, thanks",
  sliderValue: "{n} of 100",
  ratingOf: "{n} of {max}",
  shareCopied: "Link copied",
  addToCalendar: "Add to calendar",
  addToCart: "Add to cart",
  added: "Added",
  wishlist: "Save to favourites",
  wishlisted: "Saved to favourites",
  soldOut: "Sold out",
  openProduct: "View product",
  price: "Price",
};

const pt: ComponentMessages = {
  thanks: "Obrigado",
  quizCorrect: "Correto!",
  quizWrong: "Não era essa",
  quizRight: "A certa: {answer}",
  questionThanks: "Obrigado. Sua pergunta será revisada antes de ser publicada.",
  questionCount: "{n} de {max}",
  answers: "Respostas",
  report: "Denunciar",
  reportReasons: { spam: "É spam", abuse: "É ofensiva", privacy: "Mostra dados pessoais" },
  reported: "Denunciada, obrigado",
  sliderValue: "{n} de 100",
  ratingOf: "{n} de {max}",
  shareCopied: "Link copiado",
  addToCalendar: "Adicionar ao calendário",
  addToCart: "Adicionar ao carrinho",
  added: "Adicionado",
  wishlist: "Salvar nos favoritos",
  wishlisted: "Salvo nos favoritos",
  soldOut: "Esgotado",
  openProduct: "Ver produto",
  price: "Preço",
};

const fmt = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const COMPONENT_BUNDLES: Record<string, ComponentMessages> = { es, en, pt };
export const messagesFor = (locale: string | undefined, over?: Partial<ComponentMessages>): ComponentMessages => ({ ...(COMPONENT_BUNDLES[(locale ?? "en").toLowerCase().split(/[-_]/)[0] ?? "en"] ?? en), ...over });

// ─── Utilidades puras (con pruebas) ─────────────────────────────────────────

/** Precio con formato: el que da el hook, o `Intl` con la moneda. */
export function formatPrice(p: { amount: number; currency: string; formatted?: string } | undefined, locale?: string): string {
  if (!p) return "";
  if (p.formatted) return p.formatted;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: p.currency }).format(p.amount);
  } catch {
    return `${p.amount} ${p.currency}`;
  }
}

/** «hace 2 h», «en 3 días»… con `Intl.RelativeTimeFormat` (o la fecha si el entorno no lo tiene). */
export function relativeTime(iso: string, nowMs: number, locale?: string): string {
  const diff = Date.parse(iso) - nowMs;
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  const [unit, size] = units.find(([, ms]) => abs >= ms) ?? (["minute", 60_000] as [Intl.RelativeTimeFormatUnit, number]);
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(diff / size), unit);
  } catch {
    return new Date(iso).toISOString();
  }
}

const icsDate = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (t: string): string => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** RFC 5545: líneas de 75 octetos como mucho, continuadas con un espacio. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

/** El `.ics` de un componente `add_to_calendar` (fin por defecto: una hora después). */
export function buildIcs(c: Pick<AddToCalendarComponent, "id" | "title" | "starts_at" | "ends_at" | "location" | "description">, nowMs: number): string {
  const end = c.ends_at ?? new Date(Date.parse(c.starts_at) + 3_600_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Customy//Stories//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${c.id}-${icsDate(c.starts_at)}@customy.ai`,
    `DTSTAMP:${icsDate(new Date(nowMs).toISOString())}`,
    `DTSTART:${icsDate(c.starts_at)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(c.title)}`,
    ...(c.location ? [`LOCATION:${icsText(c.location)}`] : []),
    ...(c.description ? [`DESCRIPTION:${icsText(c.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export const productKey = (r: ProductRef): string => `${r.connector}:${r.external_id}${r.variant_id ? `#${r.variant_id}` : ""}`;

// ─── Pintores ───────────────────────────────────────────────────────────────

type Ctx<C extends StoryComponent> = ComponentCtx<C>;

/**
 * Responde a un componente de elección o de valor: poll, quiz y emoji_reaction (una opción), rating
 * (entero 1–max), emoji_slider (entero 0–100) y question (texto). Una vez por componente en la sesión;
 * anónima por defecto; el propósito de consentimiento viaja en el evento y el servidor lo vuelve a
 * validar. Un texto abierto no alimenta la ramificación.
 */
function respond(ctx: ComponentCtx, c: StoryComponent, input: { choiceId?: string; value?: string | number }): boolean {
  if (ctx.viewer.getState().responses[c.id] !== undefined) return false;
  let answer: string | number;
  if (c.type === "quiz" || c.type === "emoji_reaction") {
    if (!input.choiceId || !c.options.some((o) => o.id === input.choiceId)) return false;
    answer = input.choiceId;
  } else if (c.type === "rating" || c.type === "emoji_slider") {
    const n = input.value;
    if (typeof n !== "number" || !Number.isInteger(n) || n < (c.type === "rating" ? 1 : 0) || n > (c.type === "rating" ? c.max : 100)) return false;
    answer = n;
  } else if (c.type === "question") {
    const t = typeof input.value === "string" ? input.value.trim() : "";
    if (!c.enabled || !t || t.length > c.max_length) return false;
    answer = t;
  } else return false;
  ctx.viewer.track({ type: "component_response", componentId: c.id, ...(typeof answer === "string" && c.type !== "question" ? { choiceId: answer } : { value: answer }), consentPurpose: c.consent_purpose });
  ctx.viewer.setAnswer(c.id, answer, c.type !== "question");
  return true;
}

/** Registra el clic con su nombre (`element_id`), si el componente lo tiene. */
const click = (ctx: ComponentCtx, c: StoryComponent): void => {
  if ("element_id" in c && c.element_id) ctx.viewer.track({ type: "click", elementId: c.element_id, componentId: c.id });
};

/** Pausa la historia mientras se escribe o se mueve un deslizador (la página no avanza sola). */
function holdWhileFocused(ctx: ComponentCtx, field: HTMLElement): void {
  field.addEventListener("focus", () => ctx.viewer.pause("typing"));
  field.addEventListener("blur", () => ctx.viewer.resume("typing"));
  ctx.cleanup(() => ctx.viewer.resume("typing"));
}

const asText = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function quiz(ctx: Ctx<QuizComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const qid = `cs-q-${c.id}`;
  const status = el(ctx.doc, "p", { class: "cs-quiz__status", role: "status" });
  const root = el(ctx.doc, "div", { class: "cs-quiz", role: "group", "aria-labelledby": qid }, el(ctx.doc, "p", { class: "cs-poll__q", id: qid }, c.question));
  const buttons = c.options.map((o) => el(ctx.doc, "button", { type: "button", class: "cs-poll__opt", "data-option": o.id }, o.label));
  const settle = (chosen: string, say: boolean): void => {
    const right = chosen === c.correct_id;
    buttons.forEach((b, i) => {
      const id = c.options[i]!.id;
      b.disabled = true;
      b.setAttribute("aria-pressed", String(id === chosen));
      // El resultado no depende solo del color: el texto y el estado lo dicen.
      if (id === c.correct_id) b.dataset.result = "right";
      else if (id === chosen) b.dataset.result = "wrong";
    });
    const rightLabel = c.options.find((o) => o.id === c.correct_id)?.label ?? "";
    status.textContent = right ? m.quizCorrect : `${m.quizWrong}. ${fmt(m.quizRight, { answer: rightLabel })}`;
    if (!right && c.explanation) status.textContent += ` ${c.explanation}`;
    if (say) ctx.say(status.textContent);
  };
  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      if (respond(ctx, c, { choiceId: c.options[i]!.id })) settle(c.options[i]!.id, true);
    }),
  );
  root.append(el(ctx.doc, "div", { class: "cs-poll__opts" }, ...buttons), status);
  const prior = asText(ctx.answers()[c.id]);
  if (prior && c.options.some((o) => o.id === prior)) settle(prior, false);
  return root;
}

function emojiReaction(ctx: Ctx<EmojiReactionComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const qid = `cs-q-${c.id}`;
  const root = el(ctx.doc, "div", { class: "cs-emoji", role: "group", "data-orientation": c.orientation, ...(c.question ? { "aria-labelledby": qid } : { "aria-label": c.options.map((o) => o.label ?? o.id).join(", ") }) });
  if (c.question) root.append(el(ctx.doc, "p", { class: "cs-poll__q", id: qid }, c.question));
  const row = el(ctx.doc, "div", { class: "cs-emoji__row" });
  const buttons = c.options.map((o) => el(ctx.doc, "button", { type: "button", class: "cs-emoji__opt", "aria-label": o.label ?? o.id, "aria-pressed": "false" }, el(ctx.doc, "span", { "aria-hidden": "true" }, o.emoji)));
  const settle = (chosen: string, say: boolean): void => {
    buttons.forEach((b, i) => {
      b.disabled = true;
      b.setAttribute("aria-pressed", String(c.options[i]!.id === chosen));
    });
    if (say) ctx.say(m.thanks);
  };
  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      if (respond(ctx, c, { choiceId: c.options[i]!.id })) settle(c.options[i]!.id, true);
    }),
  );
  row.append(...buttons);
  root.append(row);
  const prior = asText(ctx.answers()[c.id]);
  if (prior && c.options.some((o) => o.id === prior)) settle(prior, false);
  return root;
}

function emojiSlider(ctx: Ctx<EmojiSliderComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const qid = `cs-q-${c.id}`;
  const face = el(ctx.doc, "span", { class: "cs-slider__emoji", "aria-hidden": "true" }, c.emoji);
  const input = el(ctx.doc, "input", { type: "range", class: "cs-slider__input", min: 0, max: 100, step: 1, value: 50, "aria-labelledby": qid });
  const sync = (): void => {
    face.style.transform = `scale(${(0.8 + Number(input.value) / 100).toFixed(2)})`;
    input.setAttribute("aria-valuetext", fmt(m.sliderValue, { n: input.value }));
  };
  const lock = (value: number): void => {
    input.value = String(value);
    input.disabled = true;
    sync();
  };
  input.addEventListener("input", sync);
  // El voto se confirma al soltar (change), no a cada movimiento.
  input.addEventListener("change", () => {
    if (respond(ctx, c, { value: Number(input.value) })) {
      input.disabled = true;
      ctx.say(m.thanks);
    }
  });
  holdWhileFocused(ctx, input);
  sync();
  const prior = ctx.answers()[c.id];
  if (typeof prior === "number") lock(prior);
  return el(ctx.doc, "div", { class: "cs-slider", role: "group" }, el(ctx.doc, "p", { class: "cs-poll__q", id: qid }, c.question), face, input);
}

function rating(ctx: Ctx<RatingComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const qid = `cs-q-${c.id}`;
  const glyph = c.icon === "heart" ? "♥" : "★";
  const root = el(ctx.doc, "div", { class: "cs-rating", role: "group", ...(c.question ? { "aria-labelledby": qid } : { "aria-label": fmt(m.ratingOf, { n: "…", max: c.max }) }) });
  if (c.question) root.append(el(ctx.doc, "p", { class: "cs-poll__q", id: qid }, c.question));
  const buttons = Array.from({ length: c.max }, (_, i) => el(ctx.doc, "button", { type: "button", class: "cs-rating__star", "aria-label": fmt(m.ratingOf, { n: i + 1, max: c.max }), "aria-pressed": "false" }, el(ctx.doc, "span", { "aria-hidden": "true" }, glyph)));
  const paint = (n: number): void => buttons.forEach((b, i) => (b.dataset.on = i < n ? "1" : "0"));
  const settle = (n: number, say: boolean): void => {
    paint(n);
    buttons.forEach((b, i) => {
      b.disabled = true;
      b.setAttribute("aria-pressed", String(i === n - 1));
    });
    if (say) ctx.say(m.thanks);
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => {
      if (respond(ctx, c, { value: i + 1 })) settle(i + 1, true);
    });
    // Vista previa al pasar el ratón (no es la única vía: el teclado y el toque eligen igual).
    b.addEventListener("pointerenter", () => !b.disabled && paint(i + 1));
    b.addEventListener("pointerleave", () => !b.disabled && paint(0));
  });
  root.append(el(ctx.doc, "div", { class: "cs-rating__row" }, ...buttons));
  const prior = ctx.answers()[c.id];
  if (typeof prior === "number") settle(prior, false);
  return root;
}

function question(ctx: Ctx<QuestionComponent>, m: ComponentMessages): HTMLElement | null {
  const { comp: c, el } = ctx;
  // Apagada por defecto: sin `enabled` no se pinta (el servidor tampoco la entrega ni acepta respuestas).
  if (!c.enabled) return null;
  const lid = `cs-q-${c.id}`;
  const area = el(ctx.doc, "textarea", { class: "cs-question__input", maxlength: c.max_length, rows: 3, "aria-labelledby": lid, ...(c.placeholder ? { placeholder: c.placeholder } : {}) });
  const count = el(ctx.doc, "span", { class: "cs-question__count", "aria-hidden": "true" });
  const submit = el(ctx.doc, "button", { type: "button", class: "cs-btn cs-question__send" }, c.submit_label);
  const status = el(ctx.doc, "p", { class: "cs-question__status", role: "status" });
  const root = el(ctx.doc, "div", { class: "cs-question", role: "group" }, el(ctx.doc, "label", { class: "cs-poll__q", id: lid }, c.prompt), area, el(ctx.doc, "div", { class: "cs-question__bar" }, count, submit), status);
  const sync = (): void => {
    count.textContent = fmt(m.questionCount, { n: area.value.length, max: c.max_length });
    submit.disabled = !area.value.trim();
  };
  area.addEventListener("input", sync);
  holdWhileFocused(ctx, area);
  submit.addEventListener("click", () => {
    if (!respond(ctx, c, { value: area.value })) return;
    area.disabled = true;
    submit.disabled = true;
    status.textContent = m.questionThanks;
    ctx.say(m.questionThanks);
  });
  sync();
  if (typeof ctx.answers()[c.id] === "string") {
    area.disabled = true;
    submit.disabled = true;
  }
  // Respuestas ya aprobadas por el servidor (sin autor), cada una reportable (una vez por respuesta).
  const reported = new Set<string>();
  if (c.show_answers && c.answers.length) {
    const list = el(ctx.doc, "ul", { class: "cs-question__list", "aria-label": m.answers });
    for (const a of c.answers) {
      const item = el(ctx.doc, "li", { class: "cs-question__item" }, el(ctx.doc, "span", {}, a.text));
      const menu = el(ctx.doc, "div", { class: "cs-question__menu", role: "group", "aria-label": m.report, hidden: true });
      for (const reason of ["spam", "abuse", "privacy"] as const) {
        const b = el(ctx.doc, "button", { type: "button", class: "cs-chip" }, m.reportReasons[reason]);
        b.addEventListener("click", () => {
          if (reported.has(a.id)) return;
          reported.add(a.id);
          ctx.viewer.track({ type: "report", componentId: c.id, answerId: a.id, reason });
          item.replaceChildren(el(ctx.doc, "em", {}, m.reported));
          ctx.say(m.reported);
        });
        menu.append(b);
      }
      const open = el(ctx.doc, "button", { type: "button", class: "cs-chip", "aria-expanded": "false" }, m.report);
      open.addEventListener("click", () => {
        menu.hidden = !menu.hidden;
        open.setAttribute("aria-expanded", String(!menu.hidden));
      });
      item.append(open, menu);
      list.append(item);
    }
    root.append(list);
  }
  return root;
}

function share(ctx: Ctx<ShareComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el, win } = ctx;
  const b = el(ctx.doc, "button", { type: "button", class: "cs-btn" }, c.label);
  b.addEventListener("click", () => {
    click(ctx, c);
    ctx.viewer.share("component");
    const url = c.url ?? win.location.href;
    const done = (): void => ctx.say(m.shareCopied);
    if (typeof win.navigator.share === "function") void win.navigator.share({ ...(c.text ? { text: c.text } : {}), url }).catch(() => undefined);
    else void win.navigator.clipboard?.writeText(url).then(done, () => undefined);
  });
  return b;
}

function timestamp(ctx: Ctx<TimestampComponent>): HTMLElement {
  const { comp: c, el } = ctx;
  const text =
    c.style === "relative"
      ? relativeTime(c.at, ctx.clock.now(), ctx.locale)
      : new Intl.DateTimeFormat(ctx.locale, c.style === "date" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(new Date(c.at));
  return el(ctx.doc, "span", { class: "cs-timestamp" }, c.label ? `${c.label} ` : null, el(ctx.doc, "time", { datetime: c.at }, text));
}

/** Llamar, WhatsApp, mapa y formulario: un botón que registra el clic con su nombre y abre el destino. */
export function actionTarget(c: StoryComponent): ComponentAction | null {
  if (c.type === "call") return { type: "deep_link", uri: `tel:${c.phone}` };
  if (c.type === "whatsapp") return { type: "url", url: `https://wa.me/${c.phone.slice(1)}${c.message ? `?text=${encodeURIComponent(c.message)}` : ""}` };
  if (c.type === "map") return { type: "url", url: `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` };
  return null;
}

function action(hidden?: (ctx: ComponentCtx) => boolean) {
  return (ctx: ComponentCtx): HTMLElement | null => {
    if (hidden?.(ctx)) return null;
    const c = ctx.comp as StoryComponent & { label: string };
    const b = ctx.el(ctx.doc, "button", { type: "button", class: "cs-btn" }, c.label ?? ({ es: "Jugar", pt: "Jogar" } as Record<string, string>)[(ctx.locale ?? "en").slice(0, 2)] ?? "Play");
    b.addEventListener("click", () => {
      click(ctx, c);
      const target = actionTarget(c);
      if (target) ctx.open(target, "element_id" in c ? c.element_id : undefined);
      else if (c.type === "form") ctx.openForm?.(c.form_id, c.element_id);
      else if (c.type === "game") ctx.openGame?.(c.game_id, c.element_id);
    });
    return b;
  };
}

function addToCalendar(ctx: Ctx<AddToCalendarComponent>): HTMLElement {
  const { comp: c, el, win } = ctx;
  const b = el(ctx.doc, "button", { type: "button", class: "cs-btn" }, c.label);
  b.addEventListener("click", () => {
    click(ctx, c);
    const ics = buildIcs(c, ctx.clock.now());
    if (typeof win.URL?.createObjectURL !== "function") return;
    const url = win.URL.createObjectURL(new win.Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = el(ctx.doc, "a", { href: url, download: `${c.id}.ics` });
    ctx.doc.body.append(a);
    a.click();
    a.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  });
  return b;
}

function gif(ctx: Ctx<GifComponent>): HTMLElement {
  const { comp: c } = ctx;
  return ctx.el(ctx.doc, "img", { class: "cs-gif", src: c.url, alt: c.decorative ? "" : (c.alt ?? ""), "aria-hidden": c.decorative ? "true" : null, decoding: "async", loading: "lazy" });
}

/** Páginas ya vistas por producto: un `product_viewed` por página (no por cada toque). */
const viewedOnce = new WeakMap<object, Set<string>>();

/** Historia, página y componente actuales: lo que viaja con el carrito para atribuir ingresos. */
function commerceContext(ctx: ComponentCtx, componentId: string): StoryCommerceContext {
  const s = ctx.viewer.getState();
  return { storyId: s.group?.id ?? "", ...(s.page?.id ? { slideId: s.page.id } : {}), componentId };
}

/** Comercio: vio un producto (una vez por página), lo añadió al carrito o a favoritos. La app decide el carrito. */
function trackProduct(ctx: ComponentCtx, kind: "product_viewed" | "add_to_cart" | "wishlist_added", componentId: string, product: ProductRef, quantity = 1): boolean {
  if (kind === "product_viewed") {
    const seen = viewedOnce.get(ctx.viewer) ?? viewedOnce.set(ctx.viewer, new Set()).get(ctx.viewer)!;
    const key = `${ctx.viewer.getState().epoch}:${componentId}:${productKey(product)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    ctx.viewer.track({ type: "product_viewed", componentId, product });
  } else if (kind === "add_to_cart") {
    ctx.viewer.track({ type: "add_to_cart", componentId, product, quantity });
    ctx.onAddToCart?.(product, quantity, commerceContext(ctx, componentId));
  } else {
    ctx.viewer.track({ type: "wishlist_added", componentId, product });
    ctx.onWishlist?.(product, commerceContext(ctx, componentId));
  }
  return true;
}

// ─── Comercio: la referencia viaja en la historia; precio y stock los resuelve el hook ─────────

/** Resuelve las referencias una vez y avisa a cada pintor; un fallo del hook deja la referencia sin precio. */
function withProducts(ctx: ComponentCtx, refs: ProductRef[], paint: (by: Map<string, ResolvedProduct>) => void): void {
  if (!ctx.resolveProducts) return;
  let dead = false;
  ctx.cleanup(() => void (dead = true));
  ctx.resolveProducts(refs).then(
    (list) => !dead && paint(new Map(list.map((p) => [productKey(p.ref), p]))),
    () => undefined,
  );
}

const lookup = (by: Map<string, ResolvedProduct>, r: ProductRef): ResolvedProduct | undefined => by.get(productKey(r)) ?? by.get(productKey({ connector: r.connector, external_id: r.external_id }));

function productTag(ctx: Ctx<ProductTagComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const title = el(ctx.doc, "span", { class: "cs-product__title" }, c.label ?? "");
  const price = el(ctx.doc, "span", { class: "cs-product__price" });
  const btn = el(ctx.doc, "button", { type: "button", class: "cs-product", "aria-label": c.label ?? m.openProduct }, title, price);
  let resolved: ResolvedProduct | undefined;
  withProducts(ctx, [c.product], (by) => {
    resolved = lookup(by, c.product);
    if (!resolved) return;
    title.textContent = c.label ?? resolved.title;
    price.textContent = c.show_price && resolved.available ? formatPrice(resolved.price, ctx.locale) : resolved.available ? "" : m.soldOut;
    btn.setAttribute("aria-label", [c.label ?? resolved.title, price.textContent].filter(Boolean).join(", "));
  });
  btn.addEventListener("click", () => {
    trackProduct(ctx, "product_viewed", c.id, c.product);
    click(ctx, c);
    if (resolved?.url) ctx.open({ type: "url", url: resolved.url }, c.element_id);
  });
  return btn;
}

function productCards(ctx: Ctx<ProductCardsComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const list = el(ctx.doc, "ul", { class: "cs-cards", "data-layout": c.layout, role: "list", ...(c.title ? { "aria-label": c.title } : {}) });
  const cards = c.products.map((ref) => {
    const title = el(ctx.doc, "span", { class: "cs-product__title" }, ref.external_id);
    const price = el(ctx.doc, "span", { class: "cs-product__price" });
    const img = el(ctx.doc, "img", { class: "cs-cards__img", alt: "", hidden: true, loading: "lazy" });
    const btn = el(ctx.doc, "button", { type: "button", class: "cs-card" }, img, title, price);
    return { ref, btn, title, price, img, url: undefined as string | undefined };
  });
  withProducts(ctx, c.products, (by) => {
    for (const card of cards) {
      const r = lookup(by, card.ref);
      if (!r) continue;
      card.title.textContent = r.title;
      card.price.textContent = r.available ? (c.show_price ? formatPrice(r.price, ctx.locale) : "") : m.soldOut;
      card.url = r.url;
      if (r.image_url) {
        card.img.src = r.image_url;
        card.img.alt = r.image_alt ?? "";
        card.img.hidden = false;
      }
      card.btn.setAttribute("aria-label", [r.title, card.price.textContent].filter(Boolean).join(", "));
    }
  });
  for (const card of cards) {
    card.btn.addEventListener("click", () => {
      trackProduct(ctx, "product_viewed", c.id, card.ref);
      if (card.url) ctx.open({ type: "url", url: card.url });
    });
    list.append(el(ctx.doc, "li", {}, card.btn));
  }
  return el(ctx.doc, "div", { class: "cs-cards-wrap" }, c.title ? el(ctx.doc, "p", { class: "cs-poll__q" }, c.title) : null, list);
}

function cart(ctx: Ctx<CartComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const btn = el(ctx.doc, "button", { type: "button", class: "cs-btn" }, c.label);
  withProducts(ctx, [c.product], (by) => {
    if (lookup(by, c.product)?.available === false) {
      btn.disabled = true;
      btn.textContent = m.soldOut;
    }
  });
  btn.addEventListener("click", () => {
    // El carrito lo decide el backend de la app: el visor avisa (`onAddToCart`) y registra el evento.
    if (!trackProduct(ctx, "add_to_cart", c.id, c.product, c.quantity)) return;
    btn.textContent = m.added;
    btn.disabled = true;
    ctx.say(m.added);
  });
  return btn;
}

function wishlist(ctx: Ctx<WishlistComponent>, m: ComponentMessages): HTMLElement {
  const { comp: c, el } = ctx;
  const btn = el(ctx.doc, "button", { type: "button", class: "cs-wish", "aria-pressed": "false", "aria-label": c.label ?? m.wishlist }, el(ctx.doc, "span", { "aria-hidden": "true" }, "♥"));
  btn.addEventListener("click", () => {
    if (!trackProduct(ctx, "wishlist_added", c.id, c.product)) return;
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("aria-label", m.wishlisted);
    btn.disabled = true;
    ctx.say(m.wishlisted);
  });
  return btn;
}

// ─── Registro ───────────────────────────────────────────────────────────────

/** Los pintores de la Ola 2. `overrides` cambia textos (idioma propio, marca). */
export function createComponentRegistry(overrides?: Partial<ComponentMessages>): ComponentRegistry {
  /** Cada pintor recibe los textos del idioma de la página, con las sobrescrituras. */
  const text = <C extends import("../types").StoryComponent>(fn: (ctx: Ctx<C>, m: ComponentMessages) => HTMLElement | null) => (ctx: Ctx<C>): HTMLElement | null => fn(ctx, messagesFor(ctx.locale, overrides));
  return {
    quiz: text(quiz),
    emoji_reaction: text(emojiReaction),
    emoji_slider: text(emojiSlider),
    rating: text(rating),
    question: text(question),
    share: text(share),
    timestamp,
    call: action(),
    whatsapp: action(),
    map: action(),
    form: action((ctx) => !ctx.openForm),
    game: action((ctx) => !ctx.openGame),
    add_to_calendar: addToCalendar,
    gif,
    product_tag: text(productTag),
    product_cards: text(productCards),
    cart: text(cart),
    wishlist: text(wishlist),
  } as ComponentRegistry;
}

export const components: ComponentRegistry = createComponentRegistry();
export type { ComponentCtx, ComponentRegistry, ComponentRenderer, ComponentsLoader } from "./component-api";
