import { Linking } from "react-native";
import type { ComponentAction } from "@customyai/stories-render";

/** Lista BLANCA de `deep_link` sin configurar nada (la misma que `DEFAULT_SCHEMES` del embed y del renderer web). */
const DEFAULT_SCHEMES = ["https", "mailto", "tel", "sms"];
/** Aunque la app los declare, nunca se abren: ejecutan código, leen ficheros o salen sin cifrar (= `NEVER_SCHEMES` del embed). */
const NEVER_SCHEMES = ["javascript", "data", "file", "blob", "vbscript", "about", "intent", "content", "filesystem", "ws", "wss", "ftp", "http"];

/**
 * `url`: solo https (como el contrato). `deep_link`: https, mailto, tel, sms y los esquemas que la app declare en
 * `allowedSchemes` (`myapp`; `tg`/`whatsapp` solo si los declara); nunca los de `NEVER_SCHEMES`.
 */
export function isSafeAction(action: ComponentAction, allowedSchemes: readonly string[] = []): boolean {
  if (action.type === "url") return /^https:\/\/[^\s/]+/i.test(action.url) && !/^https:\/\/[^/?#]*@/i.test(action.url);
  // eslint-disable-next-line no-control-regex
  if (action.uri.length > 2048 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(action.uri.trim())) return false;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(action.uri.trim());
  if (!m) return false;
  const scheme = m[1]!.toLowerCase();
  if (NEVER_SCHEMES.includes(scheme)) return false;
  return DEFAULT_SCHEMES.includes(scheme) || allowedSchemes.some((x) => x.toLowerCase() === scheme);
}

export const actionTarget = (action: ComponentAction): string => (action.type === "url" ? action.url : action.uri);

/** Apertura por defecto: el sistema decide (navegador, app instalada). Un fallo no rompe la historia. */
export async function openActionDefault(action: ComponentAction, allowedSchemes: readonly string[] = []): Promise<boolean> {
  if (!isSafeAction(action, allowedSchemes)) return false;
  try {
    await Linking.openURL(actionTarget(action));
    return true;
  } catch {
    return false;
  }
}
