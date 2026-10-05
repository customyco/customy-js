#!/usr/bin/env node
// Los componentes de `@customyai/stories-render/react` son de cliente: la directiva
// "use client" debe ser la primera línea del fichero publicado (RSC). El núcleo y `./dom`
// NO la llevan: el núcleo se puede importar desde servidor.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const directive = '"use client";\n';
for (const file of ["dist/react/index.mjs", "dist/react/index.cjs", "dist/client/react.mjs", "dist/client/react.cjs"]) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf8");
  if (!content.startsWith('"use client"')) writeFileSync(file, directive + content);
}
