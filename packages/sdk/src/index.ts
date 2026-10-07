/**
 * @customyai/sdk — el ecosistema Customy con una sola identidad de app.
 *
 * `createCustomy()` compone los SDK de cada servicio sobre `@customyai/core`:
 * lee el discovery del entorno (`/.well-known/customy-configuration`), crea un
 * almacén de tokens de máquina (uno perezoso y cacheado por audiencia) y
 * entrega Access, Data, Send, Billing y Links ya apuntando a su URL, más
 * `product(clave)` para cualquier otro producto del discovery. No añade
 * transporte, reintentos ni errores propios: son los de cada paquete.
 *
 * ```ts
 * import { createCustomy } from "@customyai/sdk";
 *
 * const customy = await createCustomy({
 *   issuer: process.env.CUSTOMY_ISSUER!,
 *   clientId: process.env.CUSTOMY_CLIENT_ID!,
 *   clientSecret: process.env.CUSTOMY_CLIENT_SECRET!,
 * });
 * await customy.send.emails.send({ templateId: "welcome", to: "ana@example.com", variables: { name: "Ana" } });
 * await customy.billing.usage.report([{ meter: "coach.runs", quantity: 1, idempotencyKey: "run-1" }]);
 * await customy.product("crm").get("/v1/contacts");
 * const { person } = await customy.people.identify({ identifiers: [{ type: "email", value: "ana@example.com" }] });
 * ```
 *
 * Solo servidor: lleva el secreto de la app. Un bundle de navegador no lo
 * resuelve (condición `browser: null`); allí van `@customyai/client` y
 * `@customyai/data` con write key.
 */
import {
    connectProduct,
    createMachineTokens,
    discoverApplication,
    discoverPlatform,
    CustomySdkError,
    type CustomyApplication,
    type CustomyPlatformConfiguration,
    type MachineTokenProvider,
    type MachineTokens,
    type ProductClientOptions,
    type RetryPolicy,
    type Transport,
} from "@customyai/core";
import { createAccess, createPermissionDirectory, type CapabilityCheck, type CustomyAccess, type PermissionDirectory, type PermissionDirectoryOptions } from "@customyai/access";
import { createBilling, type CustomyBilling } from "@customyai/billing";
import { createData, type CustomyData, type DataOptions, type EventMap } from "@customyai/data";
import { createLinks, type CustomyLinks } from "@customyai/links";
import { createSend, type CustomySend } from "@customyai/send";
import { createPeople, PEOPLE_AUDIENCE, PEOPLE_SCOPES, type CustomyPeople } from "./people";
import { createConnectedApp, type ConnectedAppOptions, type CustomyConnectedApp } from "./apps";
import { readCustomyEnvironment, runtimeEnvironment, type CustomyEnvironmentSource } from "./environment";

/** Tipos de la app (los de `customy apps codegen`): eventos, meters y capabilities declarados. */
export type CustomyAppTypes = {
    events?: EventMap;
    meters?: string;
    capabilities?: string;
    /** Valor que devuelve cada capability (`CustomyCapabilityValues` de `customy apps codegen`); opcional. */
    capabilityValues?: Readonly<Record<string, unknown>>;
    /** Claves de rol del manifiesto (`CustomyRole`). */
    roles?: string;
    /** Permisos del manifiesto (`CustomyPermission`). */
    permissions?: string;
};

type EventsOf<App extends CustomyAppTypes> = App["events"] extends EventMap ? App["events"] : EventMap;
type MetersOf<App extends CustomyAppTypes> = App["meters"] extends string ? App["meters"] : string;
type CapabilitiesOf<App extends CustomyAppTypes> = App["capabilities"] extends string ? App["capabilities"] : string;
export type CapabilityValuesOf<App extends CustomyAppTypes> = App["capabilityValues"] extends Readonly<Record<string, unknown>> ? App["capabilityValues"] : Record<string, unknown>;
type RolesOf<App extends CustomyAppTypes> = App["roles"] extends string ? App["roles"] : string;
type PermissionsOf<App extends CustomyAppTypes> = App["permissions"] extends string ? App["permissions"] : string;

/**
 * Lo que `createCustomy` lee del manifiesto de la app (`customy.app.json`):
 * los productos que usa y sus scopes. Pasa el JSON tal cual.
 */
export type CustomyAppManifestScopes = Readonly<{
    products?: ReadonlyArray<Readonly<{ product: string; scopes?: readonly string[] }>>;
}>;

/**
 * Scopes por clave de producto del discovery a partir del manifiesto. Cada
 * entrada del manifiesto nombra el producto por su audiencia
 * (`customy-send`) o por su clave (`send`); una que no está en el discovery
 * se ignora. Sin scopes declarados, el producto no se incluye.
 */
export function scopesFromManifest(manifest: CustomyAppManifestScopes | undefined, platform: CustomyPlatformConfiguration): Record<string, readonly string[]> {
    const result: Record<string, readonly string[]> = {};
    for (const entry of manifest?.products ?? []) {
        if (!entry || typeof entry.product !== "string" || !Array.isArray(entry.scopes) || entry.scopes.length === 0) continue;
        const key = Object.entries(platform.products).find(([name, product]) => product.audience === entry.product || name === entry.product || `customy-${name}` === entry.product)?.[0];
        if (!key) continue;
        result[key] = [...new Set([...(result[key] ?? []), ...entry.scopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0)])];
    }
    return result;
}

/** Opciones de Data que no son de conexión (cola, redacción, `beforeSend`, `onError`…). */
export type CustomyDataSettings = Omit<DataOptions, keyof ProductClientOptions | "writeKey">;

export type CreateCustomyOptions = Readonly<{
    /** Issuer de Customy Access del entorno. Sin él se usa `CUSTOMY_ACCESS_URL` y, si no existe, `CUSTOMY_ISSUER`. */
    issuer?: string;
    clientId: string;
    clientSecret: string;
    /**
     * Scopes por clave de producto del discovery (`send`, `crm`…). Mandan sobre
     * los del manifiesto. Sin entrada ni manifiesto: los de cada paquete
     * (Access pide en cada método el scope que necesita).
     */
    scopes?: Readonly<Partial<Record<string, readonly string[]>>>;
    /** Manifiesto de la app (`customy.app.json`): de él salen los scopes de cada producto que no estén en `scopes`. */
    manifest?: CustomyAppManifestScopes;
    /** Discovery ya leído: evita pedirlo otra vez. */
    platform?: CustomyPlatformConfiguration;
    fetch?: typeof fetch;
    /** Límite por intento, en ms, de todas las llamadas. */
    timeoutMs?: number;
    /** Política de reintentos de todas las llamadas; `false` los desactiva. */
    retry?: RetryPolicy | false;
    /** Entorno por defecto de las llamadas de Access que lo necesitan. Con `discoverApplication`, sale del cliente de máquina y no hace falta. */
    environmentId?: string;
    /**
     * Variables de arranque (`CUSTOMY_ACCESS_URL`, `CUSTOMY_WORKSPACE_ENVIRONMENT_ID`, `CUSTOMY_PROJECT_ID`, `CUSTOMY_ISSUER`).
     * Por defecto `process.env`; `{}` las ignora. Una opción explícita manda sobre la variable y la variable sobre lo descubierto.
     */
    env?: CustomyEnvironmentSource;
    /**
     * Descubre la organización, el entorno y la aplicación de Access del propio cliente de máquina al crear (`GET /api/v1/application`,
     * una petición): `customy.application` los trae y `environmentId` deja de ser un valor de configuración. Un fallo rechaza `createCustomy`.
     */
    discoverApplication?: boolean;
    /** Caché de `customy.permissions` (`ttlMs`, `maxEntries`). */
    permissions?: PermissionDirectoryOptions;
    data?: CustomyDataSettings;
    /** Permite `http://` hacia loopback (desarrollo y tests). */
    allowLoopbackHttp?: boolean;
    /**
     * Permite `http://` hacia hosts privados (RFC 1918, `*.internal`, nombres de
     * una etiqueta), nunca públicos. Lo recomendado es el nombre público https.
     */
    allowPrivateHttp?: boolean;
    /** Personas del CRM (`customy.people`): audiencia, scopes y URL. */
    people?: CustomyPeopleSettings;
    /** Ciclo de vida de usuarios de la app conectada (`customy.apps`). Sin esto, `customy.apps` falla al usarse. */
    apps?: CustomyAppsSettings;
}>;

export type CustomyPeopleSettings = Readonly<{
    /** Audiencia de Access (por defecto la del CRM en el discovery, `customy-crm`). */
    audience?: string;
    /** Scopes M2M (por defecto `crm:people.read crm:people.write`; pide solo `crm:people.read` si la app solo lee). */
    scopes?: readonly string[];
    /** URL del CRM si el discovery no la publica. */
    baseUrl?: string;
}>;

/** `createConnectedApp` sin lo que ya da `createCustomy` (`fetch`, `timeoutMs`, `retry`, http local). */
export type CustomyAppsSettings = Omit<ConnectedAppOptions, "fetch" | "allowLoopbackHttp" | "allowPrivateHttp" | "organizationId" | "projectId" | "accessEnvironmentId"> & Partial<Pick<ConnectedAppOptions, "fetch" | "organizationId" | "projectId" | "accessEnvironmentId">>;

export type Customy<App extends CustomyAppTypes = CustomyAppTypes> = Readonly<{
    platform: CustomyPlatformConfiguration;
    /** Tokens de máquina de la app: uno por audiencia y scopes. */
    machineTokens: MachineTokens;
    /** Proveedor de tokens para la audiencia de un producto del discovery. */
    token(product: string): MachineTokenProvider;
    /** Transporte de `@customyai/core` de cualquier producto del discovery, con su URL y su token. */
    product(product: string): Transport;
    /** Dónde vive la app (organización, entorno, aplicación de Access, productos); `null` si no se pidió `discoverApplication`. */
    readonly application: CustomyApplication | null;
    /** Entorno de Access efectivo: `environmentId`, `CUSTOMY_WORKSPACE_ENVIRONMENT_ID` o el descubierto. */
    readonly environmentId: string | undefined;
    /** Proyecto efectivo (`apps.projectId` o `CUSTOMY_PROJECT_ID`); `undefined` si no se fijó. */
    readonly projectId: string | undefined;
    readonly access: CustomyAccess<CapabilitiesOf<App>, RolesOf<App>, PermissionsOf<App>>;
    /** «¿Puede este usuario hacer X?» sin nombres de rol: `can`, `require`, `hasRole`, con caché corta y fallando cerrado. */
    readonly permissions: PermissionDirectory<RolesOf<App>, PermissionsOf<App>>;
    readonly data: CustomyData<EventsOf<App>>;
    readonly send: CustomySend;
    readonly billing: CustomyBilling<MetersOf<App>>;
    readonly links: CustomyLinks;
    /** Personas y roles del CRM: identify, roles, identificadores, relaciones, grupos, contactabilidad. */
    readonly people: CustomyPeople;
    /** Eventos de ciclo de vida de usuarios de la app conectada (necesita `apps` en las opciones). */
    readonly apps: CustomyConnectedApp;
}>;

/**
 * Una identidad de app para todo el ecosistema. Cada cliente se crea la
 * primera vez que se usa y se reutiliza; ninguno pide un token hasta su
 * primera llamada.
 */
export async function createCustomy<App extends CustomyAppTypes = CustomyAppTypes>(options: CreateCustomyOptions): Promise<Customy<App>> {
    if (!options?.clientId || !options.clientSecret) {
        throw new CustomySdkError({ code: "SDK_CREDENTIALS_REQUIRED", service: "access", message: "createCustomy needs clientId and clientSecret" });
    }
    const env = readCustomyEnvironment(options.env ?? runtimeEnvironment());
    const issuer = options.issuer?.trim() || env.accessUrl || (options.env ?? runtimeEnvironment()).CUSTOMY_ISSUER?.trim() || options.platform?.issuer;
    if (!issuer) {
        throw new CustomySdkError({ code: "SDK_ISSUER_REQUIRED", service: "access", message: "createCustomy needs an issuer: pass `issuer` or set CUSTOMY_ACCESS_URL (or CUSTOMY_ISSUER)" });
    }
    const platform = options.platform ?? await discoverPlatform(issuer, { fetch: options.fetch });
    const byProduct: Record<string, readonly string[]> = scopesFromManifest(options.manifest, platform);
    for (const [key, value] of Object.entries(options.scopes ?? {})) if (value) byProduct[key] = value;
    const machineTokens = createMachineTokens({
        issuer, clientId: options.clientId, clientSecret: options.clientSecret, platform, scopes: byProduct, fetch: options.fetch,
    });
    const application = options.discoverApplication
        ? await discoverApplication({ issuer, machineTokens, platform, fetch: options.fetch, timeoutMs: options.timeoutMs })
        : null;
    const environmentId = options.environmentId ?? env.workspaceEnvironmentId ?? application?.environmentId;
    const projectId = options.apps?.projectId ?? env.projectId;
    const connection = (key: string): ProductClientOptions => ({
        platform, machineTokens, scopes: byProduct[key], fetch: options.fetch, timeoutMs: options.timeoutMs, retry: options.retry,
        allowLoopbackHttp: options.allowLoopbackHttp, allowPrivateHttp: options.allowPrivateHttp,
    });
    const cache = new Map<string, unknown>();
    const once = <T>(key: string, build: () => T): T => {
        if (!cache.has(key)) cache.set(key, build());
        return cache.get(key) as T;
    };
    const access = () => once("access", () => createAccess<CapabilitiesOf<App>, RolesOf<App>, PermissionsOf<App>>({ ...connection("access"), environmentId }));
    const discovered = (product: string) => {
        const entry = platform.products[product];
        if (!entry) throw new CustomySdkError({ code: "SDK_PRODUCT_NOT_DISCOVERED", service: product, message: `Product ${product} is not in the platform discovery` });
        return entry;
    };

    return {
        platform,
        machineTokens,
        application,
        environmentId,
        projectId,
        token: (product) => machineTokens.forProduct(product),
        product: (product) => once(`product:${product}`, () => connectProduct(connection(product), { key: product, audience: discovered(product).audience }).transport),
        get access() {
            return access();
        },
        get permissions() {
            return once("permissions", () => createPermissionDirectory<RolesOf<App>, PermissionsOf<App>>(access(), options.permissions));
        },
        get data() {
            return once("data", () => createData<EventsOf<App>>({ ...options.data, ...connection("data") }));
        },
        get send() {
            return once("send", () => createSend(connection("send")));
        },
        get billing() {
            return once("billing", () => createBilling<MetersOf<App>>(connection("billing")));
        },
        get links() {
            return once("links", () => createLinks(connection("links")));
        },
        get people() {
            return once("people", () => {
                const settings = options.people ?? {};
                const scopes = settings.scopes ?? byProduct.crm ?? PEOPLE_SCOPES;
                const baseUrl = settings.baseUrl ?? platform.products.crm?.baseUrl;
                if (!baseUrl) throw new CustomySdkError({ code: "SDK_PRODUCT_NOT_DISCOVERED", service: "crm", message: "Product crm is not in the platform discovery; pass people.baseUrl" });
                const audience = settings.audience ?? platform.products.crm?.audience ?? PEOPLE_AUDIENCE;
                const { machineTokens: _tokens, ...rest } = connection("crm");
                return createPeople({ ...rest, baseUrl, scopes, accessToken: machineTokens.forAudience(audience, scopes) });
            });
        },
        get apps() {
            return once("apps", () => {
                if (!options.apps) throw new CustomySdkError({ code: "SDK_APPS_NOT_CONFIGURED", service: "events", message: "customy.apps needs the `apps` option (applicationKey, ingestKey, environment; organizationId, projectId and accessEnvironmentId come from discoverApplication or CUSTOMY_PROJECT_ID / CUSTOMY_WORKSPACE_ENVIRONMENT_ID)" });
                const organizationId = options.apps.organizationId ?? application?.organizationId;
                const accessEnvironmentId = options.apps.accessEnvironmentId ?? environmentId;
                const missing = [["organizationId", organizationId], ["projectId", projectId], ["accessEnvironmentId", accessEnvironmentId]].filter(([, value]) => !value).map(([name]) => name);
                if (missing.length > 0) throw new CustomySdkError({ code: "SDK_APPS_NOT_CONFIGURED", service: "events", message: `customy.apps could not resolve ${missing.join(", ")}: pass them in \`apps\`, set CUSTOMY_PROJECT_ID / CUSTOMY_WORKSPACE_ENVIRONMENT_ID, or use discoverApplication` });
                return createConnectedApp({
                    fetch: options.fetch, retry: options.retry, allowLoopbackHttp: options.allowLoopbackHttp, allowPrivateHttp: options.allowPrivateHttp,
                    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
                    ...options.apps,
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    accessEnvironmentId: accessEnvironmentId as string,
                });
            });
        },
    };
}

export type { CustomyPlatformConfiguration, MachineTokenProvider, MachineTokens, Transport } from "@customyai/core";
export { CustomySdkError, isCustomySdkError } from "@customyai/core";

export {
    CUSTOMY_ENVIRONMENT_VARIABLES,
    readCustomyEnvironment,
    type CustomyEnvironment,
    type CustomyEnvironmentSource,
} from "./environment";

/**
 * Una capability con el tipo de valor que declara el manifiesto (`CustomyCapabilityValues` de `customy apps codegen`):
 * `boolean` para las booleanas, `number` para las medidas, `unknown` para las de configuración. Solo cambia el tipo.
 */
export type TypedCapabilityCheck<App extends CustomyAppTypes, Name extends CapabilitiesOf<App> = CapabilitiesOf<App>> = Omit<CapabilityCheck<Name>, "value"> & {
    value: Name extends keyof CapabilityValuesOf<App> ? CapabilityValuesOf<App>[Name] : unknown;
};

/** Estrecha el `value` de un `capabilities.check(...)` al tipo del manifiesto; devuelve el mismo objeto. */
export function typedCapability<App extends CustomyAppTypes, Name extends CapabilitiesOf<App> = CapabilitiesOf<App>>(check: CapabilityCheck<Name>): TypedCapabilityCheck<App, Name> {
    return check as unknown as TypedCapabilityCheck<App, Name>;
}

// Provisioning of TEST users: it takes an Access API key of ONE environment (not the app identity
// of `createCustomy`), so it is a standalone client plus its typed errors. Named re-exports on purpose:
// a `export * as` namespace puts the absolute path of the build machine into the API report.
export {
    createProvisioning,
    CustomyAuthError,
    CustomyCapabilityDisabledError,
    CustomyConflictError,
    CustomyEnvironmentMismatchError,
    CustomyProvisioningError,
    CustomyRateLimitError,
    CustomyScopeError,
    CustomyValidationError,
    PROVISIONING_SCOPES,
    type CustomyProvisioning,
    type ProvisioningOptions,
} from "@customyai/provisioning";

export {
    createPeople,
    PEOPLE_AUDIENCE,
    PEOPLE_SCOPES,
    type AddPersonGroupMembersParams,
    type AssignPersonRoleParams,
    type ContactabilityParams,
    type ContactabilityView,
    type CreatePersonGroupParams,
    type CreateRelationshipParams,
    type CustomyPeople,
    type EndPersonRoleParams,
    type EndRelationshipParams,
    type IdentifyPersonParams,
    type IdentifyPersonResult,
    type LinkPersonIdentifierParams,
    type ListPeopleParams,
    type ListPersonGroupsParams,
    type ListRelationshipsParams,
    type PeopleOptions,
    type PeoplePage,
    type PeopleScope,
    type PersonDetailView,
    type PersonGroupView,
    type PersonIdentifierView,
    type RelationshipView,
    type RoleTypeView,
    type SetPersonStateParams,
    type UpdatePersonRoleParams,
} from "./people";
export {
    APPLICATION_USER_EVENT_TYPES,
    createConnectedApp,
    deterministicUuid,
    EVENTS_URLS,
    type ApplicationUserEventEnvelope,
    type ApplicationUserEventType,
    type ApplicationUserPayload,
    type BatchItem,
    type BatchResult,
    type ConnectedAppEnvironment,
    type ConnectedAppOptions,
    type CustomyConnectedApp,
    type IngestReceipt,
    type UserActivityInput,
    type UserConsentUpdatedInput,
    type UserDeletedInput,
    type UserIdentityUpdatedInput,
    type UserRegisteredInput,
} from "./apps";
// Catálogo y reglas puras del modelo de Personas (contrato empaquetado en el build).
export {
    APP_USAGE_STAGES,
    COMMERCIAL_STAGES,
    CONNECTED_APPLICATION_CONSENT_SOURCES,
    CONNECTED_APPLICATION_CONSENT_STATUSES,
    DEFAULT_ROLE_PACKS,
    DIGITAL_CONSENT_AGE,
    evaluateContactability,
    getPlatformRoleType,
    getRelationshipType,
    IDENTIFIER_PRIORITY,
    isMinorFor,
    MESSAGE_PURPOSES,
    PERSON_GROUP_KINDS,
    PERSON_IDENTIFIER_TYPES,
    PERSON_ROLE_CONTEXT_KINDS,
    PERSON_ROLE_FAMILIES,
    PERSON_ROLE_STATUSES,
    PERSON_STATES,
    platformRoleTypesForPacks,
    RELATIONSHIP_TYPE_CATALOG,
    ROLE_PACKS,
    ROLE_TYPE_CATALOG,
    type ApplicationUsersSummary,
    type ConnectedApplicationConsent,
    type ConnectedApplicationConsentItem,
    type ConnectedApplicationAnalyticsConsent,
    type ConnectedApplicationConsentSource,
    type ConnectedApplicationConsentStatus,
    type ConnectedApplicationUserIdentity,
    type ConsentSignal,
    type ContactabilityDecision,
    type ContactabilityInput,
    type ContactabilityReason,
    type LegalBasis,
    type LocalizedLabel,
    type MessagePurpose,
    type PersonGroupKind,
    type PersonIdentifierType,
    type PersonRoleContextKind,
    type PersonRoleFamily,
    type PersonRoleStatus,
    type PersonRoleView,
    type PersonState,
    type PersonSummaryView,
    type RelationshipTypeDefinition,
    type RoleMarketingPolicy,
    type RolePack,
    type RoleTypeDefinition,
} from "./vendor/people";
