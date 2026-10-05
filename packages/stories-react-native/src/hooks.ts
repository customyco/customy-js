import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, I18nManager, useColorScheme, type AppStateStatus } from "react-native";

/** «Reducir movimiento» del sistema, en vivo. `override` manda si la app lo fuerza. */
export function useReducedMotion(override?: boolean): boolean {
  const [system, setSystem] = useState(false);
  useEffect(() => {
    if (override !== undefined) return;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setSystem(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystem);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [override]);
  return override ?? system;
}

/** ¿Hay un lector de pantalla (VoiceOver/TalkBack) activo? */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => alive && setOn(v));
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/** La app pasa a segundo plano o pierde el foco (llamada, centro de control): `active` = en primer plano. */
export function useAppActive(onChange: (active: boolean) => void): void {
  useEffect(() => {
    const handle = (s: AppStateStatus): void => onChange(s === "active");
    const sub = AppState.addEventListener("change", handle);
    return () => sub.remove();
  }, [onChange]);
}

/**
 * Dirección de lectura: la que fije la app (`rtl`) o la del sistema de layout de React Native (`I18nManager`).
 * El layout nativo solo se espeja con `I18nManager`, así que los gestos y los controles siguen esa misma verdad.
 */
export const resolveRtl = (rtl: boolean | undefined): boolean => rtl ?? I18nManager.isRTL;

export const useSystemColorScheme = (): "light" | "dark" | null => {
  const s = useColorScheme();
  return s === "dark" || s === "light" ? s : null;
};
