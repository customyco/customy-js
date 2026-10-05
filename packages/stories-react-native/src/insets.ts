import { Platform, StatusBar, useWindowDimensions } from "react-native";

export type Insets = { top: number; bottom: number; left: number; right: number };
export const NO_INSETS: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Zona segura aproximada para cuando la app NO pasa la real. Android: la barra de estado; iOS: no hay API en el
 * núcleo de React Native, así que se estima por la forma de la pantalla (muesca/isla si es muy alargada).
 * La vía correcta es pasar los reales: `<StoriesProvider insets={useSafeAreaInsets()}>`
 * (`react-native-safe-area-context`), que es lo que documenta el README.
 */
export function fallbackInsets(os: string, window: { width: number; height: number }, statusBarHeight: number | undefined): Insets {
  if (os === "android") return { ...NO_INSETS, top: statusBarHeight ?? 0 };
  const tall = Math.max(window.width, window.height) / Math.max(1, Math.min(window.width, window.height)) > 2;
  return { ...NO_INSETS, top: tall ? 47 : 20, bottom: tall ? 34 : 0 };
}

/** Los de la app si los pasó (campo a campo); si no, la aproximación. */
export function useDeviceInsets(provided: Partial<Insets> | undefined): Insets {
  const win = useWindowDimensions();
  return { ...fallbackInsets(Platform.OS, win, StatusBar.currentHeight), ...provided };
}
