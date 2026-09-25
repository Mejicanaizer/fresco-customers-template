import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

export const runtimeFiles = ['server/deno.ts', 'server/start.ts', 'server/node-handler.ts', 'server/gateway.ts', 'src/lib/contracts.ts'] as const;
export const deployConfig = { nodeModulesDir: 'none', lock: false, deploy: { runtime: { type: 'dynamic', entrypoint: 'server/deno.ts' } } };
const assetPath = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.(?:js|css|svg|png|jpe?g|webp|avif|woff2?|ico)$/;
const manifestName = 'release-manifest.json';
interface Entry { path: string; bytes: number; sha256: string }
export interface ReleaseManifest { format: 1; files: Entry[] }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function cleanProcessEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Build tools receive no VITE_*, business credentials, app secrets, or deploy auth.
  return Object.fromEntries(['PATH', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap(key => env[key] ? [[key, env[key]]] : []));
}
export async function command(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', () => reject(new Error('Unable to start the requested local command.')));
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Local command failed (exit ${code ?? 'signal'}).`)));
  });
}
export async function regularFile(root: string, path: string): Promise<Buffer> {
  if (!path || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid allowlist path.');
  const canonicalRoot = await realpath(root);
  let at = canonicalRoot;
  for (const part of path.split('/')) {
    at = join(at, part);
    const stat = await lstat(at);
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected in allowlisted path: ${path}`);
  }
  const stat = await lstat(at);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error(`Invalid artifact file: ${path}`);
  return await readFile(at);
}
async function walk(root: string, directories: Set<string>, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Artifact contains a symlink.');
    if (entry.isDirectory()) {
      if (!directories.has(path)) throw new Error('Artifact contains an unlisted directory.');
      result.push(...await walk(root, directories, path));
    }
    else if (entry.isFile()) result.push(path);
    else throw new Error('Artifact contains a nonregular file.');
  }
  return result.sort();
}
function allowedReleaseFile(path: string) {
  return (runtimeFiles as readonly string[]).includes(path) || path === 'deno.json' || path === 'dist/index.html' || (path.startsWith('dist/') && assetPath.test(path.slice(5)));
}
export async function stageBuiltArtifact(repository: string, built: string, destination: string) {
  const root = await canonicalExternalPath(destination, repository);
  // A stage is a new, dedicated directory; never clean or reuse a user-selected directory.
  await mkdir(root, { mode: 0o700 });
  try {
    const vite = JSON.parse((await regularFile(built, '.vite/manifest.json')).toString()) as Record<string, { file: string; css?: string[]; assets?: string[] }>;
    const assets = [...new Set(Object.values(vite).flatMap(entry => [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]))].sort();
    if (!assets.length || assets.some(path => !assetPath.test(path))) throw new Error('Build manifest includes a file outside the asset allowlist.');
    const expectedBuildFiles = ['index.html', '.vite/manifest.json', ...assets].sort();
    if (JSON.stringify(await walk(built, new Set(['.vite', 'assets']))) !== JSON.stringify(expectedBuildFiles)) throw new Error('Build contains unlisted output, private artifacts or source maps.');
    const files: Entry[] = [];
    const put = async (path: string, bytes: Buffer) => {
      if (!allowedReleaseFile(path)) throw new Error('File is outside the explicit release allowlist.');
      await mkdir(dirname(join(root, path)), { recursive: true, mode: 0o700 });
      await writeFile(join(root, path), bytes, { flag: 'wx', mode: 0o600 });
      files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    };
    for (const path of runtimeFiles) await put(path, await regularFile(repository, path));
    await put('deno.json', Buffer.from(`${JSON.stringify(deployConfig, null, 2)}\n`));
    await put('dist/index.html', await regularFile(built, 'index.html'));
    for (const path of assets) await put(`dist/${path}`, await regularFile(built, path));
    const manifest: ReleaseManifest = { format: 1, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
    await writeFile(join(root, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { directory: root, ...await inspectArtifact(root) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
export async function inspectArtifact(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Release must be a regular staging directory.');
  const bytes = await regularFile(directory, manifestName);
  let manifest: ReleaseManifest;
  try { manifest = JSON.parse(bytes.toString()); } catch { throw new Error('Invalid release manifest.'); }
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid release manifest.');
  const names = manifest.files.map(entry => entry.path);
  if (new Set(names).size !== names.length || names.some(path => !allowedReleaseFile(path)) || [...runtimeFiles, 'deno.json', 'dist/index.html'].some(path => !names.includes(path))) throw new Error('Release manifest violates the explicit allowlist.');
  if (JSON.stringify(await walk(directory, new Set(['server', 'src', 'src/lib', 'dist', 'dist/assets']))) !== JSON.stringify([...names, manifestName].sort())) throw new Error('Release contains unlisted files. Do not upload it.');
  for (const entry of manifest.files) {
    const content = await regularFile(directory, entry.path);
    if (content.length !== entry.bytes || digest(content) !== entry.sha256) throw new Error('Release file differs from its reviewed manifest. Do not upload it.');
  }
  if (JSON.stringify(JSON.parse((await regularFile(directory, 'deno.json')).toString())) !== JSON.stringify(deployConfig)) throw new Error('Unexpected Deploy configuration.');
  return { manifest, manifestSha256: digest(bytes), bytes: manifest.files.reduce((sum, entry) => sum + entry.bytes, 0) };
}
export async function prepareArtifact(repository: string) {
  const work = await mkdtemp(join(tmpdir(), 'fresco-storefront-build-'));
  try {
    const env = cleanProcessEnvironment();
    await command(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '--noEmit'], repository, env);
    const built = join(work, 'dist');
    await command(process.execPath, [join(repository, 'scripts/build-release.mjs'), built], repository, env);
    const parent = await mkdtemp(join(tmpdir(), 'fresco-storefront-release-'));
    return await stageBuiltArtifact(repository, built, join(parent, 'upload'));
  } finally { await rm(work, { recursive: true, force: true }); }
}
export async function canonicalExternalPath(directory: string, repository: string) {
  const root = await realpath(repository), missing: string[] = [];
  let path = resolve(directory);
  // Resolve existing parents too, so an outside symlink cannot put private data or an upload inside the repo.
  while (true) {
    try { path = await realpath(path); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
      missing.unshift(basename(path)); path = dirname(path);
    }
  }
  path = join(path, ...missing);
  if (path === root || path.startsWith(root + sep)) throw new Error('Private configuration and upload staging must stay outside the repository.');
  return path;
}
export async function assertExternalStage(directory: string, repository: string) {
  await canonicalExternalPath(directory, repository);
}
