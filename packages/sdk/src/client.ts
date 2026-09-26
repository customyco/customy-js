// ==========================================
// CustomyClient — Public SDK Client
// ==========================================
// Fully typed HTTP client for the Customy Agent API.
// Groups endpoints by domain: tasks, templates, marketplace, triggers.

import type {
    CustomyClientConfig,
    PaginatedResponse,
    TaskCreateOptions,
    NLTaskResult,
    AgentTemplate,
    TemplateSummary,
    MarketplaceListing,
    MarketplaceInstall,
    AITriggerEvalResult,
    BrowserSession,
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

export class CustomyClient {
    private baseUrl: string;
    private apiKey: string;
    private timeout: number;
    private fetchFn: typeof fetch;

    constructor(config: CustomyClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.apiKey = config.apiKey;
        this.timeout = config.timeout ?? 30_000;
        this.fetchFn = config.fetch ?? globalThis.fetch;
    }

    // ─── HTTP Layer ─────────────────────────────────

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        query?: Record<string, string>,
    ): Promise<T> {
        let url = `${this.baseUrl}${path}`;
        if (query) {
            const params = new URLSearchParams(
                Object.entries(query).filter(([, v]) => v !== undefined),
            );
            if (params.toString()) url += `?${params.toString()}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        try {
            const res = await this.fetchFn(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({}));
                throw new CustomyAPIError(
                    res.status,
                    (errorBody as { error?: string }).error ?? res.statusText,
                    errorBody,
                );
            }

            return (await res.json()) as T;
        } finally {
            clearTimeout(timer);
        }
    }

    // ─── Tasks ──────────────────────────────────────

    tasks = {
        /** Parse a natural language prompt into a structured task */
        createFromNaturalLanguage: (prompt: string) =>
            this.request<NLTaskResult>("POST", "/v2/tasks/natural", { prompt }),

        /** Create a task with explicit parameters */
        create: (options: TaskCreateOptions) =>
            this.request<{ id: string }>("POST", "/v2/tasks", options),

        /** Get a task by ID */
        get: (id: string) =>
            this.request<Record<string, unknown>>("GET", `/v2/tasks/${id}`),

        /** List tasks with pagination */
        list: (options?: { page?: number; limit?: number; status?: string }) =>
            this.request<{ tasks: Record<string, unknown>[]; total: number }>(
                "GET",
                "/v2/tasks",
                undefined,
                {
                    page: String(options?.page ?? 1),
                    limit: String(options?.limit ?? 20),
                    ...(options?.status ? { status: options.status } : {}),
                },
            ),
    };

    // ─── Templates ──────────────────────────────────

    templates = {
        /** List all available agent templates */
        list: (options?: { vertical?: string; tag?: string }) =>
            this.request<{ templates: TemplateSummary[]; total: number }>(
                "GET",
                "/v2/templates",
                undefined,
                {
                    ...(options?.vertical ? { vertical: options.vertical } : {}),
                    ...(options?.tag ? { tag: options.tag } : {}),
                },
            ),

        /** Get full template details */
        get: (id: string) =>
            this.request<AgentTemplate>("GET", `/v2/templates/${id}`),

        /** Instantiate a template into an agent config */
        instantiate: (
            templateId: string,
            options?: { displayName?: string; modelOverride?: string },
        ) =>
            this.request<{ message: string; agentConfig: Record<string, unknown> }>(
                "POST",
                `/v2/templates/${templateId}/instantiate`,
                options,
            ),
    };

    // ─── Marketplace ────────────────────────────────

    marketplace = {
        /** Browse marketplace listings */
        browse: (options?: {
            category?: string;
            tag?: string;
            sort?: string;
            page?: number;
            limit?: number;
        }) =>
            this.request<{
                listings: MarketplaceListing[];
                pagination: { page: number; limit: number; total: number };
            }>("GET", "/v2/marketplace", undefined, {
                ...(options?.category ? { category: options.category } : {}),
                ...(options?.tag ? { tag: options.tag } : {}),
                ...(options?.sort ? { sort: options.sort } : {}),
                page: String(options?.page ?? 1),
                limit: String(options?.limit ?? 20),
            }),

        /** Get listing details */
        get: (id: string) =>
            this.request<MarketplaceListing>("GET", `/v2/marketplace/${id}`),

        /** Install a skill from the marketplace */
        install: (listingId: string) =>
            this.request<MarketplaceInstall>(
                "POST",
                `/v2/marketplace/${listingId}/install`,
            ),

        /** Submit a review */
        review: (
            listingId: string,
            review: { rating: number; title?: string; body?: string },
        ) =>
            this.request<Record<string, unknown>>(
                "POST",
                `/v2/marketplace/${listingId}/review`,
                review,
            ),

        /** List installed skills */
        installed: () =>
            this.request<{ installs: MarketplaceInstall[]; total: number }>(
                "GET",
                "/v2/marketplace/installed",
            ),
    };

    // ─── AI Triggers ────────────────────────────────

    triggers = {
        /** Create an AI-powered trigger */
        createAI: (options: {
            name: string;
            condition: string;
            workflowId?: string;
            confidenceThreshold?: number;
            cooldownMs?: number;
        }) =>
            this.request<Record<string, unknown>>(
                "POST",
                "/v2/triggers/ai",
                options,
            ),

        /** Test an AI trigger evaluation */
        evaluateAI: (options: {
            condition: string;
            data: unknown;
            confidenceThreshold?: number;
        }) =>
            this.request<AITriggerEvalResult>(
                "POST",
                "/v2/triggers/ai/evaluate",
                options,
            ),

        /** List AI triggers */
        listAI: () =>
            this.request<{ triggers: Record<string, unknown>[]; total: number }>(
                "GET",
                "/v2/triggers/ai",
            ),
    };

    // ─── Browser Agent ──────────────────────────────

    browser = {
        sessions: {
            /** List browser sessions */
            list: (options?: { platform?: string; status?: string }) =>
                this.request<{ sessions: BrowserSession[]; total: number }>(
                    "GET",
                    "/v1/browser/sessions",
                    undefined,
                    options as Record<string, string>,
                ),

            /** Get a specific session */
            get: (sessionId: string) =>
                this.request<BrowserSession>("GET", `/v1/browser/sessions/${sessionId}`),

            /** Revoke a session manually */
            revoke: (sessionId: string) =>
                this.request<{ ok: boolean; status: string }>(
                    "DELETE",
                    `/v1/browser/sessions/${sessionId}`,
                ),
        },

        tasks: {
            /** List browser tasks */
            list: (options?: { taskId?: string }) =>
                this.request<{ tasks: AgentBrowserTask[]; total: number }>(
                    "GET",
                    "/v1/browser/tasks",
                    undefined,
                    options as Record<string, string>,
                ),

            /** Resume a task waiting for human input */
            resume: (taskId: string, action: "continue" | "cancel") =>
                this.request<{ ok: boolean; taskId: string; action: string }>(
                    "POST",
                    `/v1/browser/tasks/${taskId}/resume`,
                    { action },
                ),

            /** Get tasks currently waiting for a human */
            getWaiting: () =>
                this.request<{ tasks: AgentBrowserTask[] }>("GET", "/v1/browser/tasks/waiting"),
        },

        /**
         * Helper: Executes a browser task and waits for its completion.
         * Resolves when the task is 'completed', 'failed', 'cancelled', 'timeout', 
         * or 'waiting_human' (meaning it needs intervention).
         */
        executeAndWait: async (
            taskId: string,
            pollIntervalMs = 2000,
        ): Promise<AgentBrowserTask> => {
            while (true) {
                const res = await this.browser.tasks.list({ taskId });
                const task = res.tasks[0];
                if (!task) throw new Error(`Task ${taskId} not found`);

                if (
                    task.status === "completed" ||
                    task.status === "failed" ||
                    task.status === "cancelled" ||
                    task.status === "timeout" ||
                    task.status === "waiting_human"
                ) {
                    return task;
                }

                await new Promise((r) => setTimeout(r, pollIntervalMs));
            }
        },
    };

    // ─── Payments Namespace ─────────────────────────────────────

    public payments = {
        /** Create a payment intent */
        createIntent: (options: PaymentIntentCreateOptions) =>
            this.request<PaymentIntentResult>("POST", "/v1/payments/intents", options),

        /** Get payment intent status */
        getIntent: (intentId: string) =>
            this.request<PaymentIntentResult>("GET", `/v1/payments/intents/${intentId}`),

        /** List payment intents */
        listIntents: (query?: { limit?: string; startingAfter?: string }) =>
            this.request<PaginatedResponse<PaymentIntentResult>>("GET", "/v1/payments/intents", undefined, query),
    };

    // ─── Voice Namespace ────────────────────────────────────────

    public voice = {
        /** Initiate an autonomous voice call */
        initiateCall: (options: VoiceCallInitiateOptions) =>
            this.request<VoiceCallResult>("POST", "/v1/voice/calls", options),

        /** Get voice call details and transcript */
        getCall: (callId: string) =>
            this.request<VoiceCallResult>("GET", `/v1/voice/calls/${callId}`),

        /** List voice calls */
        listCalls: (query?: { agentId?: string; limit?: string }) =>
            this.request<PaginatedResponse<VoiceCallResult>>("GET", "/v1/voice/calls", undefined, query),
    };

    // ─── CRM Namespace ──────────────────────────────────────────

    public crm = {
        /** Create or upsert a contact */
        createContact: (options: CRMContactCreateOptions) =>
            this.request<CRMContactResult>("POST", "/v1/crm/contacts", options),

        /** Get contact details */
        getContact: (contactId: string) =>
            this.request<CRMContactResult>("GET", `/v1/crm/contacts/${contactId}`),

        /** List contacts */
        listContacts: (query?: { stage?: string; limit?: string }) =>
            this.request<PaginatedResponse<CRMContactResult>>("GET", "/v1/crm/contacts", undefined, query),
    };

    // ─── Events Namespace ───────────────────────────────────────

    public events = {
        /** Publish an event to the Customy Event Backbone */
        publish: (options: EventPublishOptions) =>
            this.request<EventPublishResult>("POST", "/v1/events/publish", options),
    };
}

// ─── Error Class ────────────────────────────────────────────

export class CustomyAPIError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly body?: unknown,
    ) {
        super(`Customy API Error (${status}): ${message}`);
        this.name = "CustomyAPIError";
    }
}
