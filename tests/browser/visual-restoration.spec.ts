import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { availability, makeSite, makeUnpaidSite, receipt, managementToken } from '../fixtures';
import type { Receipt } from '../../src/lib/contracts';

const output = join(tmpdir(), 'fresco-customer-visual-qa');
async function catalog(page: Page, multipleProviders = false) {
  const site = makeUnpaidSite();
  site.name = 'Estudio Mascotas';
  site.description = 'Baño, corte y cuidado para tu mejor amigo.';
  site.contact = { address: 'Sucursal de prueba · Ciudad de México', phone: '+525500000000', whatsapp: '' };
  site.branch = { ...site.branch, name: 'Centro', timeZone: 'America/Mexico_City' };
  site.coverImageUrl = 'https://media.example.test/cover.png';
  site.booking.firstDate = '2030-06-12'; site.booking.lastDate = '2030-07-14';
  site.services = ['Baño y arreglo', 'Corte de pelo', 'Cepillado y deslanado', 'Baño para piel sensible', 'Cuidado de uñas', 'Arreglo completo'].map((name, index) => ({ ...site.services[0], id: `visual-service-${index}`, name, category: index < 3 ? 'Baño y corte' : 'Cuidados', description: ['Limpieza suave, secado y cepillado para un pelaje limpio y cuidado.', 'Un corte a su medida, con atención a cada detalle y a su comodidad.', 'Retiramos el pelo suelto y desenredamos con un cepillado cuidadoso.'][index % 3], imageUrl: 'https://media.example.test/service.png', priceMinor: (450 + index * 50) * 100 }));
  await page.route('https://media.example.test/*', route => route.fulfill({ path: `src/assets/preview/grooming-${route.request().url().endsWith('cover.png') ? 'cover' : 'service'}.png`, contentType: 'image/png' }));
  await page.route('**/api/storefront/v1/bootstrap', route => route.fulfill({ json: site }));
  await page.route('**/api/storefront/v1/availability?*', route => {
    const url = new URL(route.request().url()), date = url.searchParams.get('date')!, serviceId = url.searchParams.get('serviceId')!;
    const slots = date === '2030-06-13' ? [] : [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour, i) => ({ id: `visual-slot-${i}`, providerId: multipleProviders && i % 2 ? 'other-provider' : 'visual-provider', providerName: multipleProviders && i % 2 ? 'Otro profesional' : 'Especialista en grooming', startsAt: `${date}T${String(hour).padStart(2, '0')}:00:00-06:00`, endsAt: `${date}T${String(hour + 1).padStart(2, '0')}:00:00-06:00` }));
    return route.fulfill({ json: { contractVersion: 1, siteId: site.siteId, revision: site.revision, branchId: site.branch.id, serviceId, date, slots } });
  });
  await page.route('**/api/storefront/v1/bookings', route => route.abort());
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('article')).toHaveCount(6);
  return site;
}
async function screenshot(page: Page, name: string, fullPage = false) {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, `${name}.png`), fullPage, animations: 'disabled' });
}
async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Agendar Baño y arreglo', exact: true }).click();
  await expect(page.locator('[data-slot-id]')).toHaveCount(11);
}

test('reference desktop dimensions, immediate drawer and retained selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await catalog(page);
  expect((await page.locator('.app-tienda-main').boundingBox())?.width).toBe(1120);
  expect(await page.locator('.app-tienda-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
  await expect(page.locator('.app-tienda-card').first()).toHaveCSS('border-radius', '14px');
  await expect(page.locator('.app-tienda-card-media').first()).toHaveCSS('height', '176px');
  await expect(page.locator('.store-logo')).toHaveCSS('width', '68px');
  await expect(page.locator('.storefront-identity h1')).toHaveCSS('font-size', '28px');
  expect((await page.locator('.storefront-hero').boundingBox())?.y).toBe(48);
  expect(await page.locator('.app-tienda-page').evaluate(el => getComputedStyle(el).getPropertyValue('--fs-font'))).toContain('SF Pro Text');
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\.woff2?|fonts\.google/.test(entry.name)))).toBe(false);
  await screenshot(page, 'desktop-catalog', true);
  await openDrawer(page);
  await expect.poll(async () => (await page.getByRole('dialog').boundingBox())?.x).toBe(810);
  expect((await page.getByRole('dialog').boundingBox())?.width).toBe(470);
  expect((await page.getByRole('dialog').boundingBox())?.height).toBe(900);
  await expect(page.locator('.calendar-days > button')).toHaveCount(35);
  await expect(page.locator('[data-date="2030-06-12"] .has-slots')).toHaveCount(1);
  await expect(page.locator('[data-date="2030-06-13"] .availability-dot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Elige un horario', exact: true })).toBeDisabled();
  await screenshot(page, 'desktop-calendar');
  await page.locator('[data-slot-id="visual-slot-8"]').click();
  await expect(page.getByRole('button', { name: 'Completa tus datos', exact: true })).toBeDisabled();
  await page.getByLabel('Nombre completo').fill('Persona de Prueba');
  await page.getByLabel('Teléfono (10 dígitos)', { exact: true }).fill('5500000000');
  await page.getByLabel('Nombre de la mascota').fill('Nube');
  await expect(page.getByRole('button', { name: 'Confirmar cita sin pago en línea' })).toBeEnabled();
  await expect(page.locator('.step-number.is-complete')).toHaveCount(2);
  await page.getByLabel('Nombre completo').scrollIntoViewIfNeeded();
  await screenshot(page, 'desktop-contact');
  await page.getByRole('button', { name: 'Cerrar reserva' }).click();
  await expect(page.getByRole('button', { name: 'Agendar Baño y arreglo', exact: true })).toBeFocused();
  await screenshot(page, 'desktop-summary');
  await page.getByRole('button', { name: 'Elegir horario', exact: true }).click();
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Persona de Prueba');
  await expect(page.locator('[data-slot-id="visual-slot-8"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Elegir horario', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Agendar Corte de pelo', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-tienda-action-btn[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByRole('complementary')).toContainText('$500.00');
  await page.getByRole('button', { name: 'Quitar servicio seleccionado' }).click();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await page.locator('.app-tienda-grid').boundingBox())?.width).toBe(1120);
});

test('calendar navigation, actual fetched availability dots and provider names', async ({ page }) => {
  await catalog(page, true); await openDrawer(page);
  await expect(page.getByRole('button', { name: 'Mes anterior', exact: true })).toBeDisabled();
  await expect(page.locator('[data-date="2030-06-11"]')).toBeDisabled();
  await page.locator('[data-date="2030-06-12"]').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-date="2030-06-13"]')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByText('No hay horarios disponibles para esta fecha. Elige otra fecha.')).toBeVisible();
  await expect(page.locator('[data-date="2030-06-13"] .no-slots')).toHaveCount(1);
  await expect(page.locator('[data-slot-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mes siguiente', exact: true })).toBeDisabled();
  await expect(page.locator('[data-date="2030-07-15"]')).toBeDisabled();
  await page.locator('[data-date="2030-07-14"]').click();
  await expect(page.getByRole('button', { name: /09:00.*Especialista en grooming/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /10:00.*Otro profesional/ })).toBeVisible();
});

for (const width of [390, 320]) test(`reference ${width}px catalog and drawer have pinned footer and no overflow`, async ({ page }) => {
  const height = width === 320 ? 568 : 844;
  await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await catalog(page); await screenshot(page, `${width}-catalog`, true);
  await openDrawer(page); await screenshot(page, `${width}-calendar`);
  const footer = page.locator('.drawer-footer'), initial = await footer.boundingBox();
  expect(initial!.y + initial!.height).toBe(height);
  await page.locator('.drawer-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await footer.boundingBox()).toEqual(initial);
  await screenshot(page, `${width}-contact`);
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Elegir horario', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Elegir horario', exact: true })).toBeFocused();
});

test('search and missing media keep public catalog usable', async ({ page }) => {
  await catalog(page);
  await page.getByRole('searchbox', { name: 'Buscar servicio' }).fill('deslanado'); await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('searchbox').fill('inexistente'); await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click(); await expect(page.getByRole('article')).toHaveCount(6);
  await page.route('https://media.example.test/*', route => route.abort()); await page.reload();
  await expect(page.locator('.app-tienda-card-img.public-image-fallback')).toHaveCount(6);
  await screenshot(page, 'missing-images');
});

async function managedReceipt(page: Page, state: Receipt['state'] = 'confirmed', reference = '260925104872') {
  const site = makeSite(); site.booking.notifications = 'none';
  let current: Receipt = { ...receipt(site, state), reference, paymentStatus: state === 'awaiting_payment' ? 'unpaid' : state === 'payment_processing' ? 'processing' : 'paid' };
  const guest = () => ({ contractVersion: 1, siteId: site.siteId, receipt: current, actions: { canCancel: current.state === 'confirmed', canReschedule: current.state === 'confirmed', deadlineAt: '2030-06-11T15:00:00Z', unavailableReason: current.state === 'confirmed' ? 'none' : 'status_unavailable' } });
  await page.route(/https:\/\//, route => route.abort());
  await page.route('**/api/storefront/v1/bootstrap', route => route.fulfill({ json: site }));
  await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: guest() }));
  await page.route('**/api/storefront/v1/guest-booking/cancel', route => { current = { ...current, state: 'cancelled', bookingRevision: 2, paymentStatus: 'refund_pending', refund: { amountMinor: 15000, currency: 'MXN', status: 'pending' } }; return route.fulfill({ json: guest() }); });
  await page.route('**/api/storefront/v1/availability?*', route => route.fulfill({ json: availability(site) }));
  await page.goto(`/reserva#manage=${managementToken(site)}`);
  await expect(page.locator('.receipt-details')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar cita' })).toBeEnabled();
  return site;
}
for (const scheme of ['dark', 'light'] as const) for (const width of [1280, 390, 320]) test(`${scheme} ${width}px focused receipt, management and real calendar export`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: scheme }); await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  await managedReceipt(page);
  await expect(page.locator('.appointment-pass')).toBeVisible();
  await expect(page.locator('.pass-reference > span')).toHaveText('260925104872');
  await expect(page.getByText('Anticipo pendiente', { exact: true })).toHaveCount(0);
  await expect(page.locator('.payment-link, .embedded-payment')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.locator('.pass-bars')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.pass-info')).toContainText('Asignado por el negocio');
  await expect(page.locator('.pass-info')).not.toContainText('salon-provider');
  await expect(page.locator('.pass-info')).toContainText('$500.00');
  if (scheme === 'light') {
    await expect(page.locator('.receipt-page')).toHaveCSS('background-color', 'rgb(242, 242, 244)');
    await expect(page.locator('.receipt-page')).toHaveCSS('background-image', 'none');
  }
  await expect(page.locator('.pass-main')).toHaveCSS('background-color', scheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(26, 27, 30)');
  expect((await page.locator('.receipt-column').boundingBox())!.width).toBe(Math.min(480, width - 48));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByRole('button', { name: 'Copiar enlace privado' }).evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await screenshot(page, `${scheme}-${width}-confirmed`, true);
  await page.locator('.pass-bottom').screenshot({ path: join(output, `${scheme}-${width}-reference.png`) });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Agregar al calendario' }).click();
  expect((await download).suggestedFilename()).toBe('cita.ics');
  await page.getByRole('button', { name: 'Reprogramar cita', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.locator('[data-slot-id]')).toHaveCount(1);
  await screenshot(page, `${scheme}-${width}-reschedule`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Reprogramar cita', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click();
  await page.locator('.cancel-confirmation').scrollIntoViewIfNeeded(); await screenshot(page, `${scheme}-${width}-cancel-confirmation`);
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByRole('heading', { name: 'Tu cita fue cancelada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar al calendario' })).toHaveCount(0);
  await screenshot(page, `${scheme}-${width}-cancelled`, true);
  await page.getByRole('button', { name: 'Reservar otra cita' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.locator('.receipt-column')).toHaveCount(0);
});

test('pending payment preserves real checkout action and no calendar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await page.emulateMedia({ colorScheme: 'dark' });
  await managedReceipt(page, 'awaiting_payment');
  await expect(page.locator('.appointment-pass')).toHaveCount(0);
  await expect(page.locator('.payment-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar al calendario' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pagar anticipo en Stripe' })).toBeVisible();
  await screenshot(page, 'dark-1280-payment', true);
});

for (const state of ['payment_processing', 'payment_review'] as const) test(`${state} keeps unconfirmed bookings out of the appointment pass`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await managedReceipt(page, state);
  await expect(page.locator('.appointment-pass, .pass-bars, .payment-link')).toHaveCount(0);
  await expect(page.locator('.payment-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar al calendario' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, `dark-320-${state}`, true);
});

test('paid approval shows its pass while clearly awaiting the business, with no outstanding payment', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.emulateMedia({ colorScheme: 'dark' });
  await managedReceipt(page, 'pending_approval');
  await expect(page.locator('.appointment-pass')).toBeVisible();
  await expect(page.locator('.paid-badge')).toBeVisible();
  await expect(page.locator('.receipt-chip.pending')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Anticipo pagado' })).toContainText('falta la aprobación');
  await expect(page.getByRole('status').filter({ hasText: 'El horario no está apartado' })).toBeVisible();
  await expect(page.getByText('Anticipo pendiente', { exact: true })).toHaveCount(0);
  await expect(page.locator('.payment-link, .payment-summary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar al calendario' })).toHaveCount(0);
  await screenshot(page, 'dark-320-paid-approval', true);
});

for (const reference of ['9b239640-0a4c-4dd0-b3a4-b8e8cd92c611', 'booking_'.repeat(14) + '0123456789ABCDEF']) test(`320px preserves and copies the complete ${reference.length}-character public reference`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copiedReference?: string }).copiedReference = text; } } }); });
  await managedReceipt(page, 'confirmed', reference);
  await expect(page.locator('.pass-reference > span')).toHaveText(reference);
  await page.getByRole('button', { name: 'Copiar referencia', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { copiedReference?: string }).copiedReference)).toBe(reference);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.pass-bars')).toHaveAttribute('aria-hidden', 'true');
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, `dark-320-reference-${reference.length}`, true);
});

test('uncertain reschedule locks close and browsing and recovers exactly the same mutation', async ({ page }) => {
  await managedReceipt(page); const requests: Array<{ body: string | null; key?: string }> = [];
  await page.route('**/api/storefront/v1/guest-booking/reschedule', route => { requests.push({ body: route.request().postData(), key: route.request().headers()['idempotency-key'] }); return route.fulfill({ status: 503, json: { code: 'upstream_unavailable' } }); });
  await page.getByRole('button', { name: 'Reprogramar cita', exact: true }).click();
  await page.locator('[data-slot-id="salon-slot"]').click(); await page.getByRole('button', { name: 'Confirmar nuevo horario' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar cambio de horario' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ver otros servicios' })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar resultado del cambio' }).click();
  await expect.poll(() => requests.length).toBe(2); expect(requests[0]).toEqual(requests[1]);
});
