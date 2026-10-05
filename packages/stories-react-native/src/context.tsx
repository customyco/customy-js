import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { Clock, ComponentAction, Messages, ProductRef, ResolvedProduct, StoriesClient, StoryCommerceContext, StoryComponent, StoryComponentType, StorySurface } from "./core";
import type { LottieAdapter, VideoPlayerAdapter } from "./adapters";
import { resolveRtl, useReducedMotion, useSystemColorScheme } from "./hooks";
import type { Insets } from "./insets";
import { createDefaultMediaCache, type MediaCache } from "./media";
import { openActionDefault } from "./links";
import { pickScheme, resolveTheme, type ColorScheme, type StoriesTheme, type StoriesThemeInput } from "./theme";
import type { ComponentRenderers, PageActionsProvider } from "./component-api";

export type LinkContext = { surface: StorySurface; groupId?: string; pageId?: string; bannerId?: string; slideId?: string; elementId?: string; /** Widgets (`surface: "widget"`): la campaña y, si procede, el ítem (tarjeta, paso, vídeo…). */ widgetId?: string; itemId?: string };

/** Los tres avisos de ciclo de vida que piden todos los SDK de Customy Stories (plan §6.6). */
export type WidgetCallbacks = {
  /** El widget ya tiene contenido elegible y se pintó. */
  onWidgetReady?: (info: { placementId?: string; surface: StorySurface }) => void;
  /** El visor/banner aparece o desaparece (para pausar vídeo, juegos o un checkout propios). */
  onVisibilityChange?: (info: { surface: StorySurface; visible: boolean }) => void;
  /** Una persona pulsó una acción (botón, enlace del banner, CTA): se avisa ANTES de abrirla. */
  onActionClicked?: (action: ComponentAction, ctx: LinkContext) => void;
};

export type StoriesProviderProps = WidgetCallbacks & {
  /** Sin cliente solo hay interfaz: pinta con tus propios datos (`groups`, `banner`). Con él, `usePlacement` y los componentes ligados. */
  client?: StoriesClient;
  /** Tokens de tema de la app (sueltos o `{ light, dark }`). */
  theme?: StoriesThemeInput;
  /** `auto` (por defecto) = el esquema del sistema. */
  colorScheme?: ColorScheme | "auto";
  locale?: string;
  /** Esquemas propios de la app que un `deep_link` puede abrir (`["myapp"]`), además de https, mailto, tel y sms. `tg`, `whatsapp`… solo si los declaras. */
  allowedSchemes?: readonly string[];
  messages?: Partial<Messages>;
  /** Fuerza LTR/RTL; por defecto la dirección de `I18nManager`. */
  rtl?: boolean;
  /** Zona segura del dispositivo (p. ej. `useSafeAreaInsets()`); sin ella se mide. */
  insets?: Partial<Insets>;
  /** Fuerza «reducir movimiento»; por defecto sigue al sistema (`AccessibilityInfo`). */
  reducedMotion?: boolean;
  /** Reproductor de vídeo inyectable (ver `./video`). */
  video?: VideoPlayerAdapter;
  /** Lottie inyectable (ver `./lottie`). */
  lottie?: LottieAdapter;
  /** Caché de medios; por defecto `Image.prefetch` + `fetch`. */
  mediaCache?: MediaCache;
  /** Componentes de la Ola 2 (`import { components } from "@customyai/stories-react-native/components"`). */
  components?: ComponentRenderers;
  /** Comercio: precio y stock en vivo por referencia de producto. */
  resolveProducts?: (refs: ProductRef[]) => Promise<ResolvedProduct[]>;
  openForm?: (formId: string, ctx: LinkContext) => void;
  /** Un `game` del Game Center referenciado desde una página (componente `game`): la app lo abre, p. ej. con `<GameDialog>` de `./game`. Sin él, el componente no se pinta. */
  openGame?: (gameId: string, ctx: LinkContext) => void;
  /** Acciones extra por página en el visor («⋯»): p. ej. reportar y bloquear en las historias de la comunidad (`ugcPageActions` de `./ugc`). */
  pageActions?: PageActionsProvider;
  /** `context` = historia, página y componente: escribirlo en los atributos del carrito (`storyCartAttributes`) y leerlo al cerrar la compra. */
  onAddToCart?: (product: ProductRef, quantity: number, context?: StoryCommerceContext) => void;
  onWishlist?: (product: ProductRef, context?: StoryCommerceContext) => void;
  onAddToCalendar?: (event: { id: string; title: string; startsAt: string; endsAt?: string; location?: string; description?: string; ics: string }) => void;
  /** Recordatorio de una cuenta atrás (solo tras la acción explícita de la persona). */
  onReminder?: (component: StoryComponent, remindAtIso: string) => void;
  /** Copiar un código al portapapeles (la app pone la librería); sin él se ofrece el menú de compartir. */
  copyText?: (text: string) => void | Promise<void>;
  /** Enlace público de una historia para «Compartir». */
  shareUrl?: (info: { groupId: string; pageId: string }) => string | undefined;
  /** Abre un enlace o deep link (por defecto `Linking.openURL`). La app decide: navegación interna, in-app browser… */
  openLink?: (action: ComponentAction, ctx: LinkContext) => void | Promise<void>;
  clock?: Clock;
  children?: ReactNode;
};

export type StoriesContextValue = Omit<StoriesProviderProps, "children" | "theme" | "colorScheme" | "reducedMotion" | "rtl" | "mediaCache"> & {
  theme: StoriesTheme;
  scheme: ColorScheme;
  rtl: boolean;
  reducedMotion: boolean;
  mediaCache: MediaCache;
  /** Abre (con aviso `onActionClicked`) un enlace o deep link. */
  open: (action: ComponentAction, ctx: LinkContext) => void;
};

/** Misma referencia mientras las props no cambien de valor: el padre se re-renderiza y los hijos no. */
function useShallowStable<T extends object>(value: T): T {
  const ref = useRef(value);
  const prev = ref.current as Record<string, unknown>;
  const next = value as Record<string, unknown>;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(prev).length || keys.some((k) => prev[k] !== next[k])) ref.current = value;
  return ref.current;
}

const Ctx = createContext<StoriesContextValue | null>(null);

export function StoriesProvider({ children, theme, colorScheme, rtl, reducedMotion, mediaCache, ...rest }: StoriesProviderProps) {
  const system = useSystemColorScheme();
  const reduced = useReducedMotion(reducedMotion);
  const scheme = pickScheme(colorScheme, system);
  const resolvedTheme = useMemo(() => resolveTheme(scheme, theme), [scheme, theme]);
  const cache = useMemo(() => mediaCache ?? createDefaultMediaCache(), [mediaCache]);
  const isRtl = resolveRtl(rtl);
  const { onActionClicked, openLink, allowedSchemes } = rest;
  const open = useMemo(
    () => (action: ComponentAction, ctx: LinkContext): void => {
      onActionClicked?.(action, ctx);
      const done = openLink ? openLink(action, ctx) : openActionDefault(action, allowedSchemes);
      void Promise.resolve(done).catch(() => undefined);
    },
    [onActionClicked, openLink, allowedSchemes],
  );
  const stable = useShallowStable(rest);
  const value = useMemo<StoriesContextValue>(() => ({ ...stable, theme: resolvedTheme, scheme, rtl: isRtl, reducedMotion: reduced, mediaCache: cache, open }), [stable, resolvedTheme, scheme, isRtl, reduced, cache, open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStoriesContext(): StoriesContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStoriesContext: falta <StoriesProvider client={…}> más arriba");
  return v;
}

/** El cliente (placements, eventos, entrega) del proveedor. */
export function useStoriesClient(): StoriesClient {
  const { client } = useStoriesContext();
  if (!client) throw new Error("useStoriesClient: <StoriesProvider> no tiene `client`");
  return client;
}

export type { StoryComponentType };
