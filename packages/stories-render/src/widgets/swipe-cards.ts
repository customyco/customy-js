import { systemClock } from "../clock";
import { applyTheme } from "../dom/util";
import type { ComponentAction, DeliveredSwipeCards, ProductRef, ResolvedProduct, SwipeCard, WidgetProgress } from "../types";
import { defaultOpenLink, el, linkNode, onVisible, resolveUi, safeColor, widgetElementId, widgetEmitter, widgetIcon, widgetRoot, type WidgetControllerBase, type WidgetEvent, type WidgetHandle } from "./common";
import type { StoryCommerceContext } from "../commerce";
import { swipeCardsMessages, fmt, type WidgetMessages } from "./messages";

/**
 * Swipe Cards: tarjetas de producto estilo Tinder (derecha = me gusta, izquierda = descartar), hasta 100.
 * `createSwipeDeck` es el controlador puro (mazo, decisiones, eventos); `mountSwipeCards` lo pinta con gesto,
 * teclado (flechas) y botones: el gesto nunca es el único camino (WCAG 2.5.1). Lo ya deslizado no se deshace:
 * con `remember_swipes`, el servidor y el almacén local lo sacan del mazo.
 */

/** Clave estable de un producto (`connector:external_id[#variante]`): la misma que guarda el servidor. */
export const swipeKey = (p: ProductRef): string => `${p.connector}:${p.external_id}${p.variant_id ? `#${p.variant_id}` : ""}`;

export type SwipeDirection = "left" | "right";
export type SwipeVia = "gesture" | "button" | "keyboard";

export type SwipeDeckOptions = {
  entry: DeliveredSwipeCards;
  /** Lo ya hecho por la persona (de `client.bindWidget(...).progress`). */
  progress?: WidgetProgress;
  onEvent?: (e: WidgetEvent) => void;
  /** El segundo argumento es el contexto de historia/widget para los atributos del carrito (`storyCartAttributes`). */
  onWishlist?: (ref: ProductRef, context?: StoryCommerceContext) => void;
  onAddToCart?: (ref: ProductRef, context?: StoryCommerceContext & { quantity: number }) => void;
  /** «Abrir» el producto del me gusta (`swipe_right: "open"`). */
  onOpen?: (ref: ProductRef) => void;
};

export type SwipeDeck = {
  /** Lo que queda por decidir (la primera es la de arriba). */
  readonly remaining: readonly SwipeCard[];
  readonly top: SwipeCard | null;
  readonly liked: readonly SwipeCard[];
  readonly total: number;
  readonly done: boolean;
  swipe(direction: SwipeDirection, via: SwipeVia): SwipeCard | null;
  /** La tarjeta de arriba se ve: emite `product_viewed` una vez por producto (la llama quien pinta tras el primer render; el mazo la repite solo tras cada deslizamiento). */
  seeTop(): void;
  subscribe(listener: () => void): () => void;
};

export function createSwipeDeck(options: SwipeDeckOptions): SwipeDeck {
  const { entry } = options;
  const cfg = entry.config;
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const seen = new Set(cfg.remember_swipes ? options.progress?.swiped ?? [] : []);
  const cards = (entry.items ?? []).filter((c) => !seen.has(swipeKey(c.product))).slice(0, cfg.limit ?? 100);
  let index = 0;
  const liked: SwipeCard[] = [];
  const listeners = new Set<() => void>();
  let completed = false;
  const seenTop = new Set<string>();
  const deck: SwipeDeck = {
    get remaining() { return cards.slice(index); },
    get top() { return cards[index] ?? null; },
    get liked() { return liked; },
    total: cards.length,
    get done() { return index >= cards.length; },
    seeTop() {
      const c = cards[index];
      if (!c || seenTop.has(swipeKey(c.product))) return;
      seenTop.add(swipeKey(c.product));
      emit({ type: "product", name: "product_viewed", product: c.product });
    },
    swipe(direction, via) {
      const card = cards[index];
      if (!card) return null;
      emit({ type: "swipe", direction, via, product: card.product, position: Math.min(99, index) });
      if (direction === "right") {
        liked.push(card);
        const a = cfg.swipe_right;
        if (a === "wishlist") {
          emit({ type: "product", name: "wishlist_added", product: card.product });
          options.onWishlist?.(card.product, { storyId: entry.id, componentId: "cards" });
        } else if (a === "add_to_cart") {
          emit({ type: "product", name: "add_to_cart", product: card.product, quantity: 1 });
          options.onAddToCart?.(card.product, { storyId: entry.id, componentId: "cards", quantity: 1 });
        } else if (a === "open") options.onOpen?.(card.product);
      }
      index += 1;
      if (index >= cards.length && !completed) {
        completed = true;
        emit({ type: "complete" });
      }
      deck.seeTop();
      listeners.forEach((l) => l());
      return card;
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  return deck;
}

export type SwipeCardsOptions = WidgetControllerBase & {
  entry: DeliveredSwipeCards;
  progress?: WidgetProgress;
  /** Precio, título e imagen en vivo (el agente de comercio). Sin él, solo titular o referencia. */
  resolveProducts?: (refs: ProductRef[]) => Promise<ResolvedProduct[]>;
  onWishlist?: (ref: ProductRef, context?: StoryCommerceContext) => void;
  onAddToCart?: (ref: ProductRef, context?: StoryCommerceContext & { quantity: number }) => void;
  openLink?: (action: ComponentAction, ctx: { widgetId: string; elementId: string; product?: ProductRef }) => void;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
};

const THRESHOLD = 80;
const ICON_FOR = { heart: "heart", check: "check", thumb_up: "thumb_up", star: "star", x: "close", thumb_down: "thumb_down", skip: "next" } as const;

export function mountSwipeCards(container: HTMLElement, options: SwipeCardsOptions): WidgetHandle & { deck: SwipeDeck } {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const clock = options.clock ?? systemClock;
  const m: WidgetMessages = swipeCardsMessages(options.locale, options.messages);
  const emit = widgetEmitter(entry.id, entry.variant_id, options.onEvent);
  const open = (a: ComponentAction, elementId: string, product?: ProductRef): void => (options.openLink ?? ((x) => defaultOpenLink(x, win, options.allowedSchemes)))(a, { widgetId: entry.id, elementId, ...(product ? { product } : {}) });
  const resolved = new Map<string, ResolvedProduct>();

  const deck = createSwipeDeck({
    entry,
    progress: options.progress,
    onEvent: options.onEvent,
    onWishlist: options.onWishlist,
    onAddToCart: options.onAddToCart,
    onOpen: (ref) => {
      const url = resolved.get(swipeKey(ref))?.url;
      if (url) open(url.startsWith("http") || url.startsWith("/") ? { type: "url", url } : { type: "deep_link", uri: url }, widgetElementId(entry.id, `open_${ref.external_id}`.slice(0, 40)), ref);
    },
  });

  const bg = safeColor(cfg.feedback.like.color), bgNo = safeColor(cfg.feedback.nope.color);
  const root = widgetRoot(doc, "swipe_cards", entry.id, m.cards, { dir: rtl ? "rtl" : "ltr", "data-layout": cfg.layout, "data-aspect": cfg.aspect, style: { "--cs-radius": `${cfg.corner_radius}px`, ...(bg ? { "--cs-like": bg } : {}), ...(bgNo ? { "--cs-nope": bgNo } : {}) } });
  applyTheme(root, options.theme);
  const helpId = `cs-help-${entry.id}`;
  const help = el(doc, "p", { class: "cs-swipe__help cs-sr", id: helpId }, m.cardsHelp);
  const live = el(doc, "div", { class: "cs-sr", "aria-live": "polite", "aria-atomic": "true", role: "status" });
  const stage = el(doc, "div", { class: "cs-swipe__stage", tabindex: 0, role: "group", "aria-roledescription": "carousel", "aria-label": m.cards, "aria-describedby": helpId });
  const actions = el(doc, "div", { class: "cs-swipe__actions" });
  const nope = el(doc, "button", { type: "button", class: "cs-swipe__btn cs-swipe__btn--nope", "aria-label": cfg.feedback.nope.label }, widgetIcon(doc, ICON_FOR[cfg.feedback.nope.icon], 24));
  const like = el(doc, "button", { type: "button", class: "cs-swipe__btn cs-swipe__btn--like", "aria-label": cfg.feedback.like.label }, widgetIcon(doc, ICON_FOR[cfg.feedback.like.icon], 24));
  actions.append(nope, like);
  root.append(help, live, stage, actions);
  container.append(root);

  const titleOf = (c: SwipeCard): string => resolved.get(swipeKey(c.product))?.title ?? c.headline ?? c.product.external_id;
  let busy = false;
  let drag: { id: number; x0: number; dx: number; card: HTMLElement } | null = null;

  function cardEl(c: SwipeCard, depth: number, n: number): HTMLElement {
    const r = resolved.get(swipeKey(c.product));
    const card = el(doc, "article", { class: "cs-swipe__card", "data-depth": depth, "data-card-key": swipeKey(c.product), "aria-hidden": depth === 0 ? null : "true", "aria-label": depth === 0 ? fmt(m.cardOf, { n, total: deck.total }) : null });
    if (r?.image_url) card.append(el(doc, "img", { src: r.image_url, alt: r.image_alt ?? r.title, draggable: "false", decoding: "async" }));
    const body = el(doc, "div", { class: "cs-swipe__body" });
    if (c.badge) body.append(el(doc, "span", { class: "cs-swipe__badge" }, c.badge));
    body.append(el(doc, "h3", { class: "cs-swipe__title" }, titleOf(c)));
    if (c.headline && r) body.append(el(doc, "p", { class: "cs-swipe__headline" }, c.headline));
    if (cfg.show_price && r?.price) body.append(el(doc, "p", { class: "cs-swipe__price" }, r.price.formatted ?? `${r.price.amount} ${r.price.currency}`));
    if (r && !r.available) body.append(el(doc, "span", { class: "cs-swipe__badge cs-swipe__badge--off" }, m.unavailableProduct));
    card.append(body);
    if (depth === 0 && cfg.feedback.show_stamps) {
      card.append(el(doc, "span", { class: "cs-swipe__stamp cs-swipe__stamp--like", "aria-hidden": "true" }, cfg.feedback.like.label), el(doc, "span", { class: "cs-swipe__stamp cs-swipe__stamp--nope", "aria-hidden": "true" }, cfg.feedback.nope.label));
    }
    return card;
  }

  function renderEnd(): void {
    const end = el(doc, "div", { class: "cs-swipe__end", tabindex: -1 }, el(doc, "h3", { class: "cs-swipe__end-title" }, cfg.end.title || m.endTitle), cfg.end.message ? el(doc, "p", {}, cfg.end.message) : null);
    if (cfg.end.show_liked && deck.liked.length > 0) {
      end.append(el(doc, "h4", { class: "cs-swipe__liked-title" }, m.likedList));
      const ul = el(doc, "ul", { class: "cs-swipe__liked" });
      for (const c of deck.liked) ul.append(el(doc, "li", {}, titleOf(c)));
      end.append(ul);
    }
    if (cfg.end.cta) {
      const cta = cfg.end.cta;
      const node = linkNode(doc, "button", cta.action, { class: "cs-widget__cta" }, () => {
        emit({ type: "click", elementId: cta.element_id });
        open(cta.action, cta.element_id);
      });
      node.append(cta.label);
      end.append(node);
    }
    stage.replaceChildren(end);
    actions.hidden = true;
  }

  function render(): void {
    if (deck.done) return renderEnd();
    const rem = deck.remaining;
    const depthMax = cfg.layout === "stack" ? Math.min(3, rem.length) : 1;
    const els: HTMLElement[] = [];
    for (let d = depthMax - 1; d >= 0; d--) els.push(cardEl(rem[d]!, d, deck.total - rem.length + 1));
    stage.replaceChildren(...els);
    const empty = !rem.length;
    nope.disabled = like.disabled = empty;
  }

  function decide(direction: SwipeDirection, via: SwipeVia): void {
    if (busy || deck.done) return;
    const top = stage.querySelector<HTMLElement>('[data-depth="0"]');
    const card = deck.top!;
    const finish = (): void => {
      busy = false;
      deck.swipe(direction, via);
      live.textContent = fmt(direction === "right" ? m.liked : m.skipped, { title: titleOf(card) });
      render();
      if (deck.done) stage.querySelector<HTMLElement>(".cs-swipe__end")?.focus();
    };
    if (reducedMotion || !top) return finish();
    busy = true;
    top.style.transition = "transform .2s ease, opacity .2s ease";
    top.style.transform = `translateX(${direction === "right" ? 120 : -120}%) rotate(${direction === "right" ? 12 : -12}deg)`;
    top.style.opacity = "0";
    clock.setTimeout(finish, 200);
  }

  nope.addEventListener("click", () => decide("left", "button"));
  like.addEventListener("click", () => decide("right", "button"));
  stage.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    decide(e.key === "ArrowRight" ? "right" : "left", "keyboard");
  });

  const stamp = (card: HTMLElement, dx: number): void => {
    const k = Math.min(1, Math.abs(dx) / THRESHOLD);
    const l = card.querySelector<HTMLElement>(".cs-swipe__stamp--like"), n = card.querySelector<HTMLElement>(".cs-swipe__stamp--nope");
    if (l) l.style.opacity = dx > 0 ? String(k) : "0";
    if (n) n.style.opacity = dx < 0 ? String(k) : "0";
  };
  stage.addEventListener("pointerdown", (e) => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>('[data-depth="0"]');
    if (!card || busy || !e.isPrimary) return;
    drag = { id: e.pointerId, x0: e.clientX, dx: 0, card };
    card.style.transition = "none";
    card.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0;
    drag.card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 20}deg)`;
    stamp(drag.card, drag.dx);
  });
  const end = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, card } = drag;
    drag = null;
    if (e.type !== "pointercancel" && Math.abs(dx) >= THRESHOLD) {
      card.style.transform = "";
      decide(dx > 0 ? "right" : "left", "gesture");
    } else {
      card.style.transition = reducedMotion ? "none" : "transform .15s ease";
      card.style.transform = "";
      stamp(card, 0);
    }
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  render();
  deck.seeTop();
  const stopVisible = onVisible(win, root, () => emit({ type: "impression" }));

  // Precio, título e imagen en vivo: una sola llamada con el mazo entero (≤ 100).
  let dead = false;
  if (options.resolveProducts && deck.total > 0) {
    options.resolveProducts(deck.remaining.map((c) => c.product)).then(
      (list) => {
        if (dead) return;
        for (const r of list) resolved.set(swipeKey(r.ref), r);
        if (!busy && !deck.done) render();
      },
      () => undefined,
    );
  }
  return {
    element: root,
    deck,
    destroy() {
      dead = true;
      stopVisible();
      root.remove();
    },
  };
}
