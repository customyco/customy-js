// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { group, page } from "../test-fixtures";
import { openStoryViewer } from "../dom/viewer";
import type { StoryCommunity } from "../types";
import { createUgcClient, precheckSubmission, submissionBody, UgcError, type UgcOwnItem } from "./client";
import { resolveUgcMessages } from "./messages";
import { mountUgcComposer, mountUgcMine, ugcErrorText, ugcPageActions } from "./ui";

const community: StoryCommunity = { terms_version: "v2", terms_url: "https://x.example.com/terms", accept_video: false, max_per_author_per_day: 3, max_caption_length: 100 };
const NOW = Date.UTC(2026, 9, 2, 12);
const image = { kind: "image" as const, url: "https://cdn.example.com/a.jpg" };

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
  document.body.innerHTML = "";
});
afterEach(() => vi.useRealTimers());

const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe("pure helpers", () => {
  it("precheck: terms, video, caption length, something readable for who can't see", () => {
    expect(precheckSubmission(community, { media: image, caption: "hola", termsAccepted: true })).toBeNull();
    expect(precheckSubmission(community, { media: image, caption: "hola", termsAccepted: false })?.code).toBe("terms_not_accepted");
    expect(precheckSubmission(community, { media: { kind: "video", url: "https://c.example.com/v.mp4", poster: "https://c.example.com/p.jpg" }, caption: "x", termsAccepted: true })?.code).toBe("video_not_accepted");
    expect(precheckSubmission(community, { media: image, caption: "x".repeat(101), termsAccepted: true })?.field).toBe("caption");
    expect(precheckSubmission(community, { media: image, termsAccepted: true })?.field).toBe("alt");
    expect(precheckSubmission(community, { media: image, alt: "Un perro", termsAccepted: true })).toBeNull();
  });
  it("the body carries the CURRENT terms version and the time; blanks are left out", () => {
    expect(submissionBody(community, { media: image, caption: " hola ", authorLabel: " ", termsAccepted: true }, NOW)).toEqual({ media: image, caption: "hola", consent: { terms_version: "v2", accepted_at: "2026-10-02T12:00:00.000Z" } });
  });
  it("messages in es, en and pt with the same keys; unknown locale falls back to English", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(resolveUgcMessages("es"))).toEqual(keys(resolveUgcMessages("en")));
    expect(keys(resolveUgcMessages("pt-BR"))).toEqual(keys(resolveUgcMessages("en")));
    expect(resolveUgcMessages("xx").submit).toBe("Send");
    expect(resolveUgcMessages("pt-BR").report).toBe("Denunciar");
    expect(resolveUgcMessages("es", { submit: "Mandar" }).submit).toBe("Mandar");
  });
});

describe("client", () => {
  it("submits with the bearer token, maps refusals to typed errors and retries once on 401 with a fresh token", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(res(201, { id: "i1", status: "pending" }))
      .mockResolvedValueOnce(res(409, { name: "terms_outdated", message: "x", required_terms_version: "v3" }))
      .mockResolvedValueOnce(res(422, { name: "rejected_by_filter", message: "no", field: "caption", item: { id: "i2", status: "rejected", reason_code: "filter" } }))
      .mockResolvedValueOnce(res(503, { name: "ugc_media_unavailable", message: "later" }));
    const token = vi.fn(async (refresh?: boolean) => (refresh ? "fresh" : "stale"));
    const c = createUgcClient({ token, fetch: fetch as never, now: () => NOW });
    expect((await c.submit("g", community, { media: image, caption: "hola", termsAccepted: true })).id).toBe("i1");
    expect(fetch.mock.calls[0]![1].headers.authorization).toBe("Bearer stale");
    expect(fetch.mock.calls[1]![1].headers.authorization).toBe("Bearer fresh");
    expect(fetch.mock.calls[1]![0]).toBe("https://send-api.customy.ai/client/ugc/communities/g/items");
    const outdated = await c.submit("g", community, { media: image, caption: "hola", termsAccepted: true }).catch((e) => e);
    expect(outdated).toBeInstanceOf(UgcError);
    expect([outdated.code, outdated.requiredTermsVersion]).toEqual(["terms_outdated", "v3"]);
    const filtered = await c.submit("g", community, { media: image, caption: "hola", termsAccepted: true }).catch((e) => e);
    expect([filtered.code, filtered.field, filtered.item?.reason_code]).toEqual(["rejected_by_filter", "caption", "filter"]);
    expect((await c.submit("g", community, { media: image, caption: "hola", termsAccepted: true }).catch((e) => e)).code).toBe("ugc_media_unavailable");
  });
  it("a precheck failure never reaches the network; a network failure is typed", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const c = createUgcClient({ token: async () => "t", fetch: fetch as never });
    expect((await c.submit("g", community, { media: image, caption: "x", termsAccepted: false }).catch((e) => e)).code).toBe("terms_not_accepted");
    expect(fetch).not.toHaveBeenCalled();
    expect((await c.mine().catch((e) => e)).code).toBe("network");
  });
});

describe("report / block in the story viewer", () => {
  const ugcPage = page("ugc-1", { ugc: { item_id: "item-9", author_label: "Ana", reportable: true } });
  const open = (client: Parameters<typeof ugcPageActions>[0]["client"]) => openStoryViewer({ groups: [group("com", [], { pages: [page("intro"), ugcPage] })], preloader: false, locale: "es", reducedMotion: false, pageActions: ugcPageActions({ client, locale: "es" }) });
  const more = (dlg: HTMLElement) => dlg.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"].cs-ctl')!;

  it("the «⋯» appears only on community pages, opens a modal sheet, and Esc closes it without closing the story", () => {
    const h = open({ report: vi.fn(), blockAuthor: vi.fn() } as never);
    expect(more(h.element).hidden).toBe(true);
    h.controller.next("keyboard");
    expect(more(h.element).hidden).toBe(false);
    expect(more(h.element).getAttribute("aria-label")).toBe("Más opciones");
    more(h.element).click();
    const sheet = h.element.querySelector<HTMLElement>(".cs-sheet")!;
    expect(sheet.hidden).toBe(false);
    expect(sheet.querySelector('[role="dialog"]')).not.toBeNull();
    expect(sheet.querySelectorAll('input[type="radio"]')).toHaveLength(10);
    h.element.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(sheet.hidden).toBe(true);
    expect(h.controller.getState().open).toBe(true);
    expect(document.activeElement).toBe(more(h.element));
  });

  it("reports with the chosen reason and detail, then closes; blocking calls the client with the item", async () => {
    const report = vi.fn(async () => ({ counted: true, hidden: false }));
    const blockAuthor = vi.fn(async () => ({ already_blocked: false }));
    const h = open({ report, blockAuthor } as never);
    h.controller.next("keyboard");
    more(h.element).click();
    const send = [...h.element.querySelectorAll<HTMLButtonElement>(".cs-ugc .cs-btn")].find((b) => b.textContent === "Enviar reporte")!;
    expect(send.disabled).toBe(true);
    const radio = h.element.querySelector<HTMLInputElement>('input[value="harassment"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    h.element.querySelector<HTMLTextAreaElement>(".cs-ugc textarea")!.value = "me insulta";
    expect(send.disabled).toBe(false);
    send.click();
    await flush();
    expect(report).toHaveBeenCalledWith("item-9", "harassment", "me insulta");
    expect(h.element.querySelector<HTMLElement>(".cs-sheet")!.hidden).toBe(true);
    more(h.element).click();
    [...h.element.querySelectorAll<HTMLButtonElement>(".cs-ugc .cs-btn")].find((b) => b.textContent === "No ver más a esta persona")!.click();
    await flush();
    expect(blockAuthor).toHaveBeenCalledWith("item-9");
  });

  it("a failed report shows the reason and keeps the sheet open", async () => {
    const h = open({ report: vi.fn(async () => { throw new UgcError("network", "offline"); }), blockAuthor: vi.fn() } as never);
    h.controller.next("keyboard");
    more(h.element).click();
    const radio = h.element.querySelector<HTMLInputElement>('input[value="spam"]')!;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    [...h.element.querySelectorAll<HTMLButtonElement>(".cs-ugc .cs-btn")].find((b) => b.textContent === "Enviar reporte")!.click();
    await flush();
    expect(h.element.querySelector(".cs-ugc__status")!.textContent).toBe("No se pudo enviar. Inténtalo otra vez.");
    expect(h.element.querySelector<HTMLElement>(".cs-sheet")!.hidden).toBe(false);
  });
});

describe("composer", () => {
  const mount = (over: Partial<Parameters<typeof mountUgcComposer>[1]> = {}) => {
    const host = document.createElement("div");
    document.body.append(host);
    const client = { submit: vi.fn(async () => ({ id: "i1" }) as UgcOwnItem) };
    const uploadMedia = vi.fn(async () => image);
    mountUgcComposer(host, { groupId: "com", community, client, uploadMedia, locale: "es", ...over });
    return { host, client, uploadMedia };
  };
  const choose = async (host: HTMLElement, file = new File(["x"], "foto.jpg", { type: "image/jpeg" })) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  it("needs a file and the terms; submits the uploaded reference with the terms version; says it will be reviewed", async () => {
    const { host, client, uploadMedia } = mount();
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    await choose(host);
    expect(submit.disabled).toBe(true);
    const terms = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    terms.checked = true;
    terms.dispatchEvent(new Event("change", { bubbles: true }));
    expect(submit.disabled).toBe(false);
    host.querySelector<HTMLTextAreaElement>("textarea")!.value = "Mi playa";
    host.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await flush();
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(client.submit).toHaveBeenCalledWith("com", community, expect.objectContaining({ media: image, caption: "Mi playa", termsAccepted: true }));
    expect(host.querySelector(".cs-ugc__status")!.textContent).toContain("se revisará antes de publicarse");
    expect(host.querySelector<HTMLAnchorElement>("a")!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("the file picker only offers videos when the community accepts them; refusals are explained in the person's language", async () => {
    expect(mount().host.querySelector<HTMLInputElement>('input[type="file"]')!.accept).toBe("image/*");
    expect(mount({ community: { ...community, accept_video: true } }).host.querySelector<HTMLInputElement>('input[type="file"]')!.accept).toBe("image/*,video/*");
    const { host } = mount({ client: { submit: vi.fn(async () => { throw new UgcError("ugc_rate_limited", "x", { status: 429 }); }) } });
    await choose(host);
    const terms = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    terms.checked = true;
    terms.dispatchEvent(new Event("change", { bubbles: true }));
    host.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await flush();
    expect(host.querySelector(".cs-ugc__status")!.textContent).toBe("Llegaste al máximo de envíos de hoy. Vuelve mañana.");
  });

  it("every typed error has its own text", () => {
    const m = resolveUgcMessages("en");
    for (const code of ["terms_outdated", "rejected_by_filter", "video_not_accepted", "ugc_rate_limited", "ugc_disabled", "ugc_unavailable_minors", "author_blocked", "media_rejected", "media_not_ready", "ugc_media_unavailable", "terms_not_accepted"] as const) {
      expect(ugcErrorText(new UgcError(code, "x"), m)).not.toBe(m.errGeneric);
    }
    expect(ugcErrorText(new Error("boom"), m)).toBe(m.errGeneric);
  });
});

describe("my stories", () => {
  const item = (over: Partial<UgcOwnItem>): UgcOwnItem => ({ id: "i", group_id: "com", status: "pending", caption: "Mi foto", media_kind: "image", reason_code: null, reason: null, appeal: "none", can_appeal: false, created_at: "2026-10-02T10:00:00Z", decided_at: null, ...over });
  const mount = (items: UgcOwnItem[], over: Record<string, unknown> = {}) => {
    const host = document.createElement("div");
    document.body.append(host);
    const client = { mine: vi.fn(async () => items), remove: vi.fn(async () => ({ id: "i", deleted: true })), appeal: vi.fn(async () => item({})), exportMine: vi.fn(async () => ({ object: "story_ugc_export" })) };
    const handle = mountUgcMine(host, { client, locale: "es", ...over });
    return { host, client, handle };
  };

  it("shows the state and the reason of a decision, and offers the appeal only when it can", async () => {
    const { host } = mount([item({ id: "a", status: "rejected", reason_code: "off_topic", can_appeal: true }), item({ id: "b", status: "approved" })]);
    await flush();
    const rows = [...host.querySelectorAll("li.cs-ugc__item")];
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["rejected", "approved"]);
    expect(rows[0]!.textContent).toContain("Rechazada");
    expect(rows[0]!.textContent).toContain("Motivo: No es del tema de la comunidad");
    expect(rows[0]!.textContent).toContain("No estoy de acuerdo");
    expect(rows[1]!.textContent).not.toContain("No estoy de acuerdo");
  });

  it("appeals with the text typed and reloads; deleting asks first", async () => {
    const { host, client } = mount([item({ id: "a", status: "removed", reason_code: "spam", can_appeal: true })]);
    await flush();
    [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "No estoy de acuerdo")!.click();
    host.querySelector<HTMLTextAreaElement>("textarea")!.value = "No es publicidad, es mi tienda.";
    [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Enviar reclamación")!.click();
    await flush();
    expect(client.appeal).toHaveBeenCalledWith("a", "No es publicidad, es mi tienda.");
    expect(client.mine).toHaveBeenCalledTimes(2);
    const del = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Borrar")!;
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    del.click();
    await flush();
    expect(client.remove).not.toHaveBeenCalled();
    del.click();
    await flush();
    expect(client.remove).toHaveBeenCalledWith("a");
    confirm.mockRestore();
  });

  it("exports the person's data to the callback; shows the empty state", async () => {
    const onExport = vi.fn();
    const { host, client } = mount([], { onExport });
    await flush();
    expect(host.querySelector(".cs-ugc__empty")!.textContent).toBe("Aún no has compartido ninguna.");
    [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Descargar mis datos")!.click();
    await flush();
    expect(client.exportMine).toHaveBeenCalled();
    expect(onExport).toHaveBeenCalledWith({ object: "story_ugc_export" });
  });

  it("text from the server goes in as text, never as HTML", async () => {
    const { host } = mount([item({ caption: '<img src=x onerror="alert(1)">' })]);
    await flush();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x");
  });
});
