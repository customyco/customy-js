/**
 * Entrada <script> (IIFE): `window.CustomyStories`. Los módulos pesados son ficheros hermanos que se cargan por demanda.
 *
 *   <script src="customy-stories-embed.js"></script>
 *   <script>CustomyStories.init({ placementId: "home", token: () => fetch("/api/stories-token").then(r => r.text()) })</script>
 *
 * En una página alojada para WebView, `data-autostart` (sin script en línea) espera el `init` del anfitrión.
 */
import { createEmbed, type CustomyStoriesApi } from "./embed";
import { scriptBase, scriptLoaders } from "./modules";

declare global {
  interface Window {
    CustomyStories?: CustomyStoriesApi;
  }
}

const current = document.currentScript as HTMLScriptElement | null;
const api = createEmbed({ win: window, loaders: scriptLoaders(window, scriptBase(document, current?.dataset.base), current?.nonce || undefined) });
window.CustomyStories = Object.freeze(api);
if (current && current.hasAttribute("data-autostart")) api.autostart({ nonce: current.nonce || undefined, injectStyles: false });
