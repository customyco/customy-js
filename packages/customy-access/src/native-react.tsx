/**
 * @customyai/customy-access/native/react — el cliente nativo en React (React
 * Native, Expo).
 *
 * @deprecated Usa `@customyai/client/native/react`: este módulo lo reexporta
 * tal cual (misma API). El aviso de deprecación sale una vez al cargarlo.
 */
import { warnDeprecated } from "./deprecation";

export * from "@customyai/client/native/react";

warnDeprecated("@customyai/customy-access/native/react", "use @customyai/client/native/react (same API).");
