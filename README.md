# Fresco customer storefront

One maintained React 19 / TypeScript / Vite application for **service bookings by
guests**, with a dark photographic catalog, single-reservation summary and booking drawer. Deploy the same build independently for each business. Branding, service
publication, prices, deposits, branch timezone and booking policy come from that
business's owner backend. No product purchasing, cart or customer account exists.

**The shared customer implementation is deployed for both businesses.**
The [Grooming customer page](https://best-in-show-grooming-customers.lugearma.deno.net)
and [Fashion customer page](https://fashion-style-customers.lugearma.deno.net) use
their respective owner catalogs, agendas and runtime payment policies. The client
supports unpaid booking and Stripe deposit, approval and refund status flows.
Sandbox acceptance and the current hosted policy are managed by the owner apps;
the MXN149 test deposit is runtime configuration, never a client constant.
See [source validation](docs/SOURCE_PUBLICATION.md) for the checks of the committed
implementation. Historical unpaid QA below does not describe the current policy.
See [hosted acceptance](docs/HOSTED_ACCEPTANCE.md) and
[local testing](docs/LOCAL_TESTING.md) for the separate verification workflows.

Unconfigured deployments fail visibly; there is no sample-business fallback.

## Read first

- [Source validation](docs/SOURCE_PUBLICATION.md): publication scope and current local checks.
- [Implementation checkpoint](docs/IMPLEMENTATION_CHECKPOINT.md): historical unpaid milestone.
- [Reusable architecture](docs/REUSABLE_STOREFRONT.md): runtime and deployment ownership.
- [Owner API contract](docs/OWNER_API_CONTRACT.md): exact upstream boundary and policy gates.
- [Public catalog JSON](docs/PUBLIC_CONFIG.md): `/store.config.json` compatibility URL for owner-backed catalog consumers.
- [Implementation readiness](docs/IMPLEMENTATION_READINESS.md): historical unpaid integration boundaries.
- [Deno Deploy operator guide](docs/DENO_DEPLOY.md): two private business profiles, clean local-source staging and deployment gates.

## Local setup

Use Node **22.20 or newer**. Node's built-in TypeScript stripping runs the gateway
and contract tests; TypeScript checks server and browser code during the build.

```sh
npm ci
npm test
npm run build
npm run dev
```

Open <http://127.0.0.1:5373>. Without a binding this deliberately displays a
connection/unconfigured error, not a working demo. There are no customer logins.

To connect a reviewed owner API, copy `.env.example` to `.env` and fill in:

| Server setting | Meaning |
| --- | --- |
| `STOREFRONT_SITE_ID` | Fixed public site ID issued by this business backend |
| `STOREFRONT_OWNER_API_ORIGIN` | This business's HTTPS owner API origin, no path/query |
| `STOREFRONT_PUBLIC_ORIGIN` | Exact storefront origin, including local port |
| `STOREFRONT_OWNER_API_TOKEN` | Private deployment-scoped owner admission token; required in production |
| `HOST`, `PORT` | Node listener; default `127.0.0.1:5373` |

Loopback HTTP is permitted only outside production. Vite loads `.env` for the
local gateway; `npm start` loads it through Node. Never use `VITE_` variables for
secrets. A token is not a staff JWT and must not impersonate an authenticated owner.
No Supabase service role, Stripe secret or WhatsApp credential belongs in the browser or this gateway. Local ignored .env may contain only the fixed binding and private gateway admission token; the owner capability secret stays in the owner runtime.

## Production runtime

For Deno Deploy, use the [local-source deployment workflow](docs/DENO_DEPLOY.md).
It builds one clean artifact for Fashion Style and Best in Show Grooming, with
private runtime bindings under organization `lugearma`. Both customer apps are
registered and their production profiles have been issued by the coordinator.
Grooming revision `qfq64fekmr8y` and Fashion revision `t3t9zvvdn34z` are live from
the same reviewed application release (September 24, 2026). Both passed deployed
catalog, availability, route and exact asset-hash checks with payment disabled;
see [release evidence](docs/HOSTED_ACCEPTANCE.md#september-24-customer-release).
`npm run storefront -- --help` lists operator commands;
`npm run test:deno` verifies isolated Deno runtimes.

Build once and run a separately configured process for each business:

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

Put the process behind that deployment's HTTPS reverse proxy. Preserve the public
`Host` exactly; forwarded hosts never override the binding. Route both built pages
and `/api/storefront/v1/*` to this process. The server serves only known app pages
and built assets. `vite preview` is assets-only and does **not** provide the API.
Uploading only `dist/` to a static CDN does not provide a booking backend.

Ordinary admin settings are loaded at runtime through `bootstrap`; rebuilds are
not needed for branding or publication changes. Pin releases and roll each
business forward or back independently. No publishing automation is installed.

The owner adds and edits services in **Servicios**, using the same canonical
catalog as the owner agenda. Saved, configured services appear in the public catalog. Hours and booking policies remain
secondary settings there. Reload or reopen the customer page after saving changes;
it fetches the current public catalog without keeping a local catalog copy. An
already open page retains its loaded revision until refreshed.

## Automated verification

```sh
npm test
npm run test:browser
npm run test:local-owner
```

The browser suite uses Playwright Chromium. Install its browser with
`npx playwright install chromium` if needed, or use an installed Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
npm run test:local-owner
```

It starts two local synthetic owner servers (5491/5492) and two independently
bound production storefront processes (5375/5376), both serving the same built
`dist/`. Tests never navigate to Stripe or send WhatsApp messages. Synthetic
fixture code is restricted to `tests/` and never loaded by production. Test
traces/video are off to avoid recording guest capabilities; fixtures contain no
real people. See the checkpoint for exact latest results and limitations.

The `test:local-owner` command is read-only, uses the real local owner on5372 and customer server on5373, and never starts or substitutes fixtures. It compares owner/gateway catalog projections and checks authoritative availability when ready. It deliberately fails if the actual owner route is absent.

For a read-only check of the real date/slot UI in installed Chrome, run
`STOREFRONT_QA_DATE=<published YYYY-MM-DD> npm run test:local-browser`. It starts no
fixtures. Set `STOREFRONT_QA_SERVICE_ID` to choose a particular published service
when the catalog has several entries. The availability test blocks booking submissions.
For catalog load/reload/reopen only, use `npm run test:local-browser -- --grep 'real catalog'`;
this test uses ordinary browser caching and observes GET-only behavior without mocks.
The restored calendar uses keyboard-accessible date buttons and API-provided time buttons. Use external Chrome for local manual testing. See the local-testing guide for optional development-only illustrative media and visual screenshots.

## Behavior

The UI uses only backend-provided slots and stable IDs. Submissions contain no
prices or deposit amount. Total and the active payment policy are displayed before submission. Direct unpaid mode confirms only after the owner atomically commits the appointment; the UI clearly states no online charge occurred. Stripe mode requires an explicitly configured fixed deposit and verified owner payment status; a confirmed appointment also requires committed agenda allocation. A Stripe redirect never proves payment. Paid approval requests remain unconfirmed until the owner approves them, and must not hold capacity. Only missing configuration for an enabled workflow disables booking.

Secure receipt/management links use fragments that are removed immediately and
kept only in memory. Guest changes require an authoritative 24-hour deadline and
booking revision. A lost mutation response locks edits and reuses the original
idempotency key. A successful create returns a separate management capability shown as a private link that the customer can copy. Reloading clears in-memory context; recover via that saved link or owner support, never by inventing a second booking. No automated WhatsApp notification is claimed while notifications=none.

The grooming extension captures one pet per appointment. Pet name is required; size, breed and age can be unknown/null. Private photo uploads
are unavailable until the owner implements private upload/ownership support.

## License

MIT © 2026 Fresco Ecosystem
