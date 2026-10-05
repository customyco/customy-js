import { useEffect, useMemo, useRef, useState } from "react";
import type { StoryGroup } from "./core";
import { useStoriesClient, useStoriesContext } from "./context";
import { BannerView, type BannerViewProps } from "./banner";
import { usePlacement, type UsePlacementOptions } from "./placement";
import { StoryBarView, type StoryBarViewProps } from "./story-bar";
import { StoryViewerView, type StoryViewerViewProps } from "./viewer";

type Query = UsePlacementOptions;

export type StoryBarProps = { placementId: string } & Query & Partial<Omit<StoryBarViewProps, "groups" | "placementId">>;

/**
 * Barra de historias de un placement: pide el contenido, aplica kill/`min_sdk`/calendario/frecuencia, registra
 * impresiones y eventos, y se oculta sola si no hay nada que mostrar. Requiere `<StoriesProvider client>`.
 */
export function StoryBar({ placementId, locale, appVersion, platform, enabled, ...rest }: StoryBarProps) {
  const client = useStoriesClient();
  const ctx = useStoriesContext();
  const { delivery } = usePlacement(placementId, { locale: locale ?? ctx.locale, appVersion, platform, enabled });
  const current = delivery?.storyBars[0];
  // Pausa de superficie: lo nuevo se difiere (la barra desaparece) pero un visor ya abierto sigue, pausado.
  const last = useRef(current);
  if (current) last.current = current;
  const deferred = !current && !!delivery?.held.paused.includes("story");
  const bar = current ?? (deferred ? last.current : undefined);
  // Las opciones ligadas se calculan una vez por entrega.
  const bound = useMemo(() => (bar ? client.bindStoryBar(placementId, bar) : null), [client, placementId, bar]);
  const style = useMemo(() => ({ ...bound?.style, ...rest.style }), [bound, rest.style]);
  if (!bar || !bound || bar.groups.length === 0) return null;
  const mine = bound.viewer ?? {};
  return (
    <StoryBarView
      {...rest}
      hidden={!current}
      placementId={placementId}
      groups={bound.groups}
      style={style}
      seen={bound.seen}
      canOpen={() => bound.canOpen?.() !== false && (rest.canOpen?.() ?? true)}
      onRender={(ordered) => {
        bound.onRender?.(ordered);
        rest.onRender?.(ordered);
      }}
      viewer={{
        onEvent: (e) => {
          mine.onEvent?.(e);
          rest.viewer?.onEvent?.(e);
        },
        onClose: (r) => {
          mine.onClose?.(r);
          rest.viewer?.onClose?.(r);
        },
      }}
    />
  );
}

export type BannerProps = { placementId: string } & Query & Partial<Omit<BannerViewProps, "banner" | "placementId">>;

/** UN banner por placement: el de mayor prioridad que pase frecuencia y descartes. */
export function Banner({ placementId, locale, appVersion, platform, enabled, ...rest }: BannerProps) {
  const client = useStoriesClient();
  const ctx = useStoriesContext();
  const { delivery } = usePlacement(placementId, { locale: locale ?? ctx.locale, appVersion, platform, enabled });
  const banner = delivery?.banner ?? null;
  const bound = useMemo(() => (banner ? client.bindBanner(placementId, banner) : null), [client, placementId, banner]);
  if (!banner || !bound) return null;
  return (
    <BannerView
      {...rest}
      key={banner.id}
      placementId={placementId}
      banner={bound.banner}
      onEvent={(e) => {
        bound.onEvent?.(e);
        rest.onEvent?.(e);
      }}
      onDismiss={(r) => {
        bound.onDismiss?.(r);
        rest.onDismiss?.(r);
      }}
    />
  );
}

export type StoryViewerProps = { placementId: string; open: boolean } & Query & Partial<Omit<StoryViewerViewProps, "groups" | "open">>;

/** Visor controlado sobre los grupos del placement (un overlay a la vez: si otra superficie manda, no abre). */
export function StoryViewer({ placementId, open, locale, appVersion, platform, enabled, ...rest }: StoryViewerProps) {
  const client = useStoriesClient();
  const ctx = useStoriesContext();
  const { delivery } = usePlacement(placementId, { locale: locale ?? ctx.locale, appVersion, platform, enabled });
  const current = delivery?.storyBars[0];
  const last = useRef(current);
  if (current) last.current = current;
  // Pausa de superficie con el visor abierto: sigue (pausado) en lugar de cerrarse.
  const bar = current ?? (delivery?.held.paused.includes("story") ? last.current : undefined);
  const groups: StoryGroup[] = bar?.groups ?? [];
  const bound = useMemo(() => (bar ? client.bindStoryBar(placementId, bar) : null), [client, placementId, bar]);
  const release = useRef<(() => void) | null>(null);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!open || groups.length === 0) {
      setGranted(false);
      return;
    }
    const r = client.overlays.tryAcquire("story-viewer");
    if (!r) {
      setGranted(false);
      return;
    }
    release.current = r;
    setGranted(true);
    return () => {
      r();
      release.current = null;
      setGranted(false);
    };
  }, [client, open, groups.length]);

  const mine = bound?.viewer ?? {};
  return (
    <StoryViewerView
      {...rest}
      groups={groups}
      seen={client.seen}
      open={open && granted}
      onEvent={(e) => {
        mine.onEvent?.(e);
        rest.onEvent?.(e);
      }}
      onClose={(r) => {
        mine.onClose?.(r);
        rest.onClose?.(r);
      }}
    />
  );
}
