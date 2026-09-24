#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
const directive = '"use client";\n';
for (const f of ["dist/react.mjs", "dist/react.cjs"]) {
    try {
        const c = readFileSync(f, "utf8");
        if (!c.startsWith('"use client"')) {
            writeFileSync(f, directive + c);
        }
    } catch (_) {
        // ignore
    }
}
