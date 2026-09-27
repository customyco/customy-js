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
 * ```
 *
 * Solo servidor: lleva el secreto de la app. Un bundle de navegador no lo
 * resuelve (condición `browser: null`); allí van `@customyai/client` y
 * `@customyai/data` con write key.
 */
import {
    connectProduct,
    createMachineTokens,
    discoverPlatform,
    CustomySdkError,
    type CustomyPlatformConfiguration,
    type MachineTokenProvider,
    type MachineTokens,
    type ProductClientOptions,
    type RetryPolicy,
    type Transport,
} from "@customyai/core";
import { createAccess, type CustomyAccess } from "@customyai/access";
import { createBilling, type CustomyBilling } from "@customyai/billing";
import { createData, type CustomyData, type DataOptions, type EventMap } from "@customyai/data";
import { createLinks, type CustomyLinks } from "@customyai/links";
import { createSend, type CustomySend } from "@customyai/send";

/** Tipos de la app (los de `customy apps codegen`): eventos, meters y capabilities declarados. */
export type CustomyAppTypes = {
    events?: EventMap;
    meters?: string;
    capabilities?: string;
};

type EventsOf<App extends CustomyAppTypes> = App["events"] extends EventMap ? App["events"] : EventMap;
type MetersOf<App extends CustomyAppTypes> = App["meters"] extends string ? App["meters"] : string;
type CapabilitiesOf<App extends CustomyAppTypes> = App["capabilities"] extends string ? App["capabilities"] : string;

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
    /** Issuer de Customy Access del entorno (el de `CUSTOMY_ISSUER`). */
    issuer: string;
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
    /** Entorno por defecto de las llamadas de Access que lo necesitan. */
    environmentId?: string;
    data?: CustomyDataSettings;
    /** Permite `http://` hacia loopback (desarrollo y tests). */
    allowLoopbackHttp?: boolean;
    /**
     * Permite `http://` hacia hosts privados (RFC 1918, `*.internal`, nombres de
     * una etiqueta), nunca públicos. Lo recomendado es el nombre público https.
     */
    allowPrivateHttp?: boolean;
}>;

export type Customy<App extends CustomyAppTypes = CustomyAppTypes> = Readonly<{
    platform: CustomyPlatformConfiguration;
    /** Tokens de máquina de la app: uno por audiencia y scopes. */
    machineTokens: MachineTokens;
    /** Proveedor de tokens para la audiencia de un producto del discovery. */
    token(product: string): MachineTokenProvider;
    /** Transporte de `@customyai/core` de cualquier producto del discovery, con su URL y su token. */
    product(product: string): Transport;
    readonly access: CustomyAccess<CapabilitiesOf<App>>;
    readonly data: CustomyData<EventsOf<App>>;
    readonly send: CustomySend;
    readonly billing: CustomyBilling<MetersOf<App>>;
    readonly links: CustomyLinks;
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
    const platform = options.platform ?? await discoverPlatform(options.issuer, { fetch: options.fetch });
    const byProduct: Record<string, readonly string[]> = scopesFromManifest(options.manifest, platform);
    for (const [key, value] of Object.entries(options.scopes ?? {})) if (value) byProduct[key] = value;
    const machineTokens = createMachineTokens({
        issuer: options.issuer, clientId: options.clientId, clientSecret: options.clientSecret, platform, scopes: byProduct, fetch: options.fetch,
    });
    const connection = (key: string): ProductClientOptions => ({
        platform, machineTokens, scopes: byProduct[key], fetch: options.fetch, timeoutMs: options.timeoutMs, retry: options.retry,
        allowLoopbackHttp: options.allowLoopbackHttp, allowPrivateHttp: options.allowPrivateHttp,
    });
    const cache = new Map<string, unknown>();
    const once = <T>(key: string, build: () => T): T => {
        if (!cache.has(key)) cache.set(key, build());
        return cache.get(key) as T;
    };
    const discovered = (product: string) => {
        const entry = platform.products[product];
        if (!entry) throw new CustomySdkError({ code: "SDK_PRODUCT_NOT_DISCOVERED", service: product, message: `Product ${product} is not in the platform discovery` });
        return entry;
    };

    return {
        platform,
        machineTokens,
        token: (product) => machineTokens.forProduct(product),
        product: (product) => once(`product:${product}`, () => connectProduct(connection(product), { key: product, audience: discovered(product).audience }).transport),
        get access() {
            return once("access", () => createAccess<CapabilitiesOf<App>>({ ...connection("access"), environmentId: options.environmentId }));
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
    };
}

export type { CustomyPlatformConfiguration, MachineTokenProvider, MachineTokens, Transport } from "@customyai/core";
export { CustomySdkError, isCustomySdkError } from "@customyai/core";
