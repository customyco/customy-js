import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { createGestureRecognizer, type Clock, type GestureIntent, type StoryViewer } from "../core";

type Claim = () => void;
const ClaimContext = createContext<Claim>(() => undefined);

/**
 * Zona interactiva (botón, opción de encuesta, carrusel de productos…): un toque que EMPIEZA aquí es de la
 * zona, no de la historia. Sin esto, pulsar «Comprar» también avanzaría a la página siguiente.
 */
export function Interactive({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const claim = useContext(ClaimContext);
  return (
    <View style={style} onTouchStart={claim}>
      {children}
    </View>
  );
}

export const useClaimTouch = (): Claim => useContext(ClaimContext);
export const ClaimProvider = ClaimContext.Provider;

/**
 * Cablea los gestos del visor: tap por tercios (espejado en RTL), mantener = pausa, swipe horizontal = entre
 * grupos, abajo = cerrar, arriba = abrir el CTA. El reconocimiento es el del núcleo (`createGestureRecognizer`, el
 * mismo de la web); aquí solo se traducen los toques crudos de Gesture Handler (`Gesture.Manual`) a coordenadas.
 * Un gesto manual NO se activa nunca, así que los hijos táctiles (Pressable, ScrollView) siguen funcionando.
 */
export function useViewerGestures(viewer: StoryViewer, options: { rtl: boolean; clock?: Clock; width: number }) {
  const { rtl, clock } = options;
  const widthRef = useRef(options.width);
  widthRef.current = options.width;
  const claimed = useRef(false);
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  const recognizer = useMemo(
    () =>
      createGestureRecognizer({
        rtl,
        clock,
        onIntent(i: GestureIntent) {
          const v = viewerRef.current;
          switch (i.type) {
            case "tap":
              if (i.direction === "next") v.next("tap");
              else if (i.direction === "prev") v.prev("tap");
              break;
            case "hold-start":
              v.hold(true);
              break;
            case "hold-end":
              v.hold(false);
              break;
            case "swipe-group":
              if (i.direction === "next") v.nextGroup();
              else v.prevGroup();
              break;
            case "swipe-down":
              v.close("swipe");
              break;
            case "swipe-up":
              v.swipeUp();
              break;
          }
        },
      }),
    [rtl, clock],
  );
  useEffect(() => () => recognizer.destroy(), [recognizer]);

  const claim = useCallback(() => {
    claimed.current = true;
    recognizer.pointerCancel();
  }, [recognizer]);

  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .onTouchesDown((e) => {
          const t = e.changedTouches[0];
          // Dos dedos (zoom, otro gesto del sistema): no es un toque de la historia.
          if (!t || e.allTouches.length > 1) return recognizer.pointerCancel();
          recognizer.pointerDown({ x: t.x, y: t.y, width: widthRef.current });
        })
        .onTouchesMove((e) => {
          const t = e.changedTouches[0];
          if (t && !claimed.current) recognizer.pointerMove({ x: t.x, y: t.y });
        })
        .onTouchesUp((e) => {
          const t = e.changedTouches[0];
          const wasClaimed = claimed.current;
          if (e.allTouches.length <= 1) claimed.current = false;
          if (wasClaimed || !t) return recognizer.pointerCancel();
          recognizer.pointerUp({ x: t.x, y: t.y });
        })
        .onTouchesCancelled(() => {
          claimed.current = false;
          recognizer.pointerCancel();
        }),
    [recognizer],
  );

  return { gesture, claim };
}
