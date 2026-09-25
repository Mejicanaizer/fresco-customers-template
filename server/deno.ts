import process from 'node:process';
import { createServer } from 'node:http';

// Deploy uses this entrypoint without arguments. Local mode is an explicit operator action.
const local = process.argv.slice(2).includes('--local');
if (process.argv.slice(2).some(arg => arg !== '--local') || (local && process.env.DENO_DEPLOY)) {
  throw new Error('Local runtime mode cannot be used on Deno Deploy.');
}
process.env.NODE_ENV = local ? 'development' : 'production';
process.env.HOST = local ? '127.0.0.1' : '0.0.0.0';
process.env.PORT ??= '8000';

const deployed = process.env.DENO_DEPLOY === 'true';
const timeline = process.env.DENO_TIMELINE ?? '';
if (deployed && timeline !== 'production') {
  // Hosted warmup can omit a timeline. Only the verified production timeline may load a binding.
  // Reserved platform metadata only: never log environment contents or private business settings.
  console.log(JSON.stringify({ event: 'storefront_disabled_timeline', timeline: timeline.slice(0, 160) || null }));
  const server = createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end('Storefront preview is unavailable.');
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.PORT), '0.0.0.0', () => console.log('Storefront preview is disabled.'));
} else {
  // Built-in node:* compatibility keeps the existing URL/Host adapter and booking gateway intact.
  await import('./start.ts');
}
