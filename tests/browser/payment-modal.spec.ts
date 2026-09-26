import { ownerOrigin } from '../ports';
import { test, expect } from '@playwright/test';
import type { Receipt } from '../../src/lib/contracts';
import { makeSite, receipt, receiptToken } from '../fixtures';
const site = makeSite();
function embedded(): Receipt {
  return { ...receipt(site), paymentStatus: 'unpaid', checkout: { mode: 'embedded', clientSecret: 'cs_test_synthetic_secret_synthetic', publishableKey: 'pk_test_' + 'p'.repeat(32), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}
const mockSdk = `window.Stripe = function() { return { createEmbeddedCheckoutPage: async function(options) {
  await options.fetchClientSecret();
  let button;
  return { mount: function(node) { button = document.createElement('button'); button.textContent = 'Simular pago seguro'; button.onclick = options.onComplete; node.append(button); }, destroy: function() { button?.remove(); } };
} }; };`;
const frameSdk = `window.Stripe = function() { return { createEmbeddedCheckoutPage: async function(options) {
  await options.fetchClientSecret(); let frame;
  return { mount: function(node) { frame = document.createElement('iframe'); frame.title = 'Pago seguro de prueba'; frame.src = 'https://checkout.stripe.com/test-modal'; frame.width = '100%'; frame.height = '800'; node.append(frame); }, destroy: function() { frame?.remove(); } };
} }; };`;
test.beforeEach(async ({ page, request }) => {
  await request.post(`${ownerOrigin()}/__test/reset`);
  await page.route(/https:\/\//, route => route.abort());
  await page.route('https://js.stripe.com/**', route => route.fulfill({ contentType: 'application/javascript', body: mockSdk }));
});
for (const scheme of ['dark', 'light'] as const) for (const width of [1280, 390, 320]) test(`${scheme} ${width}px modal scrolls and includes Stripe's cross-origin iframe in keyboard navigation`, async ({ page }) => {
  const height = width === 320 ? 568 : 900;
  await page.emulateMedia({ colorScheme: scheme }); await page.setViewportSize({ width, height });
  await page.route('https://js.stripe.com/**', route => route.fulfill({ contentType: 'application/javascript', body: frameSdk }));
  await page.route('https://checkout.stripe.com/test-modal', route => route.fulfill({ contentType: 'text/html', body: '<label>Tarjeta de prueba<input></label><button>Pagar de prueba</button>' }));
  await page.route('**/api/storefront/v1/booking-status', route => route.fulfill({ json: embedded() }));
  await page.goto(`/reserva#receipt=${receiptToken(site)}`);
  const modal = page.getByRole('dialog', { name: 'Pagar anticipo', exact: true });
  const frame = page.frameLocator('iframe[title="Pago seguro de prueba"]');
  await expect(frame.getByLabel('Tarjeta de prueba')).toBeVisible();
  const bounds = (await modal.boundingBox())!;
  expect(bounds.x).toBe(width > 580 ? (width - 720) / 2 : 0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
  const footer = modal.locator('.drawer-footer'), before = await footer.boundingBox();
  await modal.locator('.payment-modal-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await footer.boundingBox()).toEqual(before);
  await modal.getByRole('button', { name: 'Cerrar pago' }).focus(); await page.keyboard.press('Tab');
  await expect(frame.getByLabel('Tarjeta de prueba')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(frame.getByRole('button')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(modal.getByRole('button', { name: /estado del pago|Consultando el pago/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(frame.getByRole('button')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await modal.getByRole('button', { name: 'Cerrar pago' }).click();
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeFocused();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page.locator('iframe')).toHaveCount(1);
  if (width > 580) { await page.mouse.click(10, 10); await expect(modal).toHaveCount(0); }
});
