# Public catalog JSON

`GET /store.config.json` serves the same validated v1 `Storefront` JSON as
`GET /api/storefront/v1/bootstrap`. Both paths fetch the deployment's current owner
catalog with `Cache-Control: no-store`. Neither path exposes runtime environment
variables, admission tokens, staff records, customer records or raw owner settings.

This preserves the catalog synchronization URL introduced by
[PR #1](https://github.com/Mejicanaizer/fresco-customers-template/pull/1). The static
sample snapshot from that PR is retained in Git history. It is replaced at runtime
because its sample contacts, employees, prices, products and schedule do not
describe the bound owner's published catalog.

Consumers must use the existing versioned public schema: `contractVersion`,
`siteId`, `revision`, public branding/contact fields, `branch`, `booking`,
`capabilities` and `services`. Prices are integer minor units with the explicit
currency exponent. The former `storeName`, `items`, `employees` and generated
schedule shape is not an authoritative booking contract. Obtain available times
from the availability API; do not derive them from this catalog.

External applications can fetch this public projection from their server and
validate the contract version and expected site identity. Same-origin browser
requests also work. Existing Host/Origin rules remain in force; arbitrary
cross-origin browser access is not enabled. Do not send a staff session or owner
admission token from a browser.

The alias accepts GET with no query parameters. Client-supplied site/tenant
selectors are rejected. Unconfigured or unavailable owners return the existing
sanitized gateway error instead of sample or cached business data. It is available
through the Node, Deno and Vite gateway runtimes; a static CDN upload is insufficient.
