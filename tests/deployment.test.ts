import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cleanProcessEnvironment, inspectArtifact, runtimeFiles, stageBuiltArtifact, canonicalExternalPath } from '../scripts/deployment-artifact.ts';
import { initializeOperator, preflight, profiles, readOperator, validateProfile } from '../scripts/deployment-profiles.ts';
import { deploymentCommand, main } from '../scripts/storefront-deploy.ts';
import { availability, makeUnpaidSite } from './fixtures.ts';

const repository = process.cwd();
const local = { siteId: 'best-in-show-grooming', ownerApiOrigin: 'http://127.0.0.1:5372', publicOrigin: 'http://127.0.0.1:5373', ownerApiToken: 't'.repeat(40) };
const production = { ...local, ownerApiOrigin: 'https://owner.example.com', publicOrigin: 'https://customer.example.com', org: 'lugearma', app: 'best-in-show-grooming-customers' };
const config = () => ({ version: 1, profile: 'best-in-show-grooming', local, production });
async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'fresco-deploy-test-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('profiles reject missing or placeholder bindings, unsafe origins and cross-profile selection', async () => {
  for (const name of profiles) {
    const example = JSON.parse(await readFile(join(repository, 'deploy/profiles', `${name}.example.json`), 'utf8'));
    assert.equal(example.production.org, 'lugearma');
    assert.throws(() => validateProfile(example, name, 'production'), /placeholder/);
    assert.throws(() => validateProfile(example, name, 'local'), /placeholder/);
  }
  assert.deepEqual(validateProfile(config(), 'best-in-show-grooming', 'production'), production);
  assert.throws(() => validateProfile(config(), 'fashion-style', 'local'), /identity/);
  for (const ownerApiOrigin of ['http://127.0.0.1:5372', 'https://localhost', 'https://owner.test', 'https://owner.example.com/api', production.publicOrigin]) {
    assert.throws(() => validateProfile({ ...config(), production: { ...production, ownerApiOrigin } }, 'best-in-show-grooming', 'production'));
  }
  for (const patch of [{ ownerApiToken: '' }, { siteId: '' }, { ownerApiToken: 'short' }, { unexpectedSecret: 'extra' }]) {
    assert.throws(() => validateProfile({ ...config(), local: { ...local, ...patch } }, 'best-in-show-grooming', 'local'));
  }
  assert.deepEqual(deploymentCommand(production), ['deploy', '--org', 'lugearma', '--app', 'best-in-show-grooming-customers', '--prod', '--non-interactive']);
  assert.throws(() => deploymentCommand(local), /Explicit/);
  await assert.rejects(main(['publish', 'best-in-show-grooming', '--context', 'local']), /not applicable/);
});

test('private profile initialization imports exactly four gateway keys and never overwrites', async () => temporary(async root => {
  const repo = join(root, 'repo'), operators = join(root, 'operators');
  await mkdir(repo); await cp(join(repository, 'deploy'), join(repo, 'deploy'), { recursive: true });
  const gateway = join(repo, '.env');
  const env = `STOREFRONT_SITE_ID=${local.siteId}\nSTOREFRONT_OWNER_API_ORIGIN=${local.ownerApiOrigin}\nSTOREFRONT_PUBLIC_ORIGIN=${local.publicOrigin}\nSTOREFRONT_OWNER_API_TOKEN=${local.ownerApiToken}\nCAPABILITY_SECRET=never-copy-me\nVITE_SECRET=never-copy-me\n`;
  await writeFile(gateway, env, { mode: 0o600 });
  const file = await initializeOperator(repo, operators, 'best-in-show-grooming', gateway);
  assert.equal((await lstat(file)).mode & 0o777, 0o600);
  assert.equal((await lstat(operators)).mode & 0o777, 0o700);
  assert.doesNotMatch(await readFile(file, 'utf8'), /never-copy-me|CAPABILITY_SECRET|VITE_SECRET/);
  assert.deepEqual(validateProfile(await readOperator(operators, 'best-in-show-grooming'), 'best-in-show-grooming', 'local'), local);
  await assert.rejects(initializeOperator(repo, operators, 'best-in-show-grooming', gateway), /EEXIST/);
  await assert.rejects(initializeOperator(repo, operators, 'fashion-style', gateway), /Only the approved/);
  await assert.rejects(initializeOperator(repo, operators, 'best-in-show-grooming', join(root, 'owner-runtime.env')), /never the owner/);
  await writeFile(gateway, 'STOREFRONT_SITE_ID=best-in-show-grooming');
  await assert.rejects(initializeOperator(repo, join(root, 'missing-fields'), 'best-in-show-grooming', gateway), /placeholder/);
  await chmod(file, 0o644);
  await assert.rejects(readOperator(operators, 'best-in-show-grooming'), /private file/);
}));

test('external-only paths reject symlink parents pointing back into the repository', async () => temporary(async root => {
  const repo = join(root, 'repo'); await mkdir(repo);
  await symlink(repo, join(root, 'alias'));
  await assert.rejects(canonicalExternalPath(join(root, 'alias', 'private'), repo), /outside/);
  await assert.rejects(initializeOperator(repo, join(root, 'alias', 'private'), 'fashion-style'), /outside/);
}));

test('owner preflight uses GET only, fixed token/site and authoritative availability; rejects unsupported policy', async () => {
  const site = makeUnpaidSite(), binding = { ...local, siteId: site.siteId };
  const seen: Request[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const req = new Request(url, init); seen.push(req);
    assert.equal(init?.redirect, 'error');
    return Response.json(req.url.includes('/bootstrap') ? site : availability(site));
  };
  assert.equal((await preflight(binding, fetcher)).services, 1);
  assert.equal(seen.length, 2);
  for (const req of seen) {
    assert.equal(req.method, 'GET'); assert.equal(req.headers.get('authorization'), `Bearer ${binding.ownerApiToken}`);
    assert.equal(req.headers.get('x-fresco-site'), site.siteId); assert.equal(req.headers.get('origin'), binding.publicOrigin);
  }
  for (const patch of [{ payment: 'stripe-deposit' }, { notifications: 'whatsapp' }, { mode: 'approval' }]) {
    await assert.rejects(preflight(binding, async () => Response.json({ ...site, services: site.services.map(service => ({ ...service, depositMinor: 10000 })), booking: { ...site.booking, ...patch } })), /milestone|contract/);
  }
  await assert.rejects(preflight(local, fetcher), /site-identity/);
  await assert.rejects(preflight(binding, async () => new Response('private backend diagnostic', { status: 404 })), error => !String(error).includes('private backend diagnostic'));
  await assert.rejects(preflight(binding, async () => { throw new Error(binding.ownerApiToken); }), error => !String(error).includes(binding.ownerApiToken));
  await assert.rejects(preflight(binding, async url => Response.json(String(url).includes('/bootstrap') ? site : { ...availability(site), siteId: 'foreign' })), /availability/);
});

test('paid preflight requires an explicit matching policy and still verifies availability without mutations', async () => {
  for (const mode of ['direct', 'approval'] as const) {
    const site = makeUnpaidSite(); site.booking = { ...site.booking, payment: 'stripe-deposit', mode }; site.services[0].depositMinor = 14900;
    const binding = { ...local, siteId: site.siteId }, methods: string[] = [];
    const fetcher: typeof fetch = async (url, init) => { methods.push(init?.method ?? 'GET'); return Response.json(String(url).endsWith('/bootstrap') ? site : availability(site)); };
    await assert.rejects(preflight(binding, fetcher), /explicit payment/);
    const result = await preflight(binding, fetcher, { payment: 'stripe-deposit', mode });
    assert.equal(result.payment, 'stripe-deposit'); assert.equal(result.mode, mode); assert.ok(methods.every(method => method === 'GET'));
    await assert.rejects(preflight(binding, fetcher, { payment: 'stripe-deposit', mode: mode === 'direct' ? 'approval' : 'direct' }), /explicit payment/);
  }
});

async function buildFixture(root: string) {
  const repo = join(root, 'repo'), built = join(root, 'built');
  for (const path of runtimeFiles) { await mkdir(dirname(join(repo, path)), { recursive: true }); await writeFile(join(repo, path), '// allowlisted runtime\n'); }
  await mkdir(join(built, '.vite'), { recursive: true }); await mkdir(join(built, 'assets'));
  await writeFile(join(built, 'index.html'), '<script src="/assets/index-abcdefgh.js"></script>');
  await writeFile(join(built, 'assets/index-abcdefgh.js'), 'console.log("public");');
  await writeFile(join(built, '.vite/manifest.json'), JSON.stringify({ 'index.html': { file: 'assets/index-abcdefgh.js' } }));
  await writeFile(join(repo, '.env'), 'SECRET=do-not-copy'); await mkdir(join(repo, '.git'));
  await mkdir(join(repo, 'tests')); await writeFile(join(repo, 'tests/private.txt'), 'private-test-data');
  return { repo, built };
}

test('artifact allowlist copies only runtime + manifested build, verifies hash and rejects hidden or empty additions', async () => temporary(async root => {
  const { repo, built } = await buildFixture(root), stage = join(root, 'upload');
  const first = await stageBuiltArtifact(repo, built, stage);
  assert.equal(first.manifest.files.length, 8);
  assert.ok(first.manifest.files.every(file => !/\.env|\.git|tests|preview|\.map$/.test(file.path)));
  assert.equal((await inspectArtifact(stage)).manifestSha256, first.manifestSha256);
  await mkdir(join(stage, '.git'));
  await assert.rejects(inspectArtifact(stage), /unlisted directory/); await rm(join(stage, '.git'), { recursive: true });
  await writeFile(join(stage, '.env'), 'secret');
  await assert.rejects(inspectArtifact(stage), /unlisted files/); await rm(join(stage, '.env'));
  await writeFile(join(stage, 'dist/assets/index-abcdefgh.js'), 'tampered');
  await assert.rejects(inspectArtifact(stage), /differs/);
  await writeFile(join(built, 'assets/index-abcdefgh.js.map'), '{}');
  await assert.rejects(stageBuiltArtifact(repo, built, join(root, 'source-map')), /unlisted output/);
  await rm(join(built, 'assets/index-abcdefgh.js.map'));
  await symlink(join(repo, '.env'), join(built, 'assets/secret-abcdefgh.js'));
  await assert.rejects(stageBuiltArtifact(repo, built, join(root, 'linked-secret')), /symlink/);
  await assert.rejects(stageBuiltArtifact(repo, built, stage), /EEXIST/);
}));

test('build subprocess environment drops credentials and preview opt-ins', () => {
  assert.deepEqual(cleanProcessEnvironment({ PATH: '/bin', VITE_API_KEY: 'private', VITE_STOREFRONT_PREVIEW_MEDIA: 'grooming', STOREFRONT_OWNER_API_TOKEN: 'secret', DENO_DEPLOY_TOKEN: 'secret', NODE_OPTIONS: '--require=evil', HOME: '/private' }), { PATH: '/bin' });
});
