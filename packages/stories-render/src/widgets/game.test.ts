// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Clock } from "../clock";
import type { GameConfig } from "../types";
import type { WidgetEvent } from "./common";
import { selectDelivery } from "../client/delivery";
import { createGameApi, createGameController, GameApiError, match3Tiles, memoryBoard, mountGame, seededRandom, wheelAngle, type GameApi, type GamePlayRequest, type GamePlayResult } from "./game";

const config = (over: Partial<GameConfig> = {}): GameConfig => ({
  mechanic: "wheel", title: "Gira y gana", cta_label: "Jugar", copy: {}, min_age: 18, identified: false, consent_purpose: "analytics",
  terms: { version: "v1", url: "https://example.com/bases" },
  prizes: [{ id: "nada", label: "Otra vez", kind: "nothing" }, { id: "p10", label: "10 %", kind: "promo_code" }, { id: "p20", label: "20 %", kind: "promo_code" }],
  ...over,
});
const win = (over: Partial<GamePlayResult> = {}): GamePlayResult => ({ play_id: "gp_1", attempt_id: "x", game_id: "g1", mechanic: "wheel", outcome: "win", prize: { id: "p10", label: "10 %", kind: "promo_code", code: "PREMIO10", valid_until: "2026-12-31T00:00:00.000Z" }, replayed: false, plays_remaining: 0, next_play_at: null, played_at: "2026-10-02T12:00:00.000Z", ...over });
const lose = (over: Partial<GamePlayResult> = {}): GamePlayResult => ({ ...win(), outcome: "lose", prize: { id: "nada", label: "Otra vez", kind: "nothing" }, ...over });
const state = (over: Record<string, unknown> = {}) => ({ game_id: "g1", can_play: true, plays_used: 0, plays_remaining: 3, next_play_at: null, wins: [], ...over });

function fakeClock(): Clock & { advance(ms: number): void; pending(): number } {
  let t = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  return {
    now: () => t,
    setTimeout: (fn, ms) => (timers.set(++id, { at: t + ms, fn }), id),
    clearTimeout: (h) => void timers.delete(h as number),
    pending: () => timers.size,
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        t = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      t = end;
    },
  };
}
const api = (over: Partial<GameApi> & { result?: GamePlayResult } = {}): GameApi & { requests: GamePlayRequest[] } => {
  const requests: GamePlayRequest[] = [];
  return { requests, state: over.state ?? (async () => state()), play: over.play ?? (async (r: GamePlayRequest) => (requests.push(r), over.result ?? win())) } as never;
};
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

describe("createGameController: el cliente pide, el servidor decide", () => {
  it("sin marcar bases y edad no se envía nada y se dice qué falta", async () => {
    const a = api();
    const c = createGameController({ id: "g1", config: config(), api: a });
    await c.load();
    await c.play();
    expect(a.requests).toHaveLength(0);
    expect(c.snapshot().missing).toBe("terms");
    c.accept({ terms: true });
    await c.play();
    expect(c.snapshot().missing).toBe("age");
    expect(a.requests).toHaveLength(0);
    c.accept({ age: true });
    await c.play();
    expect(a.requests).toHaveLength(1);
  });

  it("envía el intento, la versión de las bases y la edad; revela solo cuando se pide y emite click y complete una vez", async () => {
    const a = api();
    const events: WidgetEvent[] = [];
    const c = createGameController({ id: "g1", config: config(), api: a, onEvent: (e) => events.push(e), deviceId: "device-123456", country: "CO", newId: () => "attempt-0001" });
    await c.load();
    c.accept({ terms: true, age: true });
    await c.play();
    expect(a.requests[0]).toEqual({ attempt_id: "attempt-0001", device_id: "device-123456", country: "CO", confirmations: { terms_version: "v1", age_confirmed: true } });
    expect(c.snapshot()).toMatchObject({ phase: "revealing", playsRemaining: 0 });
    expect(c.snapshot().result?.prize?.code).toBe("PREMIO10");
    c.reveal();
    c.reveal();
    expect(c.snapshot().phase).toBe("done");
    expect(events.map((e) => e.type)).toEqual(["click", "complete"]);
    expect(events[0]).toMatchObject({ elementId: "widget.g1.play", widgetId: "g1" });
  });

  it("un juego sin bases ni edad se juega directo, y sin consentimiento no manda `consent`", async () => {
    const a = api();
    const c = createGameController({ id: "g1", config: config({ terms: undefined, min_age: 0 }), api: a });
    await c.load();
    await c.play();
    expect(a.requests[0]!.confirmations).toEqual({});
    expect(a.requests[0]!.consent).toBeUndefined();
  });

  it("jugada identificada: pide la casilla de consentimiento y manda su propósito, versión y fecha", async () => {
    const a = api();
    const clock = fakeClock();
    const c = createGameController({ id: "g1", config: config({ identified: true, consent_purpose: "marketing" }), api: a, clock });
    await c.load();
    c.accept({ terms: true, age: true });
    await c.play();
    expect(c.snapshot().missing).toBe("consent");
    c.accept({ consent: true });
    await c.play();
    expect(a.requests[0]!.consent).toEqual({ purpose: "marketing", version: "v1", consented_at: "1970-01-01T00:00:00.000Z" });
  });

  it("sin red conserva el MISMO intento: reintentar manda el mismo attempt_id", async () => {
    let calls = 0;
    const seen: string[] = [];
    const a = api({ play: async (r) => { seen.push(r.attempt_id); if (++calls === 1) throw new GameApiError("network", "fail", 0); return win({ replayed: false }); } });
    let n = 0;
    const c = createGameController({ id: "g1", config: config({ terms: undefined, min_age: 0 }), api: a, newId: () => `attempt-${++n}00000` });
    await c.load();
    await c.play();
    expect(c.snapshot()).toMatchObject({ phase: "error", error: { code: "network", retryable: true } });
    await c.retry();
    expect(seen).toEqual(["attempt-100000", "attempt-100000"]);
    expect(c.snapshot().phase).toBe("revealing");
  });

  it("un rechazo definitivo (sin jugadas, país) bloquea y la siguiente jugada usa otro intento; guarda cuándo vuelve a abrir", async () => {
    const a = api({ play: async () => { throw new GameApiError("limit_reached", "no plays", 429, "2026-10-08T00:00:00.000Z"); } });
    const c = createGameController({ id: "g1", config: config({ terms: undefined, min_age: 0 }), api: a, describe: (code) => `msg:${code}` });
    await c.load();
    await c.play();
    expect(c.snapshot()).toMatchObject({ phase: "blocked", nextPlayAt: "2026-10-08T00:00:00.000Z", error: { code: "limit_reached", message: "msg:limit_reached", retryable: false } });
    await c.retry();
    expect(c.snapshot().phase).toBe("blocked");
  });

  it("el estado inicial puede decir que no se puede jugar", async () => {
    const c = createGameController({ id: "g1", config: config(), api: api({ state: async () => state({ can_play: false, reason: "country_blocked" }) }), describe: (code) => code });
    await c.load();
    expect(c.snapshot()).toMatchObject({ phase: "blocked", error: { code: "country_blocked" } });
  });

  it("reduce motion: el resultado se revela en cuanto llega; again() deja jugar otra vez con intento nuevo", async () => {
    const a = api({ result: lose({ plays_remaining: 2 }) });
    let n = 0;
    const c = createGameController({ id: "g1", config: config({ terms: undefined, min_age: 0 }), api: a, reducedMotion: true, newId: () => `attempt-${++n}00000` });
    await c.load();
    await c.play();
    expect(c.snapshot().phase).toBe("done");
    c.again();
    expect(c.snapshot()).toMatchObject({ phase: "ready", result: null });
    await c.play();
    expect(a.requests.map((r) => r.attempt_id)).toEqual(["attempt-100000", "attempt-200000"]);
  });
});

describe("createGameApi", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  it("play: POST con el token y el cuerpo; devuelve el resultado", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => (calls.push({ url, init }), res(201, win()))) as unknown as typeof fetch;
    const out = await createGameApi({ gameId: "g1", token: async () => "sst_abc", fetch: f, platform: "web", locale: "es", baseUrl: "https://x.test/" }).play({ attempt_id: "attempt-0001", confirmations: {} });
    expect(out.prize?.code).toBe("PREMIO10");
    expect(calls[0]!.url).toBe("https://x.test/client/games/g1/play?platform=web&locale=es");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer sst_abc");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ attempt_id: "attempt-0001", confirmations: {} });
  });
  it("un problema del servidor trae su código y cuándo vuelve a abrir; la red cae como `network` reintentable", async () => {
    const f1 = (async () => res(429, { statusCode: 429, name: "limit_reached", message: "no plays", next_play_at: "2026-10-08T00:00:00.000Z" })) as unknown as typeof fetch;
    const err = await createGameApi({ gameId: "g1", token: async () => "t", fetch: f1 }).play({ attempt_id: "attempt-0001", confirmations: {} }).catch((e) => e as GameApiError);
    expect(err).toMatchObject({ code: "limit_reached", status: 429, nextPlayAt: "2026-10-08T00:00:00.000Z" });
    expect((err as GameApiError).retryable).toBe(false);
    const f2 = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    const net = await createGameApi({ gameId: "g1", token: async () => "t", fetch: f2 }).state().catch((e) => e as GameApiError);
    expect(net).toMatchObject({ code: "network", status: 0 });
    expect((net as GameApiError).retryable).toBe(true);
    const f3 = (async () => res(503, {})) as unknown as typeof fetch;
    expect(((await createGameApi({ gameId: "g1", token: async () => "t", fetch: f3 }).state().catch((e) => e)) as GameApiError).retryable).toBe(true);
  });
  it("un 401 renueva el token una vez", async () => {
    const tokens: Array<boolean | undefined> = [];
    let n = 0;
    const f = (async () => (++n === 1 ? res(401, {}) : res(200, state()))) as unknown as typeof fetch;
    const out = await createGameApi({ gameId: "g1", token: async (force) => (tokens.push(force), "t"), fetch: f }).state();
    expect(out.can_play).toBe(true);
    expect(tokens).toEqual([false, true]);
  });
});

describe("presentación derivada del resultado", () => {
  it("el memory coloca las parejas igual con la misma semilla, y cada símbolo sale dos veces", () => {
    const a = memoryBoard(6, "seed-1");
    expect(memoryBoard(6, "seed-1")).toEqual(a);
    expect(memoryBoard(6, "seed-2")).not.toEqual(a);
    expect(a).toHaveLength(12);
    for (let s = 0; s < 6; s++) expect(a.filter((x) => x === s)).toHaveLength(2);
  });
  it("tres iguales: con premio, las tres iguales; sin premio, NUNCA tres iguales (500 semillas)", () => {
    for (let i = 0; i < 500; i++) {
      const w = match3Tiles(true, "p10", `s${i}`);
      expect(new Set(w).size).toBe(1);
      expect(new Set(match3Tiles(false, "nada", `s${i}`)).size).toBeGreaterThan(1);
    }
  });
  it("el ángulo de la ruleta deja el centro del segmento bajo la flecha", () => {
    expect(wheelAngle(0, 4, 0)).toBe(-45);
    expect(((wheelAngle(2, 4) % 360) + 360) % 360).toBe(((-(2.5 * 90)) % 360 + 360) % 360);
    expect(seededRandom("a")()).toBe(seededRandom("a")());
  });
});

const mount = (cfg: GameConfig, o: { a?: GameApi; reducedMotion?: boolean; onEvent?: (e: WidgetEvent) => void } = {}) => {
  const host = document.createElement("div");
  document.body.append(host);
  const clock = fakeClock();
  const a = o.a ?? api();
  const h = mountGame(host, { entry: { id: "g1", config: cfg }, api: a, clock, reducedMotion: o.reducedMotion ?? false, locale: "es", onEvent: o.onEvent, newId: () => "attempt-0001", formatDate: (iso) => iso.slice(0, 10) });
  return { host, clock, h, a };
};
const q = (host: HTMLElement, sel: string) => host.querySelector<HTMLElement>(sel);
const click = (host: HTMLElement, sel: string) => q(host, sel)!.click();
const check = (host: HTMLElement, key: string) => { const i = q(host, `[data-game-check="${key}"]`) as HTMLInputElement; i.checked = true; i.dispatchEvent(new Event("change")); };

describe("mountGame: ruleta", () => {
  it("muestra título, bases con enlace, edad; sin marcarlas avisa y no envía; con ellas gira y revela el resultado al terminar", async () => {
    const events: WidgetEvent[] = [];
    const { host, clock, a } = mount(config(), { onEvent: (e) => events.push(e) });
    await flush();
    expect(q(host, ".cs-game__title")!.textContent).toBe("Gira y gana");
    expect(q(host, ".cs-game__terms")!.getAttribute("href")).toBe("https://example.com/bases");
    expect(q(host, ".cs-game__terms")!.getAttribute("rel")).toContain("noopener");
    expect(host.textContent).toContain("versión v1");
    expect(host.textContent).toContain("al menos 18 años");
    click(host, '[data-game-action="play"]');
    await flush();
    expect((a as unknown as { requests: unknown[] }).requests).toHaveLength(0);
    expect(q(host, ".cs-game__warn")!.textContent).toContain("bases");
    check(host, "terms");
    check(host, "age");
    click(host, '[data-game-action="play"]');
    await flush();
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("revealing");
    expect(q(host, ".cs-game__result")!.hidden).toBe(true);
    clock.advance(30);
    expect(q(host, ".cs-game__disc")!.style.transform).toMatch(/rotate\(-?\d+(\.\d+)?deg\)/);
    clock.advance(4400);
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
    expect(q(host, ".cs-game__result")!.hidden).toBe(false);
    expect(q(host, ".cs-game__headline")!.textContent).toBe("¡Ganaste! 10 %");
    expect(q(host, ".cs-game__code")!.textContent).toBe("PREMIO10");
    expect(q(host, ".cs-game__valid")!.textContent).toBe("Válido hasta el 2026-12-31");
    expect(q(host, '[role="status"]')!.textContent).toContain("PREMIO10");
    expect(events.map((e) => e.type)).toEqual(["click", "complete"]);
  });

  it("«Saltar animación» revela el mismo resultado de inmediato", async () => {
    const { host } = mount(config({ terms: undefined, min_age: 0 }));
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    click(host, '[data-game-action="skip"]');
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
    expect(q(host, ".cs-game__code")!.textContent).toBe("PREMIO10");
  });

  it("reduce motion: sin animación y sin botón de saltar, el resultado llega directo y se anuncia", async () => {
    const { host, clock } = mount(config({ terms: undefined, min_age: 0 }), { reducedMotion: true });
    await flush();
    expect(q(host, ".cs-game")!.getAttribute("data-motion")).toBe("reduced");
    click(host, '[data-game-action="play"]');
    await flush();
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
    expect(q(host, '[data-game-action="skip"]')).toBeNull();
    expect(clock.pending()).toBe(0);
    expect(q(host, '[role="status"]')!.textContent).toContain("Ganaste");
  });

  it("sin premio: el texto configurado o el de serie, sin código", async () => {
    const { host } = mount(config({ terms: undefined, min_age: 0, copy: { lose: "¡Casi!" } }), { reducedMotion: true, a: api({ result: lose() }) });
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    expect(q(host, ".cs-game__headline")!.textContent).toBe("¡Casi!");
    expect(q(host, ".cs-game__code")).toBeNull();
  });

  it("un error de red muestra «Reintentar» y reintentar usa el mismo intento; un límite bloquea con su mensaje y la fecha", async () => {
    let n = 0;
    const seen: string[] = [];
    const flaky = api({ play: async (r) => { seen.push(r.attempt_id); if (++n === 1) throw new GameApiError("network", "x", 0); return lose(); } });
    const a = mount(config({ terms: undefined, min_age: 0 }), { reducedMotion: true, a: flaky });
    await flush();
    click(a.host, '[data-game-action="play"]');
    await flush();
    expect(q(a.host, ".cs-game__warn")!.textContent).toContain("No hay conexión");
    click(a.host, '[data-game-action="retry"]');
    await flush();
    expect(seen).toEqual(["attempt-0001", "attempt-0001"]);
    const limited = mount(config({ terms: undefined, min_age: 0 }), { a: api({ play: async () => { throw new GameApiError("limit_reached", "x", 429, "2026-10-08T00:00:00.000Z"); } }) });
    await flush();
    click(limited.host, '[data-game-action="play"]');
    await flush();
    expect(q(limited.host, ".cs-game__warn")!.textContent).toBe("Ya no te quedan jugadas.");
    expect(q(limited.host, ".cs-game__warn")!.getAttribute("role")).toBe("alert");
    expect(q(limited.host, ".cs-game__info")!.textContent).toContain("2026-10-08");
  });

  it("«Jugar otra vez» solo si quedan jugadas", async () => {
    const more = mount(config({ terms: undefined, min_age: 0 }), { reducedMotion: true, a: api({ result: lose({ plays_remaining: 2 }) }) });
    await flush();
    click(more.host, '[data-game-action="play"]');
    await flush();
    expect(q(more.host, '[data-game-action="again"]')).not.toBeNull();
    click(more.host, '[data-game-action="again"]');
    expect(q(more.host, ".cs-game")!.getAttribute("data-phase")).toBe("ready");
    const none = mount(config({ terms: undefined, min_age: 0 }), { reducedMotion: true });
    await flush();
    click(none.host, '[data-game-action="play"]');
    await flush();
    expect(q(none.host, '[data-game-action="again"]')).toBeNull();
    expect(q(none.host, ".cs-game__info")!.textContent).toBe("No te quedan jugadas");
  });

  it("jugada identificada: aparece la casilla de consentimiento", async () => {
    const { host } = mount(config({ identified: true, consent_purpose: "marketing", terms: undefined, min_age: 0 }));
    await flush();
    expect(q(host, '[data-game-check="consent"]')).not.toBeNull();
  });

  it("destroy limpia el DOM y los temporizadores", async () => {
    const { host, h, clock } = mount(config({ terms: undefined, min_age: 0 }));
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    expect(clock.pending()).toBeGreaterThan(0);
    h.destroy();
    expect(host.children).toHaveLength(0);
    expect(clock.pending()).toBe(0);
  });
});

describe("mountGame: las otras mecánicas tienen su alternativa por botón", () => {
  const base = { terms: undefined, min_age: 0 } as const;
  it.each(["scratch", "prize_card", "memory", "match3"] as const)("%s: «Revelar premio» muestra el resultado ya decidido", async (mechanic) => {
    const { host } = mount(config({ ...base, mechanic, board: { pairs: 4 } }), { a: api({ result: win({ mechanic, board_seed: "seed-1" }) }) });
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("revealing");
    expect(q(host, ".cs-game__result")!.hidden).toBe(true);
    click(host, '[data-game-action="skip"]');
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
    expect(q(host, ".cs-game__code")!.textContent).toBe("PREMIO10");
  });

  it.each(["scratch", "prize_card", "memory", "match3"] as const)("%s con reduce motion: resultado directo", async (mechanic) => {
    const { host } = mount(config({ ...base, mechanic, board: { pairs: 4 } }), { reducedMotion: true, a: api({ result: lose({ mechanic, board_seed: "s" }) }) });
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
  });

  it("tarjeta de premio: pulsar la tarjeta la gira y revela al terminar", async () => {
    const { host, clock } = mount(config({ ...base, mechanic: "prize_card" }), { a: api({ result: win({ mechanic: "prize_card" }) }) });
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    click(host, ".cs-game__flip");
    expect(q(host, ".cs-game__flip")!.getAttribute("aria-pressed")).toBe("true");
    clock.advance(500);
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
  });

  it("tres iguales: descubrir las tres casillas con premio muestra tres símbolos iguales y luego el resultado", async () => {
    const { host, clock } = mount(config({ ...base, mechanic: "match3" }), { a: api({ result: win({ mechanic: "match3", board_seed: "s" }) }) });
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    const tiles = host.querySelectorAll<HTMLElement>(".cs-game__tile");
    expect(tiles).toHaveLength(3);
    tiles.forEach((t) => t.click());
    const symbols = [...tiles].map((t) => t.textContent);
    expect(new Set(symbols).size).toBe(1);
    clock.advance(400);
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
  });

  it("memory: encontrar todas las parejas revela el resultado", async () => {
    const { host, clock } = mount(config({ ...base, mechanic: "memory", board: { pairs: 3 } }), { a: api({ result: win({ mechanic: "memory", board_seed: "seed-1" }) }) });
    await flush();
    click(host, '[data-game-action="play"]');
    await flush();
    const tiles = [...host.querySelectorAll<HTMLElement>(".cs-game__tile")];
    expect(tiles).toHaveLength(6);
    const order = memoryBoard(3, "seed-1");
    for (let s = 0; s < 3; s++) order.map((x, i) => (x === s ? i : -1)).filter((i) => i >= 0).forEach((i) => tiles[i]!.click());
    clock.advance(500);
    expect(q(host, ".cs-game")!.getAttribute("data-phase")).toBe("done");
  });
});

describe("entrega del widget `game`", () => {
  const game = (over: Record<string, unknown> = {}) => ({ id: "g1", priority: 50, control: false, items: [], config: config(), ...over });
  const ctx = { frequency: { canShow: () => true }, dismissed: { isDismissed: () => false } };
  it("un juego no lleva elementos y aun así se entrega (uno por placement); el de control solo registra la impresión", () => {
    const out = selectDelivery({ placementId: "home", widgets: [{ kind: "game", items: [game()] }] as never }, ctx);
    expect(out.widgets.game?.id).toBe("g1");
    const control = selectDelivery({ placementId: "home", widgets: [{ kind: "game", items: [{ id: "g2", priority: 50, control: true, config: config() }] }] as never }, ctx);
    expect(control.widgets.game).toBeNull();
    expect(control.control.widgets).toEqual([{ kind: "game", id: "g2" }]);
  });
  it("gana el de más prioridad", () => {
    const out = selectDelivery({ placementId: "home", widgets: [{ kind: "game", items: [game({ id: "a", priority: 10 }), game({ id: "b", priority: 90 })] }] as never }, ctx);
    expect(out.widgets.game?.id).toBe("b");
  });
});
