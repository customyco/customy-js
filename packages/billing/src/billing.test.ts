import { createMachineTokens, CustomySdkError } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { createBilling, CustomyBillingError } from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function scripted(replies: Array<Response | Error>) {
    const calls: Call[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: typeof init?.body === "string" ? init.body : undefined });
        const next = replies.shift();
        if (!next) throw new Error("sin respuesta preparada");
        if (next instanceof Error) throw next;
        return next;
    }) as typeof globalThis.fetch;
    return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const ISSUER = "https://access.fixture.invalid";
const BASE = "https://billing.fixture.invalid";

describe("@customyai/billing", () => {
    it("pide por defecto solo billing:usage:report con audiencia customy-billing", async () => {
        const { fetch, calls } = scripted([
            json(200, { access_token: "tok", expires_in: 300 }),
            json(200, { accepted: 1, events: [{ meter: "coach.runs", idempotencyKey: "run-1", id: "use_1", deduplicated: false }] }),
        ]);
        const machineTokens = createMachineTokens({ issuer: ISSUER, clientId: "app", clientSecret: "secret", fetch });
        const billing = createBilling<"coach.runs">({ baseUrl: BASE, machineTokens, fetch });
        const report = await billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: "run-1", occurredAt: new Date("2026-09-27T10:00:00Z") }]);
        expect(report.accepted).toBe(1);
        const form = new URLSearchParams(calls[0]!.body);
        expect(form.get("audience")).toBe("customy-billing");
        expect(form.get("scope")).toBe("billing:usage:report");
        expect(calls[1]!.url).toBe(`${BASE}/v1/apps/usage`);
        expect(JSON.parse(calls[1]!.body!)).toEqual({ events: [{ meter: "coach.runs", quantity: 1, idempotencyKey: "run-1", occurredAt: "2026-09-27T10:00:00.000Z" }] });
    });

    it("reintenta el lote ante 503 con la misma clave de lote", async () => {
        const { fetch, calls } = scripted([
            json(503, { error: "SERVICE_UNAVAILABLE", message: "later" }, { "retry-after": "0" }),
            json(200, { accepted: 2, events: [] }),
        ]);
        const billing = createBilling({ baseUrl: BASE, accessToken: "tok", fetch, retry: { baseDelayMs: 1, maxDelayMs: 1 } });
        await billing.usage.report([
            { meter: "a", quantity: 1, idempotencyKey: "k2" },
            { meter: "a", quantity: 2, idempotencyKey: "k1" },
        ]);
        expect(calls).toHaveLength(2);
        expect(calls[0]!.headers["idempotency-key"]).toMatch(/^usage-[0-9a-f]{64}$/);
        expect(calls[1]!.headers["idempotency-key"]).toBe(calls[0]!.headers["idempotency-key"]);
    });

    it("errores de la API como CustomyBillingError y validación local antes de llamar", async () => {
        const { fetch, calls } = scripted([json(403, { error: "INSUFFICIENT_SCOPE", message: "The token lacks the billing:usage:report scope" })]);
        const billing = createBilling({ baseUrl: BASE, accessToken: "tok", fetch });
        const error = await billing.usage.report([{ meter: "a", quantity: 1, idempotencyKey: "k" }]).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CustomyBillingError);
        expect(error).toBeInstanceOf(CustomySdkError);
        expect(error).toMatchObject({ code: "INSUFFICIENT_SCOPE", status: 403, service: "billing" });

        await expect(billing.usage.report([])).rejects.toMatchObject({ code: "SDK_USAGE_INVALID" });
        await expect(billing.usage.report([{ meter: "a", quantity: 1, idempotencyKey: "x" }, { meter: "a", quantity: 1, idempotencyKey: "x" }])).rejects.toMatchObject({ code: "SDK_USAGE_INVALID" });
        await expect(billing.usage.report([{ meter: "a", quantity: Number.NaN, idempotencyKey: "y" }])).rejects.toMatchObject({ code: "SDK_USAGE_INVALID" });
        expect(calls).toHaveLength(1);
    });
});

describe("plazo por llamada", () => {
    it("report acepta timeoutMs y corta aunque el cliente espere más", async () => {
        const fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof globalThis.fetch;
        const billing = createBilling({ baseUrl: BASE, accessToken: "tok", fetch, timeoutMs: 60_000, retry: false });
        await expect(billing.usage.report([{ meter: "m", quantity: 1, idempotencyKey: "k" }], { timeoutMs: 5 })).rejects.toMatchObject({ code: "SDK_TIMEOUT" });
    });
});
