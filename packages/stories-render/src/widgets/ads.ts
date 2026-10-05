import { systemClock, type Clock } from "../clock";
import { fmt } from "../messages";
import type { StoryGroup, StoryPage, StoryPlatform, StorySponsor } from "../types";

/**
 * Anuncios dentro de historias (Ola 4), módulo OPCIONAL y sin DOM: quien no lo importa no lo paga.
 * Contrato: `packages/contracts/src/stories-ads.ts`; diseño y cumplimiento: docs/CUSTOMY_STORIES_ADS_2026-10-02.md.
 *
 * Reglas que el módulo hace imposibles de saltar:
 *  - El anuncio NUNCA es una historia: viaja por su propio endpoint (`GET /client/placements/:id/ads`), con su propio kill switch y
 *    sus propios eventos (`POST /client/ads/events`). `fromViewerEvent` dice si un evento del visor es de un anuncio: el host NO
 *    lo manda a los eventos de historias.
 *  - Todo anuncio lleva la etiqueta «Patrocinado» y la hoja de transparencia (la del modo `sponsored` del visor) y se anuncia
 *    como «Anuncio» a los lectores de pantalla (el título del grupo lo dice).
 *  - Un anuncio no abre ni cierra la experiencia, nunca van dos juntos y hay un tope por sesión.
 *  - Lo programático (terceros) exige TODO: el flag de la app, el consentimiento del propósito `third_party`, GPC apagado, que no sea
 *    un menor, un adaptador registrado y que el servidor lo haya anunciado. Plazo vencido, sin relleno o error ⇒ el hueco se colapsa
 *    y la historia sigue. No hay llamadas reales ni credenciales aquí: el adaptador es de la app.
 */

// ─── Entrega (lo que devuelve el servidor) ──────────────────────────────────

export type AdSource = "direct" | "programmatic";
export type AdCandidate = { ad_id: string; source: "direct"; advertiser: { id: string; name: string }; sponsor: StorySponsor; group: StoryGroup; /** Recibo de entrega firmado (opaco): va en cada evento de este anuncio. */ receipt?: string };
export type AdSlotDelivery = {
  id: string;
  unit: "groups" | "pages";
  every: number;
  first_after: number;
  max_per_session: number;
  order: number;
  sources: AdSource[];
  programmatic?: { provider_id: string; ad_unit?: string; timeout_ms: number };
  /** Recibo del hueco para los eventos programmatic y `fallback`. */
  receipt?: string;
  candidates: AdCandidate[];
};
export type AdsDelivery = {
  placement_id: string;
  etag: string;
  ttl: number;
  kill: { ads: boolean; placement: boolean };
  suppressed?: "kill" | "minors" | "no_slots";
  label: string;
  slots: AdSlotDelivery[];
};

// ─── Creatividad programática y adaptador ───────────────────────────────────

/** Lo que un adaptador devuelve: un anuncio NATIVO. Sin HTML, sin scripts, sin píxeles: la medición del proveedor corre en su SDK. */
export type AdCreative = {
  id: string;
  headline: string;
  body?: string;
  image: { url: string; alt: string };
  cta: { label: string; url: string };
  advertiser_name: string;
  disclosure: { text: string; url?: string; payer?: string };
  duration_ms?: number;
};

export type AdRequestContext = {
  placementId: string;
  slotId: string;
  /** `false` ⇒ el adaptador debe pedir un anuncio NO personalizado (npa). */
  personalized: boolean;
  locale?: string;
  platform?: StoryPlatform;
  /** Se aborta al vencer el plazo: el adaptador debe dejar de esperar. */
  signal: AbortSignal;
};

/** Interfaz del adaptador programático (Google Ad Manager, AdMob, AdSense…). El contenido que devuelve se valida antes de pintarse. */
export interface AdProvider {
  readonly id: string;
  request(slot: { id: string; adUnit?: string }, context: AdRequestContext): Promise<AdCreative | null>;
}

// ─── Consentimiento ─────────────────────────────────────────────────────────

export type AdConsent = {
  framework: "tcf" | "gpp" | "custom" | "none";
  purposes: { measurement: boolean; personalization: boolean; third_party: boolean };
  gpc: boolean;
  minor_signal: boolean;
  version?: string;
  consent_string?: string;
};

/** Espejo de `resolveAdPolicy` del contrato (el servidor decide igual: esto evita pedir lo que se va a rechazar). */
export function programmaticAllowed(consent: AdConsent | null | undefined): { ok: true; personalized: boolean } | { ok: false; reason: "no_consent" } {
  if (!consent || consent.minor_signal || consent.gpc || !consent.purposes.third_party) return { ok: false, reason: "no_consent" };
  return { ok: true, personalized: consent.purposes.personalization };
}

// ─── Textos ─────────────────────────────────────────────────────────────────

export type AdMessages = { ad: string; adFrom: string; sponsored: string };
const ES: AdMessages = { ad: "Anuncio", adFrom: "Anuncio de {name}", sponsored: "Patrocinado" };
const EN: AdMessages = { ad: "Ad", adFrom: "Ad from {name}", sponsored: "Sponsored" };
const PT: AdMessages = { ad: "Anúncio", adFrom: "Anúncio de {name}", sponsored: "Patrocinado" };
export function resolveAdMessages(locale?: string, overrides?: Partial<AdMessages>): AdMessages {
  const base = ({ es: ES, en: EN, pt: PT } as Record<string, AdMessages>)[(locale ?? "en").toLowerCase().split(/[-_]/)[0] ?? "en"] ?? EN;
  return { ...base, ...overrides };
}

// ─── Posiciones e intercalado (puras: referencia para los SDK nativos) ──────

/** Mismas reglas que el servidor (`adPositions`): el primero tras `first_after` unidades, luego cada `every`, con tope, nunca al final ni dos juntos. */
export function adPositions(total: number, slot: { first_after: number; every: number; max_per_session: number }, alreadyShown = 0): number[] {
  const out: number[] = [];
  const room = Math.max(0, slot.max_per_session - alreadyShown);
  for (let at = slot.first_after; at < total && out.length < room; at += Math.max(1, slot.every)) out.push(at);
  return out;
}

export type PlannedAd = { at: number; slotId: string; ad: ResolvedAd };
export type Sequenced<T> = { kind: "story"; item: T } | { kind: "ad"; slotId: string; ad: ResolvedAd };

/**
 * Intercala los anuncios entre las unidades editoriales. `at` es el índice editorial ANTE el cual va el anuncio. Descarta lo que abriría o cerraría la
 * experiencia, lo que quedaría pegado a otro anuncio y las posiciones repetidas entre huecos (gana el hueco de menor `order`, que llega primero).
 */
export function interleave<T>(items: readonly T[], placements: readonly PlannedAd[]): Array<Sequenced<T>> {
  const byAt = new Map<number, PlannedAd>();
  for (const p of placements) if (p.at > 0 && p.at < items.length && !byAt.has(p.at)) byAt.set(p.at, p);
  const out: Array<Sequenced<T>> = [];
  items.forEach((item, i) => {
    const p = byAt.get(i);
    if (p) out.push({ kind: "ad", slotId: p.slotId, ad: p.ad });
    out.push({ kind: "story", item });
  });
  return out;
}

// ─── Validación y conversión de la creatividad nativa ───────────────────────

const https = (u: unknown): u is string => typeof u === "string" && u.length <= 2048 && /^https:\/\/[^\s/]+/.test(u);

/** Valida lo que devolvió un adaptador (no es de fiar). Solo conserva campos conocidos: lo demás (html, scripts, píxeles) se descarta. */
export function validateNativeCreative(raw: unknown): AdCreative | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length > 0 && v.length <= max ? v : null);
  const id = typeof c.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(c.id) ? c.id : null;
  const headline = str(c.headline, 90);
  const advertiser = str(c.advertiser_name, 80);
  const image = c.image as Record<string, unknown> | undefined;
  const cta = c.cta as Record<string, unknown> | undefined;
  const disc = c.disclosure as Record<string, unknown> | undefined;
  if (!id || !headline || !advertiser || !image || !cta || !disc) return null;
  const alt = str(image.alt, 200);
  const label = str(cta.label, 30);
  const text = str(disc.text, 600);
  if (!https(image.url) || !alt || !https(cta.url) || !label || !text) return null;
  if (disc.url !== undefined && !https(disc.url)) return null;
  const body = c.body === undefined ? undefined : str(c.body, 200);
  if (c.body !== undefined && !body) return null;
  const dur = typeof c.duration_ms === "number" ? Math.min(15000, Math.max(3000, Math.round(c.duration_ms))) : 6000;
  return {
    id,
    headline,
    ...(body ? { body } : {}),
    image: { url: image.url, alt },
    cta: { label, url: cta.url },
    advertiser_name: advertiser,
    disclosure: { text, ...(disc.url ? { url: disc.url as string } : {}), ...(typeof disc.payer === "string" && disc.payer.length <= 80 ? { payer: disc.payer } : {}) },
    duration_ms: dur,
  };
}

/** Una tarjeta de una página dibujada con el mismo visor, en modo `sponsored` (etiqueta + hoja de transparencia); el título dice «Anuncio». */
export function creativeToGroup(creative: AdCreative, messages: AdMessages = ES): StoryGroup {
  const sponsor: StorySponsor = {
    name: creative.advertiser_name,
    label: messages.sponsored,
    transparency: { text: creative.disclosure.text, advertiser: creative.advertiser_name, ...(creative.disclosure.payer ? { payer: creative.disclosure.payer } : {}), ...(creative.disclosure.url ? { url: creative.disclosure.url } : {}) },
  };
  const page: StoryPage = {
    id: "ad",
    duration_ms: creative.duration_ms ?? 6000,
    background: { type: "image", url: creative.image.url, fit: "fill", alt: creative.image.alt, decorative: false },
    canvas: {
      safe_zone: { top_px: 250, bottom_px: 340 },
      layers: [
        // Colores de CONTENIDO del lienzo (texto blanco sobre franja oscura para contraste), no de la interfaz: el contrato los exige en hex.
        // eslint-disable-next-line @customy/no-hardcoded-colors
        { id: "headline", type: "text", x: 0.06, y: 0.62, w: 0.88, h: 0.16, rotation: 0, opacity: 1, z: 1, animations: [], decorative: true, text: creative.headline, font_size: 0.04, weight: "bold", align: "start", color: "#ffffff", background: "#000000aa" },
      ],
      components: [
        { id: "cta", type: "button", x: 0.1, y: 0.82, w: 0.8, h: 0.07, z: 2, collects: ["click"], consent_purpose: "none", style: "button", label: creative.cta.label, action: { type: "url", url: creative.cta.url }, element_id: "ad_cta" },
      ],
    },
  };
  return {
    id: `ad_${creative.id}`,
    title: fmt(messages.adFrom, { name: creative.advertiser_name }),
    cover: { url: creative.image.url, alt: creative.image.alt },
    mode: "sponsored",
    sponsor,
    pinned: false,
    order: 0,
    live: false,
    control: false,
    reeligibility_cooldown_hours: 0,
    pages: [page],
  };
}

// ─── Eventos ────────────────────────────────────────────────────────────────

export type AdFallbackReason = "no_consent" | "timeout" | "no_fill" | "error" | "provider_disabled" | "frequency" | "invalid_creative";
export type AdEventType = "impression" | "click" | "complete" | "close" | "skip" | "fallback";
export type AdEvent = {
  type: AdEventType;
  event_id: string;
  placement_id: string;
  slot_id: string;
  ad_id: string;
  source: AdSource;
  occurred_at: string;
  platform?: StoryPlatform;
  sdk?: string;
  session_id?: string;
  /** Recibo de entrega del anuncio servido (candidato o hueco). El servidor lo exige: sin él el evento no se envía. */
  receipt?: string;
  element_id?: string;
  ms?: number;
  reason?: AdFallbackReason;
};

export type ResolvedAd = { slotId: string; adId: string; source: AdSource; advertiserName: string; group: StoryGroup; receipt?: string };

// ─── Controlador ────────────────────────────────────────────────────────────

export type AdsControllerOptions = {
  placementId: string;
  /** `GET /client/placements/:id/ads`. Puede lanzar o devolver null: sin anuncios, y las historias siguen. */
  fetchAds(placementId: string, init: { signal: AbortSignal }): Promise<AdsDelivery | null>;
  /** `POST /client/ads/events`. Un fallo se traga: medir nunca rompe la experiencia. */
  postEvents(events: AdEvent[]): Promise<void>;
  /** Consentimiento vigente (el de la CMP de la app). `null` = ninguno: nada de terceros. */
  consent(): AdConsent | null;
  /** Adaptadores registrados. Por defecto, ninguno. */
  providers?: readonly AdProvider[];
  /** Interruptor de la app para lo programático. Por defecto APAGADO. */
  programmaticEnabled?: boolean;
  /** Plazo de la petición de anuncios al servidor (ms). */
  fetchTimeoutMs?: number;
  locale?: string;
  platform?: StoryPlatform;
  sdk?: string;
  sessionId?: string;
  messages?: Partial<AdMessages>;
  clock?: Clock;
  newId?: () => string;
  /** Aviso accesible cuando entra un anuncio (por si el host tiene su propia región `aria-live`). */
  onAnnounce?: (text: string) => void;
};

const defaultId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return (c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40).padEnd(8, "0");
};

export function createAdsController(options: AdsControllerOptions) {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? defaultId;
  const m = resolveAdMessages(options.locale, options.messages);
  const providers = new Map((options.providers ?? []).map((p) => [p.id, p]));
  let delivery: AdsDelivery | null = null;
  const shown = new Map<string, number>(); // por hueco, en esta sesión
  const used = new Set<string>(); // anuncios ya puestos (un directo no se repite en la sesión)
  const byGroup = new Map<string, ResolvedAd>();
  const sent = new Set<string>(); // `${adId}:${type}` de una sola vez por anuncio y sesión

  const event = (type: AdEventType, slotId: string, adId: string, source: AdSource, receipt: string | undefined, extra: Partial<AdEvent> = {}): AdEvent => ({
    type,
    event_id: newId(),
    placement_id: options.placementId,
    slot_id: slotId,
    ad_id: adId,
    source,
    occurred_at: new Date(clock.now()).toISOString(),
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.sdk ? { sdk: options.sdk } : {}),
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    ...(receipt ? { receipt } : {}),
    ...extra,
  });
  /** Un evento sin recibo de entrega no se envía: el servidor lo rechazaría (y sin entrega firmada no hay nada que medir). */
  const post = (events: AdEvent[]): void => {
    const signed = events.filter((e) => typeof e.receipt === "string" && e.receipt.length > 0);
    if (!signed.length) return;
    void Promise.resolve()
      .then(() => options.postEvents(signed))
      .catch(() => undefined);
  };

  /** Una petición con plazo: devuelve el resultado, o `null` si venció, falló o se canceló. Nunca lanza. */
  function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: "timeout" | "error" }> {
    const ctl = new AbortController();
    return new Promise((resolve) => {
      let done = false;
      const finish = (r: { ok: true; value: T } | { ok: false; reason: "timeout" | "error" }): void => {
        if (done) return;
        done = true;
        clock.clearTimeout(timer);
        resolve(r);
      };
      const timer = clock.setTimeout(() => {
        ctl.abort();
        finish({ ok: false, reason: "timeout" });
      }, ms);
      Promise.resolve()
        .then(() => run(ctl.signal))
        .then((value) => finish({ ok: true, value }), () => finish({ ok: false, reason: "error" }));
    });
  }

  async function resolveProgrammatic(slot: AdSlotDelivery): Promise<ResolvedAd | null> {
    const cfg = slot.programmatic;
    if (!cfg || !slot.sources.includes("programmatic")) return null;
    const fallback = (reason: AdFallbackReason): null => {
      post([event("fallback", slot.id, cfg.provider_id, "programmatic", slot.receipt, { reason })]);
      return null;
    };
    if (!options.programmaticEnabled) return fallback("provider_disabled");
    const policy = programmaticAllowed(options.consent());
    if (!policy.ok) return fallback("no_consent");
    const provider = providers.get(cfg.provider_id);
    if (!provider) return fallback("provider_disabled");
    const r = await withTimeout(cfg.timeout_ms, (signal) =>
      provider.request({ id: slot.id, ...(cfg.ad_unit ? { adUnit: cfg.ad_unit } : {}) }, { placementId: options.placementId, slotId: slot.id, personalized: policy.personalized, ...(options.locale ? { locale: options.locale } : {}), ...(options.platform ? { platform: options.platform } : {}), signal }),
    );
    if (!r.ok) return fallback(r.reason);
    if (r.value === null || r.value === undefined) return fallback("no_fill");
    const creative = validateNativeCreative(r.value);
    if (!creative) return fallback("invalid_creative");
    return { slotId: slot.id, adId: creative.id, source: "programmatic", advertiserName: creative.advertiser_name, group: creativeToGroup(creative, m), ...(slot.receipt ? { receipt: slot.receipt } : {}) };
  }

  async function resolveDirect(slot: AdSlotDelivery): Promise<ResolvedAd | null> {
    for (const c of slot.candidates) {
      if (used.has(c.ad_id)) continue;
      used.add(c.ad_id);
      // La etiqueta y la hoja son OBLIGATORIAS: sin ellas el anuncio no se pinta.
      if (!c.sponsor?.label?.trim() || !c.sponsor.transparency?.text?.trim() || !c.group?.pages?.length) continue;
      return { slotId: slot.id, adId: c.ad_id, source: "direct", advertiserName: c.advertiser.name, ...(c.receipt ? { receipt: c.receipt } : {}), group: { ...c.group, mode: "sponsored", sponsor: c.sponsor, title: c.group.title.startsWith(m.ad) ? c.group.title : `${m.ad}: ${c.group.title}`, pinned: false, live: false, control: false } };
    }
    return null;
  }

  return {
    /** Pide los anuncios. Nunca lanza: ante cualquier fallo, sin anuncios. */
    async load(): Promise<AdsDelivery | null> {
      const r = await withTimeout(options.fetchTimeoutMs ?? 2500, (signal) => options.fetchAds(options.placementId, { signal }));
      const d = r.ok ? r.value : null;
      delivery = d && !d.kill?.ads && !d.kill?.placement && !d.suppressed ? d : null;
      return delivery;
    },
    /**
     * Qué anuncios van y dónde, para `total` unidades editoriales del `unit` dado. Cada hueco se rellena con directos y, si no hay y
     * todo está permitido, con el adaptador; un hueco sin relleno se COLAPSA. Respeta el tope por sesión de cada hueco.
     */
    async plan(total: number, unit: "groups" | "pages" = "groups"): Promise<PlannedAd[]> {
      if (!delivery) return [];
      const out: PlannedAd[] = [];
      for (const slot of [...delivery.slots].sort((a, b) => a.order - b.order)) {
        if (slot.unit !== unit) continue;
        for (const at of adPositions(total, slot, shown.get(slot.id) ?? 0)) {
          const ad = (await resolveDirect(slot)) ?? (await resolveProgrammatic(slot));
          if (!ad) continue;
          shown.set(slot.id, (shown.get(slot.id) ?? 0) + 1);
          byGroup.set(ad.group.id, ad);
          out.push({ at, slotId: slot.id, ad });
        }
      }
      return out.sort((a, b) => a.at - b.at);
    },
    /** Los grupos del visor con los anuncios ya intercalados (el `StoryGroup` del anuncio es un grupo `sponsored`). */
    async sequence<T extends { id: string }>(groups: readonly T[]): Promise<Array<Sequenced<T>>> {
      return interleave(groups, await this.plan(groups.length, "groups"));
    },
    /** ¿Este grupo es un anuncio? */
    isAd(groupId: string): boolean {
      return byGroup.has(groupId);
    },
    /**
     * Pasa por aquí TODO evento del visor antes de mandarlo a las historias: si es de un anuncio lo traduce a un evento de anuncio y
     * devuelve `true` (el host NO lo manda a `POST /client/events`). Así un anuncio no entra en las cifras editoriales.
     */
    fromViewerEvent(e: { type: string; campaign_id: string; element_id?: string; ms?: number }): boolean {
      const ad = byGroup.get(e.campaign_id);
      if (!ad) return false;
      const once = (t: AdEventType, extra: Partial<AdEvent> = {}): void => {
        const key = `${ad.adId}:${t}`;
        if (sent.has(key)) return;
        sent.add(key);
        post([event(t, ad.slotId, ad.adId, ad.source, ad.receipt, extra)]);
      };
      if (e.type === "impression") {
        once("impression");
        options.onAnnounce?.(fmt(m.adFrom, { name: ad.advertiserName }));
      } else if (e.type === "click") post([event("click", ad.slotId, ad.adId, ad.source, ad.receipt, { ...(e.element_id ? { element_id: e.element_id.slice(0, 80) } : {}) })]);
      else if (e.type === "complete") once("complete");
      else if (e.type === "close") once("close", { ...(typeof e.ms === "number" ? { ms: Math.round(e.ms) } : {}) });
      else if (e.type === "next" || e.type === "dismiss") once("skip");
      return true;
    },
    /** Un anuncio entró en pantalla (el visor la abrió). Equivale al evento `impression` del visor. */
    impression(ad: ResolvedAd): void {
      this.fromViewerEvent({ type: "impression", campaign_id: ad.group.id });
    },
    /** Consentimiento nuevo de la CMP: va al servidor (`PUT /client/ads/consent`) si el host lo pasó. */
    async syncConsent(put: (c: AdConsent & { occurred_at: string }) => Promise<void>): Promise<void> {
      const c = options.consent();
      if (c) await put({ ...c, occurred_at: new Date(clock.now()).toISOString() }).catch(() => undefined);
    },
  };
}

export type AdsController = ReturnType<typeof createAdsController>;

// ─── Adaptador de ejemplo (INACTIVO) ────────────────────────────────────────

/**
 * Ejemplo de adaptador web, APAGADO por defecto y sin una sola llamada real: con `enabled: false` (el valor por defecto) no hace
 * nada. Quien lo active pasa `fetchCreative`, que es CÓDIGO DE LA APP (por ejemplo, su integración con Google Publisher Tag con SUS
 * IDs y SU cuenta de Ad Manager) y devuelve un nativo; Customy no lleva credenciales ni IDs de nadie. Sirve de plantilla para
 * AdMob/AdSense/otros y para las pruebas.
 */
export function createExampleWebAdapter(opts: { id?: string; enabled?: boolean; fetchCreative?: (slot: { id: string; adUnit?: string }, ctx: AdRequestContext) => Promise<AdCreative | null> } = {}): AdProvider {
  const enabled = opts.enabled === true;
  return {
    id: opts.id ?? "example-web",
    async request(slot, ctx) {
      if (!enabled || !opts.fetchCreative) return null;
      return opts.fetchCreative(slot, ctx);
    },
  };
}
