#!/usr/bin/env node
// Los hooks de `@customyai/send/inbox/react` son de cliente: la directiva
// "use client" debe ser la primera línea del fichero publicado (RSC).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const directive = '"use client";\n';
for (const file of ["dist/inbox/react.mjs", "dist/inbox/react.cjs"]) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    if (!content.startsWith('"use client"')) writeFileSync(file, directive + content);
}
