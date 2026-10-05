import { fmt, isRtlLocale } from "../messages";

/**
 * Textos del Live (accesibilidad incluida). Aparte de `./messages` a propósito: quien no usa el Live no los paga.
 * Español, inglés y portugués de Brasil de serie; el resto cae en inglés.
 */
export type LiveMessages = {
  region: string;
  liveBadge: string;
  replayBadge: string;
  soonBadge: string;
  startsAt: string;
  startsIn: string;
  startsNow: string;
  watch: string;
  watchReplay: string;
  noticeCheck: string;
  noticeLink: string;
  connecting: string;
  waitingHost: string;
  reconnecting: string;
  ended: string;
  endedReplay: string;
  full: string;
  unavailable: string;
  errNetwork: string;
  errGeneric: string;
  retry: string;
  leave: string;
  pause: string;
  resume: string;
  paused: string;
  mute: string;
  unmute: string;
  captionsOn: string;
  captionsOff: string;
  captionsRegion: string;
  audience: string;
  recordingNotice: string;
  featured: string;
  view: string;
  addToCart: string;
  wishlist: string;
  chatTitle: string;
  chatInput: string;
  chatSend: string;
  chatPending: string;
  chatSent: string;
  chatMine: string;
  chatRateLimited: string;
  chatRefused: string;
  chatMuted: string;
  chatOptions: string;
  report: string;
  reportSend: string;
  reportThanks: string;
  block: string;
  blockedThanks: string;
  deleteMine: string;
  reactionsRegion: string;
  reactionNames: Record<"heart" | "fire" | "clap" | "laugh" | "wow", string>;
  reportReasons: Record<"spam" | "harassment" | "hate" | "nudity" | "violence" | "illegal" | "minor_safety" | "personal_data" | "other", string>;
};

const es: LiveMessages = {
  region: "Transmisión en vivo: {title}",
  liveBadge: "EN VIVO",
  replayBadge: "REPETICIÓN",
  soonBadge: "PRONTO",
  startsAt: "Empieza el {when}",
  startsIn: "Empieza en {n} min",
  startsNow: "Empieza en un momento",
  watch: "Ver en vivo",
  watchReplay: "Ver la repetición",
  noticeCheck: "He leído el aviso de esta transmisión",
  noticeLink: "Leer el aviso",
  connecting: "Conectando…",
  waitingHost: "Esperando al presentador…",
  reconnecting: "Se perdió la conexión. Reconectando…",
  ended: "La transmisión terminó.",
  endedReplay: "La transmisión terminó. La repetición estará disponible pronto.",
  full: "Esta transmisión está llena. Inténtalo en un momento.",
  unavailable: "Esta transmisión no está disponible.",
  errNetwork: "Sin conexión. Revisa tu red e inténtalo otra vez.",
  errGeneric: "No se pudo completar. Inténtalo otra vez.",
  retry: "Reintentar",
  leave: "Salir de la transmisión",
  pause: "Pausar",
  resume: "Reanudar",
  paused: "En pausa",
  mute: "Silenciar",
  unmute: "Activar sonido",
  captionsOn: "Activar subtítulos",
  captionsOff: "Ocultar subtítulos",
  captionsRegion: "Subtítulos",
  audience: "Unas {n} personas viendo",
  recordingNotice: "Esta transmisión se graba.",
  featured: "Productos destacados",
  view: "Ver",
  addToCart: "Agregar al carrito",
  wishlist: "Guardar en favoritos",
  chatTitle: "Chat",
  chatInput: "Escribe un mensaje",
  chatSend: "Enviar",
  chatPending: "En revisión",
  chatSent: "Enviado",
  chatMine: "Tú",
  chatRateLimited: "Vas muy rápido. Espera un momento.",
  chatRefused: "No se pudo enviar: no se admiten enlaces, correos ni teléfonos.",
  chatMuted: "No puedes escribir en esta transmisión.",
  chatOptions: "Opciones del mensaje",
  report: "Reportar",
  reportSend: "Enviar reporte",
  reportThanks: "Gracias. Lo revisaremos.",
  block: "No ver más a esta persona",
  blockedThanks: "Listo. No verás sus mensajes.",
  deleteMine: "Borrar mi mensaje",
  reactionsRegion: "Reacciones",
  reactionNames: { heart: "Me encanta", fire: "Fuego", clap: "Aplauso", laugh: "Risa", wow: "Asombro" },
  reportReasons: { spam: "Spam", harassment: "Acoso", hate: "Odio", nudity: "Desnudez", violence: "Violencia", illegal: "Ilegal", minor_safety: "Seguridad de menores", personal_data: "Datos personales", other: "Otro" },
};

const en: LiveMessages = {
  region: "Live stream: {title}",
  liveBadge: "LIVE",
  replayBadge: "REPLAY",
  soonBadge: "SOON",
  startsAt: "Starts {when}",
  startsIn: "Starts in {n} min",
  startsNow: "Starting in a moment",
  watch: "Watch live",
  watchReplay: "Watch the replay",
  noticeCheck: "I have read the notice for this stream",
  noticeLink: "Read the notice",
  connecting: "Connecting…",
  waitingHost: "Waiting for the host…",
  reconnecting: "Connection lost. Reconnecting…",
  ended: "The stream has ended.",
  endedReplay: "The stream has ended. The replay will be available soon.",
  full: "This stream is full. Try again in a moment.",
  unavailable: "This stream is not available.",
  errNetwork: "No connection. Check your network and try again.",
  errGeneric: "That didn't work. Try again.",
  retry: "Retry",
  leave: "Leave the stream",
  pause: "Pause",
  resume: "Resume",
  paused: "Paused",
  mute: "Mute",
  unmute: "Unmute",
  captionsOn: "Turn captions on",
  captionsOff: "Hide captions",
  captionsRegion: "Captions",
  audience: "About {n} people watching",
  recordingNotice: "This stream is recorded.",
  featured: "Featured products",
  view: "View",
  addToCart: "Add to cart",
  wishlist: "Save to favorites",
  chatTitle: "Chat",
  chatInput: "Write a message",
  chatSend: "Send",
  chatPending: "Under review",
  chatSent: "Sent",
  chatMine: "You",
  chatRateLimited: "You're going too fast. Wait a moment.",
  chatRefused: "Couldn't send: links, e-mails and phone numbers are not allowed.",
  chatMuted: "You can't write in this stream.",
  chatOptions: "Message options",
  report: "Report",
  reportSend: "Send report",
  reportThanks: "Thanks. We'll review it.",
  block: "Don't show this person again",
  blockedThanks: "Done. You won't see their messages.",
  deleteMine: "Delete my message",
  reactionsRegion: "Reactions",
  reactionNames: { heart: "Love", fire: "Fire", clap: "Applause", laugh: "Laugh", wow: "Wow" },
  reportReasons: { spam: "Spam", harassment: "Harassment", hate: "Hate", nudity: "Nudity", violence: "Violence", illegal: "Illegal", minor_safety: "Minor safety", personal_data: "Personal data", other: "Other" },
};

const pt: LiveMessages = {
  ...en,
  region: "Transmissão ao vivo: {title}",
  liveBadge: "AO VIVO",
  replayBadge: "REPRISE",
  soonBadge: "EM BREVE",
  startsAt: "Começa em {when}",
  startsIn: "Começa em {n} min",
  startsNow: "Começa em instantes",
  watch: "Assistir ao vivo",
  watchReplay: "Assistir à reprise",
  noticeCheck: "Li o aviso desta transmissão",
  noticeLink: "Ler o aviso",
  connecting: "Conectando…",
  waitingHost: "Aguardando o apresentador…",
  reconnecting: "Conexão perdida. Reconectando…",
  ended: "A transmissão terminou.",
  endedReplay: "A transmissão terminou. A reprise estará disponível em breve.",
  full: "Esta transmissão está lotada. Tente em instantes.",
  unavailable: "Esta transmissão não está disponível.",
  errNetwork: "Sem conexão. Verifique sua rede e tente de novo.",
  errGeneric: "Não foi possível concluir. Tente de novo.",
  retry: "Tentar de novo",
  leave: "Sair da transmissão",
  pause: "Pausar",
  resume: "Retomar",
  paused: "Em pausa",
  mute: "Silenciar",
  unmute: "Ativar o som",
  captionsOn: "Ativar legendas",
  captionsOff: "Ocultar legendas",
  captionsRegion: "Legendas",
  audience: "Cerca de {n} pessoas assistindo",
  recordingNotice: "Esta transmissão é gravada.",
  featured: "Produtos em destaque",
  view: "Ver",
  addToCart: "Adicionar ao carrinho",
  wishlist: "Salvar nos favoritos",
  chatTitle: "Chat",
  chatInput: "Escreva uma mensagem",
  chatSend: "Enviar",
  chatPending: "Em revisão",
  chatSent: "Enviado",
  chatMine: "Você",
  chatRateLimited: "Você está indo rápido demais. Espere um momento.",
  chatRefused: "Não foi possível enviar: links, e-mails e telefones não são permitidos.",
  chatMuted: "Você não pode escrever nesta transmissão.",
  chatOptions: "Opções da mensagem",
  report: "Denunciar",
  reportSend: "Enviar denúncia",
  reportThanks: "Obrigado. Vamos analisar.",
  block: "Não ver mais esta pessoa",
  blockedThanks: "Pronto. Você não verá as mensagens dela.",
  deleteMine: "Apagar minha mensagem",
  reactionsRegion: "Reações",
  reactionNames: { heart: "Amei", fire: "Fogo", clap: "Aplausos", laugh: "Risada", wow: "Uau" },
  reportReasons: { spam: "Spam", harassment: "Assédio", hate: "Ódio", nudity: "Nudez", violence: "Violência", illegal: "Ilegal", minor_safety: "Segurança de menores", personal_data: "Dados pessoais", other: "Outro" },
};

const BUNDLES: Record<string, LiveMessages> = { es, en, pt };

export function resolveLiveMessages(locale?: string, overrides?: Partial<LiveMessages>): LiveMessages {
  const base = BUNDLES[(locale ?? "en").toLowerCase().split(/[-_]/)[0] ?? "en"] ?? en;
  return { ...base, ...overrides };
}

export { fmt, isRtlLocale };
