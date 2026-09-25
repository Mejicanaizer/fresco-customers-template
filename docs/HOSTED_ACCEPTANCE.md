# Hosted customer acceptance

## September 24 customer release

The authorized customer-only rollout completed with the following production
revisions. Owner deployment and booking mutation QA remain coordinator-owned.

| Customer app | Production revision | Public site revision | First-date slots |
| --- | --- | --- | --- |
| [Best in Show Grooming](https://best-in-show-grooming-customers.lugearma.deno.net) | `qfq64fekmr8y` | 3 | 0 |
| [Fashion Style](https://fashion-style-customers.lugearma.deno.net) | `t3t9zvvdn34z` | 1 | 2 |

Both passed `npm run test:hosted-owner -- <profile> --stage <sealed release>`:
owner and gateway catalog projections match; each has one published service,
ready direct booking, `payment=none` and `notifications=none`; authoritative
availability validates, including Grooming's valid empty first-date result.
HTML, JavaScript and CSS served over HTTPS exactly match the reviewed release.
Guest routes return 200/no-store, private paths return 404, and a foreign Origin
returns 403. Each revision's actual preview URL returns the inert 503/no-store
listener. These checks made zero booking mutations. The earlier lifecycle
acceptance below is historical evidence, not a claim of new paid-flow acceptance.

Sealed release manifest SHA-256:
`839d3f03f020b5ff2ae2d6e32436a36fb4ffca506c175838bcad5d6a04700330`.
The sealed artifact location remains in the private operator release record.
The deployed assets are `index-DKrjhMPX.js` and `index-ClJRhY9Q.css`.

The pinned `@deno/deploy@0.0.9904` CLI requires `deploy.org` and `deploy.app` in
its discovered config. An external `--config` changes the upload walk root and
caused the initial "source upload did not arrive intact" failure. The successful
rollout used a fresh private copy per app, with cwd and upload root colocated.
Only nonsecret org/app metadata was added to the copied `deno.json`; the copied
manifest was regenerated for that delta. All application/runtime/asset files
remain byte-identical to the sealed release. The exact CLI resolver verified
the ten-file upload allowlist before credentials were loaded or publication began.

| App | Upload manifest SHA-256 |
| --- | --- |
| Grooming | `e24e6e8f481183b138b4ee6c9f56277bf92cdbcd5ec255cba54c9a1f483c8fd7` |
| Fashion | `06eb26312fbc3b1b37f122407845f87546843043b1ae67983d471b4bdfdafffe` |

Deployment logs and the scoped publication wrapper remain in private operator storage.
No hosted secrets, policies, owner files or credentials were changed by this rollout.
Stripe provider acceptance was pending at this customer-only rollout. Later owner
policy activation and provider QA are separate from these historical checks.

## Earlier hosted acceptance

The coordinator owns Deno authentication, app registration, owner releases and
production binding issuance. This customer task prepares the shared artifact and
the QA runner. Do not claim either deployed app works until its real HTTPS gateway
passes the checks below and a marked booking appears in the owner's native agenda.

## Production setup handoff

Verified organization: `lugearma`. The coordinator registered both customer apps:

- Fashion: `https://fashion-style-customers.lugearma.deno.net`.
- Grooming: `https://best-in-show-grooming-customers.lugearma.deno.net`.

The coordinator issued each private production site ID and profile after
confirming its owner binding and customer origin. Never copy a local admission token to a remote endpoint just to
see whether it works.

Grooming customer revision `m7ea5e4thf28` is live. The coordinator reports passing
create/replay, changed-payload conflict rejection, reschedule/replay and
cancel/replay, plus native owner agenda HTML/RPC verification of one appointment.
Read-only desktop browser QA passed catalog, styles, guest/pet form, availability,
slot selection, drawer keyboard/focus behavior and an empty error/warning console.
No browser form was submitted during that independent check. Fashion owner
revision `6efdfwf8wqcr` and customer revision `65qgr3psksgc` are live. Its read-only
desktop browser check passed the separate Fashion catalog, guest form without pet
fields, quarter-hour availability for a 30-minute service, local slot selection,
drawer Escape/focus/reopen and an empty warning/error console. No form was submitted.
The coordinator verified Fashion create/replay, changed-payload conflict rejection,
reschedule/replay and cancel/replay, with exactly one appointment in
authenticated native owner agenda HTML and its scoped RPC. The staff snapshot
matches the accepted service ID, MXN100 price and 30-minute duration.
Cross-business receipt and management capability lookups passed in both directions:
each returned404 `link_invalid` from the other business's customer gateway.
Both marked QA appointments are cancelled. Test services remain enabled and
clearly labeled; their prices are not commercial rates. Stripe and automated
WhatsApp remain disabled. These checks establish the exercised guest workflows,
not production load, live staff/guest race behavior or the inside-24-hour boundary.

Use the reviewed clean artifact and read-only `storefront validate`/`plan` commands
from [the deployment guide](DENO_DEPLOY.md). The template needs no source change to
select either business. The current verified artifact digest is recorded in the
implementation checkpoint; it must still match every runtime file at publication.

### Runtime secrets without command-line values

The installed Deno Deploy CLI0.0.9904 requires values as positional arguments for
`env add` and `env update-value`. `env load <private-file>` avoids secret arguments,
but its implementation creates new variables with `context_ids:null` (all contexts)
and preserves contexts for existing variables. It has no load-time contexts flag.

Prefer the official API with an organization-scoped access token when available:

1. Verify that the token belongs to `lugearma`; never infer organization from a slug.
2. `POST https://api.deno.com/v2/apps` with the exact `slug`, dynamic `config`, and
   app-level `env_vars`, each with `contexts:["production"]`. Mark only the gateway
   admission token secret. Creation and source deployment are separate API calls.
3. For an existing verified app, `PATCH /v2/apps/{app-id}` deep-merges `env_vars`.
   Select the exact existing variable IDs where present and preserve unrelated
   settings. Do not send `config` unless intentionally replacing the whole config.
4. Load token/profile values in memory and use a request header/JSON body, never
   shell arguments, logs, a source file or the uploaded artifact. Output only
   status, app ID/slug and variable keys/contexts/secret booleans.
5. Deploy the inspected stage using the reviewed CLI runner, or an independently
   reviewed API request containing exactly the manifest's source assets.

The organization token is created under Settings → Access Tokens. API paths are
organization-scoped by that token; the documented create request has no `org`
field. App-level variable updates restart isolates. The API also supports
`POST /v2/apps/{app}/deploy` with `assets`, `production:true` and `preview:false`;
revision variables have no context filtering, so use app-level Production values.
These are documented in the [official OpenAPI schema](https://api.deno.com/v2/openapi.json).

The live release used this v2 API path: the coordinator registered the apps,
configured app-level Production-only bindings, inspected the external artifact,
and uploaded exactly its local source assets to each app's `/deploy` endpoint with
`production:true`, `preview:false`. No GitHub repository was linked and no build or
install command ran on Deploy. The runtime is dynamic with entrypoint
`server/deno.ts`; the client was already built in the inspected artifact. The same
manifest digest produced customer revisions `m7ea5e4thf28` and `65qgr3psksgc`.
For a later release, rebuild/inspect/check/preflight using the deployment guide,
then publish through the reviewed API flow or the isolated-stage CLI runner.

If the coordinator uses only the CLI, first create harmless placeholder variables,
set each to the exact Production context, then use a private mode0600 allowlisted
env file with `env load --replace`. Inspect key/context metadata before sending
credentials. Importing a brand-new secret first and narrowing contexts afterward
temporarily exposes it to other contexts. The app's preview listener remains
inert regardless, but credential scope should be correct from the start.
[Deno CLI reference](https://docs.deno.com/runtime/reference/cli/deploy/).

## Live test sequence

After both owner/customer deployments and bindings are reviewed, execute one
business at a time. The user authorized deployment and functional QA; the explicit
switch below prevents accidental execution before the coordinator confirms the
correct releases and QA slots. It is not a separate permission request.

Start with the GET-only runner for each configured production profile:

```sh
npm run test:hosted-owner -- fashion-style --stage /absolute/reviewed-upload
npm run test:hosted-owner -- best-in-show-grooming --stage /absolute/reviewed-upload
```

It compares actual owner/customer catalog projections, checks policy/availability
and foreign-Origin rejection, and SHA-256 compares every hosted client file to the
reviewed artifact. It also checks page routes, MIME/cache headers and private404s.
It never starts fixture servers or performs a mutation. This checks the served
client bytes; platform revision evidence is still needed for server-source identity.

1. Compare real owner and customer bootstrap projections, readiness and services;
   verify the expected business and branch. Verify no login redirect or fallback.
2. Confirm HTML and hashed assets load on the registered customer origin. Check
   no-store API/HTML, arbitrary Host/foreign Origin rejection where possible, and
   disabled preview503. An accepted production Host must be observed through the
   actual Deno proxy; local emulation alone is insufficient.
3. Select a real service plus two distinct non-overlapping published slots at least
   48 hours away. Use native owner constraints. For Fashion the owner adapter is
   responsible for its 15-minute scheduling policy, duration/buffer compatibility
   and latest allowed end time; never fabricate slot IDs in the customer runner.
4. Prepare one private journal, create one marked client/appointment (and one pet
   for Grooming), replay the identical create command, and prove a changed payload
   under that same key returns `idempotency_conflict` with no write.
5. In the owner's native agenda, independently verify one appointment/client/pet
   and native extension details with the marker/public reference. Do this before
   cancellation. An API receipt alone is not proof of native agenda integration.
6. Reschedule to the selected replacement and replay. Verify the same appointment,
   updated interval, unchanged quote/terms and released old capacity. The owner
   observer verifies row counts and no duplicate operation effects.
7. Send that business's receipt and management tokens to the other customer
   gateway's read-only lookups. Both must return404 `link_invalid`.
8. Cancel and replay. Verify cancelled status and both guest actions disabled;
   confirm cancellation in the native owner agenda. Archive only the marked QA
   client/pet via its owner task after preserving acceptance evidence.

No Stripe checkout, charge, webhook or WhatsApp message is part of this run.
`payment=none`, deposit0, `checkout=null`, `notifications=none` and
`notification=unconfigured` are asserted throughout. Fashion submits `pet:null`.

## Commands and private journals

The runner is `npm run qa:hosted-owner -- <profile> <phase> [selection-or-peer]`.
It reads the profile's production context from
`~/.config/fresco/customer-storefronts/<profile>.json`. Journals and exclusive locks
stay in that same private directory as `<profile>.hosted-qa.json[.lock]`; they are
never uploaded. The old local Grooming journal is untouched.

The coordinator writes a private mode0600 selection file outside the repo:

```json
{
  "profile": "fashion-style",
  "publicOrigin": "https://fashion-style-customers.lugearma.deno.net",
  "ownerApiOrigin": "https://fashion-style.lugearma.deno.net",
  "serviceId": "<published-service-id>",
  "initialDate": "<published-YYYY-MM-DD>",
  "replacementDate": "<published-YYYY-MM-DD>",
  "initialSlotId": "<published-initial-slot-id>",
  "replacementSlotId": "<published-replacement-slot-id>",
  "whatsapp": "+12025550199"
}
```

The fictitious number is only stored on the marked QA record; messaging remains
disabled. The selection's business and both origins must match the private
profile. Optional slot IDs can be omitted to choose the first eligible slots on
the coordinator-selected dates; no date outside that selection is chosen.

Example sequence for Fashion, after coordinator readiness confirmation:

```sh
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style prepare /absolute/private-selection.json
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style create
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style conflict
# Owner task verifies the marked native agenda record here.
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style reschedule
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style isolation best-in-show-grooming
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style cancel
STOREFRONT_HOSTED_QA_APPROVED=1 npm run qa:hosted-owner -- fashion-style inspect
```

Repeat with `best-in-show-grooming` and its own selection; the isolation peer becomes
`fashion-style`. Each mutation phase saves its exact key/payload before dispatch.
On timeout or uncertain response, retain the journal and rerun the same phase;
never delete it or create a new key. Existing journals are not overwritten.
If a conflict probe unexpectedly succeeds, its returned booking is saved privately
and further QA stops for coordinator recovery; no duplicate is silently ignored.
Errors report only a stage/code, never capabilities, command bodies or tokens.

The runner verifies the exact deadline of start minus24 hours and enabled actions
while the appointment is safely outside that window. It does **not** pretend that
this proves live rejection inside24 hours. That boundary needs an owner clock-
controlled integration test, or an additional separately coordinated imminent
booking with guaranteed owner-side cleanup. Do not create a non-cancellable guest
booking merely to exercise the boundary without that recovery plan.
