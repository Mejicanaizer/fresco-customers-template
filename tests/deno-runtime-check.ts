/** Local synthetic integration only. No Deno Deploy calls and no real business mutations. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { cleanProcessEnvironment, command, inspectArtifact, prepareArtifact, assertExternalStage } from '../scripts/deployment-artifact.ts';
import { bindingEnvironment } from '../scripts/deployment-profiles.ts';
import { bookingInput, fixtureOwner, makeSite, makeUnpaidSite, managementToken } from './fixtures.ts';
import type { Storefront } from '../src/lib/contracts.ts';

const children: ChildProcess[] = [], servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return (server.address() as AddressInfo).port;
}
async function unusedPort() {
  const server = createServer(); const port = await listen(server);
  await new Promise<void>(done => server.close(() => done())); return port;
}
async function ownerServer(site: Storefront) {
  const owner = fixtureOwner(site), token = `${site.siteId}-` + 't'.repeat(40);
  const port = await listen(createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); res.end(); return; }
    try {
      const init: RequestInit & { duplex?: string } = { method: req.method, headers: req.headers as Record<string, string> };
      if (req.method === 'POST') { init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>; init.duplex = 'half'; }
      const response = await owner.handle(new Request(`http://127.0.0.1${req.url}`, init));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } catch { res.writeHead(500); res.end(); }
  }));
  return { owner, site, token, origin: `http://127.0.0.1:${port}` };
}
function launch(stage: string, env: Record<string, string>, args: string[] = [], readable = true) {
  const child = spawn('deno', ['run', '--cached-only', '--no-lock', '--allow-env', '--allow-net', ...(readable ? ['--allow-read=dist'] : []), 'server/deno.ts', ...args], { cwd: stage, env: { ...cleanProcessEnvironment(), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  child.stdout!.on('data', bytes => { output += bytes.toString(); }); child.stderr!.on('data', bytes => { output += bytes.toString(); });
  const exited = new Promise<number | null>((done, fail) => { child.once('error', fail); child.once('exit', done); });
  async function ready() {
    for (let i = 0; i < 100; i++) {
      if (/Storefront (listening|preview is disabled)/.test(output)) return;
      if (child.exitCode !== null) throw new Error(`Synthetic Deno runtime failed: ${output}`);
      await delay(50);
    }
    throw new Error('Deno runtime failed to start within five seconds.');
  }
  return { child, ready, exited, output: () => output };
}
async function http(port: number, path: string, headers: Record<string, string> = {}, method = 'GET', body?: string) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>((done, fail) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers, timeout: 5000 }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP check timed out'))); req.on('error', fail); req.end(body);
  });
}
async function main() {
  const repository = process.cwd();
  const stage = process.argv[2] ? resolve(process.argv[2]) : (await prepareArtifact(repository)).directory;
  await assertExternalStage(stage, repository); const artifact = await inspectArtifact(stage);
  await command('deno', ['check', '--no-lock', 'server/deno.ts'], stage, cleanProcessEnvironment());
  console.log(`Checking isolated release ${artifact.manifestSha256}`);
  const salon = makeSite(); salon.booking = { ...salon.booking, payment: 'none', notifications: 'none' };
  const [a, b] = await Promise.all([ownerServer(salon), ownerServer(makeUnpaidSite())]);
  const bindings = [];
  for (const owner of [a, b]) {
    const port = await unusedPort(), origin = `http://127.0.0.1:${port}`;
    const binding = { siteId: owner.site.siteId, ownerApiOrigin: owner.origin, publicOrigin: origin, ownerApiToken: owner.token };
    await launch(stage, { ...bindingEnvironment(binding), PORT: String(port) }, ['--local']).ready();
    bindings.push({ ...owner, port, publicOrigin: origin });
  }
  const [first, second] = bindings;
  for (const deployment of bindings) {
    const response = await http(deployment.port, '/api/storefront/v1/bootstrap', { Cookie: 'staff=private', Authorization: 'Bearer browser-credential', 'X-Fresco-Site': 'other', 'X-Forwarded-Host': 'foreign.example' });
    assert.equal(response.status, 200); assert.equal(response.headers['cache-control'], 'no-store');
    const site = JSON.parse(response.body); assert.equal(site.siteId, deployment.site.siteId); assert.equal(site.name, deployment.site.name);
    assert.doesNotMatch(response.body, /DO_NOT_EXPOSE|privateSecret/);
    const publicConfig = await http(deployment.port, '/store.config.json');
    assert.equal(publicConfig.status, 200); assert.equal(publicConfig.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(publicConfig.body), site);
    assert.equal(publicConfig.headers['access-control-allow-origin'], undefined);
    assert.equal((await http(deployment.port, '/store.config.json?siteId=other')).status, 400);
    const upstream = deployment.owner.requests.at(-1)!;
    assert.equal(upstream.headers.get('authorization'), `Bearer ${deployment.token}`);
    assert.equal(upstream.headers.get('x-fresco-site'), deployment.site.siteId);
    for (const key of ['cookie', 'x-forwarded-host']) assert.equal(upstream.headers.get(key), null);
    const available = await http(deployment.port, `/api/storefront/v1/availability?serviceId=${site.services[0].id}&date=${site.booking.firstDate}`);
    assert.equal(available.status, 200); assert.equal(JSON.parse(available.body).siteId, site.siteId);
  }
  console.log('PASS: two Deno processes share one artifact and route to separate authenticated owner APIs.');

  const before = first.owner.requests.length;
  const rejectedHeaders: Record<string, string>[] = [{ Host: 'foreign.example', 'X-Forwarded-Host': new URL(first.publicOrigin).host }, { Origin: second.publicOrigin }, { 'Sec-Fetch-Site': 'cross-site' }];
  for (const headers of rejectedHeaders) {
    assert.equal((await http(first.port, '/api/storefront/v1/bootstrap', headers)).status, 403);
    assert.equal((await http(first.port, '/store.config.json', headers)).status, 403);
  }
  assert.equal(first.owner.requests.length, before);
  const post = (deployment: typeof first, path: string, body: unknown, origin = deployment.publicOrigin, key = crypto.randomUUID()) => http(deployment.port, `/api/storefront/v1/${path}`, { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key }, 'POST', JSON.stringify(body));
  const key = crypto.randomUUID(), payload = bookingInput(first.site);
  const created = await post(first, 'bookings', payload, first.publicOrigin, key);
  assert.equal(created.status, 200); assert.equal(JSON.parse(created.body).receipt.state, 'confirmed');
  assert.equal((await post(first, 'bookings', payload, first.publicOrigin, key)).body, created.body);
  assert.equal(first.owner.writes, 1); assert.equal(second.owner.writes, 0);
  assert.equal((await post(second, 'guest-booking', { token: managementToken(first.site) })).status, 404);
  assert.equal((await post(first, 'bookings', payload, second.publicOrigin)).status, 403);
  assert.equal(first.owner.writes, 1);
  console.log('PASS: POST streaming, immutable replay, cross-business token rejection and Host/Origin guards.');

  for (const page of ['/', '/reserva', '/reserva/pago']) {
    const response = await http(first.port, page); assert.equal(response.status, 200);
    assert.match(String(response.headers['content-type']), /text\/html/); assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal((await http(first.port, page, {}, 'HEAD')).body, '');
  }
  for (const asset of artifact.manifest.files.filter(file => file.path.startsWith('dist/assets/'))) {
    const response = await http(first.port, '/' + asset.path.slice(5)); assert.equal(response.status, 200);
    assert.match(String(response.headers['cache-control']), /immutable/);
    assert.match(String(response.headers['content-type']), asset.path.endsWith('.js') ? /javascript/ : /text\/css/);
    assert.equal((await http(first.port, '/' + asset.path.slice(5), {}, 'HEAD')).body, '');
    assert.doesNotMatch(response.body, /\/src\/assets\/preview\/grooming-(cover|service)\.png/);
    assert.ok(!response.body.includes(a.token) && !response.body.includes(b.token));
  }
  for (const path of ['/.env', '/.git/config', '/server/gateway.ts', '/src/lib/contracts.ts', '/release-manifest.json', '/assets/..%2f..%2f.env', '/assets/%2e%2e/index.html', '/assets/index.js.map']) {
    assert.equal((await http(first.port, path)).status, 404, path);
  }
  assert.equal((await http(first.port, '/', { Host: 'foreign.example' })).status, 403);
  assert.equal((await http(first.port, '/', {}, 'POST')).status, 405);
  console.log('PASS: pages/assets, MIME/cache/HEAD, private-file and traversal rejection, production media exclusion.');

  const prodPort = await unusedPort();
  const prod = { ...bindingEnvironment({ siteId: 'salon', publicOrigin: 'https://customer.example.com', ownerApiOrigin: 'https://owner.example.com', ownerApiToken: a.token }), PORT: String(prodPort), DENO_DEPLOY: 'true', DENO_TIMELINE: 'production' };
  await launch(stage, prod).ready();
  assert.equal((await http(prodPort, '/', { Host: 'customer.example.com' })).status, 200);
  assert.equal((await http(prodPort, '/', { Host: `127.0.0.1:${prodPort}`, 'X-Forwarded-Host': 'customer.example.com' })).status, 403);
  for (const [env, args] of [
    [{ PORT: String(await unusedPort()) }, []],
    [{ ...prod, STOREFRONT_OWNER_API_ORIGIN: first.origin }, []],
    [{ ...prod, STOREFRONT_OWNER_API_TOKEN: '' }, []],
    [{ ...prod, DENO_TIMELINE: 'preview/test' }, ['--local']],
  ] as Array<[Record<string, string>, string[]]>) {
    const process = launch(stage, env, args); const code = await process.exited;
    assert.notEqual(code, 0); assert.doesNotMatch(process.output(), /Storefront listening/);
    assert.ok(!process.output().includes(a.token));
  }
  console.log('PASS: production exact Host and fail-closed missing/HTTP/token/timeline configuration.');

  const callsBeforePreview = [a.owner.requests.length, b.owner.requests.length];
  for (const timeline of ['preview/synthetic-revision', 'git-branch/synthetic', '', 'unknown-timeline', 'Production']) {
    const port = await unusedPort();
    // Even accidentally supplied real-looking variables must never load the gateway or assets.
    const env = { ...prod, STOREFRONT_OWNER_API_ORIGIN: first.origin, PORT: String(port), DENO_TIMELINE: timeline };
    await launch(stage, env, [], false).ready();
    for (const path of ['/', '/store.config.json', '/api/storefront/v1/bootstrap', '/api/storefront/v1/bookings', '/' + artifact.manifest.files.find(file => file.path.endsWith('.js'))!.path.slice(5)]) {
      const result = await http(port, path, { Host: 'arbitrary-preview.example' });
      assert.equal(result.status, 503); assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.body, 'Storefront preview is unavailable.');
    }
  }
  assert.deepEqual([a.owner.requests.length, b.owner.requests.length], callsBeforePreview);
  const noBindingPort = await unusedPort();
  await launch(stage, { PORT: String(noBindingPort), DENO_DEPLOY: 'true', DENO_TIMELINE: 'preview/no-binding' }, [], false).ready();
  assert.equal((await http(noBindingPort, '/')).status, 503);
  assert.deepEqual(await inspectArtifact(stage), artifact);
  assert.ok(!(await readFile(join(stage, 'deno.json'), 'utf8')).includes('package.json'));
  console.log('PASS: Preview/branch/unknown warmup boots without a binding, file access or any owner request.');
  console.log(`Deno runtime checks passed. No hosted deployment. Artifact: ${stage}`);
}
try { await main(); }
finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? undefined : once(child, 'exit')));
  for (const server of servers) { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); }
}
