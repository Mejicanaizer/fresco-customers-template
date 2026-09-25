# Storefront implementation checkpoint

This is the historical September 23 unpaid milestone. The later customer payment
implementation is described in [payment review](PAID_BOOKING_REVIEW.md); current
source checks are in [source validation](SOURCE_PUBLICATION.md). Statements below
about deferred payment work and local process state apply only to that milestone.

Status: **both customer apps deployed and direct unpaid booking lifecycles verified**.
Updated September 23, 2026. Stripe, automated WhatsApp and approval workflows remain deferred.
The coordinator owns hosted deployment, secret configuration and hosted mutation
QA. This customer task owns the release artifact and read-only hosted browser QA.
No commit, push, payment or WhatsApp send was performed. Grooming repository/server
port5372 was not modified or restarted by this customer task.

## September23 Deno deployment

Prepared one reusable Deno runtime and clean artifact workflow for `fashion-style`
and `best-in-show-grooming`, organization `lugearma`. Private profiles were created
outside the repository with mode0600 in a mode0700 directory. Grooming imports only
the four approved gateway `.env` keys for its working local binding. Fashion's
local binding remains unconfigured. The coordinator registered both customer apps
and issued their private production bindings independently.

Verification: build/typecheck passes; Node tests43/43 pass, including six deployment
tests; isolated artifact `deno check` passes with no browser-package resolution.
Deno2.4.5 synthetic integration passes for two separately authenticated owners,
POST/replay and cross-business capability rejection, Host/Origin guards, assets,
MIME/cache/HEAD/private-path protections, production configuration failures, and
inert non-production startup, including missing/unknown/miscased timelines, with
no owner calls or asset-read permission. The
coordinator independently repeated the suite and verified this Deno artifact
against the real local Grooming API with GET-only requests.

The reviewed artifact contains nine allowlisted runtime/config/client files plus
its SHA-256 manifest; no package.json, dependencies, env files, tests or private
operator data. The release digest is
`8fb0cee9b37fdc31bd4ac2ae6b9b8f249c13ec848a9f0aef1591ccfa03bdd1cd`.
All non-production Deploy requests return generic503/no-store and never load a business binding.
Production retains exact Host enforcement and hard-fails incomplete settings.

Grooming customer revision `m7ea5e4thf28` succeeded and serves its actual owner
catalog. The earlier customer revision `fr3krmwpy5x5` failed warmup on an unknown
timeline; the inert fallback above resolved it. The coordinator reports hosted
create/replay, conflict rejection, reschedule/replay and cancellation/replay passed,
with one appointment independently visible in native owner agenda HTML/RPC.
Read-only desktop browser QA passed the catalog, dark styling, guest/pet form,
September25 slots, local slot selection, drawer Escape/focus/reopen behavior and
an empty warning/error console. That check entered no personal data or booking.

Fashion owner revision `6efdfwf8wqcr` and customer revision `65qgr3psksgc` succeeded.
Both customer apps use the same artifact above. Fashion's read-only desktop browser
check passed its catalog, dark styling, guest form without pet fields, quarter-hour
September25 slots for its 30-minute service, local slot selection, drawer
Escape/focus/reopen and an empty warning/error console. No form was submitted.
The coordinator verified Fashion create/replay, changed-payload conflict rejection,
reschedule/replay and cancel/replay. Authenticated owner agenda HTML and its scoped
RPC showed exactly one matching appointment, with the staff service snapshot
matching the accepted service ID, MXN100 price and 30-minute duration.
Receipt and management capabilities were rejected by the other business's hosted
gateway in both directions with404 `link_invalid`. Both marked QA appointments
are cancelled. Test services remain enabled and clearly labeled; test prices do
not represent commercial rates. No online payment or automated message occurred.
Earlier owner login/503 probes predate these releases. Live local servers were
preserved. See [operator commands](DENO_DEPLOY.md)
and [hosted acceptance](HOSTED_ACCEPTANCE.md) for the procedure and remaining checks.

## Accepted scope

One maintained React/Vite storefront, independently bound to each business backend.
Services only, guests only, no products/cart/customer accounts. Admin selects direct
(default) or approval; approval requests hold no capacity. Luis approved direct
unpaid booking for the current milestone, with Stripe and WhatsApp deferred.
Future Stripe deposits use a configurable fixed amount; future approval deposits
are collected at request submission. Approval remains unavailable until its full
lifecycle is implemented. Guest changes have a 24-hour deadline. Successful create
returns a private management link immediately. Paid/expired-hold and refund rules
remain unimplemented and are not inferred.

## Real local connection

The customer runtime runs on5373, privately bound to the
actual Grooming server on5372. The coordinator switched the current local visual review to Vite; production retains the built Node server. Private deployment values are kept out of this guide. The ignored `.env` is
mode0600; gateway admission and owner capability secrets are separate. Only the
existing customer Vite listener was replaced; this customer task never restarted Grooming. Its owning task manages that runtime.

`npm run test:local-owner` now passes against the published real owner: catalog
projection equality, ready direct/unpaid settings, actual availability and
foreign-origin rejection. An obsolete nonempty pet-size restriction was removed:
size is optional, and the owner's empty choices correctly allow only null/unknown.
Focused contract/API tests (25/25), production build and diff checks passed.

Live gated QA `prepare`, `create`, `reschedule` and `cancel` passed through the real
gateway. Each same-key mutation replay returned its original result; original
receipt/management capabilities read the current receipt after each phase. The marked
client and pet were created, rescheduled and cancelled using approved test slots.
Record identities, schedule details and private capabilities remain only in the
operator journal. Price and accepted terms were preserved.
Final state cancelled; both guest actions false; payment none/deposit0/checkoutnull/
notification unconfigured. No payment/message occurred. The coordinator visually verified creation in the
native owner agenda and archived the marked QA client. The Grooming task independently
verified singular client/pet/details/booking/appointment, v1 create, v2 reschedule,
v3 cancellation, guest actor provenance without a staff actor, and one command per
operation despite replays. Published test settings/service remain available.

See [local testing](LOCAL_TESTING.md) for the gated phase commands and private
journal rules. Hosted migration/publication were performed by their owning tasks;
this customer task only created the expressly authorized marked QA record.

## September 23 catalog consolidation audit

The owner is consolidating catalog editing into **Servicios**, with secondary
hours/policy settings. All saved, configured services are published; no new service
visibility toggle is part of this owner change. Customer source needs no production change for normal
reload/reopen: bootstrap requests, HTML and gateway JSON are no-store; cards and
categories derive from that response, without local catalog storage or fallback.
An already open page keeps its snapshot until refreshed; backend revision checks
remain required for commands.

A focused isolated browser regression passed for service name/description/price/
duration/category edits, response membership removal, an empty catalog, new-tab reopening,
connection failure without old cards, and retry. Build/typecheck passed. The test
simulates published responses and does not mutate owner settings or hosted records.
No obsolete owner screen URL was found; guidance now points to Servicios.

The real read-only catalog load/reload/reopen test is prepared and the live
availability test no longer assumes exactly one service. Verification against the
new owner implementation is pending its readiness notification; no new live QA
record or settings change was made for this audit.

## Durable plan — local completion

1. [done] Versioned public contracts and fixed deployment binding; upstream
   API/admin/database ownership recorded in [owner contract](OWNER_API_CONTRACT.md).
2. [done] Narrow same-origin gateway, strict commands/public projections, origin/
   Host isolation, private token admission, bounded bodies and explicit failures.
3. [done] Runtime service catalog, authoritative slot selector, accessible guest
   dialog and one-pet grooming extension. Removed sample business, products/cart,
   generated slot helpers and message-only checkout.
4. [done locally] Truthful payment/request/status views, private link lookup,
   cancellation/rescheduling interfaces with booking revisions, accepted terms,
   uncertain-command recovery and no persistent browser database/token storage.
5. [done locally] Automated contract/gateway/client and browser validation with
   two synthetic independent owners/deployments, production build and visual review.
6. [done] README, architecture/readiness/setup/rollout and API contract updated to
   accepted scope, with explicit upstream limitations and test evidence below.

## Runtime decision

Keep React 19/Vite through a framework-neutral HTTP boundary. Fresh/Preact islands
are not imported or copied as React components. Shared Fresh/Preact UI adoption is
not completed; any future migration/adapter needs upstream review. Existing
project-owned presentation now restores the screenshot reference with the original system font stack, a native dialog container, and accessible custom calendar/time buttons.

## Verification — exact commands and final results

| Command | Result |
| --- | --- |
| `npm test` | 37/37 passing Node contract, client and gateway tests; Node 22.20.0 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` | TypeScript + Vite production build passed; 17 booking regressions and 4 visual/interaction scenarios passed (21 total) |
| `git diff --check` | Passed, no whitespace errors |
| `npm run test:local-owner` | PASS against the actual published Grooming owner and customer gateway |
| `STOREFRONT_QA_DATE=2026-09-25 npm run test:local-browser` | PASS2/2: restored calendar with real September25 slots and catalog load/reload/reopen; no booking POST |
| Gated live QA phases | PASS: actual create/reschedule/cancel, immutable replays, original capability reads; native owner creation visually verified |

Browser execution used an installed Chrome in a clean test profile. The sandbox
initially denied fixed loopback listening; the local test command then ran with
approved execution permissions. Two fixture owners use 5491/5492, and two
production Node processes use 5375/5376 with the same `dist/` and independent runtime
bindings. The harness stops its own servers afterward. External HTTPS requests
are blocked in the browser suite; no payment/WhatsApp navigation occurs.

### What the tests actually prove

- Contract projection, binding/version checks, malformed/oversized responses,
  forbidden command fields and price/deposit injection; no raw owner secrets leak.
- Two real local HTTP gateways reach only their bound synthetic owner; cross-site
  origins/capabilities fail. This is transport isolation proof, not hosted RLS proof.
- Synthetic owner ledger exercises repeated commands, conflicts, stale revision/
  slot responses and lost-create-response replay after progress. This is fixture
  contract proof, not proof of real SQL concurrency or existing staff/guest arbitration.
- Client validates selected service/provider/slot/instants, quotes and accepted
  terms. New site terms do not replace existing booking terms. UUID fallback and
  unavailable/throwing secure crypto recover without a permanently busy form.
- Grooming duration boundary (15–480), 37-minute non-grid slot ending at following
  local midnight, local-date correctness, one valid pet and private upload disabled.
- Browser service-only catalog/guest entry, deposit display, pending outcomes,
  empty availability, runtime settings refresh, exact retry key/body, fragment
  cleanup/no persistent storage, mobile focus wrapping/restoration, cancellation,
  rescheduling and server-declared deadline actions.
- Direct unpaid creation returns confirmed with payment=none, deposit quote0,
  no checkout and notification=unconfigured. Unknown pet size/breed/age remain null.
  Browser saves the management link and uses it to cancel without payment claims.
- The isolated fixture browser suite uses mocked reschedule/deadline/error replies;
  its create/cancel path uses synthetic owners. Separately, gated live API QA and
  the read-only real Chrome availability check establish the real integration described
  above. These are distinct evidence sets; Stripe/WhatsApp remain untested/deferred.

### Visual review artifacts

Synthetic fixtures only; no real customer data or guest capability appears.
Reviewed desktop catalog and 390px mobile booking dialog, including focus outline,
scrolling form and preserved visual layout. Fonts use the local fallback because
external network is disabled in browser tests.

Full fixture runs generate `desktop-catalog.png` and `mobile-booking.png` inside
ignored `test-results/`. Focused runs replace that output directory; regenerate
the images with `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` when needed.

## Current change groups for review

- `src/lib/contracts.ts`, `src/lib/api.ts`: public DTO validators, secure request IDs,
  same-origin client, contextual result validation and in-memory private link handling.
- `server/gateway.ts`, `server/node-handler.ts`, `server/start.ts`, `vite.config.ts`:
  deployment binding, runtime transport and production/static development integration.
- `src/App.tsx`, `src/main.tsx`, `src/components/{StorefrontLayout,SlotPicker,
  BookingDialog,BookingReceipt,GuestManagement,ManagementLink}.tsx`, stylesheet and index:
  reusable service-only guest UI and explicit operational states.
- Removed obsolete Hero cart/product/checkout components, static STORE_CONFIG,
  old store/cart types and generated date/slot utility. No owner inventory changes.
- `tests/`, `playwright.config.ts`, package/lock/scripts, `.env.example`, `.gitignore`:
  reproducible validation and private per-deployment setup.
- README and four guides: current behavior, contracts, dependencies and review evidence.

## Deferred workflows and limits of this evidence

Direct unpaid booking is connected to the actual Grooming owner. Its owning tasks
implemented/adopted the owner API/admin controls and applied reviewed storage
migrations under explicit authorization. This repository contains only the customer
UI, gateway and tests; it does not implement or mutate the owner backend directly.

The hosted QA establishes one marked appointment's create/replay/reschedule/cancel
journey for each business, native owner agenda verification and cross-business
receipt/management capability rejection. It does not establish production load,
live concurrent staff/guest races or a real within-24-hour rejection. Local/isolated
tests are separate evidence and should not be described as hosted race or delivery proof.

Stripe/Checkout/signed webhook/accounting/reconciliation and paid-expired-hold
policies remain deferred. Luis selected future fixed deposits and approval deposit
collection at submission; the full approval lifecycle remains disabled. WhatsApp
provider/templates/consent/outbox/delivery and private pet photo uploads are also
deferred. Disabled Stripe/WhatsApp do not block the approved unpaid milestone.
Fresh/Preact shared UI adoption remains deferred. Hosted release status is recorded
above; broad production load and concurrency acceptance remain separate.

## September 23 visual restoration

The visual reference was found in the original Fresco Fashion Style feature, separate from
this repository's initial commit. Its dark palette and main geometry are restored in
project-owned React components: 1200px outer content / 1152px grid, three columns, 190px
card media, 6px card corners, 280px hero, 88px business avatar, white controls and 440px
right drawer. Typography uses the original system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", Roboto, sans-serif stack. No custom font assets or remote font requests are needed.

The flow stays guest/service-only with one selected service and one pet. Selecting does
not book or hold capacity. The drawer preserves its form on close, pins header/footer,
and uses calendar dates plus provider-grouped real slot buttons. Private receipt/management,
revision, idempotency, uncertain-result lock and tenant isolation remain unchanged. No
products, quantity cart, fake providers/slots, rating claims or payment form were restored.

Optional `coverImageUrl` is backward compatible; null logo and service images already
existed in the DTO. Owner media publication remains pending. A clearly marked explicit
development-only generated-photo fallback supports the local visual review, never production
or owner records. The build bundles only CSS and JavaScript.

Node/contract/API tests: 37 passed. The existing 17 browser scenarios pass with the
new selection/calendar controls. Additional visual tests cover 1280/1920 desktop,
390/320 mobile, real rendered imagery, the exact system font stack, hover selection, provider labels, month
limits, keyboard navigation, draft retention, search, absent images, no overflow and
pinned footer. Screenshots are regenerated in `$TMPDIR/fresco-customer-visual-qa/`.
No hosted mutation, payment, notification, commit or push was made for this restoration.

Visual restoration verification: four additional browser scenarios pass (21 fixture browser
scenarios total). Screenshots were inspected at desktop and mobile sizes against the
reference structure. Real owner/gateway GET checks and September25 calendar selection pass.
Both real browser checks pass (2/2). The live catalog check accepts Vite HTML `no-cache` or Node HTML `no-store`, and still
requires `no-store` on catalog JSON; production HTML is also asserted in fixture tests.
