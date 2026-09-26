import { storefrontOrigin, ownerOrigin } from '../ports';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Receipt } from '../../src/lib/contracts';
import { makeSite, managementToken, receipt, receiptToken } from '../fixtures';

const site = makeSite();
const guest = (r: Receipt, canCancel = false, canReschedule = false) => ({ contractVersion: 1, siteId: site.siteId, receipt: r, actions: {
  canCancel, canReschedule, deadlineAt: new Date(Date.parse(r.startsAt) - 86400000).toISOString(), unavailableReason: canCancel || canReschedule ? 'none' : 'status_unavailable',
} });
test.beforeEach(async ({ request, page }) => {
  await request.post(`${ownerOrigin()}/__test/reset`);
  await page.route(/https:\/\//, route => route.abort());
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Checkout fixture</title><h1>Checkout fixture</h1>' }));
});
async function fill(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agendar Corte de autor' }).click();
  await page.locator('[data-slot-id="salon-slot"]').click();
  await page.getByLabel('Nombre completo').fill('Persona de Prueba');
  await page.getByLabel('Teléfono (10 dígitos)', { exact: true }).fill('5500000000');
}

test('legacy Checkout explicit handoff and cancelled return reuse the existing booking without automatic redirect loop', async ({ page, request }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/storefront/v1/bookings', async route => { sent = route.request().postDataJSON(); await route.continue(); });
  await fill(page);
  await page.getByRole('button', { name: /^Pagar anticipo ·/ }).click();
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  expect(page.url()).toBe(`${storefrontOrigin()}/`);
  await page.getByRole('link', { name: 'Pagar anticipo en Stripe' }).click();
  await expect(page).toHaveURL(receipt(site).checkout!.url);
  expect(sent).not.toHaveProperty('amount'); expect(sent).not.toHaveProperty('accountId'); expect(sent).not.toHaveProperty('email');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  expect(page.url()).not.toContain('#');
  await expect(page.getByLabel('Enlace privado de esta cita')).toHaveValue(new RegExp(`#manage=${managementToken(site)}$`));
  await page.getByRole('link', { name: 'Pagar anticipo en Stripe' }).click();
  await expect(page).toHaveURL(receipt(site).checkout!.url);
  // This is the agreed URL for both Stripe success and cancellation.
  await page.goto(`${storefrontOrigin()}/reserva/pago?success=true#manage=${managementToken(site)}`);
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  await expect(page).toHaveURL(`${storefrontOrigin()}/reserva/pago`);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await expect(page.getByLabel('Enlace privado de esta cita')).toHaveValue(new RegExp(`#manage=${managementToken(site)}$`));
  await page.getByRole('link', { name: 'Pagar anticipo en Stripe' }).click();
  await expect(page).toHaveURL(receipt(site).checkout!.url);
  expect(await (await request.get(`${ownerOrigin()}/__test/writes`)).text()).toBe('1');
});

test('lost create reply replays the same command, reconciles paid state and skips stale Checkout', async ({ page, request }) => {
  const commands: Array<{ body: string | null; key: string | undefined }> = [];
  await page.route('**/api/storefront/v1/bookings', async route => {
    commands.push({ body: route.request().postData(), key: route.request().headers()['idempotency-key'] });
    if (commands.length === 1) { await route.fetch(); return route.fulfill({ status: 503, json: { code: 'upstream_unavailable' } }); }
    await route.continue();
  });
  const confirmed = { ...receipt(site, 'confirmed'), paymentStatus: 'paid' as const };
  await page.route('**/api/storefront/v1/booking-status', route => route.fulfill({ json: confirmed }));
  await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: guest(confirmed, true, true) }));
  await fill(page); await page.getByRole('button', { name: /^Pagar anticipo ·/ }).click();
  await page.getByRole('button', { name: 'Recuperar resultado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu cita está confirmada' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Anticipo pagado' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Pagar anticipo/ })).toHaveCount(0);
  expect(page.url()).toBe(`${storefrontOrigin()}/`);
  expect(commands).toHaveLength(2); expect(commands[0]).toEqual(commands[1]);
  expect(await (await request.get(`${ownerOrigin()}/__test/writes`)).text()).toBe('1');
});

for (const [state, paymentStatus, heading] of [
  ['expired', 'unpaid', 'La reserva venció'], ['confirmed', 'paid', 'Tu cita está confirmada'],
] as const) {
  test(`first recovered create is already ${state}: keep private links and do not open Checkout`, async ({ page }) => {
    const recovered = { ...receipt(site, state), paymentStatus };
    let creates = 0, lookups = 0, checkouts = 0;
    await page.route('**/api/storefront/v1/bookings', route => {
      creates++;
      return route.fulfill({ json: { contractVersion: 1, siteId: site.siteId, receipt: recovered, receiptToken: receiptToken(site), managementToken: managementToken(site) } });
    });
    await page.route('**/api/storefront/v1/booking-status', route => { lookups++; return route.fulfill({ json: recovered }); });
    await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: guest(recovered, state === 'confirmed', state === 'confirmed') }));
    page.on('request', request => { if (request.url().startsWith('https://checkout.stripe.com/')) checkouts++; });
    await fill(page); await page.getByRole('button', { name: /^Pagar anticipo ·/ }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar estado' })).toBeEnabled();
    await expect(page.getByLabel('Enlace privado de esta cita')).toHaveValue(new RegExp(`#manage=${managementToken(site)}$`));
    await expect(page.getByRole('button', { name: 'Recuperar resultado', exact: true })).toHaveCount(0);
    expect(creates).toBe(1); expect(lookups).toBe(1); expect(checkouts).toBe(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
}

test('return recovers a lost status response, then polls processing to authoritative confirmation', async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route('**/api/storefront/v1/guest-booking', route => {
    reads++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ token: managementToken(site) });
    if (reads === 1) return route.fulfill({ status: 503, json: { code: 'upstream_unavailable' } });
    return route.fulfill({ json: guest({ ...receipt(site, reads === 2 ? 'payment_processing' : 'confirmed'), paymentStatus: reads === 2 ? 'processing' : 'paid' }, reads > 2, reads > 2) });
  });
  await page.goto(`/reserva/pago#manage=${managementToken(site)}`);
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar');
  await page.clock.runFor(5100);
  await expect(page.getByRole('heading', { name: 'Verificando el pago' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu cita está confirmada' })).toHaveCount(0);
  await page.clock.runFor(5100);
  await expect(page.getByRole('heading', { name: 'Tu cita está confirmada' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Anticipo pagado' })).toBeVisible();
  expect(reads).toBe(3);
  await page.clock.runFor(60000); expect(reads).toBe(3);
});

test('accepted cancellation shows full refund pending, failed and succeeded independently of cancelled appointment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  const original = { ...receipt(site, 'confirmed'), paymentStatus: 'paid' as const };
  let current: Receipt = original;
  await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: guest(current, current.state === 'confirmed', current.state === 'confirmed') }));
  await page.route('**/api/storefront/v1/guest-booking/cancel', route => {
    expect(route.request().postDataJSON()).toEqual({ token: managementToken(site), bookingRevision: 1 });
    current = { ...original, state: 'cancelled', bookingRevision: 2, paymentStatus: 'refund_pending', refund: { amountMinor: original.quote.depositMinor, currency: 'MXN', status: 'pending' } };
    return route.fulfill({ json: guest(current) });
  });
  await page.goto(`/reserva/pago#manage=${managementToken(site)}`);
  await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByRole('heading', { name: 'Tu cita fue cancelada' })).toBeVisible();
  await expect(page.getByLabel('Estado del reembolso')).toContainText('$150.00');
  await expect(page.getByLabel('Estado del reembolso')).toContainText('Todavía no se ha confirmado');
  await expect(page.getByRole('button', { name: 'Cancelar cita', exact: true })).toBeDisabled();
  current = { ...current, paymentStatus: 'refund_failed', refund: { ...current.refund!, status: 'failed' } };
  await page.clock.runFor(5100);
  await expect(page.getByLabel('Estado del reembolso')).toContainText('no se completó');
  current = { ...current, paymentStatus: 'refunded', refund: { ...current.refund!, status: 'succeeded' } };
  await page.clock.runFor(5100);
  await expect(page.getByLabel('Estado del reembolso')).toContainText('El proveedor confirmó el reembolso');
  await expect(page.getByRole('heading', { name: 'Tu cita fue cancelada' })).toBeVisible();
  await expect(page.getByLabel('Estado del reembolso')).toContainText('$150.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('short refund never replaces the accepted full amount or falsely claims completion', async ({ page }) => {
  let current = { ...receipt(site, 'cancelled'), paymentStatus: 'refund_pending', refund: { amountMinor: 15000, currency: 'MXN', status: 'pending' } };
  await page.route('**/api/storefront/v1/booking-status', route => route.fulfill({ json: current }));
  await page.goto(`/reserva/pago#receipt=${receiptToken(site)}`);
  await expect(page.getByLabel('Estado del reembolso')).toContainText('$150.00');
  current = { ...current, paymentStatus: 'refunded', refund: { amountMinor: 14350, currency: 'MXN', status: 'succeeded' } };
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(page.getByRole('alert')).toContainText('validar');
  await expect(page.getByLabel('Estado del reembolso')).toContainText('$150.00');
  await expect(page.getByLabel('Estado del reembolso')).not.toContainText('confirmó el reembolso');
});

test('backend permissions govern exact deadline even with a skewed customer clock', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2031-01-01T00:00:00Z'));
  await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: guest({ ...receipt(site, 'confirmed'), paymentStatus: 'paid' }, true, false) }));
  await page.goto(`/reserva#manage=${managementToken(site)}`);
  await expect(page.getByRole('button', { name: 'Cancelar cita', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Reprogramar cita' })).toBeDisabled();
});

test('focus and network recovery refresh status while preserving capability only in memory', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/storefront/v1/guest-booking', route => { reads++; return route.fulfill({ json: guest({ ...receipt(site, 'confirmed'), paymentStatus: 'paid' }) }); });
  await page.goto(`/reserva/pago#manage=${managementToken(site)}`);
  await expect(page.getByRole('heading', { name: 'Tu cita está confirmada' })).toBeVisible();
  const first = reads;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => reads).toBe(first + 1);
  await expect(page.getByRole('button', { name: 'Actualizar cita' })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => reads).toBe(first + 2);
  expect(page.url()).not.toContain('#');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
