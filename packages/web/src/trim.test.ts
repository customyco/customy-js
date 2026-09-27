import { describe, expect, it } from "vitest";
import { trimTrailingSlashes } from "./trim";

describe("trimTrailingSlashes", () => {
    it("quita solo las barras finales", () => {
        expect(trimTrailingSlashes("/api/auth///")).toBe("/api/auth");
        expect(trimTrailingSlashes("/api//auth")).toBe("/api//auth");
        expect(trimTrailingSlashes("///")).toBe("");
        expect(trimTrailingSlashes("")).toBe("");
    });

    it("es lineal con entradas hostiles", () => {
        const hostile = `${"/".repeat(200_000)}x${"/".repeat(200_000)}`;
        const started = Date.now();
        expect(trimTrailingSlashes(hostile)).toBe(`${"/".repeat(200_000)}x`);
        expect(Date.now() - started).toBeLessThan(200);
    });
});
