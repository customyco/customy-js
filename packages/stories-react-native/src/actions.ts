import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { PurchaseInput, StorySurface } from "./core";
import { useStoriesClient } from "./context";

/**
 * Lo que la app necesita del cliente sin pintar nada (modo headless o interfaz propia):
 *  - `sessionId`: el `session_id` que llevan TODOS los eventos y la conversión de esta sesión (atribución indirecta).
 *  - `reportConversion`: la compra que cierra la tienda (señal no monetaria, idempotente por pedido; lanza si Send no la acepta, para reintentar).
 *  - `reportExposure`: lo que la persona vio en una interfaz propia (`view`, `product_viewed`, `holdout`).
 * Son las mismas funciones del cliente (`client.reportConversion` / `client.reportExposure`), con el consentimiento ya aplicado.
 */
export function useStoriesActions() {
  const client = useStoriesClient();
  return useMemo(
    () => ({
      sessionId: client.events.sessionId,
      reportConversion: (input: PurchaseInput) => client.reportConversion(input),
      reportExposure: (input: Parameters<typeof client.reportExposure>[0]) => client.reportExposure(input),
    }),
    [client],
  );
}

/**
 * Pausa por superficie (juego, vídeo o checkout de la app): `pause("widget")` DIFIERE lo nuevo (no se descarta: vuelve al
 * reanudar) y suspende lo que ya suena (vídeo del Video Feed). `reason` permite varias pausas a la vez: la superficie sigue
 * pausada mientras quede alguna. Equivale a `client.surfaces.pause/resume`.
 */
export function useSurfacePause() {
  const client = useStoriesClient();
  return useMemo(
    () => ({
      pause: (surface: StorySurface | "all", reason?: string) => client.surfaces.pause(surface, reason),
      resume: (surface: StorySurface | "all", reason?: string) => client.surfaces.resume(surface, reason),
      isPaused: (surface: StorySurface) => client.surfaces.isPaused(surface),
    }),
    [client],
  );
}

/** ¿Está pausada esa superficie? Se re-renderiza al pausar/reanudar. */
export function useIsSurfacePaused(surface: StorySurface): boolean {
  const client = useStoriesClient();
  const get = useCallback(() => client.surfaces.isPaused(surface), [client, surface]);
  return useSyncExternalStore(client.surfaces.subscribe, get, () => false);
}
