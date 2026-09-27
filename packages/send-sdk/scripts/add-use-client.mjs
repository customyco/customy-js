#!/usr/bin/env node
// Los hooks de `@customyai/send-sdk/inbox/react` son de cliente: marca sus
// salidas con "use client" para los frameworks con componentes de servidor.
import { readFileSync, writeFileSync } from "node:fs";

const directive = '"use client";\n';
for (const file of ["dist/inbox/react.mjs", "dist/inbox/react.cjs", "dist/inbox/react.js"]) {
  try {
    const content = readFileSync(file, "utf8");
    if (!content.startsWith('"use client"')) writeFileSync(file, directive + content);
  } catch {
    // Esa salida no existe en este build.
  }
}
