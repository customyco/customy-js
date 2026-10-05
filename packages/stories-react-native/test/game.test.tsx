import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WidgetEvent } from "../src/widgets";
import { GameApiError, GameView, type GameApi, type GamePlayRequest, type GamePlayResult } from "../src/game";
import { attr, renderWithProvider } from "./harness";
import { gameEntry, widgetsPlacement, widgetSetup } from "./widget-fixtures";
import { StoriesGame } from "../src/game";

const win = (over: Partial<GamePlayResult> = {}): GamePlayResult => ({ play_id: "gp_1", attempt_id: "x", game_id: "g1", mechanic: "wheel", outcome: "win", prize: { id: "p10", label: "10 %", kind: "promo_code", code: "PREMIO10" }, replayed: false, plays_remaining: 2, next_play_at: null, played_at: "2026-10-02T12:00:00.000Z", ...over }) as GamePlayResult;
const lose = (): GamePlayResult => win({ outcome: "lose", prize: { id: "nada", label: "Otra vez", kind: "nothing" } });
const stateOk = { game_id: "g1", can_play: true, plays_used: 0, plays_remaining: 3, next_play_at: null, wins: [] };

function fakeApi(play: (r: GamePlayRequest) => Promise<GamePlayResult>, state: GameApi["state"] = async () => stateOk as never) {
  const requests: GamePlayRequest[] = [];
  const api = { state, play: async (r: GamePlayRequest) => (requests.push(r), play(r)) } as GameApi;
  return { api, requests };
}
const wait = <T,>(fn: () => T) => waitFor(fn, { timeout: 3000 });
const tick = async () => void (await act(async () => {}));

describe("Game nativo: el servidor decide, el cliente anima", () => {
  it("sin marcar las bases no se envía nada; se avisa; luego juega y el resultado (código, copiar) se anuncia", async () => {
    const { api, requests } = fakeApi(async () => win());
    const events: WidgetEvent[] = [];
    const copyText = vi.fn(async () => undefined);
    renderWithProvider(<GameView entry={gameEntry({ terms: { version: "v1", url: "https://example.com/bases" }, min_age: 18 })} api={api} newId={() => "attempt-1"} deviceId="device-123456" onEvent={(e) => events.push(e)} />, { reducedMotion: true, copyText });
    await wait(() => expect(screen.getByTestId("cs-game-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cs-game-play"));
    await tick();
    expect(requests).toHaveLength(0);
    expect(screen.getByTestId("cs-game-warn")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cs-game-check-terms"));
    fireEvent.click(screen.getByTestId("cs-game-check-age"));
    fireEvent.click(screen.getByTestId("cs-game-play"));
    await wait(() => expect(screen.getByTestId("cs-game-result")).toBeTruthy());
    expect(requests[0]).toMatchObject({ attempt_id: "attempt-1", device_id: "device-123456", confirmations: { terms_version: "v1", age_confirmed: true } });
    expect(screen.getByTestId("cs-game-code").textContent).toContain("PREMIO10");
    await wait(() => expect(screen.getByTestId("cs-game-live").textContent).toContain("PREMIO10"));
    fireEvent.click(screen.getByTestId("cs-game-copy"));
    await tick();
    expect(copyText).toHaveBeenCalledWith("PREMIO10");
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["impression", "click", "complete"]));
  });

  it("reduce motion: el resultado llega directo, sin pasar por «revelando»", async () => {
    const { api } = fakeApi(async () => lose());
    renderWithProvider(<GameView entry={gameEntry()} api={api} />, { reducedMotion: true });
    await wait(() => expect(screen.getByTestId("cs-game-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cs-game-play"));
    await wait(() => expect(screen.getByTestId("cs-game-result")).toBeTruthy());
    expect(screen.queryByTestId("cs-game-skip")).toBeNull();
  });

  it("sin reduce motion hay alternativa sin gesto («saltar/revelar») para cada una de las 5 mecánicas", async () => {
    for (const mechanic of ["wheel", "scratch", "prize_card", "memory", "match3"] as const) {
      const { api } = fakeApi(async () => win({ mechanic, board_seed: "seed-1" } as never));
      const { unmount } = renderWithProvider(<GameView entry={gameEntry({ mechanic } as never)} api={api} />, { reducedMotion: false });
      await wait(() => expect(screen.getByTestId("cs-game-play")).toBeTruthy());
      fireEvent.click(screen.getByTestId("cs-game-play"));
      await wait(() => expect(screen.getByTestId("cs-game-skip"), mechanic).toBeTruthy());
      fireEvent.click(screen.getByTestId("cs-game-skip"));
      await wait(() => expect(screen.getByTestId("cs-game-result"), mechanic).toBeTruthy());
      unmount();
    }
  });

  it("error de red: se reintenta con el MISMO attempt_id (el servidor responde replay, no cuenta dos veces)", async () => {
    let n = 0;
    const { api, requests } = fakeApi(async () => {
      if (n++ === 0) throw new GameApiError("network", "network", 0);
      return win({ replayed: true });
    });
    renderWithProvider(<GameView entry={gameEntry()} api={api} newId={() => `id-${n}`} />, { reducedMotion: true });
    await wait(() => expect(screen.getByTestId("cs-game-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cs-game-play"));
    await wait(() => expect(screen.getByTestId("cs-game-retry")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cs-game-retry"));
    await wait(() => expect(screen.getByTestId("cs-game-result")).toBeTruthy());
    expect(requests.map((r) => r.attempt_id)).toEqual(["id-0", "id-0"]);
  });

  it("rechazo definitivo del servidor (limit_reached): texto propio, sin botón de reintento", async () => {
    const { api } = fakeApi(async () => {
      throw new GameApiError("limit_reached", "limit", 409);
    });
    renderWithProvider(<GameView entry={gameEntry()} api={api} />, { reducedMotion: true });
    await wait(() => expect(screen.getByTestId("cs-game-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cs-game-play"));
    await wait(() => expect(screen.getByTestId("cs-game-warn")).toBeTruthy());
    expect(screen.queryByTestId("cs-game-retry")).toBeNull();
    expect(attr(screen.getByTestId("cs-game-warn"), "data-role")).toBe("alert");
  });

  it("juego bloqueado desde el estado (can_play=false): no se ofrece jugar", async () => {
    const { api } = fakeApi(async () => win(), async () => ({ ...stateOk, can_play: false, reason: "country_blocked" }) as never);
    renderWithProvider(<GameView entry={gameEntry()} api={api} />, { reducedMotion: true });
    await wait(() => expect(screen.getByTestId("cs-game-warn")).toBeTruthy());
    expect(screen.queryByTestId("cs-game-play")).toBeNull();
  });

  it("ligado al placement: se pinta y, con `kill.widget`, se retira", async () => {
    const { api } = fakeApi(async () => win());
    const on = widgetSetup(widgetsPlacement([{ kind: "game", items: [gameEntry()] }] as never));
    const first = renderWithProvider(<StoriesGame placementId="home_top" api={() => api} />, { client: on.client });
    await wait(() => expect(screen.getByTestId("cs-game-g1")).toBeTruthy());
    first.unmount();
    const off = widgetSetup(widgetsPlacement([{ kind: "game", items: [gameEntry()] }] as never, { kill: { widget: true } } as never));
    renderWithProvider(<StoriesGame placementId="home_top" api={() => api} />, { client: off.client });
    await tick();
    await tick();
    expect(screen.queryByTestId("cs-game-g1")).toBeNull();
  });
});
