/**
 * @customyai/customy-sdk/server — `createCustomy()`: una sola identidad de app para todo el ecosistema.
 *
 * Lee el discovery del issuer (`/.well-known/customy-configuration`), crea un
 * proveedor de tokens de máquina por audiencia de producto y entrega los
 * clientes de cada producto ya apuntando a su URL y con su proveedor. No añade
 * transporte propio: compone los SDK de cada servicio. Solo para servidor —
 * usa el secreto de la app.
 *
 *   const customy = await createCustomy({ issuer, clientId, clientSecret });
 *   await customy.send.emails.send({ ... });
 *   await customy.billing.report([{ meter: "coach.runs", quantity: 1, idempotencyKey }]);
 *   await customy.product("crm").get("/v1/contacts");
 */
import {
  createMachineTokenProvider,
  discoverPlatform,
  type CustomyPlatformConfiguration,
  type MachineTokenProvider,
} from "@customyai/customy-access/server";
import { CustomySend } from "@customyai/send-sdk";
import { CustomyLinks } from "@customyai/links-sdk";
import { CustomyCustomerDataClient, type CustomerDataClientConfig } from "./vendor/sdk-data";
// El valor sale del subpath para no empaquetar el resto del cliente de Billing;
// el tipo, de la raíz, que es lo que sabe resolver el empaquetado de tipos.
import { AppUsageClient } from "./vendor/app-usage";
import type { AppUsageClient as AppUsageClientType } from "./vendor/app-usage";
import { CustomyProductClient, CustomySdkError, type CustomySdkKey } from "./portfolio";

export type CreateCustomyOptions = {
  /** Issuer de Customy Access del entorno, p. ej. `https://access-api.customy.ai`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Scopes por producto (clave del discovery). Sin entrada, los del cliente. */
  scopes?: Partial<Record<string, readonly string[]>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Opciones extra del cliente de Data (colas, redacción, `onError`…). */
  data?: Omit<CustomerDataClientConfig, "collectUrl" | "writeKey" | "accessToken" | "fetchImpl">;
};

export type Customy = {
  readonly platform: CustomyPlatformConfiguration;
  /** Proveedor de tokens de máquina para la audiencia de un producto del discovery. */
  token(product: string): MachineTokenProvider;
  /** Cliente HTTP genérico de un producto, con su URL y su proveedor de tokens. */
  product(product: CustomySdkKey): CustomyProductClient;
  readonly send: CustomySend;
  readonly links: CustomyLinks;
  readonly data: CustomyCustomerDataClient;
  readonly billing: AppUsageClientType;
};

export async function createCustomy(options: CreateCustomyOptions): Promise<Customy> {
  if (!options.clientId || !options.clientSecret) throw new Error("CUSTOMY_MACHINE_CREDENTIALS_REQUIRED");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const platform = await discoverPlatform(options.issuer, fetchImpl);
  const providers = new Map<string, MachineTokenProvider>();
  const clients = new Map<string, unknown>();

  function entry(product: string) {
    const found = platform.products[product];
    if (!found) throw new Error(`CUSTOMY_PRODUCT_NOT_DISCOVERED: ${product}`);
    return found;
  }

  function token(product: string): MachineTokenProvider {
    let provider = providers.get(product);
    if (!provider) {
      provider = createMachineTokenProvider({
        issuer: platform.issuer,
        tokenEndpoint: platform.tokenEndpoint,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        audience: entry(product).audience,
        scopes: options.scopes?.[product],
        fetch: fetchImpl,
      });
      providers.set(product, provider);
    }
    return provider;
  }

  function once<T>(key: string, build: () => T): T {
    if (!clients.has(key)) clients.set(key, build());
    return clients.get(key) as T;
  }

  return {
    platform,
    token,
    product(product) {
      if (!platform.products[product]) throw new CustomySdkError(product, 0, "SDK_PRODUCT_NOT_DISCOVERED");
      return once(`product:${product}`, () => new CustomyProductClient(product, {
        baseUrl: entry(product).baseUrl, accessToken: token(product), fetch: options.fetch, timeoutMs: options.timeoutMs,
      }));
    },
    get send() {
      return once("send", () => new CustomySend(token("send"), { baseUrl: entry("send").baseUrl, fetch: options.fetch, timeoutMs: options.timeoutMs }));
    },
    get links() {
      return once("links", () => new CustomyLinks({ apiKey: token("links"), baseUrl: entry("links").baseUrl, fetch: options.fetch, timeoutMs: options.timeoutMs }));
    },
    get data() {
      return once("data", () => new CustomyCustomerDataClient({
        ...options.data, collectUrl: entry("data").baseUrl, accessToken: token("data"), fetchImpl: options.fetch, timeoutMs: options.timeoutMs,
      }));
    },
    get billing() {
      return once("billing", () => new AppUsageClient({ baseUrl: entry("billing").baseUrl, accessToken: token("billing"), fetch: options.fetch, timeoutMs: options.timeoutMs }));
    },
  };
}
