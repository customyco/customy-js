#!/usr/bin/env node
// Artefactos <script> (IIFE) en dist/iife: principal, un fichero por módulo diferido (no hay trozos en IIFE), hoja de
// estilos para CSP estricta y una página de ejemplo para WebView. Falla si algún artefacto contiene `eval`/`new Function`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { baseOptions, dir, esbuild } from "./esbuild-common.mjs";

export const MODULES = ["components", "lottie", "game", "video", "live", "ads"];
const out = path.join(dir, "dist/iife");
mkdirSync(out, { recursive: true });

const main = await esbuild.build({ ...baseOptions(), entryPoints: [path.join(dir, "src/iife.ts")], format: "iife", write: false });
writeFileSync(path.join(out, "customy-stories-embed.js"), main.outputFiles[0].contents);

for (const name of MODULES) {
  const entry = `import * as ns from ${JSON.stringify(path.join(dir, `src/modules/${name}.ts`))};\n(globalThis.__CustomyStoriesModules ||= {}).${name} = ns;\n`;
  const r = await esbuild.build({ ...baseOptions(), stdin: { contents: entry, resolveDir: dir, loader: "ts" }, format: "iife", write: false });
  writeFileSync(path.join(out, `customy-stories-embed.${name}.js`), r.outputFiles[0].contents);
}

const renderCss = readFileSync(path.join(dir, "../stories-render/src/styles.css"), "utf8");
const pageRules = "\n/* Página de WebView (<html data-cs-embed-page>): sin márgenes ni fondo propio. */\nhtml[data-cs-embed-page],html[data-cs-embed-page] body{margin:0;padding:0;background:transparent}\n";
writeFileSync(path.join(out, "customy-stories-embed.css"), renderCss + pageRules);

// Página de ejemplo para WebView: sin scripts en línea (CSP `script-src 'self'`), config por el puente, no por la URL.
writeFileSync(
  path.join(out, "embed.html"),
  `<!doctype html>
<html lang="es" data-cs-embed-page>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src https: data:; media-src https:; connect-src https:; font-src https:; base-uri 'none'; form-action 'none'">
<title>Customy Stories</title>
<link rel="stylesheet" href="customy-stories-embed.css">
</head>
<body>
<div id="customy-stories"></div>
<script src="customy-stories-embed.js" data-autostart defer></script>
</body>
</html>
`,
);

const bad = [];
for (const f of ["customy-stories-embed.js", ...MODULES.map((m) => `customy-stories-embed.${m}.js`)]) {
  const text = readFileSync(path.join(out, f), "utf8");
  if (/\beval\s*\(|new Function\s*\(|Function\s*\(\s*["'`]/.test(text)) bad.push(f);
}
if (bad.length) {
  console.error(`Hay eval/new Function en: ${bad.join(", ")} (incompatible con una CSP sin unsafe-eval).`);
  process.exit(1);
}
console.log("IIFE listo en dist/iife");
