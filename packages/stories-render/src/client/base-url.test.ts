import { describe, expect, it } from "vitest";
import { assertSecureBaseUrl } from "./base-url";
import { createStoriesClient } from "./stories-client";

describe("baseUrl segura", () => {
  it("admite https y http solo hacia la máquina de desarrollo", () => {
    for (const u of [undefined, "https://send-api.customy.ai", "https://staging.example.com/api", "http://localhost:4165", "http://127.0.0.1:4165", "http://10.0.2.2:4165", "http://[::1]:4165"]) expect(() => assertSecureBaseUrl(u), String(u)).not.toThrow();
  });
  it("rechaza http a otros hosts, otros esquemas, credenciales y basura", () => {
    for (const u of ["http://send-api.customy.ai", "http://192.168.1.10:4165", "http://localhost.evil.example", "ftp://x.example", "javascript:alert(1)", "https://u:p@send-api.customy.ai", "send-api.customy.ai", ""]) expect(() => assertSecureBaseUrl(u), u).toThrowError(/baseUrl/);
  });
  it("createStoriesClient lo exige antes de crear nada", () => {
    expect(() => createStoriesClient({ token: async () => "sst_x", baseUrl: "http://evil.example" })).toThrowError(/baseUrl/);
  });
});
