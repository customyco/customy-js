/** Textos de la interfaz (accesibilidad incluida). Español, inglés y portugués de Brasil de serie; el resto cae en inglés. */
export type Messages = {
  storyBar: string;
  openStory: string;
  statusNew: string;
  statusSeen: string;
  statusPartial: string;
  pinned: string;
  live: string;
  position: string;
  viewer: string;
  pageOf: string;
  pause: string;
  play: string;
  close: string;
  share: string;
  next: string;
  previous: string;
  progress: string;
  mute: string;
  unmute: string;
  captionsOn: string;
  captionsOff: string;
  copy: string;
  copied: string;
  reminderOn: string;
  reminderSet: string;
  countdownDone: string;
  pollThanks: string;
  banner: string;
  slideOf: string;
  dismiss: string;
  pauseAutoplay: string;
  playAutoplay: string;
  goToSlide: string;
  loading: string;
  unavailable: string;
  sponsorInfo: string;
  sponsorSheet: string;
  advertiser: string;
  payer: string;
  learnMore: string;
};

const es: Messages = {
  storyBar: "Historias",
  openStory: "Abrir historia: {title}",
  statusNew: "nueva",
  statusSeen: "vista",
  statusPartial: "a medias",
  pinned: "fijada",
  live: "en vivo",
  position: "{n} de {total}",
  viewer: "Historia de {title}",
  pageOf: "Página {n} de {total}",
  pause: "Pausar",
  play: "Reanudar",
  close: "Cerrar",
  share: "Compartir",
  next: "Siguiente",
  previous: "Anterior",
  progress: "Progreso de la historia",
  mute: "Silenciar",
  unmute: "Activar sonido",
  captionsOn: "Mostrar subtítulos",
  captionsOff: "Ocultar subtítulos",
  copy: "Copiar",
  copied: "Copiado",
  reminderOn: "Recordármelo",
  reminderSet: "Recordatorio activado",
  countdownDone: "Terminó",
  pollThanks: "Gracias por votar",
  banner: "Anuncio",
  slideOf: "Imagen {n} de {total}",
  dismiss: "Descartar",
  pauseAutoplay: "Pausar carrusel",
  playAutoplay: "Reanudar carrusel",
  goToSlide: "Ir a la imagen {n}",
  loading: "Cargando",
  unavailable: "No se pudo cargar",
  sponsorInfo: "Ver por qué ves esto",
  sponsorSheet: "Transparencia del anuncio",
  advertiser: "Anunciante",
  payer: "Paga",
  learnMore: "Más información",
};

const en: Messages = {
  storyBar: "Stories",
  openStory: "Open story: {title}",
  statusNew: "new",
  statusSeen: "seen",
  statusPartial: "in progress",
  pinned: "pinned",
  live: "live",
  position: "{n} of {total}",
  viewer: "Story from {title}",
  pageOf: "Page {n} of {total}",
  pause: "Pause",
  play: "Resume",
  close: "Close",
  share: "Share",
  next: "Next",
  previous: "Previous",
  progress: "Story progress",
  mute: "Mute",
  unmute: "Unmute",
  captionsOn: "Show captions",
  captionsOff: "Hide captions",
  copy: "Copy",
  copied: "Copied",
  reminderOn: "Remind me",
  reminderSet: "Reminder on",
  countdownDone: "Ended",
  pollThanks: "Thanks for voting",
  banner: "Announcement",
  slideOf: "Image {n} of {total}",
  dismiss: "Dismiss",
  pauseAutoplay: "Pause carousel",
  playAutoplay: "Resume carousel",
  goToSlide: "Go to image {n}",
  loading: "Loading",
  unavailable: "Could not load",
  sponsorInfo: "Why you're seeing this",
  sponsorSheet: "Ad transparency",
  advertiser: "Advertiser",
  payer: "Paid by",
  learnMore: "Learn more",
};

const pt: Messages = {
  storyBar: "Histórias",
  openStory: "Abrir história: {title}",
  statusNew: "nova",
  statusSeen: "vista",
  statusPartial: "em andamento",
  pinned: "fixada",
  live: "ao vivo",
  position: "{n} de {total}",
  viewer: "História de {title}",
  pageOf: "Página {n} de {total}",
  pause: "Pausar",
  play: "Retomar",
  close: "Fechar",
  share: "Compartilhar",
  next: "Próxima",
  previous: "Anterior",
  progress: "Progresso da história",
  mute: "Silenciar",
  unmute: "Ativar som",
  captionsOn: "Mostrar legendas",
  captionsOff: "Ocultar legendas",
  copy: "Copiar",
  copied: "Copiado",
  reminderOn: "Lembrar-me",
  reminderSet: "Lembrete ativado",
  countdownDone: "Encerrou",
  pollThanks: "Obrigado por votar",
  banner: "Anúncio",
  slideOf: "Imagem {n} de {total}",
  dismiss: "Dispensar",
  pauseAutoplay: "Pausar carrossel",
  playAutoplay: "Retomar carrossel",
  goToSlide: "Ir para a imagem {n}",
  loading: "Carregando",
  unavailable: "Não foi possível carregar",
  sponsorInfo: "Por que você está vendo isto",
  sponsorSheet: "Transparência do anúncio",
  advertiser: "Anunciante",
  payer: "Pago por",
  learnMore: "Saiba mais",
};

const BUNDLES: Record<string, Messages> = { es, en, pt };

/** Resuelve los textos de un idioma (`es-CO` → `es`) con sobrescrituras parciales. */
export function resolveMessages(locale?: string, overrides?: Partial<Messages>): Messages {
  const base = BUNDLES[(locale ?? "en").toLowerCase().split(/[-_]/)[0] ?? "en"] ?? en;
  return { ...base, ...overrides };
}

/** `fmt("{n} de {total}", { n: 2, total: 5 })`. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi", "ug", "dv", "ckb"]);
/** ¿El idioma se lee de derecha a izquierda? */
export function isRtlLocale(locale?: string): boolean {
  return RTL_LANGS.has((locale ?? "").toLowerCase().split(/[-_]/)[0] ?? "");
}
