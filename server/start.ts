import { createServer } from 'node:http';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createGateway, deploymentFromEnv } from './gateway.ts';
import { serveApi } from './node-handler.ts';

const deployment = deploymentFromEnv(process.env);
if (!deployment) throw new Error('Configure STOREFRONT_SITE_ID, STOREFRONT_OWNER_API_ORIGIN and STOREFRONT_PUBLIC_ORIGIN.');
const gateway = createGateway(deployment);
const root = resolve('dist');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) { await serveApi(req, res, deployment.publicOrigin, gateway); return; }
  if (req.headers.host !== new URL(deployment.publicOrigin).host) { res.writeHead(403); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  try {
    const path = decodeURIComponent(new URL(req.url ?? '/', deployment.publicOrigin).pathname);
    const isPage = ['/', '/reserva', '/reserva/pago'].includes(path);
    const file = isPage ? resolve(root, 'index.html') : resolve(root, `.${path}`);
    // Only the built asset directory and known pages are exposed, never .env/source files.
    if (!isPage && (!path.startsWith('/assets/') || !file.startsWith(resolve(root, 'assets') + sep))) throw new Error('not_found');
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': isPage ? 'no-store' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('Not found'); }
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 5373), process.env.HOST ?? '127.0.0.1', () => console.log(`Storefront listening on port ${process.env.PORT ?? 5373}`));
