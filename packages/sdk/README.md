# @customyai/customy-sdk

Umbrella SDK for the Customy portfolio. It exposes one isolated client per
product and platform service while keeping the base URL of each boundary
explicit. It never guesses staging or production URLs.

```ts
import { createCustomySdk } from "@customyai/customy-sdk";

const customy = createCustomySdk({
  baseUrls: {
    crm: "https://crm.customy.ai",
    forms: "https://forms.customy.ai",
    access: "https://access.customy.ai",
  },
  bearerToken: process.env.CUSTOMY_ACCESS_TOKEN,
});

const response = await customy.products.crm.get("/v1/contacts", {
  query: { limit: 25 },
});
```

Every product is available under `customy.products` and every platform service
under `customy.platform`. A client without a configured URL is still exposed,
but fails with a configuration error only when it is used. This allows one
application to configure only the boundaries it owns.

The umbrella currently provides the shared authenticated transport boundary for
the full portfolio. Typed domain methods are added from each product's OpenAPI
contract as that contract becomes canonical; the SDK does not invent request or
response schemas for products that have not published one yet.
