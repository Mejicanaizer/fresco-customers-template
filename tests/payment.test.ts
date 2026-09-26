import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, parseBookingResult } from '../src/lib/contracts.ts';
import { consumeGuestLink, createStorefrontApi, createRequestId, StorefrontError } from '../src/lib/api.ts';
import { assertReceiptContinuity, handoffCheckout, shouldRefreshReceipt } from '../src/lib/payment.ts';
import { createGateway } from '../server/gateway.ts';
import { availability, bookingInput, fixtureOwner, makeSite, makeUnpaidSite, managementToken, receipt, receiptToken } from './fixtures.ts';

test('legacy v1 receipts omit payment status and default optional refund to null', () => {
  for (const site of [makeSite(), makeUnpaidSite()]) {
    const parsed = parseReceipt(receipt(site, site.booking.payment === 'none' ? 'confirmed' : 'awaiting_payment'), site.siteId);
    assert.equal(parsed.paymentStatus, undefined); assert.equal(parsed.refund, null);
  }
});
test('all additive payment statuses preserve quote and strip internal financial details', () => {
  const site = makeSite(); site.services[0].depositMinor = 14900;
  for (const paymentStatus of ['unpaid', 'processing', 'paid', 'refund_pending', 'refunded', 'refund_failed']) {
    const r = receipt(site, 'cancelled');
    const statuses = { refund_pending: 'pending', refunded: 'succeeded', refund_failed: 'failed' };
    const status = statuses[paymentStatus as keyof typeof statuses];
    const parsed = parseReceipt({ ...r, paymentStatus, refund: status ? { status, amountMinor: 14900, currency: 'MXN', stripeFeeMinor: 650, accountId: 'PRIVATE' } : null, paymentAttempt: { accountId: 'PRIVATE' } }, site.siteId);
    assert.equal(parsed.paymentStatus, paymentStatus); assert.equal(parsed.quote.depositMinor, 14900);
    assert.doesNotMatch(JSON.stringify(parsed), /stripeFeeMinor|accountId|PRIVATE|paymentAttempt/);
  }
});
test('refund currency, integer amounts, statuses and full deposit are enforced; fees never shrink guest refund', () => {
  const site = makeSite(), r = { ...receipt(site, 'cancelled'), paymentStatus: 'refund_pending', refund: { status: 'pending', amountMinor: site.services[0].depositMinor, currency: 'MXN' } };
  assert.equal(parseReceipt(r, site.siteId).refund?.amountMinor, r.quote.depositMinor);
  for (const patch of [{ amountMinor: r.quote.depositMinor - 650 }, { amountMinor: r.quote.depositMinor + 1 }, { amountMinor: 0 }, { amountMinor: 12.5 }, { currency: 'USD' }, { status: 'complete' }, { status: 'succeeded' }]) {
    assert.throws(() => parseReceipt({ ...r, refund: { ...r.refund, ...patch } }, site.siteId));
  }
  assert.throws(() => parseReceipt({ ...r, paymentStatus: 'paid' }, site.siteId));
  assert.throws(() => parseReceipt({ ...r, paymentStatus: 'unknown' }, site.siteId));
  assert.throws(() => parseReceipt({ ...receipt(makeUnpaidSite(), 'cancelled'), paymentStatus: 'paid' }, 'grooming'));
});
test('paid approval starts awaiting payment; unpaid approval remains backward compatible', async () => {
  const site = makeSite('grooming'), owner = fixtureOwner(site);
  const gateway = createGateway({ siteId: site.siteId, ownerApiOrigin: 'https://owner.test', publicOrigin: 'https://customer.test' }, async (url, init) => owner.handle(new Request(url, init)));
  const api = createStorefrontApi(async (url, init) => gateway(new Request(new URL(String(url), 'https://customer.test'), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Origin: 'https://customer.test' } })));
  const result = await api.book(site, bookingInput(site), createRequestId(), availability(site).slots[0]);
  assert.equal(result.receipt.state, 'awaiting_payment'); assert.ok(result.receipt.checkout);
  const unpaid = makeUnpaidSite(); unpaid.booking.mode = 'approval';
  const envelope = { contractVersion: 1, siteId: unpaid.siteId, receiptToken: receiptToken(unpaid), managementToken: managementToken(unpaid) };
  assert.equal(parseBookingResult({ ...envelope, receipt: receipt(unpaid, 'pending_approval') }, unpaid.siteId).receipt.state, 'pending_approval');
  assert.throws(() => parseBookingResult({ ...envelope, receipt: receipt(site, 'pending_approval') }, site.siteId));
});
test('paid approval is paid independently of appointment confirmation and checkout is absent', () => {
  const site = makeSite('grooming');
  const r = parseReceipt({ ...receipt(site, 'pending_approval'), paymentStatus: 'paid' }, site.siteId);
  assert.equal(r.state, 'pending_approval'); assert.equal(r.paymentStatus, 'paid'); assert.equal(r.checkout, null);
  assert.equal(shouldRefreshReceipt(r), true);
});
test('progressed first paid create receipts pass gateway and client while preserving the complete original command binding', async () => {
  for (const kind of ['salon', 'grooming'] as const) {
    const site = makeSite(kind);
    const progress = [
      ['payment_processing', 'processing'], ['confirmed', 'paid'], ['expired', 'unpaid'],
      ['cancelled', 'refund_pending'], ['payment_review', 'refund_failed'], ['declined', 'refunded'],
      ...(kind === 'grooming' ? [['pending_approval', 'paid']] : []),
    ] as const;
    for (const [state, paymentStatus] of progress) {
      const r = { ...receipt(site, state as Parameters<typeof receipt>[1]), paymentStatus };
      const response = { contractVersion: 1, siteId: site.siteId, receipt: r, receiptToken: receiptToken(site), managementToken: managementToken(site) };
      const gateway = createGateway({ siteId: site.siteId, publicOrigin: 'https://customer.test', ownerApiOrigin: 'https://owner.test' }, async () => Response.json(response));
      const api = createStorefrontApi(async (url, init) => gateway(new Request(new URL(String(url), 'https://customer.test'), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Origin: 'https://customer.test' } })));
      const value = await api.book(site, bookingInput(site), createRequestId(), availability(site).slots[0]);
      assert.equal(value.receipt.state, state); assert.equal(value.receipt.paymentStatus, paymentStatus);
      assert.equal(value.receipt.checkout, null); assert.equal(value.managementToken, managementToken(site));
    }
  }
});
test('progressed create cannot claim unsupported payment success or change quote, slot or capabilities', async () => {
  const site = makeSite(), r = { ...receipt(site, 'confirmed'), paymentStatus: 'paid' };
  const envelope = { contractVersion: 1, siteId: site.siteId, receiptToken: receiptToken(site), managementToken: managementToken(site) };
  for (const bad of [
    { ...r, paymentStatus: undefined }, { ...r, paymentStatus: 'unpaid' },
    { ...r, state: 'payment_processing', paymentStatus: 'paid' },
    { ...r, state: 'pending_approval' }, { ...r, slotId: 'other-slot' },
    { ...r, quote: { ...r.quote, depositMinor: 1 } }, { ...r, terms: { ...r.terms, text: 'changed' } },
  ]) {
    const api = createStorefrontApi(async () => Response.json({ ...envelope, receipt: bad }));
    await assert.rejects(api.book(site, bookingInput(site), createRequestId(), availability(site).slots[0]), error => error instanceof StorefrontError && error.code === 'invalid_contract' && error.uncertain);
  }
  assert.throws(() => parseBookingResult({ ...envelope, receipt: r, managementToken: receiptToken(site) }, site.siteId));
});
test('handoff uses only authoritative Stripe URL, retaining capability in a local fragment', () => {
  const site = makeSite(), r = receipt(site), steps: unknown[] = [];
  const navigation = { history: { replaceState(a: unknown, b: string, url?: string | URL | null) { steps.push([a, b, url]); } }, location: { pathname: '/', assign(url: string | URL) { steps.push(url); } } };
  handoffCheckout(r, { type: 'manage', token: managementToken(site) }, navigation, 0);
  assert.deepEqual(steps, [[null, '', `/reserva/pago#manage=${managementToken(site)}`], r.checkout!.url]);
  for (const invalid of [{ ...r, checkout: { ...r.checkout!, url: 'https://stripe.com.evil.test/pay' } }, receipt(site, 'confirmed'), { ...r, paymentStatus: 'paid' as const }]) {
    steps.length = 0; assert.throws(() => handoffCheckout(invalid, { type: 'manage', token: managementToken(site) }, navigation, 0)); assert.equal(steps.length, 0);
  }
  assert.throws(() => handoffCheckout(r, { type: 'receipt', token: receiptToken(site) }, navigation, Date.parse(r.checkout!.expiresAt)));
});
test('Stripe return query hints cannot confirm payment; capability is consumed and scrubbed', () => {
  let scrubbed: unknown;
  const history = { replaceState(_a: unknown, _b: string, url?: string | URL | null) { scrubbed = url; } };
  assert.deepEqual(consumeGuestLink({ pathname: '/reserva/pago', hash: `#manage=${managementToken(makeSite())}` }, history), { type: 'manage', token: managementToken(makeSite()) });
  assert.equal(scrubbed, '/reserva/pago');
  assert.equal(consumeGuestLink({ pathname: '/reserva/pago', hash: '' }, history), null);
});
test('status continuity preserves accepted quote/terms/reference and does not downgrade paid status', () => {
  const site = makeSite(), paid = { ...receipt(site, 'confirmed'), paymentStatus: 'paid' as const };
  const cancelled = { ...paid, state: 'cancelled' as const, bookingRevision: 2, paymentStatus: 'refund_pending' as const };
  assert.doesNotThrow(() => assertReceiptContinuity(paid, cancelled));
  for (const next of [{ ...paid, reference: 'foreign' }, { ...paid, branchId: 'foreign' }, { ...paid, quote: { ...paid.quote, depositMinor: 1 } }, { ...paid, terms: { ...paid.terms, text: 'changed' } }, { ...paid, paymentStatus: 'processing' as const }]) assert.throws(() => assertReceiptContinuity(paid, next));
  assert.throws(() => assertReceiptContinuity(cancelled, paid));
});
test('status reads carry capabilities only in POST bodies and accept cancellation', async () => {
  const site = makeSite(), abort = new AbortController();
  const api = createStorefrontApi(async (url, init) => {
    assert.equal(url, '/api/storefront/v1/booking-status'); assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.cache, 'no-store');
    assert.deepEqual(JSON.parse(String(init?.body)), { token: receiptToken(site) });
    abort.abort(); throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(api.status(site, receiptToken(site), abort.signal), e => e instanceof DOMException && e.name === 'AbortError');
});
test('malformed payment status cannot overwrite a receipt', async () => {
  const site = makeSite(), r = receipt(site, 'confirmed');
  const api = createStorefrontApi(async () => Response.json({ ...r, paymentStatus: 'paid_by_redirect' }));
  await assert.rejects(api.status(site, receiptToken(site)), e => e instanceof StorefrontError && e.code === 'invalid_contract');
});

test('embedded receipt accepts only sandbox credentials and never offers a redirect handoff', () => {
  const site = makeSite(), checkout = { mode: 'embedded', clientSecret: 'cs_test_synthetic_secret_synthetic%2Fencoded_part%3D', publishableKey: 'pk_test_' + 'p'.repeat(32), expiresAt: receipt(site).checkout!.expiresAt };
  const parsed = parseReceipt({ ...receipt(site), checkout }, site.siteId);
  assert.equal(parsed.checkout?.mode, 'embedded');
  for (const patch of [{ clientSecret: 'cs_live_synthetic_secret_synthetic' }, { clientSecret: 'cs_test_synthetic_secret_invalid\nvalue' }, { publishableKey: 'pk_live_' + 'p'.repeat(32) }, { url: 'https://checkout.stripe.com/c/pay/synthetic' }, { mode: 'custom' }, { expiresAt: 'not-a-date' }]) {
    assert.throws(() => parseReceipt({ ...receipt(site), checkout: { ...checkout, ...patch } }, site.siteId));
  }
  assert.throws(() => handoffCheckout(parsed, { type: 'receipt', token: receiptToken(site) }, { history: { replaceState() { throw new Error('unexpected navigation'); } }, location: { pathname: '/', assign() { throw new Error('unexpected redirect'); } } }, 0));
});
