import { fmt, isRtlLocale } from "../messages";

/**
 * Textos del Game Center (accesibilidad incluida). Aparte de `./messages` a propósito: quien no usa el juego no los paga.
 * Español, inglés y portugués de Brasil de serie; el resto cae en inglés.
 */
export type GameMessages = {
  loading: string;
  retry: string;
  play: string;
  playAgain: string;
  close: string;
  reveal: string;
  skip: string;
  spinning: string;
  prizes: string;
  termsCheck: string;
  termsLink: string;
  ageCheck: string;
  consentCheck: string;
  needTerms: string;
  needAge: string;
  needConsent: string;
  won: string;
  lost: string;
  codeLabel: string;
  copy: string;
  copied: string;
  validUntil: string;
  points: string;
  playsLeft: string;
  noPlaysLeft: string;
  nextPlay: string;
  wheelHint: string;
  scratchHint: string;
  scratchArea: string;
  flipHint: string;
  flipCard: string;
  cardFaceDown: string;
  cardFaceUp: string;
  memoryHint: string;
  match3Hint: string;
  tileHidden: string;
  tileShown: string;
  errNetwork: string;
  errGeneric: string;
  err_game_not_found: string;
  err_game_not_active: string;
  err_game_not_playable: string;
  err_limit_reached: string;
  err_terms_required: string;
  err_age_required: string;
  err_country_blocked: string;
  err_minors_policy: string;
  err_consent_required: string;
  err_game_exhausted: string;
};

const es: GameMessages = {
  loading: "Cargando el juego",
  retry: "Reintentar",
  play: "Jugar",
  playAgain: "Jugar otra vez",
  close: "Cerrar",
  reveal: "Revelar premio",
  skip: "Saltar animación",
  spinning: "Girando la ruleta",
  prizes: "Premios posibles",
  termsCheck: "He leído las bases y condiciones (versión {version})",
  termsLink: "Ver bases y condiciones",
  ageCheck: "Confirmo que tengo al menos {age} años",
  consentCheck: "Acepto que se guarde mi participación asociada a mi cuenta",
  needTerms: "Acepta las bases para jugar.",
  needAge: "Confirma tu edad para jugar.",
  needConsent: "Acepta el tratamiento de datos para jugar.",
  won: "¡Ganaste! {prize}",
  lost: "Esta vez no hubo premio.",
  codeLabel: "Tu código",
  copy: "Copiar código",
  copied: "Código copiado",
  validUntil: "Válido hasta el {date}",
  points: "{n} puntos",
  playsLeft: "Te quedan {n} jugadas",
  noPlaysLeft: "No te quedan jugadas",
  nextPlay: "Podrás volver a jugar el {date}",
  wheelHint: "Pulsa «Jugar» para girar la ruleta.",
  scratchHint: "Rasca la tarjeta con el dedo o el cursor, o usa «Revelar premio».",
  scratchArea: "Tarjeta para rascar",
  flipHint: "Pulsa la tarjeta para ver tu premio.",
  flipCard: "Girar la tarjeta",
  cardFaceDown: "Carta {n}, boca abajo",
  cardFaceUp: "Carta {n}: {symbol}",
  memoryHint: "Encuentra las parejas, o usa «Revelar premio».",
  match3Hint: "Descubre tres casillas e intenta que sean iguales.",
  tileHidden: "Casilla {n}, oculta",
  tileShown: "Casilla {n}: {symbol}",
  errNetwork: "No hay conexión. Tu jugada no se perdió: reintenta.",
  errGeneric: "No se pudo jugar ahora. Inténtalo más tarde.",
  err_game_not_found: "Este juego no está disponible.",
  err_game_not_active: "Este juego no está activo ahora mismo.",
  err_game_not_playable: "Este juego no se puede jugar ahora.",
  err_limit_reached: "Ya no te quedan jugadas.",
  err_terms_required: "Acepta la versión vigente de las bases.",
  err_age_required: "Confirma tu edad para jugar.",
  err_country_blocked: "Esta promoción no está disponible en tu país.",
  err_minors_policy: "Este juego no está disponible para tu perfil.",
  err_consent_required: "Falta tu consentimiento para participar.",
  err_game_exhausted: "Los premios de este juego se agotaron.",
};

const en: GameMessages = {
  loading: "Loading the game",
  retry: "Retry",
  play: "Play",
  playAgain: "Play again",
  close: "Close",
  reveal: "Reveal prize",
  skip: "Skip animation",
  spinning: "Spinning the wheel",
  prizes: "Possible prizes",
  termsCheck: "I have read the terms and conditions (version {version})",
  termsLink: "View terms and conditions",
  ageCheck: "I confirm I am at least {age} years old",
  consentCheck: "I agree that my entry is stored linked to my account",
  needTerms: "Accept the terms to play.",
  needAge: "Confirm your age to play.",
  needConsent: "Accept the data processing to play.",
  won: "You won! {prize}",
  lost: "No prize this time.",
  codeLabel: "Your code",
  copy: "Copy code",
  copied: "Code copied",
  validUntil: "Valid until {date}",
  points: "{n} points",
  playsLeft: "{n} plays left",
  noPlaysLeft: "No plays left",
  nextPlay: "You can play again on {date}",
  wheelHint: "Press “Play” to spin the wheel.",
  scratchHint: "Scratch the card with your finger or cursor, or use “Reveal prize”.",
  scratchArea: "Scratch card",
  flipHint: "Press the card to see your prize.",
  flipCard: "Flip the card",
  cardFaceDown: "Card {n}, face down",
  cardFaceUp: "Card {n}: {symbol}",
  memoryHint: "Find the pairs, or use “Reveal prize”.",
  match3Hint: "Uncover three tiles and try to match them.",
  tileHidden: "Tile {n}, hidden",
  tileShown: "Tile {n}: {symbol}",
  errNetwork: "No connection. Your play was not lost: retry.",
  errGeneric: "Couldn't play right now. Try again later.",
  err_game_not_found: "This game is not available.",
  err_game_not_active: "This game is not active right now.",
  err_game_not_playable: "This game can't be played right now.",
  err_limit_reached: "You have no plays left.",
  err_terms_required: "Accept the current version of the terms.",
  err_age_required: "Confirm your age to play.",
  err_country_blocked: "This promotion is not available in your country.",
  err_minors_policy: "This game is not available for your profile.",
  err_consent_required: "Your consent to take part is missing.",
  err_game_exhausted: "This game has run out of prizes.",
};

const pt: GameMessages = {
  loading: "Carregando o jogo",
  retry: "Tentar de novo",
  play: "Jogar",
  playAgain: "Jogar de novo",
  close: "Fechar",
  reveal: "Revelar prêmio",
  skip: "Pular animação",
  spinning: "Girando a roleta",
  prizes: "Prêmios possíveis",
  termsCheck: "Li o regulamento (versão {version})",
  termsLink: "Ver o regulamento",
  ageCheck: "Confirmo que tenho pelo menos {age} anos",
  consentCheck: "Aceito que minha participação seja guardada vinculada à minha conta",
  needTerms: "Aceite o regulamento para jogar.",
  needAge: "Confirme sua idade para jogar.",
  needConsent: "Aceite o tratamento de dados para jogar.",
  won: "Você ganhou! {prize}",
  lost: "Sem prêmio desta vez.",
  codeLabel: "Seu código",
  copy: "Copiar código",
  copied: "Código copiado",
  validUntil: "Válido até {date}",
  points: "{n} pontos",
  playsLeft: "Restam {n} jogadas",
  noPlaysLeft: "Não restam jogadas",
  nextPlay: "Você poderá jogar de novo em {date}",
  wheelHint: "Toque em “Jogar” para girar a roleta.",
  scratchHint: "Raspe o cartão com o dedo ou o cursor, ou use “Revelar prêmio”.",
  scratchArea: "Raspadinha",
  flipHint: "Toque no cartão para ver seu prêmio.",
  flipCard: "Virar o cartão",
  cardFaceDown: "Carta {n}, virada para baixo",
  cardFaceUp: "Carta {n}: {symbol}",
  memoryHint: "Encontre os pares, ou use “Revelar prêmio”.",
  match3Hint: "Descubra três casas e tente igualá-las.",
  tileHidden: "Casa {n}, oculta",
  tileShown: "Casa {n}: {symbol}",
  errNetwork: "Sem conexão. Sua jogada não se perdeu: tente de novo.",
  errGeneric: "Não foi possível jogar agora. Tente mais tarde.",
  err_game_not_found: "Este jogo não está disponível.",
  err_game_not_active: "Este jogo não está ativo agora.",
  err_game_not_playable: "Este jogo não pode ser jogado agora.",
  err_limit_reached: "Você não tem mais jogadas.",
  err_terms_required: "Aceite a versão atual do regulamento.",
  err_age_required: "Confirme sua idade para jogar.",
  err_country_blocked: "Esta promoção não está disponível no seu país.",
  err_minors_policy: "Este jogo não está disponível para o seu perfil.",
  err_consent_required: "Falta o seu consentimento para participar.",
  err_game_exhausted: "Os prêmios deste jogo acabaram.",
};

const BUNDLES: Record<string, GameMessages> = { es, en, pt };

export function resolveGameMessages(locale?: string, overrides?: Partial<GameMessages>): GameMessages {
  const base = BUNDLES[(locale ?? "en").toLowerCase().split(/[-_]/)[0] ?? "en"] ?? en;
  return { ...base, ...overrides };
}

export { fmt, isRtlLocale };
