/**
 * @customyai/stories-react-native/video — adaptador oficial para `react-native-video` (v6+). NO importa la librería:
 * la app pasa su componente `Video`, así el paquete no la fija como dependencia ni se rompe con otra versión mayor.
 *
 *   import Video from "react-native-video";
 *   import { createReactNativeVideoAdapter } from "@customyai/stories-react-native/video";
 *   <StoriesProvider video={createReactNativeVideoAdapter(Video)} …>
 *
 * Para `expo-video` u otro reproductor, escribe un adaptador con el mismo contrato (`VideoPlayerAdapter`).
 */
import { useCallback, useMemo, type ComponentType } from "react";
import type { StoryVideoProps, VideoPlayerAdapter } from "../adapters";

export type ReactNativeVideoOptions = {
  /** Cada cuánto avisa el reloj de la historia (ms). Por defecto 100. */
  progressIntervalMs?: number;
  /** Presupuesto de búfer del reproductor (react-native-video `bufferConfig`), p. ej. para limitar datos móviles. */
  bufferConfig?: Record<string, number>;
  /** Respeta el interruptor de silencio de iOS. Por defecto `true` (un vídeo con voz no se oye con el modo silencio). */
  obeySilentSwitch?: boolean;
};

/** `Video` de react-native-video, tipado de forma estructural (sus tipos cambian entre versiones menores). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VideoComponentLike = ComponentType<any>;

type ProgressEvent = { currentTime: number; seekableDuration?: number; playableDuration?: number };

export function createReactNativeVideoAdapter(Video: VideoComponentLike, options: ReactNativeVideoOptions = {}): VideoPlayerAdapter {
  function StoryVideo(p: StoryVideoProps) {
    const { onProgress, onBuffering, onError, onReady, onEnd } = p;
    const handleProgress = useCallback(
      (e: ProgressEvent) => {
        const dur = e.seekableDuration && e.seekableDuration > 0 ? e.seekableDuration * 1000 : undefined;
        onProgress(e.currentTime * 1000, dur);
      },
      [onProgress],
    );
    const textTracks = useMemo(() => p.captions.map((c) => ({ title: c.label ?? c.lang, language: c.lang, type: "text/vtt", uri: c.url })), [p.captions]);
    const first = p.captions[0];
    return (
      <Video
        source={{ uri: p.uri }}
        poster={{ source: { uri: p.posterUri }, resizeMode: p.resizeMode }}
        style={p.style}
        resizeMode={p.resizeMode}
        paused={p.paused}
        muted={p.muted}
        repeat={p.loop}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch={options.obeySilentSwitch === false ? "ignore" : "obey"}
        progressUpdateInterval={options.progressIntervalMs ?? 100}
        {...(options.bufferConfig ? { bufferConfig: options.bufferConfig } : {})}
        textTracks={textTracks}
        selectedTextTrack={p.captionsEnabled && first ? { type: "language", value: first.lang } : { type: "disabled" }}
        onProgress={handleProgress}
        onEnd={onEnd}
        onBuffer={(e: { isBuffering: boolean }) => onBuffering(e.isBuffering)}
        onError={onError}
        onLoad={onReady}
        accessible={!!p.accessibilityLabel}
        accessibilityLabel={p.accessibilityLabel}
        testID={p.testID}
      />
    );
  }
  return { Component: StoryVideo };
}
