/**
 * @customyai/stories-react-native/live-livekit — adaptador OPCIONAL del Live para `@livekit/react-native` (sobre `livekit-client`).
 * El paquete NO depende de LiveKit: la app pasa los módulos que ya instaló (tipos estructurales aquí) y solo entonces se crea la sala.
 *
 *   import { Room, RoomEvent } from "livekit-client";
 *   import { VideoView, AudioSession, registerGlobals } from "@livekit/react-native";
 *   registerGlobals();                                     // una vez, al arrancar la app
 *   <LiveView … openTransport={() => createLiveKitTransport({ livekit: { Room, RoomEvent }, reactNative: { VideoView, AudioSession } })} />
 *
 * El token de espectador llega de Send (`join`): este adaptador nunca ve una llave de LiveKit. Sin pista de vídeo no pinta nada.
 */
import { createElement, type ComponentType, type ReactNode } from "react";
import type { NativeLiveTransport } from "../live/use-live";
import type { LiveTransportHandlers } from "@customyai/stories-render/widgets/live";

type TrackLike = { kind: string; setVolume?: (volume: number) => void };
type PublicationLike = { setSubscribed?: (subscribed: boolean) => void; track?: TrackLike; kind?: string };
type RoomLike = {
  connect(url: string, token: string, options?: Record<string, unknown>): Promise<unknown>;
  disconnect(stopTracks?: boolean): unknown;
  on(event: string, handler: (...args: never[]) => void): unknown;
  remoteParticipants?: Map<string, { trackPublications?: Map<string, PublicationLike> }>;
};

export type LiveKitModules = {
  /** `import { Room, RoomEvent } from "livekit-client"`. */
  livekit: { Room: new (options?: Record<string, unknown>) => RoomLike; RoomEvent?: Record<string, string> };
  /** `import { VideoView, AudioSession } from "@livekit/react-native"` (`AudioSession` es opcional: el audio de la sala lo pide el sistema). */
  reactNative: { VideoView: ComponentType<{ videoTrack: unknown; style?: unknown; objectFit?: "contain" | "cover" }>; AudioSession?: { startAudioSession?: () => Promise<unknown> | unknown; stopAudioSession?: () => Promise<unknown> | unknown } };
  /** Cómo se ajusta el vídeo al escenario (por defecto `contain`: nunca recorta al anfitrión). */
  objectFit?: "contain" | "cover";
  style?: unknown;
};

export function createLiveKitTransport({ livekit, reactNative, objectFit = "contain", style }: LiveKitModules): NativeLiveTransport {
  const room = new livekit.Room({ adaptiveStream: true, dynacast: true });
  const ev = (name: string, fallback: string): string => livekit.RoomEvent?.[name] ?? fallback;
  const tracks = new Set<TrackLike>();
  const listeners = new Set<() => void>();
  let video: TrackLike | null = null;
  let handlers: LiveTransportHandlers | null = null;
  let closed = false;
  let muted = false;
  const notify = (): void => listeners.forEach((l) => l());
  const each = (fn: (p: PublicationLike) => void): void => {
    for (const p of room.remoteParticipants?.values() ?? []) for (const pub of p.trackPublications?.values() ?? []) fn(pub);
  };
  const applyMute = (): void => each((pub) => pub.track?.kind === "audio" && pub.track.setVolume?.(muted ? 0 : 1));

  return {
    async connect(join, h) {
      handlers = h;
      room.on(ev("TrackSubscribed", "trackSubscribed"), ((track: TrackLike) => {
        if (closed || (track.kind !== "video" && track.kind !== "audio")) return;
        tracks.add(track);
        if (track.kind === "video") video = track;
        else if (muted) track.setVolume?.(0);
        notify();
        handlers?.onAttached(track.kind === "video");
      }) as never);
      room.on(ev("TrackUnsubscribed", "trackUnsubscribed"), ((track: TrackLike) => {
        tracks.delete(track);
        if (video === track) video = Array.from(tracks).find((t) => t.kind === "video") ?? null;
        notify();
        if (!closed) handlers?.onDetached(video !== null);
      }) as never);
      room.on(ev("Reconnecting", "reconnecting"), (() => { if (!closed) handlers?.onReconnecting(); }) as never);
      room.on(ev("Reconnected", "reconnected"), (() => { if (!closed) handlers?.onReconnected(); }) as never);
      room.on(ev("TranscriptionReceived", "transcriptionReceived"), ((segments: Array<{ text?: string; final?: boolean }>) => {
        const text = segments?.filter((s) => s.final !== false).map((s) => s.text ?? "").join(" ").trim();
        if (text && !closed) handlers?.onCaption(text);
      }) as never);
      room.on(ev("Disconnected", "disconnected"), (() => { if (!closed) handlers?.onDisconnected(); }) as never);
      await reactNative.AudioSession?.startAudioSession?.();
      await room.connect(join.url, join.token, { autoSubscribe: true });
    },
    setPlaying(on) {
      // Pausar baja la suscripción a las pistas (no gasta datos ni batería); reanudar la restaura.
      each((pub) => pub.setSubscribed?.(on));
    },
    setMuted(next) {
      muted = next;
      applyMute();
    },
    renderVideo(): ReactNode {
      return video ? createElement(reactNative.VideoView, { videoTrack: video, objectFit, style: style ?? { width: "100%", height: "100%" } }) : null;
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    async close() {
      closed = true;
      tracks.clear();
      video = null;
      notify();
      try { await room.disconnect(true); } catch { /* ya cerrada */ }
      try { await reactNative.AudioSession?.stopAudioSession?.(); } catch { /* sin sesión */ }
    },
  };
}
