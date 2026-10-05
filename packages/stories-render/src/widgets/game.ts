import { systemClock, type Clock } from "../clock";
import { safeHttpsUrl } from "../safe-url";
import { applyTheme } from "../dom/util";
import type { DeliveredGame, GameConfig, GamePublicPrize } from "../types";
import { el, resolveUi, safeColor, widgetElementId, widgetEmitter, widgetRoot, type WidgetControllerBase, type WidgetEvent, type WidgetHandle } from "./common";
import { fmt, resolveGameMessages, type GameMessages } from "./game-messages";

/**
 * Game Center (Ola 4): ruleta, rasca y gana, tarjeta de premio, memoria y «tres iguales».
 *
 * EL CLIENTE NUNCA DECIDE. `createGameController` pide `play` al servidor y recibe el resultado (qué premio, qué código); lo que
 * se anima después —el giro, el rasca, las cartas— es la PRESENTACIÓN de ese resultado, que ya está registrado: saltar la animación
 * (reduce motion, «Saltar animación», «Revelar premio») no lo cambia. Un reintento con el mismo `attempt_id` devuelve el mismo
 * resultado, así que perder la red a mitad no pierde la jugada.
 *
 * Accesibilidad: cada mecánica tiene su alternativa por botón y teclado; el resultado se anuncia en una región `aria-live`;
 * con `prefers-reduced-motion` no hay animación y el resultado llega directo. Las bases, la edad y el consentimiento son casillas
 * reales, y sin ellas no se envía nada.
 */

// ─── Lo que habla con el servidor ───────────────────────────────────────────

export type GamePlayRequest = {
  attempt_id: string;
  device_id?: string;
  country?: string;
  confirmations: { terms_version?: string; age_confirmed?: boolean };
  consent?: { purpose: string; version: string; consented_at: string };
};
export type GameResultPrize = { id: string; label: string; kind: "nothing" | "promo_code" | "points"; code?: string; valid_until?: string; points?: number };
export type GamePlayResult = {
  play_id: string;
  attempt_id: string;
  game_id: string;
  mechanic: GameConfig["mechanic"];
  outcome: "win" | "lose";
  prize: GameResultPrize | null;
  replayed: boolean;
  board_seed?: string;
  plays_remaining: number | null;
  next_play_at: string | null;
  played_at: string;
};
export type GameStateInfo = {
  game_id: string;
  can_play: boolean;
  reason?: string;
  config?: GameConfig;
  plays_used: number;
  plays_remaining: number | null;
  next_play_at: string | null;
  wins: Array<{ play_id: string; played_at: string; prize: GameResultPrize }>;
};

export type GameApi = {
  state(): Promise<GameStateInfo>;
  play(request: GamePlayRequest): Promise<GamePlayResult>;
};

/** Error del servidor (`code` = el nombre del problema: `limit_reached`, `country_blocked`…) o de la red (`network`, reintentable). */
export class GameApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly nextPlayAt: string | null = null) {
    super(message);
    this.name = "GameApiError";
  }
  get retryable(): boolean {
    return this.code === "network" || this.status >= 500;
  }
}

export type GameApiOptions = {
  gameId: string;
  /** Por defecto https://send-api.customy.ai */
  baseUrl?: string;
  /** Token de suscriptor (`sst_…`); se pide de nuevo tras un 401. */
  token: (forceRefresh?: boolean) => Promise<string>;
  fetch?: typeof fetch;
  platform?: "ios" | "android" | "web";
  appVersion?: string;
  locale?: string;
  timeoutMs?: number;
};

export function createGameApi(options: GameApiOptions): GameApi {
  const base = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const query = new URLSearchParams();
  if (options.platform) query.set("platform", options.platform);
  if (options.appVersion) query.set("app_version", options.appVersion);
  if (options.locale) query.set("locale", options.locale);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const url = `${base}/client/games/${encodeURIComponent(options.gameId)}`;

  async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await options.token(attempt > 0).catch((e: unknown) => {
        throw new GameApiError("network", e instanceof Error ? e.message : "token", 0);
      });
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), options.timeoutMs ?? 10_000) : null;
      let res: Response;
      try {
        res = await doFetch(`${url}${path}${qs}`, { method: init.method, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body !== undefined ? { "content-type": "application/json" } : {}) }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}), ...(ctl ? { signal: ctl.signal } : {}) });
      } catch (e) {
        throw new GameApiError("network", e instanceof Error ? e.message : "network", 0);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (res.status === 401 && attempt === 0) continue;
      const text = await res.text().catch(() => "");
      let json: Record<string, unknown> = {};
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        /* cuerpo que no es JSON */
      }
      if (!res.ok) throw new GameApiError(typeof json.name === "string" ? json.name : res.status === 404 ? "game_not_found" : "server", typeof json.message === "string" ? json.message : `HTTP ${res.status}`, res.status, typeof json.next_play_at === "string" ? json.next_play_at : null);
      return json as T;
    }
    throw new GameApiError("unauthorized", "unauthorized", 401);
  }

  return {
    state: () => call<GameStateInfo>("", { method: "GET" }),
    play: (request) => call<GamePlayResult>("/play", { method: "POST", body: request }),
  };
}

// ─── El controlador (puro: ni DOM ni reloj propio) ──────────────────────────

export type GamePhase = "loading" | "ready" | "playing" | "revealing" | "done" | "blocked" | "error";
export type GameUiError = { code: string; message: string; retryable: boolean; nextPlayAt: string | null };
export type GameMissing = "terms" | "age" | "consent" | null;

export type GameSnapshot = {
  phase: GamePhase;
  config: GameConfig;
  result: GamePlayResult | null;
  error: GameUiError | null;
  terms: boolean;
  age: boolean;
  consent: boolean;
  /** Qué falta marcar para poder jugar (se avisa; no se envía nada). */
  missing: GameMissing;
  playsRemaining: number | null;
  nextPlayAt: string | null;
  wins: GameStateInfo["wins"];
};

export type GameControllerOptions = {
  id: string;
  variantId?: string;
  config: GameConfig;
  api: GameApi;
  onEvent?: (e: WidgetEvent) => void;
  /** Identificador de instalación de la app (el servidor lo guarda como hash para el tope por dispositivo). */
  deviceId?: string;
  country?: string;
  /** Versión del consentimiento que la app muestra (por defecto la de las bases, o `game-1`). */
  consentVersion?: string;
  newId?: () => string;
  clock?: Clock;
  /** Con reduce motion el resultado se revela en cuanto llega. */
  reducedMotion?: boolean;
  /** Traduce un código de error del servidor. */
  describe?: (code: string, error?: GameApiError) => string;
};

export type GameController = {
  snapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  accept(partial: { terms?: boolean; age?: boolean; consent?: boolean }): void;
  play(): Promise<void>;
  /** Tras un error de red: el MISMO intento (el servidor contesta lo mismo si ya lo había registrado). */
  retry(): Promise<void>;
  /** El resultado ya está; esto solo lo muestra (fin de la animación o «saltar»). */
  reveal(): void;
  /** Otra jugada, si quedan. */
  again(): void;
};

const defaultId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

export function createGameController(options: GameControllerOptions): GameController {
  const { config, api } = options;
  const emit = widgetEmitter(options.id, options.variantId, options.onEvent);
  const listeners = new Set<() => void>();
  const now = options.clock ?? systemClock;
  let phase: GamePhase = "loading";
  let result: GamePlayResult | null = null;
  let error: GameUiError | null = null;
  let terms = false;
  let age = false;
  let consent = false;
  let attempt: string | null = null;
  let remaining: number | null = null;
  let nextAt: string | null = null;
  let wins: GameStateInfo["wins"] = [];
  let missing: GameMissing = null;
  let completed = false;
  const notify = (): void => listeners.forEach((l) => l());

  const needsTerms = Boolean(config.terms);
  const needsAge = config.min_age > 0;
  const missingNow = (): GameMissing => (needsTerms && !terms ? "terms" : needsAge && !age ? "age" : config.identified && !consent ? "consent" : null);

  const fail = (e: unknown): void => {
    const err = e instanceof GameApiError ? e : new GameApiError("network", "network", 0);
    const retryable = err.retryable;
    error = { code: err.code, message: options.describe?.(err.code, err) ?? err.message, retryable, nextPlayAt: err.nextPlayAt };
    if (err.nextPlayAt) nextAt = err.nextPlayAt;
    if (err.code === "limit_reached") remaining = 0;
    phase = retryable ? "error" : "blocked";
    // Una jugada rechazada de forma definitiva no se reintenta con el mismo intento.
    if (!retryable) attempt = null;
  };

  async function run(): Promise<void> {
    missing = missingNow();
    if (missing) {
      phase = "ready";
      error = null;
      notify();
      return;
    }
    attempt ??= (options.newId ?? defaultId)();
    phase = "playing";
    error = null;
    notify();
    emit({ type: "click", elementId: widgetElementId(options.id, "play") });
    const request: GamePlayRequest = {
      attempt_id: attempt,
      ...(options.deviceId ? { device_id: options.deviceId } : {}),
      ...(options.country ? { country: options.country } : {}),
      confirmations: { ...(config.terms ? { terms_version: config.terms.version } : {}), ...(needsAge ? { age_confirmed: age } : {}) },
      ...(config.identified ? { consent: { purpose: config.consent_purpose, version: options.consentVersion ?? config.terms?.version ?? "game-1", consented_at: new Date(now.now()).toISOString() } } : {}),
    };
    try {
      const r = await api.play(request);
      result = r;
      attempt = null;
      remaining = r.plays_remaining;
      nextAt = r.next_play_at;
      phase = "revealing";
      notify();
      if (options.reducedMotion) c.reveal();
    } catch (e) {
      fail(e);
      notify();
    }
  }

  const c: GameController = {
    snapshot: () => ({ phase, config, result, error, terms, age, consent, missing, playsRemaining: remaining, nextPlayAt: nextAt, wins }),
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    async load() {
      phase = "loading";
      notify();
      try {
        const s = await api.state();
        remaining = s.plays_remaining;
        nextAt = s.next_play_at;
        wins = s.wins ?? [];
        if (s.can_play) phase = "ready";
        else {
          phase = "blocked";
          error = { code: s.reason ?? "game_not_active", message: options.describe?.(s.reason ?? "game_not_active") ?? s.reason ?? "", retryable: false, nextPlayAt: s.next_play_at };
        }
      } catch (e) {
        fail(e);
      }
      notify();
    },
    accept(p) {
      if (p.terms !== undefined) terms = p.terms;
      if (p.age !== undefined) age = p.age;
      if (p.consent !== undefined) consent = p.consent;
      if (missing) missing = missingNow();
      notify();
    },
    play: async () => {
      if (phase === "ready" || phase === "done") await run();
    },
    retry: async () => {
      if (phase === "error") await run();
    },
    reveal() {
      if (phase !== "revealing") return;
      phase = "done";
      notify();
      if (!completed) {
        completed = true;
        emit({ type: "complete" });
      }
    },
    again() {
      if (phase !== "done") return;
      result = null;
      completed = false;
      phase = "ready";
      notify();
    },
  };
  return c;
}

// ─── Presentación: símbolos y tablero (derivados del resultado, nunca de la suerte del cliente) ─────

const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "🍀", "💎", "🎁", "🍩"];

const hash32 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** Generador determinista (mulberry32): el mismo `board_seed` coloca el tablero igual en cada reintento. */
export function seededRandom(seed: string): () => number {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** El orden de las cartas de un memory: `pairs` parejas, mezcladas con la semilla. */
export function memoryBoard(pairs: number, seed: string): number[] {
  const rand = seededRandom(seed);
  const cards = Array.from({ length: pairs * 2 }, (_, i) => Math.floor(i / 2));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

/** Tres casillas de un «tres iguales»: con premio, las tres iguales; sin él, nunca tres iguales (siempre hay una distinta). */
export function match3Tiles(win: boolean, prizeId: string | null, seed: string): [number, number, number] {
  const rand = seededRandom(seed);
  const a = (hash32(prizeId ?? "none") + (win ? 0 : Math.floor(rand() * 7))) % SYMBOLS.length;
  if (win) return [a, a, a];
  const b = (a + 1 + Math.floor(rand() * (SYMBOLS.length - 1))) % SYMBOLS.length;
  const odd = Math.floor(rand() * 3);
  const tiles: [number, number, number] = [a, a, a];
  tiles[odd] = b;
  return tiles;
}

/** El ángulo (grados, sentido horario) al que gira la ruleta para dejar el centro del segmento `index` bajo la flecha de arriba. */
export function wheelAngle(index: number, segments: number, turns = 5): number {
  const seg = 360 / Math.max(1, segments);
  return turns * 360 - (index + 0.5) * seg;
}

// ─── El montaje ─────────────────────────────────────────────────────────────

export type GameOptions = WidgetControllerBase & {
  entry: Pick<DeliveredGame, "id" | "config"> & Partial<Pick<DeliveredGame, "variant_id" | "updated_at">>;
  api: GameApi;
  deviceId?: string;
  country?: string;
  consentVersion?: string;
  newId?: () => string;
  theme?: "light" | "dark" | "auto";
  rtl?: boolean;
  doc?: Document;
  /** Si el juego se abre en un diálogo, el botón «Cerrar». */
  onClose?: () => void;
  /** Los textos de los premios del tipo `points` y las fechas dependen del idioma. */
  formatDate?: (iso: string) => string;
};

const SPIN_MS = 4200;

export function mountGame(container: HTMLElement, options: GameOptions): WidgetHandle & { controller: GameController } {
  const { doc, win, rtl, reducedMotion } = resolveUi(options);
  const { entry } = options;
  const cfg = entry.config;
  const clock = options.clock ?? systemClock;
  const m: GameMessages = resolveGameMessages(options.locale, options.messages as Partial<GameMessages> | undefined);
  const date = options.formatDate ?? ((iso: string) => new Date(iso).toLocaleDateString(options.locale));
  const controller = createGameController({
    id: entry.id,
    variantId: entry.variant_id,
    config: cfg,
    api: options.api,
    onEvent: options.onEvent,
    deviceId: options.deviceId,
    country: options.country,
    consentVersion: options.consentVersion,
    newId: options.newId,
    clock,
    reducedMotion,
    describe: (code, e) => (e && e.code === "network" ? m.errNetwork : ((m as unknown as Record<string, string>)[`err_${code}`] ?? m.errGeneric)),
  });

  const root = widgetRoot(doc, "game", entry.id, cfg.title, { dir: rtl ? "rtl" : "ltr", "data-mechanic": cfg.mechanic, "data-motion": reducedMotion ? "reduced" : "full" });
  applyTheme(root, options.theme);
  const live = el(doc, "div", { class: "cs-sr", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const head = el(doc, "div", { class: "cs-game__head" }, el(doc, "h3", { class: "cs-game__title" }, cfg.title), cfg.description ? el(doc, "p", { class: "cs-game__desc" }, cfg.description) : null);
  const closeBtn = options.onClose ? el(doc, "button", { type: "button", class: "cs-game__close", "aria-label": m.close }, "×") : null;
  if (closeBtn) closeBtn.addEventListener("click", () => options.onClose?.());
  const stageHost = el(doc, "div", { class: "cs-game__stage" });
  const rules = el(doc, "div", { class: "cs-game__rules" });
  const actions = el(doc, "div", { class: "cs-game__actions" });
  const resultBox = el(doc, "div", { class: "cs-game__result", hidden: true });
  const info = el(doc, "p", { class: "cs-game__info" });
  const warn = el(doc, "p", { class: "cs-game__warn", role: "alert", hidden: true });
  root.append(...(closeBtn ? [closeBtn] : []), head, live, rules, stageHost, warn, actions, resultBox, info);
  container.append(root);

  const say = (text: string): void => {
    live.textContent = "";
    live.textContent = text;
  };
  const timers = new Set<unknown>();
  const later = (fn: () => void, ms: number): void => {
    const h = clock.setTimeout(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
  };

  // ─── Bases, edad y consentimiento: casillas reales ───
  const boxes = new Map<string, HTMLInputElement>();
  const check = (key: "terms" | "age" | "consent", label: string, extra?: HTMLElement): void => {
    const id = `cs-game-${entry.id}-${key}`;
    const input = el(doc, "input", { type: "checkbox", id, "data-game-check": key });
    input.addEventListener("change", () => controller.accept({ [key]: input.checked }));
    boxes.set(key, input);
    rules.append(el(doc, "div", { class: "cs-game__rule" }, input, el(doc, "label", { for: id }, label), extra));
  };
  if (cfg.terms) {
    const termsHref = safeHttpsUrl(cfg.terms.url);
    const link = termsHref ? el(doc, "a", { href: termsHref, target: "_blank", rel: "noopener noreferrer", class: "cs-game__terms" }, m.termsLink) : undefined;
    check("terms", fmt(m.termsCheck, { version: cfg.terms.version }), link);
    if (cfg.terms.summary) rules.append(el(doc, "p", { class: "cs-game__summary" }, cfg.terms.summary));
  }
  if (cfg.min_age > 0) check("age", fmt(m.ageCheck, { age: cfg.min_age }));
  if (cfg.identified) check("consent", m.consentCheck);

  // ─── Botones ───
  const playBtn = el(doc, "button", { type: "button", class: "cs-game__btn cs-game__btn--primary", "data-game-action": "play" }, cfg.cta_label || m.play);
  const skipBtn = el(doc, "button", { type: "button", class: "cs-game__btn", "data-game-action": "skip" }, cfg.mechanic === "wheel" ? m.skip : m.reveal);
  const retryBtn = el(doc, "button", { type: "button", class: "cs-game__btn", "data-game-action": "retry" }, m.retry);
  const againBtn = el(doc, "button", { type: "button", class: "cs-game__btn", "data-game-action": "again" }, m.playAgain);
  playBtn.addEventListener("click", () => void controller.play());
  retryBtn.addEventListener("click", () => void controller.retry());
  skipBtn.addEventListener("click", () => finishStage());
  againBtn.addEventListener("click", () => controller.again());

  // ─── Escenarios por mecánica ───
  let finish: (() => void) | null = null;
  function finishStage(): void {
    (finish ?? (() => controller.reveal()))();
  }
  const prizeIndex = (r: GamePlayResult): number => Math.max(0, cfg.prizes.findIndex((p) => p.id === r.prize?.id));
  const palette = (i: number, p: GamePublicPrize): string => safeColor(p.color) ?? (i % 2 === 0 ? "hsl(var(--cs-primary))" : "hsl(var(--cs-card))");

  function buildIdle(): HTMLElement {
    const hint = { wheel: m.wheelHint, scratch: m.scratchHint, prize_card: m.flipHint, memory: m.memoryHint, match3: m.match3Hint }[cfg.mechanic];
    const box = el(doc, "div", { class: "cs-game__idle" });
    if (cfg.mechanic === "wheel") box.append(wheel(0, false));
    else box.append(el(doc, "div", { class: "cs-game__placeholder", "aria-hidden": "true" }, "🎁"));
    box.append(el(doc, "p", { class: "cs-game__hint" }, hint));
    // La lista de premios posibles, para quien no ve la ruleta.
    if (cfg.prizes.length > 1) box.append(el(doc, "ul", { class: "cs-sr", "aria-label": m.prizes }, ...cfg.prizes.map((p) => el(doc, "li", {}, p.label))));
    return box;
  }

  function wheel(angle: number, animate: boolean): HTMLElement {
    const n = cfg.prizes.length;
    const seg = 360 / n;
    const stops = cfg.prizes.map((p, i) => `${palette(i, p)} ${(i * seg).toFixed(3)}deg ${((i + 1) * seg).toFixed(3)}deg`).join(", ");
    const disc = el(doc, "div", { class: "cs-game__disc", "aria-hidden": "true", style: { background: `conic-gradient(${stops})`, transform: `rotate(${angle}deg)`, transition: animate && !reducedMotion ? `transform ${SPIN_MS}ms cubic-bezier(.17,.67,.12,1)` : "none" } });
    cfg.prizes.forEach((p, i) => disc.append(el(doc, "span", { class: "cs-game__seg", style: { "--cs-seg-a": `${((i + 0.5) * seg).toFixed(3)}deg` } }, p.label)));
    return el(doc, "div", { class: "cs-game__wheel" }, el(doc, "div", { class: "cs-game__pointer", "aria-hidden": "true" }), disc);
  }

  /** La tarjeta con el premio ya decidido (debajo de lo que se rasca, de la carta, de las casillas). */
  const prizeFace = (r: GamePlayResult): HTMLElement => el(doc, "div", { class: "cs-game__face", "data-outcome": r.outcome }, el(doc, "strong", {}, r.prize?.label ?? m.lost));

  function buildStage(r: GamePlayResult): HTMLElement {
    const box = el(doc, "div", { class: "cs-game__play" });
    const done = (): void => controller.reveal();
    finish = done;
    if (cfg.mechanic === "wheel") {
      const n = cfg.prizes.length;
      const target = wheelAngle(prizeIndex(r), n);
      const node = wheel(0, true);
      box.append(node);
      const disc = node.querySelector<HTMLElement>(".cs-game__disc")!;
      say(m.spinning);
      if (reducedMotion) {
        disc.style.transform = `rotate(${wheelAngle(prizeIndex(r), n, 0)}deg)`;
        done();
      } else {
        // Dos fotogramas: el primero pinta el reposo, el segundo dispara la transición.
        later(() => {
          disc.style.transform = `rotate(${target}deg)`;
          later(done, SPIN_MS + 120);
        }, 30);
      }
      finish = () => {
        disc.style.transition = "none";
        disc.style.transform = `rotate(${wheelAngle(prizeIndex(r), n, 0)}deg)`;
        done();
      };
    } else if (cfg.mechanic === "scratch") {
      const face = prizeFace(r);
      const cover = el(doc, "div", { class: "cs-game__cover", role: "img", "aria-label": m.scratchArea });
      const canvas = typeof win.CanvasRenderingContext2D === "function" ? el(doc, "canvas", { class: "cs-game__canvas", width: 300, height: 160, "aria-hidden": "true" }) : null;
      const card = el(doc, "div", { class: "cs-game__card" }, face, canvas ?? cover);
      box.append(card, el(doc, "p", { class: "cs-game__hint" }, m.scratchHint));
      const ctx2d = canvas?.getContext("2d") ?? null;
      if (canvas && ctx2d) {
        // El plateado sale del token (`color` del canvas en game.css), nunca de un valor fijo.
        ctx2d.fillStyle = win.getComputedStyle(canvas).color || "gray";
        ctx2d.fillRect(0, 0, 300, 160);
        let scratching = false;
        let moves = 0;
        const scratch = (e: PointerEvent): void => {
          if (!scratching) return;
          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / (rect.width || 300)) * 300;
          const y = ((e.clientY - rect.top) / (rect.height || 160)) * 160;
          ctx2d.globalCompositeOperation = "destination-out";
          ctx2d.beginPath();
          ctx2d.arc(x, y, 18, 0, Math.PI * 2);
          ctx2d.fill();
          if (++moves % 6 === 0) {
            const px = ctx2d.getImageData(0, 0, 300, 160).data;
            let clear = 0;
            for (let i = 3; i < px.length; i += 4 * 16) if (px[i] === 0) clear++;
            if (clear / (px.length / (4 * 16)) > 0.55) done();
          }
        };
        canvas.addEventListener("pointerdown", (e) => { scratching = true; scratch(e); });
        canvas.addEventListener("pointermove", scratch);
        win.addEventListener("pointerup", () => { scratching = false; });
      }
      finish = () => {
        card.setAttribute("data-open", "true");
        done();
      };
      if (reducedMotion) finish();
    } else if (cfg.mechanic === "prize_card") {
      const front = el(doc, "span", { class: "cs-game__front", "aria-hidden": "true" }, "🎁");
      const btn = el(doc, "button", { type: "button", class: "cs-game__flip", "aria-label": m.flipCard, "aria-pressed": "false" }, el(doc, "div", { class: "cs-game__flipper" }, front, prizeFace(r)));
      const flip = (): void => {
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("data-open", "true");
        later(done, reducedMotion ? 0 : 450);
      };
      btn.addEventListener("click", flip);
      box.append(btn, el(doc, "p", { class: "cs-game__hint" }, m.flipHint));
      finish = () => {
        btn.setAttribute("data-open", "true");
        btn.setAttribute("aria-pressed", "true");
        done();
      };
      if (reducedMotion) finish();
    } else if (cfg.mechanic === "memory") {
      const pairs = cfg.board?.pairs ?? 6;
      const order = memoryBoard(pairs, r.board_seed ?? r.play_id);
      const grid = el(doc, "div", { class: "cs-game__grid", role: "group", "aria-label": cfg.title });
      const matched = new Set<number>();
      let open: number[] = [];
      let lock = false;
      const buttons = order.map((sym, i) => {
        const b = el(doc, "button", { type: "button", class: "cs-game__tile", "aria-label": fmt(m.cardFaceDown, { n: i + 1 }), "data-state": "down" }, el(doc, "span", { "aria-hidden": "true" }, "?"));
        const show = (on: boolean): void => {
          b.setAttribute("data-state", on ? "up" : "down");
          b.setAttribute("aria-label", on ? fmt(m.cardFaceUp, { n: i + 1, symbol: SYMBOLS[sym % SYMBOLS.length]! }) : fmt(m.cardFaceDown, { n: i + 1 }));
          b.firstElementChild!.textContent = on ? SYMBOLS[sym % SYMBOLS.length]! : "?";
        };
        b.addEventListener("click", () => {
          if (lock || matched.has(i) || open.includes(i)) return;
          show(true);
          open.push(i);
          if (open.length < 2) return;
          const [a, c] = open as [number, number];
          if (order[a] === order[c]) {
            matched.add(a);
            matched.add(c);
            open = [];
            buttons[a]!.setAttribute("data-state", "matched");
            buttons[c]!.setAttribute("data-state", "matched");
            if (matched.size === order.length) later(done, reducedMotion ? 0 : 400);
          } else {
            lock = true;
            later(() => {
              for (const k of [a, c]) {
                const bb = buttons[k]!;
                bb.setAttribute("data-state", "down");
                bb.setAttribute("aria-label", fmt(m.cardFaceDown, { n: k + 1 }));
                bb.firstElementChild!.textContent = "?";
              }
              open = [];
              lock = false;
            }, reducedMotion ? 0 : 700);
          }
        });
        return b;
      });
      grid.append(...buttons);
      box.append(grid, el(doc, "p", { class: "cs-game__hint" }, m.memoryHint));
      finish = done;
      if (reducedMotion) {
        // Sin animación: el tablero ya está resuelto y el resultado, a la vista.
        buttons.forEach((b) => b.setAttribute("data-state", "matched"));
        done();
      }
    } else {
      // match3: tres casillas que se descubren de a una; con premio salen tres iguales, sin él nunca.
      const tiles = match3Tiles(r.outcome === "win", r.prize?.id ?? null, r.board_seed ?? r.play_id);
      let shown = 0;
      const row = el(doc, "div", { class: "cs-game__grid cs-game__grid--three", role: "group", "aria-label": cfg.title });
      const buttons = tiles.map((sym, i) => {
        const b = el(doc, "button", { type: "button", class: "cs-game__tile", "aria-label": fmt(m.tileHidden, { n: i + 1 }), "data-state": "down" }, el(doc, "span", { "aria-hidden": "true" }, "?"));
        b.addEventListener("click", () => {
          if (b.getAttribute("data-state") === "up") return;
          b.setAttribute("data-state", "up");
          b.setAttribute("aria-label", fmt(m.tileShown, { n: i + 1, symbol: SYMBOLS[sym]! }));
          b.firstElementChild!.textContent = SYMBOLS[sym]!;
          if (++shown === tiles.length) later(done, reducedMotion ? 0 : 350);
        });
        return b;
      });
      row.append(...buttons);
      box.append(row, el(doc, "p", { class: "cs-game__hint" }, m.match3Hint));
      finish = () => {
        buttons.forEach((b, i) => {
          b.setAttribute("data-state", "up");
          b.firstElementChild!.textContent = SYMBOLS[tiles[i]!]!;
        });
        done();
      };
      if (reducedMotion) finish();
    }
    return box;
  }

  // ─── Resultado ───
  function renderResult(r: GamePlayResult): void {
    resultBox.replaceChildren();
    resultBox.hidden = false;
    resultBox.setAttribute("data-outcome", r.outcome);
    const prize = r.prize;
    const headline = r.outcome === "win" && prize ? (cfg.copy.win ?? fmt(m.won, { prize: prize.label })) : (cfg.copy.lose ?? m.lost);
    resultBox.append(el(doc, "p", { class: "cs-game__headline" }, headline));
    if (prize?.points) resultBox.append(el(doc, "p", { class: "cs-game__points" }, fmt(m.points, { n: prize.points })));
    if (prize?.code) {
      const code = el(doc, "code", { class: "cs-game__code" }, prize.code);
      const copy = el(doc, "button", { type: "button", class: "cs-game__btn", "data-game-action": "copy" }, m.copy);
      copy.addEventListener("click", () => {
        void (win.navigator?.clipboard?.writeText(prize.code!) ?? Promise.reject(new Error("no clipboard"))).then(() => say(m.copied), () => undefined);
      });
      resultBox.append(el(doc, "p", { class: "cs-game__codeline" }, el(doc, "span", {}, `${m.codeLabel}: `), code), copy);
      if (prize.valid_until) resultBox.append(el(doc, "p", { class: "cs-game__valid" }, fmt(m.validUntil, { date: date(prize.valid_until) })));
    }
    say(prize?.code ? `${headline} ${m.codeLabel}: ${prize.code}` : headline);
  }

  // ─── Render según el estado ───
  let rendered: GamePhase | null = null;
  let rendering = false;
  let dirty = false;
  const show = (nodes: Array<HTMLElement | null>): void => {
    stageHost.replaceChildren(...(nodes.filter(Boolean) as HTMLElement[]));
  };
  const render = (): void => {
    // Una mecánica con reduce motion revela dentro de su propio montaje: se vuelve a pintar al terminar, nunca anidado.
    if (rendering) {
      dirty = true;
      return;
    }
    rendering = true;
    do {
      dirty = false;
      paint();
    } while (dirty);
    rendering = false;
  };
  const paint = (): void => {
    const s = controller.snapshot();
    const loading = s.phase === "loading";
    root.setAttribute("data-phase", s.phase);
    root.setAttribute("aria-busy", loading || s.phase === "playing" ? "true" : "false");
    // El escenario solo se reconstruye al cambiar de fase (las casillas no se pierden con cada clic).
    if (rendered !== s.phase) {
      if (s.phase === "loading") show([el(doc, "p", { class: "cs-game__loading" }, m.loading)]);
      else if (s.phase === "ready" || s.phase === "blocked" || s.phase === "error" || s.phase === "playing") show([buildIdle()]);
      else if ((s.phase === "revealing") && s.result) show([buildStage(s.result)]);
      if (s.phase === "done" && s.result) renderResult(s.result);
      if (s.phase !== "done") {
        resultBox.hidden = true;
        resultBox.replaceChildren();
      }
      rendered = s.phase;
    }
    rules.hidden = s.phase !== "ready";
    playBtn.disabled = s.phase === "playing";
    playBtn.textContent = s.phase === "playing" ? m.loading : cfg.cta_label || m.play;
    const showPlay = s.phase === "ready" || s.phase === "playing";
    const showAgain = s.phase === "done" && (s.playsRemaining ?? 0) > 0;
    actions.replaceChildren(...([showPlay ? playBtn : null, s.phase === "revealing" ? skipBtn : null, s.phase === "error" ? retryBtn : null, showAgain ? againBtn : null].filter(Boolean) as HTMLElement[]));
    // Avisos: lo que falta marcar y los errores.
    const text = s.missing ? { terms: m.needTerms, age: m.needAge, consent: m.needConsent }[s.missing] : s.error?.message ?? "";
    warn.hidden = !text;
    warn.textContent = text;
    if (text && s.phase !== "ready") say(text);
    const bits: string[] = [];
    if (s.playsRemaining !== null && s.phase !== "loading") bits.push(s.playsRemaining > 0 ? fmt(m.playsLeft, { n: s.playsRemaining }) : m.noPlaysLeft);
    if (s.nextPlayAt && (s.playsRemaining ?? 0) <= 0) bits.push(fmt(m.nextPlay, { date: date(s.nextPlayAt) }));
    info.textContent = bits.join(" · ");
    for (const [k, input] of boxes) input.checked = Boolean(s[k as "terms" | "age" | "consent"]);
  };
  const unsubscribe = controller.subscribe(render);
  render();
  void controller.load();

  return {
    element: root,
    controller,
    destroy() {
      unsubscribe();
      for (const h of timers) clock.clearTimeout(h);
      timers.clear();
      root.remove();
    },
  };
}

// ─── Un juego referenciado desde una página (componente `game`): en un diálogo ───

export type GameDialogOptions = Omit<GameOptions, "entry"> & { gameId: string };

/**
 * Abre un `<dialog>` modal con el juego `gameId`: pide su estado (que trae la configuración pública), lo monta y devuelve el manejador.
 * Esc cierra (es lo propio de `<dialog>`); el foco vuelve a quien lo abrió. Es lo que la app pasa como `openGame` al visor.
 */
export async function openGameDialog(options: GameDialogOptions): Promise<WidgetHandle> {
  const { doc } = resolveUi(options);
  const opener = doc.activeElement as HTMLElement | null;
  const dialog = el(doc, "dialog", { class: "cs-game-dialog", "aria-label": "game" });
  doc.body.append(dialog);
  const state = await options.api.state().catch(() => null);
  const config = state?.config;
  const close = (): void => {
    handle.destroy();
  };
  const handle: WidgetHandle = (() => {
    if (!config) {
      const m = resolveGameMessages(options.locale);
      dialog.append(el(doc, "p", {}, m.err_game_not_found));
      return { element: dialog, destroy: () => { if (dialog.open) dialog.close(); dialog.remove(); opener?.focus?.(); } };
    }
    const mounted = mountGame(dialog, { ...options, entry: { id: options.gameId, config }, onClose: close });
    return { element: dialog, destroy: () => { mounted.destroy(); if (dialog.open) dialog.close(); dialog.remove(); opener?.focus?.(); } };
  })();
  dialog.addEventListener("close", () => handle.destroy());
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return handle;
}
