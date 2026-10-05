/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useState, type ReactNode } from "react";
import { vi } from "vitest";

/**
 * Doble ligero de `react-native` para jsdom: cada componente host pinta un elemento DOM con sus props de
 * accesibilidad como atributos (`data-role`, `aria-label`, `data-live`…) para poder afirmarlas. No es un render nativo.
 */
type P = Record<string, any>;

const flatten = (s: any): P => (Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s && typeof s === "object" ? s : {});

/** Controladores de accesibilidad registrados por `testID` (las pruebas los disparan con `rn.fireAction` / `rn.escape`). */
const a11yHandlers = new Map<string, { action?: (e: any) => void; escape?: () => void }>();
/** Posición en la ventana que devuelve `measureInWindow` por `testID` (por defecto 10,10 300×60). */
const layouts = new Map<string, { x: number; y: number; width: number; height: number }>();

export function attrs(p: P): P {
  const out: P = {};
  if (p.testID && (p.onAccessibilityAction || p.onAccessibilityEscape)) a11yHandlers.set(p.testID, { action: p.onAccessibilityAction, escape: p.onAccessibilityEscape });
  if (p.testID) out["data-testid"] = p.testID;
  if (p.accessibilityLabel !== undefined) out["aria-label"] = p.accessibilityLabel;
  if (p.accessibilityRole) out["data-role"] = p.accessibilityRole;
  if (p.accessibilityLiveRegion) out["data-live"] = p.accessibilityLiveRegion;
  if (p.accessibilityHint) out["data-hint"] = p.accessibilityHint;
  if (p.accessibilityState) out["data-state"] = JSON.stringify(p.accessibilityState);
  if (p.accessibilityValue) out["data-value"] = JSON.stringify(p.accessibilityValue);
  if (p.accessibilityActions) out["data-actions"] = p.accessibilityActions.map((a: any) => a.name).join(",");
  if (p.accessibilityViewIsModal) out["data-modal"] = "1";
  if (p.accessible === false || p.importantForAccessibility === "no-hide-descendants" || p.importantForAccessibility === "no" || p.accessibilityElementsHidden) out["data-hidden"] = "1";
  if (p.pointerEvents) out["data-pointer-events"] = p.pointerEvents;
  out["data-style"] = JSON.stringify(flatten(p.style));
  return out;
}

/** Pone `measureInWindow` en el nodo (lo tiene toda vista nativa) y entrega el nodo al `ref` de quien lo pidió. */
function withMeasure(node: any, testID: string | undefined, ref: any): void {
  if (node) node.measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) => {
    const r = (testID && layouts.get(testID)) || { x: 10, y: 10, width: 300, height: 60 };
    cb(r.x, r.y, r.width, r.height);
  };
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

function Host(tag: string, name: string) {
  const C = forwardRef<any, P>(function Host({ children, onLayout, onTouchStart, onTouchEnd, onPress, ...p }, ref) {
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, ...(p.testID && layouts.get(p.testID) ? { width: layouts.get(p.testID)!.width, height: layouts.get(p.testID)!.height } : { width: 300, height: 60 }) } } });
    }, []);
    // Un `ref` estable, como el de React Native: uno nuevo en cada render haría soltar y volver a tomar el ancla sin parar.
    const setRef = useCallback((node: any) => withMeasure(node, p.testID, ref), [p.testID, ref]);
    return createElement(tag, { ref: setRef, "data-rn": name, onTouchStart, onTouchEnd, onClick: onPress, ...attrs(p) }, children);
  });
  C.displayName = name;
  return C;
}

export const View = Host("div", "View");
export const Text = Host("span", "Text");
export const ScrollView = Host("div", "ScrollView");
export const ActivityIndicator = Host("div", "ActivityIndicator");

export const Image: any = forwardRef<any, P>(function Image(p, ref) {
  return createElement("img", { ref, "data-rn": "Image", "data-uri": p.source?.uri, alt: "", ...attrs(p) });
});
Image.prefetch = vi.fn(() => Promise.resolve(true));

export const Pressable = forwardRef<any, P>(function Pressable({ children, style, onPress, disabled, onTouchStart, onLayout: _l, ...p }, ref) {
  const st = { pressed: false };
  const setRef = useCallback((node: any) => withMeasure(node, p.testID, ref), [p.testID, ref]);
  return createElement(
    "button",
    {
      ref: setRef,
      type: "button",
      "data-rn": "Pressable",
      disabled: !!disabled,
      onTouchStart,
      onClick: () => !disabled && onPress?.(),
      ...attrs({ ...p, style: typeof style === "function" ? style(st) : style }),
    },
    typeof children === "function" ? children(st) : children,
  );
});

export const TextInput = forwardRef<any, P>(function TextInput({ onChangeText, onFocus, onBlur, value, editable, placeholder, maxLength, ...p }, ref) {
  return createElement("input", { ref, "data-rn": "TextInput", value, disabled: editable === false, placeholder, maxLength, onChange: (e: any) => onChangeText?.(e.target.value), onFocus, onBlur, ...attrs(p) });
});

/** Listas por `testID`: el último `scrollToIndex` pedido y el manejador de «fin de desplazamiento». */
export const lists = new Map<string, { scrollToIndex: ReturnType<typeof vi.fn>; momentumEnd?: (e: any) => void }>();
export const FlatList: any = forwardRef<any, P>(function FlatList({ data, renderItem, keyExtractor, onMomentumScrollEnd, ...p }, ref) {
  const api = { scrollToIndex: vi.fn() };
  useImperativeHandle(ref, () => api, []);
  if (p.testID) lists.set(p.testID, Object.assign(lists.get(p.testID)?.scrollToIndex ? lists.get(p.testID)! : api, { momentumEnd: onMomentumScrollEnd }));
  return createElement("div", { "data-rn": "FlatList", ...attrs(p) }, (data as any[]).map((item, index) => createElement("div", { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index }))));
});

export function Modal({ visible, children, onRequestClose }: P) {
  modals.onRequestClose = onRequestClose;
  return visible ? createElement("div", { "data-rn": "Modal" }, children as ReactNode) : null;
}
export const modals: { onRequestClose?: () => void } = {};

export const StyleSheet = {
  create: <T,>(s: T): T => s,
  absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  hairlineWidth: 1,
  flatten,
};

export const Platform = { OS: "ios" as string, select: (o: any) => o.ios ?? o.default };
export const StatusBar = { currentHeight: 24 };
export const I18nManager = { isRTL: false };
export const Linking = { openURL: vi.fn(() => Promise.resolve()) };
export const Share = { share: vi.fn((_c?: unknown) => Promise.resolve({ action: "sharedAction" })) };
const backHandlers: Array<() => boolean> = [];
export const BackHandler = {
  addEventListener: (_: string, cb: () => boolean) => {
    backHandlers.push(cb);
    return { remove: () => void backHandlers.splice(backHandlers.indexOf(cb), 1) };
  },
};
export const findNodeHandle = (): number => 1;

// ── Estado controlable desde las pruebas ────────────────────────────────────
type Listener = (v: any) => void;
const a11y = { reduceMotion: false, screenReader: false, listeners: new Map<string, Set<Listener>>() };
const app = { listeners: new Set<Listener>() };
const scheme = { value: "light" as "light" | "dark" };
const win = { width: 400, height: 800 };

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(a11y.reduceMotion),
  isScreenReaderEnabled: () => Promise.resolve(a11y.screenReader),
  addEventListener: (name: string, cb: Listener) => {
    const set = a11y.listeners.get(name) ?? new Set();
    set.add(cb);
    a11y.listeners.set(name, set);
    return { remove: () => void set.delete(cb) };
  },
  announceForAccessibility: vi.fn(),
  setAccessibilityFocus: vi.fn(),
};
export const AppState = {
  addEventListener: (_: string, cb: Listener) => {
    app.listeners.add(cb);
    return { remove: () => void app.listeners.delete(cb) };
  },
};
export const useColorScheme = (): "light" | "dark" => scheme.value;
export const useWindowDimensions = (): { width: number; height: number } => {
  const [w] = useState(win);
  return w;
};

export const rn = {
  setReduceMotion: (v: boolean) => {
    a11y.reduceMotion = v;
    a11y.listeners.get("reduceMotionChanged")?.forEach((l) => l(v));
  },
  setScreenReader: (v: boolean) => {
    a11y.screenReader = v;
    a11y.listeners.get("screenReaderChanged")?.forEach((l) => l(v));
  },
  setAppState: (s: string) => app.listeners.forEach((l) => l(s)),
  setScheme: (s: "light" | "dark") => void (scheme.value = s),
  setOS: (os: string) => void (Platform.OS = os),
  setRTL: (v: boolean) => void (I18nManager.isRTL = v),
  setWindow: (w: number, h: number) => Object.assign(win, { width: w, height: h }),
  /** Dónde está una vista en la ventana (lo que mide `measureInWindow`). */
  setLayout: (testID: string, r: { x: number; y: number; width: number; height: number }) => void layouts.set(testID, r),
  /** Dispara una acción de accesibilidad (`accessibilityActions`) de la vista con ese `testID`. */
  fireAction: (testID: string, actionName: string) => {
    const h = a11yHandlers.get(testID);
    if (!h?.action) throw new Error(`${testID} no tiene onAccessibilityAction`);
    h.action({ nativeEvent: { actionName } });
  },
  /** El gesto de escape de VoiceOver sobre la vista con ese `testID`. */
  escape: (testID: string) => a11yHandlers.get(testID)?.escape?.(),
  /** Botón atrás de Android: `true` si alguien lo consumió. */
  backPress: (): boolean => [...backHandlers].reverse().some((h) => h()),
  /** Fin de desplazamiento de una lista (`onMomentumScrollEnd`). */
  momentumEnd: (testID: string, offsetY: number) => lists.get(testID)?.momentumEnd?.({ nativeEvent: { contentOffset: { x: 0, y: offsetY } } }),
};

export function resetRn(): void {
  a11yHandlers.clear();
  layouts.clear();
  lists.clear();
  backHandlers.length = 0;
  a11y.reduceMotion = false;
  a11y.screenReader = false;
  a11y.listeners.clear();
  app.listeners.clear();
  scheme.value = "light";
  Platform.OS = "ios";
  I18nManager.isRTL = false;
  Object.assign(win, { width: 400, height: 800 });
}
