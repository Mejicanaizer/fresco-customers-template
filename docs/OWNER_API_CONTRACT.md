# Owner storefront API v1 — proposed implementation contract

Status: coordinated v1 contract; real Grooming direct unpaid creation, rescheduling and cancellation have been verified through this gateway. Future Stripe/WhatsApp/approval workflows remain deferred. Types and
validators in `src/lib/contracts.ts` are the executable authority. Changes to this
contract must be coordinated with the owner/platform tasks before deployment.

## Binding and transport

Each process binds exactly one `STOREFRONT_SITE_ID`,
`STOREFRONT_OWNER_API_ORIGIN` and `STOREFRONT_PUBLIC_ORIGIN`. An optional private
`STOREFRONT_OWNER_API_TOKEN` authenticates this gateway to that owner API; it is not
a Supabase service key or a visitor credential. A production binding requires it.
The browser only calls same-origin `/api/storefront/v1/*`. The gateway only calls
the fixed owner's `/api/public/storefront/v1/*`, with a fixed `X-Fresco-Site` header
and deployment token. It never forwards visitor cookies, authorization, hosts or
tenant selectors. The owner must independently validate token/site/branch binding.

All responses include `contractVersion: 1` and the bound `siteId`. All personal
operations are POST and no-store. Unknown fields in commands are rejected;
responses are projected onto a strict public allowlist. Opaque capabilities are
never placed in query strings or logs. Mutations require a UUID v4 idempotency key,
scoped by deployment and operation; same key + different command is a conflict.
Origin validation supplements owner-side abuse controls; it is not authentication.

## Routes

| Method/path suffix | Request | Owner responsibility |
| --- | --- | --- |
| GET `bootstrap` | No query | Versioned published branding, branch/timezone, services/prices/deposits, booking mode/readiness, grooming capability; no customer/private pet or staff data |
| GET `availability` | `serviceId`, branch-local `date` | Real eligible provider/slot IDs and absolute instants; enforce schedules, closures, lead time, horizon, durations, buffers and all industry rules |
| POST `bookings` | Revision, expected mode, service/slot IDs, guest name/WhatsApp, notes, optional one pet | Validate exact current policy; atomically create a direct hold+Stripe checkout when enabled or an atomic unpaid appointment when payment is none; future approval requests remain gated until their full lifecycle exists; return durable receipt, never browser-calculated prices |
| POST `booking-status` | Receipt capability | Minimal status; only webhook-verified payment plus committed agenda allocation may be confirmed |
| POST `guest-booking` | Management capability | Minimal booking plus backend-computed action permissions and 24-hour deadline; no phone/name lookup or account creation |
| POST `guest-booking/cancel` | `token`, expected `bookingRevision` | Enforce deadline, current booking revision and accepted deposit policy atomically |
| POST `guest-booking/reschedule` | `token`, expected `bookingRevision`, published `revision`, `slotId` | Enforce deadline/policy, atomically claim new capacity before releasing old capacity, preserve payment accounting |

POST mutations except read-only lookups need `Idempotency-Key`. Never use display
names as identity. The deployment's published branch is fixed by owner settings;
the client cannot choose a backend, site or branch. Money is integer minor units,
with an explicit currency exponent. Submitted commands contain no prices/deposits.

Private photo upload is deferred. There is no `pet-photos` endpoint in this gateway.
For v1, grooming `photoUploadsEnabled` must be false and pet `photoUploadId` must
be null. A future reviewed private ownership/upload contract can extend this;
do not publish photo URLs or accept arbitrary handles now.

## Field and replay details

`bootstrap` returns the `Storefront` type: contractVersion, siteId, integer revision,
name/description/logoUrl and optional coverImageUrl, locale, currency/currencyExponent, contrast-validated
theme, contact, fixed branch with IANA timezone, services, booking and capabilities.
Missing coverImageUrl is normalized to null for older owner deployments. It uses the same HTTPS URL validation as logoUrl and service imageUrl. This additive public field does not imply owner media editing/storage has been implemented.
Services expose id/name/category/description/imageUrl, integer priceMinor,
depositMinor (null when unconfigured; ignored for payment none), and durationMinutes. Booking exposes
direct/approval mode, guestOnly=true, approvalHoldsCapacity=false, fixed 24-hour
deadline, payment ('none' or 'stripe-deposit'), notifications ('none' or 'whatsapp'), readiness+reasons, local first/last dates,
and depositTerms/depositTermsVersion. These fields hold the accepted booking terms even for unpaid appointments. Readiness=false requires nonempty reasons. Payment none does not require a configured deposit; notifications none does not block booking.

The public service array is a projection of the canonical catalog edited in the
owner's **Servicios** UI. Its stable service IDs and current saved public fields
must match that catalog. Saved, configured services are published by the owner API. Hours and
policy settings must not act as a separate service editor. Changes to catalog membership
and service edits must participate in revision validation so stale customer
commands cannot silently book under old terms. This does not change the public DTO.

`availability` returns contractVersion/siteId/revision/branchId/serviceId/date and
slots: id, explicit-offset startsAt/endsAt, providerId and public providerName.
The service duration equals end minus start; backend capacity buffers are separate.
Empty slots is a valid closed/unavailable result. The client never synthesizes more.

`bookings` accepts revision, expectedMode, serviceId, slotId, guest{name,whatsapp},
notes and pet (null outside grooming). Normalize guest name to 2–120 characters;
WhatsApp uses E.164. The customer form accepts exactly 10 national digits and normalizes them to `+52` plus those digits before creating the command; the wire contract remains strict E.164. One pet contains required name and nullable sizeId/breed/ageMonths, plus behaviorNotes/
groomingPreferences (empty strings allowed) and photoUploadId=null. Unknown age must remain null, not zero; zero is a known age. Validate the published capability, size IDs and
ownership server-side. Grooming service/pet snapshot limits are 100 characters;
published duration is 15–480 integer minutes without a hardcoded grid.

Receipt fields: contractVersion/siteId/reference/bookingRevision/branchId/serviceId/
slotId/providerId/startsAt/endsAt/state/payment, authoritative quote{priceMinor,depositMinor,
currency,currencyExponent}, accepted terms{version,text}, checkout (null or Stripe
URL+expiresAt), notification (unconfigured/not_sent/queued/sent/delivered/failed). Only
awaiting_payment carries checkout. Receipt.payment is required: none requires depositMinor=0, checkout=null and no payment-specific states; direct unpaid create returns confirmed only after atomic agenda commit. Stripe direct create returns awaiting_payment. Future approval create returns pending_approval. Create wraps receipt with distinct receiptToken and managementToken plus envelope fields. Both are required so customers can save a private management link without WhatsApp. Unconfigured notifications never claim delivery.
Guest management wraps receipt with actions{canCancel,canReschedule,deadlineAt,
unavailableReason}. Existing booking actions use accepted terms snapshots, not
new settings. This v1 reschedule contract preserves quote and accepted terms;
financial changes need a separately approved re-consent/payment workflow.

**Replay is immutable:** persist and replay the original successful create/change
response for the same scoped key+payload, even when status has progressed. Lookup
the ledger before reapplying mutable revision/availability checks, while preserving
capability authorization. Different payload under that key returns conflict. New
status is retrieved separately; the UI queries status after receipt recovery.
Never create a second Checkout session on a retry. Transport/timeout/malformed
success responses are uncertain and retain the key. Explicit invalid_command,
configuration_changed, slot_unavailable and payments_unavailable responses must
mean this attempted command produced no side effect. If the outcome is unknown,
return an uncertain failure and reconcile the original operation instead.

## Booking/payment state machine and policy gates

Enabled Stripe direct: authoritative availability check → expiring capacity hold → Stripe Checkout
session → verified webhook → atomic confirmation in the owner's existing agenda.
Opening Checkout or returning to `/reserva/pago` does not confirm anything. Status
may be awaiting_payment, payment_processing, confirmed, expired or payment_review.
Every completion is reconciled against the same hold, amount, currency and business.
Duplicate/out-of-order webhooks must be harmless. Do not release/reassign a paid
hold or create a second appointment on a retry.

Unpaid direct (current milestone): payment=none and notifications=none → authoritative capacity check and atomic client/pet/appointment/receipt write → confirmed booking receipt, without online payment. The existing Grooming agenda status remains pending; receipt confirmation describes successful booking, not a paid state. Show the private management link immediately.

Future approval: requests hold no capacity, and Luis selected deposit collection at request submission. The complete deposit/approval and paid/expired-hold recovery workflow still needs implementation; affected backend readiness stays false. A paid race enters payment_review
with a durable reference; no invented refund, retention or replacement appointment.

Luis selected a fixed configurable future deposit; Stripe activation is deferred. When activated, the owner configures deposit value explicitly and publishes computed
deposit amounts per service. Missing required configuration must disable the affected enabled workflow with an explicit readiness reason. Disabled Stripe/WhatsApp integrations do not block direct unpaid booking. No default percentage exists.

Secure status tokens only read minimal receipts. Separate short-lived management
tokens grant narrowly scoped guest actions. WhatsApp links use a URL fragment,
e.g. `/reserva#manage=<opaque capability>`; the browser removes it immediately and
keeps it in memory. Stripe return URLs use `/reserva/pago#receipt=<status capability>`.
The owner creates return URLs from its allowlisted public origin, never client input.
Customers can also copy a management link from the create result; both capabilities remain in memory and are never placed in query strings or browser storage. No email, password, account history or unverified phone-based record linking.

## Required upstream work

- Platform/owner API adapters for the routes above; explicit publication controls,
  tenant/branch authorization, revision checks and per-deployment abuse limits.
- Reviewed local migrations for owner storefront settings, explicit deposit policy,
  holds with expiry, booking requests, idempotency ledger, Stripe event ledger,
  capability hashes/expiry, notification outbox and attempt audit data. Reuse existing
  clients/appointments/providers; never create a parallel storefront agenda.
- Transactional capacity constraints covering duration/buffers/resources, request
  approval revalidation, paid-hold reconciliation and worker crash/retry recovery.
- Admin screens: published branding/services/branch, direct/approval mode, explicit
  deposit and operational policies, readiness, pending requests and payment review.
- Stripe project/account/secret/webhook setup, exact amount/currency validation,
  signed raw-body webhook handler, durable idempotency/reconciliation and refunds
  only under an explicit owner policy. No Stripe secrets in this repository.
- WhatsApp approved provider/templates and consent handling; durable outbox/retries,
  real delivery callbacks, expiring management links, distinguish queued/sent/delivered.
- Grooming: human-to-multiple-pets relationship and one pet per appointment;
  private breed/size/age/photo/behavior/preferences validation and ownership. Public
  catalog exposes only field capability metadata and allowed size IDs.

## Error codes

Stable codes: `not_configured`, `invalid_command`, `invalid_contract`,
`origin_rejected`, `configuration_changed`, `slot_unavailable`,
`idempotency_conflict`, `rate_limited`, `link_invalid`, `deadline_passed`,
`payments_unavailable`, `policy_unconfigured`, `upstream_unavailable`.
The gateway never returns internal upstream error text or private response fields.
Uncertain transport failures keep the same command/idempotency key for retries.

## Hosted acceptance still required

Two separately bound owner/Supabase projects must prove that bookings appear only
in their own agenda, concurrent customers cannot claim the same restricted capacity,
duplicate webhooks/commands do not duplicate effects, WhatsApp actually delivers,
guest links cannot cross tenants, and paid-expired-hold behavior matches approved
policy. Local fixture tests do not establish any of those hosted guarantees.
