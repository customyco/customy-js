import { describe, expect, it } from "vitest";
import { isAllowedUrl } from "../src/url-policy";
import { parseHostCommand, parsePageMessage, type PageMessage } from "../src/protocol";

type Vectors = {
  urls: { url: string; ok: boolean; scheme?: string; extraSchemes?: string[]; allowLocalHttp?: boolean }[];
  pageMessages: { name: string; input?: unknown; raw?: string; ok: boolean; type?: string; extraSchemes?: string[] }[];
  hostCommands: { name: string; json: unknown }[];
};
import raw from "./fixtures/protocol-vectors.json";
const vectors = raw as unknown as Vectors;

describe("vectores compartidos del protocolo (los mismos que leen Kotlin, Swift y C#)", () => {
  it.each(vectors.urls.map((v) => [JSON.stringify(v.url).slice(0, 50) + (v.extraSchemes ? ` +${v.extraSchemes}` : ""), v] as const))("URL %s", (_n, v) => {
    const r = isAllowedUrl(v.url, { extraSchemes: v.extraSchemes, allowLocalHttp: v.allowLocalHttp });
    expect(r.ok).toBe(v.ok);
    if (r.ok && v.scheme) expect(r.scheme).toBe(v.scheme);
  });

  it.each(vectors.pageMessages.map((v) => [v.name, v] as const))("mensaje de la página: %s", (_n, v) => {
    const r = parsePageMessage(v.raw ?? JSON.stringify(v.input), { extraSchemes: v.extraSchemes });
    expect(r.ok).toBe(v.ok);
    if (r.ok) expect(r.value.type).toBe(v.type);
  });

  it("un mensaje de la página que supera 32 KB se rechaza", () => {
    expect(parsePageMessage(JSON.stringify({ source: "customy-stories", v: 1, type: "close", reason: "x", pad: "a".repeat(40_000) })).ok).toBe(false);
  });

  it.each(vectors.hostCommands.map((v) => [v.name, v] as const))("comando del anfitrión (formato exacto del cable): %s", (_n, v) => {
    expect(parseHostCommand(JSON.stringify(v.json)).ok).toBe(true);
  });

  it("lo que emite la página es exactamente lo que parsea el anfitrión (ida y vuelta)", async () => {
    const { encodePageMessage } = await import("../src/protocol");
    for (const msg of [
      { type: "ready", sdk: "s", protocol: 1, capabilities: ["a"], awaitingInit: false },
      { type: "resize", height: 10, mode: "inline" },
      { type: "open_url", url: "https://example.com/", kind: "url" },
      { type: "close", reason: "user" },
      { type: "event", name: "story.view", data: { a: 1 } },
      { type: "request_permission", permission: "calendar", data: {} },
      { type: "share", url: "https://example.com/", title: "t" },
      { type: "request_token", requestId: "r1", forceRefresh: true },
      { type: "error", code: "x", message: "y" },
    ] satisfies PageMessage[]) {
      const r = parsePageMessage(encodePageMessage(msg));
      expect(r, msg.type).toMatchObject({ ok: true, value: { type: msg.type } });
    }
  });
});
