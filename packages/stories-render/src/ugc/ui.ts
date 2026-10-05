import { el, resolveUi, type UiOptions } from "../dom/util";
import { safeHttpsUrl } from "../safe-url";
import type { PageActionsProvider } from "../dom/viewer";
import type { StoryCommunity } from "../types";
import { UGC_REPORT_REASONS, UgcError, type UgcClient, type UgcMedia, type UgcOwnItem, type UgcReportReason } from "./client";
import { fmt, resolveUgcMessages, type UgcMessages } from "./messages";

/**
 * Las tres superficies de las historias de la comunidad, en DOM plano (sin dependencias, accesibles con teclado):
 *   · `ugcPageActions` — «⋯» del visor en las páginas de la comunidad: reportar (con motivo) y no ver más a esa persona.
 *   · `mountUgcComposer` — el formulario de «comparte tu historia»: medio, pie, descripción, firma y términos versionados.
 *   · `mountUgcMine` — «mis historias»: estado, motivo de cada decisión, reclamar, borrar y descargar los propios datos.
 * Todo el texto del usuario entra por `textContent` (nunca como HTML).
 */
type Common = UiOptions & { messages?: Partial<UgcMessages> };

/** El mensaje que ve la persona para un error del cliente (el servidor no pone texto de interfaz). */
export function ugcErrorText(error: unknown, m: UgcMessages): string {
  if (!(error instanceof UgcError)) return m.errGeneric;
  switch (error.code) {
    case "terms_outdated": return m.errTermsOutdated;
    case "rejected_by_filter": return fmt(m.errFilter, { field: error.field === "alt" ? m.fieldAlt : error.field === "author_label" ? m.fieldAuthorLabel : m.fieldCaption, });
    case "video_not_accepted": return m.errVideo;
    case "ugc_rate_limited": return m.errRate;
    case "ugc_disabled": return m.errDisabled;
    case "ugc_unavailable_minors": return m.errMinors;
    case "author_blocked": return m.errBlocked;
    case "media_rejected": return m.errMedia;
    case "media_not_ready": return m.errMediaNotReady;
    case "ugc_media_unavailable": return m.errUnavailable;
    case "terms_not_accepted": return m.acceptTerms;
    default: return m.errGeneric;
  }
}

// ── Reportar y bloquear (hoja del visor) ───────────────────────────────────

export function ugcPageActions(options: Common & { client: Pick<UgcClient, "report" | "blockAuthor">; onDone?: (what: "reported" | "blocked", itemId: string) => void }): PageActionsProvider {
  const m = resolveUgcMessages(options.locale, options.messages);
  return ({ page, group }) => {
    const ugc = page.ugc;
    if (!ugc?.reportable) return null;
    return {
      label: m.more,
      title: m.communityStory,
      build: ({ doc, close, say }) => {
        let reason: UgcReportReason | null = null;
        const status = el(doc, "p", { class: "cs-ugc__status", role: "status", "aria-live": "polite" });
        const detail = el(doc, "textarea", { class: "cs-ugc__input", rows: 2, maxlength: 500, "aria-label": m.reportDetail, placeholder: m.reportDetail });
        const send = el(doc, "button", { type: "button", class: "cs-btn", disabled: true }, m.reportSend);
        const radios = UGC_REPORT_REASONS.map((r) => {
          const input = el(doc, "input", { type: "radio", name: "cs-ugc-reason", value: r });
          input.addEventListener("change", () => { reason = r; send.removeAttribute("disabled"); });
          return el(doc, "label", { class: "cs-ugc__radio" }, input, m.reasons[r]);
        });
        const fail = (e: unknown) => { status.textContent = ugcErrorText(e, m); send.removeAttribute("disabled"); };
        send.addEventListener("click", () => {
          if (!reason) return;
          send.setAttribute("disabled", "");
          options.client.report(ugc.item_id, reason, detail.value).then(() => { say(m.reportThanks); options.onDone?.("reported", ugc.item_id); close(); }, fail);
        });
        const block = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.blockAuthor);
        block.addEventListener("click", () => {
          block.setAttribute("disabled", "");
          options.client.blockAuthor(ugc.item_id).then(() => { say(m.blockedThanks); options.onDone?.("blocked", ugc.item_id); close(); }, (e) => { block.removeAttribute("disabled"); fail(e); });
        });
        const cancel = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.cancel);
        cancel.addEventListener("click", close);
        return el(doc, "div", { class: "cs-ugc" },
          ugc.author_label ? el(doc, "p", { class: "cs-sheet__row" }, fmt(m.communityBy, { name: ugc.author_label })) : el(doc, "p", { class: "cs-sheet__row" }, group.title),
          el(doc, "fieldset", { class: "cs-ugc__reasons" }, el(doc, "legend", { class: "cs-sheet__title" }, m.reportTitle), ...radios),
          detail, status,
          el(doc, "div", { class: "cs-ugc__row" }, send, block, cancel));
      },
    };
  };
}

// ── «Comparte tu historia» ─────────────────────────────────────────────────

export type UgcComposerOptions = Common & {
  groupId: string;
  community: StoryCommunity;
  client: Pick<UgcClient, "submit">;
  /** La app (o el SDK de Storage) sube el archivo y devuelve la referencia ya escaneada; el renderer no sube bytes. */
  uploadMedia: (file: File) => Promise<UgcMedia>;
  onSubmitted?: () => void;
};

export function mountUgcComposer(host: HTMLElement, options: UgcComposerOptions): { destroy(): void } {
  const { doc } = resolveUi(options);
  const m = resolveUgcMessages(options.locale, options.messages);
  const c = options.community;
  let file: File | null = null;
  let busy = false;
  const status = el(doc, "p", { class: "cs-ugc__status", role: "status", "aria-live": "polite" });
  const chosen = el(doc, "span", { class: "cs-ugc__chosen" });
  const picker = el(doc, "input", { type: "file", class: "cs-sr-only", accept: c.accept_video ? "image/*,video/*" : "image/*" });
  const pickLabel = el(doc, "label", { class: "cs-btn cs-btn--ghost" }, m.chooseMedia, picker);
  const caption = el(doc, "textarea", { class: "cs-ugc__input", rows: 3, maxlength: c.max_caption_length, "aria-describedby": "cs-ugc-count" });
  const count = el(doc, "span", { id: "cs-ugc-count", class: "cs-ugc__count", "aria-hidden": "true" }, fmt(m.captionCount, { n: 0, max: c.max_caption_length }));
  const alt = el(doc, "input", { type: "text", class: "cs-ugc__input", maxlength: 300, "aria-describedby": "cs-ugc-alt-hint" });
  const label = el(doc, "input", { type: "text", class: "cs-ugc__input", maxlength: 30 });
  const terms = el(doc, "input", { type: "checkbox" });
  const submit = el(doc, "button", { type: "submit", class: "cs-btn", disabled: true }, m.submit);
  const field = (text: string, input: HTMLElement, hint?: HTMLElement) => el(doc, "label", { class: "cs-ugc__field" }, el(doc, "span", {}, text), input, hint);
  const form = el(doc, "form", { class: "cs-ugc cs-ugc--composer", "aria-label": m.composerTitle, novalidate: true },
    el(doc, "h2", { class: "cs-sheet__title" }, m.composerTitle),
    el(doc, "div", { class: "cs-ugc__row" }, pickLabel, chosen),
    field(m.caption, caption, count),
    field(m.alt, alt, el(doc, "small", { id: "cs-ugc-alt-hint" }, m.altHint)),
    field(m.authorLabel, label, el(doc, "small", {}, m.authorLabelHint)),
    el(doc, "label", { class: "cs-ugc__radio" }, terms, m.acceptTerms, " ", safeHttpsUrl(c.terms_url) ? el(doc, "a", { href: safeHttpsUrl(c.terms_url), target: "_blank", rel: "noopener noreferrer" }, m.readTerms) : null),
    submit, status);
  const refresh = () => { if (busy) return; if (file && terms.checked) submit.removeAttribute("disabled"); else submit.setAttribute("disabled", ""); };
  picker.addEventListener("change", () => { file = picker.files?.[0] ?? null; chosen.textContent = file ? fmt(m.mediaChosen, { name: file.name }) : ""; refresh(); });
  terms.addEventListener("change", refresh);
  caption.addEventListener("input", () => { count.textContent = fmt(m.captionCount, { n: caption.value.length, max: c.max_caption_length }); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!file || !terms.checked || busy) return;
    busy = true;
    submit.setAttribute("disabled", "");
    status.textContent = m.submitting;
    options.uploadMedia(file)
      .then((media) => options.client.submit(options.groupId, c, { media, caption: caption.value, alt: alt.value, authorLabel: label.value, termsAccepted: terms.checked }))
      .then(() => { status.textContent = m.submitted; options.onSubmitted?.(); }, (err) => { status.textContent = ugcErrorText(err, m); })
      .finally(() => { busy = false; refresh(); });
  });
  host.append(form);
  return { destroy: () => form.remove() };
}

// ── «Mis historias» ────────────────────────────────────────────────────────

export type UgcMineOptions = Common & {
  client: Pick<UgcClient, "mine" | "remove" | "appeal" | "exportMine">;
  /** Recibe el JSON de «descargar mis datos»; sin él se descarga como archivo. */
  onExport?: (data: Record<string, unknown>) => void;
};

export function mountUgcMine(host: HTMLElement, options: UgcMineOptions): { reload(): Promise<void>; destroy(): void } {
  const { doc, win } = resolveUi(options);
  const m = resolveUgcMessages(options.locale, options.messages);
  const root = el(doc, "section", { class: "cs-ugc cs-ugc--mine", "aria-label": m.mineTitle });
  const list = el(doc, "ul", { class: "cs-ugc__list" });
  const status = el(doc, "p", { class: "cs-ugc__status", role: "status", "aria-live": "polite" });
  const exportBtn = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.exportMine);
  root.append(el(doc, "h2", { class: "cs-sheet__title" }, m.mineTitle), list, status, exportBtn);
  host.append(root);

  const appealLine = (i: UgcOwnItem) => (i.appeal === "open" ? m.appealOpen : i.appeal === "upheld" ? m.appealUpheld : i.appeal === "overturned" ? m.appealOverturned : "");

  function row(i: UgcOwnItem): HTMLElement {
    const reason = i.reason_code ? (m.reasonCodes as Record<string, string>)[i.reason_code] ?? i.reason_code : "";
    const li = el(doc, "li", { class: "cs-ugc__item", "data-status": i.status },
      el(doc, "p", { class: "cs-ugc__title" }, i.caption || m.communityStory, " · ", el(doc, "b", {}, (m.status as Record<string, string>)[i.status] ?? i.status)),
      reason && (i.status === "rejected" || i.status === "removed") ? el(doc, "p", { class: "cs-ugc__reason" }, `${m.reasonLabel}: ${reason}`) : null,
      appealLine(i) ? el(doc, "p", { class: "cs-ugc__reason" }, appealLine(i)) : null);
    const actions = el(doc, "div", { class: "cs-ugc__row" });
    if (i.can_appeal) {
      const open = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.appeal);
      open.addEventListener("click", () => {
        const text = el(doc, "textarea", { class: "cs-ugc__input", rows: 3, maxlength: 1000, "aria-label": m.appealPlaceholder, placeholder: m.appealPlaceholder });
        const send = el(doc, "button", { type: "button", class: "cs-btn" }, m.appealSend);
        send.addEventListener("click", () => {
          send.setAttribute("disabled", "");
          options.client.appeal(i.id, text.value).then(() => { status.textContent = m.appealSent; return reload(); }, (e) => { status.textContent = ugcErrorText(e, m); send.removeAttribute("disabled"); });
        });
        open.replaceWith(text, send);
      });
      actions.append(open);
    }
    const del = el(doc, "button", { type: "button", class: "cs-btn cs-btn--ghost" }, m.delete);
    del.addEventListener("click", () => {
      if (!win.confirm(m.deleteConfirm)) return;
      options.client.remove(i.id).then(() => { status.textContent = m.deleted; return reload(); }, (e) => { status.textContent = ugcErrorText(e, m); });
    });
    actions.append(del);
    li.append(actions);
    return li;
  }

  async function reload(): Promise<void> {
    try {
      const items = await options.client.mine();
      list.replaceChildren(...(items.length ? items.map(row) : [el(doc, "li", { class: "cs-ugc__empty" }, m.mineEmpty)]));
    } catch (e) {
      status.textContent = ugcErrorText(e, m);
    }
  }
  exportBtn.addEventListener("click", () => {
    options.client.exportMine().then((data) => {
      if (options.onExport) return options.onExport(data);
      const url = win.URL.createObjectURL(new win.Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = el(doc, "a", { href: url, download: "customy-community-data.json" });
      a.click();
      win.URL.revokeObjectURL(url);
    }, (e) => { status.textContent = ugcErrorText(e, m); });
  });
  void reload();
  return { reload, destroy: () => root.remove() };
}
