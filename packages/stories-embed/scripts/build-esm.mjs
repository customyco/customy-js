#!/usr/bin/env node
// Salida ESM AUTOCONTENIDA: el renderer va dentro (el bundler del cliente no resuelve subrutas ni `?raw`) y los módulos
// diferidos son `import()` que esbuild reparte en trozos. La salida <script> la hace scripts/build-iife.mjs.
import path from "node:path";
import { baseOptions, dir, esbuild } from "./esbuild-common.mjs";

await esbuild.build({
  ...baseOptions(),
  entryPoints: { index: path.join(dir, "src/index.ts"), protocol: path.join(dir, "src/protocol.ts") },
  format: "esm",
  splitting: true,
  outdir: path.join(dir, "dist"),
  outExtension: { ".js": ".mjs" },
  chunkNames: "chunks/[name]-[hash]",
});
console.log("ESM listo en dist");
