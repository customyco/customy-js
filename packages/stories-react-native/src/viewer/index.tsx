import { useEffect, useRef, useState } from "react";
import { Modal } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createPreloader, createStoryViewer, viewableGroups, type CloseReason, type SeenTracker, type StoryGroup, type StoryViewer, type ViewerEvent } from "../core";
import type { PageActionsProvider } from "../component-api";
import { useStoriesContext } from "../context";
import { useAppActive } from "../hooks";
import { composeAssetLoader } from "../media";
import { ViewerStage } from "./stage";

export type StoryViewerViewProps = {
  /** Los grupos que recorre el visor, en orden (los de control y los vacíos se omiten solos). */
  groups: readonly StoryGroup[];
  open: boolean;
  startGroupId?: string;
  startPageId?: string;
  /** Estado «visto» (el del cliente): marca páginas y decide por cuál se reanuda. */
  seen?: SeenTracker;
  onEvent?: (event: ViewerEvent) => void;
  /** Acciones extra por página («⋯»); por defecto las del `StoriesProvider`. Ver `ugcPageActions` de `./ugc`. */
  pageActions?: PageActionsProvider;
  onClose?: (reason: CloseReason) => void;
};

/**
 * Visor a pantalla completa (`Modal`): una máquina de estados del núcleo (`createStoryViewer`) pintada con
 * Reanimated y gobernada por Gesture Handler. Una sesión por apertura: cerrar destruye el visor, cancela la
 * precarga y registra el cierre.
 */
export function StoryViewerView(props: StoryViewerViewProps) {
  return props.open ? <ViewerSession {...props} /> : null;
}

function ViewerSession(props: StoryViewerViewProps) {
  const ctx = useStoriesContext();
  const latest = useRef(props);
  latest.current = props;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Una sola vez por apertura: las opciones que cambian después (callbacks) se leen de los refs.
  const [viewer] = useState<StoryViewer>(() =>
    createStoryViewer({
      groups: viewableGroups(props.groups),
      startGroupId: props.startGroupId,
      startPageId: props.startPageId,
      seen: props.seen ?? ctx.client?.seen,
      preloader: createPreloader({ load: composeAssetLoader(ctx.mediaCache, ctx.video), clock: ctx.clock }),
      clock: ctx.clock,
      reducedMotion: ctx.reducedMotion,
      rtl: ctx.rtl,
      locale: ctx.locale,
      messages: ctx.messages,
      onEvent: (e) => latest.current.onEvent?.(e),
      openLink: (action, c) => ctxRef.current.open(action, { surface: "story", groupId: c.groupId, pageId: c.pageId, elementId: c.elementId }),
      onClose: (reason) => latest.current.onClose?.(reason),
    }),
  );

  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    if (!viewer.getState().open && !viewer.getState().closeReason) {
      viewer.open();
      ctxRef.current.onVisibilityChange?.({ surface: "story", visible: true });
    }
    return () => {
      alive.current = false;
      // Un microtask después: StrictMode desmonta y remonta en el mismo commit y eso NO es cerrar el visor.
      void Promise.resolve().then(() => {
        if (alive.current) return;
        // Cierre desde fuera (la pantalla se desmonta): se registra y se libera todo.
        viewer.close("app");
        viewer.destroy();
        ctxRef.current.onVisibilityChange?.({ surface: "story", visible: false });
      });
    };
  }, [viewer]);

  // Segundo plano o foco perdido (llamada, centro de control): pausa; al volver, sigue.
  useAppActive((active) => (active ? viewer.resume("hidden") : viewer.pause("hidden")));

  // Pausa por superficie (juego, vídeo, checkout de la app): DIFIERE, no descarta.
  const surfaces = ctx.client?.surfaces;
  useEffect(() => {
    if (!surfaces) return;
    const sync = (): void => (surfaces.isPaused("story") ? viewer.pause("surface") : viewer.resume("surface"));
    sync();
    return surfaces.subscribe(sync);
  }, [surfaces, viewer]);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent supportedOrientations={["portrait", "landscape"]} onRequestClose={() => viewer.close("user")}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ViewerStage viewer={viewer} pageActions={props.pageActions} />
      </GestureHandlerRootView>
    </Modal>
  );
}
