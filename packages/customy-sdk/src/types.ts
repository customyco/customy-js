// ─── SDK Type Definitions ───────────────────────────────────

export interface CustomyClientConfig {
    /** API key (sk-...) */
    apiKey: string;
    /** Base URL of the Customy Agent API */
    baseUrl: string;
    /** Default timeout in ms (default: 30000) */
    timeout?: number;
    /** Custom fetch implementation */
    fetch?: typeof fetch;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
    };
}

// ─── Tasks ──────────────────────────────────────────────────

export interface TaskCreateOptions {
    name: string;
    instructions: string;
    agentId?: string;
    skills?: string[];
    sessions?: string[];
    priority?: "low" | "normal" | "high" | "critical";
    taskType?: "one_off" | "recurring" | "workflow_step";
    trigger?: {
        type: "cron" | "webhook" | "event" | "ai" | "manual";
        expression?: string;
        timezone?: string;
        condition?: string;
    };
}

export interface NLTaskResult {
    agentId: string;
    name: string;
    instructions: string;
    description?: string;
    skills: string[];
    sessions: string[];
    trigger?: {
        type: string;
        expression?: string;
        timezone?: string;
        condition?: string;
    };
    priority: string;
    taskType: string;
    confidence: number;
    reasoning: string;
}

// ─── Templates ──────────────────────────────────────────────

export interface TemplateSummary {
    id: string;
    name: string;
    description: string;
    vertical: string;
    icon: string;
    color: string;
    tags: string[];
}

export interface AgentTemplate extends TemplateSummary {
    baseAgentId: string;
    suggestedModel: string;
    suggestedSkills: string[];
    suggestedSessions: string[];
    systemPromptAddition: string;
    personality: {
        tone: string;
        language: string;
        emoji: boolean;
    };
    sampleTasks: Array<{
        name: string;
        prompt: string;
        description: string;
    }>;
    suggestedTriggers: Array<{
        name: string;
        type: string;
        config: Record<string, unknown>;
        description: string;
    }>;
}

// ─── Marketplace ────────────────────────────────────────────

export interface MarketplaceListing {
    id: string;
    skillId: string;
    title: string;
    shortDescription: string;
    longDescription?: string;
    category: string;
    tags: string[];
    vertical?: string;
    pricingType: string;
    priceCredits: number;
    installCount: number;
    avgRating: number;
    reviewCount: number;
    status: string;
    version: string;
    publisherName: string;
    publisherVerified: boolean;
}

export interface MarketplaceInstall {
    id: string;
    listingId: string;
    organizationId: string;
    environmentId: string;
    installedVersion: string;
    isEnabled: boolean;
    listing?: MarketplaceListing;
}

// ─── AI Triggers ─────────────────────────────────────────────

export interface AITriggerEvalResult {
    triggered: boolean;
    confidence: number;
    reasoning: string;
    extractedFacts: string[];
}

// ─── Browser Agent ──────────────────────────────────────────

export interface BrowserSession {
    id: string;
    organizationId: string;
    environmentId: string;
    name?: string;
    platform: string;
    accountIdentifier: string;
    status: "pending_auth" | "active" | "expired" | "revoked";
    sessionDataRef?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
}

export interface BrowserSessionAccount {
    id: string;
    sessionId: string;
    platform: string;
    accountIdentifier: string;
    status: "active" | "expired" | "logged_out";
    authenticatedAt?: string;
    lastVerifiedAt?: string;
}

export interface AgentBrowserTask {
    id: string;
    organizationId: string;
    environmentId: string;
    agentRunId?: string;
    sessionId?: string;
    taskDescription: string;
    taskType?: string;
    status: "pending" | "running" | "waiting_human" | "completed" | "failed" | "cancelled" | "timeout";
    progress?: number;
    interruptionType?: "captcha" | "two_factor" | "login_required" | "security_check" | "manual_input" | "confirmation";
    interruptionMessage?: string;
    liveViewUrl?: string;
    liveViewExpiresAt?: string;
    currentUrl?: string;
    result?: unknown;
    screenshotRef?: string;
    recordingRef?: string;
    errorMessage?: string;
    errorCode?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
}

// ─── Payments ───────────────────────────────────────────────

export interface PaymentIntentCreateOptions {
    amountMinor: number;
    currency: string;
    description?: string;
    provider?: string;
    customerEmail?: string;
    customerName?: string;
    metadata?: Record<string, unknown>;
}

export interface PaymentIntentResult {
    id: string;
    status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
    amountMinor: number;
    currency: string;
    checkoutUrl?: string;
    paymentLinkUrl?: string;
    createdAt: string;
}

// ─── Voice ──────────────────────────────────────────────────

export interface VoiceCallInitiateOptions {
    agentId: string;
    phoneNumber: string;
    dynamicVariables?: Record<string, string>;
    recordAudio?: boolean;
}

export interface VoiceCallResult {
    callId: string;
    agentId: string;
    status: "queued" | "initiated" | "in_progress" | "completed" | "failed";
    durationSeconds?: number;
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    createdAt: string;
}

// ─── CRM ────────────────────────────────────────────────────

export interface CRMContactCreateOptions {
    email?: string;
    phone?: string;
    fullName?: string;
    companyName?: string;
    stage?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
}

export interface CRMContactResult {
    id: string;
    email?: string;
    phone?: string;
    fullName?: string;
    companyName?: string;
    stage?: string;
    tags?: string[];
    createdAt: string;
}

// ─── Events ─────────────────────────────────────────────────

export interface EventPublishOptions {
    eventType: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
}

export interface EventPublishResult {
    eventId: string;
    accepted: boolean;
    publishedAt: string;
}

