/**
 * @customyai/stories-react-native/ugc — historias de la comunidad (UGC) en nativo: «comparte tu historia», «mis historias»
 * (estado, motivo de cada decisión, reclamar, borrar, descargar mis datos) y, en el visor de historias, «⋯» para reportar y
 * dejar de ver a una persona (gancho `pageActions`). Módulo OPCIONAL: reutiliza el cliente y los textos de
 * `@customyai/stories-render/ugc`; aquí solo está la interfaz nativa. Nada se publica solo (cola de revisión del servidor);
 * este módulo no sube bytes: la app (o Storage) sube el archivo y devuelve la referencia ya escaneada (`uploadMedia`).
 *
 *   const ugc = createUgcClient({ token: () => subscriberToken() });
 *   <StoriesProvider pageActions={ugcPageActions({ client: ugc })} …>
 *   <UgcComposer groupId={g.id} community={g.community!} client={ugc} pickMedia={…} uploadMedia={…} />
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { UGC_REPORT_REASONS, UgcError, createUgcClient, precheckSubmission, resolveUgcMessages, submissionBody, ugcErrorText, type UgcClient, type UgcMedia, type UgcMessages, type UgcOwnItem, type UgcReportReason } from "@customyai/stories-render/ugc";
import type { StoryCommunity } from "../core";
import type { PageActionsProvider } from "../component-api";
import { useStoriesContext } from "../context";
import { ActionButton, MAX_FONT_SCALE, MIN_TOUCH } from "../ui";
import { HIDDEN_FROM_AT } from "../viewer/layers";
import { LiveRegion, useAnnouncer } from "../widgets/common";

export { UGC_REPORT_REASONS, UgcError, createUgcClient, precheckSubmission, resolveUgcMessages, submissionBody, ugcErrorText };
export type { UgcClient, UgcMedia, UgcMessages, UgcOwnItem, UgcReportReason };
export type { UgcClientOptions, UgcErrorCode, UgcSubmitInput } from "@customyai/stories-render/ugc";

type Common = { messages?: Partial<UgcMessages>; locale?: string };

function useUgcEnv(o: Common) {
  const ctx = useStoriesContext();
  const m = useMemo(() => resolveUgcMessages(o.locale ?? ctx.locale, o.messages), [o.locale, ctx.locale, o.messages]);
  return { ctx, theme: ctx.theme, rtl: ctx.rtl, m };
}

const Field = ({ label, hint, value, onChangeText, max, multiline, testID, theme }: { label: string; hint?: string; value: string; onChangeText: (t: string) => void; max: number; multiline?: boolean; testID: string; theme: ReturnType<typeof useStoriesContext>["theme"] }) => (
  <View style={styles.field}>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 14, fontWeight: "600" }} {...HIDDEN_FROM_AT}>
      {label}
    </Text>
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      accessibilityHint={hint}
      value={value}
      onChangeText={onChangeText}
      maxLength={max}
      multiline={multiline}
      placeholderTextColor={theme.mutedForeground}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[styles.input, multiline && styles.multiline, { color: theme.surfaceForeground, borderColor: theme.border, backgroundColor: theme.surface }]}
    />
    {hint ? (
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 12 }} {...HIDDEN_FROM_AT}>
        {hint}
      </Text>
    ) : null}
  </View>
);

// ── Reportar y bloquear (hoja del visor) ───────────────────────────────────

function ReportSheet({ client, itemId, authorLabel, fallbackTitle, m, close, say, onDone }: { client: Pick<UgcClient, "report" | "blockAuthor">; itemId: string; authorLabel?: string; fallbackTitle: string; m: UgcMessages; close: () => void; say: (t: string) => void; onDone?: (what: "reported" | "blocked", itemId: string) => void }) {
  const { theme } = useStoriesContext();
  const [reason, setReason] = useState<UgcReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const fail = (e: unknown): void => {
    setStatus(ugcErrorText(e, m));
    setBusy(false);
  };
  return (
    <View style={styles.sheet}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
        {authorLabel ? m.communityBy.replace("{name}", authorLabel) : fallbackTitle}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={m.reportTitle}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontWeight: "700", fontSize: 16 }}>
          {m.reportTitle}
        </Text>
        {UGC_REPORT_REASONS.map((r) => (
          <Pressable key={r} testID={`cs-ugc-reason-${r}`} accessibilityRole="radio" accessibilityLabel={m.reasons[r]} accessibilityState={{ selected: reason === r }} onPress={() => setReason(r)} style={styles.radio}>
            <View style={[styles.dot, { borderColor: reason === r ? theme.accent : theme.border }]} {...HIDDEN_FROM_AT}>
              {reason === r ? <View style={[styles.dotFill, { backgroundColor: theme.accent }]} /> : null}
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 15, flex: 1 }} {...HIDDEN_FROM_AT}>
              {m.reasons[r]}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput testID="cs-ugc-detail" accessibilityLabel={m.reportDetail} placeholder={m.reportDetail} placeholderTextColor={theme.mutedForeground} value={detail} onChangeText={setDetail} maxLength={500} multiline style={[styles.input, styles.multiline, { color: theme.surfaceForeground, borderColor: theme.border, backgroundColor: theme.surface }]} />
      {status ? (
        <Text testID="cs-ugc-status" accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.negative, fontSize: 14 }}>
          {status}
        </Text>
      ) : null}
      <ActionButton
        theme={theme}
        testID="cs-ugc-send"
        label={m.reportSend}
        disabled={!reason || busy}
        onPress={() => {
          if (!reason) return;
          setBusy(true);
          client.report(itemId, reason, detail).then(() => {
            say(m.reportThanks);
            onDone?.("reported", itemId);
            close();
          }, fail);
        }}
      />
      <ActionButton
        theme={theme}
        filled={false}
        testID="cs-ugc-block"
        label={m.blockAuthor}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          client.blockAuthor(itemId).then(() => {
            say(m.blockedThanks);
            onDone?.("blocked", itemId);
            close();
          }, fail);
        }}
      />
      <ActionButton theme={theme} filled={false} testID="cs-ugc-cancel" label={m.cancel} onPress={close} />
    </View>
  );
}

/**
 * El gancho `pageActions` del visor nativo para historias de la comunidad (equivalente de `ugcPageActions` de la web):
 * en las páginas con la marca `ugc.reportable` pone «⋯» y una hoja modal para reportar (con motivo) o no ver más a esa persona.
 * El resto de páginas no cambian. `onDone` avisa de lo hecho (`reported` | `blocked`).
 */
export function ugcPageActions(options: Common & { client: Pick<UgcClient, "report" | "blockAuthor">; onDone?: (what: "reported" | "blocked", itemId: string) => void }): PageActionsProvider {
  const m = resolveUgcMessages(options.locale, options.messages);
  return ({ page, group }) => {
    const ugc = page.ugc;
    if (!ugc?.reportable) return null;
    return {
      label: m.more,
      title: m.communityStory,
      render: ({ close, say }) => <ReportSheet client={options.client} itemId={ugc.item_id} authorLabel={ugc.author_label} fallbackTitle={group.title} m={m} close={close} say={say} onDone={options.onDone} />,
    };
  };
}

// ── «Comparte tu historia» ─────────────────────────────────────────────────

export type UgcPickedMedia = { name: string };
export type UgcComposerProps<F extends UgcPickedMedia = UgcPickedMedia> = Common & {
  groupId: string;
  community: StoryCommunity;
  client: Pick<UgcClient, "submit">;
  /** La app abre su selector de fotos/vídeos y devuelve lo elegido (o `null` si cancela). El SDK no depende de ningún selector. */
  pickMedia: (options: { acceptVideo: boolean }) => Promise<F | null>;
  /** La app (o el SDK de Storage) sube el archivo y devuelve la referencia ya escaneada: aquí no se suben bytes. */
  uploadMedia: (file: F) => Promise<UgcMedia>;
  onSubmitted?: () => void;
  testID?: string;
};

/**
 * Formulario «comparte tu historia»: medio (lo elige la app), pie con contador, descripción para quien no ve la imagen
 * (obligatoria sin pie), cómo se muestra la persona (opcional; vacío = anónima) y términos VERSIONADOS (casilla real y enlace).
 * Siempre queda en revisión: no se publica sola. Los rechazos del servidor llevan texto propio (`ugcErrorText`).
 */
export function UgcComposer<F extends UgcPickedMedia = UgcPickedMedia>({ groupId, community: c, client, pickMedia, uploadMedia, onSubmitted, messages, locale, testID }: UgcComposerProps<F>) {
  const { ctx, theme, rtl, m } = useUgcEnv({ messages, locale });
  const [file, setFile] = useState<F | null>(null);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [label, setLabel] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const { notice, say } = useAnnouncer();
  const ready = !!file && terms && !busy;
  const set = (text: string, error = false): void => {
    setStatus(error ? text : "");
    say(text);
  };

  const submit = (): void => {
    if (!file || !terms || busy) return;
    setBusy(true);
    setStatus("");
    say(m.submitting);
    uploadMedia(file)
      .then((media) => client.submit(groupId, c, { media, caption, alt, authorLabel: label, termsAccepted: terms }))
      .then(
        () => {
          say(m.submitted);
          setStatus(m.submitted);
          onSubmitted?.();
        },
        (err: unknown) => set(ugcErrorText(err, m), true),
      )
      .finally(() => setBusy(false));
  };

  return (
    <View testID={testID ?? "cs-ugc-composer"} accessibilityLabel={m.composerTitle} style={[styles.card, { direction: rtl ? "rtl" : "ltr", backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
        {m.composerTitle}
      </Text>
      <ActionButton theme={theme} filled={false} testID="cs-ugc-pick" label={m.chooseMedia} onPress={() => void pickMedia({ acceptVideo: c.accept_video }).then((f) => setFile(f), () => undefined)} />
      {file ? (
        <Text testID="cs-ugc-chosen" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {m.mediaChosen.replace("{name}", file.name)}
        </Text>
      ) : null}
      <Field theme={theme} testID="cs-ugc-caption" label={m.caption} hint={m.captionCount.replace("{n}", String(caption.length)).replace("{max}", String(c.max_caption_length))} value={caption} onChangeText={setCaption} max={c.max_caption_length} multiline />
      <Field theme={theme} testID="cs-ugc-alt" label={m.alt} hint={m.altHint} value={alt} onChangeText={setAlt} max={300} />
      <Field theme={theme} testID="cs-ugc-label" label={m.authorLabel} hint={m.authorLabelHint} value={label} onChangeText={setLabel} max={30} />
      <Pressable testID="cs-ugc-terms" accessibilityRole="checkbox" accessibilityLabel={m.acceptTerms} accessibilityState={{ checked: terms }} onPress={() => setTerms((t) => !t)} style={styles.radio}>
        <View style={[styles.box, { borderColor: terms ? theme.accent : theme.border, backgroundColor: terms ? theme.accent : theme.surface }]} {...HIDDEN_FROM_AT}>
          {terms ? <Text style={{ color: theme.accentForeground, fontWeight: "800" }}>✓</Text> : null}
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 14, flex: 1 }} {...HIDDEN_FROM_AT}>
          {m.acceptTerms}
        </Text>
      </Pressable>
      <Pressable testID="cs-ugc-read-terms" accessibilityRole="link" accessibilityLabel={m.readTerms} onPress={() => ctx.open({ type: "url", url: c.terms_url }, { surface: "story", elementId: "ugc.terms" })} style={styles.link}>
        <Text style={{ color: theme.accent, textDecorationLine: "underline", fontSize: 14 }} {...HIDDEN_FROM_AT}>
          {m.readTerms}
        </Text>
      </Pressable>
      <ActionButton theme={theme} testID="cs-ugc-submit" label={busy ? m.submitting : m.submit} disabled={!ready} onPress={submit} />
      {status ? (
        <Text testID="cs-ugc-status" accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: status === m.submitted ? theme.positive : theme.negative, fontSize: 14 }}>
          {status}
        </Text>
      ) : null}
      <LiveRegion text={notice} testID="cs-ugc-live" />
    </View>
  );
}

// ── «Mis historias» ────────────────────────────────────────────────────────

export type UgcMineProps = Common & {
  client: Pick<UgcClient, "mine" | "remove" | "appeal" | "exportMine">;
  /** Recibe el JSON de «descargar mis datos»; sin él se ofrece el menú de compartir del sistema. */
  onExport?: (data: Record<string, unknown>) => void;
  testID?: string;
};

function MineRow({ item: i, m, client, onChanged, setStatus }: { item: UgcOwnItem; m: UgcMessages; client: UgcMineProps["client"]; onChanged: () => Promise<void>; setStatus: (t: string) => void }) {
  const { theme } = useStoriesContext();
  const [appealing, setAppealing] = useState(false);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const reason = i.reason_code ? ((m.reasonCodes as Record<string, string>)[i.reason_code] ?? i.reason_code) : "";
  const appealLine = i.appeal === "open" ? m.appealOpen : i.appeal === "upheld" ? m.appealUpheld : i.appeal === "overturned" ? m.appealOverturned : "";
  const status = (m.status as Record<string, string>)[i.status] ?? i.status;
  return (
    <View testID={`cs-ugc-item-${i.id}`} style={[styles.item, { borderColor: theme.border }]}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 16, fontWeight: "600" }}>
        {`${i.caption || m.communityStory} · ${status}`}
      </Text>
      {reason && (i.status === "rejected" || i.status === "removed") ? (
        <Text testID={`cs-ugc-reason-${i.id}`} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
          {`${m.reasonLabel}: ${reason}`}
        </Text>
      ) : null}
      {appealLine ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
          {appealLine}
        </Text>
      ) : null}
      {i.can_appeal && !appealing ? <ActionButton theme={theme} filled={false} testID={`cs-ugc-appeal-${i.id}`} label={m.appeal} onPress={() => setAppealing(true)} /> : null}
      {appealing ? (
        <>
          <TextInput testID={`cs-ugc-appeal-text-${i.id}`} accessibilityLabel={m.appealPlaceholder} placeholder={m.appealPlaceholder} placeholderTextColor={theme.mutedForeground} value={text} onChangeText={setText} maxLength={1000} multiline style={[styles.input, styles.multiline, { color: theme.surfaceForeground, borderColor: theme.border, backgroundColor: theme.surface }]} />
          <ActionButton
            theme={theme}
            testID={`cs-ugc-appeal-send-${i.id}`}
            label={m.appealSend}
            onPress={() =>
              void client.appeal(i.id, text).then(
                () => {
                  setStatus(m.appealSent);
                  return onChanged();
                },
                (e: unknown) => setStatus(ugcErrorText(e, m)),
              )
            }
          />
        </>
      ) : null}
      {confirm ? (
        <View accessibilityRole="alert" style={styles.row}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.surfaceForeground, fontSize: 14 }}>
            {m.deleteConfirm}
          </Text>
          <ActionButton theme={theme} filled={false} testID={`cs-ugc-delete-no-${i.id}`} label={m.cancel} onPress={() => setConfirm(false)} />
          <ActionButton
            theme={theme}
            testID={`cs-ugc-delete-yes-${i.id}`}
            label={m.delete}
            onPress={() =>
              void client.remove(i.id).then(
                () => {
                  setStatus(m.deleted);
                  return onChanged();
                },
                (e: unknown) => setStatus(ugcErrorText(e, m)),
              )
            }
          />
        </View>
      ) : (
        <ActionButton theme={theme} filled={false} testID={`cs-ugc-delete-${i.id}`} label={m.delete} onPress={() => setConfirm(true)} />
      )}
    </View>
  );
}

/**
 * «Mis historias»: cada envío con su estado (en revisión, publicada, rechazada, retirada) y el MOTIVO de la decisión, la
 * reclamación (una vez; la resuelve otra persona), borrar (con confirmación) y «descargar mis datos». Recarga tras cada acción.
 */
export function UgcMine({ client, onExport, messages, locale, testID }: UgcMineProps) {
  const { theme, rtl, m } = useUgcEnv({ messages, locale });
  const [items, setItems] = useState<UgcOwnItem[] | null>(null);
  const [status, setStatusText] = useState("");
  const { notice, say } = useAnnouncer();
  const setStatus = useCallback(
    (t: string) => {
      setStatusText(t);
      say(t);
    },
    [say],
  );
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const reload = useCallback(async (): Promise<void> => {
    try {
      const list = await client.mine();
      if (alive.current) setItems(list);
    } catch (e) {
      if (alive.current) setStatus(ugcErrorText(e, m));
    }
  }, [client, m, setStatus]);
  useEffect(() => void reload(), [reload]);

  return (
    <View testID={testID ?? "cs-ugc-mine"} accessibilityLabel={m.mineTitle} style={[styles.card, { direction: rtl ? "rtl" : "ltr", backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.surfaceForeground }]}>
        {m.mineTitle}
      </Text>
      {items && items.length === 0 ? (
        <Text testID="cs-ugc-empty" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 15 }}>
          {m.mineEmpty}
        </Text>
      ) : null}
      {(items ?? []).map((i) => (
        <MineRow key={i.id} item={i} m={m} client={client} onChanged={reload} setStatus={setStatus} />
      ))}
      {status ? (
        <Text testID="cs-ugc-status" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedForeground, fontSize: 14 }}>
          {status}
        </Text>
      ) : null}
      <ActionButton
        theme={theme}
        filled={false}
        testID="cs-ugc-export"
        label={m.exportMine}
        onPress={() =>
          void client.exportMine().then(
            (data) => (onExport ? onExport(data) : void Share.share({ message: JSON.stringify(data, null, 2) }).catch(() => undefined)),
            (e: unknown) => setStatus(ugcErrorText(e, m)),
          )
        }
      />
      <LiveRegion text={notice} testID="cs-ugc-live" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  title: { fontSize: 18, fontWeight: "700" },
  sheet: { gap: 10 },
  field: { gap: 4 },
  input: { minHeight: MIN_TOUCH, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  radio: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dotFill: { width: 10, height: 10, borderRadius: 5 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  link: { minHeight: MIN_TOUCH - 8, justifyContent: "center" },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  row: { gap: 8 },
});
