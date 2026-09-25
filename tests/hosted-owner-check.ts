/** Read-only hosted acceptance. No fixture servers, bookings or hosted configuration changes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { defaultOperatorDirectory, externalOperatorDirectory, profileName, readOperator, validateProfile } from '../scripts/deployment-profiles.ts';
import { assertExternalStage, inspectArtifact } from '../scripts/deployment-artifact.ts';
import { parseAvailability, parseStorefront } from '../src/lib/contracts.ts';
import { readLimited } from '../server/gateway.ts';

let stage = 'production profile and reviewed artifact';
try {
  const profile = profileName(process.argv[2]);
  assert.equal(process.argv[3], '--stage'); assert.ok(process.argv[4]); assert.equal(process.argv.length, 5);
  await assertExternalStage(process.argv[4], process.cwd());
  const artifact = await inspectArtifact(process.argv[4]);
  const directory = await externalOperatorDirectory(defaultOperatorDirectory(), process.cwd());
  const binding = validateProfile(await readOperator(directory, profile), profile, 'production');
  assert.equal(binding.org, 'lugearma');
  const get = (url: string | URL, headers?: HeadersInit) => fetch(url, { headers, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  const json = async (response: Response) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/json');
    return JSON.parse(await readLimited(response.body, 1_048_576));
  };
  stage = 'deployed owner public bootstrap';
  const owner = await get(new URL('/api/public/storefront/v1/bootstrap', binding.ownerApiOrigin), { 'X-Fresco-Site': binding.siteId, Authorization: `Bearer ${binding.ownerApiToken}`, Origin: binding.publicOrigin });
  const expected = parseStorefront(await json(owner), binding.siteId);
  stage = 'deployed customer gateway catalog and policy';
  const gateway = await get(new URL('/api/storefront/v1/bootstrap', binding.publicOrigin));
  assert.equal(gateway.headers.get('cache-control'), 'no-store');
  const actual = parseStorefront(await json(gateway), binding.siteId);
  assert.deepEqual(actual, expected);
  assert.equal(actual.booking.ready, true); assert.ok(actual.services.length > 0);
  assert.equal(actual.booking.mode, 'direct'); assert.equal(actual.booking.payment, 'none'); assert.equal(actual.booking.notifications, 'none');
  assert.equal(!!actual.capabilities.grooming, profile === 'best-in-show-grooming');
  stage = 'deployed authoritative availability';
  const service = actual.services[0], date = actual.booking.firstDate;
  const available = await get(new URL(`/api/storefront/v1/availability?${new URLSearchParams({ serviceId: service.id, date })}`, binding.publicOrigin));
  assert.equal(available.headers.get('cache-control'), 'no-store');
  const slots = parseAvailability(await json(available), actual.siteId, service.id, date, actual);
  stage = 'deployed browser-origin rejection';
  const rejected = await get(new URL('/api/storefront/v1/bootstrap', binding.publicOrigin), { Origin: 'https://foreign.invalid' });
  assert.equal(rejected.status, 403); assert.deepEqual(await rejected.json(), { code: 'origin_rejected' });
  stage = 'deployed client matches reviewed release bytes';
  for (const file of artifact.manifest.files.filter(entry => entry.path.startsWith('dist/'))) {
    const url = new URL(file.path === 'dist/index.html' ? '/' : '/' + file.path.slice(5), binding.publicOrigin);
    const response = await get(url); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    if (file.path.endsWith('index.html')) {
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    } else {
      assert.match(response.headers.get('cache-control') ?? '', /immutable/);
      if (file.path.endsWith('.js')) assert.match(response.headers.get('content-type') ?? '', /javascript/);
      if (file.path.endsWith('.css')) assert.match(response.headers.get('content-type') ?? '', /text\/css/);
    }
  }
  stage = 'deployed page routes and private-file rejection';
  for (const path of ['/reserva', '/reserva/pago']) {
    const response = await get(new URL(path, binding.publicOrigin)); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.body?.cancel();
  }
  for (const path of ['/.env', '/.git/config', '/server/gateway.ts', '/release-manifest.json']) {
    const response = await get(new URL(path, binding.publicOrigin)); assert.equal(response.status, 404); await response.body?.cancel();
  }
  console.log(JSON.stringify({ result: 'PASS', profile, publicOrigin: binding.publicOrigin, ownerApiOrigin: binding.ownerApiOrigin, siteId: actual.siteId, revision: actual.revision, services: actual.services.length, firstDateSlots: slots.slots.length, payment: actual.booking.payment, notifications: actual.booking.notifications, clientMatchesRelease: artifact.manifestSha256, mutations: 0 }));
} catch {
  // No raw responses, assertion objects, credentials, or upstream diagnostics in logs.
  console.error(JSON.stringify({ result: 'STOP', stage, mutations: 0 })); process.exitCode = 1;
}
