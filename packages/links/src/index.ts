/**
 * @customyai/links — Customy Links sobre `@customyai/core`: enlaces cortos,
 * analítica, conversiones, dominios y webhooks.
 *
 * ```ts
 * import { createLinks } from "@customyai/links";
 *
 * const links = createLinks({ platform, machineTokens, scopes: ["links:write"] });
 * const link = await links.links.create({ destinationUrl: "https://example.com/launch" });
 * await links.track.sale({ externalId: "user_1", amount: 49.9, currency: "USD" });
 * ```
 *
 * Los errores son `CustomyLinksError` (un `CustomySdkError` con `service: "links"`).
 */
export {
  createLinks,
  CustomyLinksError,
  LINKS_AUDIENCE,
  LINKS_DEFAULT_BASE_URL,
  LINKS_SCOPES,
  shortUrlOf,
  type CustomyLinks,
  type LinksOptions,
  type LinksScope,
} from "./client";
export { signPayload, verifyWebhook, WebhookVerificationError } from "./webhooks";
export type * from "./types";
