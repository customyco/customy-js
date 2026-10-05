import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPagePlayer, type PageState } from "./page-player";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("máquina de estados de página", () => {
  it("loading → ready → playing → completed con el temporizador de imagen", () => {
    const states: PageState[] = [];
    const onComplete = vi.fn();
    const p = createPagePlayer({ durationMs: 7000, onChange: (s) => states.push(s.state), onComplete });
    expect(p.state).toBe("loading");
    p.ready();
    expect(p.state).toBe("playing");
    vi.advanceTimersByTime(3500);
    expect(p.snapshot().progress).toBeCloseTo(0.5, 2);
    vi.advanceTimersByTime(3500);
    expect(p.state).toBe("completed");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["playing", "completed"]);
    expect(p.snapshot().progress).toBe(1);
  });

  it("autoplay:false se queda en ready hasta play()", () => {
    const p = createPagePlayer({ durationMs: 1000, autoplay: false });
    p.ready();
    expect(p.state).toBe("ready");
    p.play();
    expect(p.state).toBe("playing");
  });

  it("playing ⇄ paused no pierde ni gana tiempo", () => {
    const onComplete = vi.fn();
    const p = createPagePlayer({ durationMs: 4000, onComplete });
    p.ready();
    vi.advanceTimersByTime(1000);
    p.pause("user");
    expect(p.state).toBe("paused");
    vi.advanceTimersByTime(60_000);
    expect(p.snapshot().elapsedMs).toBe(1000);
    expect(onComplete).not.toHaveBeenCalled();
    p.resume("user");
    expect(p.state).toBe("playing");
    vi.advanceTimersByTime(2999);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(p.playedMs()).toBe(4000);
  });

  it("varios motivos de pausa: solo reanuda al quitar el último", () => {
    const p = createPagePlayer({ durationMs: 4000 });
    p.ready();
    p.pause("user");
    p.pause("hidden");
    p.resume("user");
    expect(p.state).toBe("paused");
    p.resume("hidden");
    expect(p.state).toBe("playing");
  });

  it("empieza pausada si hay un motivo inicial (reduced-motion) y no avanza", () => {
    const onComplete = vi.fn();
    const p = createPagePlayer({ durationMs: 2000, initialPauses: ["reduced-motion"], onComplete });
    p.ready();
    expect(p.state).toBe("paused");
    vi.advanceTimersByTime(10_000);
    expect(onComplete).not.toHaveBeenCalled();
    p.resume("reduced-motion");
    expect(p.state).toBe("playing");
  });

  it("pausar durante loading difiere el play hasta que esté lista y sin motivos", () => {
    const p = createPagePlayer({ durationMs: 2000 });
    p.pause("surface");
    p.ready();
    expect(p.state).toBe("paused");
    p.resume("surface");
    expect(p.state).toBe("playing");
  });

  it("vídeo: el reloj es el del medio y termina con mediaEnded", () => {
    const onComplete = vi.fn();
    const p = createPagePlayer({ durationMs: 15000, media: true, onComplete });
    p.ready();
    vi.advanceTimersByTime(20_000);
    expect(onComplete).not.toHaveBeenCalled(); // el temporizador no manda
    p.setMediaTime(6000, 12000);
    expect(p.snapshot().progress).toBeCloseTo(0.5, 2);
    p.mediaEnded();
    expect(p.state).toBe("completed");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("vídeo que falla: cae al póster con temporizador", () => {
    const onComplete = vi.fn();
    const p = createPagePlayer({ durationMs: 5000, media: true, onComplete });
    p.ready();
    p.fallbackToPoster();
    expect(p.snapshot()).toMatchObject({ degraded: true, mode: "timer" });
    vi.advanceTimersByTime(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("buffering pausa el reloj", () => {
    const p = createPagePlayer({ durationMs: 5000 });
    p.ready();
    p.pause("buffering");
    expect(p.state).toBe("paused");
    p.resume("buffering");
    expect(p.state).toBe("playing");
  });

  it("completed es terminal y restart() vuelve a empezar", () => {
    const p = createPagePlayer({ durationMs: 1000 });
    p.ready();
    p.complete();
    p.pause("user");
    expect(p.state).toBe("completed");
    p.restart();
    expect(p.state).toBe("playing");
    expect(p.snapshot().elapsedMs).toBe(0);
  });
});
