import type { StoryCommerceContext } from "../commerce";
import type { Clock } from "../clock";
import type { Messages } from "../messages";
import type { AnswerMap, ComponentAction, ProductRef, ResolvedProduct, StoryComponent, StoryComponentType } from "../types";
import type { StoryViewer } from "../viewer";
import type { el as elFn } from "./util";

/**
 * Lo que recibe el pintor de un componente. El visor base solo sabe de botón, encuesta, cuenta atrás y
 * código; el resto (quiz, reacciones, valoración, pregunta, acciones, comercio…) vive en el módulo
 * opcional `@customyai/stories-render/components`, que se inyecta como `components` (o `loadComponents`)
 * para no pagar su peso quien no lo usa (plan §6.6).
 */
export type ComponentCtx<C extends StoryComponent = StoryComponent> = {
  comp: C;
  doc: Document;
  win: Window & typeof globalThis;
  viewer: StoryViewer;
  /** Textos del visor base (`pollThanks`, `copy`…). */
  m: Messages;
  locale?: string;
  rtl: boolean;
  reducedMotion: boolean;
  clock: Clock;
  el: typeof elFn;
  /** Aviso accesible (`aria-live`). */
  say(text: string): void;
  /** Se ejecuta al cambiar de página o cerrar (temporizadores, observadores). */
  cleanup(fn: () => void): void;
  /** Lo que ya se respondió en este grupo (visitas anteriores y esta sesión). */
  answers(): AnswerMap;
  resolveProducts?: (refs: ProductRef[]) => Promise<ResolvedProduct[]>;
  /** Abre un enlace como el resto del visor (la app decide cómo). */
  open(action: ComponentAction, elementId?: string): void;
  /** Un `form` de Customy Forms (por id): la app decide cómo abrirlo. Sin él, el componente no se pinta. */
  openForm?: (formId: string, elementId?: string) => void;
  /** Un `game` del Game Center (por id): la app lo abre. Sin él, el componente no se pinta. */
  openGame?: (gameId: string, elementId?: string) => void;
  /** El carrito lo decide el backend de la app: el módulo avisa y registra `add_to_cart`. */
  onAddToCart?: (product: ProductRef, quantity: number, context?: StoryCommerceContext) => void;
  onWishlist?: (product: ProductRef, context?: StoryCommerceContext) => void;
};

export type ComponentRenderer<C extends StoryComponent = StoryComponent> = (ctx: ComponentCtx<C>) => HTMLElement | null;
export type ComponentRegistry = { [K in StoryComponentType]?: ComponentRenderer<Extract<StoryComponent, { type: K }>> };
export type ComponentsLoader = () => Promise<ComponentRegistry>;
