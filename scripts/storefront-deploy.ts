import process from 'node:process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { command, cleanProcessEnvironment, prepareArtifact, inspectArtifact, assertExternalStage } from './deployment-artifact.ts';
import { bindingEnvironment, defaultOperatorDirectory, externalOperatorDirectory, initializeOperator, preflight, profileName, readOperator, validateProfile } from './deployment-profiles.ts';
import type { Binding, Context, ExpectedPolicy } from './deployment-profiles.ts';

const help = `Shared customer storefront — local preparation is the default; publication is explicit.
  init <profile> [--operator-dir <absolute path>] [--import-gateway-env]
  validate <profile> [--context local|production] [--operator-dir <path>]
  stage <profile>
  inspect <profile> --stage <external upload directory>
  check <profile> --stage <external upload directory>
  plan <profile> --stage <directory> [--operator-dir <path>]
  run <profile> --stage <directory> --context local [--operator-dir <path>]
  publish <profile> --stage <directory> [--operator-dir <path>]
Profiles: fashion-style, best-in-show-grooming.
Only publish calls Deno Deploy. It does not create apps or upload environment variables.
Production preflight requires a real owner public API and the exact customer HTTPS origin.
validate/plan/run/publish accept --payment none|stripe-deposit and --mode direct|approval.
Defaults remain none/direct. Paid preflight checks public policy only; the owner must verify sandbox Stripe configuration separately.
`;
function options(args: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--operator-dir', '--context', '--stage', '--import-gateway-env', '--payment', '--mode'].includes(key) || key in result) throw new Error('Unknown or duplicate option.');
    if (key === '--import-gateway-env') { result[key] = 'true'; continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Value required for ${key}.`);
    result[key] = value;
  }
  return result;
}
export function deploymentCommand(binding: Binding & { org?: string; app?: string }) {
  if (!binding.org || !binding.app) throw new Error('Explicit Deno org/app are required.');
  return ['deploy', '--org', binding.org, '--app', binding.app, '--prod', '--non-interactive'];
}
export async function main(argv: string[], repository = process.cwd()) {
  if (!argv.length || argv[0] === '--help') { console.log(help); return; }
  const [action, name, ...args] = argv, profile = profileName(name), opts = options(args);
  const allowed: Record<string, string[]> = { init: ['--operator-dir', '--import-gateway-env'], validate: ['--operator-dir', '--context'], stage: [], inspect: ['--stage'], check: ['--stage'], plan: ['--stage', '--operator-dir'], run: ['--stage', '--operator-dir', '--context'], publish: ['--stage', '--operator-dir'] };
  for (const verb of ['validate', 'plan', 'run', 'publish']) allowed[verb].push('--payment', '--mode');
  if (!Object.hasOwn(allowed, action)) throw new Error('Unknown command. Use --help.');
  if (Object.keys(opts).some(key => !allowed[action].includes(key))) throw new Error('Option is not applicable to this command.');
  const privateDirectory = await externalOperatorDirectory(opts['--operator-dir'] ?? defaultOperatorDirectory(), repository);
  if (action === 'init') {
    console.log(`Created private operator profile: ${await initializeOperator(repository, privateDirectory, profile, opts['--import-gateway-env'] ? join(repository, '.env') : undefined)}. Production placeholders remain unconfigured.`); return;
  }
  if (opts['--import-gateway-env']) throw new Error('Gateway env import is allowed only for init.');
  if (action === 'stage') {
    const result = await prepareArtifact(repository);
    console.log(JSON.stringify({ profile, status: 'prepared-only', directory: result.directory, manifestSha256: result.manifestSha256, files: result.manifest.files.map(file => file.path), bytes: result.bytes }, null, 2)); return;
  }
  const stage = opts['--stage'] ? resolve(opts['--stage']) : null;
  if (stage) { await assertExternalStage(stage, repository); await inspectArtifact(stage); }
  if (action === 'inspect') { if (!stage) throw new Error('--stage is required.'); console.log(JSON.stringify(await inspectArtifact(stage), null, 2)); return; }
  if (action === 'check') {
    if (!stage) throw new Error('--stage is required.');
    // Run outside the repository: Deno must not discover package.json and resolve the browser build dependencies.
    await command('deno', ['check', '--no-lock', 'server/deno.ts'], stage, cleanProcessEnvironment()); return;
  }
  const context = opts['--context'] ?? 'production';
  if (!['local', 'production'].includes(context)) throw new Error('Context must be local or production.');
  if (['plan', 'publish'].includes(action) && context !== 'production') throw new Error('Production publication cannot use a local binding. Preview deployment is not enabled.');
  const binding = validateProfile(await readOperator(privateDirectory, profile), profile, context as Context);
  const payment = opts['--payment'] ?? 'none', mode = opts['--mode'] ?? 'direct';
  if (!['none', 'stripe-deposit'].includes(payment) || !['direct', 'approval'].includes(mode)) throw new Error('Expected policy must use payment none|stripe-deposit and mode direct|approval.');
  const checked = await preflight(binding, fetch, { payment, mode } as ExpectedPolicy);
  if (action === 'validate') { console.log(JSON.stringify({ profile, context, status: 'owner-api-verified', ...checked })); return; }
  if (!stage) throw new Error('--stage is required.');
  if (action === 'run') {
    if (context !== 'local') throw new Error('Local runners require --context local.');
    const port = new URL(binding.publicOrigin).port || '80';
    await command('deno', ['run', '--no-config', '--node-modules-dir=none', '--allow-env', '--allow-net', '--allow-read=dist', 'server/deno.ts', '--local'], stage, { ...cleanProcessEnvironment(), ...bindingEnvironment(binding), PORT: port }); return;
  }
  const reviewed = await inspectArtifact(stage), argsForDeploy = deploymentCommand(binding);
  if (action === 'plan') {
    console.log(JSON.stringify({ profile, status: 'not-uploaded', expectedPolicy: { payment, mode }, cwd: stage, executable: 'deno', args: argsForDeploy, manifestSha256: reviewed.manifestSha256, prerequisite: 'Existing local-source app, runtime variables separately configured for its exact origin, authorized publication. No app creation, auth or secrets are handled by this plan.' }, null, 2)); return;
  }
  // Explicit publish only: the caller must have completed the account/runtime publication gate.
  // No private business binding is passed to the upload process or included in the artifact.
  const env = { ...cleanProcessEnvironment(), ...Object.fromEntries(['HOME', 'DENO_DIR', 'DENO_DEPLOY_TOKEN'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : [])) };
  console.log(`Publishing reviewed artifact ${reviewed.manifestSha256} for ${profile}.`);
  await command('deno', argsForDeploy, stage, env);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : 'Deployment operation failed.'); process.exitCode = 1; });
}
