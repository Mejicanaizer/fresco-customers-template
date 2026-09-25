import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeUnpaidSite } from '../fixtures';

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
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await expect(page.locator('[data-slot-id]')).toHaveCount(11);
}

test('reference desktop geometry, photos, font, single selection and drawer screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await catalog(page);
  expect(await page.locator('.app-tienda-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
  expect(await page.locator('.storefront-cover').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // Chromium resolves BlinkMacSystemFont to system-ui; check the declared stack too.
  const families = await page.locator('.app-tienda-page').evaluate(element => getComputedStyle(element).getPropertyValue('--fs-font').split(',').map(family => family.trim().replaceAll('"', '')));
  await expect(page.locator('.app-tienda-page')).toHaveCSS('font-family', /^system-ui,/);
  expect(families).toEqual(['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\.woff2?|fonts\.google/.test(entry.name)))).toBe(false);
  await screenshot(page, 'desktop-catalog', true);
  await page.getByRole('button', { name: 'Agendar Baño y arreglo', exact: true }).click();
  await screenshot(page, 'desktop-summary');
  await page.getByRole('button', { name: 'Agendar Corte de pelo', exact: true }).click();
  await expect(page.locator('.app-tienda-action-btn[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Resumen de tu reserva' })).toContainText('$500.00');
  await openDrawer(page);
  await expect.poll(async () => (await page.getByRole('dialog').boundingBox())?.x).toBe(840);
  const drawer = await page.getByRole('dialog').boundingBox();
  expect(drawer?.width).toBe(440); expect(drawer?.x).toBe(840); expect(drawer?.height).toBe(900);
  await page.locator('[data-date="2030-06-12"]').hover();
  await expect(page.locator('[data-date="2030-06-12"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await screenshot(page, 'desktop-calendar');
  await page.locator('[data-slot-id="visual-slot-8"]').click();
  await expect(page.locator('[data-slot-id="visual-slot-8"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByLabel('Nombre completo').fill('Persona de Prueba');
  await page.getByLabel('Teléfono (10 dígitos)', { exact: true }).fill('5500000000');
  await page.getByLabel('Nombre de la mascota').fill('Nube');
  await page.getByLabel('Nombre completo').scrollIntoViewIfNeeded();
  await screenshot(page, 'desktop-contact');
  await page.getByRole('button', { name: 'Cerrar reserva' }).click();
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Persona de Prueba');
  await expect(page.getByLabel('Nombre de la mascota')).toHaveValue('Nube');
  await expect(page.locator('[data-slot-id="visual-slot-8"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quitar servicio seleccionado' }).click();
  await expect(page.getByRole('complementary', { name: 'Resumen de tu reserva' })).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await page.locator('.app-tienda-main').boundingBox())?.width).toBe(1200);
  expect((await page.locator('.app-tienda-grid').boundingBox())?.width).toBe(1152);
  await screenshot(page, 'wide-catalog');
});

test('calendar keyboard, month boundaries, empty dates and provider labels stay authoritative', async ({ page }) => {
  await catalog(page, true); await openDrawer(page);
  await expect(page.getByRole('button', { name: 'Mes anterior', exact: true })).toBeDisabled();
  await expect(page.locator('[data-date="2030-06-11"]')).toBeDisabled();
  const day = page.locator('[data-date="2030-06-12"]'); await day.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-date="2030-06-13"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('No hay horarios disponibles para esta fecha. Elige otra fecha.')).toBeVisible();
  await expect(page.locator('[data-slot-id]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar cita sin pago en línea' })).toBeDisabled();
  await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mes siguiente', exact: true })).toBeDisabled();
  await expect(page.locator('[data-date="2030-07-15"]')).toBeDisabled();
  await page.locator('[data-date="2030-07-14"]').click();
  await expect(page.getByRole('button', { name: /09:00.*Especialista en grooming/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /10:00.*Otro profesional/ })).toBeVisible();
});

test('mobile drawer pins footer, retains focus, supports reduced motion and has no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await catalog(page);
  await screenshot(page, 'mobile-catalog', true);
  await openDrawer(page);
  await screenshot(page, 'mobile-calendar');
  const footer = page.locator('.drawer-footer'), initial = await footer.boundingBox();
  expect(initial!.y + initial!.height).toBe(844);
  await page.locator('.drawer-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await footer.boundingBox()).toEqual(initial);
  await screenshot(page, 'mobile-contact');
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ver reserva', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole('button', { name: 'Ver reserva', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar reserva' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Confirmar cita sin pago en línea' })).toBeInViewport();
});

test('search, broken imagery and absent cover keep a truthful usable catalog', async ({ page }) => {
  await catalog(page);
  await page.getByRole('searchbox', { name: 'Buscar servicio' }).fill('deslanado');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('searchbox').fill('inexistente');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.route('https://media.example.test/*', route => route.abort());
  await page.reload();
  await expect(page.locator('.storefront-cover.public-image-fallback')).toBeVisible();
  await expect(page.locator('.app-tienda-card-img.public-image-fallback')).toHaveCount(6);
  await screenshot(page, 'missing-images');
});
