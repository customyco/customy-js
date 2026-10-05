// Alias del renderer a su código fuente: el embed se construye y se prueba sin depender de un `dist` previo.
import { fileURLToPath } from "node:url";

const render = (p) => fileURLToPath(new URL(`../stories-render/src/${p}`, import.meta.url));

export const renderAliases = {
  "@customyai/stories-render/dom": render("dom/index.ts"),
  "@customyai/stories-render/components": render("dom/components.ts"),
  "@customyai/stories-render/client": render("client/index.ts"),
  "@customyai/stories-render/lottie": render("lottie/index.ts"),
  "@customyai/stories-render/video": render("video/index.ts"),
  "@customyai/stories-render/widgets/game": render("widgets/game.ts"),
  "@customyai/stories-render/widgets/live": render("widgets/live.ts"),
  "@customyai/stories-render/widgets/ads": render("widgets/ads.ts"),
  "@customyai/stories-render/styles.css": render("styles.css"),
  "@customyai/stories-render/game.css": render("game.css"),
  "@customyai/stories-render/live.css": render("live.css"),
  "@customyai/stories-render": render("index.ts"),
};

/** Sin `eval`: la variante ligera de lottie-web no incluye el motor de expresiones (CSP sin `unsafe-eval`). */
export const lottieLight = "lottie-web/build/player/esm/lottie_light.min.js";
