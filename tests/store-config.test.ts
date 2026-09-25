import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../server/gateway.ts';
import { makeSite } from './fixtures.ts';
import { parseStorefront } from '../src/lib/contracts.ts';

const binding = { siteId: 'salon', publicOrigin: 'https://customer.test', ownerApiOrigin: 'https://owner.test', ownerApiToken: 't'.repeat(40) };
const config = (suffix = '', init?: RequestInit) => new Request(`${binding.publicOrigin}/store.config.json${suffix}`, init);

test('public config projects the current owner catalog and never returns raw configuration or visitor credentials', async () => {
  const site = makeSite(), requests: Request[] = [];
  const gateway = createGateway(binding, async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json({ ...site, privateSecret: 'NEVER_EXPOSE', ownerApiToken: 'NEVER_EXPOSE', employees: [{ email: 'NEVER_EXPOSE' }], items: ['STALE_SAMPLE'] });
  });
  const first = await gateway(config('', { headers: { Cookie: 'staff=visitor', Authorization: 'Bearer visitor', 'X-Fresco-Site': 'grooming' } }));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(first.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await first.json(), parseStorefront(site));
  assert.equal(requests[0].url, 'https://owner.test/api/public/storefront/v1/bootstrap');
  assert.equal(requests[0].headers.get('authorization'), `Bearer ${binding.ownerApiToken}`);
  assert.equal(requests[0].headers.get('x-fresco-site'), 'salon');
  assert.equal(requests[0].headers.get('cookie'), null);
  site.revision++; site.services[0].name = 'Updated owner service';
  assert.deepEqual(await (await gateway(config())).json(), parseStorefront(site));
  site.services = [];
  assert.deepEqual((await (await gateway(config())).json()).services, []);
  assert.ok(requests.every(request => request.method === 'GET'));
});

test('public config rejects methods, tenant queries and foreign origins before any owner request', async () => {
  let calls = 0;
  const gateway = createGateway(binding, async () => { calls++; return Response.json(makeSite()); });
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) assert.equal((await gateway(config('', { method }))).status, 404);
  for (const suffix of ['?siteId=grooming', '?token=visitor', '?url=https://other.test', '?revision=1&revision=2']) assert.equal((await gateway(config(suffix))).status, 400);
  for (const headers of [{ Origin: 'https://other.test' }, { 'Sec-Fetch-Site': 'cross-site' }] as Array<Record<string, string>>) assert.equal((await gateway(config('', { headers }))).status, 403);
  assert.equal((await gateway(new Request('https://other.test/store.config.json'))).status, 403);
  assert.equal((await gateway(config('/extra'))).status, 404);
  assert.equal(calls, 0);
});

test('public config never falls back to a sample catalog when missing, unavailable or bound to another site', async () => {
  let calls = 0;
  const missing = await createGateway(null, async () => { calls++; throw new Error(); })(config());
  assert.equal(missing.status, 503); assert.deepEqual(await missing.json(), { code: 'not_configured' }); assert.equal(calls, 0);
  const wrongSite = await createGateway(binding, async () => Response.json(makeSite('grooming')))(config());
  assert.equal(wrongSite.status, 502); assert.deepEqual(await wrongSite.json(), { code: 'invalid_contract' });
  const unavailable = await createGateway(binding, async () => Response.json({ code: 'not_configured', secret: 'NEVER_EXPOSE' }, { status: 503 }))(config());
  assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { code: 'not_configured' });
});
