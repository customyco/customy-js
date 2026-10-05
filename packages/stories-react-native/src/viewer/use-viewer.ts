import { useRef, useSyncExternalStore } from "react";
import type { StoryViewer, ViewerState } from "../core";

/** El estado del visor del núcleo como estado de React. */
export function useViewerState(viewer: StoryViewer): ViewerState {
  return useSyncExternalStore(viewer.subscribe, viewer.getState, viewer.getState);
}

/** Solo re-renderiza cuando cambia el trozo elegido (`Object.is`). */
export function useViewerSelector<T>(viewer: StoryViewer, select: (s: ViewerState) => T): T {
  const last = useRef<{ state: ViewerState; value: T } | null>(null);
  const get = (): T => {
    const s = viewer.getState();
    if (last.current && last.current.state === s) return last.current.value;
    const value = select(s);
    if (last.current && Object.is(last.current.value, value)) {
      last.current = { state: s, value: last.current.value };
      return last.current.value;
    }
    last.current = { state: s, value };
    return value;
  };
  return useSyncExternalStore(viewer.subscribe, get, get);
}
