/**
 * Personas y roles de Customy CRM (docs/CUSTOMY_PEOPLE_ROLES_MODEL.md).
 *
 * Una persona por tenant con roles por contexto y vigencia, identificadores,
 * relaciones en par, grupos y contactabilidad por propósito. Las entradas se
 * validan con los esquemas del contrato (`@customy/contracts/people`,
 * empaquetados en el build) antes de tocar la red; transporte, reintentos,
 * idempotencia y tokens de máquina son los de `@customyai/core`.
 *
 * Credencial: token M2M de Access con audiencia `customy-crm` y scopes
 * `crm:people.read` / `crm:people.write`, limitado al tenant de la app.
 */
import {
    CustomySdkError,
    connectProduct,
    paginate,
    paginatePages,
    type PaginateOptions,
    type ProductClientOptions,
    type Query,
    type RequestOptions,
} from "@customyai/core";
import {
    AssignPersonRoleInputSchema,
    CreatePersonGroupInputSchema,
    CreateRelationshipInputSchema,
    EndPersonRoleInputSchema,
    IdentifyPersonInputSchema,
    MessagePurposeSchema,
    PeopleListQuerySchema,
    PersonIdentifierInputSchema,
    PersonStateSchema,
    UpdatePersonRoleInputSchema,
    type ApplicationUsersSummary,
    type ContactabilityDecision,
    type LegalBasis,
    type MessagePurpose,
    type PersonGroupKind,
    type PersonIdentifierType,
    type PersonRoleContextKind,
    type PersonRoleFamily,
    type PersonRoleView,
    type PersonState,
    type PersonSummaryView,
    type RoleMarketingPolicy,
    type RolePack,
    type LocalizedLabel,
} from "./vendor/people";
import type { z, ZodTypeAny } from "zod";

/** Audiencia de Access del CRM. */
export const PEOPLE_AUDIENCE = "customy-crm";
/** Scopes M2M de Personas: `crm:people.read` (leer) y `crm:people.write` (identificar, roles, relaciones…). */
export const PEOPLE_SCOPES = ["crm:people.read", "crm:people.write"] as const;
export type PeopleScope = (typeof PEOPLE_SCOPES)[number];

// ─── Entradas (forma de entrada del contrato: los valores por defecto son opcionales) ───

export type IdentifyPersonParams = z.input<typeof IdentifyPersonInputSchema>;
export type AssignPersonRoleParams = z.input<typeof AssignPersonRoleInputSchema>;
export type UpdatePersonRoleParams = z.input<typeof UpdatePersonRoleInputSchema>;
export type EndPersonRoleParams = z.input<typeof EndPersonRoleInputSchema>;
export type LinkPersonIdentifierParams = z.input<typeof PersonIdentifierInputSchema>;
export type CreateRelationshipParams = z.input<typeof CreateRelationshipInputSchema>;
export type CreatePersonGroupParams = z.input<typeof CreatePersonGroupInputSchema>;
export type ListPeopleParams = Omit<z.input<typeof PeopleListQuerySchema>, "activeWithinDays" | "inactiveForDays" | "limit"> & {
    activeWithinDays?: number;
    inactiveForDays?: number;
    limit?: number;
};
export type SetPersonStateParams = Readonly<{
    /** Estado especial (`deceased`, `erased`, `fraud_suspended`) o `active`. */
    state?: PersonState;
    /** «No contactar»: bloquea todo propósito salvo el transaccional. */
    doNotContact?: boolean;
    /** Motivo auditable del cambio. */
    reason?: string;
}>;
export type ContactabilityParams = Readonly<{ purpose: MessagePurpose; channel: string }>;
export type ListRelationshipsParams = Readonly<{ personId?: string; accountId?: string; typeKey?: string; includeEnded?: boolean; limit?: number; cursor?: string }>;
export type EndRelationshipParams = Readonly<{ endReason?: string; validTo?: string }>;
export type ListPersonGroupsParams = Readonly<{ kind?: PersonGroupKind; personId?: string; limit?: number; cursor?: string }>;
export type AddPersonGroupMembersParams = Readonly<{ members: ReadonlyArray<Readonly<{ personId: string; role?: string }>> }>;

// ─── Vistas ───

/** Página de una lista del CRM. */
export type PeoplePage<T> = Readonly<{ items: readonly T[]; nextCursor: string | null }>;

export type PersonIdentifierView = Readonly<{
    id: string;
    type: PersonIdentifierType;
    value: string;
    verified: boolean;
    source: string | null;
    label: string | null;
    createdAt?: string;
}>;

export type RelationshipView = Readonly<{
    id: string;
    typeKey: string;
    label?: string;
    fromPersonId: string;
    toPersonId: string | null;
    toAccountId: string | null;
    validFrom: string;
    validTo: string | null;
    endReason?: string | null;
    attributes: Record<string, unknown>;
}>;

export type PersonGroupView = Readonly<{
    id: string;
    kind: PersonGroupKind;
    name: string;
    opportunityId: string | null;
    accountId: string | null;
    members?: ReadonlyArray<Readonly<{ personId: string; role: string | null }>>;
    createdAt?: string;
}>;

/** Ficha 360: persona, roles vigentes e historial, relaciones, grupos, identificadores y contactabilidad por propósito. */
export type PersonDetailView = Omit<PersonSummaryView, "roles"> & Readonly<{
    roles: readonly PersonRoleView[];
    roleHistory?: readonly PersonRoleView[];
    doNotContact?: boolean;
    relationships?: readonly RelationshipView[];
    groups?: readonly PersonGroupView[];
    identifiers?: readonly PersonIdentifierView[];
    contactability?: Readonly<Partial<Record<MessagePurpose, ContactabilityDecision>>>;
}>;

/** Resultado de `identify`: la persona y si se creó en esta llamada. */
export type IdentifyPersonResult = Readonly<{
    person: PersonDetailView;
    created: boolean;
    /** Roles asignados o reutilizados por la llamada. */
    roles?: readonly PersonRoleView[];
}>;

/** Tipo de rol del catálogo efectivo del tenant (plataforma por paquetes + propios `x_…`). */
export type RoleTypeView = Readonly<{
    key: string;
    family: PersonRoleFamily;
    label: LocalizedLabel | string;
    pack?: RolePack;
    contextKinds?: readonly PersonRoleContextKind[];
    stages?: readonly string[];
    defaultLegalBasis: LegalBasis;
    marketing: RoleMarketingPolicy;
    tenant?: boolean;
    [extra: string]: unknown;
}>;

export type ContactabilityView = ContactabilityDecision & Readonly<{ purpose?: MessagePurpose; channel?: string }>;

export type PeopleOptions = ProductClientOptions;

const enc = encodeURIComponent;
type Method = "GET" | "POST" | "PATCH";

/** Valida con el esquema del contrato; un fallo es `SDK_INPUT_INVALID` sin tocar la red. */
export function validateInput<S extends ZodTypeAny>(schema: S, input: unknown, service = "crm"): z.output<S> {
    const parsed = schema.safeParse(input);
    if (parsed.success) return parsed.data;
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }));
    throw new CustomySdkError({
        code: "SDK_INPUT_INVALID",
        service,
        message: `Invalid input: ${issues.map((issue) => `${issue.path || "(root)"} ${issue.message}`).join("; ")}`,
        body: { issues },
    });
}

function requireId(value: unknown, name: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 128) {
        throw new CustomySdkError({ code: "SDK_INPUT_INVALID", service: "crm", message: `Invalid input: ${name} must be a non-empty id`, body: { issues: [{ path: name, code: "invalid_string", message: "Required id" }] } });
    }
    return value;
}

/** Las listas del CRM devuelven `{ items, nextCursor }`; se acepta `data` por compatibilidad. */
function toPage<T>(body: unknown): PeoplePage<T> {
    const record = (body ?? {}) as { items?: unknown; data?: unknown; nextCursor?: unknown };
    const items = Array.isArray(body) ? body : Array.isArray(record.items) ? record.items : Array.isArray(record.data) ? record.data : null;
    if (!items) throw new CustomySdkError({ code: "SDK_RESPONSE_INVALID", service: "crm", message: "Expected a page ({ items, nextCursor })", body });
    return { items: items as T[], nextCursor: typeof record.nextCursor === "string" && record.nextCursor.length > 0 ? record.nextCursor : null };
}

const PEOPLE_STATE_SCHEMA_KEYS = new Set(["state", "doNotContact", "reason"]);

function validateState(input: SetPersonStateParams): SetPersonStateParams {
    const issues: Array<{ path: string; code: string; message: string }> = [];
    if (!input || typeof input !== "object") issues.push({ path: "", code: "invalid_type", message: "Expected object" });
    else {
        for (const key of Object.keys(input)) if (!PEOPLE_STATE_SCHEMA_KEYS.has(key)) issues.push({ path: key, code: "unrecognized_keys", message: "Unrecognized key" });
        if (input.state !== undefined && !PersonStateSchema.safeParse(input.state).success) issues.push({ path: "state", code: "invalid_enum_value", message: "Invalid state" });
        if (input.doNotContact !== undefined && typeof input.doNotContact !== "boolean") issues.push({ path: "doNotContact", code: "invalid_type", message: "Expected boolean" });
        if (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 500)) issues.push({ path: "reason", code: "invalid_string", message: "Expected string (max 500)" });
        if (input.state === undefined && input.doNotContact === undefined) issues.push({ path: "", code: "custom", message: "state or doNotContact is required" });
    }
    if (issues.length) throw new CustomySdkError({ code: "SDK_INPUT_INVALID", service: "crm", message: `Invalid input: ${issues.map((i) => `${i.path || "(root)"} ${i.message}`).join("; ")}`, body: { issues } });
    return input;
}

export type CustomyPeople = ReturnType<typeof createPeople>;

/**
 * Cliente de Personas del CRM.
 *
 * ```ts
 * const people = createPeople({ platform, machineTokens });
 * const { person } = await people.identify({
 *   identifiers: [{ type: "email", value: "ana@example.com", verified: true }],
 *   roles: [{ roleTypeKey: "app_user", contextKind: "application", contextId: "bonu" }],
 * });
 * for await (const p of people.list({ role: "app_user", activeWithinDays: 30 })) { … }
 * ```
 */
export function createPeople(options: PeopleOptions) {
    const { transport, baseUrl } = connectProduct(options, { key: "crm", audience: PEOPLE_AUDIENCE, defaultScopes: PEOPLE_SCOPES });

    const call = async <T>(method: Method, path: string, request: RequestOptions = {}): Promise<T> => (await transport.request<T>(method, path, request)).data;
    // Los POST que crean se reintentan solo con clave de idempotencia (el CRM deduplica por ella).
    const write = <T>(method: "POST" | "PATCH", path: string, body: unknown, idempotencyKey?: string) =>
        call<T>(method, path, { body, idempotencyKey: idempotencyKey ?? (method === "POST" ? true : undefined) });

    const listPage = async (params: ListPeopleParams = {}, signal?: AbortSignal): Promise<PeoplePage<PersonSummaryView>> => {
        const query = validateInput(PeopleListQuerySchema, params);
        return toPage<PersonSummaryView>(await call("GET", "/v1/people", { query: query as Query, signal }));
    };

    const relationshipsPage = async (params: ListRelationshipsParams = {}, signal?: AbortSignal) =>
        toPage<RelationshipView>(await call("GET", "/v1/relationships", { query: params as Query, signal }));
    const groupsPage = async (params: ListPersonGroupsParams = {}, signal?: AbortSignal) =>
        toPage<PersonGroupView>(await call("GET", "/v1/person-groups", { query: params as Query, signal }));

    type WriteOptions = Readonly<{ idempotencyKey?: string }>;

    return {
        baseUrl,

        /** Identifica o crea una persona por sus identificadores, con roles opcionales. */
        identify: async (input: IdentifyPersonParams, opts: WriteOptions = {}) =>
            write<IdentifyPersonResult>("POST", "/v1/people/identify", validateInput(IdentifyPersonInputSchema, input), opts.idempotencyKey),

        /** Ficha 360 de una persona. */
        get: async (personId: string) => call<PersonDetailView>("GET", `/v1/people/${enc(requireId(personId, "personId"))}`),

        /**
         * Recorre todas las personas del filtro (async iterator sobre páginas por cursor).
         * `list.page(params)` pide una sola página; `list.pages(params)` recorre página a página.
         */
        list: Object.assign(
            (params: Omit<ListPeopleParams, "cursor"> = {}, iteration: PaginateOptions = {}) =>
                paginate<PersonSummaryView>((cursor, signal) => listPage({ ...params, cursor }, signal), iteration),
            {
                page: (params: ListPeopleParams = {}) => listPage(params),
                pages: (params: Omit<ListPeopleParams, "cursor"> = {}, iteration: PaginateOptions = {}) =>
                    paginatePages<PersonSummaryView>((cursor, signal) => listPage({ ...params, cursor }, signal), iteration),
            },
        ),

        assignRole: async (personId: string, input: AssignPersonRoleParams, opts: WriteOptions = {}) =>
            write<PersonRoleView>("POST", `/v1/people/${enc(requireId(personId, "personId"))}/roles`, validateInput(AssignPersonRoleInputSchema, input), opts.idempotencyKey),

        updateRole: async (personId: string, roleId: string, input: UpdatePersonRoleParams) =>
            write<PersonRoleView>("PATCH", `/v1/people/${enc(requireId(personId, "personId"))}/roles/${enc(requireId(roleId, "roleId"))}`, validateInput(UpdatePersonRoleInputSchema, input)),

        endRole: async (personId: string, roleId: string, input: EndPersonRoleParams, opts: WriteOptions = {}) =>
            write<PersonRoleView>("POST", `/v1/people/${enc(requireId(personId, "personId"))}/roles/${enc(requireId(roleId, "roleId"))}/end`, validateInput(EndPersonRoleInputSchema, input), opts.idempotencyKey),

        linkIdentifier: async (personId: string, input: LinkPersonIdentifierParams, opts: WriteOptions = {}) =>
            write<PersonIdentifierView>("POST", `/v1/people/${enc(requireId(personId, "personId"))}/identifiers`, validateInput(PersonIdentifierInputSchema, input), opts.idempotencyKey),

        listIdentifiers: async (personId: string) =>
            toPage<PersonIdentifierView>(await call("GET", `/v1/people/${enc(requireId(personId, "personId"))}/identifiers`)).items,

        /** Estado especial y «no contactar». */
        setState: async (personId: string, input: SetPersonStateParams) =>
            write<PersonDetailView>("PATCH", `/v1/people/${enc(requireId(personId, "personId"))}/state`, validateState(input)),

        /** Decisión explicada: si se puede contactar a la persona para un propósito y canal, con qué base legal y por qué. */
        contactability: async (personId: string, params: ContactabilityParams) => {
            const purpose = validateInput(MessagePurposeSchema, params?.purpose);
            if (typeof params.channel !== "string" || params.channel.length === 0 || params.channel.length > 64) {
                throw new CustomySdkError({ code: "SDK_INPUT_INVALID", service: "crm", message: "Invalid input: channel is required", body: { issues: [{ path: "channel", code: "invalid_string", message: "Required" }] } });
            }
            return call<ContactabilityView>("GET", `/v1/people/${enc(requireId(personId, "personId"))}/contactability`, { query: { purpose, channel: params.channel } });
        },

        relationships: {
            create: async (input: CreateRelationshipParams, opts: WriteOptions = {}) =>
                write<RelationshipView>("POST", "/v1/relationships", validateInput(CreateRelationshipInputSchema, input), opts.idempotencyKey),
            list: Object.assign(
                (params: Omit<ListRelationshipsParams, "cursor"> = {}, iteration: PaginateOptions = {}) =>
                    paginate<RelationshipView>((cursor, signal) => relationshipsPage({ ...params, cursor }, signal), iteration),
                { page: (params: ListRelationshipsParams = {}) => relationshipsPage(params) },
            ),
            end: async (relationshipId: string, input: EndRelationshipParams = {}, opts: WriteOptions = {}) =>
                write<RelationshipView>("POST", `/v1/relationships/${enc(requireId(relationshipId, "relationshipId"))}/end`, input, opts.idempotencyKey),
        },

        groups: {
            create: async (input: CreatePersonGroupParams, opts: WriteOptions = {}) =>
                write<PersonGroupView>("POST", "/v1/person-groups", validateInput(CreatePersonGroupInputSchema, input), opts.idempotencyKey),
            list: Object.assign(
                (params: Omit<ListPersonGroupsParams, "cursor"> = {}, iteration: PaginateOptions = {}) =>
                    paginate<PersonGroupView>((cursor, signal) => groupsPage({ ...params, cursor }, signal), iteration),
                { page: (params: ListPersonGroupsParams = {}) => groupsPage(params) },
            ),
            addMembers: async (groupId: string, input: AddPersonGroupMembersParams, opts: WriteOptions = {}) => {
                const { members } = validateInput(CreatePersonGroupInputSchema.pick({ members: true }).required(), input);
                if (members.length === 0) {
                    throw new CustomySdkError({ code: "SDK_INPUT_INVALID", service: "crm", message: "Invalid input: members must not be empty", body: { issues: [{ path: "members", code: "too_small", message: "At least one member" }] } });
                }
                return write<PersonGroupView>("POST", `/v1/person-groups/${enc(requireId(groupId, "groupId"))}/members`, { members }, opts.idempotencyKey);
            },
        },

        roleTypes: {
            /** Catálogo efectivo del tenant: tipos de plataforma de los paquetes activos más los propios `x_…`. */
            list: async () => toPage<RoleTypeView>(await call("GET", "/v1/role-types")).items,
        },

        /** Registrados, activos 1/7/30 d, dormidos y con email, por app conectada. */
        applicationsUsersSummary: async () => toPage<ApplicationUsersSummary>(await call("GET", "/v1/applications/users-summary")).items,
    };
}
