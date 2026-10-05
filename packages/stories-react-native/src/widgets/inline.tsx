import { useEffect, useMemo, useRef, useState } from "react";
import type { DeliveredInline, WidgetEvent } from "../core";
import { useStoriesClient, useStoriesContext } from "../context";
import { usePlacement, type UsePlacementOptions } from "../placement";
import { useAnchorRegistry, type AnchorRegistry, type InlineEntry } from "./anchors";
import { useWidgetLifecycle } from "./common";

export type InlineHostProps = UsePlacementOptions & {
  placementId: string;
  registry?: AnchorRegistry;
  /** La app también quiere los eventos (el cliente ya los recibe). */
  onEvent?: (e: WidgetEvent) => void;
};

/**
 * Entrega los widgets Inline de un placement a sus anclas. No pinta nada por sí mismo: las tarjetas aparecen donde la app
 * declaró `<StoriesAnchor id>` o `useInlineList(listId, …)`. UNO por ancla (el de mayor prioridad que pase frecuencia y
 * descartes: lo decide `selectDelivery`); un ancla que no existe aún espera, y si se desmonta la tarjeta se retira.
 * Lo descartado por la persona no vuelve (el cliente lo recuerda). Ponlo una vez por pantalla, junto a sus anclas.
 */
export function InlineHost({ placementId, registry, onEvent, ...query }: InlineHostProps) {
  const client = useStoriesClient();
  const ctx = useStoriesContext();
  const fallback = useAnchorRegistry();
  const reg = registry ?? fallback;
  const { delivery } = usePlacement(placementId, { ...query, locale: query.locale ?? ctx.locale });
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  // Pausa de superficie: lo nuevo se difiere, lo que ya está en pantalla se queda.
  const last = useRef<DeliveredInline[]>([]);
  const fresh = delivery?.widgets.inline ?? [];
  if (fresh.length > 0) last.current = fresh;
  const widgets = fresh.length === 0 && delivery?.held.paused.includes("widget") ? last.current : fresh;
  const mine = useRef(onEvent);
  mine.current = onEvent;

  const entries = useMemo<InlineEntry[]>(() => {
    const out: InlineEntry[] = [];
    for (const w of widgets) {
      if (gone.has(w.id)) continue;
      const bound = client.bindWidget(placementId, "inline", { id: w.id, expires_at: w.expires_at });
      out.push({
        widget: w,
        onEvent: (e) => {
          bound.onEvent(e);
          mine.current?.(e);
          if (e.type === "dismiss") setGone((s) => new Set(s).add(w.id));
        },
      });
    }
    return out;
  }, [client, placementId, widgets, gone]);

  const owner = `placement:${placementId}`;
  useEffect(() => {
    reg.setInline(owner, entries);
    return () => reg.setInline(owner, []);
  }, [reg, owner, entries]);
  useWidgetLifecycle(placementId, entries.length > 0);
  return null;
}
