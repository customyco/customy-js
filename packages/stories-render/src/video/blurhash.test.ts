// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decodeBlurhash, isValidBlurhash, paintBlurhash } from "./blurhash";

const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";
describe("blurhash", () => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => null });
  it("valida longitud y alfabeto", () => {
    expect(isValidBlurhash(HASH)).toBe(true);
    expect(isValidBlurhash("")).toBe(false);
    expect(isValidBlurhash(HASH.slice(0, -1))).toBe(false);
    expect(isValidBlurhash("L!!!!!!!!!!!!!!!!!!!!!!!!!!!!")).toBe(false);
  });
  it("decodifica RGBA opaco del tamaño pedido", () => {
    const px = decodeBlurhash(HASH, 8, 4);
    expect(px).toHaveLength(8 * 4 * 4);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });
  it("un hash de color liso decodifica a ese color", () => {
    // DC de rojo puro, sin componentes AC significativos: 1×1 componentes (hash de 6 chars).
    const dc = (255 << 16) + (0 << 8) + 0;
    const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
    const enc = (v: number, n: number) => Array.from({ length: n }, (_, i) => digits[Math.floor(v / 83 ** (n - 1 - i)) % 83]).join("");
    const hash = enc(0, 1) + enc(0, 1) + enc(dc, 4);
    const px = decodeBlurhash(hash, 2, 2);
    expect([px[0], px[1], px[2]]).toEqual([255, 0, 0]);
  });
  it("lanza con hash inválido y paintBlurhash no revienta sin canvas", () => {
    expect(() => decodeBlurhash("x", 2, 2)).toThrow();
    const canvas = document.createElement("canvas");
    expect(paintBlurhash(canvas, "x")).toBe(false);
    // jsdom sin el paquete `canvas` no tiene contexto 2d: devuelve false sin lanzar.
    expect(paintBlurhash(canvas, HASH)).toBe(false);
  });
});
