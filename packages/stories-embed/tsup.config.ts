import { defineConfig } from "tsup";

// Solo los tipos (.d.ts): el JS ESM lo construye scripts/build-esm.mjs con esbuild, porque tsup trata los `?raw` de CSS
// como hojas aparte y aquí el CSS debe viajar como texto dentro del bundle (para inyectarlo con nonce o por CSSOM).
export default defineConfig({
  entry: { index: "src/index.ts", protocol: "src/protocol.ts" },
  format: ["esm"],
  dts: { only: true },
  clean: false,
  outExtension: () => ({ js: ".mjs" }),
});
