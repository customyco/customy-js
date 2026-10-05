import { fmt } from "../core";

/**
 * Textos de los widgets nativos (accesibilidad incluida). Mismas claves y significado que `resolveWidgetMessages` del
 * renderer web —que no lo exporta por subruta— con la redacción adaptada a lo táctil (gestos, acciones de
 * accesibilidad). Viven aparte del núcleo a propósito: quien no usa un widget no los paga. Español, inglés y portugués de Brasil; el resto cae en inglés.
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
  // productos de Video Feed, Canvas e Inline
  productsLabel: string;
  addToCart: string;
  addedToCart: string;
  addToCartOf: string;
  save: string;
  saved: string;
  saveOf: string;
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
  shared: "Enlace compartido",
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
  shared: "Link shared",
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
  shared: "Link compartilhado",
  closeViewer: "Fechar vídeos",
  nextVideo: "Próximo vídeo",
  previousVideo: "Vídeo anterior",
  viewOnNetwork: "Ver no {network}",
  autoplayPaused: "Reprodução automática pausada",
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

const es_rest = {
  dismiss: "Descartar",
  loading: "Cargando",
  unavailable: "No se pudo cargar",
  canvasLabel: "Colección",
  tileLabel: "{title}",
  cards: "Tarjetas de producto",
  cardOf: "Producto {n} de {total}",
  cardsHelp: "Desliza a la derecha si te gusta y a la izquierda si no, o usa los botones o las acciones de accesibilidad.",
  liked: "{title}: me gusta",
  skipped: "{title}: descartado",
  unavailableProduct: "No disponible",
  endTitle: "Eso es todo por ahora",
  likedList: "Productos que te gustaron",
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
  tour: "Recorrido",
  stepOf: "Paso {n} de {total}",
  next: "Siguiente",
  back: "Atrás",
  skip: "Omitir recorrido",
  finish: "Terminar",
  showStep: "Mostrar el paso: {title}",
  inline: "Contenido destacado",
};
const en_rest = {
  dismiss: "Dismiss",
  loading: "Loading",
  unavailable: "Could not load",
  canvasLabel: "Collection",
  tileLabel: "{title}",
  cards: "Product cards",
  cardOf: "Product {n} of {total}",
  cardsHelp: "Swipe right if you like it and left if you don't, or use the buttons or the accessibility actions.",
  liked: "{title}: liked",
  skipped: "{title}: skipped",
  unavailableProduct: "Unavailable",
  endTitle: "That's all for now",
  likedList: "Products you liked",
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
  tour: "Tour",
  stepOf: "Step {n} of {total}",
  next: "Next",
  back: "Back",
  skip: "Skip tour",
  finish: "Finish",
  showStep: "Show step: {title}",
  inline: "Featured content",
};
const pt_rest = {
  dismiss: "Dispensar",
  loading: "Carregando",
  unavailable: "Não foi possível carregar",
  canvasLabel: "Coleção",
  tileLabel: "{title}",
  cards: "Cartões de produto",
  cardOf: "Produto {n} de {total}",
  cardsHelp: "Deslize para a direita se gostar e para a esquerda se não gostar, ou use os botões ou as ações de acessibilidade.",
  liked: "{title}: curtido",
  skipped: "{title}: dispensado",
  unavailableProduct: "Indisponível",
  endTitle: "Por enquanto é só",
  likedList: "Produtos que você curtiu",
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
  tour: "Tour",
  stepOf: "Passo {n} de {total}",
  next: "Próximo",
  back: "Voltar",
  skip: "Pular o tour",
  finish: "Concluir",
  showStep: "Mostrar o passo: {title}",
  inline: "Conteúdo em destaque",
};

type Lang = "es" | "en" | "pt";
const lang = (locale?: string): Lang => {
  const l = (locale ?? "en").toLowerCase().split(/[-_]/)[0];
  return l === "es" || l === "pt" ? l : "en";
};
const feed = (l?: string) => ({ es: es_feed, en: en_feed, pt: pt_feed })[lang(l)];
const products = (l?: string) => ({ es: es_products, en: en_products, pt: pt_products })[lang(l)];
const rest = (l?: string) => ({ es: es_rest, en: en_rest, pt: pt_rest })[lang(l)];

/** Los textos de TODOS los widgets (lo exporta `./widgets`). */
export function resolveWidgetMessages(locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages {
  return { ...rest(locale), ...feed(locale), ...products(locale), ...overrides };
}

/**
 * Los textos del Video Feed: solo los suyos y los de producto. Su paquete (`./video-feed`) no carga los del Checklist, el
 * Tour ni el resto; el tipo es el completo por comodidad, pero el visor solo lee estas claves (una prueba lo vigila).
 */
export function resolveFeedMessages(locale?: string, overrides?: Partial<WidgetMessages>): WidgetMessages {
  return { ...feed(locale), ...products(locale), ...overrides } as WidgetMessages;
}

/** Las claves que lleva `resolveFeedMessages`. */
export const FEED_MESSAGE_KEYS: readonly string[] = [...Object.keys(en_feed), ...Object.keys(en_products)];

export { fmt };
