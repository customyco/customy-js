import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "./safe-url";

describe("safeHttpsUrl", () => {
  it("admite https con host y devuelve la URL normalizada", () => {
    expect(safeHttpsUrl("https://cdn.example.com/a.jpg?x=1")).toBe("https://cdn.example.com/a.jpg?x=1");
    expect(safeHttpsUrl("  https://cdn.example.com/a  ")).toBe("https://cdn.example.com/a");
  });
  it("rechaza todo lo demás: otros esquemas, credenciales, relativas, control y no-texto", () => {
    for (const u of ["http://x.example/a", "javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "blob:https://x/1", "//evil.example/a", "/ruta", "https://u:p@evil.example/a", "https://google.com@evil.example/a", "https://", "https://x.example/\u0000", "", "x".repeat(2100)]) expect(safeHttpsUrl(u), u).toBeUndefined();
    for (const u of [undefined, null, 5, {}]) expect(safeHttpsUrl(u)).toBeUndefined();
  });
});
