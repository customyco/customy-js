/**
 * Los dos motores detrás del proveedor: `local` (instantánea de Access evaluada en
 * proceso con el cliente de `@customyai/access/flags`) y `remote` (Experiments).
 * Ambos entregan `EvaluatedFlag` y reportan exposiciones y conversiones; el
 * proveedor no sabe cuál tiene debajo.
 */
import { createFlagsClient, type CustomyFlagsSnapshot, type EvalContext, type EvaluationDetail, type FlagsClientOptions, type FlagsSubscribeOptions } from "@customyai/access/flags";
import type { EvaluatedFlag } from "./mapping";
import { RemoteClient, type RemoteOptions } from "./remote";
import type { ProviderEvents } from "./emitter";

/** Lo que el proveedor usa del cliente de flags (lo cumple `CustomyFlagsClient`; se puede inyectar uno propio o un doble). */
export interface FlagsClientLike {
  ready(): Promise<CustomyFlagsSnapshot>;
  refresh(version?: number): Promise<CustomyFlagsSnapshot>;
  getTreatment(flagKey: string, context: EvalContext, options?: { track?: boolean }): EvaluationDetail;
  track(detail: EvaluationDetail, context: EvalContext): void;
  trackConversion(flagKey: string, context: EvalContext, options?: { value?: number; metric?: string; id?: string }): boolean;
  flush?(): Promise<number>;
  startAutoFlush?(): void;
  stopAutoFlush?(): void;
  subscribe?(options: FlagsSubscribeOptions): () => void;
}

export type LocalOptions = {
  mode?: "local";
  /** Cliente ya creado (se comparte el snapshot con el resto de la app). Si falta, se crea con `clientOptions`. */
  client?: FlagsClientLike;
  clientOptions?: FlagsClientOptions;
  /** Origen de Customy Realtime: cambios y kill switch en vivo. */
  realtimeUrl?: string;
  /** Respaldo sin realtime: relee con ETag cada tantos ms (mínimo 5 s; 0 o ausente = sin sondeo). */
  pollIntervalMs?: number;
};

export type ProviderOptions = LocalOptions | RemoteOptions;
export const isRemote = (options: ProviderOptions): options is RemoteOptions => options.mode === "remote";

/** Claves de flags cuyo contenido cambió entre dos instantáneas (todas si cambiaron los segmentos). */
export function changedFlags(previous: CustomyFlagsSnapshot | undefined, next: CustomyFlagsSnapshot): string[] {
  if (!previous) return next.flags.map((flag) => flag.key);
  if (JSON.stringify(previous.segments ?? []) !== JSON.stringify(next.segments ?? [])) return [...new Set([...previous.flags, ...next.flags].map((flag) => flag.key))];
  const before = new Map(previous.flags.map((flag) => [flag.key, JSON.stringify(flag)]));
  const after = new Map(next.flags.map((flag) => [flag.key, JSON.stringify(flag)]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => before.get(key) !== after.get(key));
}

export class LocalEngine {
  readonly client: FlagsClientLike;
  private snapshot?: CustomyFlagsSnapshot;
  private stale = false;
  private unsubscribe?: () => void;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly options: LocalOptions, private readonly events: ProviderEvents) {
    if (!options.client && !options.clientOptions) throw new Error("local mode needs `client` or `clientOptions`");
    this.client = options.client ?? createFlagsClient(options.clientOptions!);
  }

  async start(): Promise<void> {
    this.snapshot = await this.client.ready();
    this.client.startAutoFlush?.();
    const onSnapshot = (next: CustomyFlagsSnapshot) => {
      const flagsChanged = changedFlags(this.snapshot, next);
      const wasStale = this.stale;
      this.stale = false;
      this.snapshot = next;
      if (flagsChanged.length) this.events.emit("PROVIDER_CONFIGURATION_CHANGED", { flagsChanged, message: `snapshot v${next.version}` });
      else if (wasStale) this.events.emit("PROVIDER_READY", { message: "snapshot refreshed" });
    };
    const onError = (error: unknown) => {
      this.stale = true;
      this.events.emit("PROVIDER_STALE", { message: error instanceof Error ? error.message : String(error) });
    };
    if (this.options.realtimeUrl && this.client.subscribe) {
      this.unsubscribe = this.client.subscribe({ realtimeUrl: this.options.realtimeUrl, onUpdate: onSnapshot, onError });
    }
    if (this.options.pollIntervalMs && this.options.pollIntervalMs > 0) {
      this.pollTimer = setInterval(() => { this.client.refresh().then(onSnapshot, onError); }, Math.max(5_000, this.options.pollIntervalMs));
      (this.pollTimer as { unref?: () => void }).unref?.();
    }
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.client.stopAutoFlush?.();
    await this.client.flush?.().catch(() => undefined);
  }

  evaluate(flagKey: string, context: EvalContext): EvaluatedFlag {
    return this.client.getTreatment(flagKey, context, { track: false });
  }
}

export class RemoteEngine {
  readonly remote: RemoteClient;
  constructor(options: RemoteOptions) { this.remote = new RemoteClient(options); }
  start(): void { this.remote.start(); }
  stop(): Promise<void> { return this.remote.stop(); }
}
