import { z } from "zod";

/**
 * The ONE consent vocabulary of Customy.
 *
 * Decision (2026-09-28, Wave 1a): the system of record for communication
 * consent is Customy CRM (`crm_contact_channel_preferences` + its event
 * ledger, each event carrying a `legal_basis`). Every other product —
 * Campaigns, Send, Engagement, WhatsApp, Forms, Data — consumes these values
 * and never defines its own list. A product may keep a local store only as a
 * PROJECTION of CRM (WhatsApp consents, Send suppressions), translated with the
 * mappings below.
 *
 * See docs/CUSTOMY_CONSENT_AND_PRIVACY.md.
 */

// ── Purposes ────────────────────────────────────────────────────────────────

/** Why a message is sent. The same nine values across every product. */
export const COMMUNICATION_PURPOSES = [
  "marketing",
  "sales",
  "education",
  "event",
  "survey",
  "transactional",
  "notification",
  "security",
  "support",
] as const;
export type CommunicationPurpose = (typeof COMMUNICATION_PURPOSES)[number];

/** Purposes that require an explicit opt-in (consent) before sending. */
export const NON_ESSENTIAL_PURPOSES = ["marketing", "sales", "education", "event", "survey"] as const satisfies readonly CommunicationPurpose[];
export type NonEssentialPurpose = (typeof NON_ESSENTIAL_PURPOSES)[number];

/** Service purposes: allowed while no explicit opt-out exists, with a service context. */
export const ESSENTIAL_PURPOSES = ["transactional", "notification", "security", "support"] as const satisfies readonly CommunicationPurpose[];
export type EssentialPurpose = (typeof ESSENTIAL_PURPOSES)[number];

/** A preference row may apply to every purpose. */
export const PURPOSE_WILDCARD = "*" as const;
export type CommunicationPurposeScope = CommunicationPurpose | typeof PURPOSE_WILDCARD;

/** Purposes a recipient may choose in a preference center (essential ones are not offered). */
export const PREFERENCE_CENTER_PURPOSES = NON_ESSENTIAL_PURPOSES;

/** Purposes a Forms consent field can collect (a subscription form may also ask for service notifications). */
export const FORMS_CONSENT_PURPOSES = [...NON_ESSENTIAL_PURPOSES, "notification"] as const satisfies readonly CommunicationPurpose[];
export type FormsConsentPurpose = (typeof FORMS_CONSENT_PURPOSES)[number];

export function isCommunicationPurpose(value: unknown): value is CommunicationPurpose {
  return typeof value === "string" && (COMMUNICATION_PURPOSES as readonly string[]).includes(value);
}

export function isNonEssentialPurpose(value: unknown): value is NonEssentialPurpose {
  return typeof value === "string" && (NON_ESSENTIAL_PURPOSES as readonly string[]).includes(value);
}

export function isEssentialPurpose(value: unknown): value is EssentialPurpose {
  return typeof value === "string" && (ESSENTIAL_PURPOSES as readonly string[]).includes(value);
}

// ── Channels ────────────────────────────────────────────────────────────────

export const COMMUNICATION_CHANNELS = ["email", "whatsapp", "sms", "voice", "push", "web_push", "in_app"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export function isCommunicationChannel(value: unknown): value is CommunicationChannel {
  return typeof value === "string" && (COMMUNICATION_CHANNELS as readonly string[]).includes(value);
}

// ── Statuses ────────────────────────────────────────────────────────────────

/**
 * - `subscribed`: explicit, evidenced grant.
 * - `unsubscribed`: explicit opt-out; always wins.
 * - `pending`: grant claimed but not confirmed (double opt-in). NEVER eligible.
 * - `not_set`: no decision; resolves by purpose default. It is a value of the
 *   API, not a stored row: writing `not_set` removes the row (the event ledger
 *   keeps the history).
 */
export const CONSENT_STATUSES = ["subscribed", "unsubscribed", "pending", "not_set"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/** Statuses that exist as a row in `crm_contact_channel_preferences`. */
export const STORED_CONSENT_STATUSES = ["subscribed", "unsubscribed", "pending"] as const satisfies readonly ConsentStatus[];
export type StoredConsentStatus = (typeof STORED_CONSENT_STATUSES)[number];

export function isStoredConsentStatus(value: unknown): value is StoredConsentStatus {
  return typeof value === "string" && (STORED_CONSENT_STATUSES as readonly string[]).includes(value);
}

// ── Legal basis and sources ─────────────────────────────────────────────────

/** GDPR art. 6 bases; Ley 1581 (CO) only recognises `consent` (autorización) plus its art. 10 exceptions. */
export const CONSENT_LEGAL_BASES = ["none", "consent", "contract", "legitimate_interest", "legal_obligation", "vital_interest"] as const;
export type ConsentLegalBasis = (typeof CONSENT_LEGAL_BASES)[number];

/** Where a consent decision came from. Stored on every row and ledger event. */
export const CONSENT_SOURCES = [
  "manual",
  "import",
  "form",
  "provider",
  "api",
  "preference_center",
  "inbound",
  "automation",
  "unsubscribe_link",
  "double_opt_in",
  "erasure",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/** Products that write or project consent. Used to avoid echo loops. */
export const CONSENT_PRODUCTS = ["crm", "send", "engagement", "whatsapp", "forms", "campaigns", "data"] as const;
export type ConsentProduct = (typeof CONSENT_PRODUCTS)[number];

// ── Eligibility ─────────────────────────────────────────────────────────────

/**
 * Pure eligibility rule shared by CRM and every projection. An explicit
 * opt-out always blocks; `pending` never grants anything (it only blocks
 * nothing essential); a non-essential purpose requires `subscribed`.
 */
export function isConsentEligible(purpose: CommunicationPurpose, status: ConsentStatus | "inherited"): boolean {
  if (status === "unsubscribed") return false;
  if (status === "subscribed") return true;
  // `pending`, `not_set` and `inherited` grant nothing: only the service default applies.
  return isEssentialPurpose(purpose);
}

// ── Customy Send mapping ────────────────────────────────────────────────────

/**
 * Send categories: the `category` tag of an email (and its suppression scope)
 * and the notification-category id for push/inbox. The category IS the
 * purpose, so a suppression recorded for category `marketing` is exactly the
 * CRM opt-out of purpose `marketing`. The stream decides the Send lane.
 */
export type SendCategoryMapping = { category: CommunicationPurpose; stream: "transactional" | "bulk"; listUnsubscribe: boolean };

export const SEND_CATEGORY_BY_PURPOSE: Record<CommunicationPurpose, SendCategoryMapping> = Object.fromEntries(
  COMMUNICATION_PURPOSES.map((purpose) => [purpose, {
    category: purpose,
    stream: isEssentialPurpose(purpose) ? "transactional" : "bulk",
    listUnsubscribe: isNonEssentialPurpose(purpose),
  }]),
) as Record<CommunicationPurpose, SendCategoryMapping>;

/** Legacy bulk labels Send already treats as marketing mail. */
const SEND_BULK_ALIASES = new Set(["bulk", "newsletter", "campaign", "promotional", "broadcast"]);

export function sendCategoryForPurpose(purpose: CommunicationPurposeScope): string | null {
  return purpose === PURPOSE_WILDCARD ? null : SEND_CATEGORY_BY_PURPOSE[purpose].category;
}

/**
 * Inverse: which CRM purpose a Send category means. `null` category (a
 * suppression for all mail) is the wildcard. An unknown free-form tag cannot
 * be narrowed safely, so it is treated as the wildcard too (an opt-out must
 * never be recorded narrower than the person asked).
 */
export function purposeForSendCategory(category: string | null | undefined): CommunicationPurposeScope {
  const value = String(category ?? "").trim().toLowerCase();
  if (!value) return PURPOSE_WILDCARD;
  if (isCommunicationPurpose(value)) return value;
  if (SEND_BULK_ALIASES.has(value)) return "marketing";
  return PURPOSE_WILDCARD;
}

// ── WhatsApp mapping ────────────────────────────────────────────────────────

/** Meta template categories. */
export const WHATSAPP_TEMPLATE_CATEGORIES = ["marketing", "utility", "authentication"] as const;
export type WhatsAppTemplateCategory = (typeof WHATSAPP_TEMPLATE_CATEGORIES)[number];

/** The WhatsApp product's own message purpose (its send-path gate). */
export const WHATSAPP_MESSAGE_PURPOSES = ["marketing", "service", "transactional"] as const;
export type WhatsAppMessagePurpose = (typeof WHATSAPP_MESSAGE_PURPOSES)[number];

export const WHATSAPP_CATEGORY_BY_PURPOSE: Record<CommunicationPurpose, WhatsAppTemplateCategory> = {
  marketing: "marketing",
  sales: "marketing",
  education: "marketing",
  event: "marketing",
  survey: "marketing",
  transactional: "utility",
  notification: "utility",
  support: "utility",
  security: "authentication",
};

export const WHATSAPP_MESSAGE_PURPOSE_BY_PURPOSE: Record<CommunicationPurpose, WhatsAppMessagePurpose> = {
  marketing: "marketing",
  sales: "marketing",
  education: "marketing",
  event: "marketing",
  survey: "marketing",
  transactional: "transactional",
  security: "transactional",
  notification: "service",
  support: "service",
};

/** WhatsApp's projected (local) consent status. */
export const WHATSAPP_CONSENT_STATUSES = ["unknown", "opted_in", "opted_out"] as const;
export type WhatsAppConsentStatus = (typeof WHATSAPP_CONSENT_STATUSES)[number];

/**
 * CRM → WhatsApp projection. WhatsApp's store has ONE marketing status per
 * phone and `opted_out` blocks every WhatsApp message. So:
 * - a wildcard opt-out suppresses the number (`opted_out`);
 * - an opt-out of one non-essential purpose only withdraws the marketing grant
 *   (`unknown`), it must not block service messages;
 * - `pending` and `not_set` are never a grant (`unknown`);
 * - `subscribed` for a non-essential purpose (or wildcard) is `opted_in`.
 * Essential purposes are not represented in WhatsApp's marketing status.
 */
export function whatsappStatusForCrm(purpose: CommunicationPurposeScope, status: ConsentStatus): WhatsAppConsentStatus | null {
  if (purpose !== PURPOSE_WILDCARD && isEssentialPurpose(purpose)) {
    return null;
  }
  if (status === "unsubscribed") return purpose === PURPOSE_WILDCARD ? "opted_out" : "unknown";
  if (status === "subscribed") return "opted_in";
  return "unknown";
}

/** WhatsApp → CRM (only an inbound STOP travels this way today). */
export function crmStatusForWhatsApp(status: WhatsAppConsentStatus): ConsentStatus {
  return status === "opted_in" ? "subscribed" : status === "opted_out" ? "unsubscribed" : "not_set";
}

// ── Double opt-in ───────────────────────────────────────────────────────────

export const DOUBLE_OPT_IN_STATUSES = ["pending", "confirmed", "expired", "cancelled"] as const;
export type DoubleOptInStatus = (typeof DOUBLE_OPT_IN_STATUSES)[number];

export const DEFAULT_DOUBLE_OPT_IN_TTL_HOURS = 72;

/** Jurisdictions where double opt-in is ON by default for non-essential email. */
export const DOUBLE_OPT_IN_DEFAULT_COUNTRIES = ["CO"] as const;

/**
 * Default DOI policy when a workspace has not configured one: ON for
 * non-essential purposes on email in Colombian workspaces (Ley 1581 art. 9:
 * the controller must be able to prove the authorization). A workspace may
 * turn it off or on per channel and purpose.
 */
export function defaultDoubleOptInRequired(input: { country: string | null | undefined; channel: CommunicationChannel; purpose: CommunicationPurpose }): boolean {
  const country = String(input.country ?? "").trim().toUpperCase();
  return input.channel === "email"
    && isNonEssentialPurpose(input.purpose)
    && (DOUBLE_OPT_IN_DEFAULT_COUNTRIES as readonly string[]).includes(country);
}

// ── Authorization evidence (Habeas Data, Ley 1581 art. 9; Decreto 1377/2013) ─

/**
 * What must be provable about an authorization: what was authorized (purposes),
 * the exact text shown (version + hash), where (channel/surface), when, from
 * where (IP, user agent) and under which privacy policy version.
 */
export const ConsentAuthorizationEvidenceSchema = z.object({
  purposes: z.array(z.enum(COMMUNICATION_PURPOSES)).min(1).max(COMMUNICATION_PURPOSES.length),
  channel: z.enum(COMMUNICATION_CHANNELS),
  /** Where the person authorized: `form`, `preference_center`, `double_opt_in`, `api`, … */
  surface: z.string().trim().min(1).max(80),
  /** Version id of the text shown (e.g. the form version id). */
  textVersion: z.string().trim().min(1).max(200),
  /** sha256 hex of the exact text shown, when the text is known. */
  textSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** The text itself, bounded (label of the consent checkbox). */
  text: z.string().max(4_000).optional(),
  privacyPolicyVersion: z.string().trim().min(1).max(200).nullable().optional(),
  privacyPolicyUrl: z.string().url().max(2_000).nullable().optional(),
  capturedAt: z.string().datetime(),
  ip: z.string().trim().max(64).nullable().optional(),
  userAgent: z.string().max(1_000).nullable().optional(),
  formId: z.string().max(160).optional(),
  formVersionId: z.string().max(160).optional(),
  submissionId: z.string().max(160).optional(),
}).strict();
export type ConsentAuthorizationEvidence = z.infer<typeof ConsentAuthorizationEvidenceSchema>;

// ── Projection and erasure wire contracts ───────────────────────────────────

/** CRM → product: the current decision for one endpoint (idempotent by `decisionId`). */
export const ConsentProjectionSchema = z.object({
  decisionId: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200),
  environment: z.string().min(1).max(200),
  contactId: z.string().min(1).max(200),
  channel: z.enum(COMMUNICATION_CHANNELS),
  endpointValue: z.string().min(1).max(320),
  connectedAccountId: z.string().min(1).max(200).default("*"),
  purpose: z.union([z.enum(COMMUNICATION_PURPOSES), z.literal(PURPOSE_WILDCARD)]),
  status: z.enum(CONSENT_STATUSES),
  source: z.enum(CONSENT_SOURCES),
  originProduct: z.enum(CONSENT_PRODUCTS).nullable().default(null),
  effectiveAt: z.string().datetime(),
}).strict();
export type ConsentProjection = z.infer<typeof ConsentProjectionSchema>;

export const ERASURE_TARGET_PRODUCTS = ["send", "whatsapp", "engagement", "campaigns", "data", "forms"] as const;
export type ErasureTargetProduct = (typeof ERASURE_TARGET_PRODUCTS)[number];

export const ERASURE_TASK_STATUSES = ["pending", "processing", "succeeded", "skipped", "failed", "dead"] as const;
export type ErasureTaskStatus = (typeof ERASURE_TASK_STATUSES)[number];

export const ERASURE_REQUEST_STATUSES = ["in_progress", "completed", "failed"] as const;
export type ErasureRequestStatus = (typeof ERASURE_REQUEST_STATUSES)[number];

/** Business-hours SLA for completing an erasure fan-out (Ley 1581 art. 15: 15 días hábiles). */
export const ERASURE_SLA_BUSINESS_DAYS = 15;

/**
 * What CRM sends to every product when a contact is erased. `tombstones` are
 * sha256 hex of `${organizationId}:${erasureIdentifierKey(kind, value)}`:
 * products keep only that hash after erasure, so an opt-out keeps being
 * honoured without keeping the address (hashing lives in each Node service;
 * this module stays browser-safe).
 */
export const ErasureRequestSchema = z.object({
  erasureId: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200),
  environment: z.string().min(1).max(200),
  contactId: z.string().min(1).max(200),
  emails: z.array(z.string().max(320)).max(20).default([]),
  phones: z.array(z.string().max(40)).max(20).default([]),
  /** Tombstones (sha256 hex) of every endpoint, for suppressions that must survive. */
  tombstones: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(40).default([]),
  requestedAt: z.string().datetime(),
  reason: z.enum(["habeas_data_supresion", "gdpr_art17", "operator_request", "account_closure"]),
}).strict();
export type ErasureRequest = z.infer<typeof ErasureRequestSchema>;

export const ErasureResultSchema = z.object({
  product: z.enum(ERASURE_TARGET_PRODUCTS),
  status: z.enum(["succeeded", "skipped"]),
  /** Counts per table/entity; never identifiers. */
  affected: z.record(z.string(), z.number().int().nonnegative()).default({}),
  retained: z.array(z.object({ entity: z.string().max(120), reason: z.string().max(500) })).max(20).default([]),
}).strict();
export type ErasureResult = z.infer<typeof ErasureResultSchema>;

/** Normalises an email/phone the same way everywhere before hashing. */
export function erasureIdentifierKey(kind: "email" | "phone", value: string): string {
  const trimmed = value.trim();
  if (kind === "email") return `email:${trimmed.toLowerCase()}`;
  return `phone:${trimmed.replace(/\D/g, "")}`;
}

// ── Habeas Data (Ley 1581 de 2012, Colombia) ───────────────────────────────

export const HABEAS_DATA_REQUEST_KINDS = ["consulta", "reclamo"] as const;
export type HabeasDataRequestKind = (typeof HABEAS_DATA_REQUEST_KINDS)[number];

/** Art. 15: corrección, actualización, supresión, or presunto incumplimiento; art. 8 e) revocatoria. */
export const HABEAS_DATA_RECLAMO_TYPES = ["correccion", "actualizacion", "supresion", "revocatoria", "incumplimiento"] as const;
export type HabeasDataReclamoType = (typeof HABEAS_DATA_RECLAMO_TYPES)[number];

export const HABEAS_DATA_REQUEST_STATUSES = [
  "received",
  "incomplete",
  "in_progress",
  "extended",
  "resolved",
  "withdrawn",
  "transferred",
] as const;
export type HabeasDataRequestStatus = (typeof HABEAS_DATA_REQUEST_STATUSES)[number];

/**
 * Legal terms, in días hábiles unless noted. Source: Ley 1581 de 2012,
 * arts. 14 and 15 (text verified 2026-09-28 at Función Pública, Gestor
 * Normativo, norma 49981):
 * - Consulta: 10 días hábiles «contados a partir de la fecha de recibo»;
 *   extendable once by up to 5 días hábiles after the first term, informing
 *   the reasons.
 * - Reclamo: 15 días hábiles «contados a partir del día siguiente a la fecha
 *   de su recibo»; extendable by up to 8 días hábiles.
 * - Reclamo incompleto: require the corrections within 5 días (the law says
 *   «días», not hábiles); after 2 meses without them, it is desistido.
 * - Not competent: traslado within 2 días hábiles.
 * - Leyenda «reclamo en trámite» in the database within 2 días hábiles of a
 *   complete reclamo, kept until decided.
 *
 * These are only the TERM COUNTS. The dates are never computed from a copy of
 * holidays here: `products/customy-crm/src/services/habeas-data.ts` turns them
 * into deadlines with the business calendar of `@customy/atlas-core` — the same
 * rules Customy Atlas serves at `/v1/business-days/add` — so there is no second
 * holiday list behind these terms (audit Ola 1, 2026-10-02). `ERASURE_SLA_BUSINESS_DAYS`
 * must also be applied through that calendar, never with `Date` arithmetic.
 */
export const HABEAS_DATA_TERMS = {
  consulta: { businessDays: 10, extensionBusinessDays: 5, startsOn: "receipt_day" },
  reclamo: { businessDays: 15, extensionBusinessDays: 8, startsOn: "next_day" },
  incompleteRequirementDays: 5,
  desistimientoMonths: 2,
  trasladoBusinessDays: 2,
  legendBusinessDays: 2,
} as const;
