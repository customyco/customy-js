import { defineConfig } from "tsup";

const shared = {
    format: ["esm", "cjs"] as const,
    dts: true,
    splitting: true,
    treeshake: true,
    cjsInterop: true,
    sourcemap: false,
    outExtension({ format }: { format: string }) {
        return { js: format === "esm" ? ".mjs" : ".cjs" };
    },
    external: ["react", "react-dom", "next", "jose"],
};

// Dos configuraciones sobre el mismo outDir: ninguna limpia (el script build
// borra dist antes), para no pisar las salidas de la otra.
export default defineConfig([
    { ...shared, entry: {"index":"src/index.ts"}, clean: false },
]);
