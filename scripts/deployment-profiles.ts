import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { deploymentFromEnv, readLimited } from '../server/gateway.ts';
import type { Deployment } from '../server/gateway.ts';
import { parseAvailability, parseStorefront } from '../src/lib/contracts.ts';
import { canonicalExternalPath } from './deployment-artifact.ts';

export const profiles = ['fashion-style', 'best-in-show-grooming'] as const;
export type Profile = typeof profiles[number];
export type Context = 'local' | 'production';
export type Binding = Deployment & { ownerApiToken: string };
export interface OperatorProfile { version: 1; profile: Profile; local: Binding; production: Binding & { org: string; app: string } }
const fields = ['siteId', 'ownerApiOrigin', 'publicOrigin', 'ownerApiToken'];
export function profileName(value: string): Profile {
  if (!profiles.includes(value as Profile)) throw new Error('Select fashion-style or best-in-show-grooming.');
  return value as Profile;
}
export function defaultOperatorDirectory() { return join(homedir(), '.config', 'fresco', 'customer-storefronts'); }
export async function externalOperatorDirectory(directory: string, repository: string) {
  return canonicalExternalPath(directory, repository);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid operator configuration.');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) throw new Error('Unexpected or missing operator configuration fields.');
}
function resolvedText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || /replace|unconfigured|change_me|\.invalid\b/i.test(value)) throw new Error(`Configure ${label}; placeholder values are not usable.`);
  return value;
}
export function validateProfile(input: unknown, name: Profile, context: Context): Binding & { org?: string; app?: string } {
  const config = record(input); exact(config, ['version', 'profile', 'local', 'production']);
  if (config.version !== 1 || config.profile !== name) throw new Error('Operator profile identity does not match the selected profile.');
  const selected = record(config[context]); exact(selected, context === 'production' ? [...fields, 'org', 'app'] : fields);
  const values = Object.fromEntries(fields.map(key => [key, resolvedText(selected[key], key)]));
  let deployment: Deployment | null;
  try { deployment = deploymentFromEnv({ NODE_ENV: context === 'production' ? 'production' : 'development', STOREFRONT_SITE_ID: values.siteId, STOREFRONT_OWNER_API_ORIGIN: values.ownerApiOrigin, STOREFRONT_PUBLIC_ORIGIN: values.publicOrigin, STOREFRONT_OWNER_API_TOKEN: values.ownerApiToken }); }
  catch { throw new Error('Invalid binding. Check site ID, exact origins and private admission token; no values were logged.'); }
  if (!deployment?.ownerApiToken) throw new Error('The private gateway admission token is required.');
  const publicURL = new URL(deployment.publicOrigin), ownerURL = new URL(deployment.ownerApiOrigin);
  if (context === 'local' && (![publicURL, ownerURL].every(url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) || publicURL.protocol !== 'http:')) throw new Error('Local profiles require loopback endpoints and an HTTP public origin.');
  if (context === 'production' && [publicURL, ownerURL].some(url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.test') || url.hostname.endsWith('.localhost'))) throw new Error('Production requires real public HTTPS origins.');
  if (deployment.publicOrigin === deployment.ownerApiOrigin) throw new Error('Customer and owner origins must be distinct.');
  const binding = { ...deployment, ownerApiToken: deployment.ownerApiToken };
  if (context === 'local') return binding;
  const org = resolvedText(selected.org, 'Deno organization'), app = resolvedText(selected.app, 'Deno app');
  if (![org, app].every(value => /^[a-z0-9][a-z0-9-]{0,62}$/.test(value))) throw new Error('Deno org/app must be explicit slugs.');
  return { ...binding, org, app };
}
export function bindingEnvironment(binding: Binding): Record<string, string> {
  return { STOREFRONT_SITE_ID: binding.siteId, STOREFRONT_OWNER_API_ORIGIN: binding.ownerApiOrigin, STOREFRONT_PUBLIC_ORIGIN: binding.publicOrigin, STOREFRONT_OWNER_API_TOKEN: binding.ownerApiToken };
}
export async function readOperator(directory: string, name: Profile): Promise<unknown> {
  const parent = await lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077)) throw new Error('Operator directory must be private (mode0700) and not a symbolic link.');
  const file = join(directory, `${name}.json`), stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Operator profile must be a regular private file (mode0600).');
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Unable to read operator JSON. No private values were logged.'); }
}
export async function initializeOperator(repository: string, directory: string, name: Profile, gatewayEnvFile?: string) {
  await externalOperatorDirectory(directory, repository);
  const config = JSON.parse(await readFile(join(repository, 'deploy', 'profiles', `${name}.example.json`), 'utf8')) as OperatorProfile;
  if (gatewayEnvFile) {
    if (name !== 'best-in-show-grooming') throw new Error('Only the approved Grooming gateway .env may initialize a local binding.');
    if (resolve(gatewayEnvFile) !== resolve(repository, '.env')) throw new Error('Import only this customer gateway .env, never the owner runtime or capability-secret file.');
    const stat = await lstat(gatewayEnvFile);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Gateway env import requires a private regular file.');
    const values = parseEnv(await readFile(gatewayEnvFile, 'utf8'));
    // Deliberate key allowlist: capability secrets and unrelated configuration are never copied.
    config.local = { siteId: values.STOREFRONT_SITE_ID ?? '', ownerApiOrigin: values.STOREFRONT_OWNER_API_ORIGIN ?? '', publicOrigin: values.STOREFRONT_PUBLIC_ORIGIN ?? '', ownerApiToken: values.STOREFRONT_OWNER_API_TOKEN ?? '' };
    if (config.local.siteId !== 'best-in-show-grooming') throw new Error('This is not the approved Grooming gateway binding.');
    validateProfile(config, name, 'local');
  }
  if (!isAbsolute(directory)) throw new Error('Operator directory must be absolute.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Operator directory must not be a symbolic link.');
  await chmod(directory, 0o700);
  const file = join(directory, `${name}.json`);
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return file;
}
export interface ExpectedPolicy { payment: 'none' | 'stripe-deposit'; mode: 'direct' | 'approval' }
export async function preflight(binding: Binding, fetcher: typeof fetch = fetch, expected: ExpectedPolicy = { payment: 'none', mode: 'direct' }) {
  if (!['none', 'stripe-deposit'].includes(expected.payment) || !['direct', 'approval'].includes(expected.mode)) throw new Error('Unknown expected booking policy. No upload is permitted.');
  const read = async (path: string) => {
    let response: Response;
    try { response = await fetcher(new URL(`/api/public/storefront/v1/${path}`, binding.ownerApiOrigin), { headers: { Accept: 'application/json', Authorization: `Bearer ${binding.ownerApiToken}`, 'X-Fresco-Site': binding.siteId, Origin: binding.publicOrigin }, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Owner API could not be reached. No upload is permitted.'); }
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'application/json') { await response.body?.cancel(); throw new Error('Owner public guest API is unavailable or rejects this binding. No upload is permitted.'); }
    try { return JSON.parse(await readLimited(response.body, 1_048_576)); } catch { throw new Error('Owner returned an invalid public response. No upload is permitted.'); }
  };
  let site;
  try { site = parseStorefront(await read('bootstrap'), binding.siteId); }
  catch { throw new Error('Owner bootstrap failed contract or site-identity validation. No upload is permitted.'); }
  if (!site.booking.ready || site.booking.mode !== expected.mode || site.booking.payment !== expected.payment || site.booking.notifications !== 'none' || !site.services.length) throw new Error('This milestone requires a ready catalog matching the explicit payment/booking policy with notifications disabled. No upload is permitted.');
  const service = site.services[0];
  try { parseAvailability(await read(`availability?${new URLSearchParams({ serviceId: service.id, date: site.booking.firstDate })}`), site.siteId, service.id, site.booking.firstDate, site); }
  catch { throw new Error('Owner availability failed public contract validation. No upload is permitted.'); }
  return { siteId: site.siteId, revision: site.revision, services: site.services.length, mode: site.booking.mode, payment: site.booking.payment, notifications: site.booking.notifications };
}
