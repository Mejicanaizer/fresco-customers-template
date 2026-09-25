import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { createGateway, deploymentFromEnv } from '../server/gateway.ts';
import { serveApi } from '../server/node-handler.ts';
import { availability, bookingInput, fixtureOwner, makeSite, managementToken, receipt, receiptToken } from './fixtures.ts';
import type { Storefront } from '../src/lib/contracts.ts';

const deployment = { siteId: 'salon', publicOrigin: 'https://salon.test', ownerApiOrigin: 'https://owner-salon.test', ownerApiToken: 's'.repeat(32) };
const uuid = 'ac70cba4-591d-429c-a5e0-fb7d7b4c0036';
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`${deployment.publicOrigin}/api/storefront/v1/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: deployment.publicOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': uuid }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const fakeFetch = (owner: ReturnType<typeof fixtureOwner>): typeof fetch => async (input, init) => owner.handle(new Request(input, init));

test('deployment configuration cannot select arbitrary protocols/paths or omit production token', () => {
  assert.equal(deploymentFromEnv({}), null);
  assert.throws(() => deploymentFromEnv({ STOREFRONT_SITE_ID: 'salon' }));
  const env = { STOREFRONT_SITE_ID: 'salon', STOREFRONT_PUBLIC_ORIGIN: deployment.publicOrigin, STOREFRONT_OWNER_API_ORIGIN: deployment.ownerApiOrigin, NODE_ENV: 'production' };
  assert.throws(() => deploymentFromEnv(env));
  assert.equal(deploymentFromEnv({ ...env, STOREFRONT_OWNER_API_TOKEN: 's'.repeat(32) })?.siteId, 'salon');
  for (const origin of ['http://owner.test', 'https://owner.test/private', 'https://user:pass@owner.test', 'file:///private', 'https://owner.test?tenant=other']) assert.throws(() => deploymentFromEnv({ ...env, STOREFRONT_OWNER_API_TOKEN: 's'.repeat(32), STOREFRONT_OWNER_API_ORIGIN: origin }));
});
test('unconfigured gateway is explicitly unavailable and performs no upstream calls', async () => {
  let calls = 0;
  const result = await createGateway(null, async () => { calls++; throw new Error(); })(request('bootstrap'));
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { code: 'not_configured' }); assert.equal(calls, 0);
});
test('origin, methods, extra queries and duplicate query keys rejected before upstream', async () => {
  const owner = fixtureOwner(); const gateway = createGateway(deployment, fakeFetch(owner));
  assert.equal((await gateway(request('bookings', bookingInput(), { Origin: 'https://evil.test' }))).status, 403);
  assert.equal((await gateway(new Request('https://evil.test/api/storefront/v1/bootstrap'))).status, 403);
  assert.equal((await gateway(request('bootstrap', undefined, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  for (const path of ['bootstrap?siteId=foreign', 'availability?serviceId=x&serviceId=y&date=2030-06-12', 'availability?serviceId=x&date=2030-02-30', '../staff/clients', 'pet-photos']) assert.ok((await gateway(request(path))).status >= 400);
  assert.equal(owner.requests.length, 0);
});
test('all input properties are allowlisted including nested guest/pet fields and money', async () => {
  const owner = fixtureOwner(); const gateway = createGateway(deployment, fakeFetch(owner));
  for (const key of ['siteId', 'branchId', 'providerId', 'priceMinor', 'depositMinor', 'customerId']) assert.equal((await gateway(request('bookings', { ...bookingInput(), [key]: 'attack' }))).status, 400);
  assert.equal((await gateway(request('bookings', { ...bookingInput(), guest: { ...bookingInput().guest, role: 'admin' } }))).status, 400);
  assert.equal((await gateway(request('bookings', { ...bookingInput(), notes: 'x'.repeat(17000) }))).status, 413);
  assert.equal(owner.writes, 0);
});
test('gateway strips all private response fields and ignores browser credentials/tenant headers', async () => {
  const owner = fixtureOwner(); const gateway = createGateway(deployment, fakeFetch(owner));
  const bootstrap = await gateway(request('bootstrap', undefined, { Authorization: 'Bearer visitor', Cookie: 'admin=yes', 'X-Fresco-Site': 'foreign' }));
  assert.equal(bootstrap.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await bootstrap.text(), /DO_NOT_EXPOSE|privateSecret/);
  const sent = owner.requests[0];
  assert.equal(sent.headers.get('authorization'), `Bearer ${deployment.ownerApiToken}`);
  assert.equal(sent.headers.get('x-fresco-site'), 'salon'); assert.equal(sent.headers.get('cookie'), null);
  const response = await gateway(request('bookings', bookingInput()));
  assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /PRIVATE|privateClient/);
});
test('wrong site/service/date/operation results and oversized/malformed JSON fail closed', async () => {
  const site = makeSite();
  const cases: Array<[string, unknown | undefined, () => Response]> = [
    ['bootstrap', undefined, () => Response.json(makeSite('grooming'))],
    ['bootstrap', undefined, () => new Response('x'.repeat(1_048_577), { headers: { 'Content-Type': 'application/json' } })],
    ['bootstrap', undefined, () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
    ['bootstrap', undefined, () => new Response('<html>Error</html>')],
    ['availability?serviceId=salon-service&date=2030-06-12', undefined, () => Response.json({ ...availability(site), serviceId: 'other' })],
    ['availability?serviceId=salon-service&date=2030-06-12', undefined, () => Response.json({ ...availability(site), date: '2030-06-13' })],
    ['bookings', bookingInput(), () => Response.json({ contractVersion: 1, siteId: 'salon', receipt: receipt(site, 'confirmed'), receiptToken: receiptToken(site), managementToken: managementToken(site) })],
    ['bookings', bookingInput(), () => Response.json({ contractVersion: 1, siteId: 'salon', receipt: { ...receipt(site), slotId: 'other' }, receiptToken: receiptToken(site), managementToken: managementToken(site) })],
  ];
  for (const [path, body, respond] of cases) { const response = await createGateway(deployment, async () => respond())(request(path, body)); assert.equal(response.status, 502, path); assert.deepEqual(await response.json(), { code: 'invalid_contract' }); }
});
test('errors never expose owner secrets or capability diagnostics', async () => {
  for (const [code, status] of [['slot_unavailable', 409], ['not_configured', 503]] as const) {
    const gateway = createGateway(deployment, async () => Response.json({ code, details: 'SECRET_TOKEN' }, { status }));
    const result = await gateway(request('bookings', bookingInput()));
    assert.equal(result.status, status); assert.deepEqual(await result.json(), { code });
  }
});
test('stale revisions and stale slots rejected; same key replays once; competing keys conflict', async () => {
  const owner = fixtureOwner(); const gateway = createGateway(deployment, fakeFetch(owner));
  assert.equal((await gateway(request('bookings', { ...bookingInput(), revision: 2 }))).status, 409);
  assert.equal((await gateway(request('bookings', { ...bookingInput(), slotId: 'old-slot' }))).status, 409);
  const responses = await Promise.all([gateway(request('bookings', bookingInput())), gateway(request('bookings', bookingInput()))]);
  assert.equal(responses[0].status, 200); assert.deepEqual(await responses[0].json(), await responses[1].json()); assert.equal(owner.writes, 1);
  assert.equal((await gateway(request('bookings', { ...bookingInput(), notes: 'changed' }))).status, 409);
  assert.equal((await gateway(request('bookings', bookingInput(), { 'Idempotency-Key': crypto.randomUUID() }))).status, 409);
});
test('paid approval starts at checkout and fixture does not hold capacity', async () => {
  const site = makeSite('grooming'), owner = fixtureOwner(site);
  const gateway = createGateway({ ...deployment, siteId: site.siteId }, fakeFetch(owner));
  const first = await gateway(request('bookings', bookingInput(site)));
  assert.equal((await first.json()).receipt.state, 'awaiting_payment');
  assert.equal((await gateway(request('bookings', bookingInput(site), { 'Idempotency-Key': crypto.randomUUID() }))).status, 200);
  assert.equal(owner.writes, 2); // Contract fixture only, not proof of hosted transactions.
});
test('gateway projects additive refund fields without provider data and rejects fee-reduced refunds', async () => {
  const site = makeSite();
  let data = { ...receipt(site, 'cancelled'), paymentStatus: 'refund_pending', refund: { status: 'pending', amountMinor: 15000, currency: 'MXN', providerId: 'PRIVATE', processorFeeMinor: 650 }, settlement: { accountId: 'PRIVATE' } };
  const gateway = createGateway(deployment, async () => Response.json(data));
  const accepted = await gateway(request('booking-status', { token: receiptToken(site) }));
  assert.equal(accepted.status, 200);
  const projected = await accepted.json();
  assert.deepEqual(projected.refund, { status: 'pending', amountMinor: 15000, currency: 'MXN' });
  assert.equal(projected.paymentStatus, 'refund_pending'); assert.doesNotMatch(JSON.stringify(projected), /PRIVATE|processorFee|settlement/);
  data = { ...data, refund: { ...data.refund, amountMinor: 14350 } };
  assert.equal((await gateway(request('booking-status', { token: receiptToken(site) }))).status, 502);
});
test('cancellation checks booking revision and replays original command after revision changes', async () => {
  const site = makeSite(), owner = fixtureOwner(site), gateway = createGateway(deployment, fakeFetch(owner));
  const input = { token: managementToken(site), bookingRevision: 1 };
  const first = await gateway(request('guest-booking/cancel', input)); assert.equal(first.status, 200);
  assert.equal((await gateway(request('guest-booking/cancel', input))).status, 200); assert.equal(owner.writes, 1);
  assert.equal((await gateway(request('guest-booking/cancel', input, { 'Idempotency-Key': crypto.randomUUID() }))).status, 409);
});

async function deploymentServers(site: Storefront) {
  const owner = fixtureOwner(site);
  const ownerServer = createServer(async (req, res) => {
    const init: RequestInit & { duplex?: string } = { method: req.method, headers: req.headers as Record<string, string> };
    if (req.method === 'POST') { init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>; init.duplex = 'half'; }
    const result = await owner.handle(new Request(`http://127.0.0.1${req.url}`, init));
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  });
  ownerServer.listen(0, '127.0.0.1'); await once(ownerServer, 'listening');
  const ownerOrigin = `http://127.0.0.1:${(ownerServer.address() as AddressInfo).port}`;
  let publicOrigin = '', gateway: ReturnType<typeof createGateway>;
  const publicServer = createServer((req, res) => { void serveApi(req, res, publicOrigin, gateway); });
  publicServer.listen(0, '127.0.0.1'); await once(publicServer, 'listening');
  publicOrigin = `http://127.0.0.1:${(publicServer.address() as AddressInfo).port}`;
  gateway = createGateway({ siteId: site.siteId, ownerApiOrigin: ownerOrigin, publicOrigin });
  return { owner, publicOrigin, async close() { for (const server of [ownerServer, publicServer]) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } } };
}
test('real HTTP: two deployments route only to their bound owners; cross-site guest tokens fail', async () => {
  const a = await deploymentServers(makeSite()), b = await deploymentServers(makeSite('grooming'));
  try {
    const [sa, sb] = await Promise.all([fetch(`${a.publicOrigin}/api/storefront/v1/bootstrap`).then(r => r.json()), fetch(`${b.publicOrigin}/api/storefront/v1/bootstrap`).then(r => r.json())]);
    assert.equal(sa.name, makeSite().name); assert.equal(sb.name, makeSite('grooming').name);
    const post = (origin: string, path: string, body: unknown) => fetch(`${origin}/api/storefront/v1/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': uuid }, body: JSON.stringify(body) });
    assert.equal((await post(a.publicOrigin, 'bookings', bookingInput())).status, 200);
    assert.equal(a.owner.writes, 1); assert.equal(b.owner.writes, 0);
    assert.equal((await post(b.publicOrigin, 'guest-booking', { token: managementToken(makeSite()) })).status, 404);
    const foreignOrigin = await fetch(`${a.publicOrigin}/api/storefront/v1/bookings`, { method: 'POST', headers: { Origin: b.publicOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(bookingInput()) });
    assert.equal(foreignOrigin.status, 403); assert.equal(a.owner.writes, 1);
  } finally { await a.close(); await b.close(); }
});
