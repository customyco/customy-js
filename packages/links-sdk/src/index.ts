/**
 * @customyai/links-sdk
 *
 * @deprecated Usa `@customyai/links` (`createLinks`). Este paquete es su
 * adaptador durante un ciclo major.
 */
export { CustomyLinks, CustomyLinksError, DEFAULT_BASE_URL, shortUrlOf } from "./client";
export { verifyWebhook, signPayload, WebhookVerificationError } from "@customyai/links";
export type * from "./types";
