import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEMES, NEVER_SCHEMES, isAllowedUrl } from "../src/url-policy";

describe("política de URL (lista blanca de esquemas)", () => {
  it.each(["https://example.com/x?y=1#z", "mailto:hola@example.com", "tel:+573001112233", "sms:+573001112233?body=hola"])("permite %s", (u) => {
    expect(isAllowedUrl(u).ok).toBe(true);
  });

  it("devuelve la URL normalizada, no la cadena original", () => {
    const r = isAllowedUrl("  HTTPS://Example.COM/a b  ");
    expect(r).toMatchObject({ ok: true, url: "https://example.com/a%20b", scheme: "https" });
  });

  it.each([
    ["javascript:alert(1)", "esquema prohibido"],
    ["JaVaScRiPt:alert(1)", "esquema prohibido"],
    ["java\tscript:alert(1)", "caracteres de control"],
    ["java\nscript:alert(1)", "caracteres de control"],
    [" javascript:alert(1)", "esquema prohibido"],
    ["data:text/html;base64,PHNjcmlwdD4=", "esquema prohibido"],
    ["file:///etc/passwd", "esquema prohibido"],
    ["blob:https://example.com/uuid", "esquema prohibido"],
    ["intent://scan/#Intent;scheme=zxing;end", "esquema prohibido"],
    ["content://com.android.contacts/contacts", "esquema prohibido"],
    ["vbscript:msgbox(1)", "esquema prohibido"],
    ["http://example.com/", "esquema prohibido"],
    ["ftp://example.com/", "esquema prohibido"],
    ["about:blank", "esquema prohibido"],
    ["myapp://promo/1", "esquema no permitido"],
    ["https://user:pass@example.com/", "credenciales"],
    ["/relativa", "no es una URL absoluta"],
    ["//example.com/x", "no es una URL absoluta"],
    ["", "longitud"],
  ])("rechaza %j", (u, why) => {
    const r = isAllowedUrl(u);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(why);
  });

  it("rechaza no-textos y URLs enormes", () => {
    for (const bad of [undefined, null, 5, {}, ["https://a.com"]]) expect(isAllowedUrl(bad).ok).toBe(false);
    expect(isAllowedUrl(`https://example.com/${"a".repeat(3000)}`).ok).toBe(false);
  });

  it("un esquema propio de la app se permite solo si se declara", () => {
    expect(isAllowedUrl("myapp://promo/1").ok).toBe(false);
    expect(isAllowedUrl("myapp://promo/1", { extraSchemes: ["myapp"] })).toMatchObject({ ok: true, scheme: "myapp" });
  });

  it("los esquemas peligrosos NO se habilitan aunque la app los declare", () => {
    for (const s of NEVER_SCHEMES) expect(isAllowedUrl(`${s}:x`, { extraSchemes: [s] }).ok).toBe(false);
    expect(DEFAULT_SCHEMES).not.toContain("http");
  });

  it("http solo hacia localhost y solo con allowLocalHttp (desarrollo)", () => {
    expect(isAllowedUrl("http://localhost:3000/x", { allowLocalHttp: true }).ok).toBe(true);
    expect(isAllowedUrl("http://localhost:3000/x").ok).toBe(false);
    expect(isAllowedUrl("http://example.com/x", { allowLocalHttp: true }).ok).toBe(false);
  });
});
