/** Read-only check of the real local owner. Never starts servers or loads fixtures. */
import assert from 'node:assert/strict';
import { deploymentFromEnv } from '../server/gateway.ts';
import { parseAvailability, parseStorefront } from '../src/lib/contracts.ts';

let stage = 'local deployment binding';
try {
  const deployment = deploymentFromEnv(process.env);
  assert.ok(deployment?.ownerApiToken);
  // This command is deliberately limited to the approved local integration.
  assert.equal(deployment.publicOrigin, 'http://127.0.0.1:5373');
  assert.equal(deployment.ownerApiOrigin, 'http://127.0.0.1:5372');
  assert.equal(deployment.siteId, 'best-in-show-grooming');
  const ownerHeaders = { 'X-Fresco-Site': deployment.siteId, Authorization: `Bearer ${deployment.ownerApiToken}` };
  const get = (url: string, headers?: HeadersInit) => fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  stage = 'real owner bootstrap';
  const owner = await get(`${deployment.ownerApiOrigin}/api/public/storefront/v1/bootstrap`, ownerHeaders);
  assert.equal(owner.status, 200, 'owner route must be available');
  const expected = parseStorefront(await owner.json(), deployment.siteId);
  stage = 'customer gateway bootstrap';
  const publicResponse = await get(`${deployment.publicOrigin}/api/storefront/v1/bootstrap`);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  const actual = parseStorefront(await publicResponse.json(), deployment.siteId);
  assert.deepEqual(actual, expected);
  assert.equal(actual.booking.payment, 'none');
  assert.equal(actual.booking.mode, 'direct');
  assert.equal(actual.booking.notifications, 'none');
  console.log('PASS: real owner and customer gateway publish the same bound unpaid catalog.');
  console.log(`Booking readiness: ${actual.booking.ready ? 'ready' : actual.booking.unavailableReasons.join(', ')}. Published services: ${actual.services.length}.`);
  if (actual.booking.ready && actual.services.length > 0) {
    stage = 'real owner availability through gateway';
    const service = actual.services[0], date = actual.booking.firstDate;
    const query = new URLSearchParams({ serviceId: service.id, date });
    const response = await get(`${deployment.publicOrigin}/api/storefront/v1/availability?${query}`);
    assert.equal(response.status, 200);
    const slots = parseAvailability(await response.json(), actual.siteId, service.id, date, actual);
    console.log(`PASS: authoritative availability validates (${slots.slots.length} slots on the first published date).`);
  }
  stage = 'gateway origin binding';
  const rejected = await get(`${deployment.publicOrigin}/api/storefront/v1/bootstrap`, { Origin: 'http://unrelated.invalid' });
  assert.equal(rejected.status, 403);
  console.log('PASS: foreign browser origin rejected. No bookings, payments or messages created.');
} catch {
  // Keep server diagnostics, deployment credentials and business data out of test logs.
  console.error(`FAIL: ${stage}. Check the real local owner setup; no fixture fallback was used.`);
  process.exitCode = 1;
}
