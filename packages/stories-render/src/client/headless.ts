import { pageDurationMs } from "../clock";
import type { PlacementResponse, StoryNudge, StorySponsor, Visibility, WidgetKind, WidgetProgress } from "../types";

/** Páginas, capas y componentes ya resueltos, sin estilos de widget: la app pinta con su propia UI. */
export type HeadlessItem = {
  kind: "story_group" | "banner" | "widget";
  id: string;
  title?: string;
  cover?: { url: string; alt: string };
  mode?: "normal" | "nudge" | "sponsored";
  nudge?: StoryNudge;
  sponsor?: StorySponsor;
  answers?: Record<string, string | number | boolean>;
  pinned: boolean;
  order: number;
  live: boolean;
  priority?: number;
  variant_id?: string;
  control: boolean;
  pages?: { id: string; duration_ms: number; background?: unknown; layers: unknown[]; components: unknown[]; safe_zone: { top_px: number; bottom_px: number }; visibility?: Visibility }[];
  slides?: unknown[];
  /** Widgets de la Ola 3: el tipo, su configuración y sus elementos tal cual (la app pinta con su UI). */
  widget_kind?: WidgetKind;
  config?: Record<string, unknown>;
  entries?: unknown[];
  progress?: WidgetProgress;
};

export type StoriesHeadlessPayload = {
  object: "stories_headless";
  schema_version: 1;
  placement_id: string;
  etag: string;
  ttl: number;
  min_sdk: string | null;
  kill: { placement: boolean; story: boolean; banner: boolean; widget?: boolean };
  items: HeadlessItem[];
};

/**
 * Modo headless: la respuesta del placement como payload JSON plano (mismo resultado que
 * `toHeadlessPayload` del contrato; una prueba lo verifica). 
 */
export function toHeadlessPayload(res: PlacementResponse): StoriesHeadlessPayload {
  const items: HeadlessItem[] = [];
  for (const w of res.widgets) {
    if (w.kind === "story_bar") {
      for (const g of w.items) {
        items.push({
          kind: "story_group",
          id: g.id,
          title: g.title,
          cover: g.cover,
          mode: g.mode,
          ...(g.nudge ? { nudge: g.nudge } : {}),
          ...(g.sponsor ? { sponsor: g.sponsor } : {}),
          ...(g.answers ? { answers: g.answers } : {}),
          pinned: g.pinned,
          order: g.order,
          live: g.live,
          variant_id: g.variant_id,
          control: g.control,
          pages: g.pages?.map((p) => ({ id: p.id, duration_ms: pageDurationMs(p), background: p.background, layers: p.canvas.layers, components: p.canvas.components, safe_zone: p.canvas.safe_zone, ...(p.visibility ? { visibility: p.visibility } : {}) })),
        });
      }
    } else if (w.kind === "banner") {
      for (const b of w.items) items.push({ kind: "banner", id: b.id, title: b.name, pinned: false, order: 0, live: false, priority: b.priority, variant_id: b.variant_id, control: b.control, slides: b.slides });
    } else {
      for (const x of w.items) {
        items.push({
          kind: "widget",
          widget_kind: w.kind,
          id: x.id,
          title: x.name,
          pinned: false,
          order: 0,
          live: false,
          priority: x.priority,
          variant_id: x.variant_id,
          control: x.control,
          config: x.config as unknown as Record<string, unknown>,
          ...(x.items ? { entries: x.items as unknown[] } : {}),
          ...("progress" in x && x.progress ? { progress: x.progress } : {}),
        });
      }
    }
  }
  return { object: "stories_headless", schema_version: 1, placement_id: res.placement_id, etag: res.etag, ttl: res.ttl, min_sdk: res.min_sdk, kill: res.kill, items };
}
