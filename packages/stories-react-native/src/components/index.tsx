/**
 * @customyai/stories-react-native/components — los componentes interactivos de la Ola 2, como módulo OPCIONAL
 * (quien no los usa no los descarga): quiz, emoji_reaction, emoji_slider, rating, question (apagada por defecto,
 * moderada por el servidor), share, timestamp, call, whatsapp, map, add_to_calendar, form, gif y los de comercio
 * (product_tag, product_cards, cart, wishlist).
 *
 *   import { components } from "@customyai/stories-react-native/components";
 *   <StoriesProvider client={client} components={components} resolveProducts={…} openForm={…}>
 *
 * Cada pintor habla con el visor del núcleo por su API de dominio (`track`, `setAnswer`, `share`): el visor registra
 * el evento (anónimo por defecto) y la capa de eventos añade el consentimiento; el servidor lo valida otra vez.
 * Las utilidades puras (precio, fecha relativa, `.ics`, destinos) y los textos son los del módulo web: no se duplican.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { actionTarget, buildIcs, formatPrice, messagesFor, productKey, relativeTime, type ComponentMessages } from "@customyai/stories-render/components";
import type { AddToCalendarComponent, CartComponent, EmojiReactionComponent, EmojiSliderComponent, GameComponent, GifComponent, ProductCardsComponent, ProductRef, ProductTagComponent, QuestionComponent, QuizComponent, RatingComponent, ResolvedProduct, ShareComponent, StoryCommerceContext, StoryComponent, TimestampComponent, WishlistComponent } from "../core";
import type { ComponentRenderers, StoryComponentProps } from "../component-api";
import type { StoriesTheme } from "../theme";
import { ActionButton, Card, Chip, MAX_FONT_SCALE, MIN_TOUCH, Question } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { Interactive } from "../viewer/gestures";
import { useViewerSelector } from "../viewer/use-viewer";

export { actionTarget, buildIcs, formatPrice, productKey, relativeTime, type ComponentMessages };

const fmt = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const asText = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// ─── Lógica compartida (con pruebas) ────────────────────────────────────────

/**
 * Responde a un componente de elección o de valor: quiz y emoji_reaction (una opción), rating (entero 1–max),
 * emoji_slider (entero 0–100) y question (texto). Una vez por componente en la sesión; anónima por defecto; el
 * propósito de consentimiento viaja en el evento. Un texto abierto no alimenta la ramificación.
 */
export function respond(viewer: StoryComponentProps["viewer"], c: StoryComponent, input: { choiceId?: string; value?: string | number }): boolean {
  if (viewer.getState().responses[c.id] !== undefined) return false;
  let answer: string | number;
  if (c.type === "quiz" || c.type === "emoji_reaction") {
    if (!input.choiceId || !c.options.some((o) => o.id === input.choiceId)) return false;
    answer = input.choiceId;
  } else if (c.type === "rating" || c.type === "emoji_slider") {
    const n = input.value;
    const [lo, hi] = c.type === "rating" ? [1, c.max] : [0, 100];
    if (typeof n !== "number" || !Number.isInteger(n) || n < lo || n > hi) return false;
    answer = n;
  } else if (c.type === "question") {
    const t = typeof input.value === "string" ? input.value.trim() : "";
    if (!c.enabled || !t || t.length > c.max_length) return false;
    answer = t;
  } else return false;
  viewer.track({ type: "component_response", componentId: c.id, ...(typeof answer === "string" && c.type !== "question" ? { choiceId: answer } : { value: answer }), consentPurpose: c.consent_purpose });
  viewer.setAnswer(c.id, answer, c.type !== "question");
  return true;
}

const click = (p: StoryComponentProps, c: StoryComponent): void => {
  if ("element_id" in c && c.element_id) p.viewer.track({ type: "click", elementId: c.element_id, componentId: c.id });
};

/** Pausa la historia mientras se escribe o se mueve un deslizador: la página no avanza sola. */
function useHoldWhileActive(p: StoryComponentProps): { on: () => void; off: () => void } {
  const { viewer } = p;
  useEffect(() => () => viewer.resume("typing"), [viewer]);
  return useMemo(() => ({ on: () => viewer.pause("typing"), off: () => viewer.resume("typing") }), [viewer]);
}

/** Respuesta ya dada (esta sesión o visitas anteriores). */
function useAnswer(p: StoryComponentProps): string | number | boolean | undefined {
  const mine = useViewerSelector(p.viewer, (s) => s.responses[p.comp.id]);
  return mine ?? p.answers()[p.comp.id];
}

const msgs = (p: StoryComponentProps): ComponentMessages => messagesFor(p.locale);

// ─── Comercio ───────────────────────────────────────────────────────────────

const viewedOnce = new WeakMap<object, Set<string>>();

/** Historia, página y componente actuales: lo que viaja con el carrito para atribuir ingresos. */
function commerceContext(p: StoryComponentProps, componentId: string): StoryCommerceContext {
  const s = p.viewer.getState();
  return { storyId: s.group?.id ?? "", ...(s.page?.id ? { slideId: s.page.id } : {}), componentId };
}

/** Vio un producto (una vez por página), lo añadió al carrito o a favoritos. El carrito lo decide el backend de la app. */
export function trackProduct(p: StoryComponentProps, kind: "product_viewed" | "add_to_cart" | "wishlist_added", componentId: string, product: ProductRef, quantity = 1): boolean {
  if (kind === "product_viewed") {
    const seen = viewedOnce.get(p.viewer) ?? viewedOnce.set(p.viewer, new Set()).get(p.viewer)!;
    const key = `${p.viewer.getState().epoch}:${componentId}:${productKey(product)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    p.viewer.track({ type: "product_viewed", componentId, product });
  } else if (kind === "add_to_cart") {
    p.viewer.track({ type: "add_to_cart", componentId, product, quantity });
    p.onAddToCart?.(product, quantity, commerceContext(p, componentId));
  } else {
    p.viewer.track({ type: "wishlist_added", componentId, product });
    p.onWishlist?.(product, commerceContext(p, componentId));
  }
  return true;
}

/** Resuelve las referencias una vez; un fallo del hook deja la referencia sin precio. */
function useProducts(p: StoryComponentProps, refs: ProductRef[]): Map<string, ResolvedProduct> {
  const [by, setBy] = useState<Map<string, ResolvedProduct>>(() => new Map());
  const key = refs.map(productKey).join("|");
  const { resolveProducts } = p;
  useEffect(() => {
    if (!resolveProducts) return;
    let dead = false;
    resolveProducts(refs).then(
      (list) => !dead && setBy(new Map(list.map((r) => [productKey(r.ref), r]))),
      () => undefined,
    );
    return () => {
      dead = true;
    };
    // `refs` cambia de identidad en cada render; su contenido va en `key`.
  }, [resolveProducts, key]);
  return by;
}

const lookup = (by: Map<string, ResolvedProduct>, r: ProductRef): ResolvedProduct | undefined => by.get(productKey(r)) ?? by.get(productKey({ connector: r.connector, external_id: r.external_id }));

// ─── Pintores ───────────────────────────────────────────────────────────────

function Quiz(p: StoryComponentProps<QuizComponent>) {
  const { comp: c, theme, viewer } = p;
  const m = msgs(p);
  const chosen = asText(useAnswer(p));
  const settled = chosen !== undefined && c.options.some((o) => o.id === chosen);
  const right = chosen === c.correct_id;
  const rightLabel = c.options.find((o) => o.id === c.correct_id)?.label ?? "";
  const status = settled ? (right ? m.quizCorrect : `${m.quizWrong}. ${fmt(m.quizRight, { answer: rightLabel })}${c.explanation ? ` ${c.explanation}` : ""}`) : "";
  return (
    <Card theme={theme} testID={`cs-quiz-${c.id}`}>
      <Question theme={theme}>{c.question}</Question>
      {c.options.map((o) => {
        // El resultado no depende solo del color: el texto lo dice y el botón lleva su estado.
        const result = !settled ? undefined : o.id === c.correct_id ? "right" : o.id === chosen ? "wrong" : undefined;
        return (
          <ActionButton
            key={o.id}
            theme={theme}
            label={o.label}
            filled={o.id === chosen || result === "right"}
            selected={o.id === chosen}
            disabled={settled}
            background={result === "right" ? (theme.positive as string) : result === "wrong" ? (theme.negative as string) : undefined}
            onPress={() => {
              if (respond(viewer, c, { choiceId: o.id })) p.say(o.id === c.correct_id ? m.quizCorrect : m.quizWrong);
            }}
            testID={`cs-quiz-${c.id}-${o.id}`}
          />
        );
      })}
      {settled ? (
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.status, { color: theme.mutedForeground }]}>
          {status}
        </Text>
      ) : null}
    </Card>
  );
}

function EmojiReaction(p: StoryComponentProps<EmojiReactionComponent>) {
  const { comp: c, theme, viewer } = p;
  const m = msgs(p);
  const chosen = asText(useAnswer(p));
  return (
    <Card theme={theme} testID={`cs-emoji-${c.id}`}>
      {c.question ? <Question theme={theme}>{c.question}</Question> : null}
      <View style={[styles.row, c.orientation === "vertical" && styles.column]}>
        {c.options.map((o) => (
          <Pressable
            key={o.id}
            testID={`cs-emoji-${c.id}-${o.id}`}
            disabled={chosen !== undefined}
            onPress={() => {
              if (respond(viewer, c, { choiceId: o.id })) p.say(m.thanks);
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label ?? o.id}
            accessibilityState={{ selected: o.id === chosen, disabled: chosen !== undefined }}
            style={[styles.emoji, o.id === chosen && { backgroundColor: theme.border }]}
          >
            <Text style={styles.emojiGlyph} {...HIDDEN_FROM_AT}>
              {o.emoji}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function EmojiSlider(p: StoryComponentProps<EmojiSliderComponent>) {
  const { comp: c, theme, viewer } = p;
  const m = msgs(p);
  const prior = useAnswer(p);
  const locked = typeof prior === "number";
  const [value, setValue] = useState(50);
  const [width, setWidth] = useState(1);
  const hold = useHoldWhileActive(p);
  const shown = locked ? (prior as number) : value;
  const commit = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (commit.current && clearTimeout(commit.current)), []);
  const send = (v: number): void => {
    if (respond(viewer, c, { value: v })) p.say(m.thanks);
  };
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin(hold.on)
        .onUpdate((e) => setValue(Math.max(0, Math.min(100, Math.round((e.x / width) * 100)))))
        .onEnd((e, success) => {
          // Solo cuenta si la persona soltó (no si otro gesto se llevó el toque): el voto se confirma al soltar.
          if (success) send(Math.max(0, Math.min(100, Math.round((e.x / width) * 100))));
        })
        .onFinalize(hold.off),
    // `send` solo lee refs y props estables del componente.
    [width, hold],
  );
  const adjust = (delta: number): void => {
    const next = Math.max(0, Math.min(100, shown + delta));
    setValue(next);
    // Con lector de pantalla no hay «soltar»: se confirma tras una pausa.
    if (commit.current) clearTimeout(commit.current);
    commit.current = setTimeout(() => send(next), 1200);
  };
  return (
    <Card theme={theme} testID={`cs-slider-${c.id}`}>
      <Question theme={theme}>{c.question}</Question>
      <Text style={[styles.sliderEmoji, { transform: [{ scale: 0.8 + shown / 100 }] }]} {...HIDDEN_FROM_AT}>
        {c.emoji}
      </Text>
      <Interactive>
        <GestureDetector gesture={pan}>
          <View
            testID={`cs-slider-${c.id}-track`}
            onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={c.question}
            accessibilityValue={{ min: 0, max: 100, now: shown, text: fmt(m.sliderValue, { n: shown }) }}
            accessibilityActions={locked ? undefined : [{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(e) => adjust(e.nativeEvent.actionName === "increment" ? 10 : -10)}
            accessibilityState={{ disabled: locked }}
            style={styles.track}
          >
            <View style={[styles.rail, { backgroundColor: theme.border }]}>
              <View style={[styles.railFill, { width: `${shown}%`, backgroundColor: theme.accent }]} />
            </View>
            <View style={[styles.thumb, { left: `${shown}%`, backgroundColor: theme.accent, borderColor: theme.surface }]} />
          </View>
        </GestureDetector>
      </Interactive>
    </Card>
  );
}

function Rating(p: StoryComponentProps<RatingComponent>) {
  const { comp: c, theme, viewer } = p;
  const m = msgs(p);
  const prior = useAnswer(p);
  const done = typeof prior === "number" ? prior : 0;
  const glyph = c.icon === "heart" ? "♥" : "★";
  return (
    <Card theme={theme} testID={`cs-rating-${c.id}`}>
      {c.question ? <Question theme={theme}>{c.question}</Question> : null}
      <View style={styles.row}>
        {Array.from({ length: c.max }, (_, i) => (
          <Pressable
            key={i}
            testID={`cs-rating-${c.id}-${i + 1}`}
            disabled={done > 0}
            onPress={() => {
              if (respond(viewer, c, { value: i + 1 })) p.say(m.thanks);
            }}
            accessibilityRole="button"
            accessibilityLabel={fmt(m.ratingOf, { n: i + 1, max: c.max })}
            accessibilityState={{ selected: i === done - 1, disabled: done > 0 }}
            style={styles.star}
          >
            <Text style={[styles.starGlyph, { color: i < done ? theme.accent : theme.border }]} {...HIDDEN_FROM_AT}>
              {glyph}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function QuestionBox(p: StoryComponentProps<QuestionComponent>) {
  const { comp: c, theme, viewer } = p;
  const m = msgs(p);
  const [text, setText] = useState("");
  const [reported, setReported] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const hold = useHoldWhileActive(p);
  const sent = typeof useAnswer(p) === "string";
  // Apagada por defecto: sin `enabled` no se pinta (el servidor tampoco la entrega ni acepta respuestas).
  if (!c.enabled) return null;
  return (
    <Card theme={theme} testID={`cs-question-${c.id}`}>
      <Question theme={theme}>{c.prompt}</Question>
      <TextInput
        testID={`cs-question-${c.id}-input`}
        value={text}
        onChangeText={setText}
        onFocus={hold.on}
        onBlur={hold.off}
        editable={!sent}
        multiline
        maxLength={c.max_length}
        placeholder={c.placeholder}
        placeholderTextColor={theme.mutedForeground}
        accessibilityLabel={c.prompt}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.input, { color: theme.surfaceForeground, borderColor: theme.border }]}
      />
      <View style={styles.between}>
        <Text accessible={false} style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {fmt(m.questionCount, { n: text.length, max: c.max_length })}
        </Text>
        <ActionButton
          theme={theme}
          label={c.submit_label}
          disabled={sent || !text.trim()}
          onPress={() => {
            if (respond(viewer, c, { value: text })) p.say(m.questionThanks);
          }}
          testID={`cs-question-${c.id}-send`}
        />
      </View>
      {sent ? (
        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: theme.mutedForeground }]}>
          {m.questionThanks}
        </Text>
      ) : null}
      {c.show_answers && c.answers.length > 0 ? (
        <View accessibilityLabel={m.answers} style={{ gap: 6 }}>
          {c.answers.map((a) => (
            <View key={a.id} style={styles.answer}>
              {reported.has(a.id) ? (
                <Text style={{ color: theme.mutedForeground, fontStyle: "italic" }}>{m.reported}</Text>
              ) : (
                <>
                  <Text style={{ color: theme.surfaceForeground }}>{a.text}</Text>
                  <Chip theme={theme} label={m.report} selected={menu === a.id} onPress={() => setMenu(menu === a.id ? null : a.id)} />
                  {menu === a.id
                    ? (["spam", "abuse", "privacy"] as const).map((reason) => (
                        <Chip
                          key={reason}
                          theme={theme}
                          label={m.reportReasons[reason]}
                          onPress={() => {
                            viewer.track({ type: "report", componentId: c.id, answerId: a.id, reason });
                            setReported((s) => new Set(s).add(a.id));
                            p.say(m.reported);
                          }}
                        />
                      ))
                    : null}
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ShareButton(p: StoryComponentProps<ShareComponent>) {
  const { comp: c, theme } = p;
  return (
    <ActionButton
      theme={theme}
      label={c.label}
      testID={`cs-share-${c.id}`}
      onPress={() => {
        click(p, c);
        p.viewer.share("component");
        const url = c.url;
        void Share.share({ message: [c.text, url].filter(Boolean).join(" ") || c.label, ...(url ? { url } : {}) }).catch(() => undefined);
      }}
    />
  );
}

function Timestamp(p: StoryComponentProps<TimestampComponent>) {
  const { comp: c, theme } = p;
  const text =
    c.style === "relative"
      ? relativeTime(c.at, p.clock.now(), p.locale)
      : new Intl.DateTimeFormat(p.locale, c.style === "date" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(new Date(c.at));
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.timestamp, { color: theme.viewerForeground, textShadowColor: theme.viewerScrim as string }]}>
      {c.label ? `${c.label} ` : ""}
      {text}
    </Text>
  );
}

/** Llamar, WhatsApp, mapa y formulario: un botón que registra el clic con su nombre y abre el destino. */
function Action(p: StoryComponentProps<StoryComponent & { label: string }>) {
  const { comp: c, theme } = p;
  if (c.type === "form" && !p.openForm) return null;
  return (
    <ActionButton
      theme={theme}
      label={c.label}
      role={c.type === "form" ? "button" : "link"}
      testID={`cs-action-${c.id}`}
      onPress={() => {
        click(p, c);
        const target = actionTarget(c);
        const elementId = "element_id" in c ? c.element_id : undefined;
        if (target) p.open(target, elementId);
        else if (c.type === "form") p.openForm?.(c.form_id, c.element_id);
      }}
    />
  );
}

const PLAY = { es: "Jugar", pt: "Jogar", en: "Play" } as const;

/** `game` (Game Center): un botón que registra el clic y le pide a la app abrir el juego por id (`openGame`; `<GameDialog>` de `./game`). Sin `openGame` no se pinta. */
function GameLauncher(p: StoryComponentProps<GameComponent>) {
  const { comp: c, theme } = p;
  if (!p.openGame) return null;
  const lang = (p.locale ?? "en").toLowerCase().slice(0, 2);
  return (
    <ActionButton
      theme={theme}
      label={c.label ?? PLAY[lang as keyof typeof PLAY] ?? PLAY.en}
      testID={`cs-game-${c.id}`}
      onPress={() => {
        click(p, c);
        p.openGame?.(c.game_id, c.element_id);
      }}
    />
  );
}

function AddToCalendar(p: StoryComponentProps<AddToCalendarComponent>) {
  const { comp: c, theme } = p;
  // Sin el hook de la app no hay forma segura de escribir en el calendario: no se pinta.
  if (!p.onAddToCalendar) return null;
  return (
    <ActionButton
      theme={theme}
      label={c.label}
      testID={`cs-calendar-${c.id}`}
      onPress={() => {
        click(p, c);
        p.onAddToCalendar?.({ id: c.id, title: c.title, startsAt: c.starts_at, endsAt: c.ends_at, location: c.location, description: c.description, ics: buildIcs(c, p.clock.now()) });
      }}
    />
  );
}

function Gif(p: StoryComponentProps<GifComponent>) {
  const { comp: c } = p;
  return <Image source={{ uri: c.url }} resizeMode="contain" style={styles.gif} {...(c.decorative ? HIDDEN_FROM_AT : { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: c.alt ?? "" })} />;
}

function ProductTag(p: StoryComponentProps<ProductTagComponent>) {
  const { comp: c, theme } = p;
  const m = msgs(p);
  const by = useProducts(p, [c.product]);
  const r = lookup(by, c.product);
  const price = r ? (c.show_price && r.available ? formatPrice(r.price, p.locale) : r.available ? "" : m.soldOut) : "";
  const title = c.label ?? r?.title ?? "";
  return (
    <Pressable
      testID={`cs-product-${c.id}`}
      accessibilityRole="button"
      accessibilityLabel={[title || m.openProduct, price].filter(Boolean).join(", ")}
      onPress={() => {
        trackProduct(p, "product_viewed", c.id, c.product);
        click(p, c);
        if (r?.url) p.open({ type: "url", url: r.url }, c.element_id);
      }}
      style={[styles.tag, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "600" }}>
        {title}
      </Text>
      {price ? <Text style={{ color: theme.mutedForeground }}>{price}</Text> : null}
    </Pressable>
  );
}

function ProductCards(p: StoryComponentProps<ProductCardsComponent>) {
  const { comp: c, theme } = p;
  const m = msgs(p);
  const by = useProducts(p, c.products);
  return (
    <View testID={`cs-cards-${c.id}`} style={{ gap: 6 }}>
      {c.title ? <Question theme={theme}>{c.title}</Question> : null}
      <View style={[c.layout === "carousel" ? styles.row : styles.column, { gap: 8 }]}>
        {c.products.map((ref) => {
          const r = lookup(by, ref);
          const price = r ? (r.available ? (c.show_price ? formatPrice(r.price, p.locale) : "") : m.soldOut) : "";
          return (
            <Pressable
              key={productKey(ref)}
              accessibilityRole="button"
              accessibilityLabel={[r?.title ?? ref.external_id, price].filter(Boolean).join(", ")}
              onPress={() => {
                trackProduct(p, "product_viewed", c.id, ref);
                if (r?.url) p.open({ type: "url", url: r.url });
              }}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              {r?.image_url ? <Image source={{ uri: r.image_url }} style={styles.cardImg} resizeMode="cover" {...HIDDEN_FROM_AT} /> : null}
              <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "600" }}>
                {r?.title ?? ref.external_id}
              </Text>
              {price ? <Text style={{ color: theme.mutedForeground }}>{price}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Cart(p: StoryComponentProps<CartComponent>) {
  const { comp: c, theme } = p;
  const m = msgs(p);
  const by = useProducts(p, [c.product]);
  const [added, setAdded] = useState(false);
  const soldOut = lookup(by, c.product)?.available === false;
  return (
    <ActionButton
      theme={theme}
      label={soldOut ? m.soldOut : added ? m.added : c.label}
      disabled={soldOut || added}
      testID={`cs-cart-${c.id}`}
      onPress={() => {
        // El carrito lo decide el backend de la app: el visor avisa (`onAddToCart`) y registra el evento.
        if (!trackProduct(p, "add_to_cart", c.id, c.product, c.quantity)) return;
        setAdded(true);
        p.say(m.added);
      }}
    />
  );
}

function Wishlist(p: StoryComponentProps<WishlistComponent>) {
  const { comp: c, theme } = p;
  const m = msgs(p);
  const [saved, setSaved] = useState(false);
  return (
    <Pressable
      testID={`cs-wish-${c.id}`}
      disabled={saved}
      accessibilityRole="button"
      accessibilityLabel={saved ? m.wishlisted : (c.label ?? m.wishlist)}
      accessibilityState={{ selected: saved, disabled: saved }}
      onPress={() => {
        if (!trackProduct(p, "wishlist_added", c.id, c.product)) return;
        setSaved(true);
        p.say(m.wishlisted);
      }}
      style={[styles.wish, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Text style={{ color: saved ? theme.negative : theme.mutedForeground, fontSize: 20 }} {...HIDDEN_FROM_AT}>
        ♥
      </Text>
    </Pressable>
  );
}

/** Los pintores de la Ola 2 (`createComponentRegistry` los devuelve; `components` es el de serie). */
export function createComponentRegistry(): ComponentRenderers {
  return {
    quiz: Quiz,
    emoji_reaction: EmojiReaction,
    emoji_slider: EmojiSlider,
    rating: Rating,
    question: QuestionBox,
    share: ShareButton,
    timestamp: Timestamp,
    call: Action,
    whatsapp: Action,
    map: Action,
    form: Action,
    add_to_calendar: AddToCalendar,
    gif: Gif,
    product_tag: ProductTag,
    product_cards: ProductCards,
    cart: Cart,
    wishlist: Wishlist,
    game: GameLauncher,
  } as unknown as ComponentRenderers;
}

export const components: ComponentRenderers = createComponentRegistry();
export type { StoriesTheme };

const styles = StyleSheet.create({
  status: { fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  column: { flexDirection: "column", alignItems: "stretch" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emoji: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: "center", justifyContent: "center" },
  emojiGlyph: { fontSize: 28 },
  sliderEmoji: { fontSize: 40, alignSelf: "center" },
  track: { height: MIN_TOUCH, justifyContent: "center" },
  rail: { height: 6, borderRadius: 3, overflow: "hidden" },
  railFill: { height: "100%" },
  thumb: { position: "absolute", width: 24, height: 24, borderRadius: 12, borderWidth: 3, marginLeft: -12 },
  star: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  starGlyph: { fontSize: 30 },
  input: { minHeight: 72, borderWidth: 1, borderRadius: 12, padding: 10, textAlignVertical: "top", fontSize: 15 },
  answer: { gap: 4, alignItems: "flex-start" },
  timestamp: { fontSize: 14, fontWeight: "500", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  gif: { width: "100%", height: "100%" },
  tag: { minHeight: MIN_TOUCH, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  card: { width: 140, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 4 },
  cardImg: { width: "100%", aspectRatio: 1, borderRadius: 10 },
  wish: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
});
