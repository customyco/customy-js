# @customyai/links-sdk

TypeScript SDK for the [Customy Links](https://links.customy.ai/docs) API:
short links, custom domains, analytics, conversions and webhooks. Zero
dependencies — only `fetch` — so it runs in Node 18+, Bun, Deno, Cloudflare
Workers and the browser.

```bash
npm install @customyai/links-sdk
```

## Quick start

```ts
import { CustomyLinks, shortUrlOf } from "@customyai/links-sdk";

const links = new CustomyLinks({ apiKey: process.env.CUSTOMY_LINKS_KEY! }); // cl_live_… or cl_test_…

const link = await links.links.create({
  destinationUrl: "https://example.com/launch",
  slug: "launch",
  title: "Product launch",
  utmSource: "newsletter",
  conversionTracking: true,
});
console.log(shortUrlOf(link)); // https://links.customy.ai/launch

const stats = await links.links.analytics(link.id, { days: 30 });
console.log(stats.totalClicks, stats.byCountry);
```

## Conversions

With `conversionTracking: true` the redirect appends `?lnk_id=<clickId>` to
the destination. Store it and report leads and sales from your backend:

```ts
await links.track.lead({ clickId, externalId: "user_123" });
await links.track.sale({ externalId: "user_123", amount: 49.9, currency: "USD" });
```

## Webhooks

Events are signed with the Svix scheme (`webhook-id`, `webhook-timestamp`,
`webhook-signature`). Verify with the raw request body:

```ts
import { verifyWebhook } from "@customyai/links-sdk";

app.post("/hooks/links", async (req, res) => {
  try {
    const event = await verifyWebhook(req.rawBody, req.headers, process.env.LINKS_WEBHOOK_SECRET!);
    if (event.type === "conversion.sale") { /* … */ }
    res.sendStatus(200);
  } catch {
    res.sendStatus(400);
  }
});
```

## Errors and retries

API errors throw `CustomyLinksError` with `status`, `code` (stable, e.g.
`SLUG_TAKEN`) and `details`. `429` and `5xx` responses are retried twice
with exponential backoff, honouring `Retry-After`; set `maxRetries: 0` to
disable.

## Options

| Option | Default | |
|---|---|---|
| `apiKey` | — | required |
| `baseUrl` | `https://links.customy.ai` | your own short domain works too |
| `timeoutMs` | `15000` | per request |
| `maxRetries` | `2` | |
| `fetch` | `globalThis.fetch` | inject your own |

Full reference: <https://links.customy.ai/docs>. Service status:
<https://links.customy.ai/status>.
