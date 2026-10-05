import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Text, StyleSheet, type LayoutChangeEvent } from "react-native";
import type { ComponentAction } from "../core";
import { useStoriesContext, type LinkContext } from "../context";
import type { WidgetMessages } from "./messages";
import type { WidgetEvent } from "@customyai/stories-render/client";

export type { WidgetEvent };
type Distribute<T> = T extends unknown ? Omit<T, "widgetId" | "variantId"> : never;
/** Un evento de widget sin la campaña (la pone `widgetEmitter`). */
export type WidgetEventInput = Distribute<WidgetEvent>;

/** Emisor con la campaña y su variante ya puestas (como `widgetEmitter` del renderer web, que no lo exporta por subruta). */
export function widgetEmitter(widgetId: string, variantId: string | undefined, onEvent: ((e: WidgetEvent) => void) | undefined) {
  return (e: WidgetEventInput): void => onEvent?.({ widgetId, ...(variantId ? { variantId } : {}), ...e } as WidgetEvent);
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,254}$/;
/**
 * Nombre de clic por defecto de un elemento sin `element_id` propio: `widget.<campaña>.<elemento>` (el mismo que usa el
 * renderer web: el servidor cuenta hasta 100 nombres por campaña, así que el mismo clic en web y en móvil es el mismo nombre).
 */
export function widgetElementId(widgetId: string, itemId: string, explicit?: string): string {
  if (explicit && NAME.test(explicit)) return explicit;
  const id = `widget.${widgetId}.${itemId}`;
  return NAME.test(id) ? id : id.slice(0, 255);
}

/**
 * Colores de la campaña admitidos: hex y `hsl()`/`rgb()`. Son DATOS de la campaña (como el relleno de una forma en el
 * visor), pero un valor raro (`;`, `url(`) se ignora y se usa el token del tema.
 */
export function safeColor(value: string | undefined): string | undefined {
  return value && /^(#[0-9a-fA-F]{3,8}|(?:hsla?|rgba?)\([0-9a-zA-Z.,%\s/-]{1,60}\))$/.test(value) ? value : undefined;
}

/** Aviso accesible: región viva (TalkBack) y, en iOS, `announceForAccessibility`. */
export function useAnnouncer(): { notice: string; say: (text: string) => void } {
  const [notice, setNotice] = useState("");
  const say = useCallback((text: string) => {
    // Vaciar antes obliga a releer un texto repetido.
    setNotice("");
    setNotice(text);
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
  }, []);
  return { notice, say };
}

/** El texto de la región viva: invisible, pero leído por VoiceOver/TalkBack. */
export function LiveRegion({ text, testID }: { text: string; testID?: string }) {
  return (
    <Text testID={testID ?? "cs-widget-live"} accessibilityLiveRegion="polite" style={styles.live}>
      {text}
    </Text>
  );
}

/**
 * Entorno de un widget: tema, dirección, reducir movimiento, textos y los dos gestos comunes (abrir una acción con
 * el aviso `onActionClicked` y anunciar). No lleva cliente: los widgets sueltos (`CanvasView`…) funcionan con solo `<StoriesProvider>`.
 */
export function useWidgetEnvWith(load: (locale?: string, overrides?: Partial<WidgetMessages>) => WidgetMessages, options: { messages?: Partial<WidgetMessages>; locale?: string } = {}) {
  const ctx = useStoriesContext();
  const locale = options.locale ?? ctx.locale;
  const { messages } = options;
  const m = useMemo(() => load(locale, messages), [load, locale, messages]);
  const { notice, say } = useAnnouncer();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const open = useCallback((action: ComponentAction, link: Omit<LinkContext, "surface">) => ctxRef.current.open(action, { surface: "widget", ...link }), []);
  return { ctx, theme: ctx.theme, rtl: ctx.rtl, reducedMotion: ctx.reducedMotion, clock: ctx.clock, locale, m, notice, say, open };
}

/** Un `onLayout` que avisa UNA vez, cuando el widget ya tiene tamaño (se pintó). Sin visor del área visible, es la impresión nativa. */
export function useImpressionOnLayout(onImpression: () => void): (e: LayoutChangeEvent) => void {
  const fn = useRef(onImpression);
  fn.current = onImpression;
  const done = useRef(false);
  return useCallback((e: LayoutChangeEvent) => {
    if (done.current) return;
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      done.current = true;
      fn.current();
    }
  }, []);
}

/** `onWidgetReady` al montar el widget y `onVisibilityChange` al montar/desmontar (para que la app pause lo suyo). */
export function useWidgetLifecycle(placementId: string | undefined, active = true): void {
  const ctx = useStoriesContext();
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    if (!active) return;
    ref.current.onWidgetReady?.({ placementId, surface: "widget" });
    ref.current.onVisibilityChange?.({ surface: "widget", visible: true });
    return () => ref.current.onVisibilityChange?.({ surface: "widget", visible: false });
  }, [placementId, active]);
}

const styles = StyleSheet.create({
  live: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
});
