/**
 * Qué mensaje in-app está en pantalla para un disparador, sin framework: lo
 * usa `useInAppMessages` y sirve igual fuera de React.
 *
 * - Elige el de mayor prioridad cuyo `trigger_filters` cumplen las propiedades.
 * - Con `delay_seconds` espera antes de exponerlo; cambiar de disparador o de
 *   propiedades, desactivarlo o dejar de escuchar cancela la espera.
 * - Se mantiene hasta que se pulsa o se cierra; entonces sale el siguiente.
 * - Si el servidor lo retira antes de verse (archivado, fuera de fechas,
 *   interruptor `kill`), desaparece.
 */
import type { EligibleInAppMessage, SurveyAnswers } from "../engage-types";

/** Lo que el presentador necesita del cliente (el de `@customyai/send/inbox` o el adaptador de 1.x). */
export type InAppPresenterClient = {
  getState(): { inApp: { loaded: boolean; messages: EligibleInAppMessage[] } };
  onState(listener: () => void): () => void;
  inApp: {
    forTrigger(trigger: string, properties?: Record<string, unknown>): EligibleInAppMessage | null;
    impression(id: string): void;
    click(id: string, action?: string): void;
    dismiss(id: string): void;
  };
  submitSurvey(input: { in_app_id: string; survey_id: string; answers: SurveyAnswers; variant_id?: string | null }): void;
};

export type InAppPresenterOptions = {
  /** `session_start` (por defecto) o un evento de la app (`checkout_viewed`). */
  trigger?: string;
  /** Propiedades del evento, para `trigger_filters`. */
  properties?: Record<string, unknown>;
  /** false = no elegir mensaje ahora (p. ej. durante un flujo crítico). */
  enabled?: boolean;
};

export type InAppPresenter = ReturnType<typeof createInAppPresenter>;

const MAX_DELAY_SECONDS = 3600;

function propertiesKey(properties: Record<string, unknown> | undefined): string {
  if (!properties) return "";
  try {
    return JSON.stringify(properties);
  } catch {
    return String(Math.random());
  }
}

export function createInAppPresenter(client: InAppPresenterClient, initial: InAppPresenterOptions = {}) {
  let trigger = initial.trigger ?? "session_start";
  let properties = initial.properties;
  let key = propertiesKey(properties);
  let enabled = initial.enabled ?? true;
  let current: EligibleInAppMessage | null = null;
  let shownId: string | null = null;
  let pending: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;
  let exposed: EligibleInAppMessage | null = null;
  const listeners = new Set<() => void>();
  let offState: (() => void) | null = null;

  function publish() {
    const next = enabled ? current : null;
    if (next === exposed) return;
    exposed = next;
    for (const listener of [...listeners]) listener();
  }
  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }

  function evaluate() {
    const { inApp } = client.getState();
    // Retirado antes de verse: no se muestra.
    if (current && shownId !== current.id && inApp.loaded && !inApp.messages.some((m) => m.id === current!.id)) current = null;
    if (!enabled) cancelPending();
    else if (!current && listeners.size > 0) {
      const next = client.inApp.forTrigger(trigger, properties);
      if (!next) cancelPending();
      else {
        const seconds = Math.min(MAX_DELAY_SECONDS, Math.max(0, Number(next.delay_seconds) || 0));
        if (seconds === 0) {
          cancelPending();
          current = next;
        } else if (!pending || pending.id !== next.id) {
          cancelPending();
          const id = next.id;
          pending = {
            id,
            timer: setTimeout(() => {
              pending = null;
              const still = client.inApp.forTrigger(trigger, properties);
              if (enabled && !current && still && still.id === id) {
                current = still;
                publish();
              } else evaluate();
            }, seconds * 1000),
          };
        }
      }
    }
    publish();
  }

  return {
    /** El mensaje a pintar ahora, o `null`. */
    getMessage: (): EligibleInAppMessage | null => exposed,
    /** Si hay un mensaje esperando su `delay_seconds`. */
    isPending: (): boolean => pending !== null,
    /** Escucha cambios del mensaje; mientras haya alguien escuchando, sigue el estado del cliente. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (!offState) {
        offState = client.onState(evaluate);
        evaluate();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          offState?.();
          offState = null;
          cancelPending();
        }
      };
    },
    /** Nuevo disparador, propiedades o `enabled`: cancela la espera si cambian. */
    update(options: InAppPresenterOptions) {
      const nextTrigger = options.trigger ?? "session_start";
      const nextKey = propertiesKey(options.properties);
      const nextEnabled = options.enabled ?? true;
      if (nextTrigger !== trigger || nextKey !== key || nextEnabled !== enabled) cancelPending();
      trigger = nextTrigger;
      properties = options.properties;
      key = nextKey;
      enabled = nextEnabled;
      evaluate();
    },
    /** Se ve de verdad (una vez por mensaje). */
    impression() {
      if (!current || shownId === current.id) return;
      shownId = current.id;
      client.inApp.impression(current.id);
    },
    /** Pulsó un botón (`action` = su id) o el mensaje. */
    click(action?: string) {
      if (!current) return;
      const id = current.id;
      current = null;
      client.inApp.click(id, action);
      evaluate();
    },
    dismiss() {
      if (!current) return;
      const id = current.id;
      current = null;
      client.inApp.dismiss(id);
      evaluate();
    },
    /** Respuesta a un bloque `survey` del mensaje en pantalla. */
    submitSurvey(surveyId: string, answers: SurveyAnswers) {
      if (!current) return;
      client.submitSurvey({ in_app_id: current.id, survey_id: surveyId, answers, variant_id: current.variant_id ?? null });
    },
    /** Deja de seguir al cliente y cancela la espera. */
    close() {
      listeners.clear();
      offState?.();
      offState = null;
      cancelPending();
    },
  };
}
