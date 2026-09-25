import { ContractError, capability, parseAvailability, parseBookingResult, parseGuestBooking, parseReceipt, parseStorefront } from './contracts.ts';
import type { BookingInput, Receipt, Slot, Storefront } from './contracts.ts';

export class StorefrontError extends Error {
  code: string;
  uncertain: boolean;
  constructor(code: string, uncertain = false) {
    super(errorMessages[code] ?? errorMessages.upstream_unavailable);
    this.code = code;
    this.uncertain = uncertain;
  }
}
const errorMessages: Record<string, string> = {
  not_configured: 'Este sitio todavía no está conectado con el negocio. La reserva en línea no está disponible.',
  upstream_unavailable: 'No pudimos conectar con el negocio. Intenta nuevamente.',
  invalid_contract: 'No pudimos validar la información del negocio. Actualiza e intenta nuevamente.',
  configuration_changed: 'Las condiciones del negocio cambiaron. Actualiza antes de continuar.',
  slot_unavailable: 'Ese horario ya no está disponible. Consulta los horarios nuevamente.',
  idempotency_conflict: 'Esta solicitud cambió durante el envío. Consulta su estado antes de intentarlo de nuevo.',
  rate_limited: 'Hay demasiados intentos. Espera un momento antes de intentar nuevamente.',
  link_invalid: 'El enlace no es válido o ya venció. Solicita uno nuevo al negocio.',
  deadline_passed: 'Los cambios requieren al menos 24 horas de anticipación.',
  payments_unavailable: 'El anticipo todavía no está disponible. Contacta al negocio.',
  policy_unconfigured: 'El negocio todavía debe configurar las condiciones de esta operación.',
  invalid_command: 'Revisa los datos de la solicitud.',
  origin_rejected: 'No pudimos verificar el origen de la solicitud.',
  secure_context_required: 'Tu navegador no puede preparar una solicitud segura. Abre el sitio con HTTPS o usa un navegador actualizado.',
};
export function createStorefrontApi(fetcher: typeof fetch = fetch) {
  function boundReceipt(receipt: Receipt, site: Storefront): Receipt {
    if (receipt.branchId !== site.branch.id || receipt.quote.currency !== site.currency || receipt.quote.currencyExponent !== site.currencyExponent) throw new ContractError();
    return receipt;
  }
  function preservesBooking(receipt: Receipt, previous: Receipt) {
    if (receipt.payment !== previous.payment || receipt.reference !== previous.reference || receipt.serviceId !== previous.serviceId || JSON.stringify(receipt.quote) !== JSON.stringify(previous.quote) || JSON.stringify(receipt.terms) !== JSON.stringify(previous.terms)) throw new ContractError();
  }
  async function json(path: string, init: RequestInit = {}, mutation = false): Promise<unknown> {
    try {
      const response = await fetcher(`/api/storefront/v1/${path}`, {
        ...init, credentials: 'omit', cache: 'no-store', redirect: 'error',
        signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const code = error && typeof error.code === 'string' && error.code in errorMessages ? error.code : 'upstream_unavailable';
        throw new StorefrontError(code, mutation && response.status >= 500 && !['not_configured', 'payments_unavailable'].includes(code));
      }
      return await response.json();
    } catch (error) {
      if (error instanceof StorefrontError) throw error;
      if (init.signal?.aborted) throw error;
      throw new StorefrontError('upstream_unavailable', mutation);
    }
  }
  async function parsed<T>(read: () => Promise<T>, mutation = false): Promise<T> {
    try { return await read(); } catch (error) {
      if (error instanceof ContractError || error instanceof TypeError || error instanceof RangeError) throw new StorefrontError('invalid_contract', mutation);
      throw error;
    }
  }
  const post = (path: string, input: unknown, key?: string, signal?: AbortSignal) => json(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(input), signal,
  }, !!key);
  return {
    bootstrap: (signal?: AbortSignal) => parsed(async () => parseStorefront(await json('bootstrap', { signal }))),
    availability: (site: Storefront, serviceId: string, date: string, signal?: AbortSignal) => parsed(async () => parseAvailability(await json(`availability?${new URLSearchParams({ serviceId, date })}`, { signal }), site.siteId, serviceId, date, site)),
    book: (site: Storefront, input: BookingInput, key: string, slot: Slot) => parsed(async () => {
      if (!site.booking.ready || input.revision !== site.revision || input.expectedMode !== site.booking.mode || input.slotId !== slot.id || (site.capabilities.grooming ? !input.pet || (input.pet.sizeId !== null && !site.capabilities.grooming.sizes.some(s => s.id === input.pet?.sizeId)) : input.pet !== null)) throw new StorefrontError('invalid_command');
      const result = parseBookingResult(await post('bookings', input, key), site.siteId);
      const receipt = boundReceipt(result.receipt, site);
      const service = site.services.find(s => s.id === input.serviceId);
      const wrongState = site.booking.payment === 'none'
        ? receipt.state !== (input.expectedMode === 'direct' ? 'confirmed' : 'pending_approval')
        : input.expectedMode === 'direct' && receipt.state === 'pending_approval';
      if (wrongState || receipt.serviceId !== input.serviceId || receipt.slotId !== slot.id || receipt.providerId !== slot.providerId || Date.parse(receipt.startsAt) !== Date.parse(slot.startsAt) || Date.parse(receipt.endsAt) !== Date.parse(slot.endsAt) || receipt.quote.priceMinor !== service?.priceMinor || receipt.payment !== site.booking.payment || receipt.quote.depositMinor !== (site.booking.payment === 'none' ? 0 : service.depositMinor) || receipt.terms.version !== site.booking.depositTermsVersion || receipt.terms.text !== site.booking.depositTerms) throw new ContractError();
      return result;
    }, true),
    status: (site: Storefront, token: string, signal?: AbortSignal) => parsed(async () => boundReceipt(parseReceipt(await post('booking-status', { token }, undefined, signal), site.siteId), site)),
    guest: (site: Storefront, token: string, signal?: AbortSignal) => parsed(async () => { const result = parseGuestBooking(await post('guest-booking', { token }, undefined, signal), site.siteId); boundReceipt(result.receipt, site); return result; }),
    cancel: (site: Storefront, token: string, previous: Receipt, key: string) => parsed(async () => {
      const result = parseGuestBooking(await post('guest-booking/cancel', { token, bookingRevision: previous.bookingRevision }, key), site.siteId);
      const receipt = boundReceipt(result.receipt, site);
      preservesBooking(receipt, previous);
      if (receipt.reference !== previous.reference || receipt.state !== 'cancelled' || receipt.serviceId !== previous.serviceId || receipt.bookingRevision <= previous.bookingRevision) throw new ContractError();
      if (receipt.providerId !== previous.providerId || receipt.slotId !== previous.slotId || Date.parse(receipt.startsAt) !== Date.parse(previous.startsAt) || Date.parse(receipt.endsAt) !== Date.parse(previous.endsAt)) throw new ContractError();
      return result;
    }, true),
    reschedule: (site: Storefront, token: string, previous: Receipt, slot: Slot, key: string) => parsed(async () => {
      const result = parseGuestBooking(await post('guest-booking/reschedule', { token, revision: site.revision, bookingRevision: previous.bookingRevision, slotId: slot.id }, key), site.siteId);
      const receipt = boundReceipt(result.receipt, site);
      preservesBooking(receipt, previous);
      if (receipt.reference !== previous.reference || receipt.state !== 'confirmed' || receipt.serviceId !== previous.serviceId || receipt.slotId !== slot.id || receipt.providerId !== slot.providerId || Date.parse(receipt.startsAt) !== Date.parse(slot.startsAt) || Date.parse(receipt.endsAt) !== Date.parse(slot.endsAt) || receipt.bookingRevision <= previous.bookingRevision) throw new ContractError();
      return result;
    }, true),
  };
}
export type StorefrontApi = ReturnType<typeof createStorefrontApi>;
export interface Attempt { payload: string; key: string }
/** getRandomValues remains available in older/LAN browsers where randomUUID does not. */
export function createRequestId(source: { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array } | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') {
    try { return source.randomUUID(); } catch { /* Try the secure legacy primitive. */ }
  }
  if (typeof source?.getRandomValues !== 'function') throw new StorefrontError('secure_context_required');
  let bytes: Uint8Array;
  try { bytes = source.getRandomValues(new Uint8Array(16)); } catch { throw new StorefrontError('secure_context_required'); }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Reuse key after an uncertain result; do not let edits silently create a new booking. */
export function bookingAttempt(previous: Attempt | null, input: unknown): Attempt {
  const payload = JSON.stringify(input);
  return previous?.payload === payload ? previous : { payload, key: createRequestId() };
}
export interface GuestLink { type: 'receipt' | 'manage'; token: string }
export function consumeGuestLink(location: Pick<Location, 'hash' | 'pathname'>, history: Pick<History, 'replaceState'>): GuestLink | null {
  const fragment = location.hash;
  // Remove tokens and untrusted query parameters before any network/UI use.
  history.replaceState(null, '', location.pathname);
  if (!fragment) return null;
  const params = new URLSearchParams(fragment.slice(1));
  const type = params.has('manage') ? 'manage' : 'receipt';
  if ([...params.keys()].length !== 1 || !params.has(type)) throw new StorefrontError('link_invalid');
  try { return { type, token: capability(params.get(type)) }; } catch { throw new StorefrontError('link_invalid'); }
}
