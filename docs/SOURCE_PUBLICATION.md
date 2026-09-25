# Customer source validation — September 25, 2026

This source release captures the customer implementation already deployed to
Fashion Style and Best in Show Grooming. It does not change product behavior,
hosted configuration, owner data or the MXN149 sandbox deposit policy. The owner
supplies all prices, deposit amounts, slots, booking policy and payment status.

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

## Local verification

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

The clean build reproduces the September 24 deployed application artifact exactly:

- Manifest SHA-256: `839d3f03f020b5ff2ae2d6e32436a36fb4ffca506c175838bcad5d6a04700330`.
- Nine allowlisted files, 333457 bytes, plus the manifest.
- Client assets: `index-DKrjhMPX.js` and `index-ClJRhY9Q.css`.

The tested repository `dist` bytes match that fresh isolated artifact. Detailed
logs, screenshots and artifact locations remain outside version control. The
historical [hosted release record](HOSTED_ACCEPTANCE.md) identifies the deployed
customer revisions; current hosted payment acceptance remains owner-controlled.
