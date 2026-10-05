/**
 * Entorno `node` (sin DOM): importar cualquier entrada no debe tocar `window`/`document` al cargar
 * (SSR, React Server Components, React Native, edge) y el núcleo no arrastra módulos de Node.
 */
import { describe, expect, it } from "vitest";
import src_0 from "./index.ts?raw";
import src_1 from "./client/index.ts?raw";
import src_2 from "./client/stories-client.ts?raw";
import src_3 from "./client/placements.ts?raw";
import src_4 from "./client/events.ts?raw";
import src_5 from "./client/delivery.ts?raw";
import src_6 from "./viewer.ts?raw";
import src_7 from "./banner.ts?raw";
import src_8 from "./preload.ts?raw";
import src_9 from "./seen.ts?raw";
import src_10 from "./page-player.ts?raw";

describe("seguro para SSR", () => {
  it("no hay DOM y aun así todas las entradas se importan", async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const core = await import("./index");
    const client = await import("./client/index");
    const dom = await import("./dom/index");
    const react = await import("./react/index");
    const clientReact = await import("./client/react");
    const lottie = await import("./lottie/index");
    expect(typeof core.createStoryViewer).toBe("function");
    expect(typeof client.createStoriesClient).toBe("function");
    expect(typeof dom.mountStoryBar).toBe("function");
    expect(typeof react.StoryBar).toBe("function");
    expect(typeof clientReact.usePlacement).toBe("function");
    expect(typeof lottie.lottieFactory).toBe("function");
  });

  it("el núcleo y el cliente no importan módulos de Node ni usan el DOM", () => {
    const sources: Record<string, string> = { "index": src_0, "client/index": src_1, "client/stories-client": src_2, "client/placements": src_3, "client/events": src_4, "client/delivery": src_5, "viewer": src_6, "banner": src_7, "preload": src_8, "seen": src_9, "page-player": src_10 };
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/from "node:|require\("node:/);
      expect(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), file).not.toMatch(/\b(?:window|document|localStorage|sessionStorage)\b/);
    }
  });
});
