// Utilidades de construcción compartidas (esbuild viene con tsup, como en stories-render).
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAliases } from "../aliases.mjs";

export const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromTsup = createRequire(createRequire(path.join(dir, "package.json")).resolve("tsup"));
export const esbuild = requireFromTsup("esbuild");

/** `import css from "<paquete>/x.css?raw"` → el texto del fichero (el mismo contrato que Vite/Vitest). */
export const rawPlugin = {
  name: "raw-text",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => {
      const spec = args.path.replace(/\?raw$/, "");
      const file = renderAliases[spec] ?? path.resolve(args.resolveDir, spec);
      return { path: file, namespace: "raw-text" };
    });
    b.onLoad({ filter: /.*/, namespace: "raw-text" }, (args) => ({ contents: readFileSync(args.path, "utf8"), loader: "text" }));
  },
};

/** Lottie sin motor de expresiones (nada de `eval`): variante ligera, ESM. */
export const lottieLightPath = () => realpathSync(path.join(dir, "node_modules/lottie-web/build/player/esm/lottie_light.min.js"));

export const aliases = () => ({ ...renderAliases, "lottie-web": lottieLightPath(), "lottie-web/build/player/lottie_light": lottieLightPath() });

export const baseOptions = () => ({
  bundle: true,
  minify: true,
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  alias: aliases(),
  plugins: [rawPlugin],
  logLevel: "silent",
});
