# Customer source validation — September 25, 2026

The initial source commit captures the customer implementation already deployed
to Fashion Style and Best in Show Grooming. A subsequent merge reconciles the
teammate's public config URL with the owner-backed gateway; see
[the public JSON contract](PUBLIC_CONFIG.md). Booking UI, payment behavior,
hosted configuration, owner data and the MXN149 sandbox deposit policy are
unchanged. The owner supplies all prices, deposits, slots and booking/payment policy.

## Included scope

- Restored dark catalog and responsive booking drawer, accessible date/slot
  selection, guest contact fields and optional grooming details.
- Versioned public contracts, fixed-business gateway, guest booking and private
  receipt/management links, immutable retry keys, cancellation and rescheduling.
- Checkout handoff/return, owner-verified payment and approval states, bounded
  status refresh and full-deposit refund presentation.
- Node/Deno runtime, external artifact staging, placeholder profile examples,
  isolated fixtures and tests. Public app names/origins are deployment descriptors.

The source audit removed historical QA record identities and machine-specific
release paths from documentation. Private bindings, admission tokens, operator
profiles, journals, emails and customer data are excluded. Generated build output,
test output and TypeScript build caches are ignored. Illustrative preview images
are project-owned synthetic assets and are excluded from production artifacts.

## Initial source commit verification

All checks used a sanitized process environment. The release build disables
dotenv and development preview media. Fixture browser requests to Stripe are
intercepted; no hosted owner mutations or provider requests were performed.

| Check | Result |
| --- | --- |
| `npm test` | 57 tests passed |
| `npm run storefront -- stage fashion-style` | TypeScript and isolated Vite production build passed |
| `PLAYWRIGHT_CHANNEL=chrome npx playwright test` | 31 browser tests passed against production assets |
| `npm run test:deno -- <isolated-artifact>` | Deno type check and two-owner runtime integration passed |

The browser suite covers unpaid booking, MXN149 paid direct/approval behavior,
same-key recovery, Checkout return and browser back navigation, refunds,
cancellation, rescheduling, tenant isolation, keyboard focus, mobile layout and
the restored catalog geometry. It uses synthetic owners and private test profiles.
The Deno suite additionally checks Host/Origin enforcement, private paths,
response headers, replay and inert preview timelines.

The initial source commit's clean build reproduces the September 24 deployed
application artifact exactly:

- Manifest SHA-256: `839d3f03f020b5ff2ae2d6e32436a36fb4ffca506c175838bcad5d6a04700330`.
- Nine allowlisted files, 333457 bytes, plus the manifest.
- Client assets: `index-DKrjhMPX.js` and `index-ClJRhY9Q.css`.

The tested repository `dist` bytes match that initial isolated artifact. Detailed
logs, screenshots and artifact locations remain outside version control. The
historical [hosted release record](HOSTED_ACCEPTANCE.md) identifies the deployed
customer revisions; current hosted payment acceptance remains owner-controlled.

## Remote main reconciliation

Remote main advanced through merged PR #1 (`3e8b8a6`), adding a static sample
`public/store.config.json`. A true merge retains that history and the reviewed
source commit `bb120c1`. The runtime now serves that URL from the same validated
owner bootstrap projection; the sample snapshot remains in history and is not
copied into public build output. The [public schema and consumer migration](PUBLIC_CONFIG.md)
are explicit. No open PRs remained when this repository was checked.

The three new focused tests first failed on the missing runtime route, then
passed after the alias was implemented. Fresh catalog changes and empty catalogs,
private-field stripping, fixed-site admission, sanitized errors, disallowed
methods/queries/origins and absence of sample fallback are covered. The actual
Node, Deno and Vite adapters were exercised with synthetic owners.

- `npm test`: 60 passed.
- Chrome Playwright suite: 32 passed, including both Node catalog aliases.
- Fresh isolated TypeScript/Vite build and Deno type/runtime integration: passed.
- Actual Vite-config smoke check: passed from an empty dotenv directory.

The new nine-file artifact has 333770 payload bytes and manifest SHA-256
`b8d7b4f4bfa4e4c010bc0adb0c52f74f323e99e32dfda86135a23f9f67876121`.
Only `server/gateway.ts` and `server/start.ts` differ from the initial sealed
artifact. All client assets are unchanged. This reconciliation has not been
deployed; it does not alter the currently hosted payment policy or business data.


## Integrated customer UI and payment modal — September 25

The approved customer UI now includes the compact catalog header, immediate
booking drawer, focused appointment pass, public reference barcode and calendar
export. Embedded Stripe checkout opens in a native modal, centered on desktop
and full screen on phones. Customers can close and reopen the same checkout;
no new booking is submitted. Stripe completion triggers an owner status read;
only verified owner facts display the confirmed appointment pass. Existing
hosted sessions retain their explicit recovery link.

Validation: 65 unit tests, TypeScript/Vite build, 55 Chrome browser tests and
the isolated two-owner Deno runtime checks pass. Browser coverage includes
cross-origin payment iframe keyboard navigation, dismissal/focus restoration,
reopening, loading errors, expiry, delayed payment verification, and dark/light
layouts at desktop, 390px and 320px widths. Existing booking, approval, refund,
cancellation, rescheduling and tenant-isolation tests remain in the suite.

The deployment artifact contains only the allowlisted runtime and built assets.
Private configuration and QA booking details are excluded from source and uploads.
