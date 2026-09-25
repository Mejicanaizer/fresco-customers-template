# Deno Deploy operator guide

Both customer apps are registered in `lugearma`. The September 24 rollout evidence
below records the policy at deployment time; later owner payment activation does
not require a customer rebuild. Use explicit `--payment stripe-deposit --mode direct`
preflight flags for the MXN149 sandbox flow when that matches the owner policy.
Both customer apps are deployed and passed direct unpaid booking lifecycle,
native owner agenda, cross-business capability isolation and read-only browser QA. The
coordinator owns hosted app creation, runtime secrets, deployment and booking QA.
No GitHub linkage is needed. Existing local servers remain on ports5371/5372/5373.

## One release, two independent bindings

```text
Customer browser → its /api/storefront/v1/* gateway
                 → its owner's /api/public/storefront/v1/* API
                 → that owner's existing database and agenda
Owner admin      → the same database and agenda
```

The owner publishes services, prices, branding and availability. Guest booking,
cancellation and rescheduling go through the owner API and its transaction rules.
The customer app does not call the owner's staff UI or keep another agenda.
Saved catalog changes appear on the next customer page load/reload. There is no
live push subscription in this milestone. See [the API contract](OWNER_API_CONTRACT.md).

Both profiles use organization **lugearma** (display name Luis Arias):

| Profile | Registered customer app name | Owner origin | September 24 preactivation state |
| --- | --- | --- | --- |
| `best-in-show-grooming` | `best-in-show-grooming-customers` | `https://best-in-show-grooming.lugearma.deno.net` | Customer revision `qfq64fekmr8y` live; catalog, availability, routes and exact release assets verified; none/direct |
| `fashion-style` | `fashion-style-customers` | `https://fashion-style.lugearma.deno.net` | Customer revision `t3t9zvvdn34z` live; catalog, availability, routes and exact release assets verified; none/direct |

The [September 24 release record](HOSTED_ACCEPTANCE.md#september-24-customer-release)
documents the pinned CLI's config-root constraint, private-copy publication,
metadata-only manifest differences and deployed checks. Keep the sealed artifact
unchanged; an external `--config` outside the upload root changes the CLI file walk.

Customer HTTPS origins are
[Grooming](https://best-in-show-grooming-customers.lugearma.deno.net) and
[Fashion](https://fashion-style-customers.lugearma.deno.net).
Both sites intentionally publish marked test services with test prices. Their QA
appointments are cancelled. Stripe and automated WhatsApp remain disabled.
The coordinator issued each production binding separately. Production admission
tokens stay in private profiles and app-scoped Production secrets; a local token
is not assumed to be a production credential. Committed examples retain explicit
secret placeholders.

Earlier probes found Grooming redirecting to login and Fashion returning a generic
readiness503. Those observations preceded the owner releases above and are not
current acceptance evidence. The dedicated public v1 API must pass each business's
preflight after its release. Fashion preserves its native appointment details and
quarter-hour scheduling policy. Do not use a mock, Grooming binding or
payment-enabled fallback for Fashion.

## Private profiles

Templates live in `deploy/profiles/*.example.json`. Actual profiles live outside
the repository in `~/.config/fresco/customer-storefronts/`, directory mode0700 and
files mode0600. Both private files were initialized on September23; the coordinator
subsequently configured their production bindings. Grooming's local binding was imported from this customer
repository's private `.env` using exactly the four permitted gateway fields.
The owner's capability-secret file was not read or copied.
Fashion's known local owner origin is `http://127.0.0.1:5371`; its local site ID and
admission token remain placeholders, so the profile cannot start a working gateway.

First-time initialization commands (existing files are never overwritten):

```sh
npm run storefront -- init best-in-show-grooming --import-gateway-env
npm run storefront -- init fashion-style
```

`--operator-dir /absolute/external/path` selects another private directory. The
profile has `version`, `profile`, `local`, and `production`. Each context has
`siteId`, `ownerApiOrigin`, `publicOrigin`, `ownerApiToken`; production additionally
has `org` and `app`. Unknown/missing fields and placeholders fail validation.
Local contexts require loopback endpoints; production requires HTTPS origins.
Import accepts only this repo's `.env` for Grooming, never an arbitrary owner file.

Validate a configured binding with read-only bootstrap and availability requests:

```sh
npm run storefront -- validate best-in-show-grooming --context local
npm run storefront -- validate fashion-style --context production
```

Validation requires matching site identity, ready direct bookings, `payment=none`,
`notifications=none`, a published service and valid authoritative availability.
An empty slot list is valid. Validation never creates a booking, follows an owner
redirect or prints credentials/upstream error bodies.

## Prepare and inspect an upload

Use installed Node22.20+ dependencies (`npm ci` when needed) and Deno2. Local checks
passed with Deno2.4.5. These commands perform no hosted writes:

```sh
npm test
npm run storefront -- stage best-in-show-grooming
```

`stage` prints a fresh external upload directory and its SHA-256 manifest digest.
It type-checks the repository, builds production assets without loading dotenv or
the project Vite config, and copies an explicit allowlist into a new directory.
Build subprocesses receive no business credentials, deploy tokens, `VITE_*`
variables or development preview-media opt-ins. `stage fashion-style` uses the
same build process and release code; private profiles are not part of the build.

Only these files can enter the upload:

- `deno.json` generated with dynamic runtime entrypoint `server/deno.ts`.
- `server/deno.ts`, `server/start.ts`, `server/node-handler.ts`, `server/gateway.ts`.
- `src/lib/contracts.ts`.
- `dist/index.html` and fingerprinted `dist/assets/*` files from the fresh Vite manifest.
- `release-manifest.json`, containing names, byte lengths and SHA-256 digests.

No `.env`, `.git`, operator files, package manifests, node_modules, tests, private
QA data, source maps, preview pictures or unrelated source files are copied.
Inspection rejects symlinks, hash changes, added files and even unlisted empty
directories. Repository paths and symlink-parent escapes back into the repo are
rejected. An existing stage is never overwritten or automatically cleaned.

Use the actual directory printed by `stage` in place of `/absolute/upload`:

```sh
npm run storefront -- inspect best-in-show-grooming --stage /absolute/upload
npm run storefront -- check best-in-show-grooming --stage /absolute/upload
npm run test:deno -- /absolute/upload
```

`check` runs ordinary `deno check` **inside the isolated artifact**, avoiding the
repository's package.json and browser-dependency resolution. Do not run a root
`deno check`/`deno task check` or add `--no-npm`: Deno's own Node type checking can
need Node type definitions even though runtime imports have no external packages.
There is no deployment install, build or pre-deploy command. The client is already
built and runtime imports are only local modules and `node:*` builtins.

The synthetic Deno test uses temporary ports, never5371/5372/5373, and closes its
own subprocesses. It verifies two isolated bindings, GET/POST/replay, cross-business
capability rejection, Host/Origin checks, pages/assets/HEAD/cache/MIME, private-path
and traversal rejection, production configuration failure, and disabled preview
startup without owner calls. It is not a hosted acceptance test.

To run a configured local profile from the artifact later:

```sh
npm run storefront -- run best-in-show-grooming --context local --stage /absolute/upload
```

The runner uses that profile's exact public port and localhost listener. Port5373
is currently occupied by the coordinator-managed Vite server; do not launch a
second listener there or restart it as part of preparation. A different local
origin also needs the corresponding owner binding reviewed. Fashion has the same
runner command but stays unavailable until its local API/binding exists.

## Production and preview behavior

`server/deno.ts` forces production mode, listens on `0.0.0.0` (default port8000),
and retains the tested Node-compatible HTTP adapter. It serves known SPA pages,
compiled assets and the same-origin booking gateway. Missing production settings,
HTTP origins or a missing admission token fail startup. Host must exactly match
`STOREFRONT_PUBLIC_ORIGIN`; forwarded headers do not change it. A custom domain or
the Deno production domain must be chosen explicitly; aliases are not automatic.

On each existing customer app, configure these app-scoped values in **Production
context only** as part of the reviewed rollout:

| Runtime variable | Profile field | Secret? |
| --- | --- | --- |
| `STOREFRONT_SITE_ID` | `production.siteId` | No |
| `STOREFRONT_OWNER_API_ORIGIN` | `production.ownerApiOrigin` | No |
| `STOREFRONT_PUBLIC_ORIGIN` | `production.publicOrigin` | No |
| `STOREFRONT_OWNER_API_TOKEN` | `production.ownerApiToken` | Yes |

Do not put them in Build context, shared organization settings or browser
`VITE_*` variables. No Supabase service role, staff session, owner capability
secret, Stripe or WhatsApp credential belongs in this gateway.

Deno warms the Preview timeline when deploying. For trusted `DENO_DEPLOY=true`
with `DENO_TIMELINE=preview/...` or `git-branch/...`, this entrypoint boots only an
inert listener: every route returns generic503/no-store, without importing the
gateway, reading assets or contacting an owner. No Development credentials are
needed. This intentionally disables preview booking, including if business
variables were accidentally supplied. Production remains strict. Missing/unknown
Deploy timelines also use the inert listener and log only the reserved timeline
name for platform diagnosis; only exact `production` can load the gateway.
`--local` is rejected on Deploy. The first Grooming attempt failed on a warmup
timeline that was not recognized. The current inert fallback fixed warmup, and
revision `m7ea5e4thf28` serves the actual Production gateway with the expected Host.

This implements the documented [runtime](https://docs.deno.com/deploy/reference/runtime/),
[Preview warmup/build configuration](https://docs.deno.com/deploy/reference/builds/),
and [contexts/platform timeline variables](https://docs.deno.com/deploy/reference/env_vars_and_contexts/).

## Publication gate and rollback

For each release, verify the target app/runtime binding and compatible owner API,
deployment authentication, and authorization. The user authorized this hosted
rollout; the coordinator registered **local-source** apps in `lugearma` using the
official API. App creation can itself deploy with some CLI workflows, so the
preparation commands never call `deno deploy create`.
No GitHub repo should be linked for this workflow. See [Deno apps](https://docs.deno.com/deploy/reference/apps/).

Once those prerequisites are fulfilled, generate a non-uploading plan:

```sh
npm run storefront -- plan best-in-show-grooming --stage /absolute/upload
npm run storefront -- plan fashion-style --stage /absolute/upload
```

These commands rerun owner preflight and print only the exact target, stage,
manifest digest and future command. The explicit future publishing command is
`npm run storefront -- publish <profile> --stage /absolute/upload`. It re-inspects
the artifact, requires production preflight, then runs `deno deploy --org lugearma
--app <configured-app> --prod --non-interactive` **with the stage as its cwd**.
Only CLI authentication is inherited; private business bindings are not sent in
the upload subprocess environment. The tool does not create apps, log in, change
runtime variables or upload secrets. Plan/preflight cannot verify that separately
configured cloud secrets equal a local private profile; verify this at publication.

Never invoke bare `deno deploy` from the dirty repository: it uploads the current
directory. This workflow deliberately bypasses that unsafe source selection via
a verified external allowlist. See the [CLI](https://docs.deno.com/runtime/reference/cli/deploy/).

Retain each reviewed stage/digest and the deployed revision per business. After
publishing, prove actual production Host behavior, boot/configuration, GET catalog
and availability, disabled previews and tenant isolation. Any booking mutation
requires its own authorized QA plan. Roll back one business using its prior
verified release/binding or prior active Deno revision; this does not roll back
owner database changes. [Deno timeline rollback](https://docs.deno.com/deploy/reference/timelines/)
does not require a GitHub push. The coordinator performed publication; no rollback
has been executed. See [hosted acceptance](HOSTED_ACCEPTANCE.md) for the live QA
sequence and the checkpoint for recorded release evidence.
