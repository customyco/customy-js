import { useWidgetEnvWith } from "./common";
import { resolveWidgetMessages, type WidgetMessages } from "./messages";

/** El entorno de un widget con los textos de TODOS los widgets. El Video Feed usa `useWidgetEnvWith(resolveFeedMessages, …)` para no cargarlos. */
export function useWidgetEnv(options: { messages?: Partial<WidgetMessages>; locale?: string } = {}) {
  return useWidgetEnvWith(resolveWidgetMessages, options);
}
