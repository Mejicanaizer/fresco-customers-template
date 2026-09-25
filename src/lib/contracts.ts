/** v1 public boundary. Build fresh objects so upstream private fields never escape. */
export class ContractError extends Error {
  constructor() { super('Invalid storefront contract'); }
}
type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ContractError();
  return value as ObjectValue;
}
export function exact(value: ObjectValue, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ContractError();
}
export function string(value: unknown, max = 500, min = 1): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ContractError();
  return value;
}
export function id(value: unknown): string {
  const result = string(value, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new ContractError();
  return result;
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ContractError();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ContractError();
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new ContractError();
  return value as T;
}
function list<T>(value: unknown, parse: (value: unknown) => T, max = 500): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ContractError();
  return value.map(parse);
}
function unique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map(value => value.id)).size !== values.length) throw new ContractError();
  return values;
}
export function localDate(value: unknown): string {
  const result = string(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new ContractError();
  const date = new Date(`${result}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result) throw new ContractError();
  return result;
}
export function instant(value: unknown): string {
  const result = string(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new ContractError();
  localDate(result.slice(0, 10));
  return result;
}
function httpsUrl(value: unknown): string {
  const url = new URL(string(value, 2048));
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new ContractError();
  return url.href;
}
export function stripeUrl(value: unknown): string {
  const result = httpsUrl(value);
  if (new URL(result).hostname !== 'checkout.stripe.com') throw new ContractError();
  return result;
}
function color(value: unknown): string {
  const result = string(value, 7);
  if (!/^#[0-9a-f]{6}$/i.test(result)) throw new ContractError();
  return result;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function envelope(value: ObjectValue, expectedSite?: string) {
  if (value.contractVersion !== 1) throw new ContractError();
  const siteId = id(value.siteId);
  if (expectedSite !== undefined && siteId !== expectedSite) throw new ContractError();
  return { contractVersion: 1 as const, siteId };
}
export const readinessReasons = ['deposit_not_configured', 'payments_unavailable', 'notifications_unavailable', 'policy_unconfigured', 'owner_unavailable'] as const;
export type ReadinessReason = typeof readinessReasons[number];
export interface PublicService {
  id: string; name: string; category: string; description: string; imageUrl: string | null;
  priceMinor: number; depositMinor: number | null; durationMinutes: number;
}
export interface Storefront {
  contractVersion: 1; siteId: string; revision: number; name: string; description: string;
  locale: string; currency: string; currencyExponent: number; logoUrl: string | null;
  coverImageUrl?: string | null;
  theme: { accent: string; accentText: string };
  contact: { phone: string; whatsapp: string; address: string };
  branch: { id: string; name: string; timeZone: string };
  booking: {
    mode: 'direct' | 'approval'; guestOnly: true; approvalHoldsCapacity: false;
    changeDeadlineHours: 24; notifications: 'none' | 'whatsapp'; payment: 'none' | 'stripe-deposit';
    ready: boolean; unavailableReasons: ReadinessReason[]; firstDate: string; lastDate: string; depositTerms: string; depositTermsVersion: string;
  };
  capabilities: { grooming: null | { sizes: Array<{ id: string; label: string }>; photoUploadsEnabled: false } };
  services: PublicService[];
}
export function parseStorefront(input: unknown, expectedSite?: string): Storefront {
  const v = object(input), b = object(v.booking), branch = object(v.branch), contact = object(v.contact), theme = object(v.theme);
  const env = envelope(v, expectedSite);
  const timeZone = string(branch.timeZone, 80);
  const locale = string(v.locale, 35);
  new Intl.DateTimeFormat(locale, { timeZone }).format(new Date());
  const currency = string(v.currency, 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new ContractError();
  const currencyExponent = integer(v.currencyExponent, 0, 3);
  const firstDate = localDate(b.firstDate), lastDate = localDate(b.lastDate);
  const ready = bool(b.ready);
  const payment = choice(b.payment, ['none', 'stripe-deposit']);
  const notifications = choice(b.notifications, ['none', 'whatsapp']);
  const unavailableReasons = list(b.unavailableReasons, x => choice(x, readinessReasons), 5);
  if (firstDate > lastDate || b.guestOnly !== true || b.approvalHoldsCapacity !== false || b.changeDeadlineHours !== 24 || ready !== (unavailableReasons.length === 0)) throw new ContractError();
  const accent = color(theme.accent), accentText = color(theme.accentText);
  const a = luminance(accent), t = luminance(accentText);
  if ((Math.max(a, t) + 0.05) / (Math.min(a, t) + 0.05) < 4.5) throw new ContractError();
  const rawGrooming = object(v.capabilities).grooming;
  let grooming: Storefront['capabilities']['grooming'] = null;
  if (rawGrooming !== null) {
    const g = object(rawGrooming);
    const sizes = unique(list(g.sizes, x => { const s = object(x); return { id: id(s.id), label: string(s.label, 80) }; }, 20));
    // Size is optional. No published choices means only unknown/null is accepted.
    // Private upload support must be implemented upstream before a later contract enables it.
    if (g.photoUploadsEnabled !== false) throw new ContractError();
    grooming = { sizes, photoUploadsEnabled: false };
  }
  const phone = string(contact.phone, 30, 0), whatsapp = string(contact.whatsapp, 15, 0);
  if ((phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)) || (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp))) throw new ContractError();
  const services = unique(list(v.services, input => {
    const s = object(input);
    const priceMinor = integer(s.priceMinor, 1, 100_000_000);
    const depositMinor = s.depositMinor === null ? null : integer(s.depositMinor, 1, priceMinor);
    if (ready && payment === 'stripe-deposit' && depositMinor === null) throw new ContractError();
    return { id: id(s.id), name: string(s.name, grooming ? 100 : 160), category: string(s.category, 100), description: string(s.description, 2000, 0), imageUrl: s.imageUrl === null ? null : httpsUrl(s.imageUrl), priceMinor, depositMinor, durationMinutes: integer(s.durationMinutes, grooming ? 15 : 1, grooming ? 480 : 1440) };
  }));
  return {
    ...env, revision: integer(v.revision, 1), name: string(v.name, 160), description: string(v.description, 2000, 0),
    locale, currency, currencyExponent, logoUrl: v.logoUrl === null ? null : httpsUrl(v.logoUrl),
    coverImageUrl: v.coverImageUrl == null ? null : httpsUrl(v.coverImageUrl), theme: { accent, accentText },
    contact: { phone, whatsapp, address: string(contact.address, 500, 0) },
    branch: { id: id(branch.id), name: string(branch.name, 160), timeZone },
    booking: { mode: choice(b.mode, ['direct', 'approval']), guestOnly: true, approvalHoldsCapacity: false, changeDeadlineHours: 24, notifications, payment, ready, unavailableReasons, firstDate, lastDate, depositTerms: string(b.depositTerms, 2000, ready ? 1 : 0), depositTermsVersion: id(b.depositTermsVersion) },
    capabilities: { grooming }, services,
  };
}
export interface Slot { id: string; startsAt: string; endsAt: string; providerId: string; providerName: string }
export interface Availability { contractVersion: 1; siteId: string; revision: number; branchId: string; serviceId: string; date: string; slots: Slot[] }
export function dateInZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function parseAvailability(input: unknown, siteId: string, serviceId: string, date: string, site?: Storefront): Availability {
  const v = object(input), env = envelope(v, siteId);
  if (v.serviceId !== serviceId || v.date !== date) throw new ContractError();
  const branchId = id(v.branchId), revision = integer(v.revision, 1);
  if (site && (branchId !== site.branch.id || revision !== site.revision)) throw new ContractError();
  const service = site?.services.find(s => s.id === serviceId);
  if (site && !service) throw new ContractError();
  return { ...env, branchId, revision, serviceId: id(v.serviceId), date: localDate(v.date), slots: unique(list(v.slots, input => {
    const s = object(input), startsAt = instant(s.startsAt), endsAt = instant(s.endsAt);
    if (Date.parse(endsAt) <= Date.parse(startsAt) || (site && dateInZone(startsAt, site.branch.timeZone) !== date) || (service && Date.parse(endsAt) - Date.parse(startsAt) !== service.durationMinutes * 60000)) throw new ContractError();
    return { id: id(s.id), startsAt, endsAt, providerId: id(s.providerId), providerName: string(s.providerName, 160) };
  }, 2000)) };
}
export interface PetInput { name: string; sizeId: string | null; breed: string | null; ageMonths: number | null; behaviorNotes: string; groomingPreferences: string; photoUploadId: string | null }
export interface BookingInput {
  revision: number; expectedMode: 'direct' | 'approval'; serviceId: string; slotId: string;
  guest: { name: string; whatsapp: string }; notes: string; pet: PetInput | null;
}
export function parseBookingInput(input: unknown): BookingInput {
  const v = object(input); exact(v, ['revision', 'expectedMode', 'serviceId', 'slotId', 'guest', 'notes', 'pet']);
  const g = object(v.guest); exact(g, ['name', 'whatsapp']);
  const whatsapp = string(g.whatsapp, 16);
  if (!/^\+[1-9]\d{7,14}$/.test(whatsapp)) throw new ContractError();
  let pet: PetInput | null = null;
  if (v.pet !== null) {
    const p = object(v.pet); exact(p, ['name', 'sizeId', 'breed', 'ageMonths', 'behaviorNotes', 'groomingPreferences', 'photoUploadId']);
    if (p.photoUploadId !== null) throw new ContractError();
    pet = { name: string(p.name, 100), sizeId: p.sizeId === null ? null : id(p.sizeId), breed: p.breed === null ? null : string(p.breed, 100), ageMonths: p.ageMonths === null ? null : integer(p.ageMonths, 0, 600), behaviorNotes: string(p.behaviorNotes, 2000, 0), groomingPreferences: string(p.groomingPreferences, 2000, 0), photoUploadId: null };
  }
  const name = string(g.name, 500).trim().replace(/\s+/g, ' ');
  return { revision: integer(v.revision, 1), expectedMode: choice(v.expectedMode, ['direct', 'approval']), serviceId: id(v.serviceId), slotId: id(v.slotId), guest: { name: string(name, 120, 2), whatsapp }, notes: string(v.notes, 2000, 0), pet };
}
export function capability(value: unknown): string {
  const result = string(value, 256, 32);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new ContractError();
  return result;
}
export function parseTokenInput(input: unknown) {
  const v = object(input); exact(v, ['token']); return { token: capability(v.token) };
}
export function parseRescheduleInput(input: unknown) {
  const v = object(input); exact(v, ['token', 'revision', 'bookingRevision', 'slotId']);
  return { token: capability(v.token), revision: integer(v.revision, 1), bookingRevision: integer(v.bookingRevision, 1), slotId: id(v.slotId) };
}
export function parseCancelInput(input: unknown) {
  const v = object(input); exact(v, ['token', 'bookingRevision']);
  return { token: capability(v.token), bookingRevision: integer(v.bookingRevision, 1) };
}
export const receiptStates = ['awaiting_payment', 'pending_approval', 'payment_processing', 'confirmed', 'payment_review', 'expired', 'cancelled', 'declined'] as const;
export type ReceiptState = typeof receiptStates[number];
export const paymentStatuses = ['unpaid', 'processing', 'paid', 'refund_pending', 'refunded', 'refund_failed'] as const;
export type PaymentStatus = typeof paymentStatuses[number];
export interface Receipt {
  contractVersion: 1; siteId: string; reference: string; state: ReceiptState;
  payment: 'none' | 'stripe-deposit';
  paymentStatus?: PaymentStatus;
  refund?: { amountMinor: number; currency: string; status: 'pending' | 'succeeded' | 'failed' } | null;
  bookingRevision: number; branchId: string; serviceId: string; slotId: string; providerId: string; startsAt: string; endsAt: string;
  quote: { priceMinor: number; depositMinor: number; currency: string; currencyExponent: number };
  terms: { version: string; text: string };
  checkout: { url: string; expiresAt: string } | null;
  notification: 'unconfigured' | 'not_sent' | 'queued' | 'sent' | 'delivered' | 'failed';
}
export function parseReceipt(input: unknown, siteId: string): Receipt {
  const v = object(input), env = envelope(v, siteId), q = object(v.quote), terms = object(v.terms);
  const state = choice(v.state, receiptStates);
  const payment = choice(v.payment, ['none', 'stripe-deposit']);
  const startsAt = instant(v.startsAt), endsAt = instant(v.endsAt);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new ContractError();
  const priceMinor = integer(q.priceMinor, 1, 100_000_000), depositMinor = integer(q.depositMinor, payment === 'none' ? 0 : 1, payment === 'none' ? 0 : priceMinor);
  const currency = string(q.currency, 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new ContractError();
  let checkout: Receipt['checkout'] = null;
  if (v.checkout !== null) { const c = object(v.checkout); checkout = { url: stripeUrl(c.url), expiresAt: instant(c.expiresAt) }; }
  if ((state === 'awaiting_payment') !== (checkout !== null)) throw new ContractError();
  if (payment === 'none' && (checkout !== null || ['awaiting_payment', 'payment_processing', 'payment_review', 'expired'].includes(state))) throw new ContractError();
  // These additive fields are absent on older v1 owners. Never infer a paid/refunded
  // state from an appointment state or expose provider fees/IDs in this projection.
  const paymentStatus = v.paymentStatus === undefined ? undefined : choice(v.paymentStatus, paymentStatuses);
  let refund: Receipt['refund'] = null;
  if (v.refund != null) {
    const r = object(v.refund);
    const amountMinor = integer(r.amountMinor, 1, depositMinor);
    if (payment !== 'stripe-deposit' || r.currency !== currency || amountMinor !== depositMinor) throw new ContractError();
    refund = { amountMinor, currency, status: choice(r.status, ['pending', 'succeeded', 'failed']) };
  }
  if (payment === 'none' && paymentStatus !== undefined && paymentStatus !== 'unpaid') throw new ContractError();
  if (refund && paymentStatus !== undefined && paymentStatus !== ({ pending: 'refund_pending', succeeded: 'refunded', failed: 'refund_failed' } as const)[refund.status]) throw new ContractError();
  if (checkout && (refund || (paymentStatus !== undefined && !['unpaid', 'processing'].includes(paymentStatus)))) throw new ContractError();
  return { ...env, reference: id(v.reference), state, payment, bookingRevision: integer(v.bookingRevision, 1), branchId: id(v.branchId), serviceId: id(v.serviceId), slotId: id(v.slotId), providerId: id(v.providerId), startsAt, endsAt,
    ...(paymentStatus === undefined ? {} : { paymentStatus }), refund,
    quote: { priceMinor, depositMinor, currency, currencyExponent: integer(q.currencyExponent, 0, 3) }, checkout,
    terms: { version: id(terms.version), text: string(terms.text, 2000) },
    notification: choice(v.notification, ['unconfigured', 'not_sent', 'queued', 'sent', 'delivered', 'failed']) };
}
export interface BookingResult { receipt: Receipt; receiptToken: string; managementToken: string }
export function parseBookingResult(input: unknown, siteId: string): BookingResult {
  const v = object(input); envelope(v, siteId);
  const receipt = parseReceipt(v.receipt, siteId);
  if (receipt.payment === 'none') {
    if (!['confirmed', 'pending_approval'].includes(receipt.state)) throw new ContractError();
  } else if (receipt.state !== 'awaiting_payment') {
    // A lost first response may be recovered only after Checkout has completed or
    // expired. New owners return its authoritative payment state and capabilities.
    // Older awaiting-payment create receipts still work without these additions.
    if (receipt.paymentStatus === undefined ||
        (['confirmed', 'pending_approval'].includes(receipt.state) && receipt.paymentStatus !== 'paid') ||
        (receipt.state === 'payment_processing' && receipt.paymentStatus !== 'processing')) throw new ContractError();
  }
  const receiptToken = capability(v.receiptToken), managementToken = capability(v.managementToken);
  if (receiptToken === managementToken) throw new ContractError();
  return { receipt, receiptToken, managementToken };
}
export interface GuestBooking { receipt: Receipt; actions: { canCancel: boolean; canReschedule: boolean; deadlineAt: string; unavailableReason: 'none' | 'deadline_passed' | 'policy_unconfigured' | 'status_unavailable' } }
export function parseGuestBooking(input: unknown, siteId: string): GuestBooking {
  const v = object(input); envelope(v, siteId);
  const a = object(v.actions), receipt = parseReceipt(v.receipt, siteId), deadlineAt = instant(a.deadlineAt);
  if (Date.parse(receipt.startsAt) - Date.parse(deadlineAt) !== 24 * 60 * 60 * 1000) throw new ContractError();
  const canCancel = bool(a.canCancel), canReschedule = bool(a.canReschedule);
  const unavailableReason = choice(a.unavailableReason, ['none', 'deadline_passed', 'policy_unconfigured', 'status_unavailable']);
  if (unavailableReason !== 'none' && (canCancel || canReschedule)) throw new ContractError();
  return { receipt, actions: { canCancel, canReschedule, deadlineAt, unavailableReason } };
}
export function formatMoney(amount: number, site: Pick<Storefront, 'locale' | 'currency' | 'currencyExponent'>): string {
  return new Intl.NumberFormat(site.locale, { style: 'currency', currency: site.currency, minimumFractionDigits: site.currencyExponent, maximumFractionDigits: site.currencyExponent }).format(amount / 10 ** site.currencyExponent);
}
export function formatTime(value: string, site: Storefront): string {
  return new Intl.DateTimeFormat(site.locale, { timeZone: site.branch.timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
export function formatAppointment(value: string, site: Storefront): string {
  return new Intl.DateTimeFormat(site.locale, { timeZone: site.branch.timeZone, dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}
