import { fmt, isRtlLocale } from "../messages";

/**
 * Textos de los widgets de la Ola 3 (accesibilidad incluida). Viven aparte de `../messages` a propósito: el núcleo no
 * crece por ellos y quien no usa un widget no los paga. Español, inglés y portugués de Brasil de serie; el resto cae en inglés.
 */
export type WidgetMessages = {
  dismiss: string;
  loading: string;
  unavailable: string;
  // canvas
  canvasLabel: string;
  tileLabel: string;
  // video feed
  videoFeed: string;
  openVideo: string;
  videoOf: string;
  imageOf: string;
  pauseVideo: string;
  playVideo: string;
  muteVideo: string;
  unmuteVideo: string;
  share: string;
  shared: string;
  closeViewer: string;
  nextVideo: string;
  previousVideo: string;
  viewOnNetwork: string;
  autoplayPaused: string;
  // swipe cards
  cards: string;
  cardOf: string;
  cardsHelp: string;
  liked: string;
  skipped: string;
  unavailableProduct: string;
  endTitle: string;
  likedList: string;
  // checklist
  checklist: string;
  progressOf: string;
  itemDone: string;
  itemLocked: string;
  itemOpen: string;
  dismissTitle: string;
  dismissBody: string;
  dismissConfirm: string;
  dismissCancel: string;
  allDone: string;
  // tour
  tour: string;
  stepOf: string;
  next: string;
  back: string;
  skip: string;
  finish: string;
  showStep: string;
  // inline
  inline: string;
  // productos de un elemento (carrito y guardar)
  productsLabel: string;
  addToCart: string;
  addedToCart: string;
  addToCartOf: string;
  save: string;
  saved: string;
  saveOf: string;
};

/** Los grupos de textos: cada widget del renderer carga solo los suyos (el resto no viaja en su paquete). */
export type WidgetMessageGroup = "base" | "canvas" | "feed" | "swipe" | "checklist" | "tour" | "inline" | "products" | "misc";

const es_base = {
  dismiss: "Descartar",
};
const en_base = {
  dismiss: "Dismiss",
};
const pt_base = {
  dismiss: "Dispensar",
};

const es_canvas = {
  canvasLabel: "Colección",
  tileLabel: "{title}",
};
const en_canvas = {
  canvasLabel: "Collection",
  tileLabel: "{title}",
};
const pt_canvas = {
  canvasLabel: "Coleção",
  tileLabel: "{title}",
};

const es_feed = {
  videoFeed: "Vídeos",
  openVideo: "Ver vídeo: {title}",
  videoOf: "Vídeo {n} de {total}",
  imageOf: "Imagen {n} de {total}",
  pauseVideo: "Pausar",
  playVideo: "Reproducir",
  muteVideo: "Silenciar",
  unmuteVideo: "Activar sonido",
  share: "Compartir",
  shared: "Enlace copiado",
  closeViewer: "Cerrar vídeos",
  nextVideo: "Siguiente vídeo",
  previousVideo: "Vídeo anterior",
  viewOnNetwork: "Ver en {network}",
  autoplayPaused: "Reproducción automática en pausa",
};
const en_feed = {
  videoFeed: "Videos",
  openVideo: "Watch video: {title}",
  videoOf: "Video {n} of {total}",
  imageOf: "Image {n} of {total}",
  pauseVideo: "Pause",
  playVideo: "Play",
  muteVideo: "Mute",
  unmuteVideo: "Unmute",
  share: "Share",
  shared: "Link copied",
  closeViewer: "Close videos",
  nextVideo: "Next video",
  previousVideo: "Previous video",
  viewOnNetwork: "View on {network}",
  autoplayPaused: "Autoplay paused",
};
const pt_feed = {
  videoFeed: "Vídeos",
  openVideo: "Assistir ao vídeo: {title}",
  videoOf: "Vídeo {n} de {total}",
  imageOf: "Imagem {n} de {total}",
  pauseVideo: "Pausar",
  playVideo: "Reproduzir",
  muteVideo: "Silenciar",
  unmuteVideo: "Ativar som",
  share: "Compartilhar",
  shared: "Link copiado",
  closeViewer: "Fechar vídeos",
  nextVideo: "Próximo vídeo",
  previousVideo: "Vídeo anterior",
  viewOnNetwork: "Ver no {network}",
  autoplayPaused: "Reprodução automática pausada",
};

const es_swipe = {
  cards: "Tarjetas de producto",
  cardOf: "Producto {n} de {total}",
  cardsHelp: "Desliza a la derecha si te gusta y a la izquierda si no, o usa las flechas del teclado o los botones.",
  liked: "{title}: me gusta",
  skipped: "{title}: descartado",
  unavailableProduct: "No disponible",
  endTitle: "Eso es todo por ahora",
  likedList: "Productos que te gustaron",
};
const en_swipe = {
  cards: "Product cards",
  cardOf: "Product {n} of {total}",
  cardsHelp: "Swipe right if you like it and left if you don't, or use the arrow keys or the buttons.",
  liked: "{title}: liked",
  skipped: "{title}: skipped",
  unavailableProduct: "Unavailable",
  endTitle: "That's all for now",
  likedList: "Products you liked",
};
const pt_swipe = {
  cards: "Cartões de produto",
  cardOf: "Produto {n} de {total}",
  cardsHelp: "Deslize para a direita se gostar e para a esquerda se não gostar, ou use as setas do teclado ou os botões.",
  liked: "{title}: curtido",
  skipped: "{title}: dispensado",
  unavailableProduct: "Indisponível",
  endTitle: "Por enquanto é só",
  likedList: "Produtos que você curtiu",
};

const es_checklist = {
  checklist: "Lista de pasos",
  progressOf: "{done} de {total} completados",
  itemDone: "{title}: completado",
  itemLocked: "{title}: completa antes el paso anterior",
  itemOpen: "{title}: pendiente",
  dismissTitle: "¿Descartar la lista?",
  dismissBody: "No volverás a verla.",
  dismissConfirm: "Descartar",
  dismissCancel: "Cancelar",
  allDone: "¡Listo!",
};
const en_checklist = {
  checklist: "Checklist",
  progressOf: "{done} of {total} completed",
  itemDone: "{title}: completed",
  itemLocked: "{title}: complete the previous step first",
  itemOpen: "{title}: pending",
  dismissTitle: "Dismiss the list?",
  dismissBody: "You won't see it again.",
  dismissConfirm: "Dismiss",
  dismissCancel: "Cancel",
  allDone: "All done!",
};
const pt_checklist = {
  checklist: "Lista de passos",
  progressOf: "{done} de {total} concluídos",
  itemDone: "{title}: concluído",
  itemLocked: "{title}: conclua antes o passo anterior",
  itemOpen: "{title}: pendente",
  dismissTitle: "Dispensar a lista?",
  dismissBody: "Você não voltará a vê-la.",
  dismissConfirm: "Dispensar",
  dismissCancel: "Cancelar",
  allDone: "Tudo pronto!",
};

const es_tour = {
  tour: "Recorrido",
  stepOf: "Paso {n} de {total}",
  next: "Siguiente",
  back: "Atrás",
  skip: "Omitir recorrido",
  finish: "Terminar",
  showStep: "Mostrar el paso: {title}",
};
const en_tour = {
  tour: "Tour",
  stepOf: "Step {n} of {total}",
  next: "Next",
  back: "Back",
  skip: "Skip tour",
  finish: "Finish",
  showStep: "Show step: {title}",
};
const pt_tour = {
  tour: "Tour",
  stepOf: "Passo {n} de {total}",
  next: "Próximo",
  back: "Voltar",
  skip: "Pular o tour",
  finish: "Concluir",
  showStep: "Mostrar o passo: {title}",
};

const es_inline = {
  inline: "Contenido destacado",
};
const en_inline = {
  inline: "Featured content",
};
const pt_inline = {
  inline: "Conteúdo em destaque",
};

const es_products = {
  productsLabel: "Productos",
  addToCart: "Añadir al carrito",
  addedToCart: "Añadido",
  addToCartOf: "Añadir al carrito: {title}",
  save: "Guardar",
  saved: "Guardado",
  saveOf: "Guardar: {title}",
};
const en_products = {
  productsLabel: "Products",
  addToCart: "Add to cart",
  addedToCart: "Added",
  addToCartOf: "Add to cart: {title}",
  save: "Save",
  saved: "Saved",
  saveOf: "Save: {title}",
};
const pt_products = {
  productsLabel: "Produtos",
  addToCart: "Adicionar ao carrinho",
  addedToCart: "Adicionado",
  addToCartOf: "Adicionar ao carrinho: {title}",
  save: "Salvar",
  saved: "Salvo",
  saveOf: "Salvar: {title}",
};

const es_misc = {
  loading: "Cargando",
  unavailable: "No se pudo cargar",
};
const en_misc = {
  loading: "Loading",
  unavailable: "Could not load",
};
const pt_misc = {
  loading: "Carregando",
  unavailable: "Não foi possível carregar",
};

type Lang = "es" | "en" | "pt";
const lang = (locale?: string): Lang => {
  const l = (locale ?? "en").toLowerCase().split(/[-_]/)[0];
  return l === "es" || l === "pt" ? l : "en";
};
const pick = <T>(locale: string | undefined, b: Record<Lang, T>): T => b[lang(locale)];

const base = (locale?: string) => pick(locale, { es: es_base, en: en_base, pt: pt_base });
const canvas = (locale?: string) => pick(locale, { es: es_canvas, en: en_canvas, pt: pt_canvas });
const feed = (locale?: string) => pick(locale, { es: es_feed, en: en_feed, pt: pt_feed });
const swipe = (locale?: string) => pick(locale, { es: es_swipe, en: en_swipe, pt: pt_swipe });
const checklist = (locale?: string) => pick(locale, { es: es_checklist, en: en_checklist, pt: pt_checklist });
const tour = (locale?: string) => pick(locale, { es: es_tour, en: en_tour, pt: pt_tour });
const inline = (locale?: string) => pick(locale, { es: es_inline, en: en_inline, pt: pt_inline });
const products = (locale?: string) => pick(locale, { es: es_products, en: en_products, pt: pt_products });
const misc = (locale?: string) => pick(locale, { es: es_misc, en: en_misc, pt: pt_misc });

/**
 * Los textos de UN widget: solo los grupos que usa, con las sobrescrituras de la app encima. El tipo es el completo por
 * comodidad (los widgets comparten `m`), pero el resto de claves no existe en tiempo de ejecución: cada widget solo lee
 * las suyas (una prueba lo vigila). Así Canvas no paga los textos del Tour ni el Video Feed los del Checklist.
 */
const compose = (locale: string | undefined, overrides: Partial<WidgetMessages> | undefined, ...parts: Array<(l?: string) => object>): WidgetMessages =>
  Object.assign({}, ...parts.map((p) => p(locale)), overrides) as WidgetMessages;

export const canvasMessages = (locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages => compose(locale, overrides, canvas, products);
export const inlineMessages = (locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages => compose(locale, overrides, base, inline, products);
export const videoFeedMessages = (locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages => compose(locale, overrides, feed, products);
export const swipeCardsMessages = (locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages => compose(locale, overrides, swipe);
export const checklistMessages = (locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages => compose(locale, overrides, base, checklist);
export const tourMessages = (locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages => compose(locale, overrides, tour);

/** Todos los textos (es, en, pt): lo usan los generadores de los SDK nativos y las pruebas de paridad. */
export function resolveWidgetMessages(locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages {
  return compose(locale, overrides, base, canvas, feed, swipe, checklist, tour, inline, products, misc);
}

/** Qué claves de `WidgetMessages` lleva cada widget (la prueba comprueba que cubren todo lo que su código lee). */
export const WIDGET_MESSAGE_KEYS = {
  canvas: [...Object.keys(en_canvas), ...Object.keys(en_products)],
  inline: [...Object.keys(en_base), ...Object.keys(en_inline), ...Object.keys(en_products)],
  video_feed: [...Object.keys(en_feed), ...Object.keys(en_products)],
  swipe_cards: Object.keys(en_swipe),
  checklist: [...Object.keys(en_base), ...Object.keys(en_checklist)],
  tour: Object.keys(en_tour),
} as const;

export { fmt, isRtlLocale };
