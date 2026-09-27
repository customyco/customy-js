/**
 * @customyai/customy-access/native — Customy Access para apps nativas (React
 * Native, Expo, cualquier runtime con fetch).
 *
 * @deprecated Usa `@customyai/client/native`: este módulo lo reexporta tal cual
 * (misma API). El aviso de deprecación sale una vez al cargarlo.
 */
import { warnDeprecated } from "./deprecation";

export * from "@customyai/client/native";

warnDeprecated("@customyai/customy-access/native", "use @customyai/client/native (same API).");
