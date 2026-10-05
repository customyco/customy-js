import type { ComponentType, ReactNode } from "react";
import type { AnswerMap, Clock, ComponentAction, Messages, ProductRef, ResolvedProduct, StoryCommerceContext, StoryComponent, StoryComponentType, StoryGroup, StoryPage, StoryViewer, Viewport } from "./core";
import type { StoriesTheme } from "./theme";

/**
 * Lo que recibe el pintor de un componente interactivo (equivalente nativo del `ComponentCtx` web). El visor
 * base pinta botón, encuesta, cuenta atrás y código; el resto (quiz, reacciones, valoración, pregunta, acciones,
 * comercio…) vive en `@customyai/stories-react-native/components`, que se inyecta en `<StoriesProvider components>`
 * para no pagar su peso quien no lo usa (plan §6.6).
 */
export type StoryComponentProps<C extends StoryComponent = StoryComponent> = {
  comp: C;
  viewer: StoryViewer;
  theme: StoriesTheme;
  vp: Viewport;
  /** Textos del visor base y el idioma de la interfaz. */
  m: Messages;
  locale?: string;
  rtl: boolean;
  reducedMotion: boolean;
  clock: Clock;
  /** Aviso accesible (VoiceOver/TalkBack). */
  say: (text: string) => void;
  /** Lo ya respondido en este grupo (visitas anteriores y esta sesión). */
  answers: () => AnswerMap;
  /** Abre un enlace como el resto del visor. */
  open: (action: ComponentAction, elementId?: string) => void;
  resolveProducts?: (refs: ProductRef[]) => Promise<ResolvedProduct[]>;
  openForm?: (formId: string, elementId?: string) => void;
  /** `context` = historia, página y componente: escribirlo en los atributos del carrito (`storyCartAttributes`) y leerlo al cerrar la compra. */
  onAddToCart?: (product: ProductRef, quantity: number, context?: StoryCommerceContext) => void;
  onWishlist?: (product: ProductRef, context?: StoryCommerceContext) => void;
  /** Recordatorio de una cuenta atrás (solo tras la acción explícita de la persona). */
  onReminder?: (component: StoryComponent, remindAtIso: string) => void;
  /** Copiar un código (la app pone el portapapeles); sin él se ofrece el menú de compartir. */
  copyText?: (text: string) => void | Promise<void>;
  /** Un `game` por id (Game Center): lo abre la app (`<GameDialog>` de `./game`). */
  openGame?: (gameId: string, elementId?: string) => void;
  onAddToCalendar?: (event: { id: string; title: string; startsAt: string; endsAt?: string; location?: string; description?: string; ics: string }) => void;
};

export type ComponentRenderers = { [K in StoryComponentType]?: ComponentType<StoryComponentProps<Extract<StoryComponent, { type: K }>>> };

/**
 * Una acción extra sobre la página actual del visor («⋯» + hoja modal): el visor pone el botón y la hoja, el
 * contenido es del módulo (p. ej. UGC: reportar y no ver más a esa persona). Equivalente nativo de `PageAction` del
 * renderer web. `render` recibe `close` (cierra la hoja y reanuda la historia) y `say` (aviso accesible).
 */
export type PageAction = { label: string; title?: string; render(ctx: { close(): void; say(text: string): void }): ReactNode };
export type PageActionsProvider = (ctx: { group: StoryGroup; page: StoryPage }) => PageAction | null;
