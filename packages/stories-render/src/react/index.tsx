/**
 * @customyai/stories-render/react — componentes de React sobre los de `./dom`. Pintan en el
 * cliente (`"use client"`): las historias se piden al montar, no hay nada que servir desde el
 * servidor. Importa los estilos una vez: `import "@customyai/stories-render/styles.css"`.
 */
import { useEffect, useRef } from "react";
import { mountBanner, type BannerHandle, type BannerUiOptions } from "../dom/banner";
import { mountStoryBar, type StoryBarHandle, type StoryBarUiOptions } from "../dom/story-bar";
import { openStoryViewer, type StoryViewerHandle, type StoryViewerUiOptions } from "../dom/viewer";
import type { CloseReason } from "../viewer";

type Box = { className?: string };

/** Última versión de las props, para que los callbacks no obliguen a re-montar. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export type StoryBarProps = StoryBarUiOptions & Box;

/** Barra de historias. Cambiar `groups` o `style` la actualiza en sitio; el resto de opciones la re-monta. */
export function StoryBar(props: StoryBarProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<StoryBarHandle | null>(null);
  const latest = useLatest(props);
  const { seen, locale, rtl, theme, reducedMotion } = props;

  useEffect(() => {
    if (!host.current) return;
    const p = latest.current;
    handle.current = mountStoryBar(host.current, {
      ...p,
      onRender: (o) => latest.current.onRender?.(o),
      onOpen: (g) => latest.current.onOpen?.(g),
      canOpen: () => latest.current.canOpen?.() ?? true,
      viewer: {
        ...p.viewer,
        onEvent: (e) => latest.current.viewer?.onEvent?.(e),
        onClose: (r) => latest.current.viewer?.onClose?.(r),
        onReminder: (c, at) => latest.current.viewer?.onReminder?.(c, at),
        openLink: (a, c) => (latest.current.viewer?.openLink ? latest.current.viewer.openLink(a, c) : undefined),
      },
    });
    return () => {
      handle.current?.destroy();
      handle.current = null;
    };
    // El resto cambia por `update` (abajo) o por referencias estables a través de `latest`.
  }, [seen, locale, rtl, theme, reducedMotion, latest]);

  useEffect(() => {
    handle.current?.update({ groups: props.groups, style: props.style });
  }, [props.groups, props.style]);

  return <div ref={host} className={props.className} />;
}

export type BannerProps = BannerUiOptions & Box;

/** Banner o carrusel. Se re-monta si cambia `banner` (otro id/variante). */
export function Banner(props: BannerProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useLatest(props);
  const { banner, locale, rtl, theme, reducedMotion } = props;

  useEffect(() => {
    if (!host.current) return;
    const h: BannerHandle = mountBanner(host.current, {
      ...latest.current,
      onEvent: (e) => latest.current.onEvent?.(e),
      onDismiss: (r) => latest.current.onDismiss?.(r),
      openLink: latest.current.openLink ? (a, c) => latest.current.openLink?.(a, c) : undefined,
    });
    return () => h.destroy();
  }, [banner, locale, rtl, theme, reducedMotion, latest]);

  return <div ref={host} className={props.className} />;
}

export type StoryViewerProps = Omit<StoryViewerUiOptions, "container"> & {
  /** Abierto o cerrado, controlado por quien llama. `onClose` avisa para que lo ponga en `false`. */
  open: boolean;
  onClose?: (reason: CloseReason) => void;
};

/** Visor modal (`<dialog>`) controlado. No pinta nada en el árbol de React: vive en `document.body`. */
export function StoryViewer(props: StoryViewerProps) {
  const latest = useLatest(props);
  const handle = useRef<StoryViewerHandle | null>(null);

  useEffect(() => {
    if (!props.open) return;
    const p = latest.current;
    handle.current = openStoryViewer({
      ...p,
      onEvent: (e) => latest.current.onEvent?.(e),
      onClose: (r) => {
        handle.current = null;
        latest.current.onClose?.(r);
      },
    });
    return () => {
      handle.current?.close("app");
      handle.current = null;
    };
  }, [props.open, props.startGroupId, props.startPageId, latest]);

  return null;
}
