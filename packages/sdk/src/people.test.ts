import { CustomySdkError, collect } from "@customyai/core";
import { describe, expect, it } from "vitest";
import { createCustomy, evaluateContactability, getPlatformRoleType, PEOPLE_SCOPES, ROLE_TYPE_CATALOG } from "./index";

const ISSUER = "https://access.fixture.invalid";
const CRM = "https://crm.fixture.invalid";
const discovery = {
    issuer: ISSUER,
    token_endpoint: `${ISSUER}/oauth/token`,
    products: {
        access: { base_url: "https://access.fixture.invalid", audience: "customy-access" },
        crm: { base_url: `${CRM}/`, audience: "customy-crm" },
    },
};

type Call = { url: string; method: string; headers: Headers; body: unknown };
type Responder = (call: Call) => Response | undefined;

function platform(respond: Responder = () => undefined) {
    const calls: Call[] = [];
    const tokens: URLSearchParams[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        if (url === `${ISSUER}/.well-known/customy-configuration`) return Response.json(discovery);
        if (url === `${ISSUER}/oauth/token`) {
            const form = new URLSearchParams(String(init.body));
            tokens.push(form);
            return Response.json({ access_token: `token-${tokens.length}-${form.get("audience")}`, token_type: "Bearer", expires_in: 300 });
        }
        const call: Call = { url, method: init.method ?? "GET", headers: new Headers(init.headers), body: typeof init.body === "string" ? JSON.parse(init.body) : undefined };
        calls.push(call);
        return respond(call) ?? Response.json({});
    }) as typeof fetch;
    return { calls, tokens, fetchImpl };
}

const credentials = { issuer: ISSUER, clientId: "app_1", clientSecret: "s3cret" };
const person = { id: "per_1", displayName: "Ana", email: "ana@example.com", phone: null, state: "active", roles: [], lastActivityAt: null, createdAt: "2026-09-28T00:00:00.000Z" };

describe("customy.people", () => {
    it("identify valida con el contrato, aplica sus valores por defecto y usa el token M2M de customy-crm con los scopes de Personas", async () => {
        const { calls, tokens, fetchImpl } = platform(() => Response.json({ person, created: true }, { status: 201 }));
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        const result = await customy.people.identify({
            identifiers: [{ type: "email", value: "ana@example.com", verified: true }],
            profile: { displayName: "Ana" },
            roles: [{ roleTypeKey: "app_user", contextKind: "application", contextId: "bonu" }],
        });
        expect(result.created).toBe(true);
        const call = calls[0]!;
        expect(call.url).toBe(`${CRM}/v1/people/identify`);
        expect(call.method).toBe("POST");
        expect(call.headers.get("authorization")).toBe("Bearer token-1-customy-crm");
        expect(call.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
        expect(call.body).toEqual({
            identifiers: [{ type: "email", value: "ana@example.com", verified: true }],
            profile: { displayName: "Ana" },
            roles: [{ roleTypeKey: "app_user", contextKind: "application", contextId: "bonu", status: "active", attributes: {}, source: {} }],
        });
        expect(tokens).toHaveLength(1);
        expect(tokens[0]!.get("audience")).toBe("customy-crm");
        expect(tokens[0]!.get("scope")).toBe(PEOPLE_SCOPES.join(" "));
    });

    it("cachea el token hasta que caduca y respeta audiencia y scopes configurados", async () => {
        const { calls, tokens, fetchImpl } = platform(() => Response.json(person));
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, people: { audience: "customy-crm-people", scopes: ["crm:people.read"] } });
        await customy.people.get("per_1");
        await customy.people.get("per/2");
        expect(tokens).toHaveLength(1);
        expect(tokens[0]!.get("audience")).toBe("customy-crm-people");
        expect(tokens[0]!.get("scope")).toBe("crm:people.read");
        expect(calls.map((call) => call.url)).toEqual([`${CRM}/v1/people/per_1`, `${CRM}/v1/people/per%2F2`]);
        expect(customy.people).toBe(customy.people);
    });

    it("una entrada inválida es SDK_INPUT_INVALID con los issues del contrato, sin tocar la red", async () => {
        const { calls, tokens, fetchImpl } = platform();
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        const failure = await customy.people.identify({ identifiers: [] }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(CustomySdkError);
        expect(failure).toMatchObject({ code: "SDK_INPUT_INVALID", service: "crm", body: { issues: [expect.objectContaining({ path: "identifiers" })] } });
        await expect(customy.people.assignRole("per_1", { roleTypeKey: "Bad Key" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        // @ts-expect-error: campo fuera del contrato (estricto)
        await expect(customy.people.updateRole("per_1", "rol_1", { unknown: true })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(customy.people.endRole("per_1", "rol_1", { endReason: "" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(customy.people.relationships.create({ typeKey: "employee_of", fromPersonId: "per_1" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        // @ts-expect-error: propósito fuera del catálogo
        await expect(customy.people.contactability("per_1", { purpose: "spam", channel: "email" })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(customy.people.setState("per_1", {})).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        await expect(customy.people.get("")).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        expect(calls).toHaveLength(0);
        expect(tokens).toHaveLength(0);
    });

    it("list recorre todas las páginas por cursor; list.page pide una sola con los filtros", async () => {
        const pages: Record<string, unknown> = {
            first: { items: [person, { ...person, id: "per_2" }], nextCursor: "c2" },
            c2: { items: [{ ...person, id: "per_3" }], nextCursor: null },
        };
        const { calls, fetchImpl } = platform((call) => Response.json(pages[new URL(call.url).searchParams.get("cursor") ?? "first"]));
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        const all = await collect(customy.people.list({ role: "app_user", activeWithinDays: 30, limit: 2 }));
        expect(all.map((p) => p.id)).toEqual(["per_1", "per_2", "per_3"]);
        const first = new URL(calls[0]!.url);
        expect(first.pathname).toBe("/v1/people");
        expect(Object.fromEntries(first.searchParams)).toEqual({ role: "app_user", activeWithinDays: "30", limit: "2" });
        expect(new URL(calls[1]!.url).searchParams.get("cursor")).toBe("c2");

        const page = await customy.people.list.page({ cursor: "c2" });
        expect(page).toEqual({ items: [{ ...person, id: "per_3" }], nextCursor: null });
        expect(new URL(calls[2]!.url).searchParams.get("limit")).toBe("50");

        const pageSizes: number[] = [];
        for await (const p of customy.people.list.pages({ limit: 2 })) pageSizes.push(p.items.length);
        expect(pageSizes).toEqual([2, 1]);
        await expect(customy.people.list.page({ limit: 500 })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
    });

    it("roles, identificadores, estado y contactabilidad van a sus rutas con su método", async () => {
        const { calls, fetchImpl } = platform((call) =>
            call.url.endsWith("/identifiers") && call.method === "GET" ? Response.json({ items: [{ id: "idf_1", type: "email", value: "ana@example.com", verified: true, source: null, label: null }] })
            : call.url.includes("/contactability") ? Response.json({ allowed: true, legalBasis: "contract", reasons: ["service_relationship"], windowRules: [] })
            : Response.json({ id: "x" }));
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        await customy.people.assignRole("per_1", { roleTypeKey: "x_mentor", contextKind: "program", contextId: "prg_1" }, { idempotencyKey: "assign-mentor-per_1" });
        await customy.people.updateRole("per_1", "rol_1", { stage: "active" });
        await customy.people.endRole("per_1", "rol_1", { endReason: "program_finished" });
        await customy.people.linkIdentifier("per_1", { type: "phone", value: "+573001234567" });
        const identifiers = await customy.people.listIdentifiers("per_1");
        await customy.people.setState("per_1", { doNotContact: true, reason: "asked by phone" });
        const decision = await customy.people.contactability("per_1", { purpose: "service", channel: "email" });
        expect(identifiers).toHaveLength(1);
        expect(decision.allowed).toBe(true);
        expect(calls.map((call) => `${call.method} ${call.url.replace(CRM, "")}`)).toEqual([
            "POST /v1/people/per_1/roles",
            "PATCH /v1/people/per_1/roles/rol_1",
            "POST /v1/people/per_1/roles/rol_1/end",
            "POST /v1/people/per_1/identifiers",
            "GET /v1/people/per_1/identifiers",
            "PATCH /v1/people/per_1/state",
            "GET /v1/people/per_1/contactability?purpose=service&channel=email",
        ]);
        expect(calls[0]!.headers.get("idempotency-key")).toBe("assign-mentor-per_1");
        expect(calls[0]!.body).toMatchObject({ roleTypeKey: "x_mentor", status: "active" });
        expect(calls[1]!.headers.get("idempotency-key")).toBeNull();
        expect(calls[3]!.body).toEqual({ type: "phone", value: "+573001234567", verified: false });
        expect(calls[5]!.body).toEqual({ doNotContact: true, reason: "asked by phone" });
    });

    it("relaciones, grupos, catálogo de roles y resumen por app", async () => {
        const { calls, fetchImpl } = platform((call) => {
            if (call.method !== "GET") return Response.json({ id: "x" });
            if (call.url.includes("/role-types")) return Response.json({ items: [{ key: "app_user", family: "app_user", label: "App user", defaultLegalBasis: "contract", marketing: "with_consent" }] });
            if (call.url.includes("/applications/users-summary")) return Response.json({ items: [{ applicationKey: "bonu", registered: 10, active1d: 1, active7d: 4, active30d: 8, dormant: 2, withEmail: 9, lastActivityAt: null }] });
            return Response.json({ items: [{ id: "rel_1" }], nextCursor: null });
        });
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl });
        await customy.people.relationships.create({ typeKey: "employee_of", fromPersonId: "per_1", toAccountId: "acc_1", attributes: { title: "CTO" } });
        await collect(customy.people.relationships.list({ personId: "per_1" }));
        await customy.people.relationships.end("rel_1", { endReason: "left_company" });
        await customy.people.groups.create({ kind: "household", name: "Casa Pérez", members: [{ personId: "per_1" }] });
        await customy.people.groups.list.page({ kind: "household" });
        await customy.people.groups.addMembers("grp_1", { members: [{ personId: "per_2", role: "child" }] });
        await expect(customy.people.groups.addMembers("grp_1", { members: [] })).rejects.toMatchObject({ code: "SDK_INPUT_INVALID" });
        const roleTypes = await customy.people.roleTypes.list();
        const summary = await customy.people.applicationsUsersSummary();
        expect(roleTypes[0]?.key).toBe("app_user");
        expect(summary[0]?.active30d).toBe(8);
        expect(calls.map((call) => `${call.method} ${call.url.replace(CRM, "")}`)).toEqual([
            "POST /v1/relationships",
            "GET /v1/relationships?personId=per_1",
            "POST /v1/relationships/rel_1/end",
            "POST /v1/person-groups",
            "GET /v1/person-groups?kind=household",
            "POST /v1/person-groups/grp_1/members",
            "GET /v1/role-types",
            "GET /v1/applications/users-summary",
        ]);
        expect(calls[3]!.body).toEqual({ kind: "household", name: "Casa Pérez", members: [{ personId: "per_1" }] });
    });

    it("los errores del CRM son CustomySdkError con status, código y requestId; los 5xx de un POST con clave se reintentan", async () => {
        let attempts = 0;
        const { fetchImpl } = platform((call) => {
            if (call.url.endsWith("/identify")) {
                attempts += 1;
                return attempts === 1 ? Response.json({ code: "UNAVAILABLE" }, { status: 503 }) : Response.json({ person, created: false });
            }
            return Response.json({ code: "PERSON_NOT_FOUND", message: "not found" }, { status: 404, headers: { "x-request-id": "req_9" } });
        });
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, retry: { baseDelayMs: 1, maxDelayMs: 2 } });
        await expect(customy.people.get("per_404")).rejects.toMatchObject({ status: 404, code: "PERSON_NOT_FOUND", service: "crm", requestId: "req_9" });
        const result = await customy.people.identify({ identifiers: [{ type: "application_user_id", value: "u-1" }] });
        expect(result.created).toBe(false);
        expect(attempts).toBe(2);
    });

    it("sin CRM en el discovery ni people.baseUrl falla con SDK_PRODUCT_NOT_DISCOVERED", async () => {
        const { fetchImpl } = platform();
        const customy = await createCustomy({ ...credentials, fetch: fetchImpl, platform: { ...(await createCustomy({ ...credentials, fetch: fetchImpl })).platform, products: {} } });
        expect(() => customy.people).toThrow(expect.objectContaining({ code: "SDK_PRODUCT_NOT_DISCOVERED" }));
    });
});

describe("catálogo y contactabilidad empaquetados", () => {
    it("exporta el catálogo de roles y la regla pura de contactabilidad", () => {
        expect(ROLE_TYPE_CATALOG.some((role) => role.key === "app_user")).toBe(true);
        expect(getPlatformRoleType("app_user")?.family).toBeDefined();
        const decision = evaluateContactability({
            state: "active", doNotContact: false, isMinor: false, guardianConsent: false, country: "CO",
            purpose: "marketing", channel: "email", roles: [{ roleTypeKey: "app_user", status: "active" }],
            consents: [{ purpose: "marketing", channel: "email", status: "granted" }],
        });
        expect(decision).toMatchObject({ allowed: true, legalBasis: "consent", windowRules: ["co-ley-2300"] });
        expect(evaluateContactability({ state: "deceased", doNotContact: false, isMinor: false, guardianConsent: false, country: null, purpose: "service", channel: "email", roles: [], consents: [] }).reasons).toEqual(["person_deceased"]);
    });
});
