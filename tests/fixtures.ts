/** Synthetic data ONLY, never imported by server/ or src/. No hosted integration. */
import type { Availability, BookingInput, Receipt, Storefront } from '../src/lib/contracts.ts';
import { parseBookingInput } from '../src/lib/contracts.ts';

export function makeSite(kind: 'salon' | 'grooming' = 'salon'): Storefront {
  const grooming = kind === 'grooming';
  return {
    contractVersion: 1, siteId: kind, revision: grooming ? 2 : 1,
    name: grooming ? 'Estudio Mascotas · Prueba' : 'Salón Ejemplo · Prueba', description: 'Datos sintéticos de prueba; no se crean citas reales.',
    locale: 'es-MX', currency: 'MXN', currencyExponent: 2, logoUrl: null, coverImageUrl: null,
    theme: { accent: grooming ? '#164e63' : '#18181b', accentText: '#ffffff' },
    contact: { phone: '', whatsapp: '', address: grooming ? 'Sucursal Norte' : 'Sucursal Centro' },
    branch: { id: `${kind}-branch`, name: grooming ? 'Norte' : 'Centro', timeZone: grooming ? 'America/New_York' : 'America/Mexico_City' },
    booking: { mode: grooming ? 'approval' : 'direct', guestOnly: true, approvalHoldsCapacity: false, changeDeadlineHours: 24, notifications: 'whatsapp', payment: 'stripe-deposit', ready: true, unavailableReasons: [], firstDate: '2030-06-12', lastDate: '2030-06-14', depositTerms: 'Condiciones sintéticas para verificar la interfaz. Sin cobros reales.', depositTermsVersion: 'terms-v1' },
    capabilities: { grooming: grooming ? { sizes: [{ id: 'small', label: 'Pequeña' }, { id: 'large', label: 'Grande' }], photoUploadsEnabled: false } : null },
    services: [{ id: `${kind}-service`, name: grooming ? 'Baño y arreglo' : 'Corte de autor', category: grooming ? 'Grooming' : 'Corte y estilo', description: 'Servicio sintético para pruebas.', imageUrl: null, durationMinutes: grooming ? 60 : 45, priceMinor: grooming ? 80000 : 65000, depositMinor: grooming ? 20000 : 15000 }],
  };
}
export function makeUnpaidSite(): Storefront {
  const site = makeSite('grooming');
  site.booking = { ...site.booking, mode: 'direct', payment: 'none', notifications: 'none', depositTerms: 'Cita sin pago en línea. Cambios hasta 24 horas antes.' };
  site.services[0].depositMinor = null;
  return site;
}
export function availability(site = makeSite(), date = site.booking.firstDate): Availability {
  return { contractVersion: 1, siteId: site.siteId, revision: site.revision, branchId: site.branch.id, serviceId: site.services[0].id, date,
    slots: date !== site.booking.firstDate ? [] : [{ id: `${site.siteId}-slot`, startsAt: site.siteId === 'grooming' ? `${date}T04:00:00Z` : `${date}T15:00:00Z`, endsAt: site.siteId === 'grooming' ? `${date}T05:00:00Z` : `${date}T15:45:00Z`, providerId: `${site.siteId}-provider`, providerName: site.siteId === 'grooming' ? 'Profesional de grooming' : 'Especialista del salón' }] };
}
export function bookingInput(site = makeSite()): BookingInput {
  return { revision: site.revision, expectedMode: site.booking.mode, serviceId: site.services[0].id, slotId: availability(site).slots[0].id, guest: { name: 'Persona de Prueba', whatsapp: '+525500000000' }, notes: '',
    pet: site.capabilities.grooming ? { name: 'Mascota de Prueba', sizeId: 'small', breed: 'Cruza', ageMonths: 24, behaviorNotes: '', groomingPreferences: '', photoUploadId: null } : null };
}
export function receipt(site = makeSite(), state: Receipt['state'] = 'awaiting_payment'): Receipt {
  const slot = availability(site).slots[0];
  return { contractVersion: 1, siteId: site.siteId, reference: `${site.siteId}-reference`, bookingRevision: 1, state, payment: site.booking.payment,
    branchId: site.branch.id, serviceId: site.services[0].id, slotId: slot.id, providerId: slot.providerId, startsAt: slot.startsAt, endsAt: slot.endsAt,
    quote: { priceMinor: site.services[0].priceMinor, depositMinor: site.booking.payment === 'none' ? 0 : site.services[0].depositMinor!, currency: site.currency, currencyExponent: site.currencyExponent },
    terms: { version: site.booking.depositTermsVersion, text: site.booking.depositTerms },
    checkout: state === 'awaiting_payment' ? { url: 'https://checkout.stripe.com/c/pay/SYNTHETIC_DO_NOT_PAY', expiresAt: '2030-06-12T14:59:00Z' } : null, notification: site.booking.notifications === 'none' ? 'unconfigured' : 'not_sent' };
}
export const receiptToken = (site: Storefront) => `${site.siteId}_receipt_` + 'r'.repeat(32);
export const managementToken = (site: Storefront) => `${site.siteId}_manage_` + 'm'.repeat(32);
export function fixtureOwner(site = makeSite()) {
  const ledger = new Map<string, { payload: string; result: unknown }>();
  let writes = 0, held = false;
  let current = receipt(site, 'confirmed');
  const requests: Array<{ url: string; headers: Headers; body: unknown }> = [];
  const envelope = { contractVersion: 1, siteId: site.siteId };
  const guest = () => ({ ...envelope, receipt: current, actions: { canCancel: current.state === 'confirmed', canReschedule: current.state === 'confirmed', deadlineAt: new Date(Date.parse(current.startsAt) - 86400000).toISOString(), unavailableReason: current.state === 'confirmed' ? 'none' : 'status_unavailable' } });
  const response = (data: unknown, status = 200) => Response.json(data, { status });
  const fail = (code: string, status: number) => response({ code }, status);
  return {
    get writes() { return writes; }, requests,
    progress(state: Receipt['state']) { current = { ...current, state, checkout: state === 'awaiting_payment' ? current.checkout : null }; },
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url), operation = url.pathname.replace('/api/public/storefront/v1/', '');
      const body = request.method === 'POST' ? await request.json() as Record<string, unknown> : null;
      requests.push({ url: request.url, headers: request.headers, body });
      if (request.headers.get('x-fresco-site') !== site.siteId) return fail('link_invalid', 404);
      if (operation === 'bootstrap') return response({ ...site, privateSecret: 'DO_NOT_EXPOSE' });
      if (operation === 'availability') {
        if (url.searchParams.get('serviceId') !== site.services[0].id) return fail('invalid_command', 400);
        return response(availability(site, url.searchParams.get('date')!));
      }
      const key = `${operation}:${request.headers.get('idempotency-key')}`, payload = JSON.stringify(body);
      const old = ledger.get(key);
      if (old) return old.payload === payload ? response(old.result) : fail('idempotency_conflict', 409);
      if (operation === 'bookings') {
        let input: BookingInput;
        try { input = parseBookingInput(body); } catch { return fail('invalid_command', 400); }
        if (input.revision !== site.revision || input.expectedMode !== site.booking.mode) return fail('configuration_changed', 409);
        if (!site.booking.ready) return fail('payments_unavailable', 503);
        if (input.serviceId !== site.services[0].id || input.slotId !== availability(site).slots[0].id || (held && site.booking.mode === 'direct')) return fail('slot_unavailable', 409);
        if (site.capabilities.grooming && (!input.pet || (input.pet.sizeId !== null && !site.capabilities.grooming.sizes.some(s => s.id === input.pet!.sizeId)))) return fail('invalid_command', 400);
        if (site.booking.mode === 'direct') held = true;
        writes++;
        current = receipt(site, site.booking.payment === 'stripe-deposit' ? 'awaiting_payment' : site.booking.mode === 'direct' ? 'confirmed' : 'pending_approval');
        const result = { ...envelope, receipt: current, receiptToken: receiptToken(site), managementToken: managementToken(site), privateClient: { phone: 'PRIVATE' } };
        ledger.set(key, { payload, result }); return response(result);
      }
      if (operation === 'booking-status') return body?.token === receiptToken(site) ? response(current) : fail('link_invalid', 404);
      if (body?.token !== managementToken(site)) return fail('link_invalid', 404);
      if (operation === 'guest-booking') return response(guest());
      if (body.bookingRevision !== current.bookingRevision) return fail('configuration_changed', 409);
      if (operation === 'guest-booking/cancel') {
        current = { ...current, state: 'cancelled', checkout: null, bookingRevision: current.bookingRevision + 1 }; writes++;
        const result = guest(); ledger.set(key, { payload, result }); return response(result);
      }
      return fail('invalid_command', 400);
    },
  };
}
