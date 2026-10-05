import type { StoryCommunity } from "../types";

/**
 * Cliente de las historias de la comunidad (`/client/ugc/*` de Send, con el token de suscriptor): enviar, ver lo
 * enviado y por qué se decidió así, reclamar, borrar, reportar, bloquear y exportar. Sin estado ni almacenamiento:
 * lo que la persona hizo vive en el servidor. El medio ya debe estar subido (Storage u otro): aquí viaja su referencia.
 */
export type UgcReportReason = "spam" | "nudity" | "violence" | "hate" | "harassment" | "illegal" | "minor_safety" | "personal_data" | "copyright" | "other";
export const UGC_REPORT_REASONS: readonly UgcReportReason[] = ["spam", "nudity", "violence", "hate", "harassment", "illegal", "minor_safety", "personal_data", "copyright", "other"];

export type UgcMedia = { kind: "image"; url: string; bytes?: number } | { kind: "video"; url: string; poster: string; bytes?: number; duration_ms?: number };
export type UgcSubmitInput = { media: UgcMedia; caption?: string; alt?: string; authorLabel?: string; termsAccepted: boolean };
export type UgcOwnItem = {
  id: string;
  group_id: string;
  status: "pending" | "approved" | "rejected" | "removed" | "deleted";
  caption: string | null;
  media_kind: "image" | "video";
  reason_code: string | null;
  reason: string | null;
  appeal: "none" | "open" | "upheld" | "overturned";
  can_appeal: boolean;
  created_at: string;
  decided_at: string | null;
};

export type UgcErrorCode = "terms_outdated" | "rejected_by_filter" | "video_not_accepted" | "ugc_rate_limited" | "ugc_disabled" | "ugc_unavailable_minors" | "author_blocked" | "media_rejected" | "media_not_ready" | "ugc_media_unavailable" | "terms_not_accepted" | "invalid" | "network" | "unauthorized" | "not_found" | "server";

export class UgcError extends Error {
  readonly code: UgcErrorCode;
  readonly status: number;
  /** El campo que el servidor señala (`caption`, `alt`, `author_label`…). */
  readonly field?: string;
  /** Con `terms_outdated`: la versión que hay que aceptar. */
  readonly requiredTermsVersion?: string;
  /** Con `rejected_by_filter`: la pieza (queda en «mis historias» con su motivo). */
  readonly item?: UgcOwnItem;
  constructor(code: UgcErrorCode, message: string, o: { status?: number; field?: string; requiredTermsVersion?: string; item?: UgcOwnItem } = {}) {
    super(message);
    this.name = "UgcError";
    this.code = code;
    this.status = o.status ?? 0;
    if (o.field) this.field = o.field;
    if (o.requiredTermsVersion) this.requiredTermsVersion = o.requiredTermsVersion;
    if (o.item) this.item = o.item;
  }
}

export type UgcClientOptions = {
  baseUrl?: string;
  token: (forceRefresh?: boolean) => Promise<string>;
  fetch?: typeof fetch;
  now?: () => number;
};

const KNOWN = new Set<string>(["terms_outdated", "rejected_by_filter", "video_not_accepted", "ugc_rate_limited", "ugc_disabled", "ugc_unavailable_minors", "author_blocked", "media_rejected", "media_not_ready", "ugc_media_unavailable"]);

/** Comprobaciones previas que ahorran un viaje: términos aceptados, vídeo permitido, pie dentro del tope, algo que lea quien no ve. Pura. */
export function precheckSubmission(community: StoryCommunity, input: UgcSubmitInput): UgcError | null {
  if (!input.termsAccepted) return new UgcError("terms_not_accepted", "hay que aceptar los términos de la comunidad");
  if (input.media.kind === "video" && !community.accept_video) return new UgcError("video_not_accepted", "esta comunidad solo acepta fotos", { field: "media.kind" });
  if ((input.caption?.length ?? 0) > community.max_caption_length) return new UgcError("invalid", `el pie admite como mucho ${community.max_caption_length} caracteres`, { field: "caption" });
  if (!input.caption?.trim() && !input.alt?.trim()) return new UgcError("invalid", "falta la descripción del medio (o un pie)", { field: "alt" });
  return null;
}

/** El cuerpo de `POST /client/ugc/communities/:id/items`. El consentimiento lleva la versión VIGENTE de los términos y la hora. */
export function submissionBody(community: StoryCommunity, input: UgcSubmitInput, nowMs: number): Record<string, unknown> {
  return {
    media: input.media,
    ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
    ...(input.alt?.trim() ? { alt: input.alt.trim() } : {}),
    ...(input.authorLabel?.trim() ? { author_label: input.authorLabel.trim() } : {}),
    consent: { terms_version: community.terms_version, accepted_at: new Date(nowMs).toISOString() },
  };
}

export function createUgcClient(options: UgcClientOptions) {
  const baseUrl = (options.baseUrl ?? "https://send-api.customy.ai").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const now = options.now ?? Date.now;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        token = await options.token(attempt > 0);
      } catch (e) {
        throw new UgcError("unauthorized", `no se pudo obtener el token de suscriptor: ${(e as Error).message}`);
      }
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/client${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      } catch (e) {
        throw new UgcError("network", `sin conexión: ${(e as Error).message}`);
      }
      if (res.status === 401 && attempt === 0) continue;
      if (res.ok) return (await res.json()) as T;
      let payload: { name?: string; message?: string; field?: string; required_terms_version?: string; item?: UgcOwnItem } = {};
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        /* sin cuerpo */
      }
      const code: UgcErrorCode = payload.name && KNOWN.has(payload.name) ? (payload.name as UgcErrorCode) : res.status === 401 || res.status === 403 ? "unauthorized" : res.status === 404 ? "not_found" : res.status === 422 ? "invalid" : "server";
      throw new UgcError(code, payload.message ?? `HTTP ${res.status}`, { status: res.status, field: payload.field, requiredTermsVersion: payload.required_terms_version, item: payload.item });
    }
    throw new UgcError("unauthorized", "el token de suscriptor no fue aceptado", { status: 401 });
  }

  return {
    /** Envía una historia a una comunidad. Siempre queda en revisión: no se publica sola. */
    submit(groupId: string, community: StoryCommunity, input: UgcSubmitInput): Promise<UgcOwnItem> {
      const refused = precheckSubmission(community, input);
      if (refused) return Promise.reject(refused);
      return call<UgcOwnItem>("POST", `/ugc/communities/${encodeURIComponent(groupId)}/items`, submissionBody(community, input, now()));
    },
    /** Lo que esta persona envió, con el estado y el motivo de cada decisión. */
    async mine(): Promise<UgcOwnItem[]> {
      return (await call<{ data: UgcOwnItem[] }>("GET", "/ugc/mine")).data;
    },
    remove: (id: string) => call<{ id: string; deleted: boolean }>("DELETE", `/ugc/items/${encodeURIComponent(id)}`),
    /** Reclamar una decisión (una vez). La resuelve una persona distinta de la que decidió. */
    appeal: (id: string, text: string) => call<UgcOwnItem>("POST", `/ugc/items/${encodeURIComponent(id)}/appeal`, { text }),
    report: (itemId: string, reason: UgcReportReason, detail?: string) => call<{ counted: boolean; hidden: boolean }>("POST", `/ugc/items/${encodeURIComponent(itemId)}/report`, { reason, ...(detail?.trim() ? { detail: detail.trim() } : {}) }),
    /** «No ver más a esta persona»: desde ahora sus historias no llegan a este suscriptor. */
    blockAuthor: (itemId: string) => call<{ already_blocked: boolean }>("POST", `/ugc/items/${encodeURIComponent(itemId)}/block-author`, {}),
    /** Todo lo que se guarda de esta persona en la comunidad (acceso a sus datos). */
    exportMine: () => call<Record<string, unknown>>("GET", "/ugc/export"),
  };
}
export type UgcClient = ReturnType<typeof createUgcClient>;
