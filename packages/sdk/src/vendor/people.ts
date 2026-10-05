/**
 * Personas y roles — el modelo universal de personas de Customy.
 *
 * Una persona existe una sola vez por tenant (organización + proyecto + ambiente).
 * Lo que cambia son sus roles: cada asignación es persona × tipo de rol ×
 * contexto × vigencia, con estado, etapa, origen y datos propios. No hay un
 * «tipo de contacto» en la persona.
 *
 * - Customy trae familias núcleo y paquetes por sector; cada tenant crea sus
 *   propios tipos colgados de una familia, así el análisis entre tenants sigue
 *   funcionando.
 * - Existir en Personas no autoriza marketing: `evaluateContactability` cruza
 *   estado de la persona, roles vigentes, propósito, canal y consentimientos.
 * - CRM es dueño de personas, roles, relaciones, grupos, identificadores y del
 *   registro de consentimientos; Data resuelve identidad y calcula los roles
 *   calculados (activo, dormido…); Analytics guarda las métricas.
 *
 * Diseño: docs/CUSTOMY_PEOPLE_ROLES_MODEL.md.
 */
import { z } from "zod";
import { COMMUNICATION_CHANNELS, COMMUNICATION_PURPOSES, PURPOSE_WILDCARD } from "./communication-consent.js";

// ─── Vocabulario ─────────────────────────────────────────────────────

export const PERSON_ROLE_FAMILIES = [
  "commercial",
  "product_usage",
  "account",
  "buying_group",
  "partner",
  "supplier",
  "talent",
  "community",
  "financial",
  "support",
  "legal",
  "event",
  "health",
  "education",
  "real_estate",
  "nonprofit",
  "insurance",
  "marketplace",
  "hospitality",
  "automotive",
  "retail",
  "government",
  "media",
  "location",
  "sports",
  "benefits",
] as const;
export type PersonRoleFamily = (typeof PERSON_ROLE_FAMILIES)[number];
export const PersonRoleFamilySchema = z.enum(PERSON_ROLE_FAMILIES);

/** De qué es el rol: cliente *de la marca*, campeón *en la oportunidad*, usuario *de la app*. */
export const PERSON_ROLE_CONTEXT_KINDS = [
  "none",
  "brand",
  "product",
  "application",
  "account",
  "opportunity",
  "location",
  "program",
  "event",
  "case",
  "community",
  "asset",
  "organization",
  "group",
] as const;
export type PersonRoleContextKind = (typeof PERSON_ROLE_CONTEXT_KINDS)[number];
export const PersonRoleContextKindSchema = z.enum(PERSON_ROLE_CONTEXT_KINDS);

export const PERSON_ROLE_STATUSES = ["pending", "active", "suspended", "ended"] as const;
export type PersonRoleStatus = (typeof PERSON_ROLE_STATUSES)[number];
export const PersonRoleStatusSchema = z.enum(PERSON_ROLE_STATUSES);

/** Bases legales (RGPD art. 6; Ley 1581 autorización; LGPD art. 7). */
export const LEGAL_BASES = [
  "contract",
  "consent",
  "legitimate_interest",
  "legal_obligation",
  "vital_interest",
  "public_task",
  "none",
] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];
export const LegalBasisSchema = z.enum(LEGAL_BASES);

/** Qué admite un rol para marketing, antes de mirar consentimientos. */
export const ROLE_MARKETING_POLICIES = ["with_consent", "never"] as const;
export type RoleMarketingPolicy = (typeof ROLE_MARKETING_POLICIES)[number];

export const PERSON_STATES = ["active", "deceased", "erased", "fraud_suspended"] as const;
export type PersonState = (typeof PERSON_STATES)[number];
export const PersonStateSchema = z.enum(PERSON_STATES);

export const PERSON_IDENTIFIER_TYPES = [
  "email",
  "phone",
  "access_user_id",
  "application_user_id",
  "whatsapp_id",
  "anonymous_id",
  "external_crm_id",
  "national_id",
  "tax_id",
  "loyalty_id",
  "device_id",
  "custom",
] as const;
export type PersonIdentifierType = (typeof PERSON_IDENTIFIER_TYPES)[number];
export const PersonIdentifierTypeSchema = z.enum(PERSON_IDENTIFIER_TYPES);

/** Identificadores que unen personas solos (reglas exactas). El resto solo sugiere. */
export const DETERMINISTIC_IDENTIFIER_TYPES: readonly PersonIdentifierType[] = [
  "access_user_id",
  "application_user_id",
  "email",
  "phone",
  "whatsapp_id",
  "external_crm_id",
  "national_id",
  "tax_id",
];

/** Prioridad al unir: menor número gana (Segment Unify). */
export const IDENTIFIER_PRIORITY: Readonly<Record<PersonIdentifierType, number>> = {
  access_user_id: 1,
  application_user_id: 2,
  national_id: 3,
  tax_id: 3,
  email: 4,
  phone: 5,
  whatsapp_id: 5,
  external_crm_id: 6,
  loyalty_id: 7,
  device_id: 8,
  anonymous_id: 9,
  custom: 10,
};

/**
 * Tope de identificadores por Persona y tipo (estilo Segment). Se aplica AL
 * ENLAZAR, nunca al fusionar, y nunca une a dos personas por pasarse del tope.
 *
 * - `perApplication`: el tope cuenta por clave de app (`<clave>:<id>`).
 * - `evictOldest`: al llegar al tope se libera el identificador sin verificar
 *   más antiguo para hacer sitio; un verificado nunca se libera así. Sin esa
 *   marca, el nuevo solo entra si es verificado y hay uno sin verificar al que
 *   sustituir; si no, se rechaza y queda constancia (`identifier_limit`).
 */
export type IdentifierLimit = Readonly<{ max: number; perApplication?: boolean; evictOldest?: boolean }>;
export const IDENTIFIER_LIMIT_DEFAULTS: Readonly<Record<PersonIdentifierType, IdentifierLimit>> = {
  access_user_id: { max: 1 },
  application_user_id: { max: 1, perApplication: true },
  national_id: { max: 2 },
  tax_id: { max: 2 },
  email: { max: 5 },
  phone: { max: 5 },
  whatsapp_id: { max: 5 },
  external_crm_id: { max: 10 },
  loyalty_id: { max: 5 },
  device_id: { max: 20, evictOldest: true },
  anonymous_id: { max: 20, evictOldest: true },
  custom: { max: 20 },
};
/** Un inquilino puede subir o bajar el tope, dentro de estos márgenes. */
export const IDENTIFIER_LIMIT_CEILING = 100;

export const IdentifierLimitsInputSchema = z
  .object({
    limits: z.record(PersonIdentifierTypeSchema, z.object({ max: z.number().int().min(1).max(IDENTIFIER_LIMIT_CEILING), evictOldest: z.boolean().optional() }).strict()),
  })
  .strict();
export type IdentifierLimitsInput = z.infer<typeof IdentifierLimitsInputSchema>;

/** Qué pasó con un identificador que no cabía. Nunca lleva el valor. */
export type IdentifierLimitNote = Readonly<{
  code: "identifier_limit";
  type: PersonIdentifierType;
  limit: number;
  /** `refused`: no se enlazó; `evicted`: entró y se liberó otro sin verificar. */
  action: "refused" | "evicted";
  valueFingerprint: string;
  evictedFingerprint?: string;
}>;

/** Valores que nunca unen personas. */
const BLOCKED_IDENTIFIER_VALUES = new Set([
  "",
  "null",
  "undefined",
  "none",
  "n/a",
  "na",
  "-1",
  "0",
  "anonymous",
  "unknown",
  "test@test.com",
  "test@example.com",
  "noreply@example.com",
  "0000000",
  "00000000",
  "0000000000",
  "1234567",
  "1234567890",
]);
const SHARED_MAILBOX_LOCAL_PARTS = new Set(["info", "contacto", "contact", "ventas", "sales", "admin", "hola", "hello", "support", "soporte", "noreply", "no-reply"]);

export function normalizeIdentifierValue(type: PersonIdentifierType, value: string): string {
  const trimmed = value.trim();
  if (type === "email") return trimmed.toLowerCase();
  if (type === "phone" || type === "whatsapp_id") {
    const digits = trimmed.replace(/[^\d+]/g, "");
    return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits.replace(/\+/g, "");
  }
  if (type === "national_id" || type === "tax_id") return trimmed.replace(/[\s.\-]/g, "").toUpperCase();
  return trimmed;
}

/** true si el valor puede unir personas por sí solo. */
export function isLinkableIdentifier(type: PersonIdentifierType, value: string): boolean {
  const normalized = normalizeIdentifierValue(type, value);
  if (BLOCKED_IDENTIFIER_VALUES.has(normalized.toLowerCase())) return false;
  if (type === "email") {
    const [local, domain] = normalized.split("@");
    if (!local || !domain || !domain.includes(".")) return false;
    if (SHARED_MAILBOX_LOCAL_PARTS.has(local)) return false;
  }
  if ((type === "phone" || type === "whatsapp_id") && normalized.replace(/\D/g, "").length < 7) return false;
  return DETERMINISTIC_IDENTIFIER_TYPES.includes(type);
}

// ─── Catálogo de tipos de rol ────────────────────────────────────────

export const ROLE_PACKS = [
  "core",
  "fintech",
  "saas",
  "retail",
  "health",
  "education",
  "real_estate",
  "nonprofit",
  "insurance",
  "marketplace",
  "hospitality",
  "automotive",
  "government",
  "media",
  "events",
  "franchise",
  "sports",
  "b2b2c",
] as const;
export type RolePack = (typeof ROLE_PACKS)[number];
export const RolePackSchema = z.enum(ROLE_PACKS);

/** Paquetes activos por defecto en un tenant nuevo. */
export const DEFAULT_ROLE_PACKS: readonly RolePack[] = ["core"];

export type LocalizedLabel = Readonly<{ es: string; en: string; "pt-BR": string }>;

export type RoleTypeDefinition = Readonly<{
  key: string;
  family: PersonRoleFamily;
  pack: RolePack;
  label: LocalizedLabel;
  contextKind: PersonRoleContextKind;
  /** Calculado por Data desde el comportamiento; nadie lo asigna a mano. */
  computed: boolean;
  /** Etapas ordenadas del rol (por ejemplo, el embudo comercial). */
  stages: readonly string[];
  defaultLegalBasis: LegalBasis;
  marketing: RoleMarketingPolicy;
  /** Roles que exigen tratar datos sensibles (salud, identidad financiera). */
  sensitive: boolean;
}>;

type RoleSeed = [
  key: string,
  family: PersonRoleFamily,
  es: string,
  en: string,
  pt: string,
  contextKind: PersonRoleContextKind,
  options?: Partial<Pick<RoleTypeDefinition, "computed" | "stages" | "defaultLegalBasis" | "marketing" | "sensitive">>,
];

function pack(name: RolePack, seeds: readonly RoleSeed[]): RoleTypeDefinition[] {
  return seeds.map(([key, family, es, en, pt, contextKind, options]) => ({
    key,
    family,
    pack: name,
    label: { es, en, "pt-BR": pt },
    contextKind,
    computed: options?.computed ?? false,
    stages: options?.stages ?? [],
    defaultLegalBasis: options?.defaultLegalBasis ?? "contract",
    marketing: options?.marketing ?? "with_consent",
    sensitive: options?.sensitive ?? false,
  }));
}

const NEVER = { marketing: "never" } as const;
const CONSENT = { defaultLegalBasis: "consent" } as const;
const COMPUTED = { computed: true } as const;
const SENSITIVE = { sensitive: true } as const;

export const COMMERCIAL_STAGES = ["subscriber", "lead", "mql", "sal", "sql", "opportunity", "customer", "evangelist"] as const;
export const APP_USAGE_STAGES = ["registered", "activated", "active", "dormant", "reactivated", "deactivated"] as const;

const CORE_ROLE_TYPES = pack("core", [
  // Comercial
  ["known_visitor", "commercial", "Visitante conocido", "Known visitor", "Visitante conhecido", "brand", { ...CONSENT, computed: true }],
  ["subscriber", "commercial", "Suscriptor", "Subscriber", "Assinante", "brand", CONSENT],
  ["lead", "commercial", "Lead", "Lead", "Lead", "brand", { ...CONSENT, stages: COMMERCIAL_STAGES }],
  ["customer", "commercial", "Cliente", "Customer", "Cliente", "brand", { stages: ["first_time", "repeat", "vip", "at_risk", "churned", "won_back"] }],
  ["repeat_customer", "commercial", "Cliente recurrente", "Repeat customer", "Cliente recorrente", "brand", COMPUTED],
  ["vip_customer", "commercial", "Cliente VIP", "VIP customer", "Cliente VIP", "brand", COMPUTED],
  ["advocate", "commercial", "Embajador", "Advocate", "Embaixador", "brand"],
  ["at_risk_customer", "commercial", "Cliente en riesgo", "At-risk customer", "Cliente em risco", "brand", COMPUTED],
  ["churned_customer", "commercial", "Cliente perdido", "Churned customer", "Cliente perdido", "brand"],
  ["disqualified", "commercial", "Descalificado", "Disqualified", "Desqualificado", "brand", { ...CONSENT, ...NEVER }],
  // Uso de producto o app
  ["app_user", "product_usage", "Usuario de app", "App user", "Usuário de app", "application", { stages: APP_USAGE_STAGES }],
  ["anonymous_user", "product_usage", "Usuario anónimo", "Anonymous user", "Usuário anônimo", "application", { ...COMPUTED, ...NEVER, defaultLegalBasis: "legitimate_interest" }],
  ["power_user", "product_usage", "Power user", "Power user", "Power user", "application", COMPUTED],
  ["trial_user", "product_usage", "En prueba", "Trial user", "Em teste", "product"],
  ["freemium_user", "product_usage", "Freemium", "Freemium user", "Freemium", "product"],
  ["paying_user", "product_usage", "Pago", "Paying user", "Pagante", "product"],
  ["past_due_user", "product_usage", "Moroso", "Past due", "Inadimplente", "product"],
  // Cuenta y asientos
  ["workspace_owner", "account", "Dueño del workspace", "Workspace owner", "Dono do workspace", "account"],
  ["account_admin", "account", "Admin", "Admin", "Admin", "account"],
  ["account_member", "account", "Miembro", "Member", "Membro", "account"],
  ["account_guest", "account", "Invitado", "Guest", "Convidado", "account"],
  ["billing_contact", "account", "Contacto de facturación", "Billing contact", "Contato de faturamento", "account"],
  ["technical_contact", "account", "Contacto técnico", "Technical contact", "Contato técnico", "account"],
  ["security_contact", "account", "Contacto de seguridad / DPO", "Security / DPO contact", "Contato de segurança / DPO", "account", NEVER],
  // Comité de compra (va en la oportunidad)
  ["champion", "buying_group", "Campeón", "Champion", "Campeão", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["economic_buyer", "buying_group", "Comprador económico", "Economic buyer", "Comprador econômico", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["decision_maker", "buying_group", "Decisor", "Decision maker", "Decisor", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["technical_evaluator", "buying_group", "Evaluador técnico", "Technical evaluator", "Avaliador técnico", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["influencer", "buying_group", "Influenciador", "Influencer", "Influenciador", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["blocker", "buying_group", "Bloqueador", "Blocker", "Bloqueador", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["end_user_stakeholder", "buying_group", "Usuario final", "End user", "Usuário final", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["procurement", "buying_group", "Compras", "Procurement", "Compras", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["legal_reviewer", "buying_group", "Legal", "Legal", "Jurídico", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  ["executive_sponsor", "buying_group", "Sponsor ejecutivo", "Executive sponsor", "Patrocinador executivo", "opportunity", { defaultLegalBasis: "legitimate_interest" }],
  // Socios y canal
  ["reseller", "partner", "Revendedor", "Reseller", "Revendedor", "program"],
  ["distributor", "partner", "Distribuidor", "Distributor", "Distribuidor", "program"],
  ["referrer", "partner", "Referidor", "Referrer", "Indicador", "program"],
  ["affiliate", "partner", "Afiliado", "Affiliate", "Afiliado", "program"],
  ["creator", "partner", "Creador / influencer", "Creator / influencer", "Criador / influenciador", "program"],
  ["brand_ambassador", "partner", "Embajador de marca", "Brand ambassador", "Embaixador de marca", "program"],
  ["integrator", "partner", "Integrador", "Integrator", "Integrador", "program"],
  ["agency", "partner", "Agencia", "Agency", "Agência", "program"],
  // Proveedores
  ["vendor", "supplier", "Proveedor", "Vendor", "Fornecedor", "organization"],
  ["contractor", "supplier", "Contratista", "Contractor", "Prestador", "organization"],
  ["freelancer", "supplier", "Freelancer", "Freelancer", "Freelancer", "organization"],
  ["gig_worker", "supplier", "Trabajador de plataforma", "Gig worker", "Trabalhador de plataforma", "organization"],
  // Talento
  ["candidate", "talent", "Candidato", "Candidate", "Candidato", "organization", { ...NEVER, stages: ["applied", "screening", "interview", "offer", "hired", "rejected"] }],
  ["employee", "talent", "Empleado", "Employee", "Funcionário", "organization", NEVER],
  ["intern", "talent", "Practicante", "Intern", "Estagiário", "organization", NEVER],
  ["alumni_employee", "talent", "Exempleado", "Former employee", "Ex-funcionário", "organization", { defaultLegalBasis: "consent" }],
  // Comunidad
  ["community_member", "community", "Miembro de comunidad", "Community member", "Membro da comunidade", "community"],
  ["top_contributor", "community", "Contribuidor destacado", "Top contributor", "Contribuidor destaque", "community", COMPUTED],
  ["moderator", "community", "Moderador", "Moderator", "Moderador", "community"],
  ["community_admin", "community", "Admin de comunidad", "Community admin", "Admin da comunidade", "community"],
  ["event_host", "community", "Anfitrión de eventos", "Event host", "Anfitrião de eventos", "community"],
  // Financiero
  ["payer", "financial", "Pagador", "Payer", "Pagador", "account"],
  ["account_holder", "financial", "Titular", "Account holder", "Titular", "account", SENSITIVE],
  ["joint_holder", "financial", "Cotitular", "Joint holder", "Cotitular", "account", SENSITIVE],
  ["authorized_signer", "financial", "Firmante autorizado", "Authorized signer", "Signatário autorizado", "account", SENSITIVE],
  ["cardholder", "financial", "Tarjetahabiente", "Cardholder", "Portador do cartão", "account", SENSITIVE],
  ["beneficiary", "financial", "Beneficiario", "Beneficiary", "Beneficiário", "account", { ...SENSITIVE, ...NEVER }],
  ["guarantor", "financial", "Codeudor / garante", "Guarantor", "Fiador", "account", { ...SENSITIVE, ...NEVER }],
  ["debtor_in_collections", "financial", "Deudor en cobranza", "Debtor in collections", "Devedor em cobrança", "account", { ...SENSITIVE, ...NEVER }],
  ["ultimate_beneficial_owner", "financial", "Beneficiario final (UBO)", "Ultimate beneficial owner", "Beneficiário final (UBO)", "organization", { ...SENSITIVE, ...NEVER, defaultLegalBasis: "legal_obligation" }],
  // Soporte
  ["requester", "support", "Solicitante", "Requester", "Solicitante", "case", NEVER],
  ["cc_participant", "support", "En copia", "CC participant", "Em cópia", "case", NEVER],
  ["affected_user", "support", "Afectado", "Affected user", "Afetado", "case", NEVER],
  ["acting_on_behalf", "support", "Actúa en nombre de otro", "Acting on behalf", "Age em nome de outro", "case", NEVER],
  // Legal y privacidad
  ["data_subject", "legal", "Titular de datos", "Data subject", "Titular de dados", "none", { defaultLegalBasis: "legal_obligation" }],
  ["legal_guardian", "legal", "Representante legal / tutor", "Legal guardian", "Responsável legal", "none", { ...NEVER, defaultLegalBasis: "legal_obligation" }],
  ["attorney_in_fact", "legal", "Apoderado", "Attorney in fact", "Procurador", "none", { ...NEVER, defaultLegalBasis: "legal_obligation" }],
  ["estate_heir", "legal", "Heredero / sucesión", "Heir / estate", "Herdeiro / espólio", "none", { ...NEVER, defaultLegalBasis: "legal_obligation" }],
  // Eventos
  ["event_registrant", "event", "Inscrito", "Registrant", "Inscrito", "event"],
  ["event_attendee", "event", "Asistente", "Attendee", "Participante", "event"],
  ["event_no_show", "event", "No asistió", "No-show", "Não compareceu", "event", COMPUTED],
  ["speaker", "event", "Speaker", "Speaker", "Palestrante", "event"],
  ["sponsor_contact", "event", "Contacto del patrocinador", "Sponsor contact", "Contato do patrocinador", "event"],
  ["exhibitor", "event", "Expositor", "Exhibitor", "Expositor", "event"],
  ["event_volunteer", "event", "Voluntario", "Volunteer", "Voluntário", "event"],
]);

const SECTOR_ROLE_TYPES = [
  ...pack("fintech", [
    ["kyc_subject", "financial", "Sujeto KYC", "KYC subject", "Sujeito KYC", "account", { ...SENSITIVE, ...NEVER, defaultLegalBasis: "legal_obligation" }],
    ["borrower", "financial", "Deudor de crédito", "Borrower", "Tomador de crédito", "account", SENSITIVE],
    ["investor", "financial", "Inversionista", "Investor", "Investidor", "account", SENSITIVE],
    ["savings_goal_member", "financial", "Miembro de fondo de ahorro", "Savings fund member", "Membro de fundo de poupança", "group"],
    ["expense_group_member", "financial", "Miembro de grupo de gastos", "Expense group member", "Membro de grupo de despesas", "group"],
  ]),
  ...pack("saas", [
    ["seat_user", "account", "Usuario de asiento", "Seat user", "Usuário de assento", "account"],
    ["api_developer", "account", "Desarrollador API", "API developer", "Desenvolvedor API", "account"],
    ["reseller_managed_admin", "account", "Admin gestionado por revendedor", "Reseller-managed admin", "Admin gerenciado por revendedor", "account"],
  ]),
  ...pack("retail", [
    ["shopper", "retail", "Comprador", "Shopper", "Comprador", "brand"],
    ["loyalty_member", "retail", "Miembro de lealtad", "Loyalty member", "Membro de fidelidade", "program", { stages: ["base", "silver", "gold", "platinum"] }],
    ["box_subscriber", "retail", "Suscriptor de caja", "Box subscriber", "Assinante de caixa", "product"],
    ["gift_giver", "retail", "Quien regala", "Gift giver", "Quem presenteia", "brand"],
    ["gift_recipient", "retail", "Quien recibe un regalo", "Gift recipient", "Quem recebe presente", "brand", NEVER],
    ["reviewer", "retail", "Reseñador", "Reviewer", "Avaliador", "product"],
    ["wholesale_buyer", "retail", "Mayorista", "Wholesale buyer", "Atacadista", "organization"],
  ]),
  ...pack("health", [
    ["patient", "health", "Paciente", "Patient", "Paciente", "location", { ...SENSITIVE, ...NEVER }],
    ["attending_practitioner", "health", "Médico tratante", "Attending practitioner", "Médico responsável", "location", NEVER],
    ["referring_practitioner", "health", "Médico remitente", "Referring practitioner", "Médico solicitante", "location"],
    ["caregiver", "health", "Cuidador", "Caregiver", "Cuidador", "none", { ...SENSITIVE, ...NEVER }],
    ["emergency_contact", "health", "Contacto de emergencia", "Emergency contact", "Contato de emergência", "none", { ...NEVER, defaultLegalBasis: "vital_interest" }],
    ["health_guarantor", "health", "Garante", "Guarantor", "Garantidor", "none", { ...SENSITIVE, ...NEVER }],
    ["interpreter", "health", "Intérprete", "Interpreter", "Intérprete", "none", NEVER],
  ]),
  ...pack("education", [
    ["prospective_student", "education", "Prospecto", "Prospective student", "Prospecto", "program", CONSENT],
    ["applicant", "education", "Aspirante", "Applicant", "Candidato", "program", { stages: ["applied", "admitted", "enrolled", "declined"] }],
    ["student", "education", "Estudiante", "Student", "Estudante", "program"],
    ["guardian_parent", "education", "Acudiente", "Parent / guardian", "Responsável", "program"],
    ["alumnus", "education", "Egresado", "Alumnus", "Ex-aluno", "program", CONSENT],
    ["faculty", "education", "Docente", "Faculty", "Docente", "organization", NEVER],
    ["employer_partner", "education", "Empresa aliada", "Employer partner", "Empresa parceira", "organization"],
  ]),
  ...pack("real_estate", [
    ["property_buyer", "real_estate", "Comprador de inmueble", "Property buyer", "Comprador de imóvel", "asset"],
    ["property_seller", "real_estate", "Vendedor de inmueble", "Property seller", "Vendedor de imóvel", "asset"],
    ["tenant", "real_estate", "Arrendatario", "Tenant", "Inquilino", "asset"],
    ["landlord", "real_estate", "Arrendador", "Landlord", "Locador", "asset"],
    ["listing_agent", "real_estate", "Agente captador", "Listing agent", "Corretor captador", "asset"],
    ["buyers_agent", "real_estate", "Agente del comprador", "Buyer's agent", "Corretor do comprador", "asset"],
    ["property_manager", "real_estate", "Administrador", "Property manager", "Administrador", "asset"],
    ["lease_guarantor", "real_estate", "Fiador", "Lease guarantor", "Fiador", "asset", NEVER],
  ]),
  ...pack("nonprofit", [
    ["donor", "nonprofit", "Donante", "Donor", "Doador", "program", { stages: ["first_time", "recurring", "major", "lapsed"] }],
    ["volunteer", "nonprofit", "Voluntario", "Volunteer", "Voluntário", "program"],
    ["program_beneficiary", "nonprofit", "Beneficiario", "Program beneficiary", "Beneficiário", "program", { ...SENSITIVE, ...NEVER }],
    ["board_member", "nonprofit", "Miembro de junta", "Board member", "Membro do conselho", "organization"],
    ["nonprofit_member", "nonprofit", "Socio", "Member", "Associado", "program"],
  ]),
  ...pack("insurance", [
    ["policyholder", "insurance", "Tomador", "Policyholder", "Segurado titular", "asset"],
    ["insured", "insurance", "Asegurado", "Insured", "Segurado", "asset", SENSITIVE],
    ["policy_beneficiary", "insurance", "Beneficiario de póliza", "Policy beneficiary", "Beneficiário da apólice", "asset", { ...SENSITIVE, ...NEVER }],
    ["premium_payer", "insurance", "Pagador de prima", "Premium payer", "Pagador do prêmio", "asset"],
    ["claimant", "insurance", "Reclamante", "Claimant", "Reclamante", "case", { ...SENSITIVE, ...NEVER }],
    ["insurance_broker", "insurance", "Corredor", "Broker", "Corretor", "organization"],
  ]),
  ...pack("marketplace", [
    ["marketplace_buyer", "marketplace", "Comprador", "Buyer", "Comprador", "application"],
    ["marketplace_seller", "marketplace", "Vendedor", "Seller", "Vendedor", "application"],
    ["host", "marketplace", "Anfitrión", "Host", "Anfitrião", "application"],
    ["guest", "marketplace", "Huésped", "Guest", "Hóspede", "application"],
    ["driver", "marketplace", "Conductor", "Driver", "Motorista", "application"],
    ["rider", "marketplace", "Pasajero", "Rider", "Passageiro", "application"],
    ["service_provider", "marketplace", "Proveedor de servicio", "Service provider", "Prestador de serviço", "application"],
  ]),
  ...pack("hospitality", [
    ["hotel_guest", "hospitality", "Huésped", "Hotel guest", "Hóspede", "location"],
    ["booker", "hospitality", "Quien reserva", "Booker", "Quem reserva", "brand"],
    ["traveler", "hospitality", "Viajero", "Traveler", "Viajante", "brand"],
    ["travel_companion", "hospitality", "Acompañante", "Companion", "Acompanhante", "brand", NEVER],
    ["travel_manager", "hospitality", "Travel manager", "Travel manager", "Gestor de viagens", "organization"],
  ]),
  ...pack("automotive", [
    ["vehicle_prospect", "automotive", "Prospecto de vehículo", "Vehicle prospect", "Prospecto de veículo", "brand", CONSENT],
    ["vehicle_owner", "automotive", "Propietario", "Vehicle owner", "Proprietário", "asset"],
    ["vehicle_co_owner", "automotive", "Copropietario", "Co-owner", "Coproprietário", "asset"],
    ["vehicle_driver", "automotive", "Conductor", "Driver", "Condutor", "asset"],
    ["lessee", "automotive", "Arrendatario", "Lessee", "Arrendatário", "asset"],
    ["fleet_manager", "automotive", "Gestor de flota", "Fleet manager", "Gestor de frota", "organization"],
    ["service_customer", "automotive", "Cliente de taller", "Service customer", "Cliente de oficina", "location"],
  ]),
  ...pack("government", [
    ["citizen", "government", "Ciudadano", "Citizen", "Cidadão", "none", { ...NEVER, defaultLegalBasis: "public_task" }],
    ["gov_applicant", "government", "Solicitante", "Applicant", "Requerente", "case", { ...NEVER, defaultLegalBasis: "public_task" }],
    ["taxpayer", "government", "Contribuyente", "Taxpayer", "Contribuinte", "none", { ...SENSITIVE, ...NEVER, defaultLegalBasis: "legal_obligation" }],
    ["benefit_recipient", "government", "Beneficiario", "Benefit recipient", "Beneficiário", "program", { ...SENSITIVE, ...NEVER, defaultLegalBasis: "public_task" }],
    ["licensee", "government", "Licenciatario", "Licensee", "Licenciado", "none", { ...NEVER, defaultLegalBasis: "public_task" }],
  ]),
  ...pack("media", [
    ["anonymous_reader", "media", "Lector anónimo", "Anonymous reader", "Leitor anônimo", "brand", { ...COMPUTED, ...NEVER, defaultLegalBasis: "legitimate_interest" }],
    ["registered_reader", "media", "Lector registrado", "Registered reader", "Leitor registrado", "brand"],
    ["media_subscriber", "media", "Suscriptor", "Subscriber", "Assinante", "product", { stages: ["paid", "gifted", "group"] }],
    ["contributor_author", "media", "Autor", "Contributor", "Autor", "brand"],
    ["advertiser_contact", "media", "Anunciante", "Advertiser", "Anunciante", "organization"],
  ]),
  ...pack("events", [
    ["vip_attendee", "event", "Asistente VIP", "VIP attendee", "Participante VIP", "event"],
    ["virtual_attendee", "event", "Asistente virtual", "Virtual attendee", "Participante virtual", "event"],
  ]),
  ...pack("franchise", [
    ["franchisee", "location", "Franquiciado", "Franchisee", "Franqueado", "location"],
    ["location_manager", "location", "Gerente de sede", "Location manager", "Gerente de unidade", "location"],
    ["location_staff", "location", "Personal de sede", "Location staff", "Equipe da unidade", "location", NEVER],
    ["location_customer", "location", "Cliente de sede", "Location customer", "Cliente da unidade", "location"],
  ]),
  ...pack("sports", [
    ["club_member", "sports", "Socio", "Club member", "Sócio", "organization"],
    ["fan", "sports", "Hincha", "Fan", "Torcedor", "brand"],
    ["season_ticket_holder", "sports", "Abonado", "Season ticket holder", "Sócio-torcedor", "program"],
    ["athlete", "sports", "Deportista", "Athlete", "Atleta", "organization"],
    ["athlete_parent", "sports", "Padre de deportista", "Athlete's parent", "Responsável do atleta", "organization"],
    ["sponsor", "sports", "Patrocinador", "Sponsor", "Patrocinador", "organization"],
  ]),
  ...pack("b2b2c", [
    ["eligible_employee", "benefits", "Empleado elegible", "Eligible employee", "Funcionário elegível", "organization", CONSENT],
    ["enrolled_beneficiary_user", "benefits", "Usuario inscrito", "Enrolled user", "Usuário inscrito", "organization"],
    ["benefit_dependent", "benefits", "Dependiente", "Dependent", "Dependente", "organization", NEVER],
    ["employer_hr_admin", "benefits", "Admin de RR. HH. del empleador", "Employer HR admin", "Admin de RH do empregador", "organization"],
  ]),
];

export const ROLE_TYPE_CATALOG: readonly RoleTypeDefinition[] = Object.freeze([...CORE_ROLE_TYPES, ...SECTOR_ROLE_TYPES]);

const ROLE_TYPES_BY_KEY = new Map(ROLE_TYPE_CATALOG.map((role) => [role.key, role]));

export function getPlatformRoleType(key: string): RoleTypeDefinition | undefined {
  return ROLE_TYPES_BY_KEY.get(key);
}

export function platformRoleTypesForPacks(packs: readonly RolePack[]): RoleTypeDefinition[] {
  const enabled = new Set<RolePack>(["core", ...packs]);
  return ROLE_TYPE_CATALOG.filter((role) => enabled.has(role.pack));
}

/** Claves de los tipos de rol propios del tenant: prefijo `x_` para no chocar con el catálogo. */
export const TENANT_ROLE_TYPE_KEY = /^x_[a-z][a-z0-9_]{1,62}$/;
export const PLATFORM_ROLE_TYPE_KEY = /^[a-z][a-z0-9_]{1,63}$/;

export const TenantRoleTypeInputSchema = z
  .object({
    key: z.string().regex(TENANT_ROLE_TYPE_KEY),
    family: PersonRoleFamilySchema,
    label: z.object({ es: z.string().min(1).max(120), en: z.string().min(1).max(120).optional(), "pt-BR": z.string().min(1).max(120).optional() }),
    contextKind: PersonRoleContextKindSchema.default("none"),
    stages: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/)).max(24).default([]),
    defaultLegalBasis: LegalBasisSchema.default("contract"),
    marketing: z.enum(ROLE_MARKETING_POLICIES).default("with_consent"),
    sensitive: z.boolean().default(false),
    fields: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
          label: z.string().min(1).max(80),
          type: z.enum(["text", "number", "date", "boolean", "select", "money"]),
          options: z.array(z.string().max(80)).max(50).optional(),
        }),
      )
      .max(40)
      .default([]),
  })
  .strict();
export type TenantRoleTypeInput = z.infer<typeof TenantRoleTypeInputSchema>;

// ─── Relaciones en par ───────────────────────────────────────────────

export type RelationshipTypeDefinition = Readonly<{
  key: string;
  inverseKey: string;
  target: "person" | "organization";
  label: LocalizedLabel;
  inverseLabel: LocalizedLabel;
}>;

type RelationSeed = [key: string, inverseKey: string, target: "person" | "organization", es: string, esInv: string, en: string, enInv: string, pt: string, ptInv: string];

function relations(seeds: readonly RelationSeed[]): RelationshipTypeDefinition[] {
  return seeds.map(([key, inverseKey, target, es, esInv, en, enInv, pt, ptInv]) => ({
    key,
    inverseKey,
    target,
    label: { es, en, "pt-BR": pt },
    inverseLabel: { es: esInv, en: enInv, "pt-BR": ptInv },
  }));
}

export const RELATIONSHIP_TYPE_CATALOG: readonly RelationshipTypeDefinition[] = Object.freeze(
  relations([
    ["spouse_of", "spouse_of", "person", "Cónyuge de", "Cónyuge de", "Spouse of", "Spouse of", "Cônjuge de", "Cônjuge de"],
    ["parent_of", "child_of", "person", "Padre/madre de", "Hijo/a de", "Parent of", "Child of", "Pai/mãe de", "Filho/a de"],
    ["guardian_of", "ward_of", "person", "Tutor de", "Tutelado de", "Guardian of", "Ward of", "Responsável por", "Tutelado de"],
    ["sibling_of", "sibling_of", "person", "Hermano/a de", "Hermano/a de", "Sibling of", "Sibling of", "Irmão/ã de", "Irmão/ã de"],
    ["household_member_of", "household_member_of", "person", "Vive con", "Vive con", "Household member of", "Household member of", "Mora com", "Mora com"],
    ["referrer_of", "referred_by", "person", "Referidor de", "Referido por", "Referrer of", "Referred by", "Indicou", "Indicado por"],
    ["gift_giver_to", "gift_recipient_from", "person", "Regaló a", "Recibió regalo de", "Gift giver to", "Gift recipient from", "Presenteou", "Presenteado por"],
    ["assistant_of", "principal_of", "person", "Asistente de", "Principal de", "Assistant of", "Principal of", "Assistente de", "Principal de"],
    ["booker_for", "traveler_booked_by", "person", "Reserva para", "Viaja reservado por", "Books for", "Travels booked by", "Reserva para", "Viaja reservado por"],
    ["manager_of", "reports_to", "person", "Jefe de", "Reporta a", "Manager of", "Reports to", "Gestor de", "Reporta a"],
    ["guarantor_for", "guaranteed_by", "person", "Codeudor de", "Garantizado por", "Guarantor for", "Guaranteed by", "Fiador de", "Afiançado por"],
    ["caregiver_of", "cared_for_by", "person", "Cuida a", "Cuidado por", "Caregiver of", "Cared for by", "Cuida de", "Cuidado por"],
    ["emergency_contact_for", "has_emergency_contact", "person", "Contacto de emergencia de", "Tiene como contacto de emergencia a", "Emergency contact for", "Has emergency contact", "Contato de emergência de", "Tem como contato de emergência"],
    ["attorney_for", "grantor_of_power_to", "person", "Apoderado de", "Otorgó poder a", "Attorney for", "Granted power to", "Procurador de", "Outorgou poder a"],
    ["employee_of", "employer_of", "organization", "Empleado de", "Empleador de", "Employee of", "Employer of", "Funcionário de", "Empregador de"],
    ["owner_of", "owned_by", "organization", "Dueño de", "Propiedad de", "Owner of", "Owned by", "Dono de", "Pertence a"],
    ["founder_of", "founded_by", "organization", "Fundador de", "Fundada por", "Founder of", "Founded by", "Fundador de", "Fundada por"],
    ["board_member_of", "has_board_member", "organization", "Miembro de junta de", "Tiene en su junta a", "Board member of", "Has board member", "Conselheiro de", "Tem como conselheiro"],
    ["beneficial_owner_of", "has_beneficial_owner", "organization", "Beneficiario final de", "Tiene como beneficiario final a", "Beneficial owner of", "Has beneficial owner", "Beneficiário final de", "Tem como beneficiário final"],
    ["billing_contact_at", "has_billing_contact", "organization", "Contacto de facturación en", "Contacto de facturación", "Billing contact at", "Has billing contact", "Contato de faturamento em", "Contato de faturamento"],
    ["technical_contact_at", "has_technical_contact", "organization", "Contacto técnico en", "Contacto técnico", "Technical contact at", "Has technical contact", "Contato técnico em", "Contato técnico"],
    ["legal_contact_at", "has_legal_contact", "organization", "Contacto legal en", "Contacto legal", "Legal contact at", "Has legal contact", "Contato jurídico em", "Contato jurídico"],
    ["purchasing_contact_at", "has_purchasing_contact", "organization", "Compras en", "Contacto de compras", "Purchasing at", "Has purchasing contact", "Compras em", "Contato de compras"],
    ["partner_at", "has_partner", "organization", "Socio de", "Tiene como socio a", "Partner at", "Has partner", "Sócio de", "Tem como sócio"],
    ["volunteer_at", "has_volunteer", "organization", "Voluntario en", "Tiene como voluntario a", "Volunteer at", "Has volunteer", "Voluntário em", "Tem como voluntário"],
    ["student_at", "has_student", "organization", "Estudiante de", "Tiene como estudiante a", "Student at", "Has student", "Estudante de", "Tem como estudante"],
    ["member_of", "has_member", "organization", "Miembro de", "Tiene como miembro a", "Member of", "Has member", "Membro de", "Tem como membro"],
  ]),
);

const RELATIONSHIP_TYPES_BY_KEY = new Map<string, RelationshipTypeDefinition>();
for (const relation of RELATIONSHIP_TYPE_CATALOG) {
  RELATIONSHIP_TYPES_BY_KEY.set(relation.key, relation);
}

export function getRelationshipType(key: string): RelationshipTypeDefinition | undefined {
  return RELATIONSHIP_TYPES_BY_KEY.get(key);
}

export const PERSON_GROUP_KINDS = ["household", "family", "buying_committee", "team", "class", "cohort", "custom"] as const;
export type PersonGroupKind = (typeof PERSON_GROUP_KINDS)[number];
export const PersonGroupKindSchema = z.enum(PERSON_GROUP_KINDS);

// ─── API compartida (CRM ⇄ Workspace ⇄ SDK) ──────────────────────────

const Id = z.string().min(1).max(128);
const IsoDate = z.string().datetime({ offset: true });

export const PersonRoleSourceSchema = z
  .object({
    channel: z.string().max(64).optional(),
    campaign: z.string().max(200).optional(),
    applicationKey: z.string().max(40).optional(),
    eventId: z.string().max(200).optional(),
    actor: z.string().max(200).optional(),
    evidence: z.string().max(2000).optional(),
  })
  .strict();

export const AssignPersonRoleInputSchema = z
  .object({
    roleTypeKey: z.string().regex(PLATFORM_ROLE_TYPE_KEY),
    contextKind: PersonRoleContextKindSchema.optional(),
    contextId: z.string().max(200).optional(),
    contextLabel: z.string().max(200).optional(),
    status: PersonRoleStatusSchema.default("active"),
    stage: z.string().max(40).optional(),
    validFrom: IsoDate.optional(),
    attributes: z.record(z.unknown()).default({}),
    source: PersonRoleSourceSchema.default({}),
  })
  .strict();
export type AssignPersonRoleInput = z.infer<typeof AssignPersonRoleInputSchema>;

export const UpdatePersonRoleInputSchema = z
  .object({
    status: PersonRoleStatusSchema.optional(),
    stage: z.string().max(40).nullable().optional(),
    attributes: z.record(z.unknown()).optional(),
    contextLabel: z.string().max(200).optional(),
  })
  .strict();

export const EndPersonRoleInputSchema = z
  .object({
    endReason: z.string().min(1).max(200),
    validTo: IsoDate.optional(),
  })
  .strict();

export const PersonIdentifierInputSchema = z
  .object({
    type: PersonIdentifierTypeSchema,
    value: z.string().min(1).max(320),
    source: z.string().max(64).optional(),
    verified: z.boolean().default(false),
    label: z.string().max(80).optional(),
  })
  .strict();
export type PersonIdentifierInput = z.infer<typeof PersonIdentifierInputSchema>;

/**
 * Identificar o crear una persona por sus identificadores, con roles opcionales.
 * Es la puerta única para SDK, apps conectadas e importaciones.
 */
export const IdentifyPersonInputSchema = z
  .object({
    identifiers: z.array(PersonIdentifierInputSchema).min(1).max(20),
    profile: z
      .object({
        firstName: z.string().max(120).optional(),
        lastName: z.string().max(120).optional(),
        displayName: z.string().max(240).optional(),
        locale: z.string().max(16).optional(),
        country: z.string().length(2).optional(),
        timeZone: z.string().max(64).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict()
      .default({}),
    roles: z.array(AssignPersonRoleInputSchema).max(20).default([]),
  })
  .strict();
export type IdentifyPersonInput = z.infer<typeof IdentifyPersonInputSchema>;

export const CreateRelationshipInputSchema = z
  .object({
    typeKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$|^x_[a-z][a-z0-9_]{1,62}$/),
    fromPersonId: Id,
    toPersonId: Id.optional(),
    toAccountId: Id.optional(),
    validFrom: IsoDate.optional(),
    attributes: z
      .object({
        title: z.string().max(200).optional(),
        department: z.string().max(200).optional(),
        workEmail: z.string().email().max(320).optional(),
        workPhone: z.string().max(40).optional(),
        vip: z.boolean().optional(),
      })
      .catchall(z.unknown())
      .default({}),
  })
  .strict()
  .refine((value) => Boolean(value.toPersonId) !== Boolean(value.toAccountId), { message: "toPersonId xor toAccountId" });

export const CreatePersonGroupInputSchema = z
  .object({
    kind: PersonGroupKindSchema,
    name: z.string().min(1).max(200),
    opportunityId: Id.optional(),
    accountId: Id.optional(),
    members: z.array(z.object({ personId: Id, role: z.string().max(80).optional() }).strict()).max(500).default([]),
  })
  .strict();

export type PersonRoleView = Readonly<{
  id: string;
  roleTypeKey: string;
  family: PersonRoleFamily;
  label: string;
  contextKind: PersonRoleContextKind;
  contextId: string | null;
  contextLabel: string | null;
  status: PersonRoleStatus;
  stage: string | null;
  computed: boolean;
  validFrom: string;
  validTo: string | null;
  endReason: string | null;
  lastActivityAt: string | null;
  activityCounts: Record<string, number>;
  attributes: Record<string, unknown>;
  source: z.infer<typeof PersonRoleSourceSchema>;
}>;

export type PersonSummaryView = Readonly<{
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  state: PersonState;
  roles: readonly Pick<PersonRoleView, "roleTypeKey" | "label" | "contextKind" | "contextId" | "contextLabel" | "status" | "stage" | "lastActivityAt">[];
  lastActivityAt: string | null;
  createdAt: string;
  /** Fuerza de relación calculada; `null` mientras no se haya calculado. Aditivo: los clientes viejos la ignoran. */
  strength?: PersonStrengthSummary | null;
}>;

// ─── Fuerza de relación calculada ────────────────────────────────────

/**
 * Etiquetas de la fuerza de relación. La puntuación (0–100) y la etiqueta las
 * calcula CRM desde las interacciones reales de la persona; no es un campo que
 * alguien afirme. Ver `docs/CUSTOMY_PEOPLE_ROLES_MODEL.md` («Fuerza de relación»).
 */
export const RELATIONSHIP_STRENGTH_LABELS = ["nueva", "tibia", "activa", "fuerte", "dormida"] as const;
export const RelationshipStrengthLabelSchema = z.enum(RELATIONSHIP_STRENGTH_LABELS);
export type RelationshipStrengthLabel = z.infer<typeof RelationshipStrengthLabelSchema>;

export const RELATIONSHIP_STRENGTH_FACTOR_KEYS = ["recency", "frequency", "reciprocity", "breadth"] as const;
export type RelationshipStrengthFactorKey = (typeof RELATIONSHIP_STRENGTH_FACTOR_KEYS)[number];

/** Un factor explicable: `value` (0–100) × `weight` = `contribution` (puntos de la puntuación final). */
export type RelationshipStrengthFactor = Readonly<{
  key: RelationshipStrengthFactorKey;
  weight: number;
  value: number;
  contribution: number;
  /** Datos crudos que lo explican (días desde la última, recuentos, canales…). */
  detail: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}>;

export type PersonStrengthSummary = Readonly<{
  score: number;
  label: RelationshipStrengthLabel;
}>;

export type PersonStrengthView = PersonStrengthSummary &
  Readonly<{
    factors: readonly RelationshipStrengthFactor[];
    computedAt: string;
    basedOnLastInteractionAt: string | null;
  }>;

/** Orden de la lista de personas: por creación (por defecto) o por fuerza de relación. */
export const PEOPLE_LIST_SORTS = ["created", "strength"] as const;

/** Filtros de la lista de personas: una vista guardada es solo esto. */
export const PeopleListQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    role: z.string().max(64).optional(),
    family: PersonRoleFamilySchema.optional(),
    contextKind: PersonRoleContextKindSchema.optional(),
    contextId: z.string().max(200).optional(),
    status: PersonRoleStatusSchema.optional(),
    stage: z.string().max(40).optional(),
    activeWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    inactiveForDays: z.coerce.number().int().min(1).max(3650).optional(),
    /** Fuerza de relación mínima (0–100). Excluye a quien aún no tiene fuerza calculada. */
    minStrength: z.coerce.number().int().min(0).max(100).optional(),
    /** Etiqueta de fuerza; varias separadas por coma (`activa,fuerte`). */
    strengthLabel: z
      .string()
      .max(80)
      .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
      .pipe(z.array(RelationshipStrengthLabelSchema).min(1).max(RELATIONSHIP_STRENGTH_LABELS.length))
      .optional(),
    sort: z.enum(PEOPLE_LIST_SORTS).optional(),
    /** Solo aplica con `sort=strength`; por defecto `desc` (las más fuertes primero). */
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().max(400).optional(),
  })
  .strict();
export type PeopleListQuery = z.infer<typeof PeopleListQuerySchema>;

// ─── Regla de rol para segmentos y audiencias ────────────────────────

/**
 * «Tiene un rol así»: la pieza con la que un segmento de CRM o una audiencia
 * de Data dicen «Usuario de app · Bonu · activo en 30 días».
 *
 * Es el mismo vocabulario que `PeopleListQuerySchema` (una vista de Personas
 * se guarda como segmento sin traducir nada), con dos diferencias:
 *
 * - Hace falta `roleTypeKey` o `family`: una regla sin ninguno de los dos
 *   diría «tiene algún rol», que casi siempre es un descuido.
 * - Las ventanas de actividad miran la actividad **del rol** (la de esa app),
 *   no la de la persona: «activo en Bonu» no es «activo en cualquier sitio».
 *
 * Sin `status` vale cualquier rol vigente (`pending|active|suspended`), igual
 * que la lista de Personas; `ended` hay que pedirlo.
 */
export const PersonRoleRuleSchema = z
  .object({
    roleTypeKey: z.string().regex(PLATFORM_ROLE_TYPE_KEY).optional(),
    family: PersonRoleFamilySchema.optional(),
    contextKind: PersonRoleContextKindSchema.optional(),
    contextId: z.string().trim().min(1).max(200).optional(),
    status: PersonRoleStatusSchema.optional(),
    stage: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
    activeWithinDays: z.number().int().min(1).max(365).optional(),
    inactiveForDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (!rule.roleTypeKey && !rule.family)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["roleTypeKey"], message: "ROLE_RULE_NEEDS_ROLE_OR_FAMILY" });
    if (rule.activeWithinDays && rule.inactiveForDays)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inactiveForDays"], message: "ROLE_RULE_ACTIVITY_WINDOWS_EXCLUSIVE" });
    if (rule.stage && !rule.roleTypeKey)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stage"], message: "ROLE_RULE_STAGE_NEEDS_ROLE" });
  });
export type PersonRoleRule = z.infer<typeof PersonRoleRuleSchema>;

export type PersonRoleRuleIssue = Readonly<{
  path: "roleTypeKey" | "family" | "contextKind" | "stage";
  code: "ROLE_TYPE_UNKNOWN" | "ROLE_FAMILY_MISMATCH" | "ROLE_CONTEXT_KIND_MISMATCH" | "ROLE_STAGE_UNKNOWN";
}>;

/** Lo mínimo de un tipo propio del tenant para validar una regla. */
export type RoleRuleCatalogEntry = Pick<RoleTypeDefinition, "key" | "family" | "contextKind" | "stages">;

/**
 * Valida una regla contra el catálogo: los tipos de plataforma siempre; los
 * propios (`x_…`) contra `tenantRoleTypes` cuando quien valida los conoce
 * (CRM) y solo por su forma cuando no (Data, que no lee la base de CRM).
 *
 * El contexto se compara con el del tipo solo si la regla dice uno distinto
 * de `none`: «Usuario de app» con contexto «Marca» no puede coincidir nunca, y
 * un segmento que siempre sale vacío es peor que un error al guardarlo.
 */
export function personRoleRuleIssues(
  rule: PersonRoleRule,
  options: { tenantRoleTypes?: readonly RoleRuleCatalogEntry[] } = {},
): PersonRoleRuleIssue[] {
  const issues: PersonRoleRuleIssue[] = [];
  if (!rule.roleTypeKey) return issues;
  const tenant = TENANT_ROLE_TYPE_KEY.test(rule.roleTypeKey);
  const type: RoleRuleCatalogEntry | undefined = tenant
    ? options.tenantRoleTypes?.find((entry) => entry.key === rule.roleTypeKey)
    : getPlatformRoleType(rule.roleTypeKey);
  if (!type) {
    // Un tipo propio sin catálogo a mano solo se puede juzgar por su forma.
    if (!(tenant && options.tenantRoleTypes === undefined)) issues.push({ path: "roleTypeKey", code: "ROLE_TYPE_UNKNOWN" });
    return issues;
  }
  if (rule.family && rule.family !== type.family) issues.push({ path: "family", code: "ROLE_FAMILY_MISMATCH" });
  if (rule.contextKind && rule.contextKind !== "none" && type.contextKind !== "none" && rule.contextKind !== type.contextKind)
    issues.push({ path: "contextKind", code: "ROLE_CONTEXT_KIND_MISMATCH" });
  if (rule.stage && type.stages.length > 0 && !type.stages.includes(rule.stage)) issues.push({ path: "stage", code: "ROLE_STAGE_UNKNOWN" });
  return issues;
}

/**
 * La regla de rol que describe un filtro de Personas, o null si el filtro no
 * habla de roles. Así «Guardar como segmento» guarda exactamente la vista.
 */
export function personRoleRuleFromPeopleQuery(query: Partial<Omit<PeopleListQuery, "limit" | "cursor" | "search">>): PersonRoleRule | null {
  if (!query.role && !query.family) return null;
  const rule: Record<string, unknown> = {};
  for (const key of ["family", "contextKind", "contextId", "status", "stage", "activeWithinDays", "inactiveForDays"] as const) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== "") rule[key] = value;
  }
  if (query.role) rule.roleTypeKey = query.role;
  const parsed = PersonRoleRuleSchema.safeParse(rule);
  return parsed.success ? parsed.data : null;
}

export type ApplicationUsersSummary = Readonly<{
  applicationKey: string;
  registered: number;
  active1d: number;
  active7d: number;
  active30d: number;
  dormant: number;
  withEmail: number;
  lastActivityAt: string | null;
}>;

export const APPLICATION_USAGE_GRANULARITIES = ["day", "week", "month"] as const;
export type ApplicationUsageGranularity = (typeof APPLICATION_USAGE_GRANULARITIES)[number];

/** Un punto de la serie de uso de una app (un día, una semana ISO o un mes calendario, en la zona horaria pedida). */
export type ApplicationUsagePoint = Readonly<{
  /** Primer día del periodo (YYYY-MM-DD). */
  periodStart: string;
  /** Último día del periodo incluido en la respuesta (el periodo en curso se recorta a `to`). */
  periodEnd: string;
  /** Usuarios activos por día: exacto en `day`; media de los días del periodo en `week|month`. */
  dau: number;
  /** Usuarios distintos activos en los 7 días que terminan en `periodEnd`. */
  wau: number;
  /** Usuarios distintos activos en los 30 días que terminan en `periodEnd`. */
  mau: number;
  /** dau / mau del periodo; null si mau = 0. */
  stickiness: number | null;
  /** Usuarios distintos con actividad dentro del periodo calendario. */
  activeUsers: number;
  newRegistrations: number;
  events: number;
}>;

export type ApplicationUsageKind = Readonly<{ kind: string; events: number; users: number }>;

export type ApplicationUsage = Readonly<{
  applicationKey: string;
  timeZone: string;
  granularity: ApplicationUsageGranularity;
  from: string;
  to: string;
  generatedAt: string;
  /** Último día completo (en la zona horaria) sobre el que se calcula el resumen. */
  summary: Readonly<{
    asOf: string;
    registeredTotal: number;
    dau: number;
    wau: number;
    mau: number;
    /** Media de DAU de los 30 días que terminan en `asOf`, dividida entre el MAU de `asOf`. */
    stickiness: number | null;
  }>;
  series: readonly ApplicationUsagePoint[];
  activity: Readonly<{
    totalEvents: number;
    /** Tipos de actividad más frecuentes del rango, de mayor a menor. */
    kinds: readonly ApplicationUsageKind[];
    /** Eventos de los tipos que no caben en `kinds` (y los sin tipo). */
    otherEvents: number;
    /** Cuántos tipos distintos hubo en el rango (ausente en servicios anteriores). */
    kindsTotal?: number;
    /** Valor de `kindsOffset` para la página siguiente de `kinds`, o null si no hay más. */
    kindsNextOffset?: number | null;
  }>;
  /** Solo si la consulta pidió filtros: todo el panel cuenta únicamente esa actividad. */
  filter?: Readonly<{ kinds: readonly string[]; property: Readonly<{ key: string; value: string }> | null }>;
}>;

export type ApplicationRetentionCohort = Readonly<{
  /** Primer día del periodo de registro (YYYY-MM-DD). */
  cohortStart: string;
  size: number;
  /** Índice = periodos desde el registro (0 = el mismo). null = ese periodo aún no ha empezado. */
  retained: readonly (number | null)[];
  /** retained / size; null si no aplica. */
  rates: readonly (number | null)[];
}>;

export type ApplicationRetention = Readonly<{
  applicationKey: string;
  timeZone: string;
  cohort: "week" | "month";
  periods: number;
  generatedAt: string;
  /** Primer día del periodo en curso: su columna es parcial y sigue creciendo. */
  currentPeriodStart: string;
  cohorts: readonly ApplicationRetentionCohort[];
  stickiness: Readonly<{ asOf: string; dau: number; mau: number; ratio: number | null }>;
}>;

// ─── Contactabilidad: el rol decide la base legal ────────────────────

export const MESSAGE_PURPOSES = ["transactional", "service", "marketing", "sales_outreach", "collections", "research"] as const;
export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];
export const MessagePurposeSchema = z.enum(MESSAGE_PURPOSES);

export type ConsentSignal = Readonly<{
  purpose: MessagePurpose | "analytics" | "offers";
  channel: string;
  status: "granted" | "denied" | "unknown";
}>;

export type ContactabilityInput = Readonly<{
  state: PersonState;
  doNotContact: boolean;
  /** Menor según la edad digital del país; los datos sin edad se tratan como adultos. */
  isMinor: boolean;
  guardianConsent: boolean;
  country: string | null;
  purpose: MessagePurpose;
  channel: string;
  roles: readonly Pick<PersonRoleView, "roleTypeKey" | "status">[];
  consents: readonly ConsentSignal[];
  /** Tipos de rol propios del tenant (para política de marketing y base legal). */
  tenantRoleTypes?: readonly Pick<RoleTypeDefinition, "key" | "marketing" | "defaultLegalBasis">[];
  /**
   * Veredicto de validación del correo vigente de la persona (`services/contact-validation`
   * del CRM). Solo se informa cuando corresponde a la dirección actual. Solo PROHÍBE más:
   * `invalid` corta el correo no transaccional; `risky` corta el de publicidad/ventas/investigación.
   * Ausente o `valid`/`unknown` = el comportamiento de siempre.
   */
  emailVerdict?: "valid" | "risky" | "invalid" | "unknown" | null;
}>;

export type ContactabilityReason =
  | "person_deceased"
  | "person_erased"
  | "person_fraud_suspended"
  | "do_not_contact"
  | "minor_without_guardian_consent"
  | "no_active_role"
  | "service_relationship"
  | "consent_granted"
  | "consent_denied"
  | "consent_missing"
  | "roles_forbid_marketing"
  | "email_invalid"
  | "email_risky"
  | "co_ley_2300_window";

export type ContactabilityDecision = Readonly<{
  allowed: boolean;
  legalBasis: LegalBasis;
  reasons: readonly ContactabilityReason[];
  /** Reglas de horario que el motor de envío debe aplicar (Send ya aplica la Ley 2300). */
  windowRules: readonly "co-ley-2300"[];
}>;

const MARKETING_PURPOSES: readonly MessagePurpose[] = ["marketing", "sales_outreach", "research"];

/**
 * Decide si se puede contactar a una persona para un propósito y canal. Pura y
 * determinista: CRM la usa para la ficha, Campaigns/Flows/Send antes de enviar.
 */
export function evaluateContactability(input: ContactabilityInput): ContactabilityDecision {
  const block = (reason: ContactabilityReason): ContactabilityDecision => ({ allowed: false, legalBasis: "none", reasons: [reason], windowRules: [] });
  if (input.state === "deceased") return block("person_deceased");
  if (input.state === "erased") return block("person_erased");
  if (input.state === "fraud_suspended" && input.purpose !== "transactional") return block("person_fraud_suspended");
  // Un correo que no llega o no es fiable no entra a secuencias. Lo transaccional no se toca: lo pide la persona misma.
  if (input.purpose !== "transactional" && input.channel.split(".")[0]?.toLowerCase() === "email") {
    if (input.emailVerdict === "invalid") return block("email_invalid");
    if (input.emailVerdict === "risky" && MARKETING_PURPOSES.includes(input.purpose)) return block("email_risky");
  }

  const windowRules: "co-ley-2300"[] =
    input.country?.toUpperCase() === "CO" && (MARKETING_PURPOSES.includes(input.purpose) || input.purpose === "collections") ? ["co-ley-2300"] : [];
  const tenantTypes = new Map((input.tenantRoleTypes ?? []).map((role) => [role.key, role]));
  const activeRoles = input.roles
    .filter((role) => role.status === "active")
    .map((role) => tenantTypes.get(role.roleTypeKey) ?? getPlatformRoleType(role.roleTypeKey))
    .filter((role): role is Pick<RoleTypeDefinition, "key" | "marketing" | "defaultLegalBasis"> => Boolean(role));

  if (input.purpose === "transactional" || input.purpose === "service" || input.purpose === "collections") {
    if (input.doNotContact && input.purpose !== "transactional") return block("do_not_contact");
    const serviceRole = activeRoles.find((role) => role.defaultLegalBasis === "contract" || role.defaultLegalBasis === "legal_obligation");
    if (!serviceRole) return { allowed: false, legalBasis: "none", reasons: ["no_active_role"], windowRules };
    return { allowed: true, legalBasis: serviceRole.defaultLegalBasis, reasons: ["service_relationship"], windowRules };
  }

  if (input.doNotContact) return block("do_not_contact");
  if (input.isMinor && !input.guardianConsent) return block("minor_without_guardian_consent");
  if (activeRoles.length > 0 && activeRoles.every((role) => role.marketing === "never")) {
    return { allowed: false, legalBasis: "none", reasons: ["roles_forbid_marketing"], windowRules };
  }
  const relevant = input.consents.filter(
    (consent) => (consent.purpose === input.purpose || consent.purpose === "marketing" || consent.purpose === "offers") && (consent.channel === input.channel || consent.channel === "*"),
  );
  if (relevant.some((consent) => consent.status === "denied")) return { allowed: false, legalBasis: "none", reasons: ["consent_denied"], windowRules };
  if (relevant.some((consent) => consent.status === "granted")) {
    return { allowed: true, legalBasis: "consent", reasons: ["consent_granted", ...(windowRules.length ? (["co_ley_2300_window"] as const) : [])], windowRules };
  }
  return { allowed: false, legalBasis: "none", reasons: ["consent_missing"], windowRules };
}

/** Edad digital de consentimiento por país (RGPD art. 8, COPPA, LGPD, Ley 1581). */
export const DIGITAL_CONSENT_AGE: Readonly<Record<string, number>> = {
  CO: 18,
  US: 13,
  BR: 18,
  MX: 18,
  ES: 14,
  FR: 15,
  DE: 16,
  IT: 14,
  AT: 14,
  DK: 13,
  GB: 13,
  IE: 16,
  NL: 16,
  PT: 13,
  CL: 14,
  AR: 13,
  PE: 14,
};
const DEFAULT_DIGITAL_CONSENT_AGE = 16;

export function isMinorFor(birthDate: string | null, country: string | null, today: Date = new Date()): boolean {
  if (!birthDate) return false;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return false;
  let age = today.getUTCFullYear() - year;
  const beforeBirthday = today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  const threshold = (country ? DIGITAL_CONSENT_AGE[country.toUpperCase()] : undefined) ?? DEFAULT_DIGITAL_CONSENT_AGE;
  return age < threshold;
}

// ─── Puerta de contactabilidad en los envíos (Send, Campaigns, Flows) ──
//
// Ningún mensaje sale de Customy a una Persona si su contactabilidad por rol no
// lo permite para ese propósito y canal. CRM decide (`evaluateContactability`
// con los mismos datos que la ficha) y responde por `/v1/internal/people/contactability`
// (una) y `/v1/internal/people/contactability/batch` (hasta 500). Send aplica la
// puerta a todo lo que entrega; Campaigns la enseña en la vista previa.

/** Techo de un lote de contactabilidad (vistas previas de Campaigns). */
export const PERSON_CONTACTABILITY_BATCH_MAX = 500;

/** Prefijo del código de bloqueo que Send, Campaigns y Flows registran. */
export const PERSON_NOT_CONTACTABLE = "PERSON_NOT_CONTACTABLE";

export function personNotContactableCode(reason: ContactabilityReason | string): string {
  return `${PERSON_NOT_CONTACTABLE}:${reason}`;
}

/** Los identificadores por los que un motor de envío puede buscar a la Persona. */
export const CONTACTABILITY_IDENTIFIER_TYPES = ["email", "phone", "whatsapp_id", "access_user_id", "application_user_id", "external_crm_id"] as const;

export const PersonContactabilityTenantSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(200),
    projectId: z.string().trim().min(1).max(200),
    /** Ambiente de CRM (`staging`, `production`…) o id de ambiente de Access: CRM resuelve los dos. */
    environment: z.string().trim().min(1).max(200),
  })
  .strict();

export const PersonContactabilityIdentifierSchema = z
  .object({ type: z.enum(CONTACTABILITY_IDENTIFIER_TYPES), value: z.string().trim().min(1).max(320) })
  .strict();
export type PersonContactabilityIdentifier = z.infer<typeof PersonContactabilityIdentifierSchema>;

const ContactabilityTargetShape = {
  contactId: z.string().trim().min(1).max(128).optional(),
  /** Se prueban en orden si no hay `contactId` o no existe en el tenant. */
  identifier: PersonContactabilityIdentifierSchema.optional(),
  identifiers: z.array(PersonContactabilityIdentifierSchema).max(5).optional(),
};

export const PersonContactabilityRequestSchema = z
  .object({ tenant: PersonContactabilityTenantSchema, purpose: MessagePurposeSchema, channel: z.string().trim().min(1).max(40), ...ContactabilityTargetShape })
  .strict()
  .refine((value) => Boolean(value.contactId || value.identifier || value.identifiers?.length), { message: "contactId or identifier is required" });
export type PersonContactabilityRequest = z.infer<typeof PersonContactabilityRequestSchema>;

export const PersonContactabilityBatchRequestSchema = z
  .object({
    tenant: PersonContactabilityTenantSchema,
    purpose: MessagePurposeSchema,
    channel: z.string().trim().min(1).max(40),
    contactIds: z.array(z.string().trim().min(1).max(128)).max(PERSON_CONTACTABILITY_BATCH_MAX).optional(),
    items: z
      .array(z.object({ key: z.string().trim().min(1).max(200), ...ContactabilityTargetShape }).strict())
      .max(PERSON_CONTACTABILITY_BATCH_MAX)
      .optional(),
  })
  .strict()
  .refine((value) => (value.contactIds?.length ?? 0) + (value.items?.length ?? 0) <= PERSON_CONTACTABILITY_BATCH_MAX, {
    message: `at most ${PERSON_CONTACTABILITY_BATCH_MAX} people per batch`,
  });
export type PersonContactabilityBatchRequest = z.infer<typeof PersonContactabilityBatchRequestSchema>;

export type PersonContactabilityResult = Readonly<{
  /** `false` = CRM no conoce a esa persona: el envío sigue con las reglas de consentimiento de siempre. */
  found: boolean;
  personId: string | null;
  decision: ContactabilityDecision | null;
  /** La razón que bloquea en la puerta de envío (ver `contactabilityGateBlock`), o null. */
  blockedBy: ContactabilityReason | null;
}>;

export type PersonContactabilityBatchResult = Readonly<{
  purpose: MessagePurpose;
  channel: string;
  results: ReadonlyArray<PersonContactabilityResult & { key: string }>;
  summary: Readonly<{ total: number; allowed: number; blocked: number; unknown: number; byReason: Readonly<Partial<Record<ContactabilityReason, number>>> }>;
}>;

/** Solo esto bloquea un mensaje transaccional: lo dispara la propia persona (recibo, código, aviso de cuenta). */
const TRANSACTIONAL_BLOCKING_REASONS: readonly ContactabilityReason[] = ["person_deceased", "person_erased"];

/**
 * La razón por la que la puerta de envío bloquea, o null si deja pasar. Es la
 * decisión del contrato con una sola excepción: un mensaje **transaccional** no
 * se bloquea por falta de rol de servicio (`no_active_role`) —un recibo o un
 * código lo pide la persona misma—, solo por persona fallecida o suprimida.
 */
export function contactabilityGateBlock(decision: ContactabilityDecision, purpose: MessagePurpose): ContactabilityReason | null {
  if (decision.allowed) return null;
  if (purpose === "transactional") return decision.reasons.find((reason) => TRANSACTIONAL_BLOCKING_REASONS.includes(reason)) ?? null;
  return decision.reasons[0] ?? "consent_missing";
}

/** Propósitos que, con CRM caído, se aplazan en vez de salir (fallan cerrado). */
export function contactabilityFailsClosed(purpose: MessagePurpose): boolean {
  return purpose !== "transactional";
}

/** Propósito del registro de consentimientos (categoría de Send) → propósito de mensaje. */
export const MESSAGE_PURPOSE_BY_COMMUNICATION_PURPOSE: Readonly<Record<string, MessagePurpose>> = {
  marketing: "marketing",
  sales: "sales_outreach",
  education: "marketing",
  event: "marketing",
  survey: "research",
  transactional: "transactional",
  security: "transactional",
  notification: "service",
  support: "service",
  // Plurales con los que Campaigns nombra sus categorías de Send.
  events: "marketing",
  surveys: "research",
  notifications: "service",
};

const BULK_CATEGORY_ALIASES = new Set(["bulk", "newsletter", "campaign", "promotional", "broadcast", "offers", "promo", "promotions"]);

/**
 * El propósito de un envío de Send: la categoría (que ES el propósito del
 * registro de consentimientos, o directamente un propósito de mensaje), luego
 * la marca transaccional de la categoría registrada y por último el carril.
 * Sin categoría: `bulk` = marketing; `transactional`/`default` = transaccional
 * (recibos y avisos por API, como hace la ventana legal).
 */
export function messagePurposeForSend(input: { category?: string | null; lane?: "transactional" | "default" | "bulk" | null; categoryTransactional?: boolean | null }): MessagePurpose {
  const category = String(input.category ?? "").trim().toLowerCase();
  if (input.lane === "transactional" || input.categoryTransactional === true) return "transactional";
  if (category) {
    if ((MESSAGE_PURPOSES as readonly string[]).includes(category)) return category as MessagePurpose;
    const mapped = MESSAGE_PURPOSE_BY_COMMUNICATION_PURPOSE[category];
    if (mapped) return mapped;
    if (BULK_CATEGORY_ALIASES.has(category)) return "marketing";
    // Una categoría registrada y no transaccional es publicidad (misma regla que la ventana legal).
    if (input.categoryTransactional === false) return "marketing";
  }
  return input.lane === "bulk" ? "marketing" : "transactional";
}

// ─── Eventos de CRM sobre personas ───────────────────────────────────

export const PERSON_EVENT_TYPES = {
  roleAssigned: "crm.person.role.assigned",
  roleChanged: "crm.person.role.changed",
  roleEnded: "crm.person.role.ended",
  relationshipCreated: "crm.person.relationship.created",
  relationshipEnded: "crm.person.relationship.ended",
  identifierLinked: "crm.person.identifier.linked",
  merged: "crm.person.merged",
  unmerged: "crm.person.unmerged",
  stateChanged: "crm.person.state.changed",
} as const;

const PersonEventBase = {
  personId: Id,
  tenantId: z.string().min(1).max(400).optional(),
};

export const PersonRoleEventPayloadSchema = z
  .object({
    ...PersonEventBase,
    roleId: Id,
    roleTypeKey: z.string().regex(PLATFORM_ROLE_TYPE_KEY),
    family: PersonRoleFamilySchema,
    contextKind: PersonRoleContextKindSchema,
    contextId: z.string().max(200).nullable(),
    status: PersonRoleStatusSchema,
    previousStatus: PersonRoleStatusSchema.nullable().optional(),
    stage: z.string().max(40).nullable(),
    previousStage: z.string().max(40).nullable().optional(),
    endReason: z.string().max(200).nullable().optional(),
    applicationKey: z.string().max(40).nullable().optional(),
  })
  .strict();

export const PersonRelationshipEventPayloadSchema = z
  .object({
    ...PersonEventBase,
    relationshipId: Id,
    typeKey: z.string().max(64),
    toPersonId: Id.nullable(),
    toAccountId: Id.nullable(),
  })
  .strict();

export const PersonIdentifierLinkedPayloadSchema = z
  .object({
    ...PersonEventBase,
    identifierType: PersonIdentifierTypeSchema,
    /** Nunca el valor en claro: huella HMAC del valor normalizado. */
    valueFingerprint: z.string().min(16).max(128),
    verified: z.boolean(),
  })
  .strict();

export const PersonMergedPayloadSchema = z
  .object({
    ...PersonEventBase,
    mergedPersonIds: z.array(Id).min(1).max(50),
    reason: z.string().max(200),
  })
  .strict();

/** Una fusión del diario se deshizo: `restoredPersonId` vuelve a ser una Persona aparte de `personId` (la que quedó). */
export const PersonUnmergedPayloadSchema = z
  .object({
    ...PersonEventBase,
    restoredPersonId: Id,
    mergeId: Id,
    reason: z.string().max(200),
    forced: z.boolean(),
  })
  .strict();

export const PersonStateChangedPayloadSchema = z
  .object({
    ...PersonEventBase,
    state: PersonStateSchema,
    previousState: PersonStateSchema,
    doNotContact: z.boolean(),
  })
  .strict();

// ─── Identidad opcional en eventos de apps conectadas ────────────────

/**
 * Parámetros opcionales de `application.user.activity` (`insight_viewed`
 * {insight: "spend_trend"}, `ui_clicked` {area, target, item}…): objeto plano de
 * 1..8 claves `^[a-z][a-z0-9_]{0,31}$`, valores string (1..64, sin saltos de línea),
 * número finito o booleano, y JSON ≤ 512 bytes. Sin anidados ni arrays. Son
 * etiquetas de producto, nunca datos personales: la app no debe enviar emails,
 * nombres ni importes. Ausentes, el evento vale como siempre.
 */
export const APPLICATION_ACTIVITY_PROPERTIES_MAX_KEYS = 8;
export const APPLICATION_ACTIVITY_PROPERTIES_MAX_BYTES = 512;
const ACTIVITY_PROPERTY_KEY = /^[a-z][a-z0-9_]{0,31}$/;
export const ApplicationActivityPropertyValueSchema = z.union([
  z.string().min(1).max(64).refine((value) => !/[\r\n\u2028\u2029]/.test(value), "no line breaks"),
  z.number().finite(),
  z.boolean(),
]);
export type ApplicationActivityPropertyValue = z.infer<typeof ApplicationActivityPropertyValueSchema>;
export type ApplicationActivityProperties = Readonly<Record<string, ApplicationActivityPropertyValue>>;

/**
 * Claves de atribución de marketing que una app envía en `attribution_captured`
 * (una vez al registrarse) y `session_started` (cuando la sesión llega con UTM):
 * slugs en minúscula de hasta 64 caracteres. Son etiquetas de campaña, nunca
 * datos personales. CRM las valida con el mismo esquema y regex de claves que
 * el resto de parámetros; esta lista solo las nombra para la ficha.
 */
export const APPLICATION_ACTIVITY_ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer_host"] as const;
/** Claves de campaña/oferta dentro de la app (banners, ofertas, notificaciones). */
export const APPLICATION_ACTIVITY_CAMPAIGN_KEYS = ["campaign", "banner", "offer", "offer_name", "partner", "notification", "channel"] as const;
/**
 * Claves de interfaz que una app envía en `ui_clicked`, `ui_changed`, `field_edited`,
 * `form_submitted`, `app_visibility` y `search_submitted`: `area`, `target`, `item`,
 * `screen`, `state` (on|off|hidden|visible o el valor elegido), `field` y `eid` (id
 * estable del elemento, solo para correlacionar; la ficha no lo muestra). Mismo esquema
 * y sanitizador que el resto: esta lista solo las nombra.
 */
export const APPLICATION_ACTIVITY_UI_KEYS = ["area", "target", "item", "screen", "state", "field", "eid"] as const;
export const APPLICATION_ACTIVITY_ORIGIN_KINDS = ["attribution_captured", "session_started"] as const;

/**
 * Identificadores de correlación OPCIONALES de `application.user.activity`
 * (docs/BONU_EVENTS_ECOSYSTEM_PLAN.md B.3/B.4): `sessionId` (sesión de uso),
 * `anonymousId` (visitante antes de registrarse) y `accountId` (cuenta o grupo
 * del producto, id opaco). Son slugs de hasta 64 caracteres: nunca un email, un
 * teléfono ni un nombre. Ausentes, el evento vale como siempre (v1 aditivo).
 */
export const APPLICATION_ACTIVITY_CORRELATION_ID_MAX = 64;
export const ApplicationActivityCorrelationIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "slug of at most 64 characters");
export type ApplicationActivityCorrelationId = z.infer<typeof ApplicationActivityCorrelationIdSchema>;
export const APPLICATION_ACTIVITY_CORRELATION_KEYS = ["sessionId", "anonymousId", "accountId"] as const;
export type ApplicationActivityCorrelation = Readonly<Partial<Record<(typeof APPLICATION_ACTIVITY_CORRELATION_KEYS)[number], string>>>;

const byteLength = (value: string) => new TextEncoder().encode(value).length;

export const ApplicationActivityPropertiesSchema = z
  .record(ApplicationActivityPropertyValueSchema)
  .superRefine((value, ctx) => {
    const keys = Object.keys(value);
    if (keys.length > APPLICATION_ACTIVITY_PROPERTIES_MAX_KEYS) ctx.addIssue({ code: "custom", message: `at most ${APPLICATION_ACTIVITY_PROPERTIES_MAX_KEYS} keys` });
    for (const key of keys) if (!ACTIVITY_PROPERTY_KEY.test(key)) ctx.addIssue({ code: "custom", message: `invalid key ${key}` });
    if (byteLength(JSON.stringify(value)) > APPLICATION_ACTIVITY_PROPERTIES_MAX_BYTES) ctx.addIssue({ code: "custom", message: `at most ${APPLICATION_ACTIVITY_PROPERTIES_MAX_BYTES} bytes` });
  });

/**
 * Señal de segmento `app.activity`: «hizo <kind> en <app>» con filtros opcionales
 * de propiedad. La regla describe QUÉ actividad; el operador (`did`, `did_not`,
 * `at_least`, `at_most`), la ventana (`withinDays`) y el recuento (`count`) los
 * pone la condición del segmento, igual que en las señales de campañas y flujos.
 *
 * - `kinds`: uno o varios tipos de actividad (`expense_logged`…). Ausente = cualquier
 *   actividad de la app.
 * - `properties`: hasta 5 filtros `properties.<clave>`; cada uno con un valor
 *   (igualdad) o varios (`in`). Todos deben cumplirse (AND) sobre el mismo evento.
 */
export const APP_ACTIVITY_RULE_MAX_KINDS = 10;
export const APP_ACTIVITY_RULE_MAX_PROPERTIES = 5;
export const APP_ACTIVITY_RULE_MAX_VALUES = 10;
export const AppActivityRuleSchema = z
  .object({
    applicationKey: z.string().regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/),
    kinds: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).min(1).max(APP_ACTIVITY_RULE_MAX_KINDS).optional(),
    properties: z
      .array(
        z
          .object({
            key: z.string().regex(ACTIVITY_PROPERTY_KEY),
            values: z.array(ApplicationActivityPropertyValueSchema).min(1).max(APP_ACTIVITY_RULE_MAX_VALUES),
          })
          .strict(),
      )
      .max(APP_ACTIVITY_RULE_MAX_PROPERTIES)
      .optional(),
  })
  .strict();
export type AppActivityRule = z.infer<typeof AppActivityRuleSchema>;

/**
 * Lectura tolerante: conserva solo lo que cumple el contrato (CRM no falla un
 * evento por sus parámetros). Devuelve `null` si no queda ninguno.
 */
export function sanitizeApplicationActivityProperties(raw: unknown): ApplicationActivityProperties | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, ApplicationActivityPropertyValue> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= APPLICATION_ACTIVITY_PROPERTIES_MAX_KEYS) break;
    if (!ACTIVITY_PROPERTY_KEY.test(key)) continue;
    const parsed = ApplicationActivityPropertyValueSchema.safeParse(value);
    if (!parsed.success) continue;
    if (byteLength(JSON.stringify({ ...out, [key]: parsed.data })) > APPLICATION_ACTIVITY_PROPERTIES_MAX_BYTES) continue;
    out[key] = parsed.data;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Bloque de identidad que una app conectada puede enviar con
 * `application.user.registered` o `application.user.identity_updated`. Base
 * legal: relación de servicio (la app es responsable; Customy, encargado).
 * Nada de esto autoriza marketing.
 */
export const ConnectedApplicationUserIdentitySchema = z
  .object({
    email: z.string().email().max(320).optional(),
    emailVerified: z.boolean().optional(),
    phone: z.string().min(7).max(40).optional(),
    phoneVerified: z.boolean().optional(),
    accessUserId: z.string().min(1).max(128).optional(),
    displayName: z.string().max(240).optional(),
    locale: z.string().max(16).optional(),
    country: z.string().length(2).optional(),
    timeZone: z.string().max(64).optional(),
  })
  .strict();
export type ConnectedApplicationUserIdentity = z.infer<typeof ConnectedApplicationUserIdentitySchema>;

// ─── Consentimientos propios de una app conectada ───────────────────

/**
 * Lo que la persona decidió en la app (casilla de ofertas al registrarse, el
 * interruptor del perfil, un banner), con la evidencia de lo que se le mostró.
 * Viaja en `application.user.consent_updated` y CRM lo escribe en su registro
 * de consentimientos (`crm_contact_channel_preferences` + eventos), que es el
 * sistema de registro (docs/CUSTOMY_COMMUNICATION_PREFERENCES.md).
 *
 * Vocabulario: el ÚNICO de Customy (`communication-consent.ts`). Propósito y
 * canal son los del registro; `*` solo retira o deniega (un permiso se da por
 * canal, con su texto). Base legal: siempre `consent`. Sin datos personales.
 */
export const CONNECTED_APPLICATION_CONSENT_STATUSES = ["granted", "denied", "withdrawn"] as const;
export type ConnectedApplicationConsentStatus = (typeof CONNECTED_APPLICATION_CONSENT_STATUSES)[number];
/** Dónde lo decidió la persona dentro de la app. */
export const CONNECTED_APPLICATION_CONSENT_SOURCES = ["signup", "profile", "banner", "import"] as const;
export type ConnectedApplicationConsentSource = (typeof CONNECTED_APPLICATION_CONSENT_SOURCES)[number];
export const CONNECTED_APPLICATION_CONSENT_MAX = 20;

export const ConnectedApplicationConsentSchema = z
  .object({
    purpose: z.union([z.enum(COMMUNICATION_PURPOSES), z.literal(PURPOSE_WILDCARD)]),
    channel: z.union([z.enum(COMMUNICATION_CHANNELS), z.literal("*")]),
    status: z.enum(CONNECTED_APPLICATION_CONSENT_STATUSES),
    /** Cuándo lo decidió la persona (ISO 8601). */
    capturedAt: z.string().datetime({ offset: true }),
    /** Versión del texto mostrado (p. ej. `offers-2026-09`). */
    textVersion: z.string().min(1).max(64).regex(/^[\x21-\x7e]+$/, "visible ASCII, no spaces"),
    /** sha256 hex del texto exacto mostrado. */
    textHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    source: z.enum(CONNECTED_APPLICATION_CONSENT_SOURCES),
    legalBasis: z.literal("consent"),
  })
  .strict()
  .refine((consent) => consent.status !== "granted" || (consent.channel !== "*" && consent.purpose !== PURPOSE_WILDCARD), {
    message: "a grant names one purpose and one channel; \"*\" only denies or withdraws",
    path: ["channel"],
  });
export type ConnectedApplicationConsent = z.infer<typeof ConnectedApplicationConsentSchema>;

/**
 * Consentimiento de ANALYTICS de una app conectada (plan de eventos, WS-H.1).
 *
 * Es OTRA cosa que los consentimientos de comunicación de arriba: autoriza que
 * Customy guarde y analice la actividad del usuario en la app, no que le
 * escriba. Por eso:
 *  - la finalidad es `analytics`, que NO es una finalidad de comunicación (no está
 *    en `COMMUNICATION_PURPOSES`) y nunca entra en la puerta de contactabilidad;
 *  - no lleva canal (no hay a quién escribir) ni `*`;
 *  - solo `granted | denied | withdrawn`, con la evidencia: versión del texto
 *    mostrado, su hash, dónde lo decidió y cuándo.
 * Aditivo: un `consent_updated` sin esta finalidad vale exactamente como antes.
 * Orden de despliegue: CRM (y todo lo que valida el contrato) antes de que una app
 * envíe `analytics`, porque un consumidor sin este contrato rechazaría el evento.
 */
export const ANALYTICS_CONSENT_PURPOSE = "analytics" as const;
export const ConnectedApplicationAnalyticsConsentSchema = z
  .object({
    purpose: z.literal(ANALYTICS_CONSENT_PURPOSE),
    status: z.enum(CONNECTED_APPLICATION_CONSENT_STATUSES),
    /** Cuándo lo decidió la persona (ISO 8601). */
    capturedAt: z.string().datetime({ offset: true }),
    /** Versión del texto mostrado (p. ej. `analytics-2026-10`). */
    textVersion: z.string().min(1).max(64).regex(/^[\x21-\x7e]+$/, "visible ASCII, no spaces"),
    /** sha256 hex del texto exacto mostrado. */
    textHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    source: z.enum(CONNECTED_APPLICATION_CONSENT_SOURCES),
    legalBasis: z.literal("consent"),
  })
  .strict();
export type ConnectedApplicationAnalyticsConsent = z.infer<typeof ConnectedApplicationAnalyticsConsentSchema>;

/** Una decisión de `consent_updated`: de comunicación (como siempre) o de analytics. */
export type ConnectedApplicationConsentItem = ConnectedApplicationConsent | ConnectedApplicationAnalyticsConsent;

export const ConnectedApplicationConsentsSchema = z
  .array(z.union([ConnectedApplicationConsentSchema, ConnectedApplicationAnalyticsConsentSchema]))
  .min(1)
  .max(CONNECTED_APPLICATION_CONSENT_MAX);

export function isAnalyticsConsent(consent: ConnectedApplicationConsentItem): consent is ConnectedApplicationAnalyticsConsent {
  return consent.purpose === ANALYTICS_CONSENT_PURPOSE;
}

/** Separa las decisiones de un `consent_updated`: las de comunicación y las de analytics. */
export function splitApplicationConsents(consents: readonly ConnectedApplicationConsentItem[] | undefined): {
  communication: ConnectedApplicationConsent[];
  analytics: ConnectedApplicationAnalyticsConsent[];
} {
  const communication: ConnectedApplicationConsent[] = [];
  const analytics: ConnectedApplicationAnalyticsConsent[] = [];
  for (const consent of consents ?? []) {
    if (isAnalyticsConsent(consent)) analytics.push(consent);
    else communication.push(consent);
  }
  return { communication, analytics };
}

/** Estado de analytics de una Persona en una app (`GET /v1/people/:id/analytics-consent`). */
export const PERSON_ANALYTICS_CONSENT_STATUSES = ["granted", "denied", "withdrawn", "not_set"] as const;
export type PersonAnalyticsConsentStatus = (typeof PERSON_ANALYTICS_CONSENT_STATUSES)[number];
export type PersonAnalyticsConsentApplication = Readonly<{
  applicationKey: string;
  status: PersonAnalyticsConsentStatus;
  effectiveAt: string | null;
  textVersion: string | null;
  textHash: string | null;
  source: ConnectedApplicationConsentSource | null;
  history: ReadonlyArray<{ status: Exclude<PersonAnalyticsConsentStatus, "not_set">; capturedAt: string; textVersion: string; disposition: "applied" | "superseded" }>;
}>;
export type PersonAnalyticsConsent = Readonly<{
  /** `CRM_ENFORCE_ANALYTICS_CONSENT` encendida: sin `granted`, CRM no guarda las `properties` de la actividad. */
  enforced: boolean;
  applications: readonly PersonAnalyticsConsentApplication[];
}>;

// ─── Fusiones reversibles (diario de fusiones) ───────────────────────

export const UnmergePersonInputSchema = z
  .object({
    mergeId: Id,
    /** Deshacer aunque lo fusionado se haya movido después: decisión de un operador. */
    force: z.boolean().default(false),
    reason: z.string().min(1).max(200).default("manual"),
  })
  .strict();
export type UnmergePersonInput = z.infer<typeof UnmergePersonInputSchema>;

/** Una línea del historial de fusiones de una Persona (`GET /v1/people/:id/merges`). */
export type PersonMergeView = Readonly<{
  id: string;
  kind: "merge" | "unmerge";
  survivorId: string;
  absorbedId: string;
  reason: string;
  actor: string | null;
  forced: boolean;
  createdAt: string;
  /** Cuánto se movió, por tabla. */
  counts: Readonly<Record<string, { moved: number; deleted: number; created: number }>>;
  /** Solo en `kind: "merge"`: ya se deshizo. */
  undone: boolean;
  undoneAt: string | null;
  /** Solo en `kind: "unmerge"`: la fusión que deshizo. */
  reversesMergeId: string | null;
  /** Se puede deshacer ahora (fusión del diario, sin deshacer y con la Persona consultada como superviviente). */
  undoable: boolean;
}>;

// ─── Salud de la identidad (B.6) ─────────────────────────────────────

/** `GET /v1/people/identity-health`: umbrales de la comprobación de integridad (solo lectura). */
export const IdentityHealthQuerySchema = z
  .object({
    /** Identificadores del mismo tipo (y de la misma app, en `application_user_id`) a partir de los cuales una persona se lista. */
    maxPerType: z.coerce.number().int().min(1).max(100).default(3),
    /** Ventana de fusiones recientes, en días. */
    mergeWindowDays: z.coerce.number().int().min(1).max(90).default(7),
    /** Fusiones no deshechas en la ventana sobre una misma superviviente para marcarla. */
    mergeBurst: z.coerce.number().int().min(2).max(100).default(5),
    /** Identificadores movidos por una sola fusión a partir de los cuales se marca. */
    mergeMovedIdentifiers: z.coerce.number().int().min(1).max(100).default(5),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type IdentityHealthQuery = z.infer<typeof IdentityHealthQuerySchema>;

export type IdentityCrowdedPerson = Readonly<{
  personId: string;
  type: string;
  /** Solo en `application_user_id`: la app a la que pertenecen los identificadores. */
  applicationKey: string | null;
  count: number;
}>;

export type IdentityAnomalousMerge = Readonly<{
  mergeId: string;
  survivorId: string;
  absorbedId: string;
  createdAt: string;
  actor: string | null;
  reason: string;
  forced: boolean;
  identifiersMoved: number;
  /** `forced`, `many_identifiers` (una fusión que movió muchos), `burst` (la superviviente absorbió muchas en la ventana). */
  flags: readonly ("forced" | "many_identifiers" | "burst")[];
}>;

export type IdentityHealth = Readonly<{
  generatedAt: string;
  thresholds: Readonly<Omit<IdentityHealthQuery, "limit">>;
  crowdedPeople: readonly IdentityCrowdedPerson[];
  anomalousMerges: readonly IdentityAnomalousMerge[];
  /** Se llegó al `limit` en alguna lista: hay más de lo que se muestra. */
  truncated: Readonly<{ crowdedPeople: boolean; anomalousMerges: boolean }>;
}>;

// ─── Actividad en apps conectadas, por Persona ───────────────────────

/** Tipo de un evento del ciclo de vida de un usuario de app, tal como lo muestra la ficha de la Persona. */
export const PERSON_APP_ACTIVITY_TYPES = ["registered", "activity", "identity_updated", "consent_updated", "deleted"] as const;
export type PersonAppActivityType = (typeof PERSON_APP_ACTIVITY_TYPES)[number];

export const PERSON_APP_ACTIVITY_MAX_LIMIT = 100;

/** `GET /v1/people/:id/app-activity`: cursor opaco por (occurred_at, event_id) descendente. */
export const PersonAppActivityQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(PERSON_APP_ACTIVITY_MAX_LIMIT).default(20),
    before: z.string().min(1).max(200).optional(),
    applicationKey: z.string().regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/).optional(),
  })
  .strict();
export type PersonAppActivityQuery = z.infer<typeof PersonAppActivityQuerySchema>;

export type PersonAppActivityApplication = Readonly<{
  applicationKey: string;
  registeredAt: string | null;
  lastActivityAt: string | null;
  counts: Readonly<Record<string, number>>;
}>;

export type PersonAppActivityItem = Readonly<{
  id: string;
  applicationKey: string;
  type: PersonAppActivityType;
  /** Tipo de actividad (`expense_logged`…) solo en `activity`; nunca datos del usuario. */
  kind: string | null;
  /** Parámetros de la actividad (`{ insight: "spend_trend" }`) o null si no trae; solo en `activity`. */
  properties: ApplicationActivityProperties | null;
  occurredAt: string;
}>;

/** Un toque de atribución: de qué campaña/fuente/medio llegó la persona a la app. */
export type PersonAppOriginTouch = Readonly<{
  applicationKey: string;
  occurredAt: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrerHost: string | null;
}>;

/** Origen de la persona: primer toque (el del registro) y último (la sesión más reciente con UTM). */
export type PersonAppOrigin = Readonly<{ first: PersonAppOriginTouch | null; last: PersonAppOriginTouch | null }>;

/** Etapas de ciclo de vida de una Persona en una app (plan de eventos, WS-F.2). */
export const PERSON_APP_LIFECYCLE_STAGES = ["new", "activated", "habit", "at_risk", "dormant", "recovered"] as const;
export type PersonAppLifecycleStage = (typeof PERSON_APP_LIFECYCLE_STAGES)[number];

/** La etapa calculada de la Persona en una app, con las señales que la explican (reglas versionadas). */
export type PersonAppLifecycle = Readonly<{
  applicationKey: string;
  stage: PersonAppLifecycleStage;
  previousStage: PersonAppLifecycleStage | null;
  /** Desde cuándo está en la etapa (aproximado: el día en que se cumplió la regla). */
  since: string | null;
  rulesVersion: number;
  computedAt: string;
  signals: Readonly<Record<string, unknown>>;
}>;

export type PersonAppActivity = Readonly<{
  applications: readonly PersonAppActivityApplication[];
  items: readonly PersonAppActivityItem[];
  nextCursor: string | null;
  /** Solo en la primera página (sin cursor); ausente si el servicio es anterior. */
  origin?: PersonAppOrigin | null;
  /** Solo en la primera página; ausente si el servicio es anterior o aún no se ha calculado. */
  lifecycle?: readonly PersonAppLifecycle[];
}>;

/** Un mensaje de Customy (correo, push, WhatsApp, in-app) recibido por una Persona: una fila por envío (corrida de canal). */
export type PersonMessage = Readonly<{
  id: string;
  campaignId: string;
  /** Nombre de la campaña; en mensajes de un flow es la campaña dueña del mensaje. */
  campaignName: string | null;
  /** Id del flow cuando el mensaje lo envió un flow; el nombre lo resuelve la ficha. */
  flowId: string | null;
  channel: string;
  provider: string | null;
  /** Estado más avanzado: sent, delivered, opened, clicked, replied, bounced, failed, unsubscribed, complained… */
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  openCount: number;
  clickCount: number;
  /** Enlaces pulsados, sin querystring ni fragmento. */
  clickedLinks: readonly string[];
  reason: string | null;
  lastEventAt: string;
}>;

export type PersonMessages = Readonly<{ items: readonly PersonMessage[]; nextCursor: string | null }>;

/** `https://x.com/p?token=1#a` → `https://x.com/p`; solo http(s); otro esquema o texto no URL → null. Nunca devuelve credenciales ni querystring. */
export function sanitizeMessageLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 200);
  } catch {
    return null;
  }
}
