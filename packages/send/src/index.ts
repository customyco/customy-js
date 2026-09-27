/**
 * @customyai/send — Customy Send para el servidor de una app: correo,
 * plantillas, dominios, webhooks, supresiones, notificaciones, push y
 * mensajes in-app, sobre `@customyai/core`.
 *
 * ```ts
 * import { createMachineTokens, discoverPlatform } from "@customyai/core";
 * import { createSend } from "@customyai/send";
 *
 * const platform = await discoverPlatform(process.env.CUSTOMY_ISSUER!);
 * const machineTokens = createMachineTokens({ issuer: platform.issuer, clientId, clientSecret, platform });
 * const send = createSend({ platform, machineTokens, scopes: ["send:emails:send"] });
 * await send.emails.send({ templateId: "welcome", to: "ana@example.com", variables: { name: "Ana" } });
 * ```
 *
 * Solo servidor: la credencial es secreta. Los errores son `CustomySendError`
 * (un `CustomySdkError` con `service: "send"`). Las apps de las personas usan
 * `@customyai/send/inbox` (y `@customyai/send/inbox/react`) con un token de
 * suscriptor de `send.inbox.createToken`, nunca la credencial de la app.
 */
export {
  createSend,
  SEND_API_VERSION,
  SEND_AUDIENCE,
  SEND_DEFAULT_BASE_URL,
  SEND_SCOPES,
  type ActorOptions,
  type Attachment,
  type CustomySend,
  type IdempotentOptions,
  type SendOptions,
  type SendScope,
} from "./client";
export { CustomySendError, toSendError } from "./errors";
export { actionCategoryId, type ActionCategoryInput } from "./actions";
export { verifyWebhook, WebhookVerificationError, type WebhookEvent } from "./webhooks";
export type * from "./types";
export type * from "./engage-types";
