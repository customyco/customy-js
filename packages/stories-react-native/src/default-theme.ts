/* eslint-disable @customy/no-hardcoded-colors -- Neutros de reserva por si la app no pasa `theme`: una escala de grises sin marca. El resto del paquete solo lee tokens. */
import type { ColorScheme, StoriesTheme } from "./theme";

const common = {
  viewerBackground: "#000000",
  viewerForeground: "#ffffff",
  viewerScrim: "rgba(0, 0, 0, 0.45)",
  liveForeground: "#ffffff",
  progressTrack: "rgba(255, 255, 255, 0.35)",
  progressFill: "#ffffff",
  positive: "#16a34a",
  negative: "#dc2626",
  live: "#dc2626",
  spotlightScrim: "rgba(0, 0, 0, 0.6)",
  tourHighlight: "#7c3aed",
  ringSeen: "#9ca3af",
} as const;

export const DEFAULT_THEME: Record<ColorScheme, StoriesTheme> = {
  light: {
    ...common,
    surface: "#ffffff",
    surfaceForeground: "#111827",
    mutedForeground: "#4b5563",
    border: "#d1d5db",
    ringUnseen: "#7c3aed",
    accent: "#111827",
    accentForeground: "#ffffff",
  },
  dark: {
    ...common,
    surface: "#18181b",
    surfaceForeground: "#fafafa",
    mutedForeground: "#a1a1aa",
    border: "#3f3f46",
    ringUnseen: "#a78bfa",
    accent: "#fafafa",
    accentForeground: "#111827",
    ringSeen: "#52525b",
  },
};
