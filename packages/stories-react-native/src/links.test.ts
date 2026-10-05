import { Linking } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { isSafeAction, openActionDefault } from "./links";

describe("enlaces", () => {
  it("url solo https sin credenciales; deep link con lista blanca más los esquemas que la app declara", () => {
    expect(isSafeAction({ type: "url", url: "https://customy.ai/x" })).toBe(true);
    for (const url of ["http://customy.ai/x", "javascript:alert(1)", "myapp://x", "https://u:p@evil.example/x"]) expect(isSafeAction({ type: "url", url }), url).toBe(false);
    for (const uri of ["tel:+573001112233", "mailto:a@b.co", "sms:+573001112233", "https://customy.ai/x"]) expect(isSafeAction({ type: "deep_link", uri }), uri).toBe(true);
    for (const uri of ["myapp://product/42", "tg://resolve?domain=x", "whatsapp://send?text=x"]) expect(isSafeAction({ type: "deep_link", uri }), uri).toBe(false);
    expect(isSafeAction({ type: "deep_link", uri: "myapp://product/42" }, ["myapp"])).toBe(true);
    expect(isSafeAction({ type: "deep_link", uri: "whatsapp://send?text=x" }, ["whatsapp"])).toBe(true);
    for (const uri of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "intent://x#Intent;end", "http://x.example", "sin esquema"]) expect(isSafeAction({ type: "deep_link", uri }, ["javascript", "data", "file", "intent", "http"]), uri).toBe(false);
  });

  it("abre con Linking y no revienta si el sistema no puede", async () => {
    expect(await openActionDefault({ type: "url", url: "https://customy.ai/x" })).toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith("https://customy.ai/x");
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("no handler"));
    expect(await openActionDefault({ type: "deep_link", uri: "myapp://x" }, ["myapp"])).toBe(false);
    expect(await openActionDefault({ type: "deep_link", uri: "javascript:1" })).toBe(false);
  });
});

