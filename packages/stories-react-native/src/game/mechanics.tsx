import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { match3Tiles, memoryBoard, wheelAngle, type GamePlayResult } from "@customyai/stories-render/widgets/game";
import type { GameConfig, GamePublicPrize } from "../core";
import type { StoriesTheme } from "../theme";
import { MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { safeColor } from "../widgets/common";
import { fmt, type GameMessages } from "./messages";

/**
 * Las cinco mecánicas del Game Center, como PRESENTACIÓN de un resultado que el servidor ya registró: nada de lo que
 * pasa aquí decide el premio, y saltar la animación («Saltar animación», «Revelar premio», reduce motion) no lo cambia.
 * Cada una tiene su alternativa sin gesto (botón) y etiquetas accesibles; los símbolos son decorativos pero el lector de
 * pantalla oye su nombre. El tablero de memoria y de «tres iguales» sale del `board_seed` del servidor (`memoryBoard`,
 * `match3Tiles`, los mismos del renderer web), así que un reintento coloca todo igual.
 */

export const SPIN_MS = 4200;
// Emojis decorativos: no son colores del tema. El mismo orden que el renderer web.
const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "🍀", "💎", "🎁", "🍩"];

export type StageProps = {
  cfg: GameConfig;
  result: GamePlayResult;
  theme: StoriesTheme;
  m: GameMessages;
  reducedMotion: boolean;
  /** Temporizador con el reloj del proveedor (cancelado al desmontar). */
  later: (fn: () => void, ms: number) => void;
  /** El resultado ya está; esto solo lo muestra. */
  done: () => void;
  /** «Saltar animación» / «Revelar premio» llaman a lo que la mecánica registre aquí. */
  registerFinish: (fn: () => void) => void;
  say: (text: string) => void;
};

const prizeIndex = (cfg: GameConfig, r: GamePlayResult): number => Math.max(0, cfg.prizes.findIndex((p) => p.id === r.prize?.id));

/** La cara con el premio ya decidido (debajo de lo que se rasca, de la carta, de las casillas). */
function PrizeFace({ r, theme, m }: { r: GamePlayResult; theme: StoriesTheme; m: GameMessages }) {
  return (
    <View testID="cs-game-face" accessible accessibilityLabel={r.prize?.label ?? m.lost} style={[styles.face, { backgroundColor: theme.surface, borderColor: r.outcome === "win" ? theme.positive : theme.border }]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.faceText, { color: theme.surfaceForeground }]}>
        {r.prize?.label ?? m.lost}
      </Text>
    </View>
  );
}

// ─── Ruleta ─────────────────────────────────────────────────────────────────

const LABEL_H = 28;

/** Disco de la ruleta: divisores y etiquetas por segmento (sin conic-gradient en nativo; los colores de la campaña van en una barra de cada etiqueta). */
export function WheelDisc({ prizes, size, rot, theme }: { prizes: readonly GamePublicPrize[]; size: number; rot: { value: number }; theme: StoriesTheme }) {
  const n = Math.max(1, prizes.length);
  const seg = 360 / n;
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <View style={styles.wheelBox} {...HIDDEN_FROM_AT}>
      <Animated.View testID="cs-game-disc" style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 2 }, style]}>
        {prizes.map((p, i) => (
          <View key={`d${p.id}`} style={[styles.spoke, { width: size, top: size / 2 - 1, transform: [{ rotate: `${i * seg - 90}deg` }] }]}>
            <View style={{ width: size / 2, height: 2, backgroundColor: theme.border }} />
          </View>
        ))}
        {prizes.map((p, i) => (
          <View key={`l${p.id}`} style={[styles.spoke, { width: size, height: LABEL_H, top: size / 2 - LABEL_H / 2, transform: [{ rotate: `${(i + 0.5) * seg - 90}deg` }] }]}>
            <View style={[styles.pill, { maxWidth: size / 2 - 14, backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.swatch, { backgroundColor: safeColor(p.color) ?? (i % 2 === 0 ? theme.accent : theme.ringUnseen) }]} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1} style={{ color: theme.surfaceForeground, fontSize: 11, fontWeight: "600", flexShrink: 1 }}>
                {p.label}
              </Text>
            </View>
          </View>
        ))}
      </Animated.View>
      <View style={[styles.pointer, { borderTopColor: theme.accent }]} />
    </View>
  );
}

export const wheelSize = (width: number): number => Math.max(180, Math.min(280, width - 64));

export function WheelStage({ cfg, result, theme, m, reducedMotion, later, done, registerFinish, say }: StageProps) {
  const win = useWindowDimensions();
  const size = wheelSize(win.width);
  const rot = useSharedValue(0);
  const n = cfg.prizes.length;
  const idx = prizeIndex(cfg, result);
  useEffect(() => {
    say(m.spinning);
    registerFinish(() => {
      // Saltar: sin giro, queda en el segmento del premio.
      rot.value = wheelAngle(idx, n, 0);
      done();
    });
    if (reducedMotion) {
      rot.value = wheelAngle(idx, n, 0);
      done();
      return;
    }
    // Dos tiempos: el primero pinta el reposo, el segundo dispara el giro.
    later(() => {
      rot.value = withTiming(wheelAngle(idx, n), { duration: SPIN_MS, easing: Easing.bezier(0.17, 0.67, 0.12, 1) });
      later(done, SPIN_MS + 120);
    }, 30);
  }, []);
  return <WheelDisc prizes={cfg.prizes} size={size} rot={rot} theme={theme} />;
}

// ─── Rasca y gana ───────────────────────────────────────────────────────────

const COLS = 8;
const ROWS = 4;
const REVEAL_AT = 0.55;
const CELL = 18;

/** Celdas que borra un punto del dedo (la celda y sus vecinas: el trazo tiene grosor). */
export function cellsAt(x: number, y: number, w: number, h: number): number[] {
  const cx = Math.floor((x / Math.max(1, w)) * COLS);
  const cy = Math.floor((y / Math.max(1, h)) * ROWS);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const c = cx + dx, r = cy + dy;
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) out.push(r * COLS + c);
  }
  return out;
}

export function ScratchStage({ result, theme, m, reducedMotion, done, registerFinish }: StageProps) {
  const [scratched, setScratched] = useState<ReadonlySet<number>>(() => new Set());
  const set = useRef(new Set<number>());
  const box = useRef({ w: COLS * CELL * 2, h: ROWS * CELL * 2 });
  const finished = useRef(false);
  const open = (): void => {
    if (finished.current) return;
    finished.current = true;
    set.current = new Set(Array.from({ length: COLS * ROWS }, (_, i) => i));
    setScratched(set.current);
    done();
  };
  useEffect(() => {
    registerFinish(open);
    if (reducedMotion) open();
  }, []);
  const scratch = (x: number, y: number): void => {
    if (finished.current) return;
    const before = set.current.size;
    for (const c of cellsAt(x, y, box.current.w, box.current.h)) set.current.add(c);
    if (set.current.size === before) return;
    setScratched(new Set(set.current));
    if (set.current.size / (COLS * ROWS) > REVEAL_AT) open();
  };
  const pan = useMemo(() => Gesture.Pan().runOnJS(true).minDistance(0).onBegin((e) => scratch(e.x, e.y)).onUpdate((e) => scratch(e.x, e.y)), []);
  return (
    <View style={styles.center}>
      <GestureDetector gesture={pan}>
        <View testID="cs-game-scratch" accessible accessibilityRole="image" accessibilityLabel={m.scratchArea} accessibilityHint={m.scratchHint} onLayout={(e) => void (box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={styles.scratch}>
          <PrizeFace r={result} theme={theme} m={m} />
          <View pointerEvents="none" style={styles.cover} {...HIDDEN_FROM_AT}>
            {Array.from({ length: ROWS * COLS }, (_, i) => (
              <View key={i} testID={`cs-game-cell-${i}`} style={[styles.cell, { backgroundColor: theme.mutedForeground, opacity: scratched.has(i) ? 0 : 1 }]} />
            ))}
          </View>
        </View>
      </GestureDetector>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.hint, { color: theme.mutedForeground }]}>
        {m.scratchHint}
      </Text>
    </View>
  );
}

// ─── Tarjeta de premio ──────────────────────────────────────────────────────

export function PrizeCardStage({ result, theme, m, reducedMotion, later, done, registerFinish }: StageProps) {
  const flip = useSharedValue(0);
  const [open, setOpen] = useState(false);
  const flipOnce = (): void => {
    setOpen(true);
    flip.value = reducedMotion ? 1 : withTiming(1, { duration: 450 });
    later(done, reducedMotion ? 0 : 450);
  };
  useEffect(() => {
    registerFinish(() => {
      setOpen(true);
      flip.value = 1;
      done();
    });
    if (reducedMotion) {
      setOpen(true);
      flip.value = 1;
      done();
    }
  }, []);
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${flip.value * 180}deg` }], backfaceVisibility: "hidden" as const }));
  const back = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${180 + flip.value * 180}deg` }], backfaceVisibility: "hidden" as const }));
  return (
    <View style={styles.center}>
      <Pressable testID="cs-game-flip" accessibilityRole="button" accessibilityLabel={m.flipCard} accessibilityState={{ selected: open, disabled: open }} disabled={open} onPress={flipOnce} style={styles.flip}>
        <Animated.View style={[styles.flipFace, { backgroundColor: theme.accent }, front]} {...HIDDEN_FROM_AT}>
          <Text style={styles.big}>🎁</Text>
        </Animated.View>
        <Animated.View style={[styles.flipFace, back]}>
          <PrizeFace r={result} theme={theme} m={m} />
        </Animated.View>
      </Pressable>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.hint, { color: theme.mutedForeground }]}>
        {m.flipHint}
      </Text>
    </View>
  );
}

// ─── Memoria ────────────────────────────────────────────────────────────────

export function MemoryStage({ cfg, result, theme, m, reducedMotion, later, done, registerFinish }: StageProps) {
  const pairs = cfg.board?.pairs ?? 6;
  const order = useMemo(() => memoryBoard(pairs, result.board_seed ?? result.play_id), [pairs, result.board_seed, result.play_id]);
  const [up, setUp] = useState<readonly number[]>([]);
  const [matched, setMatched] = useState<ReadonlySet<number>>(() => new Set());
  const state = useRef({ open: [] as number[], matched: new Set<number>(), lock: false });
  useEffect(() => {
    registerFinish(done);
    if (reducedMotion) {
      // Sin animación: el tablero ya está resuelto y el resultado, a la vista.
      setMatched(new Set(order.map((_, i) => i)));
      done();
    }
  }, []);
  const press = (i: number): void => {
    const s = state.current;
    if (s.lock || s.matched.has(i) || s.open.includes(i)) return;
    s.open.push(i);
    setUp([...s.open]);
    if (s.open.length < 2) return;
    const [a, c] = s.open as [number, number];
    if (order[a] === order[c]) {
      s.matched.add(a);
      s.matched.add(c);
      s.open = [];
      setMatched(new Set(s.matched));
      setUp([]);
      if (s.matched.size === order.length) later(done, reducedMotion ? 0 : 400);
    } else {
      s.lock = true;
      later(() => {
        s.open = [];
        s.lock = false;
        setUp([]);
      }, reducedMotion ? 0 : 700);
    }
  };
  return (
    <View style={styles.center}>
      <View accessibilityLabel={cfg.title} style={styles.grid}>
        {order.map((sym, i) => {
          const isUp = up.includes(i) || matched.has(i);
          const symbol = SYMBOLS[sym % SYMBOLS.length]!;
          return (
            <Pressable
              key={i}
              testID={`cs-game-card-${i}`}
              accessibilityRole="button"
              accessibilityLabel={isUp ? fmt(m.cardFaceUp, { n: i + 1, symbol }) : fmt(m.cardFaceDown, { n: i + 1 })}
              accessibilityState={{ selected: matched.has(i), disabled: matched.has(i) }}
              onPress={() => press(i)}
              style={[styles.tile, { backgroundColor: matched.has(i) ? theme.surface : isUp ? theme.surface : theme.accent, borderColor: matched.has(i) ? theme.positive : theme.border }]}
            >
              <Text style={[styles.big, { color: theme.accentForeground }]} {...HIDDEN_FROM_AT}>
                {isUp ? symbol : "?"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.hint, { color: theme.mutedForeground }]}>
        {m.memoryHint}
      </Text>
    </View>
  );
}

// ─── Tres iguales ───────────────────────────────────────────────────────────

export function Match3Stage({ cfg, result, theme, m, reducedMotion, later, done, registerFinish }: StageProps) {
  const tiles = useMemo(() => match3Tiles(result.outcome === "win", result.prize?.id ?? null, result.board_seed ?? result.play_id), [result.outcome, result.prize?.id, result.board_seed, result.play_id]);
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set());
  const set = useRef(new Set<number>());
  const reveal = (i: number): void => {
    if (set.current.has(i)) return;
    set.current.add(i);
    setShown(new Set(set.current));
    if (set.current.size === tiles.length) later(done, reducedMotion ? 0 : 350);
  };
  useEffect(() => {
    registerFinish(() => {
      set.current = new Set(tiles.map((_, i) => i));
      setShown(new Set(set.current));
      done();
    });
    if (reducedMotion) {
      set.current = new Set(tiles.map((_, i) => i));
      setShown(new Set(set.current));
      done();
    }
  }, []);
  return (
    <View style={styles.center}>
      <View accessibilityLabel={cfg.title} style={styles.row}>
        {tiles.map((sym, i) => {
          const isUp = shown.has(i);
          const symbol = SYMBOLS[sym]!;
          return (
            <Pressable
              key={i}
              testID={`cs-game-tile-${i}`}
              accessibilityRole="button"
              accessibilityLabel={isUp ? fmt(m.tileShown, { n: i + 1, symbol }) : fmt(m.tileHidden, { n: i + 1 })}
              onPress={() => reveal(i)}
              style={[styles.tile, styles.tileBig, { backgroundColor: isUp ? theme.surface : theme.accent, borderColor: theme.border }]}
            >
              <Text style={[styles.big, { color: theme.accentForeground }]} {...HIDDEN_FROM_AT}>
                {isUp ? symbol : "?"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.hint, { color: theme.mutedForeground }]}>
        {m.match3Hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: 10 },
  face: { minWidth: 160, minHeight: 90, borderRadius: 14, borderWidth: 2, padding: 12, alignItems: "center", justifyContent: "center" },
  faceText: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  wheelBox: { alignItems: "center", paddingTop: 14 },
  spoke: { position: "absolute", left: 0, alignItems: "flex-end", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, height: LABEL_H - 4, marginEnd: 6 },
  swatch: { width: 8, height: 14, borderRadius: 3 },
  pointer: { position: "absolute", top: 0, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 18, borderLeftColor: "transparent", borderRightColor: "transparent" },
  scratch: { width: COLS * CELL * 2, height: ROWS * CELL * 2, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  cover: { ...StyleSheet.absoluteFill, flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / COLS}%`, height: `${100 / ROWS}%` },
  flip: { width: 200, height: 130 },
  flipFace: { ...StyleSheet.absoluteFill, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 4 * (MIN_TOUCH + 16) + 3 * 8 },
  row: { flexDirection: "row", gap: 10 },
  tile: { width: MIN_TOUCH + 16, height: MIN_TOUCH + 16, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tileBig: { width: 84, height: 84 },
  big: { fontSize: 30 },
  hint: { fontSize: 13, textAlign: "center" },
});
