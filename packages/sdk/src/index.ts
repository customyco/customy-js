// ==========================================
// @customyai/customy-sdk — Public TypeScript SDK
// ==========================================
// Provides the umbrella client for every Customy product and platform service.
// The legacy CustomyClient remains available for the typed Agent API surface.
//
// Usage:
//   import { CustomyClient } from "@customyai/customy-sdk";
//   const client = new CustomyClient({ apiKey: "sk-...", baseUrl: "https://api.customy.io" });
//   const task = await client.tasks.createFromNaturalLanguage("Post on LinkedIn about AI every Monday");

export { CustomyClient } from "./client";
export type {
    CustomyClientConfig,
    TaskCreateOptions,
    MarketplaceListing,
    MarketplaceInstall,
    AITriggerEvalResult,
    PaginatedResponse,
    BrowserSession,
    BrowserSessionAccount,
    AgentBrowserTask,
    PaymentIntentCreateOptions,
    PaymentIntentResult,
    VoiceCallInitiateOptions,
    VoiceCallResult,
    CRMContactCreateOptions,
    CRMContactResult,
    EventPublishOptions,
    EventPublishResult,
} from "./types";

export {
    CUSTOMY_PLATFORM_SERVICE_KEYS,
    CUSTOMY_PRODUCT_KEYS,
    CustomyPortfolioSdk,
    CustomyProductClient,
    CustomySdkError,
    createCustomySdk,
} from "./portfolio";
export type {
    CustomyHttpMethod,
    CustomyPlatformServiceKey,
    CustomyProductKey,
    CustomyProductClients,
    CustomyQuery,
    CustomySdkConfig,
    CustomySdkKey,
    CustomySdkRequestOptions,
} from "./portfolio";
