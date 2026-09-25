import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { availability, makeSite, managementToken, receipt, receiptToken } from '../fixtures';

test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:5491/__test/reset');
  await request.post('http://127.0.0.1:5492/__test/reset');
  // No external request reaches Stripe; its hosted page is replaced with a fixture.
  await page.route(/https:\/\//, route => route.abort());
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Synthetic Checkout</title><h1>Synthetic Checkout — no payment</h1>' }));
});
async function returnFromCheckout(page: Page, site = makeSite()) {
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);
  const origin = site.siteId === 'grooming' ? 'http://127.0.0.1:5376' : 'http://127.0.0.1:5375';
  await page.goto(`${origin}/reserva/pago#manage=${managementToken(site)}`);
}
async function fillSalon(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agendar Corte de autor' }).click();
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-slot-id="salon-slot"]').click();
  await page.getByLabel('Nombre completo').fill('Persona de Prueba');
  await page.getByLabel('Teléfono (10 dígitos)', { exact: true }).fill('5500000000');
}
test('two production builds use runtime binding, distinct catalogs and timezone-correct slots', async ({ page }, testInfo) => {
  const response = await page.goto('/');
  expect(response?.headers()['cache-control']).toBe('no-store');
  await expect(page.getByRole('heading', { name: /Salón Ejemplo/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop-catalog.png'), fullPage: true });
  await expect(page.getByRole('button', { name: /carrito|producto|cuenta|login/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Agendar Corte de autor' }).click();
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await expect(page.getByRole('button', { name: /09:00.*Especialista/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Cerrar reserva' }).click();
  await expect(page.getByRole('button', { name: 'Ver reserva', exact: true })).toBeFocused();
  await page.goto('http://127.0.0.1:5376/');
  await expect(page.getByRole('heading', { name: /Estudio Mascotas/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agendar Corte de autor' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Agendar Baño y arreglo' }).click();
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await expect(page.getByRole('button', { name: /12:00 a\.m\..*grooming/ })).toHaveCount(1);
  await expect(page.getByLabel('Nombre de la mascota')).toBeVisible();
});
test('direct guest booking shows price/deposit and only creates pending payment', async ({ page, request }) => {
  await fillSalon(page);
  await expect(page.getByRole('dialog')).toContainText('$650.00');
  await expect(page.getByRole('dialog')).toContainText('$150.00');
  await page.getByRole('button', { name: 'Continuar al anticipo' }).dblclick();
  await returnFromCheckout(page);
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cita confirmada' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pagar anticipo en Stripe' })).toHaveAttribute('href', /^https:\/\/checkout\.stripe\.com\//);
  expect(await (await request.get('http://127.0.0.1:5491/__test/writes')).text()).toBe('1');
  expect(await (await request.get('http://127.0.0.1:5492/__test/writes')).text()).toBe('0');
});
test('grooming request requires one pet and truthfully says no capacity is held', async ({ page }) => {
  await page.goto('http://127.0.0.1:5376/');
  await page.getByRole('button', { name: 'Agendar Baño y arreglo' }).click();
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await page.locator('[data-slot-id="grooming-slot"]').click();
  await page.getByLabel('Nombre completo').fill('Persona de Prueba');
  await page.getByLabel('Teléfono (10 dígitos)', { exact: true }).fill('5500000000');
  await page.getByLabel('Nombre de la mascota').fill('Nube');
  await page.getByLabel('Tamaño (opcional)', { exact: true }).selectOption('small');
  await page.getByLabel('Raza o cruza').fill('Cruza');
  await page.getByLabel('Edad en meses').fill('24');
  await expect(page.getByRole('dialog')).toContainText('Pagas el anticipo al enviar la solicitud');
  await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
  await returnFromCheckout(page, makeSite('grooming'));
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  const site = makeSite('grooming'), paid = { ...receipt(site, 'pending_approval'), paymentStatus: 'paid' };
  await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: { contractVersion: 1, siteId: site.siteId, receipt: paid, actions: { canCancel: true, canReschedule: false, deadlineAt: new Date(Date.parse(paid.startsAt) - 86400000).toISOString(), unavailableReason: 'none' } } }));
  await page.getByRole('button', { name: 'Actualizar cita' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitud recibida' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'El horario no está apartado' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Anticipo pagado' })).toContainText('falta la aprobación');
  await expect(page.getByRole('button', { name: 'Reprogramar cita' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancelar cita', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: /Pagar anticipo/ })).toHaveCount(0);
});
test('connection error retries; missing deposit disables booking without a demo fallback', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/storefront/v1/bootstrap', async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, json: { code: 'not_configured' } });
    const site = makeSite();
    await route.fulfill({ json: { ...site, booking: { ...site.booking, ready: false, unavailableReasons: ['deposit_not_configured'] }, services: [{ ...site.services[0], depositMinor: null }] } });
  });
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('todavía no está conectado');
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();
  await expect(page.getByRole('button', { name: 'Agendar Corte de autor' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('configurar el anticipo');
});
test('date change clears stale selection; empty backend availability is not synthesized', async ({ page }) => {
  await fillSalon(page);
  await page.locator('[data-date="2030-06-13"]').click();
  await expect(page.getByRole('status')).toContainText('No hay horarios disponibles');
  await expect(page.getByRole('button', { name: 'Continuar al anticipo' })).toBeDisabled();
});
test('uncertain submission locks edits and retries the exact same key and body', async ({ page }) => {
  const requests: Array<{ key: string | undefined; body: string | null }> = [];
  await page.route('**/api/storefront/v1/bookings', async route => {
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    if (requests.length === 1) return route.fulfill({ status: 503, json: { code: 'upstream_unavailable' } });
    await route.continue();
  });
  await fillSalon(page); await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
  await expect(page.getByRole('button', { name: 'Recuperar resultado', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nombre completo')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cerrar reserva' })).toBeDisabled();
  await expect(page.locator('[data-date="2030-06-12"]')).toBeDisabled();
  await expect(page.locator('[data-slot-id="salon-slot"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar resultado', exact: true }).click();
  await returnFromCheckout(page);
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]);
  expect(JSON.parse(requests[0].body!).guest.whatsapp).toBe('+525500000000');
});
test('secure UUID fallback works; completely unsupported crypto leaves form recoverable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true }));
  await fillSalon(page); await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
  await returnFromCheckout(page);
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'getRandomValues', { value: undefined, configurable: true }));
  await fillSalon(page); await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
  await expect(page.getByRole('alert')).toContainText('solicitud segura');
  await expect(page.getByRole('button', { name: 'Continuar al anticipo' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cerrar reserva' })).toBeEnabled();
});
test('Stripe return without a capability never claims payment succeeded', async ({ page }) => {
  await page.goto('/reserva/pago?success=true&session_id=untrusted');
  await expect(page.getByText('Esta página no verifica un pago.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cita confirmada' })).toHaveCount(0);
});
test('management link stays out of URL/storage and cancellation uses booking terms/revision', async ({ page }) => {
  const site = makeSite(), token = managementToken(site);
  await page.route('**/api/storefront/v1/bootstrap', route => route.fulfill({ json: { ...site, booking: { ...site.booking, depositTerms: 'NEW PUBLIC TERMS', depositTermsVersion: 'terms-v2' } } }));
  let command: Record<string, unknown> | null = null;
  await page.route('**/api/storefront/v1/guest-booking/cancel', async route => { command = route.request().postDataJSON(); await route.continue(); });
  await page.goto(`/reserva#manage=${token}`);
  await expect(page.getByRole('heading', { name: 'Gestionar tu cita' })).toBeVisible();
  expect(page.url()).not.toContain(token);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click();
  await expect(page.getByText(/Las condiciones aceptadas de la reserva/)).toContainText(site.booking.depositTerms);
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByRole('heading', { name: 'Cita cancelada' })).toBeVisible();
  expect(command).toEqual({ token, bookingRevision: 1 });
});
test('mobile dialog contains keyboard focus and closes back to reservation button', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fillSalon(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-booking.png') });
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver reserva', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('receipt status is read from backend, and a cross-site capability is rejected', async ({ page }) => {
  const site = makeSite(), token = receiptToken(site);
  await page.route('**/api/storefront/v1/booking-status', route => route.fulfill({ json: receipt(site, 'payment_review') }));
  await page.goto(`/reserva/pago#receipt=${token}`);
  await expect(page.getByRole('heading', { name: 'Pago en revisión' })).toBeVisible();
  await page.unroute('**/api/storefront/v1/booking-status');
  await page.goto(`http://127.0.0.1:5376/reserva#manage=${managementToken(site)}`);
  await expect(page.getByRole('alert')).toContainText('no es válido');
});
test('wrong-provider create response is not accepted as checkout', async ({ page }) => {
  const site = makeSite();
  await page.route('**/api/storefront/v1/bookings', route => route.fulfill({ json: { contractVersion: 1, siteId: site.siteId, receipt: { ...receipt(site), providerId: 'different' }, receiptToken: receiptToken(site), managementToken: managementToken(site) } }));
  await fillSalon(page); await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
  await expect(page.getByRole('button', { name: 'Recuperar resultado', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pagar anticipo en Stripe' })).toHaveCount(0);
  expect(availability(site).slots[0].providerId).not.toBe('different');
});

test('rescheduling submits revisions and updates only from the authoritative result', async ({ page }) => {
  const site = makeSite(), previous = receipt(site, 'confirmed');
  const nextSlot = { ...availability(site).slots[0], id: 'replacement-slot', providerId: 'replacement-provider', providerName: 'Otro especialista', startsAt: '2030-06-12T16:00:00Z', endsAt: '2030-06-12T16:45:00Z' };
  await page.route('**/api/storefront/v1/availability?*', route => route.fulfill({ json: { ...availability(site), slots: [nextSlot] } }));
  let command: unknown;
  await page.route('**/api/storefront/v1/guest-booking/reschedule', route => {
    command = route.request().postDataJSON();
    const next = { ...previous, slotId: nextSlot.id, providerId: nextSlot.providerId, startsAt: nextSlot.startsAt, endsAt: nextSlot.endsAt, bookingRevision: 2 };
    return route.fulfill({ json: { contractVersion: 1, siteId: site.siteId, receipt: next, actions: { canCancel: true, canReschedule: true, deadlineAt: '2030-06-11T16:00:00Z', unavailableReason: 'none' } } });
  });
  await page.goto(`/reserva#manage=${managementToken(site)}`);
  await page.getByRole('button', { name: 'Reprogramar cita' }).click();
  await page.locator(`[data-slot-id="${nextSlot.id}"]`).click();
  await page.getByRole('button', { name: 'Confirmar nuevo horario' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar nuevo horario' })).toHaveCount(0);
  expect(command).toEqual({ token: managementToken(site), revision: 1, bookingRevision: 1, slotId: nextSlot.id });
});
test('backend deadline policy disables guest changes', async ({ page }) => {
  const site = makeSite(), previous = { ...receipt(site, 'confirmed'), startsAt: '2000-01-02T15:00:00Z', endsAt: '2000-01-02T15:45:00Z' };
  await page.route('**/api/storefront/v1/guest-booking', route => route.fulfill({ json: { contractVersion: 1, siteId: site.siteId, receipt: previous, actions: { canCancel: false, canReschedule: false, deadlineAt: '2000-01-01T15:00:00Z', unavailableReason: 'deadline_passed' } } }));
  await page.goto(`/reserva#manage=${managementToken(site)}`);
  await expect(page.getByRole('button', { name: 'Reprogramar cita' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancelar cita', exact: true })).toBeDisabled();
});
test('changed settings require refreshing the published contract before another submission', async ({ page }) => {
  let bootstraps = 0;
  await page.route('**/api/storefront/v1/bootstrap', async route => { bootstraps++; await route.continue(); });
  await page.route('**/api/storefront/v1/bookings', route => route.fulfill({ status: 409, json: { code: 'configuration_changed' } }));
  await fillSalon(page); await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
  await expect(page.getByRole('button', { name: 'Continuar al anticipo' })).toBeDisabled();
  await page.getByRole('button', { name: 'Actualizar condiciones y reiniciar solicitud' }).click();
  await expect(page.getByRole('button', { name: 'Agendar Corte de autor' })).toBeVisible();
  expect(bootstraps).toBe(2);
});
test('catalog reload and reopen show edited or omitted services without stale fallback', async ({ page, context }) => {
  const original = makeSite();
  const hiddenName = 'Servicio que dejará de publicarse';
  let published = { ...original, services: [...original.services, { ...original.services[0], id: 'other-service', name: hiddenName, category: 'Otra categoría' }] };
  let unavailable = false, calls = 0;
  await context.route(/https:\/\//, route => route.abort());
  await context.route('**/api/storefront/v1/bootstrap', route => {
    calls++;
    return unavailable ? route.fulfill({ status: 503, json: { code: 'upstream_unavailable' } }) : route.fulfill({ json: published });
  });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Otra categoría', exact: true }).click();
  await expect(page.getByRole('heading', { name: hiddenName, exact: true })).toBeVisible();
  published = { ...original, revision: 2, services: [{ ...original.services[0], name: 'Servicio editado', category: 'Categoría editada', description: 'Descripción guardada por el dueño', priceMinor: 72500, durationMinutes: 70 }] };
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  for (const text of ['Servicio editado', 'Descripción guardada por el dueño', '70 minutos', '$725.00']) await expect(page.getByRole('article')).toContainText(text);
  await expect(page.getByRole('heading', { name: original.services[0].name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: hiddenName, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Otra categoría', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'true');
  const reopened = await context.newPage();
  try {
    await reopened.goto('http://127.0.0.1:5375/');
    await expect(reopened.getByRole('article')).toHaveCount(1);
    await expect(reopened.getByRole('article')).toContainText('Servicio editado');
    published = { ...published, revision: 3, services: [] };
    await reopened.reload();
    await expect(reopened.getByRole('article')).toHaveCount(0);
    await expect(reopened.getByText('No hay servicios publicados en esta categoría.')).toBeVisible();
    unavailable = true;
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('No pudimos conectar');
    await expect(page.getByRole('article')).toHaveCount(0);
    unavailable = false;
    await page.getByRole('button', { name: 'Reintentar conexión', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText('No hay servicios publicados en esta categoría.')).toBeVisible();
    expect(calls).toBe(6);
  } finally { await reopened.close(); }
});
test('unpaid guest booking confirms without a checkout and the saved link supports cancellation', async ({ page, request }) => {
  await request.post('http://127.0.0.1:5492/__test/unpaid');
  await page.goto('http://127.0.0.1:5376/');
  await expect(page.getByRole('contentinfo')).toContainText('Guarda el enlace privado que aparece al reservar');
  await expect(page.getByRole('contentinfo')).not.toContainText('recibas por WhatsApp');
  await expect(page.getByText('Sin pago en línea', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agendar Baño y arreglo' }).click();
  await page.getByRole('button', { name: 'Ver reserva', exact: true }).click();
  await page.locator('[data-slot-id="grooming-slot"]').click();
  await page.getByLabel('Nombre completo').fill('Persona de Prueba');
  await page.getByLabel('Teléfono (10 dígitos)', { exact: true }).fill('5500000000');
  await page.getByLabel('Nombre de la mascota').fill('Nube');
  let submittedPet: unknown;
  await page.route('**/api/storefront/v1/bookings', async route => { submittedPet = route.request().postDataJSON().pet; await route.continue(); });
  await page.getByRole('button', { name: 'Confirmar cita sin pago en línea' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Cita confirmada' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No se realizó ningún cobro en línea' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Stripe/ })).toHaveCount(0);
  await expect(page.getByText(/Las notificaciones automáticas por WhatsApp no están activas/)).toBeVisible();
  expect(submittedPet).toMatchObject({ name: 'Nube', sizeId: null, breed: null, ageMonths: null });
  const link = await page.getByLabel('Enlace privado de esta cita').inputValue();
  expect(new URL(link).hash.startsWith('#manage=')).toBe(true);
  expect(page.url()).not.toContain('#');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(await (await request.get('http://127.0.0.1:5492/__test/writes')).text()).toBe('1');
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Gestionar tu cita' })).toBeVisible();
  expect(page.url()).not.toContain('#');
  await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByRole('heading', { name: 'Cita cancelada' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No se realizó ningún cobro en línea' })).toBeVisible();
});


test('national phone rejects invalid digits and sends a ten-digit number as Mexican E.164', async ({ page, request }) => {
  const submitted: Array<{ guest: { whatsapp: string } }> = [];
  await page.route('**/api/storefront/v1/bookings', async route => {
    submitted.push(route.request().postDataJSON());
    await route.continue();
  });
  await fillSalon(page);
  const phone = page.getByLabel('Teléfono (10 dígitos)', { exact: true });
  await expect(phone).toHaveAttribute('type', 'tel');
  await expect(phone).toHaveAttribute('inputmode', 'numeric');
  await expect(phone).toHaveAttribute('autocomplete', 'tel-national');
  await expect(phone).toHaveAttribute('placeholder', '5512345678');
  const submit = page.getByRole('button', { name: 'Continuar al anticipo' });
  for (const invalid of ['551234567', '55123456789', '551234567a', '55 1234567', '55-1234567', '５５１２３４５６７８', '+525512345678']) {
    await phone.fill(invalid);
    await submit.click();
    await expect(phone).toBeFocused();
    expect(await phone.evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(false);
    expect(await phone.evaluate(input => (input as HTMLInputElement).validationMessage)).toContain('exactamente 10 dígitos');
    await expect(phone).toHaveValue(invalid); // Do not silently truncate an eleven-digit pasted number.
    expect(submitted).toHaveLength(0);
  }
  // The submit handler enforces the same rule even if native form validation is bypassed.
  await phone.fill('55123456789');
  await phone.evaluate(input => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.getByRole('alert')).toContainText('exactamente 10 dígitos');
  expect(submitted).toHaveLength(0);
  await phone.fill('5512345678');
  expect(await phone.evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(true);
  await submit.click();
  await returnFromCheckout(page);
  await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
  expect(submitted).toHaveLength(1);
  expect(submitted[0].guest.whatsapp).toBe('+525512345678');
  expect(await (await request.get('http://127.0.0.1:5491/__test/writes')).text()).toBe('1');
});
