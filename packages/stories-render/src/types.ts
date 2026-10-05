/**
 * Tipos de entrada del renderer: la forma que devuelve `GET /client/placements/:id`
 * (contrato `packages/contracts/src/stories.ts`, salida de zod con los valores por defecto ya
 * aplicados). Son ESTRUCTURALES y deliberadamente un poco más laxos que el contrato: este
 * paquete es público y no puede depender de `@customy/contracts` (privado). La prueba
 * `contract-compat.test.ts` comprueba en compilación que la salida del contrato les cabe.
 */

export type StoryPlatform = "ios" | "android" | "web";
export type StorySurface = "story" | "banner" | "widget";

// ─── Lienzo ─────────────────────────────────────────────────────────────────

export type AnimationPhase = "in" | "emphasis" | "out";
export type AnimationKind = "fade" | "slide_up" | "slide_down" | "slide_left" | "slide_right" | "scale" | "pulse" | "shake" | "bounce" | "none";
export type AnimationEasing = "linear" | "ease_in" | "ease_out" | "ease_in_out";

export type LayerAnimation = {
  phase: AnimationPhase;
  kind: AnimationKind;
  delay_ms: number;
  duration_ms: number;
  easing: AnimationEasing;
};

export type Caption = { lang: string; label?: string; url: string };

type LayerBase = {
  id: string;
  /** 0–1 relativos al lienzo. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  z: number;
  animations: LayerAnimation[];
  alt?: string;
  decorative: boolean;
};

export type ImageLayer = LayerBase & { type: "image"; url: string; fit: "fit" | "fill" };
export type VideoLayer = LayerBase & {
  type: "video";
  url: string;
  poster: string;
  fit: "fit" | "fill";
  muted: boolean;
  loop: boolean;
  has_speech: boolean;
  captions: Caption[];
  duration_ms?: number;
};
export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  /** Relativo a la altura del lienzo. */
  font_size: number;
  weight: "regular" | "medium" | "bold";
  align: "start" | "center" | "end";
  color?: string;
  background?: string;
};
export type ShapeLayer = LayerBase & {
  type: "shape";
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  stroke_width: number;
  radius: number;
};
export type LottieLayer = LayerBase & { type: "lottie"; url: string; loop: boolean };
export type StickerLayer = LayerBase & { type: "sticker"; url: string };
export type StoryLayer = ImageLayer | VideoLayer | TextLayer | ShapeLayer | LottieLayer | StickerLayer;
export type LayerType = StoryLayer["type"];

// ─── Componentes interactivos ───────────────────────────────────────────────

export type ComponentAction = { type: "url"; url: string } | { type: "deep_link"; uri: string };

type ComponentBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  collects: string[];
  consent_purpose: string;
  /** Ola 2: el componente solo se pinta si se cumple. */
  visibility?: Visibility;
};

export type ButtonComponent = ComponentBase & {
  type: "button";
  style: "button" | "swipe_up";
  label: string;
  action: ComponentAction;
  element_id: string;
  background?: string;
  color?: string;
};
export type PollComponent = ComponentBase & {
  type: "poll";
  question: string;
  options: { id: string; label: string }[];
  anonymous: boolean;
  show_results: "after_vote" | "never";
  trait_key?: string;
};
export type CountdownComponent = ComponentBase & {
  type: "countdown";
  label?: string;
  ends_at: string;
  reminder: { enabled: boolean; offset_minutes: number; label?: string };
  element_id?: string;
};
export type PromoCodeComponent = ComponentBase & {
  type: "promo_code";
  code: string;
  label?: string;
  copy_label: string;
  valid_until?: string;
  element_id: string;
};
// ─── Ola 2 ──────────────────────────────────────────────────────────────────

/** Referencia estable a un producto (contrato `productRefSchema`): la historia nunca guarda precio ni stock. */
export type ProductRef = { connector: string; external_id: string; variant_id?: string };

/** Lo que resuelve el hook `resolveProducts` (el agente de comercio): precio y stock en vivo. */
export type ResolvedProduct = {
  ref: ProductRef;
  title: string;
  image_url?: string;
  image_alt?: string;
  price?: { amount: number; currency: string; formatted?: string };
  compare_at_price?: { amount: number; currency: string; formatted?: string };
  available: boolean;
  /** Página del producto (https o deep link) para abrirla al pulsar. */
  url?: string;
};

/** Visibilidad condicional (AND/OR sobre respuestas de poll, quiz o emoji_reaction de la historia). */
export type VisibilityCondition = { component_id: string; cmp: "answered" | "not_answered" | "eq" | "neq" | "in"; value?: string | number | string[] };
export type Visibility = { op: "and" | "or"; conditions: VisibilityCondition[] };
export type AnswerMap = Readonly<Record<string, string | number | boolean>>;

type Option = { id: string; label: string };
type AnswerCommon = { anonymous: boolean; show_results: "after_vote" | "never"; trait_key?: string };

export type QuizComponent = ComponentBase & { type: "quiz"; question: string; options: Option[]; correct_id: string; explanation?: string } & AnswerCommon;
export type EmojiReactionComponent = ComponentBase & { type: "emoji_reaction"; question?: string; options: Array<{ id: string; emoji: string; label?: string }>; orientation: "vertical" | "horizontal" } & AnswerCommon;
export type EmojiSliderComponent = ComponentBase & { type: "emoji_slider"; question: string; emoji: string } & AnswerCommon;
export type RatingComponent = ComponentBase & { type: "rating"; question?: string; max: number; icon: "star" | "heart" } & AnswerCommon;
export type QuestionComponent = ComponentBase & {
  type: "question";
  enabled: boolean;
  prompt: string;
  placeholder?: string;
  submit_label: string;
  max_length: number;
  anonymous: boolean;
  show_answers: boolean;
  /** Solo entrega: respuestas ya aprobadas por el servidor. */
  answers: Array<{ id: string; text: string }>;
};
export type ShareComponent = ComponentBase & { type: "share"; label: string; text?: string; url?: string; element_id: string };
export type TimestampComponent = ComponentBase & { type: "timestamp"; at: string; style: "relative" | "date" | "datetime"; label?: string };
export type CallComponent = ComponentBase & { type: "call"; phone: string; label: string; element_id: string };
export type WhatsappComponent = ComponentBase & { type: "whatsapp"; phone: string; message?: string; label: string; element_id: string };
export type MapComponent = ComponentBase & { type: "map"; lat: number; lng: number; place_name?: string; label: string; element_id: string };
export type AddToCalendarComponent = ComponentBase & { type: "add_to_calendar"; title: string; starts_at: string; ends_at?: string; location?: string; description?: string; label: string; element_id: string };
export type FormComponent = ComponentBase & { type: "form"; form_id: string; label: string; element_id: string };
export type GifComponent = ComponentBase & { type: "gif"; url: string; alt?: string; decorative: boolean };
export type ProductTagComponent = ComponentBase & { type: "product_tag"; product: ProductRef; label?: string; show_price: boolean; element_id?: string };
export type ProductCardsComponent = ComponentBase & { type: "product_cards"; title?: string; products: ProductRef[]; layout: "carousel" | "list"; show_price: boolean };
export type CartComponent = ComponentBase & { type: "cart"; product: ProductRef; quantity: number; label: string };
export type WishlistComponent = ComponentBase & { type: "wishlist"; product: ProductRef; label?: string };

/** Ola 4 (Game Center): referencia por id al widget `game`; no lleva premios ni probabilidades. */
export type GameComponent = ComponentBase & { type: "game"; game_id: string; label?: string; element_id: string };

export type Wave2Component =
  | QuizComponent
  | EmojiReactionComponent
  | EmojiSliderComponent
  | RatingComponent
  | QuestionComponent
  | ShareComponent
  | TimestampComponent
  | CallComponent
  | WhatsappComponent
  | MapComponent
  | AddToCalendarComponent
  | FormComponent
  | GifComponent
  | ProductTagComponent
  | ProductCardsComponent
  | CartComponent
  | WishlistComponent
  | GameComponent;
export type StoryComponent = ButtonComponent | PollComponent | CountdownComponent | PromoCodeComponent | Wave2Component;
export type StoryComponentType = StoryComponent["type"];

export type SafeZone = { top_px: number; bottom_px: number };

export type StoryCanvas = {
  safe_zone: SafeZone;
  layers: StoryLayer[];
  components: StoryComponent[];
};

export type StoryBackground =
  | { type: "image"; url: string; fit: "fit" | "fill"; alt?: string; decorative: boolean }
  | { type: "video"; url: string; poster: string; fit: "fit" | "fill"; muted: boolean; has_speech: boolean; captions: Caption[]; alt?: string; decorative: boolean }
  | { type: "color"; color: string };

export type StoryPage = {
  id: string;
  background?: StoryBackground;
  /** ms; ausente = 7 s con imagen y 15 s con vídeo. */
  duration_ms?: number;
  canvas: StoryCanvas;
  title?: string;
  /** Ola 2: ramificación; si no se cumple al entrar, la página se salta. */
  visibility?: Visibility;
  /** Ola 4: la página viene de la comunidad (UGC con moderación): el visor ofrece «reportar / no ver más a esta persona». */
  ugc?: { item_id: string; author_label?: string; reportable: true };
};

// ─── Grupos, banners y respuesta del placement ──────────────────────────────

export type StoryMode = "normal" | "nudge" | "sponsored";
export type StoryNudge = { disturbance_id: string; position: number };
export type StorySponsor = { name: string; logo_url?: string; label: string; transparency: { text: string; advertiser?: string; payer?: string; url?: string } };
export type StoryFrequency = { max_impressions: number; window_hours: number; min_gap_seconds: number };

export type StoryGroup = {
  id: string;
  title: string;
  cover: { url: string; alt: string };
  mode: StoryMode;
  /** Con `mode: nudge`: dónde se inserta (entre otros grupos) y con qué otros se muestra. */
  nudge?: StoryNudge;
  /** Con `mode: sponsored`: etiqueta superior y bottom sheet de transparencia. */
  sponsor?: StorySponsor;
  /** Respuestas que la persona ya dio a los componentes de elección del grupo (visitas anteriores). */
  answers?: Record<string, string | number | boolean>;
  pinned: boolean;
  order: number;
  live: boolean;
  variant_id?: string;
  control: boolean;
  reeligibility_cooldown_hours: number;
  frequency?: StoryFrequency;
  schedule?: { start_at?: string; end_at?: string };
  /** Ausente en el grupo de control. */
  pages?: StoryPage[];
  /** Ola 4: el grupo es una comunidad; dice cómo ofrecer «comparte tu historia» (términos versionados, vídeo, tope diario). */
  community?: StoryCommunity;
  /** Ola 4 (Live): el grupo tiene una transmisión (aviso, en vivo o repetición); `live` ya viene en `true` mientras corre. Ver `./widgets/live`. */
  live_session?: import("./widgets/live").LiveMarker;
};

export type StoryCommunity = { terms_version: string; terms_url: string; accept_video: boolean; max_per_author_per_day: number; max_caption_length: number };

export type StoryBarVariant = "classic" | "energized";
export type CoverShape = "circle" | "square" | "rounded" | "portrait";
export type CoverSize = "small" | "medium" | "large";
/** `interest`: el servidor ya entrega la barra ordenada por interés; el cliente conserva ese orden (como `manual`). */
export type BarOrder = "manual" | "unseen_first" | "seen_last" | "recent" | "interest";

export type StoryBarStyle = {
  variant: StoryBarVariant;
  cover_shape: CoverShape;
  size: CoverSize;
  ring: { unseen_color?: string; seen_color?: string; enabled: boolean };
  order: BarOrder;
  pinned_first: boolean;
  show_title: boolean;
  live_badge: { enabled: boolean; label: string };
  max_groups?: number;
};

export type BannerAspect = "4:3" | "16:9" | "1:1" | "2:1";
export type BannerProgress = "bar" | "dots" | "none";
export type BannerStyle = {
  aspect: BannerAspect;
  corner_radius: number;
  progress: BannerProgress;
  autoplay: { enabled: boolean; interval_ms: number; pausable: true };
  carousel: boolean;
  dismissible: boolean;
  /** `null` = no se cierra solo (WCAG 2.2.1). */
  auto_close_ms: number | null;
};

export type BannerSlide = {
  id: string;
  image: { url: string; alt: string };
  title?: string;
  action?: ComponentAction;
  element_id?: string;
};

export type DeliveredBanner = {
  id: string;
  name?: string;
  style: BannerStyle;
  priority: number;
  expires_at?: string;
  variant_id?: string;
  control: boolean;
  frequency?: StoryFrequency;
  slides?: BannerSlide[];
};

export type PlacementKill = { placement: boolean; story: boolean; banner: boolean; widget?: boolean };

// ─── Widgets de la Ola 3 (video feed, swipe cards, canvas, checklist/tour, inline) ─────────────────────

export type WidgetKind = "video_feed" | "swipe_cards" | "canvas" | "checklist" | "inline" | "game";
export type WidgetCta = { label: string; action: ComponentAction; element_id: string };
export type WidgetImage = { url: string; alt: string };

/** Lo que cada widget entrega de una campaña (contrato `deliveredWidgetOf`). El grupo de control llega sin `items`. */
export type DeliveredWidgetEntry<C, I, X = unknown> = {
  id: string;
  name?: string;
  priority: number;
  expires_at?: string;
  variant_id?: string;
  control: boolean;
  frequency?: StoryFrequency;
  updated_at?: string;
  test?: boolean;
  config: C;
  items?: I[];
} & X;

/** Lo que esta persona ya hizo y no se deshace: ítems completados, productos deslizados. */
export type WidgetProgress = { completed: Record<string, string>; dismissed: boolean; swiped?: string[] };

export type VideoSourceWire = {
  hls?: string;
  mp4?: string;
  poster: string;
  blurhash?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  captions: Array<{ lang: string; label?: string; url: string }>;
};
type FeedItemBase = {
  id: string;
  title?: string;
  caption?: string;
  ctas: Array<WidgetCta & { id: string }>;
  share: { enabled: boolean; url?: string };
  schedule?: { start_at?: string; end_at?: string };
  archived: boolean;
  /** Productos que el elemento etiqueta (hasta 10): botones de carrito/guardar y atribución de ingresos. */
  products?: ProductRef[];
};
export type VideoFeedItem =
  | (FeedItemBase & { type: "video"; video: VideoSourceWire; alt: string })
  | (FeedItemBase & { type: "images"; images: WidgetImage[]; slide_ms: number; folder_ref?: string })
  | (FeedItemBase & { type: "repost"; network: "instagram" | "tiktok" | "youtube" | "drive" | "dropbox"; url: string; poster: WidgetImage; mode: "repost" | "background"; media?: VideoSourceWire; rights_confirmed: true });
export type VideoFeedConfig = {
  layout: "carousel" | "grid";
  aspect: "9:16" | "4:5" | "1:1";
  columns: number;
  corner_radius: number;
  show_title: boolean;
  autoplay: { enabled: boolean; mode: "visible" | "tap"; pausable: true; muted: boolean };
  preload: { before: number; after: number };
  share: { enabled: boolean };
  max_items?: number;
};

export type SwipeCard = { product: ProductRef; headline?: string; badge?: string };
export type SwipeCardsConfig = {
  layout: "stack" | "cover";
  aspect: "3:4" | "4:5" | "1:1";
  corner_radius: number;
  show_price: boolean;
  limit?: number;
  collection?: { connector: string; collection_id: string };
  feedback: {
    like: { icon: "heart" | "check" | "thumb_up" | "star"; label: string; color?: string };
    nope: { icon: "x" | "thumb_down" | "skip"; label: string; color?: string };
    show_stamps: boolean;
  };
  remember_swipes: boolean;
  swipe_right: "wishlist" | "add_to_cart" | "open" | "none";
  buttons: true;
  end: { title: string; message: string; cta?: WidgetCta; show_liked: boolean };
};

export type CanvasTile = { id: string; image: WidgetImage & { width?: number; height?: number }; title?: string; action: ComponentAction; element_id?: string; products?: ProductRef[] };
export type CanvasWidgetConfig = {
  columns: number;
  gap: number;
  padding: number;
  corner_radius: number;
  background: { color?: string; image_url?: string };
  title?: string;
  cta?: WidgetCta;
};

export type TourPresentation = "tooltip" | "hotspot" | "spotlight";
export type ChecklistCompletion = { type: "event"; event: string } | { type: "click" } | { type: "condition"; filters: Array<{ field: string; op: string; value?: unknown }> } | { type: "manual" };
export type ChecklistItem = { type: "item"; id: string; title: string; description?: string; complete_on: ChecklistCompletion; action?: ComponentAction; element_id?: string };
export type TourStep = { type: "step"; id: string; title: string; body?: string; anchor: string; placement: "auto" | "top" | "bottom" | "start" | "end"; presentation?: TourPresentation; next_on: "button" | "anchor_click" };
export type ChecklistEntry = ChecklistItem | TourStep;
export type ChecklistConfig = {
  mode: "checklist" | "tour";
  title: string;
  description?: string;
  ordered: boolean;
  dismissible: boolean;
  dismiss_confirm: boolean;
  progress: "bar" | "steps" | "none";
  completion_message?: string;
  tour: { presentation: TourPresentation; skippable: true };
};

export type InlineAnchor = { type: "element"; element_id: string; position: "before" | "after" | "inside_start" | "inside_end" | "replace" } | { type: "index"; list_id: string; index: number };
export type InlineConfig = { anchor: InlineAnchor; aspect: "auto" | "16:9" | "4:3" | "1:1" | "2:1"; corner_radius: number; background?: string; dismissible: boolean };
export type InlineCard = { id: string; image?: WidgetImage; title?: string; body?: string; cta?: WidgetCta; products?: ProductRef[] };

// ─── Game Center (Ola 4): proyección pública de un juego (sin pesos, inventario, costes ni códigos) ─────
export type GameMechanic = "wheel" | "scratch" | "prize_card" | "match3" | "memory";
export type GamePrizeKind = "nothing" | "promo_code" | "points";
export type GamePublicPrize = { id: string; label: string; kind: GamePrizeKind; color?: string; image?: WidgetImage };
export type GameTermsInfo = { version: string; url: string; summary?: string; organizer?: string };
export type GameConfig = {
  mechanic: GameMechanic;
  title: string;
  description?: string;
  cta_label: string;
  copy: { win?: string; lose?: string; exhausted?: string; already_played?: string };
  prizes: GamePublicPrize[];
  terms?: GameTermsInfo;
  min_age: number;
  board?: { pairs: number };
  identified: boolean;
  consent_purpose: string;
  seed_commit?: string;
};

export type DeliveredVideoFeed = DeliveredWidgetEntry<VideoFeedConfig, VideoFeedItem>;
export type DeliveredSwipeCards = DeliveredWidgetEntry<SwipeCardsConfig, SwipeCard, { progress?: WidgetProgress }>;
export type DeliveredCanvas = DeliveredWidgetEntry<CanvasWidgetConfig, CanvasTile>;
export type DeliveredChecklist = DeliveredWidgetEntry<ChecklistConfig, ChecklistEntry, { progress?: WidgetProgress }>;
export type DeliveredInline = DeliveredWidgetEntry<InlineConfig, InlineCard>;
export type DeliveredGame = DeliveredWidgetEntry<GameConfig, never>;

export type DeliveredWidget =
  | { kind: "story_bar"; style: StoryBarStyle; items: StoryGroup[] }
  | { kind: "banner"; items: DeliveredBanner[] }
  | { kind: "video_feed"; items: DeliveredVideoFeed[] }
  | { kind: "swipe_cards"; items: DeliveredSwipeCards[] }
  | { kind: "canvas"; items: DeliveredCanvas[] }
  | { kind: "checklist"; items: DeliveredChecklist[] }
  | { kind: "inline"; items: DeliveredInline[] }
  | { kind: "game"; items: DeliveredGame[] };

export type PlacementResponse = {
  placement_id: string;
  etag: string;
  ttl: number;
  min_sdk: string | null;
  kill: PlacementKill;
  generated_at?: string;
  widgets: DeliveredWidget[];
};

// ─── Dimensiones de referencia ──────────────────────────────────────────────

export const REFERENCE_WIDTH = 1080;
export const REFERENCE_HEIGHT = 1920;
export const DEFAULT_PAGE_DURATION_MS = { image: 7000, video: 15000 } as const;
