import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoryCommunity, StoryGroup, StoryPage } from "@customyai/stories-render";
import { UgcComposer, UgcError, UgcMine, createUgcClient, ugcPageActions, type UgcClient, type UgcOwnItem } from "../src/ugc";
import { StoriesProvider } from "../src/context";
import { renderWithProvider } from "./harness";

const community: StoryCommunity = { terms_version: "t3", terms_url: "https://example.com/terms", accept_video: false, max_per_author_per_day: 3, max_caption_length: 80 };
const wait = <T,>(fn: () => T) => waitFor(fn, { timeout: 3000 });
const own = (over: Partial<UgcOwnItem> = {}): UgcOwnItem => ({ id: "u1", status: "pending", ...over }) as UgcOwnItem;

describe("UGC nativo", () => {
  it("formulario: sin términos ni descripción no se envía; con ellos manda el cuerpo con la versión vigente y queda en revisión", async () => {
    const submit = vi.fn(async () => own());
    const onSubmitted = vi.fn();
    renderWithProvider(
      <UgcComposer groupId="g1" community={community} client={{ submit } as Pick<UgcClient, "submit">} pickMedia={async () => ({ name: "foto.jpg" })} uploadMedia={async () => ({ kind: "image", url: "https://cdn.test/f.jpg" })} onSubmitted={onSubmitted} />,
    );
    fireEvent.click(screen.getByTestId("cs-ugc-pick"));
    await wait(() => expect(screen.getByTestId("cs-ugc-chosen").textContent).toContain("foto.jpg"));
    expect(screen.getByTestId("cs-ugc-submit").getAttribute("aria-disabled") ?? screen.getByTestId("cs-ugc-submit").getAttribute("data-state") ?? "").toMatch(/true|disabled/);
    fireEvent.click(screen.getByTestId("cs-ugc-terms"));
    fireEvent.change(screen.getByTestId("cs-ugc-alt"), { target: { value: "Mi perro en la playa" } });
    fireEvent.click(screen.getByTestId("cs-ugc-submit"));
    await wait(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith("g1", community, expect.objectContaining({ termsAccepted: true, alt: "Mi perro en la playa", media: { kind: "image", url: "https://cdn.test/f.jpg" } }));
    await wait(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it("rechazo del servidor: texto propio como alerta", async () => {
    const submit = vi.fn(async () => {
      throw new UgcError("rejected_by_filter", "x");
    });
    renderWithProvider(<UgcComposer groupId="g1" community={community} client={{ submit } as never} pickMedia={async () => ({ name: "a.jpg" })} uploadMedia={async () => ({ kind: "image", url: "https://cdn.test/f.jpg" })} />);
    fireEvent.click(screen.getByTestId("cs-ugc-pick"));
    await wait(() => screen.getByTestId("cs-ugc-chosen"));
    fireEvent.click(screen.getByTestId("cs-ugc-terms"));
    fireEvent.change(screen.getByTestId("cs-ugc-alt"), { target: { value: "algo" } });
    fireEvent.click(screen.getByTestId("cs-ugc-submit"));
    await wait(() => expect(screen.getByTestId("cs-ugc-status").getAttribute("data-role")).toBe("alert"));
  });

  it("mis historias: estado y vacío", async () => {
    const mine = vi.fn(async () => [own({ id: "u1", status: "rejected", decision_reason: "spam" } as never)]);
    renderWithProvider(<UgcMine client={{ mine, appeal: vi.fn(), remove: vi.fn() } as never} />);
    await wait(() => expect(mine).toHaveBeenCalled());
    await wait(() => expect(screen.queryByTestId("cs-ugc-empty")).toBeNull());
  });

  const group = { id: "g1", title: "Comunidad" } as StoryGroup;
  const page = (ugc?: StoryPage["ugc"]) => ({ id: "p1", ugc }) as unknown as StoryPage;

  it("visor: sin marca ugc no hay «⋯»; con ella la hoja reporta (con motivo) y bloquea", async () => {
    const report = vi.fn(async () => ({ counted: true, hidden: false }));
    const blockAuthor = vi.fn(async () => ({ already_blocked: false }));
    const onDone = vi.fn();
    const provider = ugcPageActions({ client: { report, blockAuthor }, onDone, locale: "es" });
    expect(provider({ group, page: page() })).toBeNull();
    const action = provider({ group, page: page({ item_id: "it1", author_label: "Ana", reportable: true }) });
    expect(action).not.toBeNull();
    const close = vi.fn();
    const say = vi.fn();
    render(<StoriesProvider locale="es" reducedMotion={false}>{action!.render({ close, say })}</StoriesProvider>);
    const send = screen.getByTestId("cs-ugc-send");
    fireEvent.click(send);
    expect(report).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("cs-ugc-reason-spam"));
    fireEvent.click(screen.getByTestId("cs-ugc-send"));
    await wait(() => expect(report).toHaveBeenCalledWith("it1", "spam", ""));
    expect(onDone).toHaveBeenCalledWith("reported", "it1");
    expect(close).toHaveBeenCalled();
    cleanup();
    render(<StoriesProvider locale="es" reducedMotion={false}>{action!.render({ close, say })}</StoriesProvider>);
    fireEvent.click(screen.getByTestId("cs-ugc-block"));
    await wait(() => expect(blockAuthor).toHaveBeenCalledWith("it1"));
    expect(onDone).toHaveBeenCalledWith("blocked", "it1");
  });

  it("cliente: precheck sin red (términos, vídeo no admitido, descripción) y token renovado ante 401", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      calls.push(String((init.headers as Record<string, string>).authorization));
      return calls.length === 1 ? new Response("{}", { status: 401 }) : new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const token = vi.fn(async (force?: boolean) => (force ? "fresh" : "old"));
    const c = createUgcClient({ token, fetch: fetch as never });
    await expect(c.submit("g", community, { media: { kind: "image", url: "https://x/y.jpg" }, termsAccepted: false, alt: "a" })).rejects.toMatchObject({ code: "terms_not_accepted" });
    await expect(c.submit("g", community, { media: { kind: "video", url: "https://x/y.mp4", poster: "https://x/p.jpg" }, termsAccepted: true, alt: "a" })).rejects.toMatchObject({ code: "video_not_accepted" });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => void (await c.mine()));
    expect(calls).toEqual(["Bearer old", "Bearer fresh"]);
  });
});
