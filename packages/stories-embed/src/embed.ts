/**
 * Núcleo del embed: `init(opciones)` monta barra, banner y visor de Customy Stories sobre `@customyai/stories-render`,
 * habla con la app anfitriona por el puente (si lo hay) y carga bajo demanda los módulos pesados.
 *
 * Seguridad: el único dato secreto que toca la página es el token de suscriptor (`sst_…`) que entrega el backend de la
 * app; jamás una llave de servicio. El contenido de las campañas es JSON que se pinta con la API DOM del renderer: no
 * se evalúa nada y todo enlace pasa por la lista blanca de esquemas antes de cruzar el puente.
 */
import { mountBanner, mountStoryBar, openStoryViewer, type StoryViewerHandle } from "@customyai/stories-render/dom";
import { createStoriesClient, STORIES_SDK_ID, StoriesError, type StoriesClient } from "@customyai/stories-render/client";
import { storeFromWebStorage, type ComponentAction, type KeyValueStore } from "@customyai/stories-render";
import styles from "@customyai/stories-render/styles.css?raw";
import { createBridge, type Bridge } from "./bridge";
import { injectCss } from "./css";
import type { ModuleLoaders, ModuleMap, ModuleName } from "./modules";
import { PROTOCOL_VERSION, SUBSCRIBER_TOKEN_RE, parseInitConfig, sanitizeData, type Display, type HostCommand, type InitConfig, type Platform, type Theme } from "./protocol";
import { isAllowedUrl, type UrlPolicy } from "./url-policy";

export type TokenSource = string | ((forceRefresh?: boolean) => Promise<string>) | "native";

export type EmbedEvent = { name: string; data: Record<string, unknown> };

export type InitOptions = Omit<InitConfig, "placementId"> & {
  placementId: string;
  /** Token de suscriptor (`sst_…`) o función que lo pide al backend de la app. `"native"` = lo entrega el anfitrión. */
  token?: TokenSource;
  /** Alias de `token` para un valor fijo. */
  clientKey?: string;
  /** Selector o elemento donde pintar. Por defecto `#customy-stories` o `<body>`. */
  container?: string | HTMLElement;
  /** `nonce` de la CSP para `<style>`/`<script>` que inyecta el embed. */
  nonce?: string;
  /** `false` = la página enlaza `customy-stories-embed.css` con <link>; el embed no inyecta estilos. */
  injectStyles?: boolean;
  /** Origen exacto de la página que hospeda este iframe (canal `parent`). */
  parentOrigin?: string;
  /** Canal propio (Unity WebGL…): recibe el mensaje ya validado como texto JSON. */
  transport?: (json: string) => void;
  /** Tiempo real (apagado por defecto): el placement se vuelve a pedir en segundos cuando Send avisa de un cambio. Ver `createStoriesClient({ realtime })`. */
  realtime?: boolean;
  onEvent?: (event: EmbedEvent) => void;
  onError?: (error: { code: string; message: string }) => void;
  /** Solo pruebas. */
  fetch?: typeof fetch;
  store?: KeyValueStore;
  /** Solo desarrollo: permite `http:` hacia localhost en los enlaces. */
  allowLocalHttp?: boolean;
};

export type EmbedHandle = {
  readonly bridge: Bridge;
  readonly client: StoriesClient;
  refresh(): Promise<void>;
  open(groupId?: string): void;
  setTheme(theme: Theme): Promise<void>;
  setLocale(locale: string): Promise<void>;
  pause(): void;
  resume(): void;
  destroy(): Promise<void>;
};

export type EmbedDeps = { win: Window & typeof globalThis; loaders: ModuleLoaders };

const TOKEN_TIMEOUT_MS = 15_000;
const CAPABILITIES = ["story_bar", "banner", "viewer", "components", "lottie", "game", "share", "permissions", "pause", "token_refresh"];
export const EMBED_CSS = styles;

export function createEmbed(deps: EmbedDeps) {
  const { win, loaders } = deps;
  const doc = win.document;
  let current: { handle: EmbedHandle; receive: (raw: unknown) => boolean } | null = null;
  /** Config recibida por `init` del anfitrión (modo nativo) a la espera de que el puente esté listo. */
  let nativeBridge: Bridge | null = null;

  function resolveContainer(c: InitOptions["container"]): HTMLElement {
    if (typeof c === "string") {
      const found = doc.querySelector<HTMLElement>(c);
      if (!found) throw new Error(`contenedor no encontrado: ${c}`);
      return found;
    }
    return c ?? doc.getElementById("customy-stories") ?? doc.body;
  }

  async function init(options: InitOptions): Promise<EmbedHandle> {
    const cfg = parseInitConfig(options);
    if (!cfg.ok) throw new Error(`CustomyStories.init: ${cfg.reason}`);
    const config = cfg.value;
    const tokenSource = options.token ?? options.clientKey;
    if (tokenSource === undefined) throw new Error("CustomyStories.init: falta token (sst_…) o una función que lo pida a tu backend");
    if (typeof tokenSource === "string" && tokenSource !== "native" && !SUBSCRIBER_TOKEN_RE.test(tokenSource)) {
      throw new Error("CustomyStories.init: el token debe ser un token de suscriptor (sst_…); nunca pongas una llave de servicio en una página");
    }
    if (current) await current.handle.destroy();

    let theme: Theme = config.theme ?? "auto";
    let locale = config.locale;
    const platform: Platform = config.platform ?? "web";
    const display: Display = config.display ?? "bar";
    const container = resolveContainer(options.container);
    const policy = (): UrlPolicy => ({ extraSchemes: config.allowedSchemes ?? [], allowLocalHttp: options.allowLocalHttp === true });

    const pendingTokens = new Map<string, { resolve: (t: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let paused = false;
    let viewer: StoryViewerHandle | null = null;
    let rendered: { destroy(): void }[] = [];
    let renderSeq = 0;
    let destroyed = false;

    const reportError = (code: string, message: string): void => {
      options.onError?.({ code, message });
      bridge.send({ type: "error", code, message: message.slice(0, 300) });
    };
    const emit = (name: string, data: Record<string, unknown> = {}): void => {
      const clean = sanitizeData(data);
      options.onEvent?.({ name, data: clean });
      bridge.send({ type: "event", name, data: clean });
    };

    // ── puente ─────────────────────────────────────────────────────────────
    const onCommand = (cmd: HostCommand): void => {
      switch (cmd.type) {
        case "token": {
          const p = pendingTokens.get(cmd.requestId);
          if (!p) return;
          pendingTokens.delete(cmd.requestId);
          clearTimeout(p.timer);
          if (cmd.token) p.resolve(cmd.token);
          else p.reject(new StoriesError("token", cmd.error ?? "token no disponible"));
          return;
        }
        case "pause":
          return handle.pause();
        case "resume":
          return handle.resume();
        case "visibility":
          return cmd.visible ? handle.resume() : handle.pause();
        case "destroy":
          return void handle.destroy();
        case "set_theme":
          return void handle.setTheme(cmd.theme);
        case "set_locale":
          return void handle.setLocale(cmd.locale);
        case "open":
          return handle.open(cmd.groupId);
        case "close_viewer":
          // Atrás/descartar en el anfitrión: lo mismo que `Esc` en el visor (el <dialog> y el visor lo cierran).
          return void (viewer ? viewer.close("app") : doc.querySelector("dialog.cs-viewer")?.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        case "permission_result":
          return emit("permission_result", { permission: cmd.permission, granted: cmd.granted });
        case "init":
          return; // ya iniciado: un segundo `init` se ignora (hay que `destroy` antes)
      }
    };
    const bridge = createBridge({
      win,
      parentOrigin: options.parentOrigin,
      custom: options.transport,
      policy,
      onCommand,
      onReject: (dir, reason) => options.onError?.({ code: dir === "in" ? "bridge_rejected_in" : "bridge_rejected_out", message: reason }),
    });
    nativeBridge = bridge;

    // ── token ──────────────────────────────────────────────────────────────
    const checkToken = (t: unknown): string => {
      if (typeof t !== "string" || !SUBSCRIBER_TOKEN_RE.test(t)) throw new StoriesError("token", "el backend no devolvió un token de suscriptor (sst_…)");
      return t;
    };
    const token = async (force?: boolean): Promise<string> => {
      if (tokenSource === "native") {
        // Destruido: el anfitrión ya no atiende. El último envío falla rápido y lo pendiente queda en la cola persistida.
        if (destroyed) throw new StoriesError("token", "embed destruido");
        if (!bridge.transport) throw new StoriesError("token", "token nativo sin puente");
        const requestId = `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
        return new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingTokens.delete(requestId);
            reject(new StoriesError("token", "el anfitrión no entregó el token a tiempo"));
          }, TOKEN_TIMEOUT_MS);
          pendingTokens.set(requestId, { resolve, reject, timer });
          if (!bridge.send({ type: "request_token", requestId, forceRefresh: force === true })) {
            clearTimeout(timer);
            pendingTokens.delete(requestId);
            reject(new StoriesError("token", "no se pudo pedir el token al anfitrión"));
          }
        }).then(checkToken);
      }
      if (typeof tokenSource === "function") return checkToken(await tokenSource(force));
      return tokenSource;
    };

    // ── estilos y compartir ────────────────────────────────────────────────
    if (options.injectStyles !== false) injectCss({ doc, id: "core", css: styles, nonce: options.nonce });
    const navAny = win.navigator as Navigator & { share?: unknown };
    const hadShare = Object.getOwnPropertyDescriptor(win.navigator, "share");
    if (bridge.transport) {
      // En un WebView `navigator.share` falta o es irregular: el anfitrión comparte con su propia hoja.
      Object.defineProperty(navAny, "share", {
        configurable: true,
        value: (data?: { url?: string; title?: string }) => {
          bridge.send({ type: "share", ...(data?.url ? { url: data.url } : {}), ...(data?.title ? { title: data.title } : {}) });
          return Promise.resolve();
        },
      });
    }

    const store: KeyValueStore = options.store ?? safeLocalStore(win);
    const client = createStoriesClient({ baseUrl: config.baseUrl, token, platform, locale, appVersion: config.appVersion, store, namespace: "cs-embed", fetch: options.fetch, realtime: { enabled: options.realtime === true }, onError: (e) => reportError(e instanceof StoriesError ? e.code : "client_error", e instanceof Error ? e.message : "error") });

    // ── enlaces, recordatorios y módulos ───────────────────────────────────
    const openAction = (action: ComponentAction, elementId?: string): void => {
      const kind = action.type === "url" ? "url" : "deep_link";
      const href = action.type === "url" ? action.url : action.uri;
      const check = isAllowedUrl(href, policy());
      if (!check.ok) {
        emit("link_blocked", { reason: check.reason, kind });
        return;
      }
      if (bridge.transport) {
        bridge.send({ type: "open_url", url: check.url, kind, ...(elementId ? { elementId } : {}) });
        return;
      }
      if (check.scheme === "https") win.open(check.url, "_blank", "noopener,noreferrer");
      else win.location.assign(check.url);
    };
    const loadModule = async <K extends ModuleName>(name: K): Promise<ModuleMap[K]> => {
      const m = await loaders[name]();
      if (name === "game") injectCss({ doc, id: "game", css: (m as ModuleMap["game"]).gameCss, nonce: options.nonce });
      return m;
    };
    const viewerExtras = () => ({
      openLink: (a: ComponentAction, ctx: { elementId?: string }) => openAction(a, ctx.elementId),
      onReminder: (c: { id: string }, remindAt: string) => {
        bridge.send({ type: "request_permission", permission: "notifications", data: { componentId: c.id, remindAt } });
        emit("reminder_requested", { componentId: c.id, remindAt });
      },
      loadComponents: () => loaders.components().then((m) => m.components),
      loadLottie: () => loaders.lottie().then((m) => m.lottieFactory()),
      openGame: (gameId: string) => {
        void loadModule("game")
          .then((game) => game.openGameDialog({ gameId, api: game.createGameApi({ gameId, baseUrl: config.baseUrl, token, platform, appVersion: config.appVersion, locale, fetch: options.fetch }), locale, theme, onEvent: (e) => emit(`game.${e.type}`, e as unknown as Record<string, unknown>) }))
          .catch((e: unknown) => reportError("module_load_failed", e instanceof Error ? e.message : "no se pudo abrir el juego"));
      },
      onAddToCart: (product: unknown, quantity: number) => emit("add_to_cart_requested", { product, quantity }),
      onWishlist: (product: unknown) => emit("wishlist_requested", { product }),
    });

    // ── tamaño ─────────────────────────────────────────────────────────────
    let fullscreen = false;
    const sendSize = (): void => {
      if (destroyed) return;
      if (fullscreen) bridge.send({ type: "resize", height: win.innerHeight, mode: "fullscreen" });
      else bridge.send({ type: "resize", height: root.getBoundingClientRect().height || root.scrollHeight, mode: "inline" });
    };
    const root = doc.createElement("div");
    root.className = "cs-embed";
    container.append(root);
    const ro = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(() => sendSize()) : null;
    ro?.observe(root);
    const setFullscreen = (on: boolean): void => {
      fullscreen = on;
      sendSize();
    };

    // ── render ─────────────────────────────────────────────────────────────
    const teardown = (): void => {
      for (const r of rendered) r.destroy();
      rendered = [];
      viewer?.close("app");
      viewer = null;
    };

    const showViewer = (groups: NonNullable<ReturnType<StoriesClient["select"]>["storyBars"][number]>["groups"], bound: ReturnType<StoriesClient["bindStoryBar"]>, startGroupId: string | undefined, closeHostOnEnd: boolean): void => {
      if (!bound.canOpen?.()) {
        if (closeHostOnEnd) bridge.send({ type: "close", reason: "unavailable" });
        return;
      }
      setFullscreen(true);
      const mine = bound.viewer ?? {};
      viewer = openStoryViewer({
        ...viewerExtras(),
        groups,
        startGroupId,
        seen: client.seen,
        locale,
        theme,
        container: doc.body,
        onEvent: (e) => {
          mine.onEvent?.(e);
          emit(`story.${e.type}`, e as unknown as Record<string, unknown>);
        },
        onClose: (reason) => {
          mine.onClose?.(reason);
          viewer = null;
          setFullscreen(false);
          if (closeHostOnEnd) bridge.send({ type: "close", reason });
        },
      });
    };

    const render = async (force = false): Promise<void> => {
      const seq = ++renderSeq;
      teardown();
      let delivered;
      try {
        delivered = await client.deliver(config.placementId, { locale, appVersion: config.appVersion, platform, force });
      } catch (e) {
        reportError(e instanceof StoriesError ? e.code : "deliver_failed", e instanceof Error ? e.message : "no se pudo pedir el placement");
        return;
      }
      if (seq !== renderSeq || destroyed) return;
      const { result, delivery } = delivered;
      if (result.status === "killed" || result.status === "unsupported") emit("placement.unavailable", { placementId: config.placementId, status: result.status, ...(result.notice ? { notice: result.notice.code } : {}) });
      const bar = delivery.storyBars[0];
      const banner = delivery.banner;
      if (display !== "banner" && bar && bar.groups.length > 0) {
        const bound = client.bindStoryBar(config.placementId, bar);
        if (display === "viewer") {
          showViewer(bar.groups, bound, undefined, true);
        } else {
          const mine = bound.viewer ?? {};
          const handle = mountStoryBar(root, {
            groups: bound.groups,
            style: bound.style,
            seen: bound.seen,
            onRender: bound.onRender,
            locale,
            theme,
            canOpen: () => {
              const ok = bound.canOpen?.() ?? true;
              if (ok) setFullscreen(true);
              return ok;
            },
            viewer: {
              ...viewerExtras(),
              container: doc.body,
              onEvent: (e) => {
                mine.onEvent?.(e);
                emit(`story.${e.type}`, e as unknown as Record<string, unknown>);
              },
              onClose: (reason) => {
                mine.onClose?.(reason);
                setFullscreen(false);
              },
            },
          });
          rendered.push(handle);
          // `open` del anfitrión: abre un grupo concreto aunque la barra no lo tenga a la vista.
          openFromHost = (groupId) => showViewer(bar.groups, bound, groupId, false);
        }
      } else if (display === "viewer") {
        emit("placement.empty", { placementId: config.placementId });
        bridge.send({ type: "close", reason: "empty" });
      }
      if (display !== "viewer" && banner) {
        const bound = client.bindBanner(config.placementId, banner);
        rendered.push(
          mountBanner(root, {
            ...bound,
            locale,
            theme,
            openLink: (a, ctx) => openAction(a, ctx.elementId),
            onEvent: (e) => {
              bound.onEvent?.(e);
              emit(`banner.${e.type}`, e as unknown as Record<string, unknown>);
            },
          }),
        );
      }
      sendSize();
    };
    let openFromHost: ((groupId?: string) => void) | null = null;

    const handle: EmbedHandle = {
      bridge,
      client,
      refresh: () => render(true),
      open: (groupId) => openFromHost?.(groupId),
      async setTheme(t) {
        theme = t;
        await render();
      },
      async setLocale(l) {
        locale = l;
        await render();
      },
      pause() {
        if (paused) return;
        paused = true;
        client.surfaces.pause("all", "host");
        viewer?.controller.pause("host");
      },
      resume() {
        if (!paused) return;
        paused = false;
        client.surfaces.resume("all", "host");
        viewer?.controller.resume("host");
      },
      async destroy() {
        if (destroyed) return;
        destroyed = true;
        teardown();
        ro?.disconnect();
        root.remove();
        for (const p of pendingTokens.values()) {
          clearTimeout(p.timer);
          p.reject(new StoriesError("token", "embed destruido"));
        }
        pendingTokens.clear();
        bridge.destroy();
        if (bridge.transport) {
          if (hadShare) Object.defineProperty(navAny, "share", hadShare);
          else delete (navAny as { share?: unknown }).share;
        }
        if (current?.handle === handle) current = null;
        if (nativeBridge === bridge) nativeBridge = null;
        await client.close().catch(() => undefined);
      },
    };
    current = { handle, receive: bridge.receive };

    bridge.send({ type: "ready", sdk: STORIES_SDK_ID, protocol: PROTOCOL_VERSION, capabilities: CAPABILITIES, awaitingInit: false });
    await client.ready;
    await render();
    // Una señal de Send (activar, pausar, archivar, kill) repinta sin esperar el ttl; el cliente cierra el socket en `destroy`.
    client.realtime.watch(config.placementId, () => void render(true));
    return handle;
  }

  /**
   * Modo nativo (página alojada que carga un WebView): no hay configuración en la URL. La página avisa `ready` con
   * `awaitingInit: true` y espera el comando `init` del anfitrión; el token se pide con `request_token`.
   */
  function autostart(options: { parentOrigin?: string; transport?: (json: string) => void; nonce?: string; injectStyles?: boolean; onError?: InitOptions["onError"] } = {}): Bridge {
    const bridge = createBridge({
      win,
      parentOrigin: options.parentOrigin,
      custom: options.transport,
      policy: () => ({}),
      onReject: (dir, reason) => options.onError?.({ code: dir === "in" ? "bridge_rejected_in" : "bridge_rejected_out", message: reason }),
      onCommand: (cmd) => {
        if (cmd.type !== "init") return;
        bridge.destroy();
        void init({ ...cmd.config, token: "native", nonce: options.nonce, injectStyles: options.injectStyles, parentOrigin: options.parentOrigin, transport: options.transport, onError: options.onError }).catch((e: unknown) => {
          bridge.send({ type: "error", code: "init_failed", message: e instanceof Error ? e.message.slice(0, 300) : "init falló" });
        });
      },
    });
    nativeBridge = bridge;
    bridge.send({ type: "ready", sdk: STORIES_SDK_ID, protocol: PROTOCOL_VERSION, capabilities: CAPABILITIES, awaitingInit: true });
    return bridge;
  }

  /** `window.CustomyStories.receive(texto)`: lo llama la app con `evaluateJavascript`/`evaluateJavaScript`. */
  const receive = (raw: unknown): boolean => (current ? current.receive(raw) : (nativeBridge?.receive(raw) ?? false));

  return { init, autostart, receive, loadModule: <K extends ModuleName>(name: K): Promise<ModuleMap[K]> => loaders[name]() as Promise<ModuleMap[K]>, version: STORIES_SDK_ID, protocol: PROTOCOL_VERSION };
}

export type CustomyStoriesApi = ReturnType<typeof createEmbed>;

function safeLocalStore(win: Window): KeyValueStore {
  try {
    const s = win.localStorage;
    s.getItem("cs-embed:probe");
    return storeFromWebStorage(s);
  } catch {
    return storeFromWebStorage({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  }
}
