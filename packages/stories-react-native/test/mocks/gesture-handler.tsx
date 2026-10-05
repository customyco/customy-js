/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, type ReactNode } from "react";

/**
 * Doble de Gesture Handler: `Gesture.*` es un constructor encadenable que guarda los callbacks, y `GestureDetector`
 * los registra para que la prueba dispare toques crudos (`touches`) o gestos de pan (`pan`).
 */
type Builder = Record<string, any> & { kind: string; handlers: Record<string, (...a: any[]) => void> };

function builder(kind: string): Builder {
  const target: Builder = { kind, handlers: {} } as Builder;
  const proxy: Builder = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return (t as any)[prop];
      return (arg: unknown) => {
        if (typeof arg === "function") t.handlers[prop] = arg as any;
        return proxy;
      };
    },
  });
  return proxy;
}

export const Gesture = { Manual: () => builder("manual"), Pan: () => builder("pan"), Tap: () => builder("tap") };

const registry: Builder[] = [];
export const detectors = registry;
export const resetGestures = (): void => void (registry.length = 0);

export function GestureDetector({ gesture, children }: { gesture: Builder; children?: ReactNode }) {
  if (!registry.includes(gesture)) registry.push(gesture);
  return children as any;
}
export function GestureHandlerRootView({ children }: { children?: ReactNode; style?: unknown }) {
  return createElement("div", { "data-rn": "GestureHandlerRootView" }, children);
}

const touch = (x: number, y: number) => ({ id: 0, x, y, absoluteX: x, absoluteY: y });
const last = (kind: string): Builder => {
  const g = [...registry].reverse().find((d) => d.kind === kind);
  if (!g) throw new Error(`no hay GestureDetector ${kind}`);
  return g;
};

/** Toques crudos sobre el visor (el gesto manual más reciente). */
export const touches = {
  down: (x: number, y: number, fingers = 1) => last("manual").handlers.onTouchesDown?.({ changedTouches: [touch(x, y)], allTouches: Array.from({ length: fingers }, () => touch(x, y)) }),
  move: (x: number, y: number) => last("manual").handlers.onTouchesMove?.({ changedTouches: [touch(x, y)], allTouches: [touch(x, y)] }),
  up: (x: number, y: number) => last("manual").handlers.onTouchesUp?.({ changedTouches: [touch(x, y)], allTouches: [touch(x, y)] }),
  cancel: () => last("manual").handlers.onTouchesCancelled?.({ changedTouches: [], allTouches: [] }),
  tap(x: number, y: number) {
    touches.down(x, y);
    touches.up(x, y);
  },
  swipe(from: [number, number], to: [number, number]) {
    touches.down(...from);
    touches.move(...to);
    touches.up(...to);
  },
};

export const pan = {
  begin: (x: number, y = 0) => last("pan").handlers.onBegin?.({ x, y, translationX: 0 }),
  update: (translationX: number, x = 0, y = 0) => last("pan").handlers.onUpdate?.({ translationX, x, y }),
  end: (translationX: number, x = 0, success = true, y = 0) => last("pan").handlers.onEnd?.({ translationX, x, y }, success),
  finalize: (success = false) => last("pan").handlers.onFinalize?.({}, success),
};
