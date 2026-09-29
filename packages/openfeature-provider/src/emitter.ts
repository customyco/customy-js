import type { EventHandler, ProviderEmitter, ProviderEventDetails, ProviderEventType } from "./spec";

/**
 * Emisor de eventos del proveedor con la forma que el SDK de OpenFeature espera
 * en `provider.events`. Un manejador que lanza no rompe a los demás ni a quien emite.
 */
export class ProviderEvents implements ProviderEmitter {
  private readonly handlers = new Map<ProviderEventType, Set<EventHandler>>();

  addHandler(type: ProviderEventType, handler: EventHandler): void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler);
  }

  removeHandler(type: ProviderEventType, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  removeAllHandlers(type?: ProviderEventType): void {
    if (type) this.handlers.delete(type);
    else this.handlers.clear();
  }

  getHandlers(type: ProviderEventType): EventHandler[] {
    return [...(this.handlers.get(type) ?? [])];
  }

  emit(type: ProviderEventType, details?: ProviderEventDetails): void {
    for (const handler of this.getHandlers(type)) {
      try { handler(details); } catch { /* un manejador ajeno nunca tumba la evaluación */ }
    }
  }
}
