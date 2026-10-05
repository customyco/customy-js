import type { ComponentType } from "react";
import type { StyleProp, ViewStyle } from "react-native";

/**
 * Adaptador de reproductor de vídeo: el paquete NO fija `react-native-video` (ni `expo-video`). La app inyecta un
 * componente con este contrato; `@customyai/stories-react-native/video` trae el oficial para `react-native-video`.
 * Sin adaptador, las páginas con vídeo muestran su póster y corren con temporizador (degradación declarada).
 */
export type StoryVideoProps = {
  uri: string;
  posterUri: string;
  muted: boolean;
  loop: boolean;
  /** El visor pausa por la persona, el mantener pulsado, una hoja, segundo plano o la pausa de superficie. */
  paused: boolean;
  resizeMode: "cover" | "contain";
  captions: ReadonlyArray<{ lang: string; label?: string; url: string }>;
  captionsEnabled: boolean;
  /** Solo el vídeo principal de la página lleva el reloj de la historia (`onProgress`/`onEnd`). */
  primary: boolean;
  /** Tiempo y duración en ms. */
  onProgress: (currentMs: number, durationMs?: number) => void;
  onEnd: () => void;
  onBuffering: (buffering: boolean) => void;
  /** No se pudo reproducir: la página sigue con el póster. */
  onError: () => void;
  onReady: () => void;
  style: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export type VideoPlayerAdapter = {
  Component: ComponentType<StoryVideoProps>;
  /** Calienta el vídeo siguiente (p. ej. un pool de reproductores). Cancelable por `signal`. */
  preload?: (uri: string, signal: AbortSignal) => Promise<void>;
};

export type StoryLottieProps = {
  uri: string;
  loop: boolean;
  /** `false` con «reducir movimiento»: se muestra el primer fotograma. */
  autoplay: boolean;
  paused: boolean;
  style: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};
export type LottieAdapter = { Component: ComponentType<StoryLottieProps> };

/** Almacenamiento clave-valor del estado «visto», frecuencia, descartes y cola de eventos (ver `./storage`). */
export type { KeyValueStore } from "@customyai/stories-render";
