import { AppState, Platform } from "react-native";
import { createStoriesClient, type StoriesClient, type StoriesClientOptions, type StoryPlatform } from "./core";

/**
 * `createStoriesClient` con la plataforma de React Native ya puesta (`ios` | `android`). El almacenamiento del
 * estado «visto», la frecuencia, los descartes y la cola de eventos es el `store` que pase la app (ver `./storage`);
 * sin él solo hay memoria y se pierde al cerrar la app.
 */
export function createNativeStoriesClient(options: Omit<StoriesClientOptions, "platform"> & { platform?: StoryPlatform }): StoriesClient {
  const platform: StoryPlatform = options.platform ?? (Platform.OS === "ios" ? "ios" : "android");
  // En React Native el primer plano es `AppState` (no existe `document`): el tiempo real solo escucha con la app activa.
  const foreground = {
    isActive: () => AppState.currentState === "active",
    subscribe: (listener: (active: boolean) => void) => {
      const sub = AppState.addEventListener("change", (s) => listener(s === "active"));
      return () => sub.remove();
    },
  };
  return createStoriesClient({ ...options, platform, realtime: options.realtime ? { foreground, ...options.realtime } : undefined });
}
