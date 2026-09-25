# Implementation readiness

Historical September 23 unpaid milestone. Later payment support is documented in
[the payment review](PAID_BOOKING_REVIEW.md), and the current local validation is in
[source validation](SOURCE_PUBLICATION.md). Deferred-work statements below describe
the earlier milestone, not the current hosted owner configuration.

Updated September 23, 2026. Both customer apps are deployed and their direct unpaid
booking lifecycles, native owner agenda checks, cross-business capability isolation
and read-only desktop browser checks passed. This does
not establish production load/concurrency behavior. See [verification log](IMPLEMENTATION_CHECKPOINT.md)
and [owner contract](OWNER_API_CONTRACT.md).

## Implemented locally

- React service-only guest UI with runtime catalog/branding and explicit missing
  configuration. Removed sample STORE_CONFIG, products, cart, generated slots and
  WhatsApp-message checkout. Existing visual language retained.
- Framework-neutral versioned public contract and fixed-business Node gateway;
  strict command schemas, allowlisted responses, Host/origin checks, request/response
  size limits, upstream timeout and no credential forwarding or cross-site fallback.
- Backend availability UI, stable IDs, branch timezone formatting, loading/error/
  retry states and native accessible dialog/date/select controls.
- Price and explicit active payment display; direct unpaid confirmation and future pending-payment/request receipts;
  status recovery, review-required state, separate private receipt/management links.
- Mutation keys survive uncertain retries in memory. Unsupported secure random
  capability fails visibly without leaving a form busy. Old booking commands carry
  bookingRevision; existing bookings render accepted terms snapshots.
- One pet required for Grooming; only its name is mandatory. Unknown size/breed/age are nullable. Private photo uploads disabled. Successful booking exposes a private management link even without WhatsApp.
- Automated contracts/gateway/API tests, two independent local HTTP deployment
  bindings and browser tests using the built application and synthetic owners.

## Real connection now verified

The owner task adopted the shared runtime and applied the reviewed storefront and
Grooming migrations under explicit authorization. The coordinator published a
clearly marked test service and visually verified the customer-created appointment
in the native owner agenda. This task verified real gateway create/replay, original
private receipt/management reads, reschedule/replay and cancel/replay; the final
marked appointment is cancelled. See the checkpoint for the sanitized evidence; record identities stay private.

| Workflow | Current evidence / remaining work |
| --- | --- |
| Owner API and settings | Real catalog projection, publication, private binding and authoritative slots pass through the gateway |
| Direct unpaid booking | Actual create/reschedule/cancel plus immutable replays and original capability reads pass; paymentnone/notificationunconfigured |
| Guest deadlines / capacity | Local contract coverage and owner-owned database tests; this live QA stayed at least48h ahead and did not exercise hosted concurrency |
| Stripe/accounting | Deferred: Checkout, signed webhooks, payment reconciliation and paid/expired-hold policies |
| Approval requests | Deferred: future deposit collection at submission selected; full approval lifecycle must exist before readiness |
| WhatsApp | Deferred: provider, templates, consent, outbox/retries and delivery verification; private links are shown immediately after booking |
| Pet photos | Deferred private ownership/upload pipeline; optional size/breed/age supported, only pet name required |
| Hosted rollout | Both customer apps deployed; both native agenda/booking lifecycle and browser checks passed; cross-business receipt/management links rejected in both directions; load/concurrency acceptance remains separate |

No Stripe charge or WhatsApp message occurred. Hosted migrations/publication were
performed by their owning tasks; this task's hosted writes were only the expressly
authorized marked QA appointment lifecycle through the real gateway.

## Baseline Grooming constraints used during implementation

The coordinator reviewed the current owner source under
`best-in-show-grooming/vendor/fresco-platform-0.4.22` and migrations, then supplied
these baseline constraints. The new owner/shared migrations address the unpaid integration; this customer repository continues to respect the original domain rules:

- Client normalization uses 2–120 character names (`lib/clients/validation.ts`).
  The command/UI now match this boundary.
- Grooming pet/service snapshots are 1–100 characters; published grooming duration
  must be 15–480 integer minutes. `provider-flexible-v1` supports same local date
  or exact following midnight, without a universal 15-minute grid. Browser
  validation never replaces the backend's policy rules.
- Existing agenda statuses are pending/in_service/completed/cancelled. The public
  receipt's `confirmed` is a separate payment/booking state mapped to a correctly
  committed appointment; never write it as an unsupported agenda status.
- `20260917010000_appointment_scheduling_policies.sql` rejects appointment_services,
  payment drafts and sale attachments for this policy. Stripe needs a reviewed
  compatible accounting extension, not reuse of current checkout or preset changes.
- The current overlap trigger considers appointments, not proposed holds. New
  capacity logic must arbitrate staff and guest writes together. Pending approval
  requests must not be inserted as pending appointments because those block capacity.
- The initial `save_service_catalog_v1` review found a forced 15-minute duration and
  Grooming free-text service snapshots. The owner task now owns canonical catalog
  editing through Servicios, including service duration/publication. The public
  projection must use those saved service records; never infer variants from pet size.
- `grooming_save_appointment_v1` and staff factories require authenticated staff.
  New guest admission, provenance/audit schema and transactional commands are needed.
  A gateway token must not become a staff JWT or fabricated auth.uid.
- `20260917020000_grooming_appointment_extensions.sql` stores a pet-name snapshot,
  not the required persistent ownership relationship/private pet record model.
- Historical WhatsApp workers/outbox were removed by
  `20260719010000_local_manual_reminders.sql`. Do not assume they still exist.

## Remaining acceptance

Both businesses still need shared staff/guest concurrency acceptance and live
deadline-boundary evidence before those behaviors can be claimed as hosted-tested.
Preserve existing domain
rules and owner inventory functionality. Stripe reconciliation and WhatsApp delivery require separate acceptance before those integrations are enabled. All checks require explicitly authorized
staging resources/test records; local fixture success is insufficient.

Fresh/Preact shared UI adoption is not complete. This increment deliberately uses
React plus a framework-neutral HTTP interface; no vendored component changes.
