import { fmt } from "../messages";

/**
 * Textos de las historias de la comunidad (UGC): componer, reportar, bloquear, «mis historias» y reclamar. Viven aparte de
 * `../messages` a propósito: el núcleo no crece por ellos y quien no ofrece UGC no los paga. Español, inglés y portugués de
 * serie; el resto cae en inglés.
 */
export type UgcMessages = {
  composerTitle: string;
  chooseMedia: string;
  mediaChosen: string;
  caption: string;
  captionCount: string;
  alt: string;
  altHint: string;
  authorLabel: string;
  authorLabelHint: string;
  acceptTerms: string;
  readTerms: string;
  submit: string;
  submitting: string;
  submitted: string;
  close: string;
  // refusals
  errTermsOutdated: string;
  errFilter: string;
  errVideo: string;
  errRate: string;
  errDisabled: string;
  errMinors: string;
  errBlocked: string;
  errMedia: string;
  errMediaNotReady: string;
  errUnavailable: string;
  errGeneric: string;
  fieldCaption: string;
  fieldAlt: string;
  fieldAuthorLabel: string;
  // viewer actions
  more: string;
  communityStory: string;
  communityBy: string;
  report: string;
  reportTitle: string;
  reportDetail: string;
  reportSend: string;
  reportThanks: string;
  blockAuthor: string;
  blockedThanks: string;
  cancel: string;
  reasons: Record<"spam" | "nudity" | "violence" | "hate" | "harassment" | "illegal" | "minor_safety" | "personal_data" | "copyright" | "other", string>;
  // my stories
  mineTitle: string;
  mineEmpty: string;
  status: Record<"pending" | "approved" | "rejected" | "removed", string>;
  reasonCodes: Record<"spam" | "nudity" | "violence" | "hate" | "harassment" | "illegal" | "minor_safety" | "personal_data" | "copyright" | "off_topic" | "low_quality" | "classifier" | "filter" | "author_blocked" | "other", string>;
  reasonLabel: string;
  appeal: string;
  appealPlaceholder: string;
  appealSend: string;
  appealSent: string;
  appealOpen: string;
  appealUpheld: string;
  appealOverturned: string;
  delete: string;
  deleteConfirm: string;
  deleted: string;
  exportMine: string;
};

const es: UgcMessages = {
  composerTitle: "Comparte tu historia",
  chooseMedia: "Elegir foto o vídeo",
  mediaChosen: "Archivo elegido: {name}",
  caption: "Pie (opcional)",
  captionCount: "{n} de {max}",
  alt: "Descripción para quien no ve la imagen",
  altHint: "Obligatoria si no escribes un pie.",
  authorLabel: "Cómo te mostramos (opcional)",
  authorLabelHint: "Si lo dejas vacío, tu historia es anónima.",
  acceptTerms: "Acepto los términos de la comunidad",
  readTerms: "Leer los términos",
  submit: "Enviar",
  submitting: "Enviando…",
  submitted: "Gracias. Tu historia se revisará antes de publicarse.",
  close: "Cerrar",
  errTermsOutdated: "Los términos cambiaron. Léelos y acéptalos de nuevo.",
  errFilter: "No se pudo enviar: revisa {field} (no se admiten enlaces, correos ni teléfonos). Cámbialo e inténtalo otra vez.",
  errVideo: "Esta comunidad solo acepta fotos.",
  errRate: "Llegaste al máximo de envíos de hoy. Vuelve mañana.",
  errDisabled: "Esta comunidad no recibe historias ahora.",
  errMinors: "Esta comunidad no está disponible para ti.",
  errBlocked: "No puedes participar en esta comunidad.",
  errMedia: "El archivo no pasó la revisión de seguridad.",
  errMediaNotReady: "El archivo aún se está revisando. Inténtalo en un momento.",
  errUnavailable: "No se puede subir ahora. Inténtalo más tarde.",
  errGeneric: "No se pudo enviar. Inténtalo otra vez.",
  fieldCaption: "el pie",
  fieldAlt: "la descripción",
  fieldAuthorLabel: "el nombre",
  more: "Más opciones",
  communityStory: "Historia de la comunidad",
  communityBy: "Comunidad · {name}",
  report: "Reportar",
  reportTitle: "¿Por qué la reportas?",
  reportDetail: "Detalles (opcional)",
  reportSend: "Enviar reporte",
  reportThanks: "Gracias. Lo revisaremos.",
  blockAuthor: "No ver más a esta persona",
  blockedThanks: "Listo. Ya no verás sus historias.",
  cancel: "Cancelar",
  reasons: { spam: "Spam o publicidad", nudity: "Desnudez o contenido sexual", violence: "Violencia", hate: "Odio o discriminación", harassment: "Acoso", illegal: "Contenido ilegal", minor_safety: "Riesgo para menores", personal_data: "Datos personales", copyright: "Derechos de autor", other: "Otro motivo" },
  mineTitle: "Mis historias",
  mineEmpty: "Aún no has compartido ninguna.",
  status: { pending: "En revisión", approved: "Publicada", rejected: "Rechazada", removed: "Retirada" },
  reasonCodes: { spam: "Spam o publicidad", nudity: "Desnudez o contenido sexual", violence: "Violencia", hate: "Odio o discriminación", harassment: "Acoso", illegal: "Contenido ilegal", minor_safety: "Riesgo para menores", personal_data: "Datos personales", copyright: "Derechos de autor", off_topic: "No es del tema de la comunidad", low_quality: "Calidad insuficiente", classifier: "Revisión automática", filter: "Filtro de texto", author_blocked: "Cuenta bloqueada", other: "Otro motivo" },
  reasonLabel: "Motivo",
  appeal: "No estoy de acuerdo",
  appealPlaceholder: "Cuéntanos por qué crees que debe publicarse (mín. 10 caracteres)",
  appealSend: "Enviar reclamación",
  appealSent: "Recibimos tu reclamación. Otra persona la revisará.",
  appealOpen: "Reclamación en revisión",
  appealUpheld: "Reclamación revisada: se mantiene la decisión",
  appealOverturned: "Reclamación aceptada: tu historia se publicó",
  delete: "Borrar",
  deleteConfirm: "¿Borrar esta historia? No se puede deshacer.",
  deleted: "Borrada.",
  exportMine: "Descargar mis datos",
};

const en: UgcMessages = {
  composerTitle: "Share your story",
  chooseMedia: "Choose a photo or video",
  mediaChosen: "File chosen: {name}",
  caption: "Caption (optional)",
  captionCount: "{n} of {max}",
  alt: "Description for people who can't see the image",
  altHint: "Required if you don't write a caption.",
  authorLabel: "How we show you (optional)",
  authorLabelHint: "Leave it empty and your story is anonymous.",
  acceptTerms: "I accept the community terms",
  readTerms: "Read the terms",
  submit: "Send",
  submitting: "Sending…",
  submitted: "Thanks. Your story will be reviewed before it is published.",
  close: "Close",
  errTermsOutdated: "The terms changed. Read and accept them again.",
  errFilter: "It couldn't be sent: check {field} (links, e-mails and phone numbers aren't allowed). Change it and try again.",
  errVideo: "This community only accepts photos.",
  errRate: "You reached today's limit. Come back tomorrow.",
  errDisabled: "This community isn't accepting stories right now.",
  errMinors: "This community isn't available for you.",
  errBlocked: "You can't take part in this community.",
  errMedia: "The file didn't pass the safety check.",
  errMediaNotReady: "The file is still being checked. Try again in a moment.",
  errUnavailable: "Uploads aren't available right now. Try again later.",
  errGeneric: "It couldn't be sent. Try again.",
  fieldCaption: "the caption",
  fieldAlt: "the description",
  fieldAuthorLabel: "the name",
  more: "More options",
  communityStory: "Community story",
  communityBy: "Community · {name}",
  report: "Report",
  reportTitle: "Why are you reporting it?",
  reportDetail: "Details (optional)",
  reportSend: "Send report",
  reportThanks: "Thanks. We'll review it.",
  blockAuthor: "Don't show this person again",
  blockedThanks: "Done. You won't see their stories anymore.",
  cancel: "Cancel",
  reasons: { spam: "Spam or advertising", nudity: "Nudity or sexual content", violence: "Violence", hate: "Hate or discrimination", harassment: "Harassment", illegal: "Illegal content", minor_safety: "Risk to minors", personal_data: "Personal data", copyright: "Copyright", other: "Something else" },
  mineTitle: "My stories",
  mineEmpty: "You haven't shared any yet.",
  status: { pending: "Under review", approved: "Published", rejected: "Rejected", removed: "Removed" },
  reasonCodes: { spam: "Spam or advertising", nudity: "Nudity or sexual content", violence: "Violence", hate: "Hate or discrimination", harassment: "Harassment", illegal: "Illegal content", minor_safety: "Risk to minors", personal_data: "Personal data", copyright: "Copyright", off_topic: "Off-topic for this community", low_quality: "Quality too low", classifier: "Automatic review", filter: "Text filter", author_blocked: "Account blocked", other: "Something else" },
  reasonLabel: "Reason",
  appeal: "I disagree",
  appealPlaceholder: "Tell us why you think it should be published (min. 10 characters)",
  appealSend: "Send appeal",
  appealSent: "We got your appeal. Another person will review it.",
  appealOpen: "Appeal under review",
  appealUpheld: "Appeal reviewed: the decision stands",
  appealOverturned: "Appeal accepted: your story is published",
  delete: "Delete",
  deleteConfirm: "Delete this story? This can't be undone.",
  deleted: "Deleted.",
  exportMine: "Download my data",
};

const pt: UgcMessages = {
  composerTitle: "Compartilhe sua história",
  chooseMedia: "Escolher foto ou vídeo",
  mediaChosen: "Arquivo escolhido: {name}",
  caption: "Legenda (opcional)",
  captionCount: "{n} de {max}",
  alt: "Descrição para quem não vê a imagem",
  altHint: "Obrigatória se você não escrever uma legenda.",
  authorLabel: "Como mostramos você (opcional)",
  authorLabelHint: "Se deixar vazio, sua história é anônima.",
  acceptTerms: "Aceito os termos da comunidade",
  readTerms: "Ler os termos",
  submit: "Enviar",
  submitting: "Enviando…",
  submitted: "Obrigado. Sua história será revisada antes de ser publicada.",
  close: "Fechar",
  errTermsOutdated: "Os termos mudaram. Leia e aceite de novo.",
  errFilter: "Não foi possível enviar: revise {field} (links, e-mails e telefones não são permitidos). Mude e tente de novo.",
  errVideo: "Esta comunidade só aceita fotos.",
  errRate: "Você chegou ao limite de hoje. Volte amanhã.",
  errDisabled: "Esta comunidade não está recebendo histórias agora.",
  errMinors: "Esta comunidade não está disponível para você.",
  errBlocked: "Você não pode participar desta comunidade.",
  errMedia: "O arquivo não passou na verificação de segurança.",
  errMediaNotReady: "O arquivo ainda está sendo verificado. Tente em instantes.",
  errUnavailable: "Não é possível enviar agora. Tente mais tarde.",
  errGeneric: "Não foi possível enviar. Tente de novo.",
  fieldCaption: "a legenda",
  fieldAlt: "a descrição",
  fieldAuthorLabel: "o nome",
  more: "Mais opções",
  communityStory: "História da comunidade",
  communityBy: "Comunidade · {name}",
  report: "Denunciar",
  reportTitle: "Por que você está denunciando?",
  reportDetail: "Detalhes (opcional)",
  reportSend: "Enviar denúncia",
  reportThanks: "Obrigado. Vamos revisar.",
  blockAuthor: "Não ver mais esta pessoa",
  blockedThanks: "Pronto. Você não verá mais as histórias dela.",
  cancel: "Cancelar",
  reasons: { spam: "Spam ou publicidade", nudity: "Nudez ou conteúdo sexual", violence: "Violência", hate: "Ódio ou discriminação", harassment: "Assédio", illegal: "Conteúdo ilegal", minor_safety: "Risco para menores", personal_data: "Dados pessoais", copyright: "Direitos autorais", other: "Outro motivo" },
  mineTitle: "Minhas histórias",
  mineEmpty: "Você ainda não compartilhou nenhuma.",
  status: { pending: "Em revisão", approved: "Publicada", rejected: "Rejeitada", removed: "Removida" },
  reasonCodes: { spam: "Spam ou publicidade", nudity: "Nudez ou conteúdo sexual", violence: "Violência", hate: "Ódio ou discriminação", harassment: "Assédio", illegal: "Conteúdo ilegal", minor_safety: "Risco para menores", personal_data: "Dados pessoais", copyright: "Direitos autorais", off_topic: "Fora do tema da comunidade", low_quality: "Qualidade insuficiente", classifier: "Revisão automática", filter: "Filtro de texto", author_blocked: "Conta bloqueada", other: "Outro motivo" },
  reasonLabel: "Motivo",
  appeal: "Não concordo",
  appealPlaceholder: "Conte por que acha que deve ser publicada (mín. 10 caracteres)",
  appealSend: "Enviar contestação",
  appealSent: "Recebemos sua contestação. Outra pessoa vai revisá-la.",
  appealOpen: "Contestação em revisão",
  appealUpheld: "Contestação revisada: a decisão se mantém",
  appealOverturned: "Contestação aceita: sua história foi publicada",
  delete: "Apagar",
  deleteConfirm: "Apagar esta história? Não dá para desfazer.",
  deleted: "Apagada.",
  exportMine: "Baixar meus dados",
};

const BUNDLES: Record<string, UgcMessages> = { es, en, pt };

export function resolveUgcMessages(locale?: string, overrides?: Partial<UgcMessages>): UgcMessages {
  const base = BUNDLES[(locale ?? "en").toLowerCase().split(/[-_]/)[0] ?? "en"] ?? en;
  return { ...base, ...overrides };
}

export { fmt };
