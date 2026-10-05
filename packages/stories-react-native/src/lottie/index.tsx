/**
 * @customyai/stories-react-native/lottie — adaptador para `lottie-react-native`. Igual que el de vídeo, recibe el
 * componente de la app (no importa la librería). Sin él, las capas `lottie` simplemente no se pintan.
 *
 *   import LottieView from "lottie-react-native";
 *   <StoriesProvider lottie={createLottieAdapter(LottieView)} …>
 */
import { useEffect, useRef, type ComponentType } from "react";
import type { LottieAdapter, StoryLottieProps } from "../adapters";

type LottieHandle = { play?: () => void; pause?: () => void; reset?: () => void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LottieComponentLike = ComponentType<any>;

export function createLottieAdapter(Lottie: LottieComponentLike): LottieAdapter {
  function StoryLottie(p: StoryLottieProps) {
    const ref = useRef<LottieHandle | null>(null);
    useEffect(() => {
      // Con «reducir movimiento» o la página en pausa se queda quieta en su primer fotograma.
      if (p.paused || !p.autoplay) ref.current?.pause?.();
      else ref.current?.play?.();
    }, [p.paused, p.autoplay]);
    return (
      <Lottie
        ref={ref}
        source={{ uri: p.uri }}
        autoPlay={p.autoplay && !p.paused}
        loop={p.loop}
        style={p.style}
        resizeMode="contain"
        accessible={!!p.accessibilityLabel}
        accessibilityLabel={p.accessibilityLabel}
        importantForAccessibility={p.accessibilityLabel ? "yes" : "no-hide-descendants"}
      />
    );
  }
  return { Component: StoryLottie };
}
