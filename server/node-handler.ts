import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { jsonResponse } from './gateway.ts';

export async function serveApi(req: IncomingMessage, res: ServerResponse, publicOrigin: string, handler: (request: Request) => Promise<Response>) {
  try {
    const expectedHost = new URL(publicOrigin).host;
    // Reverse proxies must preserve the configured public Host. Never trust forwarded hosts.
    if (req.headers.host !== expectedHost || !req.url?.startsWith('/') || req.url.startsWith('//')) {
      const response = jsonResponse(403, { code: 'origin_rejected' });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    const init: RequestInit & { duplex?: string } = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>; init.duplex = 'half'; }
    const response = await handler(new Request(new URL(req.url, publicOrigin), init));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ code: 'upstream_unavailable' }));
  }
}
