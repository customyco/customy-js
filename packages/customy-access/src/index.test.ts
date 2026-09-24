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
