# Customer payment flow review — September 24, 2026

This customer implementation was deployed on September 24. The local verification
below covers client behavior and isolated fixtures; it does not replace hosted
provider acceptance. The coordinator owns server payment orchestration, SQL,
Stripe sandbox configuration and real sandbox acceptance for Fashion and Grooming.
The current source audit is recorded in [source validation](SOURCE_PUBLICATION.md).

## Customer behavior

- Both direct and approval paid submissions normally return `awaiting_payment`
  with the owner's authoritative Checkout URL and quote. A recovered first
  response can reflect a later state only with an explicit, consistent
  `paymentStatus`; confirmation and pending approval require `paid`, while
  payment processing requires `processing`. The original service, slot, quote,
  terms and separate capabilities remain validated. Direct bookings cannot
  return pending approval. Approval pays at
  submission and becomes `pending_approval` only after the owner's payment check;
  the request does not reserve capacity or confirm an appointment.
- An uncertain create freezes the command and reuses its original idempotency key.
  An original create replay can be stale, so the UI performs a status POST before
  automatic Checkout navigation. An already paid booking is not sent back to its
  original Checkout session. No browser-supplied amounts, account IDs or email are
  added to the booking command.
- Both Stripe success and cancellation URLs must be exactly the configured
  customer's `/reserva/pago#manage=<management-capability>`. The server creates
  these URLs. The client consumes and removes the fragment and all query hints
  before rendering/network use. It never treats the URL as evidence of payment.
- Before leaving for Checkout the client saves its return link only in its own
  history URL fragment. Back/forward cache restoration scrubs the fragment and
  refreshes the owner status. Tokens otherwise remain in memory or the guest's
  explicitly displayed private link. No local/session storage or secret query
  parameters are used. Guests should save the private link; a reload after it has
  been scrubbed cannot reconstruct it without the saved link.
- Receipt and management POSTs reconcile on mount, focus, network recovery and
  page restoration. Transient states retry every five seconds for up to twelve
  automatic attempts per refresh cycle, then retain a manual refresh action.
  Requests are abortable and stale reads cannot overwrite a mutation result.
- `paymentStatus` and `refund` remain optional v1 additions. Old owners that omit
  them work; absence never fabricates a paid/refunded status. Payment and
  appointment states display independently. Pending and failed refunds never
  claim completion.
- Refund projection accepts only the full original deposit in its original
  currency. Provider/account/fee fields are stripped. Processor fees cannot be
  subtracted from the guest refund. Accepted quote and terms remain unchanged.
- Guest actions use backend `canCancel`/`canReschedule`; a skewed browser clock
  cannot decide the exact 24-hour boundary. The owner rechecks on mutation.
- Existing no-payment bookings, ten-digit Mexican national phone entry, optional
  pet details and service-only flow remain. CSS and approved catalog/drawer
  geometry are unchanged.

## Owner interfaces

All existing gateway routes and v1 envelopes stay unchanged. Lookup remains POST,
allowing the owner to reconcile payment with its provider. Checkout URLs require
HTTPS and the exact `checkout.stripe.com` hostname; only `awaiting_payment` may
carry one. New receipt fields:

```ts
paymentStatus?: 'unpaid' | 'processing' | 'paid' | 'refund_pending' | 'refunded' | 'refund_failed';
refund?: { amountMinor: number; currency: string; status: 'pending' | 'succeeded' | 'failed' } | null;
```

When both fields are present, their refund states must agree. The client accepts
no fee, provider ID, private settlement packet or payment context. The owner's
configured deposit remains runtime data; the customer source does not hardcode
the sandbox MXN149 deposit.

`payments_unavailable` is a definite pre-write configuration failure in the
existing transport. A failure after persisting preparation or an uncertain Stripe
operation must use an ambiguous5xx response such as `upstream_unavailable`, so the
customer retries the original key instead of preparing another attempt.

## Local verification

- `npm test`:57/57 passing, including legacy DTO compatibility, full refunds,
  provider-field stripping, paid approval, capability handoff/return, continuity,
  cancellation, progressed create recovery and explicit paid deployment preflight.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`:31/31 passing, including nine
  new payment scenarios, existing unpaid/grooming tests and four visual scenarios.
  Every Stripe request is intercepted with a synthetic page; no sandbox or live
  provider call occurs. Desktop and mobile screenshots were inspected.
- TypeScript and Vite production build passed. Generated CSS remains
  `index-ClJRhY9Q.css`, identical to the approved release. `git diff --check` passed.
- The focused Checkout back-button/return scenario also passed after explicitly
  adding a real browser back-navigation assertion.
- Staged `deno check` and the full two-owner synthetic Deno integration passed,
  including Host/Origin isolation, replay, private-path handling and inert previews.

The sealed application artifact was deployed September 24 before the owner
payment policies were enabled. Its location stays in the private operator record.
Manifest SHA-256:
`839d3f03f020b5ff2ae2d6e32436a36fb4ffca506c175838bcad5d6a04700330`.
It contains nine allowlisted files,333457 bytes plus its manifest. It replaces the
earlier local `k0ofew` candidate for review. The authorized deployment now serves
Grooming revision `qfq64fekmr8y` and Fashion revision `t3t9zvvdn34z`; both passed
read-only hosted checks against these asset hashes. Per-app upload copies add
only the CLI-required nonsecret org/app metadata and a corresponding manifest.
See [hosted release evidence](HOSTED_ACCEPTANCE.md#september-24-customer-release).
The task-specific review diff and pre-task snapshots stay in private operator
storage; they are not part of the source release.

These tests do not prove real Stripe Checkout, webhooks, transfers, refunds or
owner database transactions. The coordinator must verify those with the matching
server/SQL release before enabling and publishing the paid sandbox flow.

## Staging and policy preflight

Use the existing isolated local-source artifact workflow; upload no private
profile or Stripe key. Unpaid preflight defaults remain `none`/`direct`. A paid
candidate requires explicit policy flags, for example:

```sh
npm run storefront -- stage fashion-style
npm run storefront -- inspect fashion-style --stage /absolute/upload
npm run storefront -- check fashion-style --stage /absolute/upload
npm run test:deno -- /absolute/upload
npm run storefront -- validate fashion-style --context production --payment stripe-deposit --mode direct
npm run storefront -- plan fashion-style --stage /absolute/upload --payment stripe-deposit --mode direct
```

Use `--mode approval` only when that owner's published configuration uses approval.
Repeat independently for `best-in-show-grooming`. The new flags verify the public
policy, ready catalog and authoritative availability only; sandbox mode and
provider/account binding are private server checks. Notifications must remain off.
The authorized September 24 customer publication retained `none`/`direct` and
notifications off for both businesses. Paid policy activation remains separate.
