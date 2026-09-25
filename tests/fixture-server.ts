/** Local test process only; not imported by production, not an owner implementation. */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { fixtureOwner, makeSite, makeUnpaidSite } from './fixtures.ts';

if (process.env.STOREFRONT_TEST_FIXTURES !== '1') throw new Error('Synthetic fixtures require STOREFRONT_TEST_FIXTURES=1.');
for (const [kind, port] of [['salon', 5491], ['grooming', 5492]] as const) {
  let owner = fixtureOwner(makeSite(kind));
  createServer(async (req, res) => {
    if (req.url === '/health') { res.end('Synthetic owner fixture'); return; }
    if (req.url === '/__test/reset' && req.method === 'POST') { owner = fixtureOwner(makeSite(kind)); res.end('reset'); return; }
    if (req.url === '/__test/unpaid' && req.method === 'POST' && kind === 'grooming') { owner = fixtureOwner(makeUnpaidSite()); res.end('reset'); return; }
    if (req.url === '/__test/writes') { res.end(String(owner.writes)); return; }
    try {
      const init: RequestInit & { duplex?: string } = { method: req.method, headers: req.headers as Record<string, string> };
      if (req.method === 'POST') { init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>; init.duplex = 'half'; }
      const response = await owner.handle(new Request(`http://127.0.0.1:${port}${req.url}`, init));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } catch { res.writeHead(400); res.end('{}'); }
  }).listen(port, '127.0.0.1');
}
