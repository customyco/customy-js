import { systemClock, type Clock, type TimerHandle } from "./clock";

/** Máquina de estados por página: loading → ready → playing ⇄ paused → completed. */
export type PageState = "loading" | "ready" | "playing" | "paused" | "completed";

/** Motivos de pausa: la página solo avanza cuando NO queda ninguno. */
export type PauseReason = "user" | "hold" | "hidden" | "blur" | "reduced-motion" | "buffering" | "surface" | (string & {});

export type PageSnapshot = {
  state: PageState;
  /** 0–1. */
  progress: number;
  elapsedMs: number;
  durationMs: number;
  /** Motivos de pausa activos. */
  pausedBy: readonly PauseReason[];
  /** `true` si el vídeo falló y la página corre con su póster (temporizador). */
  degraded: boolean;
  mode: "timer" | "media";
};

export type PagePlayerOptions = {
  durationMs: number;
  /** `true` si la página lleva vídeo: su reloj es el del medio (`setMediaTime`) hasta que falle. */
  media?: boolean;
  /** Pasar a `playing` sola al estar lista. Por defecto true. */
  autoplay?: boolean;
  /** Motivos de pausa desde el principio (p. ej. `reduced-motion`). */
  initialPauses?: readonly PauseReason[];
  clock?: Clock;
  onChange?: (snapshot: PageSnapshot) => void;
  onComplete?: () => void;
};

export type PagePlayer = ReturnType<typeof createPagePlayer>;

export function createPagePlayer(options: PagePlayerOptions) {
  const clock = options.clock ?? systemClock;
  const autoplay = options.autoplay ?? true;
  const reasons = new Set<PauseReason>(options.initialPauses ?? []);
  let state: PageState = "loading";
  let durationMs = Math.max(1, options.durationMs);
  let mode: "timer" | "media" = options.media ? "media" : "timer";
  let degraded = false;
  let elapsed = 0; // acumulado en modo temporizador
  let startedAt = 0; // instante del último `playing`
  let timer: TimerHandle | null = null;
  let mediaMs = 0;
  let playedMs = 0; // tiempo real en `playing` (para watch_length)
  let destroyed = false;

  const runningMs = (): number => (state === "playing" ? clock.now() - startedAt : 0);
  const elapsedNow = (): number => (mode === "media" ? mediaMs : Math.min(durationMs, elapsed + runningMs()));

  const snapshot = (): PageSnapshot => ({
    state,
    progress: state === "completed" ? 1 : Math.min(1, Math.max(0, elapsedNow() / durationMs)),
    elapsedMs: state === "completed" ? durationMs : elapsedNow(),
    durationMs,
    pausedBy: [...reasons],
    degraded,
    mode,
  });
  const emit = (): void => {
    if (!destroyed) options.onChange?.(snapshot());
  };

  const stopTimer = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const startTimer = (): void => {
    stopTimer();
    if (mode !== "timer") return;
    timer = clock.setTimeout(() => {
      timer = null;
      complete();
    }, Math.max(0, durationMs - elapsed));
  };

  function enterPlaying(): void {
    state = "playing";
    startedAt = clock.now();
    startTimer();
    emit();
  }
  function leavePlaying(next: PageState): void {
    const ran = runningMs();
    playedMs += ran;
    if (mode === "timer") elapsed = Math.min(durationMs, elapsed + ran);
    stopTimer();
    state = next;
  }
  function complete(): void {
    if (destroyed || state === "completed") return;
    if (state === "playing") leavePlaying("completed");
    else {
      stopTimer();
      state = "completed";
    }
    emit();
    options.onComplete?.();
  }

  return {
    snapshot,
    get state(): PageState {
      return state;
    },
    /** Tiempo realmente reproducido (ms), sin contar pausas. */
    playedMs: (): number => playedMs + runningMs(),
    /** Los medios de la página están listos (o ya se resolvió el póster). */
    ready(): void {
      if (state !== "loading") return;
      state = "ready";
      if (reasons.size > 0) {
        state = "paused";
        emit();
      } else if (autoplay) enterPlaying();
      else emit();
    },
    /** Falló el vídeo (tras los reintentos): la página sigue con el póster y su temporizador. */
    fallbackToPoster(): void {
      if (destroyed || state === "completed") return;
      degraded = true;
      if (mode === "media") {
        mode = "timer";
        elapsed = Math.min(durationMs, mediaMs);
        if (state === "playing") {
          startedAt = clock.now();
          startTimer();
        }
      }
      emit();
    },
    play(): void {
      if (state === "ready" && reasons.size === 0) enterPlaying();
      else if (state === "paused" && reasons.size === 0) enterPlaying();
    },
    pause(reason: PauseReason): void {
      if (destroyed || state === "completed") return;
      const had = reasons.has(reason);
      reasons.add(reason);
      if (state === "playing") {
        leavePlaying("paused");
        emit();
      } else if (!had) emit();
    },
    resume(reason: PauseReason): void {
      if (destroyed || state === "completed") return;
      if (!reasons.delete(reason)) return;
      if (reasons.size === 0 && state === "paused") enterPlaying();
      else emit();
    },
    isPausedBy: (reason: PauseReason): boolean => reasons.has(reason),
    /** Reloj del vídeo (ms). Si no se pasa `totalMs`, se usa la duración de la página. */
    setMediaTime(currentMs: number, totalMs?: number): void {
      if (mode !== "media" || destroyed || state === "completed") return;
      if (totalMs && totalMs > 0) durationMs = totalMs;
      mediaMs = Math.max(0, currentMs);
      if (mediaMs >= durationMs && state === "playing") complete();
    },
    mediaEnded(): void {
      if (mode === "media") complete();
    },
    /** Termina la página (avance manual hacia delante). */
    complete,
    /** Vuelve al principio de la página (retroceso dentro de la misma). */
    restart(): void {
      if (destroyed) return;
      stopTimer();
      elapsed = 0;
      mediaMs = 0;
      playedMs = 0;
      if (state === "completed" || state === "playing") {
        state = "ready";
        if (reasons.size > 0) state = "paused";
        else if (autoplay) {
          enterPlaying();
          return;
        }
      }
      emit();
    },
    destroy(): void {
      destroyed = true;
      stopTimer();
    },
  };
}
