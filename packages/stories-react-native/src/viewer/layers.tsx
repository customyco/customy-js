import { useEffect, useMemo, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, type ImageStyle, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { fontPx, layerBox, resolveAnimations, type StoryBackground, type StoryLayer, type VideoLayer, type Viewport } from "../core";
import type { LottieAdapter, VideoPlayerAdapter } from "../adapters";
import { mediaUri, type MediaCache } from "../media";
import { motionAt, toMotionSpecs } from "../motion";
import type { StoriesTheme } from "../theme";

export const HIDDEN_FROM_AT = { accessible: false, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Lo que toda capa necesita de la página en curso. */
export type PageEnv = {
  vp: Viewport;
  theme: StoriesTheme;
  rtl: boolean;
  reducedMotion: boolean;
  pageDurationMs: number;
  /** 0–1 del avance de la página: lo mueve el visor; las animaciones lo evalúan (pausa = congelado). */
  progress: SharedValue<number>;
  mediaCache: MediaCache;
  video?: VideoPlayerAdapter;
  lottie?: LottieAdapter;
  /** Qué vídeo lleva el reloj de la historia (`"bg"` o el id de la capa). */
  primaryVideo?: string;
  playing: boolean;
  muted: boolean;
  captionsOn: boolean;
  onVideoProgress: (currentMs: number, durationMs?: number) => void;
  onVideoEnd: () => void;
  onVideoBuffering: (buffering: boolean) => void;
  onVideoError: () => void;
};

const fill = StyleSheet.absoluteFill;

const WEIGHT = { regular: "400", medium: "500", bold: "700" } as const;

type FrameProps = { layer: StoryLayer; env: PageEnv; children: ReactNode };

function StaticFrame({ layer, env, children }: FrameProps) {
  const b = layerBox(layer, env.vp);
  return (
    <View testID={`cs-layer-${layer.id}`} pointerEvents="none" style={[styles.layer, { left: b.left, top: b.top, width: b.width, height: b.height, opacity: layer.opacity }, layer.rotation ? { transform: [{ rotate: `${layer.rotation}deg` }] } : null]}>
      {children}
    </View>
  );
}

function AnimatedFrame({ layer, env, specs, children }: FrameProps & { specs: ReturnType<typeof toMotionSpecs> }) {
  const b = layerBox(layer, env.vp);
  const { progress, pageDurationMs } = env;
  const { opacity, rotation } = layer;
  const style = useAnimatedStyle(() => {
    const m = motionAt(specs, progress.value * pageDurationMs);
    return {
      opacity: opacity * m.opacity,
      transform: [{ translateX: m.translateX }, { translateY: m.translateY }, { scale: m.scale }, { rotate: `${rotation}deg` }],
    };
  });
  return (
    <Animated.View testID={`cs-layer-${layer.id}`} pointerEvents="none" style={[styles.layer, { left: b.left, top: b.top, width: b.width, height: b.height }, style]}>
      {children}
    </Animated.View>
  );
}

/** Marco de una capa: caja relativa al lienzo, rotación, opacidad y animaciones declarativas (ninguna con «reducir movimiento»). */
function LayerFrame({ layer, env, children }: FrameProps) {
  const specs = useMemo(
    () => toMotionSpecs(resolveAnimations(layer.animations, { reducedMotion: env.reducedMotion, pageDurationMs: env.pageDurationMs })),
    [layer.animations, env.reducedMotion, env.pageDurationMs],
  );
  return specs.length > 0 ? (
    <AnimatedFrame layer={layer} env={env} specs={specs}>
      {children}
    </AnimatedFrame>
  ) : (
    <StaticFrame layer={layer} env={env}>
      {children}
    </StaticFrame>
  );
}

const altOf = (x: { decorative: boolean; alt?: string }): string | undefined => (x.decorative ? undefined : x.alt);

function ImageView({ url, fit, alt, decorative, env, style, testID }: { url: string; fit: "fit" | "fill"; alt?: string; decorative: boolean; env: PageEnv; style?: ImageStyle; testID?: string }) {
  return (
    <Image
      testID={testID}
      source={{ uri: mediaUri(env.mediaCache, url, "image") }}
      resizeMode={fit === "fit" ? "contain" : "cover"}
      style={[fill, style]}
      {...(decorative ? HIDDEN_FROM_AT : { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: alt ?? "" })}
    />
  );
}

/** Vídeo con el adaptador inyectado; sin él (o si falla), el póster y el temporizador de la página. */
function VideoView({ url, poster, loop, fit, captions, label, primary, env }: { url: string; poster: string; loop: boolean; fit: "fit" | "fill"; captions: VideoLayer["captions"]; label?: string; primary: boolean; env: PageEnv }) {
  const Adapter = env.video?.Component;
  const { onVideoError } = env;
  useEffect(() => {
    // Sin reproductor la página no puede esperar a un reloj de vídeo que nunca llegará.
    if (!Adapter && primary) onVideoError();
  }, [Adapter, primary, onVideoError]);
  return (
    <View testID={`cs-video-${primary ? "primary" : "secondary"}`} style={fill} {...(label ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label } : HIDDEN_FROM_AT)}>
      <Image source={{ uri: mediaUri(env.mediaCache, poster, "image") }} resizeMode={fit === "fit" ? "contain" : "cover"} style={fill} {...HIDDEN_FROM_AT} />
      {Adapter ? (
        <Adapter
          uri={mediaUri(env.mediaCache, url, "video")}
          posterUri={poster}
          muted={env.muted}
          loop={loop}
          paused={!env.playing}
          resizeMode={fit === "fit" ? "contain" : "cover"}
          captions={captions}
          captionsEnabled={env.captionsOn}
          primary={primary}
          onProgress={primary ? env.onVideoProgress : noop}
          onEnd={primary ? env.onVideoEnd : noop}
          onBuffering={primary ? env.onVideoBuffering : noop}
          onError={primary ? env.onVideoError : noop}
          onReady={noop}
          style={fill}
        />
      ) : null}
    </View>
  );
}
function noop(): void {
  /* el vídeo secundario no lleva el reloj */
}

export function BackgroundView({ bg, env }: { bg: StoryBackground | undefined; env: PageEnv }) {
  if (!bg) return null;
  if (bg.type === "color") return <View testID="cs-bg-color" pointerEvents="none" style={[fill, { backgroundColor: bg.color }]} {...HIDDEN_FROM_AT} />;
  if (bg.type === "image") return <ImageView testID="cs-bg-image" url={bg.url} fit={bg.fit} alt={altOf(bg)} decorative={bg.decorative} env={env} />;
  return <VideoView url={bg.url} poster={bg.poster} loop={false} fit={bg.fit} captions={bg.captions} label={altOf(bg)} primary={env.primaryVideo === "bg"} env={env} />;
}

function shapeStyle(layer: Extract<StoryLayer, { type: "shape" }>, vp: Viewport, box: { width: number; height: number }): ViewStyle {
  const stroke = layer.stroke && layer.stroke_width ? Math.max(1, layer.stroke_width * vp.width) : 0;
  if (layer.shape === "line") return { width: "100%", height: Math.max(1, stroke || 2), alignSelf: "center", backgroundColor: layer.stroke ?? layer.fill, borderRadius: 999 };
  const short = Math.min(box.width, box.height);
  return {
    flex: 1,
    backgroundColor: layer.fill,
    borderRadius: layer.shape === "ellipse" ? short / 2 : layer.radius * short,
    ...(stroke ? { borderWidth: stroke, borderColor: layer.stroke } : null),
  };
}

function LayerContent({ layer, env }: { layer: StoryLayer; env: PageEnv }) {
  const { vp, theme, rtl } = env;
  switch (layer.type) {
    case "text": {
      const align = layer.align === "center" ? "center" : (layer.align === "start") !== rtl ? "left" : "right";
      return (
        <Text
          // El texto del lienzo escala con el visor (como una imagen); los componentes sí respetan el tamaño del sistema.
          allowFontScaling={false}
          style={[
            { fontSize: fontPx(layer.font_size, vp), fontWeight: WEIGHT[layer.weight], textAlign: align, color: layer.color ?? theme.viewerForeground },
            layer.background ? { backgroundColor: layer.background, paddingHorizontal: vp.width * 0.02, paddingVertical: vp.width * 0.01 } : { textShadowColor: theme.viewerScrim as string, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
          ]}
          {...(layer.decorative ? HIDDEN_FROM_AT : layer.alt ? { accessibilityLabel: layer.alt } : null)}
        >
          {layer.text}
        </Text>
      );
    }
    case "image":
      return <ImageView url={layer.url} fit={layer.fit} alt={altOf(layer)} decorative={layer.decorative} env={env} />;
    case "sticker":
      return <ImageView url={layer.url} fit="fit" alt={altOf(layer)} decorative={layer.decorative} env={env} />;
    case "video":
      return <VideoView url={layer.url} poster={layer.poster} loop={layer.loop} fit={layer.fit} captions={layer.captions} label={altOf(layer)} primary={env.primaryVideo === layer.id} env={env} />;
    case "shape": {
      const b = layerBox(layer, vp);
      return <View style={shapeStyle(layer, vp, b)} {...HIDDEN_FROM_AT} />;
    }
    case "lottie": {
      const Lottie = env.lottie?.Component;
      if (!Lottie) return null;
      return <Lottie uri={mediaUri(env.mediaCache, layer.url, "lottie")} loop={layer.loop} autoplay={!env.reducedMotion} paused={!env.playing || env.reducedMotion} style={fill} accessibilityLabel={altOf(layer)} />;
    }
  }
}

export function LayerView({ layer, env }: { layer: StoryLayer; env: PageEnv }) {
  // Una capa lottie sin adaptador no pinta nada: tampoco reserva marco.
  if (layer.type === "lottie" && !env.lottie) return null;
  return (
    <LayerFrame layer={layer} env={env}>
      <LayerContent layer={layer} env={env} />
    </LayerFrame>
  );
}

const styles = StyleSheet.create({ layer: { position: "absolute" } });
