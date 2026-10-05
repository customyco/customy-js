// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { baseOptions, dir, esbuild } from "../scripts/esbuild-common.mjs";

async function bundle(entry) {
  const r = await esbuild.build({ ...baseOptions(), entryPoints: [path.join(dir, entry)], format: "iife", write: false });
  return r.outputFiles[0].text;
}

// Cadenas que solo existen en el código de cada módulo diferido.
const ONLY_IN = {
  ads: { entry: "src/modules/ads.ts", marker: "provider_disabled" },
  live: { entry: "src/modules/live.ts", marker: "waiting_host" },
  game: { entry: "src/modules/game.ts", marker: "err_game_not_found" },
  lottie: { entry: "src/modules/lottie.ts", marker: "bodymovin" },
};

describe("bundle autocontenido", () => {
  it("el principal no arrastra los módulos pesados (carga diferida real)", async () => {
    const main = await bundle("src/iife.ts");
    for (const [name, { marker }] of Object.entries(ONLY_IN)) expect(main, `el principal contiene ${name}`).not.toContain(marker);
    expect(main).toContain("customy-stories-embed."); // sabe dónde buscar los módulos
  });

  it("cada módulo diferido contiene su código", async () => {
    for (const [name, { entry, marker }] of Object.entries(ONLY_IN)) expect(await bundle(entry), name).toContain(marker);
  });

  it("ningún artefacto usa eval ni new Function (CSP sin unsafe-eval), ni siquiera Lottie", async () => {
    for (const entry of ["src/iife.ts", ...Object.values(ONLY_IN).map((m) => m.entry), "src/modules/components.ts", "src/modules/video.ts"]) {
      const text = await bundle(entry);
      expect(text, entry).not.toMatch(/\beval\s*\(|new Function\s*\(|Function\s*\(\s*["'`]/);
    }
  });

  it("el código del embed no escribe estilos en línea ni HTML de contenido", () => {
    const src = path.join(dir, "src");
    const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const f of files) {
      const text = readFileSync(path.join(src, f), "utf8");
      expect(text, f).not.toMatch(/setAttribute\(\s*["']style["']|\.cssText|insertAdjacentHTML|document\.write|\.innerHTML\s*=/);
    }
  });

  it("el presupuesto de tamaño cubre el principal y cada módulo", () => {
    const budget = JSON.parse(readFileSync(path.join(fileURLToPath(new URL("..", import.meta.url)), "size-budget.json"), "utf8")) ;
    expect(Object.keys(budget.iife).sort()).toEqual([".", "ads", "components", "game", "live", "lottie", "video"]);
  });
});
