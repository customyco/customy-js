import { createBannerController, type BannerController, type BannerEvent, type DismissReason } from "../banner";
import type { ComponentAction, DeliveredBanner } from "../types";
import { fmt } from "../messages";
import { applyTheme, defaultOpenLink, el, icon, resolveUi, type UiOptions } from "./util";

export type BannerUiOptions = UiOptions & {
  banner: DeliveredBanner;
  onEvent?: (event: BannerEvent) => void;
  openLink?: (action: ComponentAction, ctx: { bannerId: string; slideId: string; elementId?: string }) => void;
  onDismiss?: (reason: DismissReason) => void;
  /** Registrar la impresión al montar en vez de al ser visible (por defecto: al ser visible ≥ 50 %). */
  immediateImpression?: boolean;
};

export type BannerHandle = { element: HTMLElement; controller: BannerController; destroy(): void };

/**
 * Banner (4:3 | 16:9 | 1:1 | 2:1): una imagen o un carrusel con barra o puntos, autoavance
 * pausable (botón visible; hover/foco/pestaña oculta también pausan; con `prefers-reduced-motion`
 * empieza pausado), descartable y sin autocierre salvo que la campaña lo pida.
 */
export function mountBanner(container: HTMLElement, options: BannerUiOptions): BannerHandle {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const { banner } = options;
  const slides = banner.slides ?? [];
  const style = banner.style;
  const multi = style.carousel && slides.length > 1;

  const controller = createBannerController({
    banner,
    clock: options.clock,
    reducedMotion,
    locale: options.locale,
    messages: options.messages,
    onEvent: options.onEvent,
    openLink: options.openLink ?? ((a) => defaultOpenLink(a, win, options.allowedSchemes)),
  });
  const m = controller.messages;

  const root = el(doc, "section", {
    class: "cs-banner cs-root",
    dir: rtl ? "rtl" : "ltr",
    role: "region",
    "aria-roledescription": multi ? "carousel" : null,
    "aria-label": banner.name || m.banner,
    "data-aspect": style.aspect,
    "data-banner-id": banner.id,
    style: { "--cs-radius": `${style.corner_radius}px` },
  });
  applyTheme(root, options.theme);
  const track = el(doc, "div", { class: "cs-banner__track", "aria-live": "off", style: { position: "absolute", inset: "0" } });

  const slideEls = slides.map((s, i) => {
    const href = s.action?.type === "url" ? s.action.url : s.action?.type === "deep_link" ? s.action.uri : undefined;
    const content = [el(doc, "img", { src: s.image.url, alt: s.image.alt, loading: i === 0 ? "eager" : "lazy", decoding: "async" }), s.title ? el(doc, "span", { class: "cs-banner__title" }, s.title) : null];
    const attrs = { class: "cs-banner__slide", role: multi ? "group" : null, "aria-roledescription": multi ? "slide" : null, "aria-label": multi ? fmt(m.slideOf, { n: i + 1, total: slides.length }) : null, hidden: i !== 0, "data-slide-id": s.id };
    const node = href ? el(doc, "a", { ...attrs, href }, ...content) : el(doc, "div", attrs, ...content);
    node.addEventListener("click", (e) => {
      if (!href) return controller.activate();
      e.preventDefault();
      controller.activate();
    });
    return node;
  });
  track.append(...slideEls);
  root.append(track);

  const ctl = (cls: string, label: string, glyph: string): HTMLButtonElement => el(doc, "button", { type: "button", class: `cs-ctl cs-banner__ctl cs-banner__ctl--${cls}`, "aria-label": label }, icon(doc, glyph));
  const dismissBtn = style.dismissible ? ctl("dismiss", m.dismiss, "close") : null;
  const playBtn = style.autoplay.enabled && multi ? ctl("play", m.pauseAutoplay, "pause") : null;
  const prevBtn = multi ? ctl("prev", m.previous, "prev") : null;
  const nextBtn = multi ? ctl("next", m.next, "next") : null;
  const dots = multi && style.progress !== "none" ? el(doc, "div", { class: `cs-dots${style.progress === "bar" ? " cs-dots--bar" : ""}` }) : null;
  const dotEls = dots ? slides.map((_, i) => el(doc, "button", { type: "button", class: "cs-dot", "aria-label": fmt(m.goToSlide, { n: i + 1 }), "aria-current": i === 0 ? "true" : "false" })) : [];
  dots?.append(...dotEls);
  for (const n of [dismissBtn, playBtn, prevBtn, nextBtn, dots]) if (n) root.append(n);

  dismissBtn?.addEventListener("click", () => controller.dismiss("user"));
  playBtn?.addEventListener("click", () => controller.toggleAutoplay());
  prevBtn?.addEventListener("click", () => controller.prev("tap"));
  nextBtn?.addEventListener("click", () => controller.next("tap"));
  dotEls.forEach((d, i) => d.addEventListener("click", () => controller.goTo(i)));

  // Swipe horizontal
  let downX: number | null = null;
  root.addEventListener("pointerdown", (e) => (downX = e.clientX));
  root.addEventListener("pointerup", (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (Math.abs(dx) < 48) return;
    if ((dx < 0) !== rtl) controller.next("swipe");
    else controller.prev("swipe");
  });
  root.addEventListener("keydown", (e) => {
    if (!multi) return;
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === next) controller.next("keyboard");
    else if (e.key === prev) controller.prev("keyboard");
  });
  // Pausas: puntero, foco y pestaña oculta.
  root.addEventListener("mouseenter", () => controller.pause("hover"));
  root.addEventListener("mouseleave", () => controller.resume("hover"));
  root.addEventListener("focusin", () => controller.pause("focus"));
  root.addEventListener("focusout", () => controller.resume("focus"));
  const onVisibility = (): void => (doc.hidden ? controller.pause("hidden") : controller.resume("hidden"));
  doc.addEventListener("visibilitychange", onVisibility);

  const unsub = controller.subscribe(() => {
    const s = controller.getState();
    if (s.dismissed) {
      destroy();
      options.onDismiss?.(s.dismissReason ?? "user");
      return;
    }
    slideEls.forEach((n, i) => (n.hidden = i !== s.index));
    dotEls.forEach((d, i) => d.setAttribute("aria-current", String(i === s.index)));
    // En automático no se anuncia (sería ruido); en manual o en pausa, sí.
    track.setAttribute("aria-live", s.autoplaying ? "off" : "polite");
    if (playBtn) {
      playBtn.setAttribute("aria-label", s.autoplaying ? m.pauseAutoplay : m.playAutoplay);
      playBtn.setAttribute("aria-pressed", String(!s.autoplaying));
      playBtn.replaceChildren(icon(doc, s.autoplaying ? "pause" : "play"));
    }
  });

  let observer: IntersectionObserver | null = null;
  container.append(root);
  const IO = (win as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
  if (options.immediateImpression || !IO) controller.show();
  else {
    observer = new IO(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          controller.show();
          observer?.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(root);
  }

  function destroy(): void {
    observer?.disconnect();
    unsub();
    doc.removeEventListener("visibilitychange", onVisibility);
    controller.destroy();
    root.remove();
  }
  return { element: root, controller, destroy };
}
