import { describe, expect, it } from "vitest";
import src from "./index.ts?raw";

describe("lottie", () => {
  it("importa la variante lottie_light (sin motor de expresiones ni eval), nunca el paquete completo", () => {
    expect(src).toMatch(/import\("lottie-web\/build\/player\/lottie_light"\)/);
    expect(src).not.toMatch(/import\("lottie-web"\)/);
  });
});
