import type { ColorValue } from "react-native";
import { DEFAULT_THEME } from "./default-theme";

/**
 * Tokens de tema. La app los pasa por props (`<StoriesProvider theme>`) desde su propio sistema de diseño;
 * ningún componente de este paquete lleva colores escritos a mano. Los colores que vienen de la campaña
 * (fondo de un texto, relleno de una forma, color de un botón) son DATOS y se aplican tal cual.
 */
export type StoriesTheme = {
  /** Detrás del medio a pantalla completa. */
  viewerBackground: ColorValue;
  /** Texto, iconos y controles sobre el medio. */
  viewerForeground: ColorValue;
  /** Velo semitransparente tras los controles y las sombras de texto (legibilidad sobre cualquier imagen). */
  viewerScrim: ColorValue;
  /** Hojas, tarjetas y componentes (encuesta, quiz…). */
  surface: ColorValue;
  surfaceForeground: ColorValue;
  mutedForeground: ColorValue;
  border: ColorValue;
  /** Anillo de la barra: grupo nuevo / ya visto. */
  ringUnseen: ColorValue;
  ringSeen: ColorValue;
  /** Acción principal (botones, opción elegida). */
  accent: ColorValue;
  accentForeground: ColorValue;
  /** Barra de progreso: pista y relleno. */
  progressTrack: ColorValue;
  progressFill: ColorValue;
  /** Correcto / incorrecto en el quiz (además del texto, nunca solo el color). */
  positive: ColorValue;
  negative: ColorValue;
  /** Widgets: velo que atenúa la pantalla alrededor del elemento de un paso del recorrido (spotlight). */
  spotlightScrim: ColorValue;
  /** Widgets: anillo y punto que señalan el elemento de un paso del recorrido (tooltip, hotspot, spotlight). */
  tourHighlight: ColorValue;
  /** Insignia «en vivo». */
  live: ColorValue;
  liveForeground: ColorValue;
};

export type ColorScheme = "light" | "dark";
/** Tokens sueltos, o por esquema (`{ light, dark }`). */
export type StoriesThemeInput = Partial<StoriesTheme> | { light?: Partial<StoriesTheme>; dark?: Partial<StoriesTheme> };

const isPerScheme = (t: StoriesThemeInput): t is { light?: Partial<StoriesTheme>; dark?: Partial<StoriesTheme> } => "light" in t || "dark" in t;

/** Tokens de la app sobre los neutros del paquete (solo se usan los que la app no define). */
export function resolveTheme(scheme: ColorScheme, input?: StoriesThemeInput): StoriesTheme {
  const mine = input ? (isPerScheme(input) ? input[scheme] : input) : undefined;
  return { ...DEFAULT_THEME[scheme], ...mine };
}

/** Preferencia de la app (`auto` = la del sistema) → esquema concreto. */
export function pickScheme(preference: ColorScheme | "auto" | undefined, system: ColorScheme | null | undefined): ColorScheme {
  if (preference === "light" || preference === "dark") return preference;
  return system === "dark" ? "dark" : "light";
}
