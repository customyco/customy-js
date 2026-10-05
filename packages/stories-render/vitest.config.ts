import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Las pruebas de DOM piden jsdom con `// @vitest-environment jsdom`.
  },
});
