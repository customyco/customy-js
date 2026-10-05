import type { StoryCommerceContext } from "../commerce";
import { animationCssValue, countdownParts, resolveAnimations } from "../animation";
import { pageDurationMs, systemClock } from "../clock";
import { createGestureRecognizer, type GestureIntent } from "../gestures";
import { componentBox, fontPx, layerBox, sortByZ, viewportFit, type Viewport } from "../layout";
import { createPreloader, type Preloader } from "../preload";
import type { SeenTracker } from "../seen";
import type { ButtonComponent, CountdownComponent, PollComponent, ProductRef, PromoCodeComponent, ResolvedProduct, StoryComponent, StoryGroup, StoryLayer, StoryPage } from "../types";
import { createStoryViewer, viewableGroups, type CloseReason, type StoryViewer, type ViewerEvent } from "../viewer";
import { evaluateVisibility } from "../visibility";
import { fmt } from "../messages";
import type { ComponentCtx, ComponentRegistry, ComponentRenderer, ComponentsLoader } from "./component-api";
import { applyTheme, browserAssetLoader, defaultOpenLink, el, frameLoop, icon, resolveUi, type UiOptions } from "./util";
import type { LottieInstance, LottieLoader } from "./lottie-types";

/** Una acción extra sobre la página actual (hoja modal con foco atrapado): el visor pone el «⋯» y la hoja, el contenido es del módulo (p. ej. UGC: reportar / bloquear). */
export type PageAction = { label: string; title?: string; build(ctx: { doc: Document; close(): void; say(text: string): void }): HTMLElement };
export type PageActionsProvider = (ctx: { group: StoryGroup; page: StoryPage }) => PageAction | null;

export type StoryViewerUiOptions = UiOptions & {
  groups: readonly StoryGroup[];
  /** Grupo por el que abrir; por defecto el primero. */
  startGroupId?: string;
  startPageId?: string;
  seen?: SeenTracker;
  /** `false` = sin precarga (pruebas); por defecto, la del navegador. */
  preloader?: Preloader | false;
  onEvent?: (event: ViewerEvent) => void;
  openLink?: Parameters<typeof createStoryViewer>[0]["openLink"];
  onClose?: (reason: CloseReason) => void;
  /** URL a compartir de la página actual; sin ella y sin `navigator.share`, el botón no aparece. */
  shareUrl?: (ctx: { group: StoryGroup; page: StoryPage }) => string | undefined;
  /** El usuario activó el recordatorio de una cuenta atrás (opt-in): la app programa el aviso. */
  onReminder?: (component: CountdownComponent, remindAtIso: string) => void;
  /** Módulo opcional de Lottie (ver `@customyai/stories-render/lottie`). */
  loadLottie?: LottieLoader;
  /**
   * Componentes de la Ola 2 (quiz, reacciones, valoración, pregunta, llamar/WhatsApp/mapa, calendario,
   * GIF, comercio…): `import { components } from "@customyai/stories-render/components"`. Sin ellos se
   * omiten sin romper la página.
   */
  components?: ComponentRegistry;
  /** Lo mismo, cargado bajo demanda: `() => import("@customyai/stories-render/components").then((m) => m.components)`. */
  loadComponents?: ComponentsLoader;
  /** Un `form` de Customy Forms (por id): la app decide cómo abrirlo (hoja, navegación…). Sin él, el componente no se pinta. */
  openForm?: (formId: string, ctx: { groupId: string; pageId: string; elementId?: string }) => void;
  /** Un `game` del Game Center (por id): la app lo abre, p. ej. con `openGameDialog` de `./widgets/game`. Sin él, el componente no se pinta. */
  openGame?: (gameId: string, ctx: { groupId: string; pageId: string; elementId?: string }) => void;
  /** Comercio: precio y stock en vivo de unas referencias (lo pone el agente de comercio). Sin él, se pinta solo la referencia. */
  resolveProducts?: (refs: ProductRef[]) => Promise<ResolvedProduct[]>;
  /** El carrito lo decide el backend de la app: el visor solo avisa (y registra `add_to_cart`). */
  /** `context` = historia, página y componente que lo pusieron en el carrito: escribirlo en los atributos del carrito (`storyCartAttributes`) y leerlo al cerrar la compra (`readStoryContext`). */
  onAddToCart?: (product: ProductRef, quantity: number, context?: StoryCommerceContext) => void;
  onWishlist?: (product: ProductRef, context?: StoryCommerceContext) => void;
  /** Ola 4: acciones por página (reportar / no ver más a esta persona en historias de la comunidad: `ugcPageActions` de `./ugc`). */
  pageActions?: PageActionsProvider;
  /** Dónde insertar el `<dialog>`. Por defecto `document.body`. */
  container?: HTMLElement;
};

export type StoryViewerHandle = { controller: StoryViewer; element: HTMLDialogElement; close(reason?: CloseReason): void };

/**
 * Visor modal de historias sobre `<dialog>` (foco atrapado, `Esc` y `inert` del resto por el
 * navegador). Teclado: ←/→ página (espejado en RTL), Espacio pausa, Esc cierra. Táctil: tercios,
 * mantener, swipes. Botón de pausa siempre visible; con `prefers-reduced-motion` arranca en pausa.
 */
export function openStoryViewer(options: StoryViewerUiOptions): StoryViewerHandle {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const clock = options.clock ?? systemClock;
  const groups = viewableGroups(options.groups);
  const preloader = options.preloader === false ? undefined : (options.preloader ?? createPreloader({ load: browserAssetLoader(win), clock }));
  const opener = doc.activeElement as HTMLElement | null;

  const viewer = createStoryViewer({
    groups,
    startGroupId: options.startGroupId,
    startPageId: options.startPageId,
    seen: options.seen,
    preloader,
    clock,
    reducedMotion,
    rtl,
    locale: options.locale,
    messages: options.messages,
    onEvent: options.onEvent,
    openLink: options.openLink ?? ((action) => defaultOpenLink(action, win, options.allowedSchemes)),
    onClose: (reason) => {
      teardown();
      options.onClose?.(reason);
    },
  });
  const m = viewer.messages;

  // ── Esqueleto ────────────────────────────────────────────────────────────
  const dialog = el(doc, "dialog", { class: "cs-viewer cs-root", dir: rtl ? "rtl" : "ltr", "aria-label": groups[0] ? fmt(m.viewer, { title: groups[0].title }) : m.storyBar });
  applyTheme(dialog, options.theme);
  const stage = el(doc, "div", { class: "cs-stage", tabindex: 0 });
  const pageEl = el(doc, "div", { class: "cs-page" });
  const segs = el(doc, "div", { class: "cs-progress", role: "progressbar", "aria-label": m.progress, "aria-valuemin": 1 });
  const stateEl = el(doc, "div", { class: "cs-state", "aria-hidden": "true" });
  const announce = el(doc, "div", { class: "cs-sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const notice = el(doc, "div", { class: "cs-sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });

  const who = el(doc, "div", { class: "cs-chrome__who" });
  const ctl = (label: string, glyph: string, extra: Record<string, string | boolean> = {}) => {
    const b = el(doc, "button", { type: "button", class: "cs-ctl", "aria-label": label, ...extra }, icon(doc, glyph));
    return b;
  };
  const pauseBtn = ctl(m.pause, "pause");
  const muteBtn = ctl(m.unmute, "volume-off", { hidden: true });
  const ccBtn = ctl(m.captionsOff, "cc", { hidden: true, "aria-pressed": "true" });
  const canShare = !!options.shareUrl || typeof win.navigator?.share === "function";
  const shareBtn = ctl(m.share, "share", { hidden: !canShare });
  const moreBtn = ctl("", "more", { hidden: true, "aria-haspopup": "dialog" });
  const closeBtn = ctl(m.close, "close");
  const chrome = el(doc, "div", { class: "cs-chrome" }, who, pauseBtn, muteBtn, ccBtn, shareBtn, moreBtn, closeBtn);
  // Sponsored (Ola 2): fixed label on every page; it opens the transparency sheet.
  const sponsorBtn = el(doc, "button", { type: "button", class: "cs-sponsor", hidden: true, "aria-haspopup": "dialog" });
  const sheet = el(doc, "div", { class: "cs-sheet", hidden: true });
  const prevBtn = el(doc, "button", { type: "button", class: "cs-nav cs-nav--prev", "aria-label": m.previous });
  const nextBtn = el(doc, "button", { type: "button", class: "cs-nav cs-nav--next", "aria-label": m.next });
  stage.append(pageEl, stateEl, segs, chrome, sponsorBtn, prevBtn, nextBtn, sheet, announce, notice);
  dialog.append(stage);
  (options.container ?? doc.body).append(dialog);

  // ── Estado de la página pintada ──────────────────────────────────────────
  let vp: Viewport = viewportFit(win.innerWidth, win.innerHeight);
  let renderedEpoch = -1;
  let layoutFns: ((vp: Viewport) => void)[] = [];
  let pageCleanups: (() => void)[] = [];
  let videos: HTMLVideoElement[] = [];
  let primary: HTMLVideoElement | null = null;
  let muted = true;
  let captionsOn = true;
  let lastAnnouncement = "";
  let segEls: HTMLElement[] = [];
  let torn = false;
  let registry: ComponentRegistry | undefined = options.components;
  let compVis: (() => void)[] = [];
  let lastResponses: unknown = null;
  let sheetOpen = false;
  let sheetOpener: HTMLElement = sponsorBtn;
  let pageAction: PageAction | null = null;

  function applyViewport(): void {
    vp = viewportFit(win.innerWidth, win.innerHeight);
    stage.style.inlineSize = `${vp.width}px`;
    stage.style.blockSize = `${vp.height}px`;
    for (const fn of layoutFns) fn(vp);
  }

  function renderPage(group: StoryGroup, page: StoryPage): void {
    for (const c of pageCleanups) c();
    pageCleanups = [];
    layoutFns = [];
    videos = [];
    primary = null;
    pageEl.replaceChildren();
    compVis = [];
    const dur = pageDurationMs(page);
    const bg = page.background;
    if (bg?.type === "image") {
      pageEl.append(el(doc, "img", { class: "cs-bg", src: bg.url, alt: bg.decorative ? "" : (bg.alt ?? ""), "aria-hidden": bg.decorative ? "true" : null, "data-fit": bg.fit, decoding: "async" }));
    } else if (bg?.type === "video") {
      const v = videoEl(bg.url, bg.poster, bg.muted, false, bg.captions, bg.decorative ? undefined : bg.alt);
      v.className = "cs-bg";
      v.setAttribute("data-fit", bg.fit);
      primary = v;
      pageEl.append(v);
    } else if (bg?.type === "color") {
      const c = el(doc, "div", { class: "cs-bg", "aria-hidden": "true" });
      c.style.background = bg.color;
      pageEl.append(c);
    }
    for (const layer of sortByZ(page.canvas.layers)) pageEl.append(layerEl(layer, dur));
    for (const comp of sortByZ(page.canvas.components)) {
      const node = componentEl(page, comp);
      if (node) pageEl.append(node);
    }
    wireVideo();
    muteBtn.hidden = videos.length === 0;
    ccBtn.hidden = !videos.some((v) => v.querySelector("track"));
    who.replaceChildren(el(doc, "img", { src: group.cover.url, alt: "" }), el(doc, "span", {}, group.title));
    paintSponsor(group);
    pageAction = options.pageActions?.({ group, page }) ?? null;
    moreBtn.hidden = !pageAction;
    if (pageAction) moreBtn.setAttribute("aria-label", pageAction.label);
    compVis.forEach((f) => f());
    applyViewport();
  }

  function videoEl(url: string, poster: string, isMuted: boolean, loop: boolean, captions: { lang: string; label?: string; url: string }[], label?: string): HTMLVideoElement {
    const v = el(doc, "video", { src: url, poster, playsinline: true, preload: "auto", "aria-label": label, "aria-hidden": label ? null : "true" });
    v.muted = muted && isMuted !== false ? true : muted;
    v.loop = loop;
    captions.forEach((c, i) => v.append(el(doc, "track", { kind: "captions", src: c.url, srclang: c.lang, label: c.label ?? c.lang, ...(i === 0 ? { default: true } : {}) })));
    videos.push(v);
    return v;
  }

  function layerEl(layer: StoryLayer, dur: number): HTMLElement {
    const inner = el(doc, "div", { class: "cs-layer__in", "data-type": layer.type });
    const outer = el(doc, "div", { class: "cs-layer", "data-layer": layer.id }, inner);
    outer.style.zIndex = String(layer.z);
    outer.style.opacity = String(layer.opacity);
    if (layer.rotation) outer.style.transform = `rotate(${layer.rotation}deg)`;
    const anims = resolveAnimations(layer.animations, { reducedMotion, pageDurationMs: dur });
    if (anims.length) inner.style.animation = animationCssValue(anims);
    const alt = layer.decorative ? "" : (layer.alt ?? "");
    switch (layer.type) {
      case "text": {
        inner.dataset.align = layer.align;
        inner.dataset.weight = layer.weight;
        if (layer.color) inner.style.color = layer.color;
        if (layer.background) inner.style.background = layer.background;
        else inner.dataset.shadow = "1";
        inner.textContent = layer.text;
        layoutFns.push((v) => (inner.style.fontSize = `${fontPx(layer.font_size, v)}px`));
        break;
      }
      case "image":
      case "sticker":
        inner.append(el(doc, "img", { src: layer.url, alt, "aria-hidden": layer.decorative ? "true" : null, decoding: "async" }));
        if (layer.type === "image") outer.dataset.fit = layer.fit;
        break;
      case "video": {
        const v = videoEl(layer.url, layer.poster, layer.muted, layer.loop, layer.captions, layer.decorative ? undefined : layer.alt);
        outer.dataset.fit = layer.fit;
        if (!primary) primary = v;
        inner.append(v);
        break;
      }
      case "shape": {
        if (layer.fill) inner.style.background = layer.fill;
        if (layer.shape === "ellipse") inner.style.borderRadius = "50%";
        else if (layer.radius) inner.style.borderRadius = `${layer.radius * 100}%`;
        inner.setAttribute("aria-hidden", "true");
        layoutFns.push((v) => {
          inner.style.border = layer.stroke && layer.stroke_width ? `${Math.max(1, layer.stroke_width * v.width)}px solid ${layer.stroke}` : "";
        });
        break;
      }
      case "lottie": {
        inner.setAttribute("role", "img");
        if (alt) inner.setAttribute("aria-label", alt);
        else inner.setAttribute("aria-hidden", "true");
        const load = options.loadLottie;
        if (load) {
          let dead = false;
          let inst: LottieInstance | undefined;
          load()
            .then((factory) => factory(inner, layer.url, { loop: layer.loop, autoplay: !reducedMotion }))
            .then((i) => {
              if (dead) i.destroy();
              else inst = i;
            })
            .catch(() => undefined);
          pageCleanups.push(() => {
            dead = true;
            inst?.destroy();
          });
        }
        break;
      }
    }
    layoutFns.push((v) => {
      const b = layerBox(layer, v);
      Object.assign(outer.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    });
    return outer;
  }

  function componentEl(page: StoryPage, comp: StoryComponent): HTMLElement | null {
    let content: HTMLElement | null = null;
    switch (comp.type) {
      case "button":
        content = buttonEl(comp);
        break;
      case "poll":
        content = pollEl(comp);
        break;
      case "countdown":
        content = countdownEl(comp);
        break;
      case "promo_code":
        if (comp.valid_until && Date.parse(comp.valid_until) < clock.now()) return null;
        content = promoEl(comp);
        break;
      default: {
        // Ola 2: el módulo opcional pinta el resto; sin él (o si no lo conoce) se omite sin romper la página.
        const draw = registry?.[comp.type] as ComponentRenderer | undefined;
        content = draw ? draw(ctxFor(comp)) : null;
        if (!content) return null;
      }
    }
    const box = el(doc, "div", { class: "cs-comp", "data-cs-interactive": "1", "data-component": comp.id }, content);
    if (comp.visibility) {
      const upd = (): void => void (box.hidden = evaluateVisibility(comp.visibility, answersNow()) === false);
      upd();
      compVis.push(upd);
    }
    box.style.zIndex = String(100 + comp.z);
    layoutFns.push((v) => {
      const b = componentBox(comp, v, page.canvas.safe_zone);
      Object.assign(box.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, minHeight: `${b.height}px` });
    });
    return box;
  }

  const answersNow = () => ({ ...viewer.getState().group?.answers, ...viewer.getState().responses });

  const at = (): { groupId: string; pageId: string } => ({ groupId: viewer.getState().group?.id ?? "", pageId: viewer.getState().page?.id ?? "" });

  function ctxFor<C extends StoryComponent>(comp: C): ComponentCtx<C> {
    return { comp, doc, win, viewer, m, locale: options.locale, rtl, reducedMotion, clock, el, say, cleanup: (fn) => void pageCleanups.push(fn), answers: answersNow, resolveProducts: options.resolveProducts, onAddToCart: options.onAddToCart, onWishlist: options.onWishlist, open: (action, elementId) => (options.openLink ?? ((a) => defaultOpenLink(a, win, options.allowedSchemes)))(action, { ...at(), elementId }), ...(options.openForm ? { openForm: (id, elementId) => options.openForm?.(id, { ...at(), elementId }) } : {}), ...(options.openGame ? { openGame: (id, elementId) => options.openGame?.(id, { ...at(), elementId }) } : {}) };
  }

  // ── Patrocinado: etiqueta superior + hoja de transparencia (role=dialog, foco atrapado, Esc la cierra) ──
  function paintSponsor(group: StoryGroup): void {
    const sp = group.mode === "sponsored" ? group.sponsor : undefined;
    sponsorBtn.hidden = !sp;
    if (!sp) {
      closeSheet(false);
      return;
    }
    sponsorBtn.replaceChildren(el(doc, "b", {}, sp.label), ` · ${sp.name}`);
    sponsorBtn.setAttribute("aria-label", `${sp.label}: ${sp.name}. ${m.sponsorInfo}`);
    const t = sp.transparency;
    const rows = ([[m.advertiser, t.advertiser ?? sp.name], [m.payer, t.payer]] as const).filter((r): r is readonly [string, string] => !!r[1]);
    sheet.replaceChildren(
      el(doc, "div", { class: "cs-sheet__panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "cs-sheet-title" },
        el(doc, "h2", { id: "cs-sheet-title", class: "cs-sheet__title" }, m.sponsorSheet),
        el(doc, "p", { class: "cs-sheet__text" }, t.text),
        ...rows.map(([k, v]) => el(doc, "p", { class: "cs-sheet__row" }, el(doc, "b", {}, `${k}: `), v)),
        t.url ? el(doc, "a", { class: "cs-sheet__link", href: t.url, target: "_blank", rel: "noopener noreferrer" }, m.learnMore) : null,
        el(doc, "button", { type: "button", class: "cs-btn cs-sheet__close" }, m.close),
      ),
    );
    sheet.querySelector(".cs-sheet__close")?.addEventListener("click", () => closeSheet(true));
  }

  function openSheet(): void {
    if (sheetOpen || sponsorBtn.hidden) return;
    sheetOpener = sponsorBtn;
    sheetOpen = true;
    sheet.hidden = false;
    viewer.pause("sheet");
    for (const n of [pageEl, chrome, segs, prevBtn, nextBtn, sponsorBtn]) n.setAttribute("inert", "");
    sheet.querySelector<HTMLElement>(".cs-sheet__close")?.focus();
  }

  function closeSheet(restoreFocus: boolean): void {
    if (!sheetOpen) return;
    sheetOpen = false;
    sheet.hidden = true;
    for (const n of [pageEl, chrome, segs, prevBtn, nextBtn, sponsorBtn]) n.removeAttribute("inert");
    viewer.resume("sheet");
    if (restoreFocus) sheetOpener.focus();
  }

  /** «⋯»: la hoja del módulo que pone la acción (misma hoja modal que la de transparencia). */
  function openPageAction(): void {
    const action = pageAction;
    if (sheetOpen || !action) return;
    sheet.replaceChildren(
      el(doc, "div", { class: "cs-sheet__panel", role: "dialog", "aria-modal": "true", "aria-label": action.title ?? action.label },
        action.build({ doc, close: () => closeSheet(true), say }),
        el(doc, "button", { type: "button", class: "cs-btn cs-sheet__close" }, m.close)),
    );
    sheet.querySelector(".cs-sheet__close")?.addEventListener("click", () => closeSheet(true));
    sheetOpener = moreBtn;
    sheetOpen = true;
    sheet.hidden = false;
    viewer.pause("sheet");
    for (const n of [pageEl, chrome, segs, prevBtn, nextBtn, sponsorBtn]) n.setAttribute("inert", "");
    sheet.querySelector<HTMLElement>("input, textarea, button")?.focus();
  }

  function buttonEl(c: ButtonComponent): HTMLElement {
    if (c.style === "swipe_up") {
      const b = el(doc, "button", { type: "button", class: "cs-swipe" }, el(doc, "span", { class: "cs-swipe__chev" }, icon(doc, "up", 22)), el(doc, "span", {}, c.label));
      b.addEventListener("click", () => viewer.activateButton(c.id));
      return b;
    }
    const b = el(doc, "button", { type: "button", class: "cs-btn" }, c.label);
    if (c.background) b.style.background = c.background;
    if (c.color) b.style.color = c.color;
    b.addEventListener("click", () => viewer.activateButton(c.id));
    return b;
  }

  function pollEl(c: PollComponent): HTMLElement {
    const qid = `cs-q-${c.id}`;
    const root = el(doc, "div", { class: "cs-poll", role: "group", "aria-labelledby": qid }, el(doc, "p", { class: "cs-poll__q", id: qid }, c.question));
    const opts = el(doc, "div", { class: "cs-poll__opts" });
    const buttons = c.options.map((o) => {
      const b = el(doc, "button", { type: "button", class: "cs-poll__opt", "aria-pressed": "false" }, o.label);
      b.addEventListener("click", () => {
        if (!viewer.answerPoll(c.id, o.id)) return;
        buttons.forEach((x, i) => {
          x.disabled = true;
          x.setAttribute("aria-pressed", String(c.options[i]?.id === o.id));
        });
        root.append(el(doc, "p", { class: "cs-poll__thanks", role: "status" }, m.pollThanks));
      });
      return b;
    });
    opts.append(...buttons);
    root.append(opts);
    return root;
  }

  function countdownEl(c: CountdownComponent): HTMLElement {
    const time = el(doc, "span", { class: "cs-countdown__time", role: "timer", "aria-live": "off" });
    const root = el(doc, "div", { class: "cs-countdown" }, c.label ? el(doc, "span", { class: "cs-countdown__label" }, c.label) : null, time);
    const tick = (): void => {
      const p = countdownParts(c.ends_at, clock.now());
      time.textContent = p.done ? m.countdownDone : `${p.days > 0 ? `${p.days}d ` : ""}${String(p.hours).padStart(2, "0")}:${String(p.minutes).padStart(2, "0")}:${String(p.seconds).padStart(2, "0")}`;
    };
    tick();
    const t = win.setInterval(tick, 1000);
    pageCleanups.push(() => win.clearInterval(t));
    if (c.reminder.enabled && !countdownParts(c.ends_at, clock.now()).done) {
      const chip = el(doc, "button", { type: "button", class: "cs-chip", "aria-pressed": "false" }, c.reminder.label ?? m.reminderOn);
      chip.addEventListener("click", () => {
        if (!viewer.optInReminder(c.id)) return;
        chip.setAttribute("aria-pressed", "true");
        chip.textContent = m.reminderSet;
        chip.disabled = true;
        options.onReminder?.(c, new Date(Date.parse(c.ends_at) - c.reminder.offset_minutes * 60_000).toISOString());
        say(m.reminderSet);
      });
      root.append(chip);
    }
    return root;
  }

  function promoEl(c: PromoCodeComponent): HTMLElement {
    const copy = el(doc, "button", { type: "button", class: "cs-chip" }, c.copy_label || m.copy);
    const root = el(doc, "div", { class: "cs-promo", role: "group", "aria-label": c.label ?? c.code }, el(doc, "span", { class: "cs-promo__code" }, c.code), copy);
    copy.addEventListener("click", () => {
      viewer.copyPromo(c.id);
      void copyText(c.code).then(() => {
        copy.textContent = m.copied;
        say(m.copied);
        const t = win.setTimeout(() => (copy.textContent = c.copy_label || m.copy), 2000);
        pageCleanups.push(() => win.clearTimeout(t));
      });
    });
    return root;
  }

  async function copyText(text: string): Promise<void> {
    try {
      await win.navigator.clipboard.writeText(text);
    } catch {
      const ta = el(doc, "textarea", { "aria-hidden": "true", readonly: true, style: { position: "fixed", opacity: "0" } });
      ta.value = text;
      doc.body.append(ta);
      ta.select();
      try {
        doc.execCommand("copy");
      } catch {
        /* sin portapapeles: el código queda a la vista para copiarlo a mano */
      }
      ta.remove();
    }
  }

  function say(text: string): void {
    notice.textContent = "";
    // El cambio de nodo de texto en el siguiente ciclo hace que el lector repita el mismo mensaje.
    win.setTimeout(() => (notice.textContent = text), 20);
  }

  // ── Vídeo ────────────────────────────────────────────────────────────────
  function wireVideo(): void {
    for (const v of videos) {
      v.muted = muted;
      const tracks = v.textTracks;
      for (let i = 0; i < (tracks?.length ?? 0); i++) {
        const track = tracks[i];
        if (track) track.mode = captionsOn ? "showing" : "hidden";
      }
    }
    const p = primary;
    if (!p) return;
    p.addEventListener("timeupdate", () => viewer.mediaTime(p.currentTime * 1000, Number.isFinite(p.duration) ? p.duration * 1000 : undefined));
    p.addEventListener("ended", () => viewer.mediaEnded());
    p.addEventListener("waiting", () => viewer.mediaBuffering(true));
    p.addEventListener("playing", () => viewer.mediaBuffering(false));
    p.addEventListener("error", () => viewer.mediaFailed());
  }

  function syncPlayback(playing: boolean): void {
    for (const v of videos) {
      if (playing) {
        // Autoplay rechazado (política del navegador): se sigue con el póster y el temporizador.
        const r = v.play?.();
        if (r && typeof r.catch === "function") r.catch(() => (v === primary ? viewer.mediaFailed() : undefined));
      } else v.pause?.();
    }
  }

  // ── Render reactivo ──────────────────────────────────────────────────────
  function buildSegments(total: number): void {
    segs.replaceChildren();
    segEls = [];
    for (let i = 0; i < total; i++) {
      const fill = el(doc, "i", { class: "cs-progress__fill" });
      segs.append(el(doc, "span", { class: "cs-progress__seg", "aria-hidden": "true" }, fill));
      segEls.push(fill);
    }
    segs.setAttribute("aria-valuemax", String(total));
  }

  function onState(): void {
    if (torn) return;
    const s = viewer.getState();
    if (!s.open || !s.group || !s.page) return;
    // Ramificación: los segmentos cuentan solo las páginas que se pueden mostrar; una respuesta puede añadir o quitar.
    if (segEls.length !== s.visibleCount) buildSegments(s.visibleCount);
    if (s.epoch !== renderedEpoch) {
      renderedEpoch = s.epoch;
      dialog.setAttribute("aria-label", fmt(m.viewer, { title: s.group.title }));
      renderPage(s.group, s.page);
    }
    segs.setAttribute("aria-valuenow", String(s.visibleIndex + 1));
    segs.setAttribute("aria-valuetext", fmt(m.pageOf, { n: s.visibleIndex + 1, total: s.visibleCount }));
    if (s.responses !== lastResponses) {
      lastResponses = s.responses;
      compVis.forEach((f) => f());
    }
    if (s.announcement !== lastAnnouncement) {
      lastAnnouncement = s.announcement;
      announce.textContent = s.announcement;
    }
    const paused = s.snapshot.state === "paused" || s.userPaused;
    stage.toggleAttribute("data-paused", paused);
    stage.toggleAttribute("data-ui-hidden", s.uiHidden);
    stateEl.replaceChildren(...(s.snapshot.state === "loading" ? [el(doc, "div", { class: "cs-spinner" })] : []));
    const userPaused = s.userPaused;
    pauseBtn.setAttribute("aria-label", userPaused ? m.play : m.pause);
    pauseBtn.setAttribute("aria-pressed", String(userPaused));
    pauseBtn.replaceChildren(icon(doc, userPaused ? "play" : "pause"));
    syncPlayback(s.snapshot.state === "playing");
  }
  viewer.subscribe(onState);

  const stopFrames = frameLoop(win, () => {
    const s = viewer.getState();
    if (!s.open) return;
    const p = viewer.progress();
    segEls.forEach((fill, i) => {
      const v = i < s.visibleIndex ? 1 : i === s.visibleIndex ? p : 0;
      fill.style.transform = `scaleX(${v})`;
    });
  });

  // ── Entrada ──────────────────────────────────────────────────────────────
  const gestures = createGestureRecognizer({
    rtl,
    clock,
    onIntent(i: GestureIntent) {
      switch (i.type) {
        case "tap":
          if (i.direction === "next") viewer.next("tap");
          else if (i.direction === "prev") viewer.prev("tap");
          break;
        case "hold-start":
          viewer.hold(true);
          break;
        case "hold-end":
          viewer.hold(false);
          break;
        case "swipe-group":
          if (i.direction === "next") viewer.nextGroup();
          else viewer.prevGroup();
          break;
        case "swipe-down":
          viewer.close("swipe");
          break;
        case "swipe-up":
          viewer.swipeUp();
          break;
      }
    },
  });
  const interactive = (t: EventTarget | null): boolean => t instanceof win.Element && !!t.closest("[data-cs-interactive], .cs-chrome, .cs-nav, .cs-sponsor, .cs-sheet");
  const local = (e: PointerEvent): { x: number; y: number; width: number } => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, width: r.width || vp.width };
  };
  stage.addEventListener("pointerdown", (e) => {
    if (interactive(e.target)) return;
    gestures.pointerDown(local(e));
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => gestures.pointerMove(local(e)));
  stage.addEventListener("pointerup", (e) => {
    if (interactive(e.target)) return gestures.pointerCancel();
    gestures.pointerUp(local(e));
  });
  stage.addEventListener("pointercancel", () => gestures.pointerCancel());
  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  pauseBtn.addEventListener("click", () => viewer.togglePause());
  closeBtn.addEventListener("click", () => viewer.close("user"));
  prevBtn.addEventListener("click", () => viewer.prev("keyboard"));
  nextBtn.addEventListener("click", () => viewer.next("keyboard"));
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    for (const v of videos) v.muted = muted;
    muteBtn.setAttribute("aria-label", muted ? m.unmute : m.mute);
    muteBtn.replaceChildren(icon(doc, muted ? "volume-off" : "volume"));
  });
  ccBtn.addEventListener("click", () => {
    captionsOn = !captionsOn;
    for (const v of videos) for (let i = 0; i < (v.textTracks?.length ?? 0); i++) if (v.textTracks[i]) v.textTracks[i]!.mode = captionsOn ? "showing" : "hidden";
    ccBtn.setAttribute("aria-pressed", String(captionsOn));
    ccBtn.setAttribute("aria-label", captionsOn ? m.captionsOff : m.captionsOn);
  });
  shareBtn.addEventListener("click", () => {
    const s = viewer.getState();
    if (!s.group || !s.page) return;
    const url = options.shareUrl?.({ group: s.group, page: s.page });
    viewer.share(url ? "link" : "native");
    void win.navigator.share?.({ title: s.group.title, ...(url ? { url } : {}) }).catch(() => undefined);
  });

  sponsorBtn.addEventListener("click", openSheet);
  moreBtn.addEventListener("click", openPageAction);
  dialog.addEventListener("keydown", (e) => {
    if (sheetOpen) {
      // The sheet is modal: Esc closes only it, Tab stays inside, the story's keys do nothing.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeSheet(true);
      } else if (e.key === "Tab") {
        const f = Array.from(sheet.querySelectorAll<HTMLElement>("a[href], button"));
        const first = f[0];
        const last = f[f.length - 1];
        if (first && last && e.shiftKey && doc.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (first && last && !e.shiftKey && doc.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }
    // Escribiendo (pregunta abierta) o moviendo un deslizador: las teclas son del campo, salvo Esc.
    if (e.key !== "Escape" && (e.target instanceof win.HTMLTextAreaElement || e.target instanceof win.HTMLInputElement || e.target instanceof win.HTMLSelectElement)) return;
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === next) {
      e.preventDefault();
      viewer.next("keyboard");
    } else if (e.key === prev) {
      e.preventDefault();
      viewer.prev("keyboard");
    } else if (e.key === "Escape") {
      e.preventDefault();
      viewer.close("keyboard");
    } else if ((e.key === " " || e.key === "Spacebar") && !(e.target instanceof win.HTMLButtonElement) && !(e.target instanceof win.HTMLAnchorElement)) {
      e.preventDefault();
      viewer.togglePause();
    }
  });
  // `Esc` nativo del <dialog>: lo gestiona el visor (registra el cierre).
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (sheetOpen) closeSheet(true);
    else viewer.close("keyboard");
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) viewer.close("user");
  });
  const onVisibility = (): void => (doc.hidden ? viewer.pause("hidden") : viewer.resume("hidden"));
  doc.addEventListener("visibilitychange", onVisibility);
  const onResize = (): void => applyViewport();
  win.addEventListener("resize", onResize);

  function teardown(): void {
    if (torn) return;
    torn = true;
    stopFrames();
    for (const c of pageCleanups) c();
    pageCleanups = [];
    for (const v of videos) v.pause?.();
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("resize", onResize);
    gestures.destroy();
    try {
      if (dialog.open) dialog.close();
    } catch {
      /* ya cerrado */
    }
    dialog.remove();
    viewer.destroy();
    opener?.focus?.();
  }

  if (!registry && options.loadComponents) {
    options
      .loadComponents()
      .then((r) => {
        registry = r;
        const s = viewer.getState();
        if (!torn && s.open && s.group && s.page) renderPage(s.group, s.page);
      })
      .catch(() => undefined);
  }
  applyViewport();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  viewer.open();
  onState();
  stage.focus();

  return { controller: viewer, element: dialog, close: (reason = "app") => viewer.close(reason) };
}
