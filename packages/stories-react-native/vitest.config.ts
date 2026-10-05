import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const render = (p: string): string => fileURLToPath(new URL(`../stories-render/src/${p}`, import.meta.url));

// Las pruebas no necesitan un runtime nativo: `react-native`, Reanimated y Gesture Handler se sustituyen por
// dobles ligeros (`test/mocks`) que pintan en jsdom y dejan disparar gestos a mano. El renderer se resuelve
// desde su código fuente para que la prueba no dependa de un `dist` construido.
export default defineConfig({
  resolve: {
    alias: [
      { find: "react-native-reanimated", replacement: here("./test/mocks/reanimated.tsx") },
      { find: "react-native-gesture-handler", replacement: here("./test/mocks/gesture-handler.tsx") },
      { find: /^react-native$/, replacement: here("./test/mocks/react-native.tsx") },
      { find: /^@customyai\/stories-render\/widgets\/([\w-]+)$/, replacement: render("widgets/$1.ts") },
      { find: /^@customyai\/stories-render\/ugc$/, replacement: render("ugc/index.ts") },
      { find: "@customyai/stories-render/components", replacement: render("dom/components.ts") },
      { find: "@customyai/stories-render/client", replacement: render("client/index.ts") },
      { find: /^@customyai\/stories-render$/, replacement: render("index.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: [here("./test/setup.ts")],
  },
});
