import { defineConfig } from "tsup";

// Núcleo RN (`.`) y módulos opcionales: componentes de la Ola 2, adaptador de vídeo, Lottie, almacenamiento y los
// widgets nativos (`./widgets` ligeros; `./video-feed` y `./game` aparte por peso; `./ugc` opcional). Los pares (react, react-native, reanimated, gesture-handler) y el renderer
// quedan fuera del paquete: no se duplica el núcleo de `@customyai/stories-render`.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/index": "src/components/index.tsx",
    "video/index": "src/video/index.tsx",
    "lottie/index": "src/lottie/index.tsx",
    "storage/index": "src/storage/index.ts",
    "widgets/index": "src/widgets/index.tsx",
    "video-feed/index": "src/video-feed/index.tsx",
    "game/index": "src/game/index.tsx",
    "ugc/index": "src/ugc/index.tsx",
    "live/index": "src/live/index.tsx",
    "live-livekit/index": "src/live-livekit/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: false,
  clean: false,
  platform: "neutral",
  target: "es2022",
  external: [
    "react",
    "react/jsx-runtime",
    "react-native",
    "react-native-reanimated",
    "react-native-gesture-handler",
    "react-native-worklets",
    /^@customyai\/stories-render/,
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
