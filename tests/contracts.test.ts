import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStorefront, parseAvailability, parseBookingInput, parseBookingResult, parseReceipt, parseGuestBooking, parseCancelInput, stripeUrl, dateInZone } from '../src/lib/contracts.ts';
import { availability, bookingInput, makeSite, makeUnpaidSite, managementToken, receipt, receiptToken } from './fixtures.ts';

test('two runtime catalogs retain independent binding, branding, rules and prices', () => {
  for (const kind of ['salon', 'grooming'] as const) {
    const site = makeSite(kind);
    assert.deepEqual(parseStorefront(site, kind), site);
    assert.throws(() => parseStorefront(site, kind === 'salon' ? 'grooming' : 'salon'));
  }
});
test('all public projections strip nested private data', () => {
  const site = makeSite();
  const parsed = parseStorefront({ ...site, clients: ['PRIVATE'], branch: { ...site.branch, apiKey: 'PRIVATE' }, services: [{ ...site.services[0], cost: 'PRIVATE' }] });
  assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE/);
  const a = availability(site); assert.doesNotMatch(JSON.stringify(parseAvailability({ ...a, petPhotos: ['PRIVATE'], slots: [{ ...a.slots[0], staffPhone: 'PRIVATE' }] }, site.siteId, a.serviceId, a.date, site)), /PRIVATE/);
  assert.doesNotMatch(JSON.stringify(parseReceipt({ ...receipt(site), guest: { name: 'PRIVATE' }, quote: { ...receipt(site).quote, stripeSecret: 'PRIVATE' } }, site.siteId)), /PRIVATE/);
});
test('missing configuration, inconsistent readiness and incompatible contracts fail closed', () => {
  const site = makeSite();
  for (const value of [null, {}, { ...site, contractVersion: 2 }, { ...site, booking: { ...site.booking, guestOnly: false } }, { ...site, booking: { ...site.booking, changeDeadlineHours: 12 } }, { ...site, booking: { ...site.booking, ready: false } }, { ...site, services: [{ ...site.services[0], depositMinor: null }] }, { ...site, theme: { accent: '#ffffff', accentText: '#ffffff' } }]) assert.throws(() => parseStorefront(value));
  const unavailable = { ...site, booking: { ...site.booking, ready: false, unavailableReasons: ['deposit_not_configured'] }, services: [{ ...site.services[0], depositMinor: null }] };
  assert.equal(parseStorefront(unavailable).booking.ready, false);
});
test('availability validates site/service/date/revision/branch and local calendar', () => {
  const site = makeSite('grooming'), data = availability(site);
  assert.equal(parseAvailability(data, site.siteId, data.serviceId, data.date, site).slots[0].startsAt, '2030-06-12T04:00:00Z');
  for (const value of [{ ...data, siteId: 'salon' }, { ...data, serviceId: 'foreign' }, { ...data, date: '2030-06-13' }, { ...data, revision: 1 }, { ...data, branchId: 'foreign' }, { ...data, slots: [data.slots[0], data.slots[0]] }, { ...data, slots: [{ ...data.slots[0], startsAt: '2030-06-12T03:59:00Z' }] }]) assert.throws(() => parseAvailability(value, site.siteId, data.serviceId, data.date, site));
  assert.equal(dateInZone('2030-06-12T03:59:00Z', site.branch.timeZone), '2030-06-11');
});
test('invalid and timezone-free instants and impossible calendar dates fail', () => {
  const site = makeSite(), data = availability(site);
  for (const startsAt of ['2030-02-30T15:00:00Z', '2030-06-12T15:00:00', 'not-a-time']) assert.throws(() => parseAvailability({ ...data, slots: [{ ...data.slots[0], startsAt }] }, site.siteId, data.serviceId, data.date, site));
});
test('grooming permits a non-grid service ending at following local midnight and checks duration', () => {
  const site = makeSite('grooming'); site.services[0].durationMinutes = 37;
  const data = availability(site);
  data.slots[0] = { ...data.slots[0], startsAt: '2030-06-13T03:23:00Z', endsAt: '2030-06-13T04:00:00Z' };
  assert.equal(parseAvailability(data, site.siteId, data.serviceId, data.date, site).slots.length, 1);
  data.slots[0].endsAt = '2030-06-13T04:01:00Z';
  assert.throws(() => parseAvailability(data, site.siteId, data.serviceId, data.date, site));
});
test('guest names normalize to owner 2–120 constraint; no arbitrary command fields', () => {
  const input = bookingInput();
  assert.equal(parseBookingInput({ ...input, guest: { ...input.guest, name: '  Ana   María  ' } }).guest.name, 'Ana María');
  for (const name of ['A', ' ', 'X'.repeat(121)]) assert.throws(() => parseBookingInput({ ...input, guest: { ...input.guest, name } }));
  assert.equal(parseBookingInput({ ...input, guest: { ...input.guest, name: 'X'.repeat(120) } }).guest.name.length, 120);
  for (const key of ['siteId', 'tenantId', 'branchId', 'priceMinor', 'depositMinor', 'amount', 'checkoutUrl', '__proto__']) assert.throws(() => parseBookingInput({ ...input, [key]: 'injected' }));
  assert.throws(() => parseBookingInput({ ...input, guest: { ...input.guest, userId: 'someone' } }));
});
test('grooming names/durations constrained; arbitrary/private upload disabled', () => {
  const site = makeSite('grooming');
  for (const durationMinutes of [14, 481, 15.5]) assert.throws(() => parseStorefront({ ...site, services: [{ ...site.services[0], durationMinutes }] }));
  for (const durationMinutes of [15, 37, 480]) assert.equal(parseStorefront({ ...site, services: [{ ...site.services[0], durationMinutes }] }).services[0].durationMinutes, durationMinutes);
  const input = bookingInput(site);
  assert.throws(() => parseBookingInput({ ...input, pet: { ...input.pet, name: 'X'.repeat(101) } }));
  assert.throws(() => parseBookingInput({ ...input, pet: { ...input.pet, photoUploadId: 'unscoped' } }));
});
test('Stripe links reject HTTP, credentials, foreign hosts, lookalikes and ports', () => {
  assert.equal(stripeUrl('https://checkout.stripe.com/c/pay/example'), 'https://checkout.stripe.com/c/pay/example');
  for (const url of ['http://checkout.stripe.com/c/pay/x', 'https://checkout.stripe.com.evil.test/c/pay/x', 'https://evil.test/checkout.stripe.com', 'javascript:alert(1)', 'https://user:pass@checkout.stripe.com/c/pay/x', 'https://checkout.stripe.com:8443/c/pay/x']) assert.throws(() => stripeUrl(url));
});
test('a redirect-shaped result cannot become a confirmed receipt', () => {
  const site = makeSite();
  assert.throws(() => parseReceipt({ siteId: site.siteId, success: true, session_id: 'anything' }, site.siteId));
  assert.throws(() => parseReceipt({ ...receipt(site), state: 'confirmed' }, site.siteId));
});
test('management responses require exact 24h deadline and actions consistent with policy', () => {
  const site = makeSite(), r = receipt(site, 'confirmed');
  const value = { contractVersion: 1, siteId: site.siteId, receipt: r, actions: { canCancel: true, canReschedule: true, deadlineAt: '2030-06-11T15:00:00Z', unavailableReason: 'none' } };
  assert.equal(parseGuestBooking(value, site.siteId).actions.canCancel, true);
  assert.throws(() => parseGuestBooking({ ...value, actions: { ...value.actions, deadlineAt: r.startsAt } }, site.siteId));
  assert.throws(() => parseGuestBooking({ ...value, actions: { ...value.actions, unavailableReason: 'policy_unconfigured' } }, site.siteId));
  assert.throws(() => parseCancelInput({ token: 'x'.repeat(40) }));
});
test('explicit unpaid mode permits absent deposit configuration and requires a zero-deposit non-payment receipt', () => {
  const site = makeUnpaidSite();
  assert.equal(parseStorefront(site).booking.ready, true);
  const confirmed = receipt(site, 'confirmed');
  assert.equal(parseReceipt(confirmed, site.siteId).quote.depositMinor, 0);
  for (const invalid of [
    { ...confirmed, payment: undefined },
    { ...confirmed, quote: { ...confirmed.quote, depositMinor: 1 } },
    ...['awaiting_payment', 'payment_processing', 'payment_review', 'expired'].map(state => ({ ...confirmed, state })),
    { ...confirmed, checkout: receipt(makeSite()).checkout },
  ]) assert.throws(() => parseReceipt(invalid, site.siteId));
  const result = { contractVersion: 1, siteId: site.siteId, receipt: confirmed, receiptToken: receiptToken(site), managementToken: managementToken(site) };
  assert.equal(parseBookingResult(result, site.siteId).receipt.state, 'confirmed');
  assert.throws(() => parseBookingResult({ ...result, managementToken: undefined }, site.siteId));
  assert.throws(() => parseBookingResult({ ...result, managementToken: result.receiptToken }, site.siteId));
  const paid = makeSite();
  assert.throws(() => parseBookingResult({ ...result, siteId: paid.siteId, receipt: receipt(paid, 'confirmed') }, paid.siteId));
});
test('unknown pet size, breed and age remain null; zero months is a known age', () => {
  const input = bookingInput(makeUnpaidSite());
  const pet = { ...input.pet!, sizeId: null, breed: null, ageMonths: null };
  assert.deepEqual(parseBookingInput({ ...input, pet }).pet, pet);
  assert.equal(parseBookingInput({ ...input, pet: { ...pet, ageMonths: 0 } }).pet?.ageMonths, 0);
  for (const change of [{ name: '' }, { breed: '' }, { sizeId: '' }, { ageMonths: -1 }, { ageMonths: 601 }]) assert.throws(() => parseBookingInput({ ...input, pet: { ...pet, ...change } }));
});
test('an empty published pet-size list supports the optional unknown-size path', () => {
  const site = makeUnpaidSite();
  site.capabilities.grooming!.sizes = [];
  const parsed = parseStorefront(site, site.siteId);
  assert.deepEqual(parsed.capabilities.grooming?.sizes, []);
  assert.equal(parsed.booking.ready, true);
  assert.throws(() => parseStorefront({ ...site, capabilities: { grooming: { sizes: null, photoUploadsEnabled: false } } }));
});

test('optional public cover media defaults to null and shares secure image URL validation', () => {
  const site = makeSite();
  const { coverImageUrl: _, ...legacy } = site;
  assert.equal(parseStorefront(legacy).coverImageUrl, null);
  assert.equal(parseStorefront({ ...site, coverImageUrl: 'https://media.example.test/cover.jpg' }).coverImageUrl, 'https://media.example.test/cover.jpg');
  for (const coverImageUrl of ['http://media.example.test/cover.jpg', 'javascript:alert(1)', 'https://secret@media.example.test/cover.jpg', 'https://media.example.test:8443/cover.jpg', '/private/cover.jpg', 3]) assert.throws(() => parseStorefront({ ...site, coverImageUrl }));
});
