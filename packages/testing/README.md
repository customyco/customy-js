# @customyai/testing

Test doubles for apps built on Customy: a fake platform that behaves like `createCustomy` from `@customyai/customy-sdk/server`, validates what you send against your `customy.app.json` manifest, and records it so tests can assert on it — no network.

```bash
npm install --save-dev @customyai/testing
```

```ts
import { createCustomy } from "@customyai/customy-sdk/server";
import { createFakeCustomy } from "@customyai/testing";

const fake = createFakeCustomy({ manifest }); // your customy.app.json
const customy = await createCustomy({ ...fake.credentials, fetch: fake.fetch });

await customy.data.track("habit.completed", { streak: 1 }, { userId: "u1", consent: { analytics: true } });
fake.events; // what Customy received, validated against the manifest schema
fake.planCapabilities("pro"); // effective capabilities of a manifest plan
fake.reset();
```
