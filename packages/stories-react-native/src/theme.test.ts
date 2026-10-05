import { describe, expect, it } from "vitest";
import { pickScheme, resolveTheme } from "./theme";

describe("tema", () => {
  it("los tokens de la app mandan y los que faltan salen del neutro del esquema", () => {
    const t = resolveTheme("dark", { accent: "token-acento" });
    expect(t.accent).toBe("token-acento");
    expect(t.viewerBackground).toBe(resolveTheme("dark").viewerBackground);
    expect(resolveTheme("light").surface).not.toBe(resolveTheme("dark").surface);
  });

  it("acepta tokens por esquema", () => {
    const input = { light: { accent: "a-claro" }, dark: { accent: "a-oscuro" } };
    expect(resolveTheme("light", input).accent).toBe("a-claro");
    expect(resolveTheme("dark", input).accent).toBe("a-oscuro");
    expect(resolveTheme("dark", { light: { accent: "solo-claro" } }).accent).toBe(resolveTheme("dark").accent);
  });

  it("`auto` sigue al sistema; claro/oscuro lo fuerzan", () => {
    expect(pickScheme("auto", "dark")).toBe("dark");
    expect(pickScheme(undefined, null)).toBe("light");
    expect(pickScheme("light", "dark")).toBe("light");
    expect(pickScheme("dark", "light")).toBe("dark");
  });
});
