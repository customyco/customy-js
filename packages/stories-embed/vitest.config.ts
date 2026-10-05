import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { renderAliases } from "./aliases.mjs";

const srcDir = fileURLToPath(new URL("../stories-render/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // `?raw` (texto del fichero): Vite exige coincidencia exacta del especificador con su sufijo.
      { find: /^@customyai\/stories-render\/(styles|game|live)\.css\?raw$/, replacement: `${srcDir}$1.css?raw` },
      ...Object.entries(renderAliases)
        .filter(([k]) => k !== "@customyai/stories-render" && !k.endsWith(".css"))
        .map(([find, replacement]) => ({ find, replacement })),
      { find: /^@customyai\/stories-render$/, replacement: renderAliases["@customyai/stories-render"] },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "test/**/*.test.mjs"],
  },
});
