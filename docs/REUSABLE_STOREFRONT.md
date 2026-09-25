# Reusable storefront architecture and configuration

Status: both customer apps deployed, September 23, 2026. Direct unpaid booking
lifecycles, native owner agenda verification, cross-business capability isolation
and read-only browser checks passed for both businesses. See
[the checkpoint](IMPLEMENTATION_CHECKPOINT.md) for release evidence and limits.

## Product contract

- One maintained service-only customer application, N independent deployments.
  Each deployment has its own business backend/Supabase database/Auth/Storage;
  its owner admin and storefront share that same business agenda.
- All customers book as guests. No sign-in, accounts, product purchasing or cart.
- Admin selects `direct` (default) or `approval`. Approval requests never hold
  capacity and require availability revalidation at approval.
- The current approved milestone creates direct unpaid appointments with payment=none. Future Stripe activation uses an explicit configurable fixed deposit. No percentage or refund rule is inferred.
- Guest cancellation/rescheduling requires at least 24 hours' notice. Private
  management links are available immediately after booking. Automated WhatsApp notifications are deferred and remain unconfigured. A contact `wa.me` link only
  opens a conversation; it proves neither sending nor delivery.
- Grooming preserves human clients with multiple pets and one appointment per
  pet. Private name/size/breed/age/photo/behavior/preferences belong to that
  extension, not public catalog records.

## Runtime and ownership

```text
One React/Vite storefront release
    |                        |
Business A gateway           Business B gateway            ... N
    |                        |
Owner A API + admin          Owner B API + admin
    |                        |
Supabase A + agenda          Supabase B + agenda
```

The same gateway runs with Node22 or Deno2's built-in Node compatibility.
[Deno local-source deployment](DENO_DEPLOY.md) packages the prebuilt client and
five runtime modules into one clean external artifact. Fashion Style and Grooming
select independent private bindings, not different source trees. All non-production
Deno timelines expose only an inert503 listener; production requires its exact
Host and verified owner API. Both businesses use the same reviewed hosted release.

This increment retains React 19/Vite and project-owned presentation. Fresh/Preact
components and islands are not React components. No upstream UI was copied or
vendored; shared Fresh/Preact UI adoption is **not completed**. Any later alignment
needs an explicitly reviewed runtime migration or a supported upstream React
adapter. HTTP contracts are framework-neutral and can survive either decision.

The gateway is transport/validation code, not a second booking service. Generic
capacity, payment, configuration and authorization implementations belong to
Fresco/owner APIs. Do not duplicate their agenda or patch vendored packages here.
A deployment token admits this gateway to dedicated public APIs; it does not grant
staff identity or permission to call existing authenticated staff operations.

## Three configuration layers

| Layer | Owner | Contents |
| --- | --- | --- |
| Deployment binding | Operator, private hosting settings | Site ID, owner origin, public origin, admission token, release |
| Published storefront projection | Authorized business admin through owner API | Brand/theme/logo, branch/timezone, locale/currency, services, deposit quotes, terms version, mode/readiness, capabilities |
| Business domain records | Existing business backend | Clients, pets, providers, schedules/closures/buffers, appointments, holds, requests, payment/event ledgers, private capabilities and notification outbox |

**Servicios** is the owner's only service catalog editor. Public services must
project the same saved, configured canonical service IDs, descriptions, prices
and durations. Hours and booking policy settings do not maintain another copy
of the service catalog. The customer renders exactly the current public service array and keeps no local
copy of catalog membership.

The browser cannot choose a site/backend/branch or send monetary values. Gateway
requests use a fixed owner origin and overwritten admission headers. Origin and
Host checks reject alternate bindings; no cookies or browser Authorization are
forwarded. All responses are no-store and allowlisted. Each response echoes its
site and contract version; contextual validators also check revision, branch,
service, date, provider, instants, quotes and accepted terms where applicable.

There is no hardcoded business-name conditional. Admin settings are validated
runtime data. Supported theme colors have a contrast check and cannot contain
CSS/scripts. No production config or secrets are embedded in `dist/`.

Each normal customer page load/reload requests `bootstrap` with `cache: no-store`;
Production HTML and gateway JSON are also no-store; local Vite HTML uses no-cache revalidation. A failed load shows an error instead of
the old catalog. An existing page is a snapshot until refreshed; the backend must
validate the current configuration revision for availability and booking commands.

## Availability and booking

`bootstrap` publishes the supported branch, local first/last booking dates and
service duration/deposit. The month calendar requests `availability` for
that date. The browser does not generate open days, staff eligibility, slots or
capacity. The owner must enforce work schedules, time off, lead time, horizon,
service duration, buffers and existing industry rules on reads and writes.

Dates are branch-local `YYYY-MM-DD`; slots use explicit-offset instants and stable
provider IDs. A slot's end minus start equals the published appointment duration;
capacity buffers stay in the authoritative scheduler. No fixed daily hours or
15-minute slot grid is imposed by this app. Size-specific grooming services need
explicit published variants or a coordinated typed extension, not browser guesses.

Direct unpaid booking atomically creates the client, pet and appointment in the existing agenda, then returns a confirmed unpaid receipt. Its actual agenda status uses the existing domain status (Grooming pending). Future Stripe booking requires an expiring authoritative hold, one Checkout session, verified webhook and committed capacity. Luis selected future approval deposits at request submission; the full lifecycle and paid/expired-hold recovery remain unimplemented, so approval stays disabled. Approval requests must remain separate durable records because pending agenda appointments block capacity.

Secure status and management capabilities are distinct. The owner binds them to
one booking/site and checks expiry; anonymous phone/name matching is never record
authorization. Cancellation and rescheduling carry the expected booking revision
so old commands cannot mutate a later appointment version. The owner checks the
24-hour deadline atomically and applies the terms snapshot accepted for that booking.

## Per-business deployment checklist

1. Select one tested storefront release and compatible owner contract/schema.
2. Identify this business's existing backend/project and agenda. For a new
   business, provision separate resources only under explicit authorization.
3. Review and apply required upstream migrations through their owning tasks. No
   hosted migrations, resets or record writes are performed by this repository.
4. Configure the three fixed binding settings and private admission token. Set
   HTTPS, preserve public Host through the proxy, and scope secrets independently.
5. Publish branding, branch, services/variants/providers and scheduling rules in
   the owner admin. Explicitly configure direct/approval mode, deposit strategy,
   accepted terms and the unresolved payment/race policy once approved.
6. For the unpaid milestone, publish payment=none and notifications=none. Activate future Stripe/WhatsApp only with reviewed backend implementation, credentials and terms; disabled integrations must not prevent unpaid booking.
7. Deploy to that business's staging environment; verify real agenda visibility,
   concurrent staff/guest capacity arbitration, idempotency, payment status and
   WhatsApp delivery. Repeat independently for a second business.
8. Promote only after authorized review. Record release/config/schema versions,
   retain a compatible prior artifact, and roll back each deployment independently.
   Database compatibility needs its own forward-fix plan; no automatic reset.

Future release automation should build/test one artifact, use scoped environments
per business and promote explicitly. The current hosted rollout is authorized and
coordinator-managed. No GitHub push or publishing workflow was required.
