import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
    cookies: [{ name: "__Secure-customy-prd.session_token", value: "abc" }] as Array<{ name: string; value: string }>,
    set: vi.fn(),
}));

vi.mock("next/headers", () => ({
    cookies: async () => ({ getAll: () => store.cookies, set: store.set }),
}));

import { getServerSession } from "./nextjs";

afterEach(() => {
    vi.unstubAllGlobals();
    store.set.mockReset();
});

function sessionWithRenewal(): Response {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "__Secure-customy-prd.session_token=renewed; Domain=.fixture.invalid; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None");
    return new Response(JSON.stringify({ user: { id: "user_1" }, session: { id: "ses_1", userId: "user_1" } }), { status: 200, headers });
}

describe("getServerSession (shim de Next.js)", () => {
    it("aplica sola la renovación de Access con cookies().set, como cookie de host", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => sessionWithRenewal()));
        const session = await getServerSession({ accessUrl: "https://access.fixture.invalid" });
        expect(session?.user.id).toBe("user_1");
        expect(store.set).toHaveBeenCalledExactlyOnceWith({
            name: "__Secure-customy-prd.session_token",
            value: "renewed",
            path: "/",
            maxAge: 600,
            httpOnly: true,
            secure: true,
            sameSite: "lax",
        });
    });

    it("en un Server Component (set lanza) devuelve la sesión igual", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => sessionWithRenewal()));
        store.set.mockImplementation(() => { throw new Error("Cookies can only be modified in a Server Action or Route Handler"); });
        expect((await getServerSession({ accessUrl: "https://access.fixture.invalid" }))?.user.id).toBe("user_1");
    });
});
