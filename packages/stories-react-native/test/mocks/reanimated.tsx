/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, forwardRef, useRef } from "react";
import { vi } from "vitest";
import { attrs } from "./react-native";

/** Doble de Reanimated: valores compartidos como objetos, estilos animados evaluados una vez por render. */
export function useSharedValue<T>(init: T): { value: T } {
  const ref = useRef<{ value: T }>({ value: init });
  return ref.current;
}
export const useAnimatedStyle = (fn: () => object): object => fn();

const withTarget = (_: unknown, v?: unknown): unknown => v;
export const withTiming = vi.fn((v: unknown) => v);
export const withDelay = vi.fn((_: number, v: unknown) => v);
export const withSequence = vi.fn((...v: unknown[]) => v[v.length - 1]);
export const withRepeat = vi.fn((v: unknown) => v);
export const cancelAnimation = vi.fn(withTarget);
export const Easing: any = { linear: () => 0, quad: () => 0, inOut: () => () => 0, bezier: () => ({}) };

const builder: any = { duration: () => builder, delay: () => builder };
export const FadeIn = builder;

const AnimatedView = forwardRef<any, any>(function AnimatedView({ children, style, entering: _e, ...p }, ref) {
  const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(5).filter(Boolean)) : (style ?? {});
  return createElement("div", { ref, "data-rn": "Animated.View", ...attrs({ ...p, style: flat }) }, children);
});

export type SharedValue<T> = { value: T };
export default { View: AnimatedView, createAnimatedComponent: (c: unknown) => c };
