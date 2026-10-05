/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { createLottieAdapter } from "../src/lottie";
import { createReactNativeVideoAdapter } from "../src/video";
import type { StoryVideoProps } from "../src/adapters";

const props = (over: Partial<StoryVideoProps> = {}): StoryVideoProps => ({
  uri: "https://cdn.test/v.mp4",
  posterUri: "https://cdn.test/v.jpg",
  muted: true,
  loop: false,
  paused: false,
  resizeMode: "cover",
  captions: [{ lang: "es", label: "Español", url: "https://cdn.test/v.vtt" }],
  captionsEnabled: true,
  primary: true,
  onProgress: vi.fn(),
  onEnd: vi.fn(),
  onBuffering: vi.fn(),
  onError: vi.fn(),
  onReady: vi.fn(),
  style: {},
  ...over,
});

describe("adaptador oficial de react-native-video (sin importar la librería)", () => {
  it("traduce las props de la historia a las del reproductor y sus callbacks al reloj de la historia", () => {
    const Video = vi.fn((_p: Record<string, unknown>) => null);
    const { Component } = createReactNativeVideoAdapter(Video, { progressIntervalMs: 50 });
    const p = props();
    render(<Component {...p} />);
    const v = Video.mock.calls[0]![0] as Record<string, any>;
    expect(v).toMatchObject({ source: { uri: "https://cdn.test/v.mp4" }, paused: false, muted: true, repeat: false, resizeMode: "cover", playInBackground: false, progressUpdateInterval: 50, ignoreSilentSwitch: "obey" });
    expect(v.poster).toMatchObject({ source: { uri: "https://cdn.test/v.jpg" } });
    expect(v.textTracks).toEqual([{ title: "Español", language: "es", type: "text/vtt", uri: "https://cdn.test/v.vtt" }]);
    expect(v.selectedTextTrack).toEqual({ type: "language", value: "es" });
    v.onProgress({ currentTime: 2.5, seekableDuration: 10 });
    expect(p.onProgress).toHaveBeenCalledWith(2500, 10000);
    v.onProgress({ currentTime: 1, seekableDuration: 0 });
    expect(p.onProgress).toHaveBeenLastCalledWith(1000, undefined);
    v.onBuffer({ isBuffering: true });
    expect(p.onBuffering).toHaveBeenCalledWith(true);
    v.onEnd();
    v.onError();
    v.onLoad();
    expect(p.onEnd).toHaveBeenCalled();
    expect(p.onError).toHaveBeenCalled();
    expect(p.onReady).toHaveBeenCalled();
  });

  it("subtítulos desactivados, pausa y bufferConfig", () => {
    const Video = vi.fn((_p: Record<string, unknown>) => null);
    const { Component } = createReactNativeVideoAdapter(Video, { bufferConfig: { minBufferMs: 1000 }, obeySilentSwitch: false });
    render(<Component {...props({ captionsEnabled: false, paused: true, loop: true })} />);
    const v = Video.mock.calls[0]![0] as Record<string, any>;
    expect(v).toMatchObject({ selectedTextTrack: { type: "disabled" }, paused: true, repeat: true, bufferConfig: { minBufferMs: 1000 }, ignoreSilentSwitch: "ignore" });
  });
});

describe("adaptador de Lottie", () => {
  it("reproduce o se queda en el primer fotograma según movimiento y pausa", () => {
    const calls: ComponentProps<ReturnType<typeof createLottieAdapter>["Component"]>[] = [];
    const Lottie = vi.fn((p: Record<string, unknown>) => (calls.push(p as never), null));
    const { Component } = createLottieAdapter(Lottie);
    render(<Component uri="https://cdn.test/a.json" loop autoplay={false} paused={false} style={{}} accessibilityLabel="Confeti" />);
    expect(Lottie.mock.calls[0]![0]).toMatchObject({ source: { uri: "https://cdn.test/a.json" }, autoPlay: false, loop: true, accessible: true, accessibilityLabel: "Confeti" });
    render(<Component uri="https://cdn.test/a.json" loop autoplay paused={false} style={{}} />);
    expect(Lottie.mock.calls[1]![0]).toMatchObject({ autoPlay: true, importantForAccessibility: "no-hide-descendants" });
  });
});
