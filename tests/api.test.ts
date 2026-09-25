import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingAttempt, consumeGuestLink, createRequestId, createStorefrontApi, StorefrontError } from '../src/lib/api.ts';
import { createGateway } from '../server/gateway.ts';
import { availability, bookingInput, fixtureOwner, makeSite, makeUnpaidSite, managementToken, receipt, receiptToken } from './fixtures.ts';

const site = makeSite();
const binding = { siteId: site.siteId, publicOrigin: 'https://salon.test', ownerApiOrigin: 'https://owner.test' };
function client(gateway: ReturnType<typeof createGateway>) {
  return createStorefrontApi(async (url, init) => gateway(new Request(new URL(String(url), binding.publicOrigin), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...(init?.method === 'POST' ? { Origin: binding.publicOrigin } : {}) } })));
}
test('secure UUID fallback and unavailable crypto produce an explicit recoverable error', () => {
  let calls = 0;
  const id = createRequestId({ getRandomValues(bytes) { calls++; return bytes.fill(255); } });
  assert.equal(id, 'ffffffff-ffff-4fff-bfff-ffffffffffff'); assert.equal(calls, 1);
  assert.throws(() => createRequestId({}), (error: unknown) => error instanceof StorefrontError && error.code === 'secure_context_required' && !error.uncertain);
  assert.throws(() => createRequestId({ randomUUID() { throw new Error(); }, getRandomValues() { throw new Error(); } }), (error: unknown) => error instanceof StorefrontError && !error.uncertain);
});
test('same payload keeps idempotency key; a deliberately changed rejected command gets a new key', () => {
  const first = bookingAttempt(null, bookingInput());
  assert.equal(bookingAttempt(first, bookingInput()), first);
  assert.notEqual(bookingAttempt(first, { ...bookingInput(), notes: 'new' }).key, first.key);
});
test('lost create response replays original receipt even after progress, then status returns progress', async () => {
  const owner = fixtureOwner(site); let loseFirst = true;
  const gateway = createGateway(binding, async (url, init) => {
    const response = await owner.handle(new Request(url, init));
    if (String(url).endsWith('/bookings') && loseFirst) { loseFirst = false; throw new TypeError('simulated network failure'); }
    return response;
  });
  const api = client(gateway), input = bookingInput(site), key = createRequestId(), slot = availability(site).slots[0];
  await assert.rejects(api.book(site, input, key, slot), (error: unknown) => error instanceof StorefrontError && error.uncertain);
  owner.progress('confirmed');
  const result = await api.book(site, input, key, slot);
  assert.equal(result.receipt.state, 'awaiting_payment'); assert.equal(owner.writes, 1);
  assert.equal((await api.status(site, result.receiptToken)).state, 'confirmed');
});
test('explicit no-write rejection differs from an ambiguous transport error', async () => {
  for (const [code, status, uncertain] of [['not_configured', 503, false], ['payments_unavailable', 503, false], ['slot_unavailable', 409, false], ['upstream_unavailable', 503, true]] as const) {
    const api = createStorefrontApi(async () => Response.json({ code }, { status }));
    await assert.rejects(api.book(site, bookingInput(), createRequestId(), availability(site).slots[0]), (error: unknown) => error instanceof StorefrontError && error.uncertain === uncertain);
  }
});
test('grooming capability requires one valid pet before client submission', async () => {
  const site = makeSite('grooming'); let calls = 0;
  const api = createStorefrontApi(async () => { calls++; throw new Error(); });
  await assert.rejects(api.book(site, { ...bookingInput(site), pet: null }, createRequestId(), availability(site).slots[0]));
  await assert.rejects(api.book(site, { ...bookingInput(site), pet: { ...bookingInput(site).pet!, sizeId: 'unpublished' } }, createRequestId(), availability(site).slots[0]));
  assert.equal(calls, 0);
});
test('create response must match chosen provider, branch, time, service, price, deposit and accepted terms', async () => {
  const valid = receipt(site);
  for (const bad of [{ ...valid, providerId: 'other' }, { ...valid, branchId: 'other' }, { ...valid, startsAt: '2030-06-12T14:59:00Z' }, { ...valid, serviceId: 'other' }, { ...valid, quote: { ...valid.quote, depositMinor: 1 } }, { ...valid, terms: { version: 'changed', text: 'Different terms' } }]) {
    const api = createStorefrontApi(async () => Response.json({ contractVersion: 1, siteId: site.siteId, receipt: bad, receiptToken: receiptToken(site), managementToken: managementToken(site) }));
    await assert.rejects(api.book(site, bookingInput(site), createRequestId(), availability(site).slots[0]), (error: unknown) => error instanceof StorefrontError && error.uncertain);
  }
});
test('existing booking keeps its accepted terms after owner publishes new settings', async () => {
  const owner = fixtureOwner(site), api = client(createGateway(binding, async (url, init) => owner.handle(new Request(url, init))));
  const changed = { ...site, booking: { ...site.booking, depositTerms: 'NEW TERMS', depositTermsVersion: 'terms-v2' } };
  const result = await api.guest(changed, managementToken(site));
  assert.equal(result.receipt.terms.text, site.booking.depositTerms); assert.notEqual(result.receipt.terms.text, changed.booking.depositTerms);
});
test('fragment capabilities scrub immediately; malformed links fail without exposing token', () => {
  const urls: unknown[] = [], history = { replaceState(_a: unknown, _b: string, url?: string | URL | null) { urls.push(url); } };
  const link = consumeGuestLink({ hash: `#manage=${managementToken(site)}`, pathname: '/reserva' }, history);
  assert.equal(link?.type, 'manage'); assert.deepEqual(urls, ['/reserva']);
  assert.throws(() => consumeGuestLink({ hash: '#manage=SECRET_TOO_SHORT&siteId=other', pathname: '/reserva' }, history), (e: unknown) => e instanceof Error && !e.message.includes('SECRET'));
});
test('unpaid direct create confirms and exposes independent management capability; replay after cancellation keeps original result', async () => {
  const site = makeUnpaidSite(), owner = fixtureOwner(site);
  const api = client(createGateway({ ...binding, siteId: site.siteId }, async (url, init) => owner.handle(new Request(url, init))));
  const key = createRequestId(), input = bookingInput(site), slot = availability(site).slots[0];
  const result = await api.book(site, input, key, slot);
  assert.equal(result.receipt.state, 'confirmed');
  assert.equal(result.receipt.payment, 'none');
  assert.equal(result.receipt.checkout, null);
  assert.equal(result.receipt.notification, 'unconfigured');
  const managed = await api.guest(site, result.managementToken);
  const cancelled = await api.cancel(site, result.managementToken, managed.receipt, createRequestId());
  assert.equal(cancelled.receipt.state, 'cancelled');
  assert.deepEqual(await api.book(site, input, key, slot), result);
  assert.equal((await api.status(site, result.receiptToken)).state, 'cancelled');
  assert.equal(owner.writes, 2);
});
test('a response cannot silently change the published payment mode', async () => {
  const site = makeUnpaidSite();
  const foreign = { ...receipt(site, 'confirmed'), payment: 'stripe-deposit', state: 'awaiting_payment', quote: { ...receipt(site, 'confirmed').quote, depositMinor: 100 }, checkout: receipt(makeSite()).checkout };
  const api = createStorefrontApi(async () => Response.json({ contractVersion: 1, siteId: site.siteId, receipt: foreign, receiptToken: receiptToken(site), managementToken: managementToken(site) }));
  await assert.rejects(api.book(site, bookingInput(site), createRequestId(), availability(site).slots[0]), (error: unknown) => error instanceof StorefrontError && error.uncertain);
});
test('equivalent SQL timestamp offsets preserve the selected appointment instant', async () => {
  const site = makeUnpaidSite(), valid = receipt(site, 'confirmed');
  const equivalent = { ...valid, startsAt: '2030-06-12T00:00:00-04:00', endsAt: '2030-06-12T01:00:00-04:00' };
  const api = createStorefrontApi(async () => Response.json({ contractVersion: 1, siteId: site.siteId, receipt: equivalent, receiptToken: receiptToken(site), managementToken: managementToken(site) }));
  assert.equal((await api.book(site, bookingInput(site), createRequestId(), availability(site).slots[0])).receipt.reference, valid.reference);
});
