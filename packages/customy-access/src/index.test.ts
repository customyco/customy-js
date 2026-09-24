import { describe, expect, it, vi } from "vitest";
import { CustomyAccess } from "./index";

describe("CustomyAccess auth client", () => {
    it("requests the explicit product audience without adding scopes or changing credentials", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "fixture", token_type: "Bearer", expires_in: 3600, scope: "application.content.read_published" }));
        const client = new CustomyAccess({ baseUrl: "https://access-api.example.test", fetch: fetchMock, retries: 0 });
        await client.m2m.getToken({ clientId: "key_123", clientSecret: "fixture-secret", scopes: ["application.content.read_published"], audience: "customy-content" });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ client_id: "key_123", client_secret: "fixture-secret", grant_type: "client_credentials", scope: "application.content.read_published", audience: "customy-content" });
    });
    it("exchanges machine credentials at the registered global endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "fixture", token_type: "Bearer", expires_in: 3600, scope: "application.connection.read" }));
        const client = new CustomyAccess({ baseUrl: "https://access-api.example.test", fetch: fetchMock, retries: 0 });
        await client.m2m.getToken({ clientId: "key_123", clientSecret: "fixture-secret", scopes: ["application.connection.read"] });
        expect(String(fetchMock.mock.calls[0][0])).toBe("https://access-api.example.test/api/v1/oauth/token");
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ client_id: "key_123", client_secret: "fixture-secret", grant_type: "client_credentials", scope: "application.connection.read" });
    });
    it("pide el token de máquina firmado al token endpoint OIDC con audiencia obligatoria", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "jwt", token_type: "Bearer", expires_in: 900, scope: "data:write" }));
        const client = new CustomyAccess({ baseUrl: "https://access-api.example.test", fetch: fetchMock, retries: 0 });
        await client.m2m.getMachineToken({ clientId: "key_123", clientSecret: "fixture-secret", audience: "customy-data", scopes: ["data:write"] });
        expect(String(fetchMock.mock.calls[0][0])).toBe("https://access-api.example.test/oauth/token");
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ grant_type: "client_credentials", client_id: "key_123", client_secret: "fixture-secret", audience: "customy-data", scope: "data:write" });
        await expect(client.m2m.getMachineToken({ clientId: "key_123", clientSecret: "fixture-secret", audience: "" })).rejects.toThrow("CUSTOMY_MACHINE_TOKEN_AUDIENCE_REQUIRED");
    });
    it("cambia el token de una app por uno delegado para otro producto (RFC 8693)", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "jwt", issued_token_type: "urn:ietf:params:oauth:token-type:access_token", token_type: "Bearer", expires_in: 600, scope: "links:write" }));
        const client = new CustomyAccess({ baseUrl: "https://access-api.example.test", fetch: fetchMock, retries: 0 });
        await client.m2m.exchangeToken({ clientId: "key_forms", clientSecret: "fixture-secret", subjectToken: "app.jwt", audience: "customy-links", scopes: ["links:write"] });
        expect(String(fetchMock.mock.calls[0][0])).toBe("https://access-api.example.test/oauth/token");
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", client_id: "key_forms", client_secret: "fixture-secret",
            subject_token: "app.jwt", subject_token_type: "urn:ietf:params:oauth:token-type:access_token", audience: "customy-links", scope: "links:write",
        });
        await expect(client.m2m.exchangeToken({ clientId: "k", clientSecret: "s", subjectToken: "", audience: "customy-links", scopes: [] })).rejects.toThrow("CUSTOMY_SUBJECT_TOKEN_REQUIRED");
    });
    it("gestiona API keys e introspección en las rutas que expone el servidor", async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/introspect")
            ? Response.json({ valid: true, environmentId: "env_1", scopes: ["a", "b"], expiresAt: "2026-01-01T00:00:00.000Z", allowedAudiences: ["customy-data"] })
            : Response.json([]));
        const client = new CustomyAccess({ baseUrl: "https://access-api.example.test", fetch: fetchMock, retries: 0 });
        await client.m2m.listApiKeys("env_1");
        await client.m2m.revokeApiKey("env_1", "key_9");
        const introspection = await client.m2m.introspect("env_1", "opaque");
        expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
            "https://access-api.example.test/api/admin/env/env_1/api-keys",
            "https://access-api.example.test/api/admin/env/env_1/api-keys/key_9",
            "https://access-api.example.test/api/v1/m2m/token/introspect",
        ]);
        expect(introspection).toEqual({ active: true, environmentId: "env_1", scope: "a b", exp: 1767225600, audiences: ["customy-data"] });
    });
    it("forwards a server-side session as a Better Auth cookie", async () => {
        const calls: RequestInit[] = [];
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            calls.push(init ?? {});
            return new Response(JSON.stringify({
                user: { id: "user_1" },
                session: { id: "session_1" },
            }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });
        const client = new CustomyAccess({
            baseUrl: "https://access-api.example.test",
            fetch: fetchMock as typeof fetch,
            retries: 0,
        });

        await client.auth.getSession("session-token.with-signature");

        expect(fetchMock).toHaveBeenCalledOnce();
        const headers = new Headers(calls[0]?.headers);
        expect(headers.get("authorization")).toBe("Bearer session-token.with-signature");
        expect(headers.get("cookie")).toBe("customy.session_token=session-token.with-signature");
    });
});
