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
    { ...shared, entry: {"index":"src/index.ts","testing":"src/testing.ts","client":"src/client.ts","client-react":"src/client-react.ts","native":"src/native.ts","native-react":"src/native-react.ts","web":"src/web.ts","server":"src/server.ts","flags":"src/flags.ts","flags-edge":"src/flags-edge.ts","flags-react":"src/flags-react.ts","openfeature":"src/openfeature.ts","openfeature-web":"src/openfeature-web.ts","provisioning":"src/provisioning.ts","access":"src/access.ts","core":"src/core.ts","send":"src/send.ts","send-inbox":"src/send-inbox.ts","send-inbox-react":"src/send-inbox-react.ts","storage":"src/storage.ts","billing":"src/billing.ts","data":"src/data.ts","links":"src/links.ts"}, clean: false },
]);
