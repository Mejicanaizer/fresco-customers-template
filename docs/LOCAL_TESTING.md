# Test the real customer → Grooming connection

This guide covers the explicit unpaid local QA runner. It must not be used against
a paid policy. The deployed client also supports the [payment flow](PAID_BOOKING_REVIEW.md);
current runtime policy comes from the selected owner. The customer page shows a
private management link after a successful booking; save it before leaving the page.

## Local servers

- Customer: <http://127.0.0.1:5373> (use an external Chrome window for the test)
- Owner: <http://127.0.0.1:5372>
- The current local UI review uses Vite (`npm run dev`) on5373 with the same real gateway and fixed private `.env` binding. Production still serves built `dist/` through `server/start.ts`. Private values stay out of this guide.
- Use the exact `127.0.0.1` origin. `localhost` is a different binding.
- No synthetic owner runs behind port 5373. Test fixtures are limited to isolated
  automated test ports and never imported by the application/server.

The coordinator manages the current Vite process for this local session. Older Node wrapper PID/log files do not describe this listener. The Grooming task owns its server upgrades and restarts.
Vite updates the local UI as source changes. Build/typecheck with `npm run build`; production uses `npm start`. Changes to runtime configuration require restarting only the customer process.
Do not start a second listener or stop the Grooming server.

## Connection check (read-only)

```sh
npm run test:local-owner
```

This checks the actual owner API's public catalog, its gateway projection, the
active unpaid/notification settings, real availability when ready, and rejection
of a foreign browser origin. It creates no client, pet, appointment, checkout or
message. It never substitutes fixtures. The command is intentionally limited to
the approved local ports/site, even though the reusable gateway supports other
independent deployments.

Latest real connection result: **PASS** after owner publication and the customer
optional-size contract fix. The real owner and gateway publish the same ready
unpaid catalog; authoritative availability and foreign-origin rejection validate.
The owner legitimately publishes no pet-size choices, so unknown/null size remains
available without inventing choices.

Historical authorized live QA created, rescheduled and cancelled a marked guest
and pet appointment. Record identities and schedule details remain in the private
operator journal. Each mutation replayed its original result
under the same key; both original private capabilities returned the current state.
Final state is cancelled with guest changes disabled, no online charge and no
notification. The coordinator visually verified creation in the owner agenda and confirmed
archiving the marked QA client. The Grooming task independently confirmed the
singular record and its three native history versions.

The retained, explicitly labeled test service is **Prueba · Baño y corte**, MXN100,
60 minutes, with **Estilista de prueba2**, Thursdays/Fridays 10:00–18:00, 30-minute
start intervals, 60-minute lead time and a 30-day horizon. These are authorized
arbitrary test values, not a commercial offering. The owner API remains authoritative
about each slot's actual availability.

## Live browser availability check (no booking writes)

```sh
STOREFRONT_QA_DATE=2026-09-25 npm run test:local-browser
```

This separate Chrome suite uses the actual running customer gateway and owner;
it starts no fixture servers. The availability test blocks browser POSTs; the catalog test observes requests and asserts that no mutations occur. It opens the booking
drawer through **Agregar → Ver reserva**, selects September25 in the calendar, verifies the real date-specific availability response, compares time buttons with the owner API, selects a slot and closes without submitting. The restored calendar uses buttons and no native date picker. Latest restored-UI result: **2/2 passed** (availability and catalog load/reload/reopen). No customer/pet data or private capability is supplied.

During automation the Codex embedded browser displayed a changed date without
updating React, and its native calendar button crashed that embedded tab. The
same date/slot journey passed in an isolated external Chrome context. The September23 visual restoration now uses a custom month calendar to match the reference; this was a design change, not a workaround for that embedded-browser issue.
Use external Chrome for manual local testing. Future checks need a currently
published Thursday/Friday within the owner horizon rather than a stale date.

## Manual booking journey

Run against reviewed test data only, after the owning task has approved the database
rollout and test records. A loopback page can still use a hosted database behind it.

1. In the owner's **Servicios** screen, add or edit the canonical service's details,
   price/duration and eligible professional. Saved, configured services appear publicly. Use the secondary
   hours/policy settings there for availability and booking terms. Select direct booking with online
   payment and automated notifications disabled. Do not invent availability in the
   customer page. Reload the customer page and verify the published values match.
2. Choose **Agregar**, then **Ver reserva**, a date and one of the backend's actual available times.
   Enter the test guest's name, exactly 10 phone digits (for example `5512345678`, without `+52`), and pet name. Size, breed and age can be unknown;
   a blank age stays unknown, while zero means a known age of zero months.
3. Verify the price and “Sin pago en línea”, then choose **Confirmar cita sin pago
   en línea**. The page must show confirmation only from the committed owner result.
   It must say no online charge occurred and must not open Stripe or claim a
   WhatsApp message was delivered.
4. Verify the same appointment in the owner agenda, with the correct client, pet,
   service, professional and time. Grooming uses its existing agenda status
   `pending`; the customer's `confirmed` receipt means the booking was saved.
5. Copy the private management link and open it. Its fragment disappears from the
   address bar after opening. Select **Reprogramar cita**, choose another actual
   available time and confirm. Verify the owner agenda reflects one changed
   appointment, preserving the original price and accepted terms.
6. For a booking more than 24 hours away, use the private link to cancel and verify
   the owner agenda cancellation. A booking inside the deadline must have changes
   disabled, with the same rule enforced by the backend.

Keep the private link out of screenshots, logs, issues and shared messages. It is
the customer's authority to manage that appointment, not a public reference.

## Expected recovery behavior

- **No connection / invalid business information:** retry after the owner setup is
  corrected; the page must never replace it with a demo catalog.
- **No available times:** choose another published date; the page cannot make slots.
- **Settings changed:** refresh the published conditions before submitting again.
- **Time was taken:** reload availability and select another actual slot.
- **Uncertain submission:** keep the page open and choose **Recuperar resultado**.
  This retries the same command/key; changing fields must remain disabled until
  the owner returns its original result.
- **WhatsApp disabled:** use the private link shown after booking. No message is
  promised or sent by this milestone.

The automated fixture suite independently covers unpaid confirmation, nullable
pet fields, private-link cleanup and cancellation. Those tests verify the customer
behavior; they do not establish real owner database integration or concurrency.

## Catalog edits and membership after saving

After an authorized owner edit in **Servicios**, a normal customer reload or new
page visit fetches the current public `bootstrap`. Service cards and category
filters are rebuilt from that response. A service absent from the owner projection
must also be absent from the customer cards. An empty catalog stays empty; an unavailable
owner shows the connection error without a stale or demo catalog.

The customer does not poll for edits while a page/form remains open. Refresh to
load the latest snapshot; the owner still validates revisions before any booking.
Do not change or reload an uncertain in-flight booking to bypass its same-key recovery.

Read-only real catalog check, once the owner update is ready:

```sh
npm run test:local-browser -- --grep 'real catalog'
```

It observes real bootstrap responses and checks every current card on initial
load, normal reload and a newly opened page; no mocked response, owner mutation,
booking data entry or seed is used. Run it after owner-controlled edit/restore stages
to validate each published snapshot. `STOREFRONT_QA_SERVICE_ID` optionally selects
a service for the separate availability test; that test no longer assumes a
single published service.

## Gated live QA runner

`test:local-owner` remains read-only. The separate `qa:local-owner` command can
create and change one explicitly marked temporary appointment in the real owner
database. **Do not run it until the coordinating task confirms both publication
and authorization for these test records.** The environment switch below prevents
accidental execution; it is not a substitute for that authorization.

The coordinator must provide one published service ID and two approved date
windows containing actual non-overlapping slots at least 48 hours ahead. Both
dates can be the same. Optional exact slot IDs prevent any automatic selection.
Put these inputs in a local JSON file, for example:

```json
{
  "serviceId": "COORDINATOR_APPROVED_SERVICE_ID",
  "initialDate": "COORDINATOR_APPROVED_YYYY-MM-DD",
  "replacementDate": "COORDINATOR_APPROVED_YYYY-MM-DD"
}
```

Optional fields are `initialSlotId`, `replacementSlotId` and `whatsapp`. The default
phone is the reserved fictional number `+12025550199`; no notification or payment
is sent. Client, pet and notes carry a unique `QA Storefront` marker. Only the pet
name is supplied; unknown size/breed/age stay null.

After readiness confirmation, run one phase at a time:

```sh
STOREFRONT_LIVE_QA_APPROVED=1 npm run qa:local-owner -- prepare /private/tmp/approved-storefront-qa-selection.json
STOREFRONT_LIVE_QA_APPROVED=1 npm run qa:local-owner -- create
STOREFRONT_LIVE_QA_APPROVED=1 npm run qa:local-owner -- inspect
STOREFRONT_LIVE_QA_APPROVED=1 npm run qa:local-owner -- reschedule
STOREFRONT_LIVE_QA_APPROVED=1 npm run qa:local-owner -- cancel
```

`prepare` checks the real catalog and slots, then writes a private journal; it
does not create an appointment. Each mutation phase checks exact replay and reads
the current receipt/guest state through the original capabilities. Pause between
phases for authenticated owner agenda verification. The runner never publishes
settings, changes providers, opens Checkout, sends messages, or deletes records.
Cancellation preserves the marked client/pet and cancelled appointment for audit.

The fixed journal `/private/tmp/fresco-storefront-live-qa.json` is mode0600 and
contains private capabilities. **Never print, attach, or commit it.** Normal output
contains only the fictitious marker, public reference, schedule IDs and result.
Raw response bodies, assertions, keys and tokens are not logged. An exclusive lock
prevents parallel phases. If a process crashes, inspect that process before removing
its stale lock; never discard the journal as a way to retry.

On an uncertain result, rerun the same phase. Its original command/key remains in
the journal; do not call `prepare` again or create another test booking. A STOP is
not permission to change the test policy, selected slot, or private journal. Report
the sanitized stage/code to the coordinator and resolve the exact pending request.

Execution status: runner type-checked; approval gate verified before live use.
Authorized prepare, create/replay, reschedule/replay and cancel/replay phases passed
against the real gateway. The original private journal is retained for recovery and
audit; do not overwrite it or run a second preparation against the same file.

## Local visual preview

The reference storefront is restored as a dark catalog and a right-edge booking drawer.
The calendar generates date cells within the owner window, but time buttons always come from
the real availability API. Selecting a service only stages one reservation; it does not
create an appointment or hold a time. The drawer keeps entered values when closed and reopened.

An explicit ignored `.env.local` value `VITE_STOREFRONT_PREVIEW_MEDIA=grooming` may enable
generated illustrative cover/service images in **Vite development only**, only for a grooming
site, and only where published images are absent. A visible local-preview caption identifies
them. It never replaces owner imagery, changes owner records, or invents a logo. No preview
images are imported into production builds. Published `coverImageUrl`, `logoUrl`, and service
`imageUrl` are the production media sources; owner editing/publishing is separate work.

`PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/visual-restoration.spec.ts`
verifies six synthetic services, imagery, search, calendar keyboard/month bounds, one-service
selection, draft retention, selected/hover styles, mobile focus and a pinned footer. It writes
explicit nonpersonal review screenshots under `$TMPDIR/fresco-customer-visual-qa/`.
The fixtures contain no real clients or capabilities and do not mutate the real owner.

The customer form accepts exactly 10 ASCII phone digits and prefixes `+52` internally.
For example, `5512345678` becomes `+525512345678` in `guest.whatsapp`. It rejects
letters, spaces, punctuation, country codes and shorter/longer numbers without truncating
them. The owner API and command-line QA still require canonical E.164, unchanged.
