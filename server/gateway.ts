import { ContractError, id, localDate, object, parseAvailability, parseBookingInput, parseBookingResult, parseCancelInput, parseGuestBooking, parseReceipt, parseRescheduleInput, parseStorefront, parseTokenInput } from '../src/lib/contracts.ts';

export interface Deployment { siteId: string; ownerApiOrigin: string; publicOrigin: string; ownerApiToken?: string }
export function deploymentFromEnv(env: Record<string, string | undefined>): Deployment | null {
  const values = [env.STOREFRONT_SITE_ID, env.STOREFRONT_OWNER_API_ORIGIN, env.STOREFRONT_PUBLIC_ORIGIN];
  if (values.every(v => !v)) return null;
  if (values.some(v => !v)) throw new Error('All three STOREFRONT deployment settings are required.');
  const origin = (value: string) => {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && loopback && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Deployment endpoints must be HTTPS origins; development permits loopback HTTP.');
    return url.origin;
  };
  const ownerApiToken = env.STOREFRONT_OWNER_API_TOKEN;
  if ((env.NODE_ENV === 'production' && !ownerApiToken) || (ownerApiToken && (!/^[\x21-\x7e]{32,1024}$/.test(ownerApiToken)))) throw new Error('Configure a private deployment-scoped owner API token.');
  return { siteId: id(values[0]), ownerApiOrigin: origin(values[1]!), publicOrigin: origin(values[2]!), ownerApiToken };
}
export const apiPrefix = '/api/storefront/v1/';
/** Compatibility URL for public catalog consumers; never a raw runtime/config dump. */
export const publicConfigPath = '/store.config.json';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function jsonResponse(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Origin' } });
}
class BodyTooLarge extends Error {}
export async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<string> {
  const reader = body?.getReader();
  if (!reader) throw new ContractError();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw new BodyTooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
const ownerErrors: Record<string, number> = {
  not_configured: 503,
  invalid_command: 400, configuration_changed: 409, slot_unavailable: 409,
  idempotency_conflict: 409, rate_limited: 429, link_invalid: 404,
  deadline_passed: 409, payments_unavailable: 503, policy_unconfigured: 409,
};
const parsers = {
  bookings: parseBookingInput, 'booking-status': parseTokenInput, 'guest-booking': parseTokenInput,
  'guest-booking/cancel': parseCancelInput, 'guest-booking/reschedule': parseRescheduleInput,
} as const;
type PostOperation = keyof typeof parsers;

/** Same-origin bridge only. Domain transactions, Stripe and notifications stay upstream. */
export function createGateway(deployment: Deployment | null, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const publicConfig = url.pathname === publicConfigPath;
    if (!publicConfig && !url.pathname.startsWith(apiPrefix)) return jsonResponse(404, { code: 'not_found' });
    if (!deployment) return jsonResponse(503, { code: 'not_configured' });
    // The adapter constructs the URL from the configured origin. Host is separately checked there.
    if (url.origin !== deployment.publicOrigin || (request.headers.has('origin') && request.headers.get('origin') !== deployment.publicOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') return jsonResponse(403, { code: 'origin_rejected' });
    const operation = publicConfig ? 'bootstrap' : url.pathname.slice(apiPrefix.length);
    const isRead = operation === 'bootstrap' || operation === 'availability';
    if (!(isRead ? request.method === 'GET' : Object.hasOwn(parsers, operation) && request.method === 'POST')) return jsonResponse(404, { code: 'not_found' });
    if (!isRead && request.headers.get('origin') !== deployment.publicOrigin) return jsonResponse(403, { code: 'origin_rejected' });
    const target = new URL(`/api/public/storefront/v1/${operation}`, deployment.ownerApiOrigin);
    const headers = new Headers({ Accept: 'application/json', 'X-Fresco-Site': deployment.siteId });
    if (deployment.ownerApiToken) headers.set('Authorization', `Bearer ${deployment.ownerApiToken}`);
    let command: ReturnType<typeof parsers[PostOperation]> | undefined;
    let serviceId = '', date = '';
    try {
      if (operation === 'availability') {
        const keys = [...url.searchParams.keys()];
        if (keys.length !== 2 || !keys.includes('serviceId') || !keys.includes('date')) throw new ContractError();
        serviceId = id(url.searchParams.get('serviceId')); date = localDate(url.searchParams.get('date'));
        target.search = new URLSearchParams({ serviceId, date }).toString();
      } else if (url.search) throw new ContractError();
      if (!isRead) {
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ContractError();
        const mutates = ['bookings', 'guest-booking/cancel', 'guest-booking/reschedule'].includes(operation);
        if (mutates) {
          const key = request.headers.get('idempotency-key') ?? '';
          if (!uuid.test(key)) throw new ContractError();
          headers.set('Idempotency-Key', key);
        }
        command = parsers[operation as PostOperation](JSON.parse(await readLimited(request.body, 16_384)));
        headers.set('Content-Type', 'application/json');
      }
    } catch (error) { return jsonResponse(error instanceof BodyTooLarge ? 413 : 400, { code: 'invalid_command' }); }
    try {
      const upstream = await fetcher(target, { method: request.method, headers, body: command ? JSON.stringify(command) : undefined, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (upstream.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') { await upstream.body?.cancel(); return jsonResponse(502, { code: 'invalid_contract' }); }
      const data: unknown = JSON.parse(await readLimited(upstream.body, 1_048_576));
      if (!upstream.ok) {
        // Strip internal messages, tokens and provider diagnostics even on a bound response.
        const code = object(data).code;
        const status = typeof code === 'string' ? ownerErrors[code] : undefined;
        if (status && upstream.status === status) return jsonResponse(status, { code });
        return jsonResponse(503, { code: 'upstream_unavailable' });
      }
      let projected: unknown;
      switch (operation) {
        case 'bootstrap': projected = parseStorefront(data, deployment.siteId); break;
        case 'availability': projected = parseAvailability(data, deployment.siteId, serviceId, date); break;
        case 'bookings': {
          const result = parseBookingResult(data, deployment.siteId), input = parseBookingInput(command);
          const wrongState = result.receipt.payment === 'none'
            ? result.receipt.state !== (input.expectedMode === 'direct' ? 'confirmed' : 'pending_approval')
            : input.expectedMode === 'direct' && result.receipt.state === 'pending_approval';
          if (result.receipt.serviceId !== input.serviceId || result.receipt.slotId !== input.slotId || wrongState) throw new ContractError();
          projected = { contractVersion: 1, siteId: deployment.siteId, ...result }; break;
        }
        case 'booking-status': projected = parseReceipt(data, deployment.siteId); break;
        case 'guest-booking': projected = { contractVersion: 1, siteId: deployment.siteId, ...parseGuestBooking(data, deployment.siteId) }; break;
        case 'guest-booking/cancel': {
          const result = parseGuestBooking(data, deployment.siteId), input = parseCancelInput(command);
          if (result.receipt.state !== 'cancelled' || result.receipt.bookingRevision <= input.bookingRevision) throw new ContractError();
          projected = { contractVersion: 1, siteId: deployment.siteId, ...result }; break;
        }
        case 'guest-booking/reschedule': {
          const result = parseGuestBooking(data, deployment.siteId), input = parseRescheduleInput(command);
          if (result.receipt.slotId !== input.slotId || result.receipt.bookingRevision <= input.bookingRevision || result.receipt.state !== 'confirmed') throw new ContractError();
          projected = { contractVersion: 1, siteId: deployment.siteId, ...result }; break;
        }
      }
      return jsonResponse(200, projected);
    } catch (error) {
      if (error instanceof ContractError || error instanceof BodyTooLarge || error instanceof SyntaxError || error instanceof RangeError) return jsonResponse(502, { code: 'invalid_contract' });
      return jsonResponse(503, { code: 'upstream_unavailable' });
    }
  };
}
