# Customy JavaScript SDKs

Official JavaScript and TypeScript SDKs for the Customy platform.

| Package | Description |
|---|---|
| [`@customyai/flags-eval`](./packages/flags-eval) | Pure local feature flag evaluation engine for Customy FME. |
| [`@customyai/customy-access`](./packages/customy-access) | Deprecated: use @customyai/client, @customyai/web, @customyai/server and @customyai/access. Adapter of the Customy Access SDK kept for one major cycle (the admin client CustomyAccess stays here, frozen). |
| [`@customyai/send-sdk`](./packages/send-sdk) | Deprecated: use @customyai/send. Adapter of the Customy Send client (email API and Customy Engage: push, in-app inbox and in-app messages) kept for one major cycle. |
| [`@customyai/links-sdk`](./packages/links-sdk) | Deprecated: use @customyai/links. Adapter of the Customy Links client (short links, analytics, conversions, webhooks) kept for one major cycle. |
| [`@customyai/customy-sdk`](./packages/customy-sdk) | Deprecated: use @customyai/sdk. Adapter of the Customy umbrella SDK (createCustomy, portfolio clients) kept for one major cycle. |
| [`@customyai/testing`](./packages/testing) | In-memory fake of the Customy platform for testing apps: discovery, machine tokens, Send, Billing and Data, checked against the app's customy.app.json |
| [`@customyai/core`](./packages/core) | Customy SDK core: fetch transport, typed errors, retries with Retry-After, idempotency, pagination, platform discovery and machine tokens. Runs on Node, edge runtimes and browsers. |
| [`@customyai/server`](./packages/server) | Customy identity verification for any server: JWKS with rotation, machine and user token verifiers, BFF actor assertions and request verification over the standard Request, with a Node IncomingMessage adapter. Server only. |
| [`@customyai/web`](./packages/web) | Customy same-origin session handlers over the standard Request and Response: auth proxy, social sign-in, sign-out, impersonation callback, server session, route protection, cookie names and local session token verification. Node and edge; never in a browser bundle. |
| [`@customyai/client`](./packages/client) | Customy browser client: session, sign-in, MFA, passkeys, active organization, capabilities and account linking over same-origin HttpOnly cookies, with React, native and native React bindings as subpaths. Never takes server secrets. |
| [`@customyai/access`](./packages/access) | Customy Access: capabilities, catalog, users and user contact, flags and the generated client for every public Access operation, over @customyai/core. |
| [`@customyai/openfeature-provider`](./packages/openfeature-provider) | OpenFeature provider for Customy Experiments: server and web, with local evaluation over the Access flags snapshot or remote evaluation (POST /v1/flags/evaluate), change events, track() to conversions and exposure reporting. |
| [`@customyai/data`](./packages/data) | Customy Data: typed event tracking (track, identify, page, screen, group, alias) with batching; the scope comes from the credential, never from headers. Over @customyai/core. |
| [`@customyai/send`](./packages/send) | Customy Send: email, templates, domains, webhooks, suppressions, notifications, push and in-app messages for servers, over @customyai/core (typed errors, retries with Retry-After, idempotency, Access machine tokens); ./inbox and ./inbox/react for end-user apps with a subscriber token. |
| [`@customyai/billing`](./packages/billing) | Customy Billing for apps: report usage of the meters an app declares, with its Access identity, over @customyai/core. |
| [`@customyai/provisioning`](./packages/provisioning) | Customy Provisioning: create, find and clean up TEST users (identity provisioning) with an Access API key, over @customyai/core. Includes withEphemeralUsers for CI. |
| [`@customyai/links`](./packages/links) | Customy Links: short links, analytics, conversions, domains and webhooks, over @customyai/core (typed errors, retries with Retry-After, pagination, Access machine tokens). |
| [`@customyai/storage`](./packages/storage) | Customy Storage for connected applications: upload bytes from memory (checksum and multipart handled), read metadata, signed download URLs and trash, over @customyai/core (typed errors, retries with Retry-After, idempotency, Access machine tokens). Server only. |
| [`@customyai/sdk`](./packages/sdk) | The whole Customy platform with one app identity: createCustomy() reads the environment discovery, holds the app's machine tokens and composes Access, Data, Send, Billing, Links, Provisioning and CRM People (plus any discovered product), and emits connected-app user lifecycle events from their own packages. Server only. |
| [`@customyai/cli`](./packages/cli) | Customy CLI: validate, type and sync customy.app.json (customy apps ...) and provision TEST users (customy users | audit | policy | whoami). Also usable as a library. |
| [`@customyai/stories-render`](./packages/stories-render) | Customy Stories renderer: headless core (state machine, ordering, seen state, preload, gestures, layout) plus light web and React components for story bars, story viewers and banners, and an optional module with the interactive components (quiz, reactions, rating, open question, actions, commerce). |
| [`@customyai/stories-react-native`](./packages/stories-react-native) | Customy Stories for React Native: story bar, full-screen viewer, banners, provider and hooks (plus headless mode) on the pure core of @customyai/stories-render. Reanimated + Gesture Handler as peers; video, media cache, storage and Lottie are injectable. Optional modules: widgets (Canvas, Swipe Cards, Checklist, Tour, Inline), video-feed, game, ugc and live (live streams; the LiveKit client is injected, never a dependency). |
| [`@customyai/stories-embed`](./packages/stories-embed) | Customy Stories embed: self-contained bundle (ESM + IIFE <script>) built from @customyai/stories-render for WebView and bundler-less sites, with a versioned, strictly validated native message bridge (iOS, Android, React Native, Flutter, Unity, iframe). Heavy modules (components, lottie, game, video, live, ads) load lazily. |

## Security

Please report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).
Releases are published from this repository with npm provenance.

## Contributing

This repository is exported from Customy's source of truth. Issues and pull
requests are welcome as proposals; accepted changes are applied upstream and
exported back here.

## License

MIT
