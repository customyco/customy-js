/**
 * @customyai/access/flags/react — hooks y componentes de React sobre el cliente
 * de flags (`createFlagsClient`), con SSR sin parpadeo.
 *
 * ```tsx
 * // servidor (RSC / loader): asignación y datos de hidratación
 * const bootstrap = createBootstrap(await client.ready(), { key: userId, attributes: { plan } });
 * // cliente
 * <FlagsProvider client={client} context={{ key: userId, attributes: { plan } }} bootstrap={bootstrap}>
 *   <Experience point="hero.layout" variants={{ control: <HeroA />, wide: <HeroB /> }} />
 * </FlagsProvider>
 * ```
 *
 * Sin parpadeo: con `bootstrap` (calculado en el servidor o en el borde con
 * `@customyai/access/flags/edge`) el primer render del navegador usa EXACTAMENTE
 * lo que el servidor pintó. El cliente solo lo sustituye cuando recibe una
 * versión de la instantánea más nueva que la del bootstrap (un cambio real de
 * configuración). Sin `bootstrap` y sin instantánea cargada, los hooks devuelven
 * el valor por defecto del código (`ready: false`) hasta que llega: el SDK nunca
 * bloquea el render. La exposición se registra en el navegador, una vez montado
 * (no en el render del servidor, para no contar robots ni renders descartados).
 */
import { Fragment, createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { EvalContext, EvaluationDetail } from "@customyai/flags-eval";
import type { BootstrapFlag, FlagsBootstrap } from "./flags-bootstrap";
import type { FlagConversionOptions } from "./flags";

export type { BootstrapFlag, FlagsBootstrap } from "./flags-bootstrap";

/** Lo que los hooks usan del cliente (`CustomyFlagsClient` lo cumple; también se puede pasar un doble). */
export interface FlagsClientLike {
    ready(): Promise<{ version: number }>;
    refresh(): Promise<{ version: number }>;
    getTreatment(flagKey: string, context: EvalContext, options?: { track?: boolean }): EvaluationDetail;
    track?(detail: EvaluationDetail, context: EvalContext): void;
    trackConversion?(flagKey: string, context: EvalContext, options?: FlagConversionOptions): boolean;
    subscribe?(options: { realtimeUrl: string; onUpdate?: (snapshot: { version: number }) => void; onError?: (error: Error) => void }): () => void;
}

export type FlagsProviderProps = {
    client: FlagsClientLike;
    /** La unidad (`key`) y sus atributos de segmentación. Mantenerlo estable (useMemo) evita reevaluar. */
    context: EvalContext;
    /** Asignaciones del servidor o del borde para hidratar sin parpadeo. */
    bootstrap?: FlagsBootstrap;
    /** Origen de Customy Realtime: los cambios y el kill switch llegan en vivo. */
    realtimeUrl?: string;
    /** Respaldo sin realtime: relee con ETag cada tantos ms (mínimo 5 s). */
    pollIntervalMs?: number;
    children?: ReactNode;
};

/** Mínimo de versión viva que cuenta: antes de cargar la instantánea el almacén vale 0. */
type Store = { version: number; listeners: Set<() => void>; set(version: number): void };

type Value = { client: FlagsClientLike; context: EvalContext; bootstrap?: FlagsBootstrap; store: Store };
const FlagsContext = createContext<Value | undefined>(undefined);

function createStore(): Store {
    const store: Store = {
        version: 0,
        listeners: new Set(),
        set(version) {
            if (version === store.version) return;
            store.version = version;
            for (const listener of [...store.listeners]) listener();
        },
    };
    return store;
}

export function FlagsProvider({ client, context, bootstrap, realtimeUrl, pollIntervalMs, children }: FlagsProviderProps) {
    const storeRef = useRef<Store | undefined>(undefined);
    storeRef.current ??= createStore();
    const store = storeRef.current;

    useEffect(() => {
        let alive = true;
        const apply = (snapshot: { version: number }) => { if (alive) store.set(snapshot.version); };
        const quiet = () => undefined;
        client.ready().then(apply, quiet);
        const stop = realtimeUrl && client.subscribe ? client.subscribe({ realtimeUrl, onUpdate: apply, onError: quiet }) : undefined;
        const timer = pollIntervalMs ? setInterval(() => { client.refresh().then(apply, quiet); }, Math.max(5_000, pollIntervalMs)) : undefined;
        return () => { alive = false; stop?.(); if (timer) clearInterval(timer); };
    }, [client, realtimeUrl, pollIntervalMs, store]);

    const value = useMemo<Value>(() => ({ client, context, bootstrap, store }), [client, context, bootstrap, store]);
    return createElement(FlagsContext.Provider, { value }, children);
}

function useFlagsContext(): Value {
    const value = useContext(FlagsContext);
    if (!value) throw new Error("useFlag/useExperiment/<Experience> must be used inside <FlagsProvider>");
    return value;
}

export type FlagState = {
    /** Clave del tratamiento servido (`control` si no hay nada que servir). */
    treatment: string;
    value: unknown;
    config?: Record<string, unknown>;
    /** Contrato D6 (`rollout`, `rule:<id>`, `segment:<key>`, `error`…). */
    reasonCode: string;
    /** `bootstrap` (servidor/borde), `live` (instantánea del cliente) o `fallback` (nada cargado). */
    source: "bootstrap" | "live" | "fallback";
    /** ¿Hay una asignación real (bootstrap o instantánea) y no el valor por defecto del código? */
    ready: boolean;
};

const FALLBACK: FlagState = { treatment: "control", value: undefined, reasonCode: "error", source: "fallback", ready: false };

function fromBootstrap(flag: BootstrapFlag): FlagState {
    return { treatment: flag.treatment, value: flag.value, config: flag.config, reasonCode: flag.reasonCode, source: "bootstrap", ready: true };
}

/** Misma política en todos los hooks: el bootstrap manda hasta que el cliente ve una versión más nueva. */
function resolveFlag(ctx: Value, flagKey: string, liveVersion: number): FlagState {
    const boot = ctx.bootstrap && ctx.bootstrap.unitKey === ctx.context.key ? ctx.bootstrap.flags[flagKey] : undefined;
    // Hay versión viva más nueva que la del bootstrap (o no hay bootstrap): manda la instantánea del cliente.
    const live = liveVersion > 0 && (!ctx.bootstrap || liveVersion > ctx.bootstrap.version);
    if (boot && !live) return fromBootstrap(boot);
    if (liveVersion > 0 && (!boot || live)) {
        const detail = ctx.client.getTreatment(flagKey, ctx.context, { track: false });
        if (detail.reasonCode !== "error") return { treatment: detail.treatment, value: detail.value, config: detail.config, reasonCode: detail.reasonCode, source: "live", ready: true };
    }
    return boot ? fromBootstrap(boot) : FALLBACK;
}

function useFlagState(flagKey: string): FlagState {
    const ctx = useFlagsContext();
    const subscribe = useCallback((listener: () => void) => { ctx.store.listeners.add(listener); return () => { ctx.store.listeners.delete(listener); }; }, [ctx.store]);
    // Servidor e hidratación: versión 0 ⇒ solo bootstrap, idéntico al HTML del servidor.
    const liveVersion = useSyncExternalStore(subscribe, () => ctx.store.version, () => 0);
    const state = useMemo(() => resolveFlag(ctx, flagKey, liveVersion), [ctx, flagKey, liveVersion]);

    // La exposición se registra tras montar, con el detalle que se mostró.
    const { client, context, bootstrap } = ctx;
    useEffect(() => {
        if (!state.ready || !client.track) return;
        const boot = bootstrap?.flags[flagKey];
        const detail = state.source === "bootstrap" && boot
            ? { flagKey, treatment: boot.treatment, value: boot.value, config: boot.config, reason: boot.reason, reasonCode: boot.reasonCode, ruleId: boot.ruleId, bucket: boot.bucket } as unknown as EvaluationDetail
            : client.getTreatment(flagKey, context, { track: false });
        client.track(detail, context);
    }, [client, context, bootstrap, flagKey, state.ready, state.source, state.treatment]);
    return state;
}

/** Estado completo de un flag: tratamiento, valor, configuración, razón y origen. */
export const useFlagDetail: (flagKey: string) => FlagState = useFlagState;

type Primitive = boolean | string | number;
export function useFlag(flagKey: string, defaultValue: boolean): boolean;
export function useFlag(flagKey: string, defaultValue: string): string;
export function useFlag(flagKey: string, defaultValue: number): number;
export function useFlag<T extends object>(flagKey: string, defaultValue: T): T;
export function useFlag(flagKey: string, defaultValue: Primitive | object): unknown {
    const state = useFlagState(flagKey);
    const value = state.value;
    if (!state.ready) return defaultValue;
    if (typeof defaultValue === "object") return value !== null && typeof value === "object" ? value : defaultValue;
    if (typeof defaultValue === "string" && value === undefined) return state.treatment;
    return typeof value === typeof defaultValue ? value : defaultValue;
}

export type ExperimentState = FlagState & {
    /** Alias de `treatment`. */
    variant: string;
    /** ¿Es el grupo de control (`control`, o el tratamiento por defecto sin asignación)? */
    isControl: boolean;
    /** Conversión atribuida a este experimento (idempotente por `options.id`). `false` si no hay asignación. */
    track(metric: string, options?: Omit<FlagConversionOptions, "metric">): boolean;
};

export function useExperiment(experimentKey: string): ExperimentState {
    const ctx = useFlagsContext();
    const state = useFlagState(experimentKey);
    const track = useCallback((metric: string, options: Omit<FlagConversionOptions, "metric"> = {}) => {
        if (!state.ready || !ctx.client.trackConversion) return false;
        try { return ctx.client.trackConversion(experimentKey, ctx.context, { ...options, metric }); } catch { return false; }
    }, [ctx.client, ctx.context, experimentKey, state.ready]);
    return { ...state, variant: state.treatment, isControl: state.treatment === "control", track };
}

export type ExperienceProps = {
    /** Punto de decisión nombrado (la clave del flag/experimento que lo gobierna). */
    point: string;
    /** Qué pintar por tratamiento. Se cae a `control` y luego a `fallback`. */
    variants?: Record<string, ReactNode>;
    /** Se pinta si no hay asignación o la variante no está en `variants`. */
    fallback?: ReactNode;
    /** Alternativa a `variants`: recibe el estado y devuelve lo que pintar (p. ej. leyendo `config`). */
    children?: ReactNode | ((state: ExperimentState) => ReactNode);
};

/** Punto de decisión: pinta la variante asignada. Sin parpadeo con `bootstrap` (misma variante en servidor y navegador). */
export function Experience({ point, variants, fallback = null, children }: ExperienceProps) {
    const state = useExperiment(point);
    if (typeof children === "function") return createElement(Fragment, null, children(state));
    const chosen = state.ready ? variants?.[state.treatment] ?? variants?.control : undefined;
    return createElement(Fragment, null, chosen ?? fallback ?? children ?? null);
}
