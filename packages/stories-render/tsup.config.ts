import { defineConfig } from "tsup";

// Núcleo (`.`), DOM (`./dom`), componentes de la Ola 2 opcionales (`./components`), React (`./react`) Lottie opcional (`./lottie`) y vídeo opcional (`./video`).
// `splitting` reparte los módulos comunes; `react` y `lottie-web` quedan fuera del
// bundle. Lottie se carga con import() dinámico: quien no lo usa no lo descarga.
export default defineConfig({
  entry: { index: "src/index.ts", "dom/index": "src/dom/index.ts", "dom/components": "src/dom/components.ts", "react/index": "src/react/index.tsx", "lottie/index": "src/lottie/index.ts", "video/index": "src/video/index.ts", "client/index": "src/client/index.ts", "client/react": "src/client/react.tsx", "widgets/canvas": "src/widgets/canvas.ts", "widgets/inline": "src/widgets/inline.ts", "widgets/swipe-cards": "src/widgets/swipe-cards.ts", "widgets/checklist": "src/widgets/checklist.ts", "widgets/tour": "src/widgets/tour.ts", "widgets/video-feed": "src/widgets/video-feed.ts", "widgets/game": "src/widgets/game.ts", "widgets/ads": "src/widgets/ads.ts", "widgets/live": "src/widgets/live.ts", "widgets/react": "src/widgets/react.tsx", "ugc/index": "src/ugc/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: false,
  clean: false,
  platform: "neutral",
  target: "es2022",
  external: ["react", "react-dom", "react/jsx-runtime", "lottie-web", "lottie-web/build/player/lottie_light"],
  onSuccess: "node scripts/add-use-client.mjs",
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
