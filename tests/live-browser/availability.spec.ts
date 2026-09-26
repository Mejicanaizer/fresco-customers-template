import { test, expect } from '@playwright/test';
import { parseAvailability, parseStorefront, localDate } from '../../src/lib/contracts';

test('real customer date change loads authoritative slots without creating a booking', async ({ page, request }) => {
  const date = localDate(process.env.STOREFRONT_QA_DATE);
  const response = await request.get('/api/storefront/v1/bootstrap');
  expect(response.status()).toBe(200);
  const site = parseStorefront(await response.json(), 'best-in-show-grooming');
  expect(site.booking.ready).toBe(true);
  expect(site.booking.payment).toBe('none');
  expect(site.booking.notifications).toBe('none');
  const selectedId = process.env.STOREFRONT_QA_SERVICE_ID;
  const service = selectedId ? site.services.find(service => service.id === selectedId) : site.services[0];
  expect(service, 'Choose a currently published service with availability on the test date').toBeDefined();
  if (!service) throw new Error('No published service selected for the read-only availability check');
  const result = await request.get(`/api/storefront/v1/availability?${new URLSearchParams({ serviceId: service.id, date })}`);
  expect(result.status()).toBe(200);
  const expected = parseAvailability(await result.json(), site.siteId, service.id, date, site);
  expect(expected.slots.length).toBeGreaterThan(0);

  let writes = 0;
  // Observe real GETs without replacing them; block any accidental mutation.
  await page.route('**/api/storefront/v1/**', async route => {
    if (route.request().method() !== 'GET') { writes++; await route.abort(); return; }
    await route.continue();
  });
  await page.route(/https:\/\//, route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: `Agendar ${service.name}`, exact: true }).click();
  const dateButton = page.locator(`[data-date="${date}"]`);
  for (let i = 0; i < 24 && !await dateButton.count(); i++) await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
  await expect(dateButton).toBeEnabled();
  if (date !== site.booking.firstDate) {
    const changed = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/availability') && url.searchParams.get('date') === date;
    });
    await dateButton.click();
    expect((await changed).status()).toBe(200);
  }
  await expect(dateButton).toHaveAttribute('aria-pressed', 'true');
  const slots = page.getByRole('group', { name: 'Horario y profesional', exact: true });
  await expect(slots).toBeVisible();
  await expect(slots.locator('[data-slot-id]')).toHaveCount(expected.slots.length);
  await expect(page.getByText('No hay horarios disponibles para esta fecha. Elige otra fecha.')).toHaveCount(0);
  const chosen = slots.locator(`[data-slot-id="${expected.slots[0].id}"]`);
  await chosen.click();
  await expect(chosen).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Completa tus datos', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cerrar reserva' }).click();
  await expect(page.getByRole('contentinfo')).toContainText('Guarda el enlace privado que aparece al reservar');
  expect(writes).toBe(0);
});
