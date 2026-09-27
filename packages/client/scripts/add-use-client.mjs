#!/usr/bin/env node
// Marca las entradas de React como componentes de cliente (RSC): la directiva
// debe ser la primera línea del fichero publicado.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const directive = '"use client";\n';
for (const file of ["dist/react.mjs", "dist/react.cjs", "dist/native/react.mjs", "dist/native/react.cjs"]) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    if (!content.startsWith('"use client"')) writeFileSync(file, directive + content);
}
