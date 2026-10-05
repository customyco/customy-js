import { describe, expect, it } from "vitest";
import { fallbackInsets } from "./insets";

describe("zona segura de reserva", () => {
  it("Android usa la barra de estado; iOS estima por la forma de la pantalla", () => {
    expect(fallbackInsets("android", { width: 400, height: 800 }, 30)).toEqual({ top: 30, bottom: 0, left: 0, right: 0 });
    expect(fallbackInsets("android", { width: 400, height: 800 }, undefined).top).toBe(0);
    expect(fallbackInsets("ios", { width: 390, height: 844 }, undefined)).toMatchObject({ top: 47, bottom: 34 });
    expect(fallbackInsets("ios", { width: 375, height: 667 }, undefined)).toMatchObject({ top: 20, bottom: 0 });
  });
});
